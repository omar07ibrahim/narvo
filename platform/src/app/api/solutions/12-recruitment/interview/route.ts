import { z } from "zod";
import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { generateObject } from "@/lib/ai/json";
import { parseFrontMatter } from "@/lib/retrieval";
import { addAudit, kvSet } from "@/lib/store/db";
import { fairnessGuard, quoteFound } from "@/app/solutions/12-recruitment/_lib/fairness";
import { SCALE, anchorEvidence, criteriaBlock } from "@/app/solutions/12-recruitment/_lib/evaluate";
import {
  KV,
  SLUG,
  getEvaluations,
  getInterviews,
  loadApplications,
  loadInterviewSample,
  loadRequisition,
} from "@/app/solutions/12-recruitment/_lib/data";
import { candidateCode, effectiveRatings, weightedScore, type InterviewUpdate, type RatingChange } from "@/app/solutions/12-recruitment/_lib/types";

export const maxDuration = 120;

const schema = z.object({
  updates: z.array(
    z.object({
      criterionId: z.string(),
      newRating: z.number().int().min(0).max(4),
      evidence: z.string().describe("Verbatim quote (max 35 words) copied exactly from the interview record"),
      reason: z.string().describe("One sentence: what the interview clarified compared with the CV"),
    }),
  ),
  newEvidence: z.array(z.string()).max(4),
  concerns: z.array(z.string()).max(3),
  summary: z.string().describe("Two sentences on how the interview changes the picture"),
});

/** GET ?appId= → the consented sample interview record on file (for the demo), if any. */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("appId") ?? "";
  const text = loadInterviewSample(id);
  if (!text) return new Response("No interview record on file", { status: 404 });
  return Response.json({ appId: id, text });
}

/** Consented interview record → new job-related evidence → updated finalist ratings (before → after). */
export async function POST(req: Request) {
  const body = await readBody<{ appId: string; notes: string; consent: boolean }>(req);
  const { modelKey, lang } = getPrefs(req, body as unknown as Record<string, unknown>);
  if (!body.consent) return new Response("Candidate consent must be confirmed before interview notes are processed.", { status: 400 });
  const notesRaw = (body.notes ?? "").trim();
  if (notesRaw.length < 80) return new Response("Interview notes are too short.", { status: 400 });
  const app = loadApplications().find((a) => a.id === body.appId);
  const ev = getEvaluations()[body.appId];
  if (!app || !ev) return new Response("Evaluate this candidate before adding interview evidence.", { status: 400 });

  return eventStream(
    req,
    async (emit) => {
      const { meta, body: notesBody } = parseFrontMatter(notesRaw);
      const s1 = emit.step("consent", lang === "ar" ? "التحقق من الموافقة وحجب السمات المحمية" : "Consent check & fairness guard");
      const g = fairnessGuard(notesBody, { name: app.candidate.name, nameAr: app.candidate.nameAr });
      s1.done(`${meta.consent ? (lang === "ar" ? "موافقة مسجلة" : "Consent on record") : lang === "ar" ? "موافقة أكدها المستخدم" : "Consent confirmed by user"} · ${g.removed.length} ${lang === "ar" ? "عنصر محجوب" : "items redacted"}`);

      const requisition = loadRequisition();
      const criteria = requisition.criteria;
      const prior = getInterviews()[app.id] ?? [];
      const current = effectiveRatings(ev, prior);
      const before = weightedScore(current, criteria);

      const s2 = emit.step("extract", lang === "ar" ? "استخراج الأدلة الجديدة من المقابلة" : "Extracting new evidence from the interview");
      const { object } = await generateObject({
        schema,
        name: "interview_evidence",
        system: [
          `You update a structured, job-related evaluation for MNDA requisition ${requisition.id} "${requisition.title}" using a consented interview record.`,
          "Compare the interview with the current CV-based ratings. Return an update ONLY for criteria where the interview provides new, specific evidence that justifies a different rating (up or down). Interview claims count as evidence; vague statements do not.",
          `Rating scale:\n${SCALE}`,
          "Evidence must be copied verbatim from the interview record. Never consider protected attributes (they are redacted). Also list up to 4 new pieces of evidence, up to 3 concerns, and a two-sentence summary.",
          `Write reasons, summary and concerns in ${lang === "ar" ? "Arabic (formal MSA)" : "English"}.`,
        ].join("\n\n"),
        user: [
          `CRITERIA\n${criteriaBlock(criteria)}`,
          `CURRENT RATINGS (from CV${prior.length ? " + earlier interviews" : ""})\n${current
            .map((r) => `${r.criterionId}: ${r.rating}/4 — evidence: ${r.evidence || "none"} — gap: ${r.gaps}`)
            .join("\n")}`,
          `INTERVIEW RECORD (redacted)\n"""\n${g.text}\n"""`,
        ].join("\n\n"),
        modelKey,
        solution: SLUG,
        task: "interview-evidence",
        maxTokens: 1500,
      });

      const changes: RatingChange[] = object.updates
        .map((u) => {
          const c = criteria.find((x) => x.id.toUpperCase() === u.criterionId.trim().toUpperCase());
          const cur = current.find((r) => r.criterionId === c?.id);
          if (!c || !cur) return null;
          let evidence = u.evidence.trim();
          if (evidence && !quoteFound(evidence, g.text)) evidence = anchorEvidence(evidence, g.text) ?? evidence;
          return { criterionId: c.id, before: cur.rating, after: Math.max(0, Math.min(4, u.newRating)), evidence, reason: u.reason };
        })
        .filter((x): x is RatingChange => !!x && x.after !== x.before);
      s2.done(
        lang === "ar"
          ? `${changes.length} تغييرات في التقييم · ${object.newEvidence.length} أدلة جديدة`
          : `${changes.length} rating change(s) · ${object.newEvidence.length} new evidence item(s)`,
      );

      const s3 = emit.step("update", lang === "ar" ? "تحديث مقارنة المرشحين النهائيين" : "Updating the finalist comparison");
      const update: InterviewUpdate = {
        appId: app.id,
        at: new Date().toISOString(),
        date: meta.date,
        panel: meta.panel,
        consent: meta.consent || "Consent confirmed by HR user at upload",
        changes,
        newEvidence: object.newEvidence,
        concerns: object.concerns,
        summary: object.summary,
        ms: 0,
      };
      const all = getInterviews();
      all[app.id] = [...prior, update];
      kvSet(KV.interviews, all);
      const after = weightedScore(effectiveRatings(ev, all[app.id]), criteria);
      emit.data("update", { ...update, scoreBefore: before, scoreAfter: after });
      s3.done(`${candidateCode(app.id)}: ${before} → ${after}`);

      addAudit({
        solution: SLUG,
        actor: { name: "NARVO Recruitment Assistant", role: "AI agent", kind: "agent" },
        action: "Applied consented interview evidence",
        subject: `${candidateCode(app.id)} · MNDA-HR-REQ-2026-077`,
        detail: `${changes.map((c) => `${c.criterionId} ${c.before}→${c.after}`).join(", ") || "no rating change"}; weighted ${before} → ${after}`,
      });
    },
    { modelKey },
  );
}
