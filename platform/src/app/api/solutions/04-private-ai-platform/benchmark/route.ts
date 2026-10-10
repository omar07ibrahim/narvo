import { chatStream } from "@/lib/ai/client";
import { findModel } from "@/lib/ai/config";

/**
 * Live benchmark of one model on the same bilingual workload:
 * time-to-first-token, total latency, tokens/second and the output itself.
 */
const PROMPT = {
  system: "You are an assistant at a UAE government authority. Answer precisely and briefly.",
  user: "Write a three-sentence reply in formal Arabic to a citizen whose housing grant application is missing a salary certificate issued within the last 30 days. Then give the same reply in one English sentence.",
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { modelKey?: string };
  const model = findModel(body.modelKey);
  const t0 = Date.now();
  let first = 0;
  let text = "";
  try {
    const gen = chatStream({
      messages: [
        { role: "system", content: PROMPT.system },
        { role: "user", content: PROMPT.user },
      ],
      modelKey: model.key,
      maxTokens: 400,
      temperature: 0.2,
      solution: "04-private-ai-platform",
      task: "benchmark",
    });
    let n = await gen.next();
    while (!n.done) {
      if (n.value.content) {
        if (!first) first = Date.now() - t0;
        text += n.value.content;
      }
      n = await gen.next();
    }
    const r = n.value;
    const ms = Date.now() - t0;
    const genMs = Math.max(ms - first, 1);
    return Response.json({
      modelKey: model.key,
      label: model.label,
      servedId: r.model,
      ttftMs: first,
      totalMs: ms,
      completionTokens: r.usage.completionTokens,
      promptTokens: r.usage.promptTokens,
      tokensPerSecond: r.usage.completionTokens ? Math.round((r.usage.completionTokens / genMs) * 1000) : null,
      output: text,
    });
  } catch (e) {
    return Response.json({ modelKey: model.key, label: model.label, error: (e as Error).message }, { status: 200 });
  }
}
