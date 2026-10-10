import { z } from "zod";
import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { generateObject } from "@/lib/ai/json";
import { addAudit, kvSet } from "@/lib/store/db";
import { cacheKey, findOpp, loadSalesData, SLUG } from "@/app/solutions/08-sales-intelligence/_lib/data";
import { buildSourcePack, computedFacts, POLICY_QUERIES } from "@/app/solutions/08-sales-intelligence/_lib/context";

export const dynamic = "force-dynamic";

const schema = z.object({
  headline: z.string().describe("One sentence: the essence of the conflict and the way out"),
  perConflict: z.array(
    z.object({
      id: z.string().describe("conflict id exactly as given"),
      explanation: z.string().describe("Why it matters, 1–2 sentences, with [n] citations"),
      recommendation: z.string().describe("Concrete resolution, 1 sentence"),
      approver: z.string().nullable(),
    }),
  ),
  resolution: z.object({
    summary: z.string().describe("Recommended overall resolution, 2–4 sentences with [n] citations"),
    proposedTerms: z.array(z.object({ term: z.string(), proposal: z.string(), rationale: z.string() })).describe("4–7 terms for the revised offer"),
    negotiationRoom: z.string().describe("What room exists within authority limits, with the authority holder"),
    risksIfUnresolved: z.array(z.string()),
  }),
  additionalFindings: z
    .array(z.object({ finding: z.string(), sources: z.array(z.number()) }))
    .describe("Issues found in the correspondence that the computed checks cannot see (claims, deadlines, supply constraints)"),
});

/** Computed quote ↔ customer document ↔ contract comparison, then model explanation and recommended resolution. */
export async function POST(req: Request) {
  const body = await readBody<{ opportunityId?: string }>(req);
  const { modelKey, lang } = getPrefs(req, body);
  const data = loadSalesData();
  const opp = findOpp(data, body.opportunityId);
  if (!opp) return Response.json({ error: "Unknown opportunity" }, { status: 404 });
  const ar = lang === "ar";

  return eventStream(
    req,
    async (emit) => {
      const s1 = emit.step("compare", ar ? "مقارنة العرض وأمر الشراء والاتفاقية سطراً بسطر" : "Comparing quote, customer PO and frame agreement line by line");
      const pack = buildSourcePack(data, opp, { scope: "opportunity", policyQueries: POLICY_QUERIES.conflicts });
      const r = pack.report;
      if (!r.available) {
        s1.done(ar ? r.reason?.ar : r.reason?.en);
        emit.data("explanation", null);
        return;
      }
      const high = r.conflicts.filter((c) => c.severity === "high").length;
      s1.done(
        ar
          ? `${r.lines.length} بنود · ${r.conflicts.length} تعارضات (${high} عالية) · الفرق عن الاتفاقية ${r.totals.docVsContract?.toLocaleString("en-US") ?? "—"} درهم`
          : `${r.lines.length} lines · ${r.conflicts.length} conflicts (${high} high) · customer vs frame AED ${r.totals.docVsContract?.toLocaleString("en-US") ?? "—"}`,
      );
      emit.data("citations", pack.citations);

      if (!r.conflicts.length) {
        const s = emit.step("explain", ar ? "لا توجد تعارضات تحتاج شرحاً" : "No conflicts to explain");
        s.done();
        emit.data("explanation", null);
        return;
      }

      const s2 = emit.step("explain", ar ? "شرح التعارضات واقتراح الحل" : "Explaining conflicts and recommending a resolution");
      const { object, model } = await generateObject({
        schema,
        name: "conflict_resolution",
        system: [
          "You are NARVO, the private AI assistant of Raseen Building Materials Trading LLC (RBM), a UAE building-materials distributor.",
          `You support ${opp.owner}, Key Account Manager, and the Sales Director Fadi Khoury in resolving conflicting commercial terms before replying to the customer.`,
          "The conflicts and all numbers were computed by code and are authoritative — explain them, do not recompute or contradict them.",
          "Use ONLY the numbered sources; cite with [n] markers inside explanation and summary text. Respect authority limits: prices below frame need the Sales Director; below cost+4% the GM; terms beyond tier and credit releases only the Group CFO; site windows are not negotiable.",
          "Recommend a resolution that protects margin and credit while keeping the deal alive (e.g. re-issue at frame rates, offer a lever inside authority such as phased steel pricing or delivery commitments, route exceptions to the right approver).",
          `Return one perConflict entry for EVERY conflict id given. Write all text in ${ar ? "Arabic (professional Modern Standard Arabic; keep codes, references and AED amounts in Latin digits)" : "English"}.`,
        ].join("\n"),
        user: `COMPUTED FACTS AND CONFLICTS:\n${computedFacts(data, opp, r)}\n\nConflict ids: ${r.conflicts.map((c) => c.id).join(", ")}\n\nSOURCES:\n\n${pack.context}`,
        modelKey,
        maxTokens: 3000,
        temperature: 0.2,
        solution: SLUG,
        task: "conflicts.explain",
      });
      const ids = new Set(r.conflicts.map((c) => c.id));
      object.perConflict = object.perConflict.filter((p) => ids.has(p.id));
      emit.data("explanation", object);
      s2.done(ar ? `${object.perConflict.length} تفسيرات · ${object.resolution.proposedTerms.length} شروط مقترحة` : `${object.perConflict.length} explanations · ${object.resolution.proposedTerms.length} proposed terms`);
      kvSet(cacheKey("conflicts", opp.id), { kind: "conflicts", opportunityId: opp.id, data: object, citations: pack.citations, at: Date.now(), lang });
      addAudit({
        solution: SLUG,
        actor: { name: "NARVO Agent", role: "AI agent", kind: "agent" },
        action: "Conflicting terms analysed",
        subject: `${opp.id} ${opp.title}`,
        detail: `${r.conflicts.length} conflicts (${high} high); customer vs frame AED ${r.totals.docVsContract ?? "—"}`,
        model,
      });
    },
    { modelKey },
  );
}
