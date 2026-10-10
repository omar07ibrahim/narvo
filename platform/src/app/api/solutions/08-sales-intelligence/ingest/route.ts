import { z } from "zod";
import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { generateObject } from "@/lib/ai/json";
import { addAudit } from "@/lib/store/db";
import { findOpp, loadSalesData, SLUG } from "@/app/solutions/08-sales-intelligence/_lib/data";
import { computedFacts } from "@/app/solutions/08-sales-intelligence/_lib/context";
import { addDays, detectConflicts, findWindow, round2 } from "@/app/solutions/08-sales-intelligence/_lib/compute";
import type { Bi, IngestResult } from "@/app/solutions/08-sales-intelligence/_lib/types";

export const dynamic = "force-dynamic";

const schema = z.object({
  language: z.enum(["en", "ar", "mixed"]),
  sender: z.string().describe("Name and company of the sender"),
  intent: z.string().describe("What the customer wants, one sentence"),
  sentiment: z.enum(["positive", "neutral", "negative", "urgent"]),
  summary: z.string().describe("2–3 sentence summary for the CRM"),
  requestedChanges: z.array(
    z.object({
      topic: z.enum(["price", "payment_terms", "delivery", "quantity", "validity", "retention", "other"]),
      sku: z.string().nullable().describe("RBM SKU code if identifiable, e.g. RB-B500-16"),
      requested: z.string().describe("The requested change in plain words"),
      requestedValue: z.number().nullable().describe("Numeric value: AED/unit for price, days for payment terms, quantity for quantity"),
      quote: z.string().describe("Exact words from the message that support this item"),
    }),
  ),
  deadlines: z.array(z.object({ what: z.string(), date: z.string().nullable().describe("YYYY-MM-DD if a date is stated") })),
  claims: z.array(z.string()).describe("Claims about past agreements or promises made by RBM staff"),
  proposedCrm: z.object({
    stage: z.enum(["Qualification", "Proposal", "Negotiation", "Closed Won", "Closed Lost"]).nullable(),
    nextStep: z.string(),
    nextStepDate: z.string().nullable(),
    probability: z.number().nullable(),
    note: z.string(),
  }),
});

interface Check {
  index: number;
  status: "ok" | "needs_approval" | "not_allowed" | "info";
  message: Bi;
  approver?: string;
  valueImpact?: number;
}

