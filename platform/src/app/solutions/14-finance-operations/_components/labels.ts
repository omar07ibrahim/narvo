import type { Tone } from "@/components/narvo/status";
import type { ScenarioStep } from "@/components/narvo/solution-page";
import type { Bi, CheckId, Invoice, InvoiceStatus, MatchResult } from "../_lib/types";

export const SLUG = "14-finance-operations";
export const API = `/api/solutions/${SLUG}`;

export const SUPPLIER_SHORT: Record<string, Bi> = {
  "SUP-NEC": { en: "Northern Emirates Cement", ar: "إسمنت الإمارات الشمالية" },
  "SUP-SRM": { en: "Sahara Rebar Mills", ar: "مصانع صحارى للحديد" },
  "SUP-ACT": { en: "Andalus Ceramics", ar: "الأندلس للسيراميك" },
  "SUP-GBP": { en: "Gulf Bitumen Products", ar: "منتجات الخليج للبيتومين" },
  "SUP-AWB": { en: "Al Waha Blocks", ar: "مصنع الواحة للطابوق" },
  "SUP-CCI": { en: "Coastal Coatings", ar: "الساحل للطلاءات" },
  "SUP-AKT": { en: "Al Khaleej Heavy Transport", ar: "الخليج للنقل الثقيل" },
  "SUP-FLL": { en: "Fast Lane Logistics", ar: "فاست لين اللوجستية" },
};

export const PRIMARY_LABEL: Record<CheckId, Bi> = {
  qty: { en: "Short receipt", ar: "نقص في الاستلام" },
  charges: { en: "Extra charge", ar: "رسوم إضافية" },
  duplicate: { en: "Duplicate", ar: "فاتورة مكررة" },
  vat: { en: "VAT error", ar: "خطأ ضريبي" },
  po: { en: "PO mismatch", ar: "خطأ في أمر الشراء" },
  price: { en: "Price variance", ar: "فرق سعر" },
  trn: { en: "Missing TRN", ar: "رقم ضريبي مفقود" },
  credit: { en: "Partial credit", ar: "إشعار دائن جزئي" },
  total: { en: "Arithmetic", ar: "خطأ حسابي" },
};

export const STATUS_LABEL: Record<Exclude<InvoiceStatus, "received">, Bi & { tone: Tone }> = {
  approved_for_payment: { en: "Approved", ar: "معتمدة للسداد", tone: "success" },
  short_paid: { en: "Short-paid", ar: "سداد جزئي", tone: "info" },
  rejected: { en: "Rejected", ar: "مرفوضة", tone: "neutral" },
  on_hold: { en: "On hold", ar: "معلّقة", tone: "warning" },
  credit_applied: { en: "Credit applied", ar: "إشعار مطبّق", tone: "info" },
};

export function statusOf(inv: Invoice, m: MatchResult | undefined, pendingApproval: boolean): { label: Bi; tone: Tone; pulse?: boolean } {
  if (inv.status !== "received") {
    const s = STATUS_LABEL[inv.status];
    return { label: s, tone: s.tone };
  }
  if (pendingApproval) return { label: { en: "In approval", ar: "قيد الاعتماد" }, tone: "ai", pulse: true };
  if (!m?.exception) return { label: { en: "Auto-matched", ar: "مطابقة آلية" }, tone: "success" };
  return { label: PRIMARY_LABEL[m.primary ?? "total"], tone: m.primary === "duplicate" || m.primary === "po" || m.primary === "trn" ? "danger" : "warning" };
}

export const CHANNEL_LABEL: Record<string, Bi> = {
  portal: { en: "Supplier portal", ar: "بوابة المورد" },
  email: { en: "Email (PDF)", ar: "بريد إلكتروني (PDF)" },
  courier: { en: "Courier (paper)", ar: "مندوب (ورقي)" },
  upload: { en: "Uploaded here", ar: "مرفوعة هنا" },
};

