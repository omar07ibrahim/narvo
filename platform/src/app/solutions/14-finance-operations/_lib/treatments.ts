/**
 * Treatment of a matched document under RG-FIN-POL-09: what to pay now, what to park in AP suspense,
 * what to recover from the supplier, the resulting status, the balanced journal and the approver.
 * Pure — the model explains this, it never computes it.
 */
import { fmt2, matchInvoice, r2, type MatchContext } from "./three-way";
import type { ApPolicy, Bi, Invoice, InvoiceStatus, JournalLine, MatchResult, PurchaseOrder, Treatment, TreatmentKind } from "./types";

export const TREATMENT_LABELS: Record<TreatmentKind, Bi> = {
  reject_duplicate: { en: "Reject duplicate", ar: "رفض الفاتورة المكررة" },
  correct_po_reference: { en: "Correct PO reference & re-match", ar: "تصحيح مرجع أمر الشراء وإعادة المطابقة" },
  hold_for_trn: { en: "Hold — request valid tax invoice / VAT certificate", ar: "تعليق — طلب فاتورة ضريبية صحيحة / شهادة تسجيل ضريبي" },
  request_corrected_invoice: { en: "Request corrected tax invoice", ar: "طلب فاتورة ضريبية مصححة" },
  short_pay: { en: "Short-pay to GRN & request credit note", ar: "سداد جزئي وفق الاستلام وطلب إشعار دائن" },
  pay_at_po_price: { en: "Pay at PO price & request credit note", ar: "السداد بسعر أمر الشراء وطلب إشعار دائن" },
  reject_line: { en: "Reject un-agreed line, pay balance", ar: "رفض البند غير المتفق عليه وسداد الباقي" },
  apply_credit_note: { en: "Apply credit note, pursue balance", ar: "تطبيق إشعار الدائن ومتابعة الرصيد" },
  approve: { en: "Approve for payment", ar: "اعتماد للسداد" },
};

export const ACCOUNT_NAMES: Record<string, Bi> = {
  "2100": { en: "AP control", ar: "حساب الدائنين الرئيسي" },
  "2110": { en: "GR/IR clearing", ar: "تسوية البضائع المستلمة/الفواتير" },
  "1410": { en: "Input VAT recoverable", ar: "ضريبة المدخلات القابلة للاسترداد" },
  "5120": { en: "Purchase price variance", ar: "فروقات أسعار الشراء" },
  "5130": { en: "Freight-in", ar: "مصاريف الشحن الوارد" },
  "2190": { en: "AP suspense", ar: "حساب الدائنين المعلّق" },
};

const TITLE_AR: Record<string, string> = {
  "AP Supervisor, Group Finance": "مشرف الحسابات الدائنة، المالية للمجموعة",
  "Group CFO": "المدير المالي للمجموعة",
};

export function routeApprover(policy: ApPolicy, amount: number) {
  const abs = Math.abs(amount);
  const sorted = [...policy.approvalMatrix].sort((a, b) => (a.upToAed ?? Infinity) - (b.upToAed ?? Infinity));
  const tier = sorted.find((t) => t.upToAed === null || abs <= t.upToAed) ?? sorted[sorted.length - 1];
  const lower = sorted.filter((t) => t.upToAed !== null && t.upToAed < (tier.upToAed ?? Infinity)).pop();
  const rule =
    tier.upToAed !== null
      ? `Invoice total AED ${fmt2(abs)} ≤ AED ${tier.upToAed.toLocaleString("en-US")} → ${tier.approver}, ${tier.title} (${policy.ref})`
      : `Invoice total AED ${fmt2(abs)} > AED ${(lower?.upToAed ?? 0).toLocaleString("en-US")} → ${tier.approver}, ${tier.title} (${policy.ref})`;
  const titleAr = TITLE_AR[tier.title] ?? tier.title;
  const ruleAr =
    tier.upToAed !== null
      ? `إجمالي الفاتورة ${fmt2(abs)} درهم ≤ ${tier.upToAed.toLocaleString("en-US")} درهم ← ${tier.approver}، ${titleAr} (${policy.ref})`
      : `إجمالي الفاتورة ${fmt2(abs)} درهم > ${(lower?.upToAed ?? 0).toLocaleString("en-US")} درهم ← ${tier.approver}، ${titleAr} (${policy.ref})`;
  return { name: tier.approver, title: tier.title, amount: abs, threshold: tier.upToAed ?? lower?.upToAed ?? null, rule, ruleAr };
}

