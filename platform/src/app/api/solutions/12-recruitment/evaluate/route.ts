import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { chatStream } from "@/lib/ai/client";
import { addAudit, kvSet } from "@/lib/store/db";
import { fairnessGuard } from "@/app/solutions/12-recruitment/_lib/fairness";
import { evaluateGuardedCv, mapLimit, traceability } from "@/app/solutions/12-recruitment/_lib/evaluate";
import {
  KV,
  SLUG,
  getEvaluations,
  getInterviews,
  loadApplications,
  loadCv,
  loadRequisition,
  saveEvaluation,
} from "@/app/solutions/12-recruitment/_lib/data";
import { candidateCode, criteriaKey, effectiveRatings, weightedScore, type Evaluation } from "@/app/solutions/12-recruitment/_lib/types";

export const maxDuration = 300;

/**
 * Evaluate every application that met the minimum requirements:
 *   fairness guard (redaction + leak scan) → per-criterion rating with verbatim evidence (4 in parallel)
 *   → computed weighted score → reasoned priority list (streamed). HR decides; the AI only prepares.
 */
export async function POST(req: Request) {
  const body = await readBody<{ appIds?: string[]; force?: boolean }>(req);
  const { modelKey, lang } = getPrefs(req, body as Record<string, unknown>);

  return eventStream(
    req,
    async (emit) => {
      const requisition = loadRequisition();
      const criteria = requisition.criteria;
      const key = criteriaKey(criteria);
      const passing = loadApplications().filter((a) => a.pass && a.cvFile);
      const targets = body.appIds?.length ? passing.filter((a) => body.appIds!.includes(a.id)) : passing;
      const existing = getEvaluations();
      const todo = targets.filter((a) => body.force || !existing[a.id] || existing[a.id].criteriaKey !== key);

      // 1 — Fairness guard
      const s1 = emit.step("guard", lang === "ar" ? "حارس العدالة: حجب السمات المحمية" : "Fairness guard: redacting protected attributes");
      const guarded = todo.map((a) => {
        const cv = loadCv(a) ?? "";
        return { app: a, g: fairnessGuard(cv, { name: a.candidate.name, nameAr: a.candidate.nameAr }) };
      });
      const totals: Record<string, number> = {};
      for (const { g } of guarded) for (const [k, v] of Object.entries(g.counts)) totals[k] = (totals[k] ?? 0) + v;
      const removedCount = Object.values(totals).reduce((a, b) => a + b, 0);
      const leaks = guarded.reduce((n, x) => n + x.g.leaks.length, 0);
      emit.data("guard", { cvs: guarded.length, totals, removed: removedCount, leaks, autoFixed: guarded.reduce((n, x) => n + x.g.autoFixed, 0) });
      s1.done(
        lang === "ar"
          ? `${guarded.length} سيرة · ${removedCount} عنصر محجوب · ${leaks} تسرب بعد الفحص`
          : `${guarded.length} CVs · ${removedCount} items redacted · ${leaks} leaks after scan`,
      );

      // 2 — Evaluate in parallel (bounded)
      const s2 = emit.step(
        "evaluate",
        lang === "ar" ? `تقييم ${guarded.length} طلباً مقابل ${criteria.length} معايير` : `Evaluating ${guarded.length} applications against ${criteria.length} criteria`,
      );
      const results: Record<string, Evaluation> = { ...existing };
      let done = 0;
      let failed = 0;
      emit.data("progress", { done: 0, total: guarded.length });
      await mapLimit(guarded, 6, async ({ app, g }) => {
        const callId = `eval-${app.id}`;
        const label = `${candidateCode(app.id)} — ${lang === "ar" ? "مقارنة بالمعايير" : "rating against criteria"}`;
        emit.send({ type: "tool", id: callId, name: "evaluate_cv", label, status: "running", input: { application: app.id, redactedItems: g.removed.length } });
        const t0 = Date.now();
        try {
          const out = await evaluateGuardedCv({ cv: g.text, requisition, criteria, lang, modelKey, signal: emit.signal });
          const ev: Evaluation = {
            appId: app.id,
            ratings: out.ratings,
            summary: out.summary,
            strengths: out.strengths,
            risks: out.risks,
            interviewFocus: out.interviewFocus,
            ms: out.ms,
            model: out.model,
            at: new Date().toISOString(),
            redactions: g.removed.length,
            criteriaKey: key,
            source: "application",
            lang,
          };
          saveEvaluation(ev);
          results[app.id] = ev;
          done++;
          const score = weightedScore(ev.ratings, criteria);
          emit.send({
            type: "tool",
            id: callId,
            name: "evaluate_cv",
            label,
            status: "done",
            input: { application: app.id, redactedItems: g.removed.length },
            output: { weightedScore: score, traceability: `${Math.round(traceability(ev.ratings) * 100)}%`, ratings: Object.fromEntries(ev.ratings.map((r) => [r.criterionId, r.rating])) },
            ms: Date.now() - t0,
          });
        } catch (e) {
          failed++;
          emit.send({ type: "tool", id: callId, name: "evaluate_cv", label, status: "error", output: { error: (e as Error).message }, ms: Date.now() - t0 });
        }
        emit.data("progress", { done: done + failed, total: guarded.length });
        emit.data("evaluations", results);
        s2.update(`${done + failed}/${guarded.length}`);
      });
      if (failed) s2.error(lang === "ar" ? `${done} مكتمل · ${failed} تعذّر` : `${done} done · ${failed} failed — re-run to retry`);
      else s2.done(lang === "ar" ? `${done} تقييم جديد` : `${done} new evaluations`);

      // 3 — Rank (deterministic)
      const s3 = emit.step("rank", lang === "ar" ? "حساب الدرجات الموزونة وترتيب الأولوية" : "Computing weighted scores and priority order");
      const interviews = getInterviews();
      const ranked = passing
        .filter((a) => results[a.id])
        .map((a) => {
          const ratings = effectiveRatings(results[a.id], interviews[a.id]);
          return { id: a.id, score: weightedScore(ratings, criteria), ratings, ev: results[a.id] };
        })
        .sort((a, b) => b.score - a.score);
      emit.data("ranking", ranked.map((r) => ({ id: r.id, score: r.score })));
      const avgTrace = ranked.reduce((n, r) => n + traceability(r.ev.ratings), 0) / Math.max(ranked.length, 1);
      s3.done(
        lang === "ar"
          ? `${ranked.length} مرشحاً مرتبون · قابلية تتبع الأدلة ${Math.round(avgTrace * 100)}%`
          : `${ranked.length} ranked · evidence traceability ${Math.round(avgTrace * 100)}%`,
      );

      if (ranked.length < 3) return;

      // 4 — Reasoned priority list (anonymised)
      const s4 = emit.step("rationale", lang === "ar" ? "صياغة قائمة أولويات معللة" : "Writing the reasoned priority list");
      const top = ranked.slice(0, 10);
      const codes = top.map((r) => candidateCode(r.id));
      const lines = top
        .map(
          (r, i) =>
            `${i + 1}. ${candidateCode(r.id)} — weighted ${r.score}/100 — ${criteria.map((c) => `${c.id}:${r.ratings.find((x) => x.criterionId === c.id)?.rating ?? 0}`).join(" ")}\n   ${r.ev.summary}\n   Strengths: ${r.ev.strengths.join("; ")}\n   Risks: ${r.ev.risks.join("; ")}`,
        )
        .join("\n");
      let text = "";
      const gen = chatStream({
        messages: [
          {
            role: "system",
            content: [
              "You prepare a reasoned priority list for MNDA's Human Capital department and the hiring manager. You do not decide — HR selects the shortlist.",
              `Using only the anonymised evaluation results provided (candidate codes, weighted scores 0-100, criterion ratings 0-4, summaries), write: a two-sentence overview; a 'Priority' list of up to 8 candidates in score order, one line each with the decisive job-related reason; a short 'Close calls' note where scores are within 3 points or depend on one criterion; and 'Verify at interview' (2-3 bullets). Never mention or speculate about protected attributes.`,
              `There are exactly ${codes.length} candidates in the results: ${codes.join(", ")}. Mention no other candidate codes and never invent scores — copy each weighted score exactly as given.`,
              `Write in ${lang === "ar" ? "Arabic (formal MSA)" : "English"}, Markdown, ≤ 230 words. Refer to candidates only by their codes (e.g. Candidate 0041).`,
            ].join("\n"),
          },
          { role: "user", content: `Criteria: ${criteria.map((c) => `${c.id} ${c.label} (${c.weight}%)`).join("; ")}\n\nResults:\n${lines}` },
        ],
        modelKey,
        temperature: 0.2,
        maxTokens: 900,
        solution: SLUG,
        task: "priority-rationale",
        signal: emit.signal,
      });
      for (let n = await gen.next(); !n.done; n = await gen.next())
        if (n.value.content) {
          text += n.value.content;
          emit.text(n.value.content, "rationale");
        }
      kvSet(KV.rationale, { text, at: new Date().toISOString() });
      s4.done();

      if (done)
        addAudit({
          solution: SLUG,
          actor: { name: "NARVO Recruitment Assistant", role: "AI agent", kind: "agent" },
          action: "Evaluated applications against job criteria",
          subject: `MNDA-HR-REQ-2026-077 · ${done} CVs`,
          detail: `Fairness guard removed ${removedCount} protected items (${leaks} leaks); evidence traceability ${Math.round(avgTrace * 100)}%`,
        });
    },
    { modelKey },
  );
}