export const SCENARIO: ScenarioStep[] = [
  {
    title: { en: "The September batch at a glance", ar: "دفعة سبتمبر في لمحة" },
    body: {
      en: "46 supplier documents for September. 37 matched their PO and goods receipt automatically (80.4%); 9 are exceptions carrying AED 337,905.07 of variance — including one AED 291,060 invoice that quotes the wrong PO. Every figure is computed from the POs, GRNs and policy RG-FIN-POL-09.",
      ar: "46 مستنداً من الموردين لشهر سبتمبر. طابق 37 منها أمر الشراء وإشعار الاستلام آلياً (80.4%)، و9 استثناءات بفروق قدرها 337,905.07 درهم — منها فاتورة بقيمة 291,060 درهم تذكر أمر شراء خاطئاً. كل رقم محسوب من أوامر الشراء وإشعارات الاستلام والسياسة RG-FIN-POL-09.",
    },
  },
  {
    title: { en: "Open the Sahara rebar short receipt", ar: "افتح نقص استلام حديد صحارى" },
    body: {
      en: "Select SRM-26-1187. The three-way match puts invoice, PO and GRN side by side: 20.000 t invoiced, 18.000 t accepted on GRN-26-08452 (weighbridge JA-WB-26-11873) — a variance of AED 5,313.00 including VAT.",
      ar: "اختر SRM-26-1187. تعرض المطابقة الثلاثية الفاتورة وأمر الشراء وإشعار الاستلام جنباً إلى جنب: 20.000 طن مفوترة مقابل 18.000 طن مقبولة في GRN-26-08452 (تذكرة الميزان JA-WB-26-11873) — بفرق 5,313.00 درهم شاملاً الضريبة.",
    },
  },
  {
    title: { en: "Read the invoice image", ar: "اقرأ صورة الفاتورة" },
    body: {
      en: "Invoice image → Read with AI. The vision model transcribes the supplier's scan — header, lines, totals, TRN — with confidence per field, and every field is compared with the registered record.",
      ar: "صورة الفاتورة ← القراءة بالذكاء الاصطناعي. ينسخ نموذج الرؤية الفاتورة الممسوحة — الترويسة والبنود والإجماليات والرقم الضريبي — مع درجة ثقة لكل حقل، ويُقارن كل حقل بالسجل المسجّل.",
    },
  },
  {
    title: { en: "Build the resolution case", ar: "ابنِ ملف المعالجة" },
    body: {
      en: "Resolution → Build case. Code computes the short-pay (AED 47,817.00 now, AED 5,313.00 to suspense), the balanced journal and the approver; the model explains it with cited evidence and drafts the email to Sahara.",
      ar: "المعالجة ← بناء الملف. تحتسب الشيفرة السداد الجزئي (47,817.00 درهم الآن، و5,313.00 درهم إلى الحساب المعلّق) والقيد المتوازن والمعتمِد؛ ويشرح النموذج ذلك بأدلة موثقة ويصوغ رسالة إلى صحارى.",
    },
  },
  {
    title: { en: "Routed to the Group CFO — approve", ar: "موجّه إلى المدير المالي للمجموعة — اعتمد" },
    body: {
      en: "Invoice total AED 53,130.00 exceeds AED 50,000, so the authority matrix routes it to Priya Raghavan, Group CFO. Approve: the status becomes Short-paid, the journal is posted, the email is queued and the KPIs move.",
      ar: "إجمالي الفاتورة 53,130.00 درهم يتجاوز 50,000 درهم، فتوجّهها مصفوفة الصلاحيات إلى بريا راغافان، المدير المالي للمجموعة. عند الاعتماد تصبح الحالة «سداد جزئي» ويُرحَّل القيد وتُرسل الرسالة وتتحدث المؤشرات.",
    },
  },
  {
    title: { en: "A smaller case stays with AP", ar: "حالة أصغر تبقى لدى الحسابات الدائنة" },
    body: {
      en: "Open Fast Lane FLL-0087: VAT charged with no TRN printed. AED 6,027.00 is below the threshold, so Deepak Menon, AP Supervisor, approves the hold and the request for a valid tax invoice.",
      ar: "افتح فاتورة فاست لين FLL-0087: ضريبة محتسبة دون رقم ضريبي مطبوع. المبلغ 6,027.00 درهم دون الحد، فيعتمد ديباك مينون، مشرف الحسابات الدائنة، التعليق وطلب فاتورة ضريبية صحيحة.",
    },
  },
  {
    title: { en: "Bring your own invoice", ar: "أحضر فاتورتك" },
    body: {
      en: "Drop a photo or scan of any supplier invoice in the right rail. It is read, the supplier and PO are identified, the same checks run, and it joins the batch — ready for a resolution case if anything fails.",
      ar: "اسحب صورة أو مسحاً لأي فاتورة مورد في العمود الأيمن. تُقرأ، ويُحدَّد المورد وأمر الشراء، وتُجرى الفحوص نفسها، وتنضم إلى الدفعة — جاهزة لملف معالجة إن لم تطابق.",
    },
  },
];

/** Route errors arrive as JSON text ({"error": "..."}) — show the message only. */
export function errorText(e?: string) {
  if (!e) return "";
  try {
    const j = JSON.parse(e) as { error?: string };
    return j.error ?? e;
  } catch {
    return e;
  }
}
