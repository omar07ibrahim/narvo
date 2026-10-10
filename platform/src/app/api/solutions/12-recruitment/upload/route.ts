import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { addAudit, kvSet } from "@/lib/store/db";
import { fairnessGuard, guessName } from "@/app/solutions/12-recruitment/_lib/fairness";
import { evaluateGuardedCv, traceability } from "@/app/solutions/12-recruitment/_lib/evaluate";
import { KV, SLUG, getUploads, loadRequisition, saveEvaluation } from "@/app/solutions/12-recruitment/_lib/data";
import { criteriaKey, weightedScore, type Evaluation, type Upload } from "@/app/solutions/12-recruitment/_lib/types";

export const maxDuration = 120;

/** Bring your own CV: the same fairness guard and the same criteria, evaluated live. */
export async function POST(req: Request) {
  const body = await readBody<{ text?: string; label?: string }>(req);
  const { modelKey, lang } = getPrefs(req, body as Record<string, unknown>);
  const text = (body.text ?? "").trim();
  if (text.length < 200) return new Response("Paste or upload a CV of at least a few paragraphs.", { status: 400 });

  return eventStream(
    req,
    async (emit) => {
      const uploads = getUploads();
      const id = `UPL-${String(uploads.length + 1).padStart(2, "0")}`;
      const label = (body.label || guessName(text) || "Uploaded CV").slice(0, 80);
      const s1 = emit.step("guard", lang === "ar" ? "حارس العدالة: حجب السمات المحمية" : "Fairness guard: redacting protected attributes");
      const g = fairnessGuard(text);
      emit.data("guard", { removed: g.removed, counts: g.counts, leaks: g.leaks, redacted: g.text });
      s1.done(`${g.removed.length} ${lang === "ar" ? "عنصر محجوب" : "items redacted"} · ${g.leaks.length} ${lang === "ar" ? "تسرب" : "leaks"}`);

      const requisition = loadRequisition();
      const s2 = emit.step("evaluate", lang === "ar" ? "التقييم مقابل معايير الوظيفة" : "Evaluating against the job criteria");
      const out = await evaluateGuardedCv({ cv: g.text, requisition, criteria: requisition.criteria, lang, modelKey, signal: emit.signal });
      const ev: Evaluation = {
        appId: id,
        ratings: out.ratings,
        summary: out.summary,
        strengths: out.strengths,
        risks: out.risks,
        interviewFocus: out.interviewFocus,
        ms: out.ms,
        model: out.model,
        at: new Date().toISOString(),
        redactions: g.removed.length,
        criteriaKey: criteriaKey(requisition.criteria),
        source: "upload",
        label,
        lang,
      };
      const upload: Upload = { id, label, text, at: ev.at };
      kvSet(KV.uploads, [...uploads, upload]);
      saveEvaluation(ev);
      const score = weightedScore(ev.ratings, requisition.criteria);
      s2.done(`${lang === "ar" ? "الدرجة الموزونة" : "Weighted score"} ${score} · ${lang === "ar" ? "التتبع" : "traceability"} ${Math.round(traceability(ev.ratings) * 100)}%`);
      emit.data("evaluation", { ...ev, score });
      addAudit({
        solution: SLUG,
        actor: { name: "NARVO Recruitment Assistant", role: "AI agent", kind: "agent" },
        action: "Evaluated uploaded CV (outside the application window)",
        subject: `${id} · MNDA-HR-REQ-2026-077`,
        detail: `Weighted score ${score}; ${g.removed.length} protected items redacted before evaluation`,
      });
    },
    { modelKey },
  );
}
