import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import type { Citation } from "@/lib/ai/events";
import { z } from "zod";
import { search } from "@/lib/retrieval";
import { generateObject } from "@/lib/ai/json";
import { CORPUS, SOL, contractText, getContracts, getObligations } from "@/app/solutions/13-contract-intelligence/_lib/server";
import { askContract } from "@/app/solutions/13-contract-intelligence/_lib/ai";
import { dueDate, fmtDate } from "@/app/solutions/13-contract-intelligence/_lib/dates";

export const maxDuration = 120;

/** Ask a question of one contract: clause retrieval scoped to that contract → cited, streamed answer. */
export async function POST(req: Request) {
  const body = await readBody<{ contractId: string; question: string; history?: Array<{ role: "user" | "assistant"; content: string }> }>(req);
  const { modelKey, lang } = getPrefs(req, body);
  if (!body.question?.trim()) return new Response("Empty question", { status: 400 });

  return eventStream(
    req,
    async (emit) => {
      const c = getContracts().find((x) => x.id === body.contractId) ?? null;
      const src = contractText(body.contractId);
      const s0 = emit.step("plan", lang === "ar" ? "صياغة استعلامات البحث" : "Planning the clause search");
      const { object: plan } = await generateObject({
        schema: z.object({ queries: z.array(z.string()).min(1).max(5) }),
        name: "clause_queries",
        system:
          "Rewrite the user's question about a contract into 3–4 short English keyword queries using contract vocabulary (e.g. 'renewal notice sixty days expiry', 'liability cap total contract value'). The contract is written in English.",
        user: [(body.history ?? []).slice(-2).map((h) => `${h.role}: ${h.content}`).join("\n"), `Question: ${body.question}`].filter(Boolean).join("\n"),
        modelKey,
        solution: SOL,
        task: "ask-plan",
        maxTokens: 200,
      });
      s0.done(plan.queries.join(" · "));
      const s1 = emit.step("search", lang === "ar" ? "البحث في بنود العقد" : "Searching the contract's clauses");
      const citations: Citation[] = [];
      if (src && c?.file) {
        const corpus = c.file.startsWith("drafts/") ? CORPUS.drafts : CORPUS.contracts;
        const seen = new Set<string>();
        const hits = [body.question, ...plan.queries]
          .flatMap((q) => search(corpus, q, 30).filter((h) => h.docId === c.id).slice(0, 3))
          .sort((a, b) => b.score - a.score)
          .filter((h) => (seen.has(h.section) ? false : (seen.add(h.section), true)))
          .slice(0, 6);
        hits.forEach((h) => citations.push({ n: citations.length + 1, docId: h.docId, title: c.ref, ref: c.ref, section: h.section, quote: h.text }));
      } else if (src) {
        // Bring-your-own text: rank its paragraphs by keyword overlap.
        const q = new Set(body.question.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 3));
        const paras = src.body.split(/\n(?=#{1,3}\s|\d+(\.\d+)*\s)/).map((p) => p.trim()).filter((p) => p.length > 60);
        paras
          .map((p) => ({ p, s: p.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => q.has(t)).length }))
          .sort((a, b) => b.s - a.s)
          .slice(0, 6)
          .forEach(({ p }) => citations.push({ n: citations.length + 1, docId: body.contractId, title: src.name, section: p.split("\n")[0].replace(/^#+\s*/, "").slice(0, 80), quote: p.slice(0, 1400) }));
      }
      if (c) {
        // The register and the obligations are authoritative sources too.
        const obs = getObligations().filter((o) => o.contractId === c.id);
        citations.push({
          n: citations.length + 1,
          docId: "REGISTER",
          title: "MNDA contracts register",
          ref: c.ref,
          section: "Register entry & obligations",
          quote: `${c.ref} ${c.title.en} — ${c.counterparty}. Term ${fmtDate(c.start)} – ${fmtDate(c.end)}. ${c.annualValue ? `AED ${c.annualValue.toLocaleString("en-US")} per year. ` : ""}Total AED ${c.totalValue.toLocaleString("en-US")}. Contract owner ${c.owner}. Renewal: ${c.renewal.type}${c.renewal.noticeDays ? `, notice ${c.renewal.noticeDays} days` : ""}. Obligations: ${obs
            .map((o) => `${o.title.en} — due ${dueDate(o.trigger, c) ? fmtDate(dueDate(o.trigger, c)!) : "n/a"} (${o.owner}, ${o.status})`)
            .join("; ")}.`,
        });
      }
      emit.data("citations", citations);
      s1.done(lang === "ar" ? `${citations.length} مقاطع` : `${citations.length} passages`);
      if (!citations.length) throw new Error(lang === "ar" ? "لا يتوفر نص لهذا العقد" : "No text is available for this contract");

      const s2 = emit.step("answer", lang === "ar" ? "صياغة إجابة موثقة" : "Writing a cited answer");
      const gen = askContract({ emit, lang, modelKey }, { question: body.question, citations, contractName: c ? `${c.ref} (${c.counterparty})` : (src?.name ?? "the contract"), history: body.history ?? [] });
      let text = "";
      while (true) {
        const n = await gen.next();
        if (n.done) break;
        text += n.value;
        emit.text(n.value, "answer");
      }
      const used = new Set(Array.from(text.matchAll(/\[(\d+)\]/g)).map((m) => Number(m[1])));
      s2.done(lang === "ar" ? `${used.size} مصادر مستشهد بها` : `${used.size} sources cited`);
    },
    { modelKey },
  );
}
