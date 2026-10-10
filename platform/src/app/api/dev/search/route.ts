import { search, getIndex } from "@/lib/retrieval";
import { tokenize } from "@/lib/retrieval/arabic";
import { generateObject } from "@/lib/ai/json";
import { z } from "zod";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const plan = new URL(req.url).searchParams.get("plan");
  const idx = getIndex("mnda/knowledge");
  const out: Record<string, unknown> = {
    chunks: idx.chunks.length,
    qTokens: tokenize(q),
    sampleChunk: idx.chunks.find((c) => c.section.includes("رابعاً"))?.tokens.slice(0, 40),
    hits: search("mnda/knowledge", q, 8).map((h) => ({ doc: h.docId, section: h.section, score: h.score })),
  };
  if (plan) {
    const r = await generateObject({
      schema: z.object({ queries: z.array(z.string()), intent: z.string() }),
      name: "search_plan",
      system: "You plan searches over an institutional knowledge base in Arabic and English. Return 3-5 short keyword queries (two English, two Arabic) and a one-line intent.",
      user: `Question: ${q}`,
      solution: "dev",
      task: "plan-test",
    });
    out.plan = r.object;
  }
  return Response.json(out);
}
