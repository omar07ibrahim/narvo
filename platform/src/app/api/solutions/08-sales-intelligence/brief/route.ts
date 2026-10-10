import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { chatStream } from "@/lib/ai/client";
import { addAudit, kvSet } from "@/lib/store/db";
import { cacheKey, findOpp, loadSalesData, SLUG } from "@/app/solutions/08-sales-intelligence/_lib/records";
import { buildSourcePack, computedFacts, POLICY_QUERIES } from "@/app/solutions/08-sales-intelligence/_lib/evidence";
import { oppHealth } from "@/app/solutions/08-sales-intelligence/_lib/calc";

export const dynamic = "force-dynamic";

/** Streamed account brief for an opportunity, every claim cited to CRM records, documents or policy. */
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
      const s1 = emit.step("gather", ar ? "جمع سجلات الحساب" : "Collecting account records");
      const pack = buildSourcePack(data, opp, { scope: "account", policyQueries: POLICY_QUERIES.brief });
      const nInt = pack.citations.filter((c) => c.docId.startsWith("INT-")).length;
      s1.done(
        ar
          ? `${nInt} تفاعلاً · ${pack.report.quote ? "عرض سعر" : "بدون عرض"} · ${pack.report.doc ? "مستند متعامل" : "بدون مستند"} · ملف ائتماني`
          : `${nInt} interactions · ${pack.report.quote ? "1 quotation" : "no quotation"} · ${pack.report.doc ? "1 customer document" : "no customer document"} · credit file`,
      );

      const s2 = emit.step("compute", ar ? "حساب حالة الفرصة والتعارضات" : "Computing stage health and conflicts");
      const h = oppHealth(opp, data.interactions, data.today);
      const facts = computedFacts(data, opp, pack.report);
      s2.done(
        ar
          ? `${h.daysInStage} يوماً في المرحلة${h.stalled ? " — متعثرة" : ""} · ${pack.report.conflicts.length} تعارضات`
          : `${h.daysInStage} days in stage${h.stalled ? " — stalled" : ""} · ${pack.report.conflicts.length} conflicts`,
      );
      emit.data("citations", pack.citations);

      const s3 = emit.step("write", ar ? "كتابة ملخص الحساب مع المصادر" : "Writing the cited account brief");
      const system = [
        "You are NARVO, the private AI assistant of Raseen Building Materials Trading LLC (RBM), a UAE building-materials distributor.",
        `You prepare account briefs for Key Account Managers. The reader is ${opp.owner}, the KAM now responsible for this opportunity${opp.previousOwner ? ` (took over from ${opp.previousOwner} on ${opp.ownerChangedAt})` : ""}.`,
        "Use ONLY the numbered sources and the computed facts. Cite every factual statement with its marker, e.g. [3] or [2][7], right after the claim. Never invent prices, dates, people or commitments.",
        "Computed facts (days in stage, totals, exposure, conflicts) come from code and are authoritative — do not recalculate them, and do not put any marker after them (only numbered sources get [n]). Use the calendar given for weekdays.",
        "Distinguish clearly between what was documented/approved and what someone claims was agreed verbally.",
        `Write in ${ar ? "Arabic (Modern Standard Arabic, professional business register; keep SKU codes, reference numbers and AED amounts in Latin digits)" : "English"}.`,
        "Format (Markdown, ~350–450 words): a one-paragraph **Situation**; then ### headings: " +
          (ar
            ? "«ما يطلبه المتعامل»، «ما التزمت به رصين»، «التعارضات والمخاطر»، «الأشخاص والعلاقات»، «المواعيد الحاسمة»، «الخطوة التالية المقترحة»"
            : "'What the customer is asking for', 'What RBM has said or committed', 'Conflicts & risks', 'People & relationships', 'Critical dates', 'Recommended next move'") +
          ". Use short bullets. Be specific and practical — this person must act on it today.",
      ].join("\n");
      const user = `COMPUTED FACTS (authoritative):\n${facts}\n\nSOURCES:\n\n${pack.context}\n\n---\nWrite the account brief for ${opp.id}.`;
      let text = "";
      const gen = chatStream({
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        modelKey,
        temperature: 0.25,
        maxTokens: 1500,
        solution: SLUG,
        task: "brief",
        signal: emit.signal,
      });
      let res;
      while (true) {
        const n = await gen.next();
        if (n.done) {
          res = n.value;
          break;
        }
        if (n.value.content) {
          text += n.value.content;
          emit.text(n.value.content, "brief");
        }
      }
      if (!text.trim()) throw new Error(ar ? "لم يُرجع النموذج أي نص" : "The model returned an empty brief");
      const used = new Set(Array.from(text.matchAll(/\[(\d+)\]/g)).map((m) => Number(m[1])));
      s3.done(ar ? `${used.size} مصادر مستشهد بها` : `${used.size} sources cited`);
      kvSet(cacheKey("brief", opp.id), { kind: "brief", opportunityId: opp.id, text, citations: pack.citations, at: Date.now(), ms: res?.ms, lang });
      addAudit({
        solution: SLUG,
        actor: { name: "NARVO Agent", role: "AI agent", kind: "agent" },
        action: "Account brief prepared",
        subject: `${opp.id} ${opp.title}`,
        detail: `${used.size} sources cited · requested by ${opp.owner}`,
        model: res?.model,
      });
    },
    { modelKey },
  );
}