function jl(account: string, debit: number, credit: number, memo: string): JournalLine {
  return { account, accountName: ACCOUNT_NAMES[account]?.en ?? account, debit: r2(debit), credit: r2(credit), memo };
}

export function computeTreatment(inv: Invoice, match: MatchResult, ctx: MatchContext): Treatment {
  const { policy, vatRate } = ctx;
  const A = policy.accounts;
  const total = Math.abs(inv.total);
  const approver = routeApprover(policy, inv.total);
  const failing = new Set(match.checks.filter((c) => c.status === "fail").map((c) => c.id));
  const base = {
    invoiceTotal: total,
    correctedVat: null,
    correctedPoRef: null,
    rejectedLines: [],
    shortQty: [],
    priceVar: [],
    creditBalance: null,
    approver,
  } satisfies Partial<Treatment>;

  /* Duplicate: nothing is booked, nothing is paid. */
  if (failing.has("duplicate")) {
    return {
      ...base,
      kind: "reject_duplicate",
      kinds: ["reject_duplicate"],
      payableNow: 0,
      toSuspense: 0,
      recover: 0,
      paymentAvoided: total,
      newStatus: "rejected",
      journal: { lines: [], memo: `No posting — duplicate of ${match.duplicateOf ?? "an earlier document"} blocked before booking`, balanced: true },
    };
  }

  /* Credit note: clear the suspense parked when the original was short-paid; pursue any balance. */
  if (inv.docType === "credit_note") {
    const lines = [
      jl(A.apControl, total, 0, `Credit note ${inv.supplierInvoiceNo} against ${inv.relatedInvoiceNo ?? "original invoice"}`),
      jl(A.suspense, 0, total, `Clear suspense parked on ${inv.relatedInvoiceNo ?? "original invoice"}`),
    ];
    return {
      ...base,
      kind: "apply_credit_note",
      kinds: ["apply_credit_note"],
      payableNow: 0,
      toSuspense: 0,
      recover: match.creditBalance?.gross ?? 0,
      paymentAvoided: 0,
      creditBalance: match.creditBalance,
      newStatus: "credit_applied",
      journal: { lines, memo: `Apply ${inv.supplierInvoiceNo}; balance ${fmt2(match.creditBalance?.gross ?? 0)} still open in suspense`, balanced: true },
    };
  }

  /* Wrong PO: if a candidate exists, re-match against it and treat the result. */
  const kinds: TreatmentKind[] = [];
  let m = match;
  let correctedPoRef: string | null = null;
  if (failing.has("po")) {
    if (match.candidatePo) {
      kinds.push("correct_po_reference");
      correctedPoRef = match.candidatePo.id;
      m = matchInvoice(inv, ctx, { poOverride: match.candidatePo.id });
    }
  }
  const f = new Set(m.checks.filter((c) => c.status === "fail").map((c) => c.id));
  const poUnresolved = f.has("po");
  if (f.has("trn")) kinds.push("hold_for_trn");
  if (f.has("vat") || f.has("total")) kinds.push("request_corrected_invoice");
  if (f.has("qty")) kinds.push("short_pay");
  if (f.has("price")) kinds.push("pay_at_po_price");
  if (f.has("charges")) kinds.push("reject_line");
  if (!kinds.length) kinds.push("approve");

  const po: PurchaseOrder | undefined = ctx.pos.find((p) => p.id === m.poId);
  const debitAccount = po?.kind === "service" ? A.freightIn : A.grir;

  // Accepted value: quantities as received, prices at PO where outside tolerance.
  const discPct = inv.discount && inv.grossAmount ? Math.abs(inv.discount.amount) / m.lines.filter((l) => l.kind === "item").reduce((a, l) => a + l.inv.amount, 0) : 0;
  let acceptedGross = 0;
  let ppv = 0;
  const shortQty: Treatment["shortQty"] = [];
  const priceVar: Treatment["priceVar"] = [];
  for (const l of m.lines) {
    if (l.kind !== "item") continue;
    const qty = l.grn ? Math.min(l.inv.qty, l.grn.accepted) : l.inv.qty;
    const price = l.priceTone === "fail" && l.po ? l.po.unitPrice : l.inv.unitPrice;
    acceptedGross += r2(qty * price);
    if (l.priceTone === "warn" && l.po && l.inv.unitPrice > l.po.unitPrice) ppv += r2(qty * (l.inv.unitPrice - l.po.unitPrice) * (1 - discPct));
    if (l.qtyTone === "fail" && l.grn) {
      const sq = r2(l.inv.qty - l.grn.accepted);
      const net = r2(sq * l.inv.unitPrice * (1 - discPct));
      shortQty.push({ sku: l.sku ?? "", qty: sq, unit: l.unit, net, vat: r2(net * vatRate) });
    }
    if (l.priceTone === "fail" && l.po) {
      const net = r2((l.inv.unitPrice - l.po.unitPrice) * qty * (1 - discPct));
      priceVar.push({ sku: l.sku ?? "", qty, invPrice: l.inv.unitPrice, poPrice: l.po.unitPrice, net, vat: r2(net * vatRate) });
    }
  }
  acceptedGross = r2(acceptedGross);
  const acceptedDiscount = r2(acceptedGross * discPct);
  const acceptedTaxable = r2(acceptedGross - acceptedDiscount);
  const acceptedVat = r2(acceptedTaxable * vatRate);
  const rejectedLines = m.lines
    .filter((l) => l.kind === "charge")
    .map((l) => ({ description: l.description, net: l.inv.amount, vat: r2(l.inv.amount * vatRate) }));

  const vatCheck = m.checks.find((c) => c.id === "vat");
  const correctedVat = f.has("vat") ? { expected: Math.abs(m.expected.vat), charged: Math.abs(inv.vatAmount), diff: vatCheck?.variance ?? 0 } : null;
  const hold = poUnresolved || f.has("trn") || f.has("vat") || f.has("total");

  let payableNow: number;
  let toSuspense: number;
  let recover: number;
  let newStatus: InvoiceStatus;
  const lines: JournalLine[] = [];
  const ref = inv.supplierInvoiceNo;

  if (poUnresolved) {
    payableNow = 0;
    toSuspense = 0;
    recover = 0;
    newStatus = "on_hold";
  } else if (hold) {
    // VAT cannot be recovered on this document — book the accepted value, park the rest until a valid tax invoice arrives.
    payableNow = 0;
    toSuspense = r2(total - acceptedTaxable);
    recover = correctedVat ? correctedVat.diff : 0;
    newStatus = "on_hold";
    lines.push(jl(debitAccount, acceptedTaxable, 0, `${ref} — ${po?.kind === "service" ? "services received" : "goods received"} at ${fmt2(acceptedTaxable)}`));
    lines.push(jl(A.suspense, toSuspense, 0, f.has("trn") ? `${ref} — VAT charged without a TRN, held` : `${ref} — VAT ${fmt2(Math.abs(inv.vatAmount))} on an incorrect tax invoice, held`));
    lines.push(jl(A.apControl, 0, total, `${ref} — supplier invoice as received`));
  } else {
    payableNow = r2(acceptedTaxable + acceptedVat);
    toSuspense = r2(total - payableNow);
    recover = toSuspense;
    newStatus = toSuspense > 0.004 ? "short_paid" : "approved_for_payment";
    lines.push(jl(debitAccount, r2(acceptedTaxable - ppv), 0, `${ref} — ${po?.kind === "service" ? "services received" : "goods received"}${po ? ` on ${po.id}` : ""}`));
    if (ppv > 0) lines.push(jl(A.ppv, ppv, 0, `${ref} — price variance within ±${policy.priceTolerancePct}%`));
    lines.push(jl(A.inputVat, acceptedVat, 0, `${ref} — input VAT on accepted value`));
    if (toSuspense > 0.004) lines.push(jl(A.suspense, toSuspense, 0, `${ref} — disputed amount pending supplier credit note`));
    lines.push(jl(A.apControl, 0, total, `${ref} — supplier invoice as received`));
  }

  const dr = r2(lines.reduce((a, l) => a + l.debit, 0));
  const cr = r2(lines.reduce((a, l) => a + l.credit, 0));
  const kind = kinds[0];
  const memo =
    newStatus === "approved_for_payment"
      ? `${ref} approved for payment${correctedPoRef ? ` against ${correctedPoRef}` : ""}`
      : newStatus === "short_paid"
        ? `${ref} — pay ${fmt2(payableNow)} now; ${fmt2(toSuspense)} to suspense pending credit note`
        : `${ref} on hold — ${fmt2(total)} booked, nothing released`;

  return {
    ...base,
    kind,
    kinds,
    payableNow,
    toSuspense,
    recover,
    paymentAvoided: 0,
    correctedVat,
    correctedPoRef,
    rejectedLines,
    shortQty,
    priceVar,
    newStatus,
    journal: { lines, memo, balanced: Math.abs(dr - cr) < 0.005 },
  };
}
