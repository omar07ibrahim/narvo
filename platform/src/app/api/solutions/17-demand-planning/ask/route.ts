import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { chatStream } from "@/lib/ai/client";
import { analystSystem, buildFacts } from "@/app/solutions/17-demand-planning/_lib/facts";
import { DEFAULT_WHATIF, type WhatIf } from "@/app/solutions/17-demand-planning/_lib/types";

/** Follow-up question about the plans — answered from freshly recomputed facts, streamed with citations. */
export async function POST(req: Request) {
  const body = await readBody<{ question?: string; history?: Array<{ role: "user" | "assistant"; content: string }>; whatIf?: Partial<WhatIf> }>(req);
  const { modelKey, lang } = getPrefs(req, body);
  const question = (body.question ?? "").trim();
  if (!question) return new Response("question required", { status: 400 });
  const whatIf: WhatIf = { ...DEFAULT_WHATIF, ...(body.whatIf ?? {}) };
  const ar = lang === "ar";

  return eventStream(
    req,
    async (emit) => {
      const s1 = emit.step("simulate", ar ? "إعادة احتساب الخطط للافتراضات الحالية" : "Recomputing plans for the current assumptions");
      const facts = buildFacts(whatIf);
      emit.data("citations", facts.citations);
      emit.data("facts", facts.summary);
      s1.done(ar ? `${facts.citations.length} كتل أدلة محسوبة` : `${facts.citations.length} computed evidence blocks`);

      const s2 = emit.step("answer", ar ? "الإجابة من الأرقام المحسوبة" : "Answering from the computed figures");
      const history = (body.history ?? []).slice(-6).map((h) => ({ role: h.role, content: h.content.slice(0, 2500) }));
      const gen = chatStream({
        messages: [
          { role: "system", content: analystSystem(lang) + "\nAnswer the question directly in 60–180 words. If the facts cannot answer it, say which what-if the user should run (demand uplift, pallet loss, rebar yard loss, mill delay, service target)." },
          { role: "user", content: `Computed facts:\n\n${facts.context}` },
          { role: "assistant", content: ar ? "تم. ما سؤالك؟" : "Understood. What is your question?" },
          ...history,
          { role: "user", content: question },
        ],
        modelKey,
        temperature: 0.2,
        maxTokens: 700,
        solution: "17-demand-planning",
        task: "ask",
        signal: emit.signal,
      });
      for (let n = await gen.next(); !n.done; n = await gen.next()) if (n.value.content) emit.text(n.value.content);
      s2.done();
    },
    { modelKey },
  );
}
