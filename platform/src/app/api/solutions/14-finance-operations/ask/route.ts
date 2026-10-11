import { z } from "zod";
import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { generateObject } from "@/lib/ai/json";
import { chatStream } from "@/lib/ai/client";
import type { Citation } from "@/lib/ai/events";
import { cleanQuote, search } from "@/lib/retrieval";
import { SLUG } from "@/app/solutions/14-finance-operations/_lib/data";

export const maxDuration = 120;

/** The documents AP works from — the shared Raseen corpus also holds sales, logistics and FM material that must not answer AP questions. */
const AP_DOCS = ["RG-FIN-POL-09", "RBM-SUP-DIR-2026", "RBM-FIN-POL-04"];

const planSchema = z.object({ queries: z.array(z.string()).min(1).max(6) });

/** "Ask AP policy" — cited answers scoped to the AP policy, the supplier directory and the credit policy. */
export async function POST(req: Request) {
  const body = await readBody<{ question?: string; history?: Array<{ role: "user" | "assistant"; content: string }> }>(req);
  const { modelKey, lang } = getPrefs(req, body);
  const question = (body.question ?? "").trim();
  if (!question) return Response.json({ error: "Ask a question" }, { status: 400 });
  if (question.length > 1200) return Response.json({ error: "Question too long" }, { status: 400 });
  const history = body.history?.slice(-4) ?? [];
  return eventStream(
    req,
    async (emit) => {
      // 1. Plan: the policies are written in English, so Arabic questions are searched with English keywords too.
      const s1 = emit.step("plan", lang === "ar" ? "فهم السؤال وصياغة استعلامات البحث" : "Understanding the question");
      const plan = await generateObject({
        schema: planSchema,
        name: "search_plan",
        system:
          "You plan keyword searches over Raseen Group's Accounts Payable policy (three-way match, tolerances, exceptions, approval matrix, posting accounts), the approved supplier directory and the credit policy. All documents are in English. Return 3-5 short English keyword queries using the policy's vocabulary (e.g. 'approval matrix AP Supervisor Group CFO', 'price tolerance', 'missing TRN hold').",
        user: [history.map((h) => `${h.role}: ${h.content}`).join("\n"), `Question: ${question}`].filter(Boolean).join("\n\n"),
        modelKey,
        solution: SLUG,
        task: "ask-policy.plan",
        maxTokens: 300,
      });
      s1.done(plan.object.queries.join(" · "));

      // 2. Retrieve within the AP documents only.
      const s2 = emit.step("search", lang === "ar" ? "البحث في سياسة الحسابات الدائنة ودليل الموردين" : "Searching the AP policy and supplier directory");
      const raw = search("raseen/knowledge", [question, ...plan.object.queries], 12, { docIds: AP_DOCS });
      const seen = new Set<string>();
      const hits = raw
        .filter((h) => {
          const key = `${h.docId}|${h.section}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 6);
      const citations: Citation[] = hits.map((h, i) => ({ n: i + 1, docId: h.docId, title: h.title, ref: h.ref, section: h.section, quote: cleanQuote(h.text, 460) }));
      emit.data("citations", citations);
      s2.done(lang === "ar" ? `${hits.length} مقاطع من ${new Set(hits.map((h) => h.docId)).size} مستندات` : `${hits.length} passages from ${new Set(hits.map((h) => h.docId)).size} documents`);

      // 3. Grounded answer, every claim cited.
      const s3 = emit.step("answer", lang === "ar" ? "صياغة إجابة موثقة بالمصادر" : "Writing a sourced answer");
      const context = hits.map((h, i) => `[${i + 1}] ${h.title}${h.ref ? ` (${h.ref})` : ""} — section "${h.section}"\n${h.text}`).join("\n\n---\n\n");
      const system = [
        "You are NARVO, the private assistant of the Accounts Payable team of Raseen Group Finance (AP Supervisor Deepak Menon, Group CFO Priya Raghavan). Answer ONLY from the numbered sources.",
        "Cite every factual statement with its marker like [2], right after the claim. Quote tolerances, thresholds, account codes and reference numbers exactly. If the sources do not answer the question, say so and name the owner (Group Finance).",
        "When the question names an amount, apply the policy's thresholds to it explicitly (e.g. which approver band it falls in).",
        `Answer in ${lang === "ar" ? "Arabic (formal, clear)" : "English"} in 3–8 short sentences or bullets.`,
      ].join("\n");
      const gen = chatStream({
        messages: [{ role: "system", content: system }, ...history, { role: "user", content: `Sources:\n\n${context || "(no matching sources)"}\n\n---\n\nQuestion: ${question}` }],
        modelKey,
        temperature: 0.2,
        maxTokens: 900,
        solution: SLUG,
        task: "ask-policy",
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
      s3.done(lang === "ar" ? `${used.size} مصادر مستشهد بها` : `${used.size} sources cited`);
    },
    { modelKey },
  );
}
