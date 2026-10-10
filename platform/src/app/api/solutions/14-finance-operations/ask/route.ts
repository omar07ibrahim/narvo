import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { answerWithCitations } from "@/lib/ai/rag";
import { SLUG } from "@/app/solutions/14-finance-operations/_lib/data";

export const maxDuration = 120;

/** "Ask AP policy" — cited answers over the Raseen knowledge base (RG-FIN-POL-09, supplier directory, …). */
export async function POST(req: Request) {
  const body = await readBody<{ question?: string; history?: Array<{ role: "user" | "assistant"; content: string }> }>(req);
  const { modelKey, lang } = getPrefs(req, body);
  const question = (body.question ?? "").trim();
  if (!question) return Response.json({ error: "Ask a question" }, { status: 400 });
  if (question.length > 1200) return Response.json({ error: "Question too long" }, { status: 400 });
  return eventStream(
    req,
    async (emit) => {
      await answerWithCitations({
        emit,
        corpus: "raseen/knowledge",
        question,
        history: body.history?.slice(-4),
        lang,
        modelKey,
        solution: SLUG,
        k: 6,
        instructions:
          "You support the Accounts Payable team of Raseen Group Finance (AP Supervisor Deepak Menon, Group CFO Priya Raghavan). Answer in 3–8 short sentences or bullets; quote tolerances, thresholds, account codes and reference numbers exactly.",
      });
    },
    { modelKey },
  );
}
