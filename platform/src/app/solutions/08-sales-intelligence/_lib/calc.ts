/**
 * Deterministic computations for 08 — Sales Intelligence & Execution.
 * Everything numeric (days in stage, stalls, price conflicts, credit exposure, KPIs, draft guardrails)
 * is computed here — the model only explains, recommends and drafts.
 * Pure module: safe for client and server.
 */
import type {
  Account,
  Bi,
  Contract,
  CreditPolicy,
  CustomerDoc,
  GuardrailFlag,
  Interaction,
  Opportunity,
  Product,
  Quote,
  SalesData,
  SiteWindow,
  Stage,
} from "./types";
import { OPEN_STAGES } from "./types";


/* ───────────────────────── Dates ───────────────────────── */

export function dayDiff(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

export function addDays(date: string, days: number): string {
  const d = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Arabic day count with correct number agreement: 1 يوم واحد, 2 يومان, 3–10 أيام, 11+ يوماً. */
export function arDays(n: number) {
  const a = Math.abs(n);
  if (a === 1) return "يوم واحد";
  if (a === 2) return "يومان";
  if (a >= 3 && a <= 10) return `${a} أيام`;
  return `${a} يوماً`;
}

/* ───────────────────────── Pipeline health ───────────────────────── */

/** Days an opportunity may sit in a stage before it is considered stalled. */
export const STALL_THRESHOLDS: Record<string, number> = { Qualification: 21, Proposal: 14, Negotiation: 14 };

export const isOpen = (o: Opportunity) => OPEN_STAGES.includes(o.stage);

export const isCustomerFacing = (i: Interaction) => i.direction !== "internal" && i.type !== "note";

export interface OppHealth {
  open: boolean;
  daysInStage: number;
  threshold: number;
  overThreshold: boolean;
  lastTouch: Interaction | null;
  daysSinceTouch: number | null;
  nextStepOverdue: boolean;
  nextStepInDays: number | null;
  stalled: boolean;
  reasons: Bi[];
}

export function oppHealth(opp: Opportunity, interactions: Interaction[], today: string): OppHealth {
  const open = isOpen(opp);
  const daysInStage = dayDiff(opp.stageEnteredAt, today);
  const threshold = STALL_THRESHOLDS[opp.stage] ?? 999;
  const touches = interactions
    .filter((i) => i.opportunityId === opp.id && isCustomerFacing(i))
    .sort((a, b) => b.at.localeCompare(a.at));
  const lastTouch = touches[0] ?? null;
  const daysSinceTouch = lastTouch ? dayDiff(lastTouch.at.slice(0, 10), today) : null;
  const nextStepInDays = opp.nextStepDate ? dayDiff(today, opp.nextStepDate) : null;
  const nextStepOverdue = open && (nextStepInDays == null || nextStepInDays < 0);
  const overThreshold = open && daysInStage > threshold;
  const stalled = overThreshold && (nextStepOverdue || (daysSinceTouch ?? 99) > 7);
  const reasons: Bi[] = [];
  if (overThreshold)
    reasons.push({
      en: `${daysInStage} days in ${opp.stage} (threshold ${threshold})`,
      ar: `${arDays(daysInStage)} في مرحلة ${STAGE_AR[opp.stage]} (الحد ${threshold})`,
    });
  if (nextStepOverdue && nextStepInDays != null)
    reasons.push({ en: `Next step overdue by ${-nextStepInDays} days`, ar: `الخطوة التالية متأخرة ${arDays(-nextStepInDays)}` });
  if (nextStepOverdue && nextStepInDays == null) reasons.push({ en: "No next step scheduled", ar: "لا توجد خطوة تالية مجدولة" });
  if (open && (daysSinceTouch ?? 99) > 7)
    reasons.push({
      en: daysSinceTouch == null ? "No customer contact logged" : `No customer contact for ${daysSinceTouch} days`,
      ar: daysSinceTouch == null ? "لا يوجد تواصل مسجل مع المتعامل" : `لا تواصل مع المتعامل منذ ${arDays(daysSinceTouch)}`,
    });
  return { open, daysInStage, threshold, overThreshold, lastTouch, daysSinceTouch, nextStepOverdue, nextStepInDays, stalled, reasons };
}

export const STAGE_AR: Record<string, string> = {
  Qualification: "التأهيل",
  Proposal: "العرض",
  Negotiation: "التفاوض",
  "Closed Won": "مغلقة — فوز",
  "Closed Lost": "مغلقة — خسارة",
};

/* ───────────────────────── Credit ───────────────────────── */

export interface CreditScenario {
  termsDays: number;
  peakAdditional: number;
  projected: number;
  pctOfLimit: number;
}

export interface CreditView {
  limit: number;
  ar: number;
  overdue30: number;
  openOrders: number;
  exposure: number;
  utilisationPct: number;
  overBy: number;
  awardInclVat: number;
  months: number;
  monthlyBilling: number;
  awardPctOfLimit: number;
  requiresLimitReview: boolean;
  scenarios: CreditScenario[];
}

export function creditView(account: Account, awardExVat: number, months: number, termsList: number[], vat = 0.05): CreditView {
  const exposure = account.arOutstanding + account.openOrdersInclVat;
  const awardInclVat = round2(awardExVat * (1 + vat));
  const monthlyBilling = months > 0 ? awardInclVat / months : awardInclVat;
  const scenarios = Array.from(new Set(termsList))
    .sort((a, b) => a - b)
    .map((termsDays) => {
      const peakAdditional = Math.round(Math.min(awardInclVat, monthlyBilling * (termsDays / 30)));
      const projected = exposure + peakAdditional;
      return { termsDays, peakAdditional, projected, pctOfLimit: round2((projected / account.creditLimit) * 100) };
    });
  return {
    limit: account.creditLimit,
    ar: account.arOutstanding,
    overdue30: account.overdue30,
    openOrders: account.openOrdersInclVat,
    exposure,
    utilisationPct: round2((exposure / account.creditLimit) * 100),
    overBy: Math.max(0, exposure - account.creditLimit),
    awardInclVat,
    months,
    monthlyBilling: Math.round(monthlyBilling),
    awardPctOfLimit: round2((awardExVat / account.creditLimit) * 100),
    requiresLimitReview: awardExVat > account.creditLimit * 0.5,
    scenarios,
  };
}

/* ───────────────────────── Conflict detection ───────────────────────── */

export type Severity = "high" | "medium" | "low";
export type Dimension = "price" | "payment" | "validity" | "price_basis" | "delivery" | "retention" | "credit" | "commitment";

export interface LineCompare {
  sku: string;
  name: string;
  nameAr: string;
  unit: string;
  qty: number;
  quotePrice: number | null;
  docPrice: number | null;
  contractPrice: number | null;
  listPrice: number;
  stdCost: number;
  floorPrice: number;
  quoteVsContract: number | null;
  docVsContract: number | null;
  docVsContractPct: number | null;
  impactAed: number;
  marginDocPct: number | null;
  marginContractPct: number | null;
}

export interface ConflictItem {
  id: string;
  dimension: Dimension;
  title: Bi;
  quote: string | null;
  customer: string | null;
  reference: string | null;
  referenceLabel: Bi;
  detail: Bi;
  impactAed: number | null;
  severity: Severity;
  approver: string | null;
  rule: string;
  sku?: string;
}

export interface ConflictReport {
  available: boolean;
  reason?: Bi;
  quote: Quote | null;
  doc: CustomerDoc | null;
  contract: Contract | null;
  lines: LineCompare[];
  conflicts: ConflictItem[];
  totals: { quote: number | null; doc: number | null; contract: number | null; docVsContract: number | null; quoteVsContract: number | null };
  credit: CreditView | null;
  window: SiteWindow | null;
  tierMaxTerms: number;
}

const fmt = (n: number, dp = 0) => n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
const money = (n: number) => (Number.isInteger(n) ? fmt(n) : fmt(n, 2));
const lineTotal = (lines: { qty: number; unitPrice: number }[]) => round2(lines.reduce((a, l) => a + l.qty * l.unitPrice, 0));

export function findWindow(windows: SiteWindow[], zone: string): SiteWindow | null {
  return windows.find((w) => w.zone === zone) ?? null;
}

const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function dayRange(spec: string | undefined): string[] {
  if (!spec) return [];
  const m = spec.match(/(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s*[–-]\s*(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/);
  if (!m) return DAY_ORDER.filter((d) => spec.includes(d));
  const a = DAY_ORDER.indexOf(m[1]);
  const b = DAY_ORDER.indexOf(m[2]);
  return DAY_ORDER.slice(a, b + 1);
}

export function detectConflicts(data: SalesData, opp: Opportunity): ConflictReport {
  const quote = data.quotes.find((q) => q.id === opp.quoteId) ?? null;
  const doc = data.customerDocs.find((d) => d.id === opp.customerDocId) ?? null;
  const account = data.accounts.find((a) => a.id === opp.accountId)!;
  const contract = data.contracts.find((c) => c.customerId === opp.accountId) ?? null;
  const window = findWindow(data.siteWindows, opp.zone);
  const tierMaxTerms = data.creditPolicy.tiers[account.tier].maxTermsDays;
  const empty: ConflictReport = {
    available: false,
    quote,
    doc,
    contract,
    lines: [],
    conflicts: [],
    totals: { quote: null, doc: null, contract: null, docVsContract: null, quoteVsContract: null },
    credit: null,
    window,
    tierMaxTerms,
  };
  if (!quote && !doc) {
    return { ...empty, reason: { en: "No quotation or customer document on this opportunity yet.", ar: "لا يوجد عرض سعر أو مستند من المتعامل لهذه الفرصة بعد." } };
  }

  const products = new Map(data.products.map((p) => [p.sku, p] as const));
  const skus = Array.from(new Set([...(quote?.lines ?? []), ...(doc?.lines ?? [])].map((l) => l.sku)));
  const lines: LineCompare[] = skus.map((sku) => {
    const p = products.get(sku) as Product;
    const ql = quote?.lines.find((l) => l.sku === sku);
    const dl = doc?.lines.find((l) => l.sku === sku);
    const qty = dl?.qty ?? ql?.qty ?? 0;
    const contractPrice = contract?.rates[sku] ?? null;
    const docPrice = dl?.unitPrice ?? null;
    const quotePrice = ql?.unitPrice ?? null;
    const floorPrice = round2(p.stdCost * 1.04);
    const docVsContract = docPrice != null && contractPrice != null ? round2(docPrice - contractPrice) : null;
    return {
      sku,
      name: p.name,
      nameAr: p.nameAr,
      unit: p.unit,
      qty,
      quotePrice,
      docPrice,
      contractPrice,
      listPrice: p.listPrice,
      stdCost: p.stdCost,
      floorPrice,
      quoteVsContract: quotePrice != null && contractPrice != null ? round2(quotePrice - contractPrice) : null,
      docVsContract,
      docVsContractPct: docVsContract != null && contractPrice ? round2((docVsContract / contractPrice) * 100) : null,
      impactAed: docVsContract != null ? round2(docVsContract * qty) : 0,
      marginDocPct: docPrice != null ? round2(((docPrice - p.stdCost) / docPrice) * 100) : null,
      marginContractPct: contractPrice != null ? round2(((contractPrice - p.stdCost) / contractPrice) * 100) : null,
    };
  });

  const conflicts: ConflictItem[] = [];
  const fa = contract?.id ?? "list price";

  // 1 — line prices
  for (const l of lines) {
    const docBelow = l.docVsContract != null && l.docVsContract < 0;
    const quoteAbove = l.quoteVsContract != null && l.quoteVsContract > 0;
    if (!docBelow && !quoteAbove) continue;
    const belowFloor = l.docPrice != null && l.docPrice < l.floorPrice;
    const parts: Bi[] = [];
    if (docBelow)
      parts.push({
        en: `Customer price ${money(l.docPrice!)} is ${money(-l.docVsContract!)} below the frame rate (${Math.abs(l.docVsContractPct!)}%) — AED ${fmt(-l.impactAed)} on ${fmt(l.qty)} ${l.unit}.`,
        ar: `سعر المتعامل ${money(l.docPrice!)} أقل من سعر الاتفاقية بمقدار ${money(-l.docVsContract!)} (${Math.abs(l.docVsContractPct!)}%) — ${fmt(-l.impactAed)} درهم على ${fmt(l.qty)} ${l.unit}.`,
      });
    if (quoteAbove)
      parts.push({
        en: `Our quote (${money(l.quotePrice!)}) exceeded the frame rate by ${money(l.quoteVsContract!)} — frame agreements do not allow project quotes above frame rates without written acceptance.`,
        ar: `عرضنا (${money(l.quotePrice!)}) تجاوز سعر الاتفاقية بمقدار ${money(l.quoteVsContract!)} — لا تسمح اتفاقيات الإطار بعروض مشاريع أعلى من أسعارها دون قبول خطي.`,
      });
    if (belowFloor)
      parts.push({ en: `Below standard cost + 4% (${money(l.floorPrice)}).`, ar: `أقل من التكلفة المعيارية + 4% (${money(l.floorPrice)}).` });
    conflicts.push({
      id: `price-${l.sku}`,
      dimension: "price",
      sku: l.sku,
      title: { en: `${l.sku} unit price`, ar: `سعر الوحدة ${l.sku}` },
      quote: l.quotePrice != null ? money(l.quotePrice) : null,
      customer: l.docPrice != null ? money(l.docPrice) : null,
      reference: l.contractPrice != null ? money(l.contractPrice) : null,
      referenceLabel: { en: `${fa} Q4 rate`, ar: `سعر ${fa} للربع الرابع` },
      detail: { en: parts.map((p) => p.en).join(" "), ar: parts.map((p) => p.ar).join(" ") },
      impactAed: docBelow ? -l.impactAed : null,
      severity: docBelow && Math.abs(l.docVsContractPct ?? 0) > 1 ? "high" : "medium",
      approver: docBelow ? (belowFloor ? "Tariq Nasser — General Manager, RBM" : "Fadi Khoury — Sales Director") : null,
      rule: `${fa} general rules 2–3`,
    });
  }

  // 2 — payment terms
  if (doc && (doc.paymentDays > tierMaxTerms || doc.paymentBasis !== "invoice")) {
    conflicts.push({
      id: "payment",
      dimension: "payment",
      title: { en: "Payment terms", ar: "شروط السداد" },
      quote: quote ? `${quote.paymentDays} d / ${quote.paymentBasis}` : null,
      customer: `${doc.paymentDays} d / ${doc.paymentBasis}`,
      reference: `${contract?.paymentTermsDays ?? tierMaxTerms} d / invoice · tier ${account.tier} max ${tierMaxTerms} d`,
      referenceLabel: { en: "Frame agreement & credit policy", ar: "الاتفاقية وسياسة الائتمان" },
      detail: {
        en: `Customer asks ${doc.paymentDays} days from ${doc.paymentBasis} date; tier ${account.tier} maximum is ${tierMaxTerms} days from invoice. Counting from delivery adds roughly the invoicing lag on top.`,
        ar: `يطلب المتعامل ${doc.paymentDays} يوماً من تاريخ ${doc.paymentBasis === "delivery" ? "التسليم" : "الفاتورة"}، بينما الحد الأقصى للفئة ${account.tier} هو ${tierMaxTerms} يوماً من تاريخ الفاتورة.`,
      },
      impactAed: null,
      severity: doc.paymentDays > tierMaxTerms ? "high" : "medium",
      approver: doc.paymentDays > tierMaxTerms ? "Priya Raghavan — Group CFO (with credit insurance / bank guarantee)" : "Fadi Khoury — Sales Director",
      rule: `${data.creditPolicy.ref} — payment terms`,
    });
  }

  // 3 — validity
  if (quote && quote.validUntil < data.today) {
    const ago = dayDiff(quote.validUntil, data.today);
    conflicts.push({
      id: "validity",
      dimension: "validity",
      title: { en: "Quotation validity", ar: "صلاحية العرض" },
      quote: `valid to ${quote.validUntil}`,
      customer: doc ? `PO dated ${doc.issuedAt} refers to ${doc.referenceQuote ?? quote.id}` : null,
      reference: `today ${data.today}`,
      referenceLabel: { en: "Status", ar: "الحالة" },
      detail: {
        en: `${quote.id} expired ${ago} days ago${doc ? `; the customer's document was issued ${dayDiff(quote.validUntil, doc.issuedAt)} days after expiry` : ""}. Steel prices in an expired quote are not binding — a fresh offer is needed.`,
        ar: `انتهت صلاحية ${quote.id} منذ ${arDays(ago)}${doc ? `، وصدر مستند المتعامل بعد ${dayDiff(quote.validUntil, doc.issuedAt)} أيام من انتهائها` : ""}. أسعار الحديد في عرض منتهٍ غير ملزمة — يلزم عرض جديد.`,
      },
      impactAed: null,
      severity: "medium",
      approver: null,
      rule: "PL-2026-Q4 commercial conditions — 30-day validity",
    });
  }

  // 4 — price basis (fixed price beyond contract year)
  if (doc?.fixedPriceUntil && contract && doc.fixedPriceUntil > contract.validTo) {
    const steelT = lines.filter((l) => l.sku.startsWith("RB-")).reduce((a, l) => a + l.qty, 0);
    conflicts.push({
      id: "price_basis",
      dimension: "price_basis",
      title: { en: "Price basis / escalation", ar: "أساس التسعير / التصعيد" },
      quote: quote?.fixedPriceUntil ? `fixed to ${quote.fixedPriceUntil}` : "steel indexed after validity",
      customer: `fixed to ${doc.fixedPriceUntil}`,
      reference: "rebar indexed quarterly; FA ends " + contract.validTo,
      referenceLabel: { en: "Frame agreement", ar: "اتفاقية الإطار" },
      detail: {
        en: `Customer wants all prices fixed until ${doc.fixedPriceUntil} — ${fmt(steelT)} t of rebar would carry mill-price risk for ${dayDiff(contract.validTo, doc.fixedPriceUntil)} days beyond the frame agreement, which indexes rebar quarterly.`,
        ar: `يريد المتعامل تثبيت جميع الأسعار حتى ${doc.fixedPriceUntil} — أي ${fmt(steelT)} طن من الحديد معرضة لمخاطر سعر المصنع لمدة ${dayDiff(contract.validTo, doc.fixedPriceUntil)} يوماً بعد انتهاء الاتفاقية التي تربط سعر الحديد بمؤشر ربع سنوي.`,
      },
      impactAed: null,
      severity: "high",
      approver: "Fadi Khoury — Sales Director (contract amendment)",
      rule: `${contract.id} general rule 5`,
    });
  }

  // 5 — delivery window
  if (doc && window) {
    const asked = dayRange(doc.deliveryDays);
    const allowed = dayRange(window.days);
    const extraDays = asked.filter((d) => !allowed.includes(d));
    const early = doc.deliveryFrom && doc.deliveryFrom < window.from;
    const late = doc.deliveryTo && doc.deliveryTo > window.to;
    if (extraDays.length || early || late) {
      conflicts.push({
        id: "delivery",
        dimension: "delivery",
        title: { en: "Delivery window", ar: "نافذة التسليم" },
        quote: quote ? `${window.days} ${window.from}–${window.to}` : null,
        customer: `${doc.deliveryDays} ${doc.deliveryFrom}–${doc.deliveryTo}`,
        reference: `${window.zone}: ${window.days} ${window.from}–${window.to}`,
        referenceLabel: { en: "Site-access rule", ar: "قاعدة دخول الموقع" },
        detail: {
          en: `${window.zone} accepts deliveries ${window.days} ${window.from}–${window.to} only (${window.gate}). The PO asks for ${[extraDays.length ? extraDays.join("/") : "", early ? `from ${doc.deliveryFrom}` : "", late ? `until ${doc.deliveryTo}` : ""].filter(Boolean).join(", ")} — not something RBM can agree to.`,
          ar: `يقبل ${window.zone} التسليم ${window.days} من ${window.from} إلى ${window.to} فقط. يطلب أمر الشراء ${[extraDays.length ? "أيام " + extraDays.join("/") : "", early ? `البدء من ${doc.deliveryFrom}` : "", late ? `حتى ${doc.deliveryTo}` : ""].filter(Boolean).join("، ")} — وهذا خارج صلاحية رصين.`,
        },
        impactAed: null,
        severity: "high",
        approver: null,
        rule: "RBM-OPS-POL-11 — site windows (non-negotiable gate rule)",
      });
    }
  }

  // 6 — retention
  if (doc && doc.retentionPct > 0) {
    const docTotal = lineTotal(doc.lines);
    const retained = round2(docTotal * (1 + data.vatRate) * (doc.retentionPct / 100));
    conflicts.push({
      id: "retention",
      dimension: "retention",
      title: { en: "Retention", ar: "المحتجزات" },
      quote: quote ? `${quote.retentionPct}%` : null,
      customer: `${doc.retentionPct}% to handover`,
      reference: contract?.retention ?? "none",
      referenceLabel: { en: "Frame agreement", ar: "اتفاقية الإطار" },
      detail: {
        en: `${doc.retentionPct}% retention would hold back about AED ${fmt(retained)} (incl. VAT) until Tower B practical completion — not part of the frame agreement and it adds to credit exposure.`,
        ar: `المحتجزات بنسبة ${doc.retentionPct}% تعني حجز نحو ${fmt(retained)} درهم (شاملة الضريبة) حتى الإنجاز العملي للمشروع — وهي غير واردة في الاتفاقية وتزيد التعرض الائتماني.`,
      },
      impactAed: retained,
      severity: "high",
      approver: "Fadi Khoury — Sales Director + Priya Raghavan — Group CFO",
      rule: `${contract?.id ?? "Frame agreement"} general rule 5`,
    });
  }

  // 7 — credit
  const contractTotal = contract ? round2(lines.reduce((a, l) => a + l.qty * (l.contractPrice ?? l.docPrice ?? l.quotePrice ?? 0), 0)) : null;
  const awardBase = contractTotal ?? (doc ? lineTotal(doc.lines) : quote ? lineTotal(quote.lines) : 0);
  const months = opp.deliveryMonths ?? 3;
  const credit = creditView(account, awardBase, months, [tierMaxTerms, quote?.paymentDays ?? tierMaxTerms, doc?.paymentDays ?? tierMaxTerms], data.vatRate);
  if (credit.exposure > credit.limit || credit.requiresLimitReview) {
    const worst = credit.scenarios[credit.scenarios.length - 1];
    conflicts.push({
      id: "credit",
      dimension: "credit",
      title: { en: "Credit exposure", ar: "التعرض الائتماني" },
      quote: null,
      customer: `projected AED ${fmt(worst.projected)} at ${worst.termsDays} d`,
      reference: `limit AED ${fmt(credit.limit)} · now AED ${fmt(credit.exposure)}`,
      referenceLabel: { en: "Credit file", ar: "الملف الائتماني" },
      detail: {
        en: `Exposure today AED ${fmt(credit.exposure)} = ${credit.utilisationPct}% of the AED ${fmt(credit.limit)} limit${credit.overBy ? ` (over by AED ${fmt(credit.overBy)})` : ""}. ${credit.requiresLimitReview ? `This award is ${credit.awardPctOfLimit}% of the limit → limit review required before accepting a PO. ` : ""}Projected peak: ${credit.scenarios.map((s) => `AED ${fmt(s.projected)} at ${s.termsDays} d`).join(" · ")}.`,
        ar: `التعرض الحالي ${fmt(credit.exposure)} درهم = ${credit.utilisationPct}% من الحد البالغ ${fmt(credit.limit)} درهم${credit.overBy ? ` (تجاوز بمقدار ${fmt(credit.overBy)} درهم)` : ""}. ${credit.requiresLimitReview ? `هذه الصفقة تمثل ${credit.awardPctOfLimit}% من الحد ← يلزم مراجعة الحد قبل قبول أمر الشراء. ` : ""}الذروة المتوقعة: ${credit.scenarios.map((s) => `${fmt(s.projected)} درهم عند ${s.termsDays} يوماً`).join(" · ")}.`,
      },
      impactAed: credit.overBy || null,
      severity:
        credit.exposure > credit.limit
          ? "high"
          : (credit.scenarios.find((s) => s.termsDays === tierMaxTerms)?.projected ?? 0) > credit.limit
            ? "medium"
            : "low",
      approver: "Priya Raghavan — Group CFO (temporary release / limit review)",
      rule: `${data.creditPolicy.ref} — exposure & limit review`,
    });
  }

  // 8 — claimed verbal commitment
  if (doc?.commitmentClaim) {
    conflicts.push({
      id: "commitment",
      dimension: "commitment",
      title: { en: "Claimed commitment", ar: "التزام مُدّعى" },
      quote: null,
      customer: doc.commitmentClaim,
      reference: "No written approval on file",
      referenceLabel: { en: "CRM record", ar: "سجل إدارة العملاء" },
      detail: {
        en: "The customer's document states prices were agreed verbally. No approved price concession exists in the CRM — verify against the meeting notes and the Sales Director's instruction before replying.",
        ar: "يذكر مستند المتعامل أن الأسعار اتُّفق عليها شفهياً، ولا يوجد في السجل أي تنازل سعري معتمد — يجب التحقق من محضر الاجتماع وتوجيه مدير المبيعات قبل الرد.",
      },
      impactAed: null,
      severity: "medium",
      approver: "Fadi Khoury — Sales Director",
      rule: "Sales authority matrix",
    });
  }

  const quoteTotal = quote ? lineTotal(quote.lines) : null;
  const docTotal = doc ? lineTotal(doc.lines) : null;
  return {
    available: true,
    quote,
    doc,
    contract,
    lines,
    conflicts,
    totals: {
      quote: quoteTotal,
      doc: docTotal,
      contract: contractTotal,
      docVsContract: docTotal != null && contractTotal != null ? round2(docTotal - contractTotal) : null,
      quoteVsContract: quoteTotal != null && contractTotal != null ? round2(quoteTotal - contractTotal) : null,
    },
    credit,
    window,
    tierMaxTerms,
  };
}

/* ───────────────────────── KPIs ───────────────────────── */

export interface PipelineKpis {
  openCount: number;
  openValue: number;
  weightedValue: number;
  stalledCount: number;
  stalledValue: number;
  conflictCount: number;
  conflictOpps: number;
  belowFrameAed: number;
  currentCount: number;
  currentPct: number;
  loggedViaNarvo: number;
}

export function pipelineKpis(data: SalesData): PipelineKpis {
  const open = data.opportunities.filter(isOpen);
  let stalledCount = 0;
  let stalledValue = 0;
  let conflictCount = 0;
  let conflictOpps = 0;
  let belowFrameAed = 0;
  let currentCount = 0;
  for (const o of open) {
    const h = oppHealth(o, data.interactions, data.today);
    if (h.stalled) {
      stalledCount++;
      stalledValue += o.value;
    }
    if (h.nextStepInDays != null && h.nextStepInDays >= 0) currentCount++;
    const r = detectConflicts(data, o);
    const n = r.conflicts.filter((c) => c.severity !== "low").length;
    if (n) {
      conflictCount += n;
      conflictOpps++;
    }
    belowFrameAed += r.conflicts.filter((c) => c.dimension === "price").reduce((a, c) => a + (c.impactAed ?? 0), 0);
  }
  return {
    openCount: open.length,
    openValue: open.reduce((a, o) => a + o.value, 0),
    weightedValue: Math.round(open.reduce((a, o) => a + (o.value * o.probability) / 100, 0)),
    stalledCount,
    stalledValue,
    conflictCount,
    conflictOpps,
    belowFrameAed: round2(belowFrameAed),
    currentCount,
    currentPct: open.length ? Math.round((currentCount / open.length) * 100) : 0,
    loggedViaNarvo: data.interactions.filter((i) => i.loggedVia === "NARVO").length,
  };
}

/* ───────────────────────── Draft guardrails ───────────────────────── */

/**
 * Check a follow-up draft before it goes to approval: does it offer prices below the frame rate,
 * terms beyond the credit tier, retention, fixed prices beyond the contract year or out-of-window deliveries?
 */
export function checkDraft(text: string, report: ConflictReport | null, tierMaxTerms: number): GuardrailFlag[] {
  const flags: GuardrailFlag[] = [];
  const t = text.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  // Drop phone numbers and times before looking for prices.
  const clean = t.replace(/\+?\d[\d\s-]{7,}\d/g, " ").replace(/(^|[^\d,.])\d{1,2}:\d{2}(?!\d)/g, "$1 ");
  const numbers = Array.from(clean.matchAll(/(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g))
    .filter((m) => {
      const i = m.index ?? 0;
      const before = clean.slice(Math.max(0, i - 14), i);
      const after = clean.slice(i + m[0].length, i + m[0].length + 12);
      return m[0].includes(",") || /AED|درهم|@/i.test(before) || /^\s*(\/\s*t(?![a-z])|per\s+t|\/\s*طن|للطن|درهم|AED)/i.test(after);
    })
    .map((m) => ({ raw: m[0], v: Number(m[0].replace(/,/g, "")) }));
  if (report?.lines.length) {
    const steel = report.lines.filter((l) => l.contractPrice != null && l.contractPrice > 1000);
    const minFrame = Math.min(...steel.map((l) => l.contractPrice!));
    for (const n of numbers) {
      if (n.v < 1500 || n.v > 4000 || !steel.length) continue;
      if (n.v >= 2020 && n.v <= 2035 && !n.raw.includes(",")) continue; // a year, not a price
      const exact = steel.find((l) => l.contractPrice === n.v);
      if (exact) continue;
      if (n.v < minFrame) {
        flags.push({
          id: `price-${n.v}`,
          severity: "high",
          match: n.raw,
          message: {
            en: `Mentions AED ${n.raw} — below every frame rate on this deal (lowest ${minFrame.toLocaleString("en-US")}). Needs Sales Director approval.`,
            ar: `يذكر ${n.raw} درهم — أقل من جميع أسعار الاتفاقية في هذه الصفقة (أدناها ${minFrame.toLocaleString("en-US")}). يتطلب موافقة مدير المبيعات.`,
          },
        });
      }
    }
  }
  for (const m of t.matchAll(/(\d{2,3})\s*(?:-|\s)?(days?|يوم|يوماً|يوما)/gi)) {
    const d = Number(m[1]);
    if (d > tierMaxTerms && d <= 180)
      flags.push({
        id: `terms-${d}`,
        severity: "high",
        match: m[0],
        message: {
          en: `Mentions ${d}-day terms — above the ${tierMaxTerms}-day tier maximum; only the Group CFO can grant this.`,
          ar: `يذكر شروط سداد ${d} يوماً — أعلى من الحد الأقصى للفئة (${tierMaxTerms} يوماً)، ولا يمنحها إلا المدير المالي للمجموعة.`,
        },
      });
  }
  const checks: Array<[RegExp, Bi, string]> = [
    [/retention|محتجز/i, { en: "Mentions retention — not in the frame agreement; make sure the draft does not accept it.", ar: "يذكر المحتجزات — غير واردة في الاتفاقية؛ تأكد أن المسودة لا تقبلها." }, "retention"],
    [/\b(sunday|sundays)\b|الأحد/i, { en: "Mentions Sunday — gated communities accept no Sunday deliveries.", ar: "يذكر يوم الأحد — لا تسليم أيام الأحد في المجتمعات المسوّرة." }, "sunday"],
    [/(june|jun)\s*2027|يونيو\s*2027|2027/i, { en: "Mentions 2027 — check no price is fixed beyond the frame agreement (31 Dec 2026).", ar: "يذكر 2027 — تأكد من عدم تثبيت أي سعر بعد انتهاء الاتفاقية (31 ديسمبر 2026)." }, "fixed"],
    [/\b0?7[:.]00\b/, { en: "Mentions 07:00 — Marina Quarter gate opens at 09:00.", ar: "يذكر الساعة 07:00 — بوابة حي المارينا تفتح الساعة 09:00." }, "early"],
  ];
  for (const [re, message, id] of checks) {
    const m = t.match(re);
    if (m) flags.push({ id, severity: "check", match: m[0], message });
  }
  const seen = new Set<string>();
  return flags.filter((f) => (seen.has(f.id) ? false : (seen.add(f.id), true)));
}

/* ───────────────────────── Misc ───────────────────────── */

export function initials(name: string) {
  return name
    .replace(/^(Eng\.|Dr\.|Captain)\s+/i, "")
    .split(" ")
    .filter((p) => !/^(al|bin|el)$/i.test(p))
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export function compactAed(n: number) {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(Math.round(n));
}

export function stageOf(s: string): Stage {
  return (["Qualification", "Proposal", "Negotiation", "Closed Won", "Closed Lost"].includes(s) ? s : "Negotiation") as Stage;
}
