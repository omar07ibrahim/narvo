import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { answerWithCitations } from "@/lib/ai/rag";
import { SLUG } from "@/app/solutions/10-brand-content/_lib/types";

/** "Ask the brand guide" — cited answers over the Raseen knowledge base (brand guidelines, TDS, catalogue). */
export async function POST(req: Request) {
  const body = await readBody<{ question?: string }>(req);
  const { modelKey, lang } = getPrefs(req, body as Record<string, unknown>);
  const question = (body.question ?? "").trim();
  if (!question) return Response.json({ error: "Ask a question" }, { status: 400 });
  if (question.length > 600) return Response.json({ error: "Question too long" }, { status: 400 });
  return eventStream(
    req,
    async (emit) => {
      await answerWithCitations({
        emit,
        corpus: "raseen/knowledge",
        question,
        lang,
        modelKey,
        solution: SLUG,
        k: 6,
        instructions:
          "You support Raseen Group's Marketing & Brand team (owner: Hana Yousef). Answer questions about the brand guidelines, channel rules and Raseen ThermaShield facts. Be brief (max ~120 words), quote exact wording for approved claims and qualifiers, and say clearly when something is forbidden.",
      });
    },
    { modelKey },
  );
}
