import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import type { Citation } from "@/lib/ai/events";
import { search } from "@/lib/retrieval";
import { CORPUS } from "@/app/solutions/15-procurement-intelligence/_lib/server";
import { draftRfq } from "@/app/solutions/15-procurement-intelligence/_lib/ai";
import { procurementMethod } from "@/app/solutions/15-procurement-intelligence/_lib/scoring";

export const maxDuration = 120;

/** From a short business need (EN/AR) draft scope, requirements and evaluation criteria — method computed from the estimate. */
export async function POST(req: Request) {
  const body = await readBody<{ need: string; estimate?: number | null }>(req);
  const { modelKey, lang } = getPrefs(req, body);
  if (!body.need || body.need.trim().length < 8) return new Response(lang === "ar" ? "صف الاحتياج بجملة على الأقل" : "Describe the need in at least a sentence", { status: 400 });

  return eventStream(
    req,
    async (emit) => {
      const estimate = typeof body.estimate === "number" && body.estimate > 0 ? body.estimate : null;
      const s1 = emit.step("method", lang === "ar" ? "تحديد طريقة الشراء من القيمة التقديرية (برمجياً)" : "Determining the procurement method from the estimate (in code)");
      const method = procurementMethod(estimate);
      s1.done(method ? `${method.label[lang]} · ${method.rule[lang]}` : lang === "ar" ? "لم تُدخل قيمة تقديرية" : "No estimate entered — method not determined");

      const s2 = emit.step("manual", lang === "ar" ? "البحث في دليل المشتريات" : "Searching the Procurement Manual");
      const queries = [
        body.need,
        "minimum content of RFQs and tender documents evaluation criteria weights",
        method ? method.label.en : "procurement methods thresholds",
        "supplier registration eligibility licence",
      ];
      const seen = new Set<string>();
      const citations: Citation[] = [];
      for (const q of queries) {
        for (const h of search(CORPUS.manual, q, 3)) {
          const key = `${h.docId}|${h.section}`;
          if (seen.has(key)) continue;
          seen.add(key);
          citations.push({ n: citations.length + 1, docId: h.docId, title: h.title, ref: h.ref, section: h.section, quote: h.text.length > 700 ? h.text.slice(0, 700) + "…" : h.text });
        }
      }
      const used = citations.slice(0, 8);
      emit.data("citations", used);
      s2.done(`${used.length} ${lang === "ar" ? "مقاطع" : "passages"}`);

      const s3 = emit.step("draft", lang === "ar" ? "صياغة النطاق والمتطلبات ومعايير التقييم" : "Drafting scope, requirements and evaluation criteria");
      const rfq = await draftRfq({ emit, lang, modelKey }, { need: body.need, methodLine: method ? `${method.label.en} — ${method.rule.en}; approval: ${method.approver.en}` : "not determined (no estimate)", citations: used });
      s3.done(
        lang === "ar"
          ? `${rfq.scope.length} بنود نطاق · ${rfq.requirements.length} متطلبات · ${rfq.criteria.length} معايير${rfq.weightsAdjusted ? " (الأوزان عُدّلت إلى 100)" : ""}`
          : `${rfq.scope.length} scope lines · ${rfq.requirements.length} requirements · ${rfq.criteria.length} criteria${rfq.weightsAdjusted ? " (weights normalised to 100)" : ""}`,
      );
      emit.data("rfq", { ...rfq, need: body.need, estimate, method, citations: used, at: Date.now() });
    },
    { modelKey },
  );
}
