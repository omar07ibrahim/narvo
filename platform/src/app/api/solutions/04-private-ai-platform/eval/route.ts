import { z } from "zod";
import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { chat } from "@/lib/ai/client";
import { generateObject } from "@/lib/ai/json";
import { search } from "@/lib/retrieval";
import { readJson } from "@/lib/world/data";
import { kvSet, addAudit } from "@/lib/store/db";
import { findModel } from "@/lib/ai/config";

export const maxDuration = 300;

interface EvalCase {
  id: string;
  lang: "en" | "ar";
  q: string;
  expect: string[];
  topic: string;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[,٬]/g, "")
    .replace(/\s+/g, " ");

/**
 * Workload-quality evaluation: run the grounded-answer pipeline on a fixed question set and
 * score each answer against expected facts (computed, not judged by the model).
 */
export async function POST(req: Request) {
  const body = await readBody(req);
  const { modelKey } = getPrefs(req, body);
  const set = readJson<{ name: string; corpus: string; cases: EvalCase[] }>("narvo/04-private-ai-platform/eval-set.json");

  return eventStream(
    req,
    async (emit) => {
      const results: Array<{ id: string; q: string; topic: string; lang: string; pass: boolean; found: string[]; missing: string[]; cited: boolean; ms: number; answer: string }> = [];
      let i = 0;
      const queue = [...set.cases];
      await Promise.all(
        Array.from({ length: 3 }, async () => {
          while (queue.length) {
            const c = queue.shift()!;
            const idx = ++i;
            const st = emit.step(c.id, `${c.id} · ${c.q}`);
            const t0 = Date.now();
            try {
              const plan = await generateObject({
                schema: z.object({ queries: z.array(z.string()).min(1).max(5) }),
                name: "plan",
                system: "Return 3-4 short keyword search queries (English and Arabic) for the question.",
                user: c.q,
                modelKey,
                solution: "04-private-ai-platform",
                task: "eval.plan",
                maxTokens: 200,
              });
              const hits = search(set.corpus, [c.q, ...plan.object.queries], 6);
              const ctx = hits.map((h, k) => `[${k + 1}] ${h.title} — ${h.section}\n${h.text}`).join("\n\n");
              const r = await chat({
                messages: [
                  { role: "system", content: "Answer only from the numbered sources, citing them like [1]. Be concise and include exact figures." },
                  { role: "user", content: `Sources:\n${ctx}\n\nQuestion: ${c.q}` },
                ],
                modelKey,
                maxTokens: 400,
                temperature: 0,
                solution: "04-private-ai-platform",
                task: "eval.answer",
              });
              const answer = norm(r.content);
              const found = c.expect.filter((e) => answer.includes(norm(e)));
              const missing = c.expect.filter((e) => !answer.includes(norm(e)));
              const cited = /\[\d+\]/.test(r.content);
              const pass = missing.length === 0 && cited;
              results.push({ id: c.id, q: c.q, topic: c.topic, lang: c.lang, pass, found, missing, cited, ms: Date.now() - t0, answer: r.content });
              emit.data("results", [...results].sort((a, b) => a.id.localeCompare(b.id)));
              pass ? st.done(`${found.length}/${c.expect.length} facts · cited`) : st.error(`missing: ${missing.join(", ") || "citation"}`);
            } catch (e) {
              st.error((e as Error).message);
            }
            void idx;
          }
        }),
      );
      const passed = results.filter((r) => r.pass).length;
      const summary = {
        at: Date.now(),
        model: findModel(modelKey).label,
        set: set.name,
        passed,
        total: set.cases.length,
        score: Math.round((passed / set.cases.length) * 100),
        avgMs: Math.round(results.reduce((a, r) => a + r.ms, 0) / Math.max(results.length, 1)),
        results: results.sort((a, b) => a.id.localeCompare(b.id)),
      };
      kvSet("04-private-ai-platform:eval:last", summary);
      emit.data("summary", summary);
      addAudit({
        solution: "04-private-ai-platform",
        actor: { name: "NARVO Platform", role: "Evaluation runner", kind: "system" },
        action: "Evaluation suite completed",
        subject: set.name,
        detail: `${summary.model}: ${passed}/${set.cases.length} passed (${summary.score}%) · avg ${(summary.avgMs / 1000).toFixed(1)} s`,
      });
    },
    { modelKey },
  );
}

export async function GET() {
  const { kvGet } = await import("@/lib/store/db");
  return Response.json(kvGet("04-private-ai-platform:eval:last") ?? null);
}
