import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { addAudit, patchRecord } from "@/lib/store/db";
import { COL, SOL, getCertificates, getCoverage, getRequirements, getTasks, loadSeed, putCoverage, verifyQuote, excerpt } from "@/app/solutions/09-bid-proposal/_lib/server";
import { judgeAnswer } from "@/app/solutions/09-bid-proposal/_lib/ai";
import { mergeStatus, requirementCheck } from "@/app/solutions/09-bid-proposal/_lib/compliance";
import type { Coverage } from "@/app/solutions/09-bid-proposal/_lib/types";

export const maxDuration = 120;

/** A contributor's answer arrives → the requirement is re-judged and the matrix updates. */
export async function POST(req: Request) {
  const body = await readBody<{ taskId: string; answer: string }>(req);
  const { modelKey, lang } = getPrefs(req, body);
  if (!body.answer || body.answer.trim().length < 20) {
    return new Response(lang === "ar" ? "الإجابة قصيرة جداً" : "The answer is too short to evaluate", { status: 400 });
  }

  return eventStream(
    req,
    async (emit) => {
      const seed = loadSeed();
      const task = getTasks().find((t) => t.id === body.taskId);
      if (!task) throw new Error("Task not found");
      const reqItem = (getRequirements()?.items ?? []).find((r) => r.id === task.reqId);
      if (!reqItem) throw new Error("Requirement not found");
      const prior = getCoverage()[task.reqId];
      let certs = getCertificates(seed);

      const res = await judgeAnswer({ emit, lang, modelKey }, { req: reqItem, prior, answer: body.answer, contributor: task.owner, seed, certs });

      // A renewed certificate / policy updates the certificate register, and the computed check re-runs on it.
      if (res.certificate?.expiry && /^\d{4}-\d{2}-\d{2}$/.test(res.certificate.expiry)) {
        const target = certs.find((c) => c.requirement === task.reqId);
        if (target) {
          const s = emit.step("register", lang === "ar" ? "تحديث سجل الشهادات" : "Updating the certificate register");
          patchRecord(COL.certs, target.id, { expiry: res.certificate.expiry, number: res.certificate.number ?? target.number, updatedBy: task.owner });
          certs = getCertificates(seed);
          s.done(`${target.number} → ${res.certificate.number ?? target.number} · ${res.certificate.expiry}`);
        }
      }
      const check = requirementCheck(seed, task.reqId, certs);
      const status = mergeStatus(res.status, check);
      const quote = res.quote && verifyQuote(res.quote, body.answer) ? res.quote : excerpt(body.answer, 260);
      const entry: Coverage = {
        reqId: task.reqId,
        aiStatus: res.status,
        status,
        confidence: Math.max(0, Math.min(1, res.confidence)),
        rationale: res.rationale,
        gap: status === "met" ? null : (res.gap ?? check?.note ?? null),
        evidence: [
          { docId: `ANSWER-${task.id}`, title: `${lang === "ar" ? "إجابة مساهم" : "Contributor answer"} — ${task.owner}`, section: `${task.reqId} · ${task.evidenceType}`, quote },
          ...(prior?.evidence ?? []).filter((e) => !e.docId.startsWith("ANSWER-")).slice(0, 2),
        ],
        check,
        source: "contributor",
        contributor: task.owner,
        updatedAt: Date.now(),
      };
      putCoverage([entry]);
      patchRecord(COL.tasks, task.id, { status: "answered", answer: body.answer, answeredAt: Date.now(), resultStatus: status });
      addAudit({
        solution: SOL,
        actor: { name: task.owner, role: task.ownerRole, kind: "human" },
        action: "Submitted contributor answer",
        subject: `${task.reqId} — ${task.reqTitle}`,
        detail: `${prior?.status ?? "—"} → ${status}. ${res.rationale}`.slice(0, 300),
      });
      emit.data("coverage", { [entry.reqId]: entry });
      emit.data("task", { ...task, status: "answered", answer: body.answer, answeredAt: Date.now(), resultStatus: status });
      emit.data("certificates", certs);
    },
    { modelKey },
  );
}
