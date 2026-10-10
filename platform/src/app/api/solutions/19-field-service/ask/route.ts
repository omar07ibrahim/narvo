import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { answerWithCitations } from "@/lib/ai/rag";
import { addAudit } from "@/lib/store/db";
import { CORPUS, jobContext } from "@/app/solutions/19-field-service/_lib/data";

/** Hands-free technician assistant: question (typed or transcribed) → cited answer from approved manuals, short enough to be spoken. */
export async function POST(req: Request) {
  const body = await readBody<{ question?: string; jobId?: string; history?: Array<{ role: "user" | "assistant"; content: string }> }>(req);
  const { modelKey, lang } = getPrefs(req, body);
  const question = (body.question ?? "").trim();
  if (!question) return new Response("question required", { status: 400 });
  const ctx = body.jobId ? jobContext(body.jobId) : null;

  return eventStream(
    req,
    async (emit) => {
      const context = ctx ? `Technician is on job ${ctx.job.id} (${ctx.job.title}) at ${ctx.site.name}; asset ${ctx.asset.id}: ${ctx.asset.make} ${ctx.asset.model} — ${ctx.asset.description}.` : "";
      const r = await answerWithCitations({
        emit,
        corpus: CORPUS,
        question: context ? `${question}\n\n(Context: ${context})` : question,
        history: body.history?.slice(-4),
        lang,
        modelKey,
        solution: "19-field-service",
        k: 6,
        instructions: [
          "You are answering a technician on a roof or in a plant room, hands busy — the answer will be read aloud.",
          "Answer in 2–5 short sentences, or up to 5 numbered steps for a procedure. Lead with the direct answer (value, limit, yes/no).",
          "Always include any safety-critical condition from the sources (isolation, PPE, approved chemicals). Cite with [n].",
          "Answer in the language the technician used.",
        ].join(" "),
      });
      addAudit({
        solution: "19-field-service",
        actor: { name: ctx?.tech.name ?? "Technician", role: "Field technician (voice assistant)", kind: "human" },
        action: "Asked the field assistant",
        subject: question.slice(0, 120),
        detail: `${r.citations.length} sources retrieved`,
      });
    },
    { modelKey },
  );
}
