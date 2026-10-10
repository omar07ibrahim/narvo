import "server-only";
import { z } from "zod";
import { chatStream } from "@/lib/ai/client";
import { generateObject } from "@/lib/ai/json";
import type { Emitter } from "@/lib/ai/stream";
import type { Citation } from "@/lib/ai/events";
import { attachmentPassages, corpusStats, searchFiltered, SOLUTION, toCitations } from "./server";
import { ROLES, SCOPES, accessLabel, type Attachment, type RoleKey, type ScopeKey } from "./shared";

export interface Turn {
  role: "user" | "assistant";
  content: string;
}

const planSchema = z.object({
  queries: z.array(z.string()).min(1).max(6),
  intent: z.string(),
});

/** Plan search queries (EN + AR) for the knowledge base. */
export async function planQueries(
  question: string,
  history: Turn[],
  modelKey: string | null,
  extra = "",
): Promise<{ queries: string[]; intent: string }> {
  const { object } = await generateObject({
    schema: planSchema,
    name: "search_plan",
    system:
      "You plan keyword searches over the knowledge base of Marsa Al Noor Development Authority (MNDA): circulars, service guides, " +
      "building code MNBC-2024, policies (AI, information security, records), HR handbook and procedures, IT service catalogue, strategy and performance reports. " +
      "Documents are in Arabic and English. Return 3-5 short keyword queries — at least two in English and two in Arabic — covering official terms, " +
      "synonyms and any reference numbers (e.g. 'Circular 14/2026', 'MNDA-SVC-101', 'HC-POL-07'). Resolve pronouns using the conversation. " +
      "Also return a one-line intent in English." +
      extra,
    user: [history.slice(-4).map((h) => `${h.role}: ${h.content.slice(0, 600)}`).join("\n"), `Question: ${question}`]
      .filter(Boolean)
      .join("\n\n"),
    modelKey,
    solution: SOLUTION,
    task: "ask.plan",
    maxTokens: 400,
  });
  return object;
}