/** Bring-your-own: read a pasted customer email / WhatsApp, extract intent and requested changes, check them in code. */
export async function POST(req: Request) {
  const body = await readBody<{ opportunityId?: string; text?: string }>(req);
  const { modelKey, lang } = getPrefs(req, body);
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (text.length < 15) return Response.json({ error: "Paste a customer message (at least a sentence)." }, { status: 400 });
  if (text.length > 12000) return Response.json({ error: "Message too long (max 12,000 characters)." }, { status: 400 });
  const data = loadSalesData();
  const opp = findOpp(data, body.opportunityId);
  if (!opp) return Response.json({ error: "Unknown opportunity" }, { status: 404 });
  const ar = lang === "ar";
  const account = data.accounts.find((a) => a.id === opp.accountId)!;

  return eventStream(
    req,
    async (emit) => {
      const s1 = emit.step("read", ar ? "قراءة رسالة المتعامل واستخراج الطلبات" : "Reading the customer message and extracting requests");
      const report = detectConflicts(data, opp);
      const { object, model } = await generateObject({
        schema,
        name: "customer_message",
        system: [
          "You are NARVO, the private AI assistant of Raseen Building Materials Trading LLC (RBM), a UAE building-materials distributor.",
          `A Key Account Manager (${opp.owner}) pasted a customer message related to opportunity ${opp.id} "${opp.title}" for ${account.name}.`,
          "Extract the sender, intent, sentiment, every requested change (price per SKU, payment terms in days, delivery dates/times/days, quantities, validity/fixed-price, retention), deadlines and any claims about what RBM staff agreed.",
          "Messages may be in English, Arabic (MSA or Gulf dialect) or mixed. Quote the exact supporting words. Map products to RBM SKUs: rebar 12/16/20/25 mm → RB-B500-12/16/20/25, sulphate-resisting cement → CEM-SRC-50, OPC → CEM-OPC-50, bitumen membrane → WPF-BIT-4, blocks → BLK-HOL-20, porcelain 60×120 → TIL-POR-60120.",
          `Then propose the CRM update (next step + date on or after ${data.today}). Use only the message and the CRM facts.`,
          `Write intent, summary, requested, claims, deadlines.what and proposedCrm text in ${ar ? "Arabic (professional MSA)" : "English"}; keep 'quote' in the original language.`,
        ].join("\n"),
        user: `CRM FACTS:\n${computedFacts(data, opp, report)}\n\nCUSTOMER MESSAGE:\n"""\n${text}\n"""`,
        modelKey,
        maxTokens: 2200,
        temperature: 0.1,
        solution: SLUG,
        task: "ingest",
      });
      s1.done(
        ar
          ? `${object.requestedChanges.length} طلبات تغيير · ${object.deadlines.length} مواعيد · ${object.claims.length} ادعاءات`
          : `${object.requestedChanges.length} requested changes · ${object.deadlines.length} deadlines · ${object.claims.length} claims`,
      );

      const s2 = emit.step("check", ar ? "مطابقة الطلبات مع الاتفاقية وسياسة الائتمان" : "Checking requests against frame agreement and credit policy");
      const contract = report.contract;
      const tierMax = report.tierMaxTerms;
      const window = findWindow(data.siteWindows, opp.zone);
      const products = new Map(data.products.map((p) => [p.sku, p] as const));
      const checks: Check[] = object.requestedChanges.map((c, index) => {
        const p = c.sku ? products.get(c.sku) : undefined;
        if (c.topic === "price" && p && c.requestedValue != null) {
          const frame = contract?.rates[p.sku];
          const floor = round2(p.stdCost * 1.04);
          if (frame != null && c.requestedValue < frame) {
            const below = c.requestedValue < floor;
            return {
              index,
              status: below ? "not_allowed" : "needs_approval",
              approver: below ? "Tariq Nasser — General Manager, RBM" : "Fadi Khoury — Sales Director",
              message: {
                en: `${c.requestedValue.toLocaleString("en-US")} is ${round2(frame - c.requestedValue).toLocaleString("en-US")} below the ${contract!.id} rate ${frame.toLocaleString("en-US")}${below ? ` and below cost + 4% (${floor})` : ""}.`,
                ar: `${c.requestedValue.toLocaleString("en-US")} أقل من سعر ${contract!.id} البالغ ${frame.toLocaleString("en-US")} بمقدار ${round2(frame - c.requestedValue).toLocaleString("en-US")}${below ? ` وأقل من التكلفة + 4% (${floor})` : ""}.`,
              },
            };
          }
          return {
            index,
            status: "ok",
            message: {
              en: frame != null ? `At or above the frame rate ${frame.toLocaleString("en-US")}.` : `No frame rate — list price ${p.listPrice.toLocaleString("en-US")}.`,
              ar: frame != null ? `مساوٍ لسعر الاتفاقية ${frame.toLocaleString("en-US")} أو أعلى.` : `لا يوجد سعر اتفاقية — سعر القائمة ${p.listPrice.toLocaleString("en-US")}.`,
            },
          };
        }
        if (c.topic === "payment_terms" && c.requestedValue != null) {
          return c.requestedValue > tierMax
            ? {
                index,
                status: "needs_approval",
                approver: "Priya Raghavan — Group CFO",
                message: {
                  en: `${c.requestedValue} days exceeds the tier ${account.tier} maximum of ${tierMax} days — Group CFO approval with credit insurance or bank guarantee.`,
                  ar: `${c.requestedValue} يوماً تتجاوز الحد الأقصى للفئة ${account.tier} (${tierMax} يوماً) — تتطلب موافقة المدير المالي للمجموعة مع تأمين ائتماني أو ضمان بنكي.`,
                },
              }
            : { index, status: "ok", message: { en: `Within the ${tierMax}-day tier maximum.`, ar: `ضمن الحد الأقصى للفئة (${tierMax} يوماً).` } };
        }
        if (c.topic === "quantity" && c.requestedValue != null && p) {
          const rate = contract?.rates[p.sku] ?? p.listPrice;
          const v = round2(c.requestedValue * rate);
          return {
            index,
            status: "info",
            valueImpact: v,
            message: {
              en: `${c.requestedValue.toLocaleString("en-US")} ${p.unit} × ${rate.toLocaleString("en-US")} = AED ${v.toLocaleString("en-US")} at ${contract ? "frame" : "list"} rate (excl. VAT).`,
              ar: `${c.requestedValue.toLocaleString("en-US")} ${p.unitAr} × ${rate.toLocaleString("en-US")} = ${v.toLocaleString("en-US")} درهم بسعر ${contract ? "الاتفاقية" : "القائمة"} (دون الضريبة).`,
            },
          };
        }
        if (c.topic === "delivery" && window) {
          const t = `${c.requested} ${c.quote}`;
          const sunday = /sunday|الأحد|احد/i.test(t);
          const early = Array.from(t.matchAll(/\b(0?[5-8])[:.]?(\d{2})?\s*(am|ص)?\b/gi)).some((m) => Number(m[1]) < Number(window.from.slice(0, 2)));
          if (sunday || early)
            return {
              index,
              status: "not_allowed",
              message: {
                en: `${window.zone} accepts ${window.days} ${window.from}–${window.to} only (${window.gate}).`,
                ar: `يقبل ${window.zone} التسليم ${window.days} من ${window.from} إلى ${window.to} فقط.`,
              },
            };
          return { index, status: "info", message: { en: `Site window ${window.days} ${window.from}–${window.to}.`, ar: `نافذة الموقع ${window.days} ${window.from}–${window.to}.` } };
        }
        if (c.topic === "retention")
          return {
            index,
            status: "needs_approval",
            approver: "Fadi Khoury — Sales Director + Group CFO",
            message: { en: "Retention is not in the frame agreement — needs a signed amendment.", ar: "المحتجزات غير واردة في الاتفاقية — تحتاج تعديلاً موقعاً." },
          };
        if (c.topic === "validity")
          return {
            index,
            status: "needs_approval",
            approver: "Fadi Khoury — Sales Director",
            message: {
              en: `Prices beyond ${contract?.validTo ?? "the agreement year"} or fixed for the project need a contract amendment.`,
              ar: `الأسعار بعد ${contract?.validTo ?? "سنة الاتفاقية"} أو الثابتة طوال المشروع تحتاج تعديلاً للعقد.`,
            },
          };
        return { index, status: "info", message: { en: "Noted for the account record.", ar: "سُجّل في ملف الحساب." } };
      });
      emit.data("checks", checks);
      const flagged = checks.filter((c) => c.status === "needs_approval" || c.status === "not_allowed").length;
      s2.done(ar ? `${flagged} طلبات تحتاج اعتماداً أو غير مسموحة` : `${flagged} requests need approval or are not allowed`);

      const s3 = emit.step("propose", ar ? "اقتراح تحديث سجل الفرصة" : "Proposing the CRM update");
      const result: IngestResult = {
        ...object,
        proposedCrm: {
          ...object.proposedCrm,
          nextStepDate:
            object.proposedCrm.nextStepDate && /^\d{4}-\d{2}-\d{2}$/.test(object.proposedCrm.nextStepDate) && object.proposedCrm.nextStepDate >= data.today
              ? object.proposedCrm.nextStepDate
              : addDays(data.today, 1),
          probability: object.proposedCrm.probability == null ? null : Math.max(0, Math.min(100, Math.round(object.proposedCrm.probability))),
        },
      };
      emit.data("ingest", result);
      s3.done(`${result.proposedCrm.nextStep} · ${result.proposedCrm.nextStepDate}`);
      addAudit({
        solution: SLUG,
        actor: { name: "NARVO Agent", role: "AI agent", kind: "agent" },
        action: "Customer message interpreted",
        subject: `${opp.id} — ${object.sender}`,
        detail: `${object.requestedChanges.length} requested changes; ${flagged} need approval`,
        model,
      });
    },
    { modelKey },
  );
}
