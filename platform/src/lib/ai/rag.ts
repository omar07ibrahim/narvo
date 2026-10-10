import "server-only";
import { z } from "zod";
import { chatStream } from "./client";
import { generateObject } from "./json";
import type { Emitter } from "./stream";
import type { Citation } from "./events";
import { search, getIndex, cleanQuote, type SearchHit } from "@/lib/retrieval";

/**
 * Retrieval-augmented answer with live trace and numbered citations.
 *
 *  1. Query planning — the model rewrites the question into Arabic + English search queries
 *  2. Retrieval — BM25 over the corpus folder (Arabic-aware normalisation)
 *  3. Grounded answer — streamed, every claim cited as [n]
 */

export interface RagOptions {
  emit: Emitter;
  corpus: string | string[];
  question: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  lang: "en" | "ar";
  modelKey?: string | null;
  solution: string;
  /** Extra instructions for the answer (persona, format…) */
  instructions?: string;
  k?: number;
  channel?: string;
}

export interface RagResult {
  answer: string;
  citations: Citation[];
  hits: SearchHit[];
}

const planSchema = z.object({
  queries: z.array(z.string()).min(1).max(6),
  intent: z.string(),
});

export async function answerWithCitations(o: RagOptions): Promise<RagResult> {
  const { emit } = o;
  const corpora = Array.isArray(o.corpus) ? o.corpus : [o.corpus];
  const docCount = corpora.reduce((a, c) => a + getIndex(c).docs.length, 0);

  const s1 = emit.step("plan", o.lang === "ar" ? "فهم السؤال وصياغة استعلامات البحث" : "Understanding the question");
  const plan = await generateObject({
    schema: planSchema,
    name: "search_plan",
    system:
      "You plan searches over an institutional knowledge base written in Arabic and English. " +
      "Return 3-5 short keyword queries: at least two in English and two in Arabic, covering synonyms, official terms and reference numbers mentioned. " +
      "Also return a one-line intent summary in English.",
    user: [o.history?.slice(-4).map((h) => `${h.role}: ${h.content}`).join("\n"), `Question: ${o.question}`].filter(Boolean).join("\n\n"),
    modelKey: o.modelKey,
    solution: o.solution,
    task: "rag.plan",
    maxTokens: 400,
  });
  s1.done(plan.object.queries.join(" · "));

  const s2 = emit.step("search", o.lang === "ar" ? `البحث في قاعدة المعرفة (${docCount} مستند)` : `Searching ${docCount} documents`);
  const queries = [o.question, ...plan.object.queries];
  const all = corpora.flatMap((c) => search(c, queries, o.k ?? 8));
  const seen = new Set<string>();
  const hits = all
    .sort((a, b) => b.score - a.score)
    .filter((h) => {
      const key = `${h.docId}|${h.section}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, o.k ?? 8);
  const citations: Citation[] = hits.map((h, i) => ({
    n: i + 1,
    docId: h.docId,
    title: h.title,
    ref: h.ref,
    section: h.section,
    quote: cleanQuote(h.text, 460),
  }));
  emit.data("citations", citations);
  s2.done(
    o.lang === "ar"
      ? `${hits.length} مقاطع ذات صلة من ${new Set(hits.map((h) => h.docId)).size} مستندات`
      : `${hits.length} relevant passages from ${new Set(hits.map((h) => h.docId)).size} documents`,
  );

  const s3 = emit.step("answer", o.lang === "ar" ? "صياغة إجابة موثقة بالمصادر" : "Writing a sourced answer");
  const context = hits
    .map((h, i) => `[${i + 1}] ${h.title}${h.ref ? ` (${h.ref})` : ""} — section "${h.section}"\n${h.text}`)
    .join("\n\n---\n\n");

  const system = [
    "You are NARVO, a private AI assistant deployed inside the organisation. You answer ONLY from the numbered sources provided.",
    "Cite every factual statement with its source marker like [2] or [1][3], placed right after the claim.",
    "If the sources do not contain the answer, say so clearly and suggest who in the organisation owns the topic.",
    "Be precise with numbers, dates, reference numbers, fees and deadlines. Use short paragraphs and bullet lists where useful.",
    `Write the answer in ${o.lang === "ar" ? "Arabic (Modern Standard, formal UAE government register)" : "English"} unless the user explicitly writes in the other language, in which case match the user's language.`,
    o.instructions ?? "",
  ].join("\n");

  const gen = chatStream({
    messages: [
      { role: "system", content: system },
      ...(o.history ?? []).slice(-6),
      { role: "user", content: `Sources:\n\n${context || "(no matching sources)"}\n\n---\n\nQuestion: ${o.question}` },
    ],
    modelKey: o.modelKey,
    temperature: 0.2,
    maxTokens: 1400,
    solution: o.solution,
    task: "rag.answer",
    signal: emit.signal,
  });
  let answer = "";
  while (true) {
    const n = await gen.next();
    if (n.done) break;
    if (n.value.content) {
      answer += n.value.content;
      emit.text(n.value.content, o.channel ?? "main");
    }
  }
  const used = new Set(Array.from(answer.matchAll(/\[(\d+)\]/g)).map((m) => Number(m[1])));
  s3.done(o.lang === "ar" ? `${used.size} مصادر مستشهد بها` : `${used.size} sources cited`);
  return { answer, citations, hits };
}