export function personaSystem(role: RoleKey, lang: "en" | "ar") {
  const r = ROLES[role];
  return [
    "You are NARVO Workspace, the private AI assistant of Marsa Al Noor Development Authority (MNDA), a UAE government authority. You run on MNDA infrastructure; data never leaves the Authority.",
    `You are assisting ${r.persona.name}, ${r.persona.title.en} — role "${r.label.en}", cleared for ${accessLabel(r.access, "en")} information.`,
    role === "contractor"
      ? "This user is EXTERNAL (contractor portal). Only public information may be shared. Never reveal internal processes, staff workload, performance figures or internal opinions."
      : "",
    "Today is Sunday 11 October 2026; operational data runs to Friday 9 October 2026. The UAE working week is Monday–Friday (Friday half-day).",
    `The user's interface language is ${lang === "ar" ? "Arabic" : "English"}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function runAsk(
  emit: Emitter,
  o: {
    question: string;
    history: Turn[];
    role: RoleKey;
    scope: ScopeKey;
    attachment?: Attachment | null;
    lang: "en" | "ar";
    modelKey: string | null;
  },
) {
  const ar = o.lang === "ar";
  const role = ROLES[o.role];
  const scopeLabel = SCOPES.find((s) => s.key === o.scope)!.label;

  const s1 = emit.step("plan", ar ? "فهم السؤال وصياغة استعلامات البحث" : "Understanding the question");
  const plan = await planQueries(o.question, o.history, o.modelKey);
  s1.done(plan.queries.join(" · "));

  const stats = corpusStats();
  const s2 = emit.step(
    "search",
    ar
      ? `البحث في ${scopeLabel.ar} (${stats.documents} مستنداً) بصلاحية ${accessLabel(role.access, "ar")}`
      : `Searching ${scopeLabel.en.toLowerCase()} (${stats.documents} documents) with ${accessLabel(role.access, "en")} access`,
  );
  const queries = [o.question, ...plan.queries];
  const { hits, withheld } = searchFiltered(queries, o.role, o.scope, o.attachment ? 6 : 8);
  const attPassages = o.attachment
    ? attachmentPassages(o.attachment, queries).map((p) => ({ docId: "upload", title: o.attachment!.name, ref: ar ? "مستندك" : "Your document", section: p.section, text: p.text }))
    : [];
  const passages = [...attPassages, ...hits];
  const citations: Citation[] = toCitations(passages);
  emit.data("citations", citations);
  emit.data("withheld", withheld);
  const docCount = new Set(passages.map((p) => p.docId)).size;
  const withheldNote = withheld.length
    ? ar
      ? ` · حُجب ${withheld.length} مستند لعدم الصلاحية`
      : ` · ${withheld.length} restricted document${withheld.length > 1 ? "s" : ""} withheld`
    : "";
  s2.done(
    (ar ? `${passages.length} مقاطع ذات صلة من ${docCount} مستندات` : `${passages.length} relevant passages from ${docCount} documents`) +
      withheldNote,
  );

  const s3 = emit.step("answer", ar ? "صياغة إجابة موثقة بالمصادر" : "Writing a sourced answer");
  const context = passages
    .map((h, i) => `[${i + 1}] ${h.title}${h.ref ? ` (${h.ref})` : ""} — section "${h.section}"\n${h.text}`)
    .join("\n\n---\n\n");

  const system = [
    personaSystem(o.role, o.lang),
    "Answer ONLY from the numbered sources provided. Cite every factual statement with its marker, e.g. [2] or [1][3], right after the claim. Never invent markers.",
    "Be exact with numbers, dates, fees, service levels, reference numbers and names. Prefer a one-sentence direct answer first, then short bullets or numbered steps. Use a small markdown table only when comparing items. Keep it under 260 words unless the user asks for detail.",
    "If the sources do not contain the answer, say so plainly and name the department or person who owns the topic if the sources show it.",
    "Never make or pre-empt a decision (approve, reject, grant an exception or extension): state exactly what the rules say — including where they are silent ('the circular does not provide for…') — and who decides. Under MNDA's Responsible AI Policy decisions rest with the responsible officer.",
    "Never add facts that are not in the sources, even if plausible (e.g. about compensation, liability, penalties or timelines). When the user's own document makes a claim, compare it with the rules and point out any mismatch.",
    withheld.length
      ? `Note: ${withheld.length} potentially relevant document(s) exist above this user's access level and were withheld. Do not guess their content. If the question needs them, say that further detail is restricted to staff with higher access.`
      : "",
    attPassages.length ? "Sources marked 'Your document' were uploaded by the user in this session; treat them as the user's own material." : "",
    `Write in ${ar ? "Arabic (Modern Standard Arabic, formal UAE government register)" : "English"} unless the user writes in the other language, in which case answer in the user's language.`,
  ]
    .filter(Boolean)
    .join("\n");

  const gen = chatStream({
    messages: [
      { role: "system", content: system },
      ...o.history.slice(-6),
      { role: "user", content: `Sources:\n\n${context || "(no accessible sources matched)"}\n\n---\n\nQuestion: ${o.question}` },
    ],
    modelKey: o.modelKey,
    temperature: 0.2,
    maxTokens: 1400,
    solution: SOLUTION,
    task: "ask.answer",
    signal: emit.signal,
  });
  let answer = "";
  while (true) {
    const n = await gen.next();
    if (n.done) break;
    if (n.value.content) {
      answer += n.value.content;
      emit.text(n.value.content, "main");
    }
  }
  const used = new Set(Array.from(answer.matchAll(/\[(\d+)\]/g)).map((m) => Number(m[1])));
  const invalid = [...used].filter((n) => n < 1 || n > citations.length);
  s3.done(
    (ar ? `${used.size} مصادر مستشهد بها` : `${used.size} sources cited`) +
      (invalid.length ? (ar ? ` · ${invalid.length} إشارة غير صالحة` : ` · ${invalid.length} invalid marker(s)`) : ""),
  );

  // Suggested follow-ups (small, fast call)
  try {
    const { object } = await generateObject({
      schema: z.object({ followups: z.array(z.string()).min(2).max(3) }),
      name: "followups",
      system:
        `Suggest 3 short, natural follow-up questions (max 12 words each) the same MNDA employee might ask next, answerable from an MNDA knowledge base. Write them in ${ar ? "Arabic" : "English"}.`,
      user: `Question: ${o.question}\n\nAnswer: ${answer.slice(0, 1500)}`,
      modelKey: o.modelKey,
      solution: SOLUTION,
      task: "ask.followups",
      maxTokens: 220,
    });
    emit.data("followups", object.followups);
  } catch {
    // follow-ups are optional
  }
  return { answer, citations };
}
