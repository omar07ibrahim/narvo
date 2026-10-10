/**
 * Three-way match (invoice ↔ purchase order ↔ goods received note) under RG-FIN-POL-09 rev. 4.
 * Pure and deterministic — used by the API routes and by the browser to recompute after approvals.
 */
import type {
  ApPolicy,
  CandidatePo,
  CellTone,
  CheckId,
  CheckResult,
  Grn,
  HistoryItem,
  Invoice,
  LineCompare,
  MatchResult,
  PurchaseOrder,
  Supplier,
} from "./types";

export interface MatchContext {
  invoices: Invoice[];
  pos: PurchaseOrder[];
  grns: Grn[];
  suppliers: Supplier[];
  policy: ApPolicy;
  vatRate: number;
  history: HistoryItem[];
}

export const r2 = (x: number) => Math.round((x + (x >= 0 ? 1e-9 : -1e-9)) * 100) / 100;
export const fmt2 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtQty = (q: number, unit: string) =>
  unit === "t"
    ? q.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 })
    : q.toLocaleString("en-US", { maximumFractionDigits: 3 });
const UNIT_AR: Record<string, string> = { t: "طن", bag: "كيس", "m²": "م²", pc: "حبة", set: "طقم", roll: "رول", pail: "سطل", trip: "رحلة" };
export const unitAr = (u: string) => UNIT_AR[u] ?? u;
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
const normRef = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/\s+/g, "").trim();
const normTrn = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

export const PRIORITY: CheckId[] = ["duplicate", "po", "trn", "qty", "price", "charges", "vat", "credit", "total"];

export const CHECK_LABELS: Record<CheckId, { en: string; ar: string }> = {
  po: { en: "Purchase order", ar: "أمر الشراء" },
  duplicate: { en: "Duplicate check", ar: "فحص التكرار" },
  trn: { en: "Supplier TRN", ar: "الرقم الضريبي للمورد" },
  qty: { en: "Quantity vs GRN", ar: "الكمية مقابل الاستلام" },
  price: { en: "Unit price vs PO", ar: "سعر الوحدة مقابل أمر الشراء" },
  charges: { en: "Charges outside PO", ar: "رسوم خارج أمر الشراء" },
  vat: { en: "Discount & VAT base", ar: "الخصم وأساس الضريبة" },
  total: { en: "Arithmetic & totals", ar: "الحساب والإجماليات" },
  credit: { en: "Credit-note coverage", ar: "تغطية إشعار الدائن" },
};

function supplierOf(ctx: MatchContext, id: string) {
  return ctx.suppliers.find((s) => s.id === id);
}

function daysBetween(a: string, b: string) {
  return Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;
}

/** Earlier-received comes first; ties broken by register id. */
function isEarlier(a: Invoice, b: Invoice) {
  if (a.receivedDate !== b.receivedDate) return a.receivedDate < b.receivedDate;
  return a.id < b.id;
}

/** Propose the PO an invoice most likely belongs to: same supplier, same SKUs, same quantities, received, not yet invoiced. */
export function findCandidatePo(inv: Invoice, ctx: MatchContext, excludeId?: string): CandidatePo | null {
  const items = inv.lines.filter((l) => l.kind === "item" && l.sku);
  if (!items.length) return null;
  const quoted = normRef(inv.poRef);
  let best: (CandidatePo & { raw: number }) | null = null;
  for (const po of ctx.pos) {
    if (po.supplierId !== inv.supplierId || po.id === excludeId) continue;
    if (!items.every((l) => po.lines.some((pl) => pl.sku === l.sku))) continue;
    let score = 0;
    const qtyExact = items.every((l) => po.lines.find((pl) => pl.sku === l.sku)!.qty === Math.abs(l.qty));
    if (qtyExact) score += 3;
    const poGrns = ctx.grns.filter((g) => g.poId === po.id);
    const accepted = (sku: string) => poGrns.reduce((a, g) => a + g.lines.filter((x) => x.sku === sku).reduce((b, x) => b + x.acceptedQty, 0), 0);
    const received = items.every((l) => accepted(l.sku!) >= Math.abs(l.qty));
    if (received) score += 2;
    const invoicedBy = ctx.invoices.filter(
      (o) => o.id !== inv.id && o.docType === "invoice" && normRef(o.poRefCorrected ?? o.poRef) === po.id && o.status !== "rejected",
    );
    if (!invoicedBy.length) score += 2;
    else score -= 3;
    const digitsOf = (s: string) => s.replace(/\D/g, "").split("").sort().join("");
    const transposed = quoted && digitsOf(quoted) === digitsOf(po.id) && quoted !== po.id;
    if (transposed) score += 1;
    if (!best || score > best.raw) {
      const partsEn = items.map((l) => `${l.sku} × ${fmtQty(Math.abs(l.qty), l.unit)} ${l.unit}`).join(", ");
      const partsAr = items.map((l) => `${l.sku} × ${fmtQty(Math.abs(l.qty), l.unit)} ${unitAr(l.unit)}`).join("، ");
      const g = poGrns[0];
      best = {
        id: po.id,
        score: Math.max(0, Math.min(1, score / 8)),
        raw: score,
        reason: {
          en: [
            `Same supplier, ${partsEn} ${qtyExact ? "exactly as ordered" : "on the order"}`,
            received && g ? `received on ${poGrns.map((x) => x.id).join(", ")} (${g.date})` : null,
            !invoicedBy.length ? "not yet invoiced" : `already invoiced by ${invoicedBy.map((x) => x.supplierInvoiceNo).join(", ")}`,
            transposed ? `quoted ${inv.poRef} has the same digits transposed` : null,
          ]
            .filter(Boolean)
            .join(" · "),
          ar: [
            `المورد نفسه، ${partsAr} ${qtyExact ? "مطابقة للطلب" : "ضمن الطلب"}`,
            received && g ? `مستلمة بموجب ${poGrns.map((x) => x.id).join("، ")} (${g.date})` : null,
            !invoicedBy.length ? "لم تُفوتر بعد" : `مفوترة سابقاً بموجب ${invoicedBy.map((x) => x.supplierInvoiceNo).join("، ")}`,
            transposed ? `الرقم المذكور ${inv.poRef} بنفس الأرقام مع تبديل في الترتيب` : null,
          ]
            .filter(Boolean)
            .join(" · "),
        },
      };
    }
  }
  if (!best || best.raw < 4) return null;
  const { raw: _raw, ...out } = best;
  void _raw;
  return out;
}

export function matchInvoice(inv: Invoice, ctx: MatchContext, opts: { poOverride?: string } = {}): MatchResult {
  const { policy, vatRate } = ctx;
  const sup = supplierOf(ctx, inv.supplierId);
  const supName = sup?.name ?? inv.supplierName;
  const isCredit = inv.docType === "credit_note";
  const sign = isCredit ? -1 : 1;
  const absTotal = Math.abs(inv.total);
  const checks: CheckResult[] = [];
  const add = (c: Omit<CheckResult, "label">) => checks.push({ ...c, label: CHECK_LABELS[c.id] });
  const NO_DETAIL = { en: "", ar: "" };

  /* ── Duplicate ── */
  const dupSame = ctx.invoices.find(
    (o) => o.id !== inv.id && o.supplierId === inv.supplierId && normRef(o.supplierInvoiceNo) === normRef(inv.supplierInvoiceNo) && isEarlier(o, inv),
  );
  const dupPoAmount =
    !dupSame && !isCredit
      ? ctx.invoices.find(
          (o) =>
            o.id !== inv.id &&
            o.docType === "invoice" &&
            o.supplierId === inv.supplierId &&
            normRef(o.poRef) === normRef(inv.poRef) &&
            Math.abs(o.total - inv.total) < 0.005 &&
            daysBetween(o.invoiceDate, inv.invoiceDate) <= 90 &&
            isEarlier(o, inv),
        )
      : undefined;
  const dupHistory = ctx.history.find((h) => h.supplierId === inv.supplierId && normRef(h.invoiceNo) === normRef(inv.supplierInvoiceNo));
  const dup = dupSame ?? dupPoAmount;
  if (dup) {
    add({
      id: "duplicate",
      status: "fail",
      expected: "Unique supplier + invoice no.; no same PO + amount within 90 days",
      expectedAr: "رقم فاتورة فريد للمورد؛ ولا تكرار لأمر الشراء والمبلغ خلال 90 يوماً",
      actual: dupSame
        ? `${inv.supplierInvoiceNo} already registered as ${dup.id} (dated ${dup.invoiceDate}, received ${dup.receivedDate})`
        : `Same PO ${inv.poRef} and amount ${fmt2(inv.total)} as ${dup.supplierInvoiceNo} (${dup.id})`,
      actualAr: dupSame
        ? `${inv.supplierInvoiceNo} مسجلة مسبقاً برقم ${dup.id} (بتاريخ ${dup.invoiceDate}، مستلمة ${dup.receivedDate})`
        : `أمر الشراء ${inv.poRef} والمبلغ ${fmt2(inv.total)} نفسهما في ${dup.supplierInvoiceNo} (${dup.id})`,
      variance: absTotal,
      detail: dupSame
        ? {
            en: `Re-sent with a new date (${inv.invoiceDate} vs ${dup.invoiceDate}). Paying it would pay the same supply twice.`,
            ar: `أُعيد إرسالها بتاريخ جديد (${inv.invoiceDate} بدلاً من ${dup.invoiceDate}). سدادها يعني دفع التوريد نفسه مرتين.`,
          }
        : { en: "Same supplier, PO and amount within 90 days under a different number.", ar: "المورد وأمر الشراء والمبلغ نفسه خلال 90 يوماً برقم مختلف." },
    });
  } else if (dupHistory) {
    add({
      id: "duplicate",
      status: "fail",
      expected: "Not previously processed",
      expectedAr: "لم تُعالج سابقاً",
      actual: `${inv.supplierInvoiceNo} was processed in the ${dupHistory.batch} batch (${dupHistory.id})`,
      actualAr: `عولجت ${inv.supplierInvoiceNo} في دفعة ${dupHistory.batch} (${dupHistory.id})`,
      variance: absTotal,
      detail: { en: "Invoice number already processed in an earlier batch.", ar: "رقم الفاتورة سبقت معالجته في دفعة سابقة." },
    });
  } else {
    add({
      id: "duplicate",
      status: "pass",
      expected: "Unique supplier + invoice no.",
      expectedAr: "رقم فاتورة فريد للمورد",
      actual: "No earlier document with this number, or this PO and amount",
      actualAr: "لا يوجد مستند سابق بهذا الرقم أو بأمر الشراء والمبلغ نفسيهما",
      variance: 0,
      detail: { en: "Checked against the batch and the August history.", ar: "تمت المقارنة مع الدفعة الحالية وسجل أغسطس." },
    });
  }

  /* ── Purchase order ── */
  const poQuoted = inv.poRef;
  const poId = normRef(opts.poOverride ?? inv.poRefCorrected ?? inv.poRef);
  const poCorrected = !!(opts.poOverride ?? inv.poRefCorrected) && poId !== normRef(inv.poRef);
  const poRec = ctx.pos.find((p) => p.id === poId) ?? null;
  const items = inv.lines.filter((l) => l.kind === "item");
  let poValid = false;
  let candidatePo: CandidatePo | null = null;
  if (!poId) {
    add({
      id: "po", status: "fail",
      expected: `A valid RBM PO for ${supName}`, expectedAr: `أمر شراء صالح صادر لـ ${supName}`,
      actual: "No PO reference on the document", actualAr: "لا يوجد رقم أمر شراء على المستند",
      variance: absTotal,
      detail: { en: "Invoices must quote an RBM purchase order.", ar: "يجب أن تذكر الفاتورة رقم أمر شراء صادر عن رصين." },
    });
  } else if (!poRec) {
    add({
      id: "po", status: "fail",
      expected: `A valid RBM PO for ${supName}`, expectedAr: `أمر شراء صالح صادر لـ ${supName}`,
      actual: `${poId} — not found in purchasing`, actualAr: `${poId} — غير موجود في نظام المشتريات`,
      variance: absTotal,
      detail: { en: "The quoted reference does not exist.", ar: "الرقم المذكور غير موجود في نظام المشتريات." },
    });
  } else if (poRec.supplierId !== inv.supplierId) {
    const owner = supplierOf(ctx, poRec.supplierId);
    add({
      id: "po",
      status: "fail",
      expected: `A PO issued to ${supName}`,
      expectedAr: `أمر شراء صادر لـ ${sup?.nameAr ?? supName}`,
      actual: `${poRec.id} belongs to ${owner?.name ?? poRec.supplierId} (${poRec.lines.map((l) => l.sku).join(", ")})`,
      actualAr: `${poRec.id} يخص ${owner?.nameAr ?? poRec.supplierId} (${poRec.lines.map((l) => l.sku).join("، ")})`,
      variance: absTotal,
      detail: { en: "Quoted PO is for a different supplier and different items.", ar: "أمر الشراء المذكور لمورد آخر وأصناف مختلفة." },
    });
  } else {
    const missing = items.filter((l) => l.sku && !poRec.lines.some((pl) => pl.sku === l.sku));
    if (missing.length) {
      add({
        id: "po",
        status: "fail",
        expected: `Items on ${poRec.id}: ${poRec.lines.map((l) => l.sku).join(", ")}`,
        expectedAr: `أصناف ${poRec.id}: ${poRec.lines.map((l) => l.sku).join("، ")}`,
        actual: `Not on PO: ${missing.map((l) => l.sku).join(", ")}`,
        actualAr: `غير واردة في الأمر: ${missing.map((l) => l.sku).join("، ")}`,
        variance: r2(missing.reduce((a, l) => a + Math.abs(l.amount) * (1 + vatRate), 0)),
        detail: { en: "Invoice lines that the PO does not cover.", ar: "بنود في الفاتورة لا يغطيها أمر الشراء." },
      });
    } else {
      poValid = true;
      const n = poRec.lines.length;
      add({
        id: "po",
        status: "pass",
        expected: `PO issued to ${supName}`,
        expectedAr: `أمر شراء صادر لـ ${sup?.nameAr ?? supName}`,
        actual: `${poRec.id} · ${poRec.date} · ${n} line${n > 1 ? "s" : ""}${poCorrected ? ` (corrected from ${poQuoted})` : ""}`,
        actualAr: `${poRec.id} · ${poRec.date} · ${n} ${n > 1 ? "بنود" : "بند"}${poCorrected ? ` (مصحح من ${poQuoted})` : ""}`,
        variance: 0,
        detail: poCorrected
          ? { en: `Reference corrected from ${poQuoted} after buyer confirmation.`, ar: `تم تصحيح المرجع من ${poQuoted} بعد تأكيد المشتري.` }
          : {
              en: `${poRec.deliveryTerms === "delivered" ? "Delivered price" : poRec.kind === "service" ? "Service order" : "Ex-works"} · ${poRec.priceBasis}`,
              ar: `${poRec.deliveryTerms === "delivered" ? "سعر شامل التوصيل" : poRec.kind === "service" ? "أمر خدمة" : "تسليم أرض المصنع"} · ${poRec.priceBasis}`,
            },
      });
    }
  }
  if (!poValid) candidatePo = findCandidatePo(inv, ctx, poRec?.id);
  const po = poValid ? poRec : null;

  /* ── GRNs ── */
  let grns: Grn[] = [];
  if (po) {
    grns = inv.grnRefs.map((id) => ctx.grns.find((g) => g.id === normRef(id))).filter((g): g is Grn => !!g && g.poId === po.id);
    if (!grns.length) {
      const byDn = ctx.grns.filter((g) => g.poId === po.id && inv.deliveryNoteRefs.some((d) => normRef(d) === normRef(g.deliveryNote)));
      grns = byDn.length ? byDn : ctx.grns.filter((g) => g.poId === po.id);
    }
  }
  const grnSum = (sku: string) =>
    grns.reduce(
      (a, g) => {
        for (const l of g.lines.filter((x) => x.sku === sku)) {
          a.delivered += l.deliveredQty;
          a.received += l.receivedQty;
          a.accepted += l.acceptedQty;
          a.rejected += l.rejectedQty;
        }
        return a;
      },
      { delivered: 0, received: 0, accepted: 0, rejected: 0 },
    );
  const grnList = grns.map((g) => g.id).join(", ");
  const grnListAr = grns.map((g) => g.id).join("، ");

  /* ── Line comparison ── */
  const itemGross = inv.lines.filter((l) => l.kind === "item").reduce((a, l) => a + Math.abs(l.amount), 0);
  const discPct = inv.discount && itemGross ? Math.abs(inv.discount.amount) / itemGross : 0;
  const lines: LineCompare[] = inv.lines.map((l) => {
    const qty = Math.abs(l.qty);
    if (l.kind === "charge") {
      return {
        lineNo: l.lineNo, kind: "charge", sku: null, description: l.description, unit: l.unit,
        inv: { qty, unitPrice: l.unitPrice, amount: Math.abs(l.amount) }, po: null, grn: null,
        qtyTone: "na", priceTone: "na", lineTone: "fail", qtyVariance: 0, priceVariance: 0,
        note: { en: "Not on the purchase order", ar: "غير وارد في أمر الشراء" },
      };
    }
    const pl = po?.lines.find((x) => x.sku === l.sku) ?? null;
    const g = po && l.sku ? grnSum(l.sku) : null;
    let qtyTone: CellTone = "na";
    let qtyVariance = 0;
    if (!isCredit && g && po) {
      const allowed = g.accepted * (1 + policy.qtyTolerancePct / 100);
      if (qty > allowed + 1e-9) {
        qtyTone = "fail";
        const net = r2((qty - g.accepted) * l.unitPrice * (1 - discPct));
        qtyVariance = r2(net + r2(net * vatRate));
      } else qtyTone = "ok";
    }
    let priceTone: CellTone = "na";
    let priceVariance = 0;
    if (pl) {
      const diffPct = ((l.unitPrice - pl.unitPrice) / pl.unitPrice) * 100;
      if (Math.abs(diffPct) < 1e-9) priceTone = "ok";
      else if (Math.abs(diffPct) <= policy.priceTolerancePct) priceTone = "warn";
      else if (diffPct < 0) priceTone = "warn";
      else {
        priceTone = "fail";
        const basis = g && !isCredit ? Math.min(qty, g.accepted) : qty;
        const net = r2((l.unitPrice - pl.unitPrice) * basis * (1 - discPct));
        priceVariance = r2(net + r2(net * vatRate));
      }
    }
    const lineTone: CellTone = !po ? "na" : !pl ? "fail" : qtyTone === "fail" || priceTone === "fail" ? "fail" : priceTone === "warn" ? "warn" : "ok";
    return {
      lineNo: l.lineNo, kind: "item", sku: l.sku, description: l.description, unit: l.unit,
      inv: { qty, unitPrice: l.unitPrice, amount: Math.abs(l.amount) },
      po: pl ? { qty: pl.qty, unitPrice: pl.unitPrice } : null,
      grn: g,
      qtyTone, priceTone, lineTone, qtyVariance, priceVariance,
    };
  });

  /* ── Quantity ── */
  const itemLines = lines.filter((l) => l.kind === "item");
  if (isCredit) {
    add({
      id: "qty", status: "na", expected: "—", expectedAr: "—", actual: "Credit note", actualAr: "إشعار دائن", variance: 0,
      detail: { en: "Quantities are checked against the original rejection (see credit-note coverage).", ar: "تُقارن الكميات بالرفض الأصلي (انظر تغطية إشعار الدائن)." },
    });
  } else if (!po) {
    add({
      id: "qty", status: "na", expected: "—", expectedAr: "—", actual: "Cannot evaluate without a valid PO", actualAr: "لا يمكن التقييم دون أمر شراء صالح", variance: 0,
      detail: { en: "Re-run once the PO reference is resolved.", ar: "يُعاد الفحص بعد تصحيح مرجع أمر الشراء." },
    });
  } else if (!grns.length) {
    const v = r2(Math.abs(inv.taxableAmount) + Math.abs(inv.vatAmount));
    add({
      id: "qty", status: "fail",
      expected: `Goods receipt against ${po.id}`, expectedAr: `إشعار استلام مقابل ${po.id}`,
      actual: "No GRN recorded", actualAr: "لا يوجد إشعار استلام مسجل",
      variance: v,
      detail: { en: "Nothing has been received against this PO — pay only what was received.", ar: "لم يُسجَّل أي استلام مقابل أمر الشراء — يُدفع فقط ما تم استلامه." },
    });
  } else {
    const fails = itemLines.filter((l) => l.qtyTone === "fail");
    const v = r2(fails.reduce((a, l) => a + l.qtyVariance, 0));
    add({
      id: "qty",
      status: fails.length ? "fail" : "pass",
      expected: itemLines.map((l) => `≤ ${fmtQty(l.grn?.accepted ?? 0, l.unit)} ${l.unit} accepted`).join(" · "),
      expectedAr: itemLines.map((l) => `≤ ${fmtQty(l.grn?.accepted ?? 0, l.unit)} ${unitAr(l.unit)} مقبولة`).join(" · "),
      actual: itemLines.map((l) => `${fmtQty(l.inv.qty, l.unit)} ${l.unit} invoiced`).join(" · "),
      actualAr: itemLines.map((l) => `${fmtQty(l.inv.qty, l.unit)} ${unitAr(l.unit)} مفوترة`).join(" · "),
      variance: v,
      detail: fails.length
        ? {
            en: `Invoiced above the quantity accepted on ${grnList} (tolerance ${policy.qtyTolerancePct}%).`,
            ar: `الكمية المفوترة أعلى من المقبولة في ${grnListAr} (التفاوت المسموح ${policy.qtyTolerancePct}%).`,
          }
        : { en: `Agrees with ${grnList}.`, ar: `مطابقة لـ ${grnListAr}.` },
    });
  }

  /* ── Price ── */
  if (!po) {
    add({ id: "price", status: "na", expected: "—", expectedAr: "—", actual: "Cannot evaluate without a valid PO", actualAr: "لا يمكن التقييم دون أمر شراء صالح", variance: 0, detail: NO_DETAIL });
  } else {
    const fails = itemLines.filter((l) => l.priceTone === "fail");
    const v = r2(fails.reduce((a, l) => a + l.priceVariance, 0));
    const actual = itemLines
      .map((l) => `${fmt2(l.inv.unitPrice)}${l.po && l.po.unitPrice !== l.inv.unitPrice ? ` (${pct(((l.inv.unitPrice - l.po.unitPrice) / l.po.unitPrice) * 100)})` : ""}`)
      .join(" · ");
    add({
      id: "price",
      status: fails.length ? "fail" : "pass",
      expected: itemLines.map((l) => `${fmt2(l.po?.unitPrice ?? 0)} / ${l.unit}`).join(" · "),
      expectedAr: itemLines.map((l) => `${fmt2(l.po?.unitPrice ?? 0)} / ${unitAr(l.unit)}`).join(" · "),
      actual,
      actualAr: actual,
      variance: v,
      detail: fails.length
        ? { en: `Above PO price beyond the ±${policy.priceTolerancePct}% tolerance. PO basis: ${po.priceBasis}.`, ar: `أعلى من سعر أمر الشراء بما يتجاوز التفاوت ±${policy.priceTolerancePct}%. أساس السعر: ${po.priceBasis}.` }
        : { en: `Within ±${policy.priceTolerancePct}% of the PO price.`, ar: `ضمن ±${policy.priceTolerancePct}% من سعر أمر الشراء.` },
    });
  }

  /* ── Charges outside the PO ── */
  const charges = inv.lines.filter((l) => l.kind === "charge");
  if (isCredit) {
    add({ id: "charges", status: "na", expected: "—", expectedAr: "—", actual: "Credit note", actualAr: "إشعار دائن", variance: 0, detail: NO_DETAIL });
  } else if (charges.length) {
    const net = r2(charges.reduce((a, l) => a + Math.abs(l.amount), 0));
    const list = charges.map((l) => `${l.description}: ${fmt2(Math.abs(l.amount))}`).join(" · ");
    add({
      id: "charges",
      status: "fail",
      expected: po ? `No charges outside ${po.id} (${po.deliveryTerms === "delivered" ? "delivered price" : po.deliveryTerms})` : "No charges outside the PO",
      expectedAr: po ? `لا رسوم خارج ${po.id} (${po.deliveryTerms === "delivered" ? "سعر شامل التوصيل" : po.deliveryTerms})` : "لا رسوم خارج أمر الشراء",
      actual: list,
      actualAr: list,
      variance: r2(net + r2(net * vatRate)),
      detail: { en: "Surcharges, freight and levies not on the PO are exceptions unless a signed amendment exists.", ar: "الرسوم الإضافية والشحن غير الواردة في أمر الشراء استثناءات ما لم يوجد تعديل موقّع." },
    });
  } else {
    add({ id: "charges", status: "pass", expected: "Only PO items", expectedAr: "أصناف أمر الشراء فقط", actual: "No additional charges", actualAr: "لا توجد رسوم إضافية", variance: 0, detail: NO_DETAIL });
  }

  /* ── Discount & VAT base ── */
  const recomputedGross = r2(inv.lines.reduce((a, l) => a + r2(Math.abs(l.qty) * l.unitPrice), 0));
  const poDiscPct = po?.discountPct ?? 0;
  const invDisc = Math.abs(inv.discount?.amount ?? 0);
  const expectedDiscount = poDiscPct ? r2((itemLines.reduce((a, l) => a + r2(l.inv.qty * l.inv.unitPrice), 0) * poDiscPct) / 100) : invDisc;
  const expectedTaxable = r2(recomputedGross - expectedDiscount);
  const supRegistered = !!sup?.trn || !!inv.trnOnInvoice;
  const expectedVat = r2(expectedTaxable * vatRate);
  const vatCharged = Math.abs(inv.vatAmount);
  const discDiff = r2(expectedDiscount - invDisc);
  const vatDiff = r2(vatCharged - expectedVat);
  const vatExp = `5% × ${fmt2(expectedTaxable)} = ${fmt2(expectedVat)}`;
  if (Math.abs(discDiff) > policy.vatToleranceAed) {
    add({
      id: "vat",
      status: "fail",
      expected: `Discount ${poDiscPct}% = ${fmt2(expectedDiscount)}`,
      expectedAr: `خصم ${poDiscPct}% = ${fmt2(expectedDiscount)}`,
      actual: `Discount ${fmt2(invDisc)}`,
      actualAr: `خصم ${fmt2(invDisc)}`,
      variance: r2(Math.abs(discDiff) * (1 + vatRate)),
      detail: { en: "Discount agreed on the PO was not applied correctly.", ar: "لم يُطبَّق الخصم المتفق عليه في أمر الشراء بشكل صحيح." },
    });
  } else if (vatCharged === 0 && !supRegistered) {
    add({ id: "vat", status: "pass", expected: "No VAT (supplier not registered)", expectedAr: "لا ضريبة (المورد غير مسجل)", actual: "No VAT charged", actualAr: "لم تُحتسب ضريبة", variance: 0, detail: NO_DETAIL });
  } else if (Math.abs(vatDiff) > policy.vatToleranceAed) {
    const onGross = invDisc > 0 && Math.abs(vatCharged - r2(recomputedGross * vatRate)) <= 0.01;
    add({
      id: "vat",
      status: "fail",
      expected: vatExp,
      expectedAr: vatExp,
      actual: `${fmt2(vatCharged)}${onGross ? ` (5% × ${fmt2(recomputedGross)}, before discount)` : ""}`,
      actualAr: `${fmt2(vatCharged)}${onGross ? ` (5% × ${fmt2(recomputedGross)}، قبل الخصم)` : ""}`,
      variance: Math.abs(vatDiff),
      detail: onGross
        ? {
            en: `VAT was charged on the pre-discount amount; it must be 5% of the taxable amount after the ${fmt2(invDisc)} discount (±AED ${policy.vatToleranceAed}).`,
            ar: `احتُسبت الضريبة على المبلغ قبل الخصم؛ يجب أن تكون 5% من المبلغ الخاضع بعد خصم ${fmt2(invDisc)} (±${policy.vatToleranceAed} درهم).`,
          }
        : { en: `VAT differs from 5% of the taxable amount by more than ±AED ${policy.vatToleranceAed}.`, ar: `تختلف الضريبة عن 5% من المبلغ الخاضع بأكثر من ±${policy.vatToleranceAed} درهم.` },
    });
  } else {
    add({
      id: "vat",
      status: "pass",
      expected: vatExp,
      expectedAr: vatExp,
      actual: fmt2(vatCharged),
      actualAr: fmt2(vatCharged),
      variance: 0,
      detail: invDisc ? { en: `Discount ${fmt2(invDisc)} applied before VAT.`, ar: `طُبِّق الخصم ${fmt2(invDisc)} قبل الضريبة.` } : NO_DETAIL,
    });
  }

  /* ── Arithmetic & totals ── */
  const lineErrors = inv.lines.filter((l) => Math.abs(r2(Math.abs(l.qty) * l.unitPrice) - Math.abs(l.amount)) > 0.01);
  const grossErr = Math.abs(r2(inv.lines.reduce((a, l) => a + Math.abs(l.amount), 0)) - Math.abs(inv.grossAmount)) > 0.01;
  const footErr = Math.abs(r2(Math.abs(inv.taxableAmount) + vatCharged) - absTotal) > 0.01;
  const expectedTotal = r2(expectedTaxable + (supRegistered || vatCharged ? expectedVat : 0));
  const totalDiff = r2(absTotal - expectedTotal);
  const totalFail = lineErrors.length > 0 || grossErr || footErr || Math.abs(totalDiff) > policy.totalToleranceAed;
  add({
    id: "total",
    status: totalFail ? "fail" : "pass",
    expected: `${fmt2(expectedTotal)} (±${policy.totalToleranceAed})`,
    expectedAr: `${fmt2(expectedTotal)} (±${policy.totalToleranceAed})`,
    actual: fmt2(absTotal),
    actualAr: fmt2(absTotal),
    variance: totalFail ? Math.abs(totalDiff) : 0,
    detail: totalFail
      ? {
          en: lineErrors.length ? `Line arithmetic wrong on line ${lineErrors.map((l) => l.lineNo).join(", ")}.` : "Totals do not foot.",
          ar: lineErrors.length ? `خطأ حسابي في البند ${lineErrors.map((l) => l.lineNo).join("، ")}.` : "الإجماليات غير متطابقة.",
        }
      : Math.abs(totalDiff) > 0.004
        ? { en: `Within the ±AED ${policy.totalToleranceAed} tolerance (difference ${fmt2(Math.abs(totalDiff))}).`, ar: `ضمن تفاوت ±${policy.totalToleranceAed} درهم (الفرق ${fmt2(Math.abs(totalDiff))}).` }
        : { en: "Lines, sub-total, VAT and total foot exactly.", ar: "البنود والمجموع والضريبة والإجمالي متطابقة تماماً." },
  });

  /* ── TRN ── */
  if (vatCharged > 0) {
    if (!inv.trnOnInvoice) {
      add({
        id: "trn",
        status: "fail",
        expected: sup?.trn ? `TRN ${sup.trn} printed` : "15-digit supplier TRN printed",
        expectedAr: sup?.trn ? `طباعة الرقم ${sup.trn}` : "طباعة رقم ضريبي من 15 خانة",
        actual: `No TRN on the document; VAT ${fmt2(vatCharged)} charged`,
        actualAr: `لا يوجد رقم ضريبي على المستند؛ ضريبة محتسبة ${fmt2(vatCharged)}`,
        variance: vatCharged,
        detail: {
          en: sup?.trn ? "A tax invoice must show the supplier TRN." : "Supplier TRN not on file and not printed — input VAT cannot be recovered.",
          ar: sup?.trn ? "يجب أن تظهر الفاتورة الضريبية الرقم الضريبي للمورد." : "الرقم الضريبي غير مسجل لدينا وغير مطبوع — لا يمكن استرداد ضريبة المدخلات.",
        },
      });
    } else if (sup?.trn && normTrn(inv.trnOnInvoice) !== sup.trn) {
      add({ id: "trn", status: "fail", expected: sup.trn, expectedAr: sup.trn, actual: inv.trnOnInvoice, actualAr: inv.trnOnInvoice, variance: vatCharged, detail: { en: "TRN printed differs from the supplier master.", ar: "الرقم الضريبي المطبوع يختلف عن سجل المورد." } });
    } else if (!sup?.trn) {
      add({ id: "trn", status: "warn", expected: "TRN on supplier master", expectedAr: "رقم ضريبي في سجل المورد", actual: inv.trnOnInvoice, actualAr: inv.trnOnInvoice, variance: 0, detail: { en: "Verify the TRN with the FTA before paying VAT.", ar: "يجب التحقق من الرقم لدى الهيئة الاتحادية للضرائب قبل سداد الضريبة." } });
    } else {
      add({ id: "trn", status: "pass", expected: sup.trn, expectedAr: sup.trn, actual: inv.trnOnInvoice, actualAr: inv.trnOnInvoice, variance: 0, detail: { en: "Matches the supplier master.", ar: "مطابق لسجل المورد." } });
    }
  } else {
    add({ id: "trn", status: "na", expected: "—", expectedAr: "—", actual: "No VAT charged", actualAr: "لم تُحتسب ضريبة", variance: 0, detail: NO_DETAIL });
  }

  /* ── Credit-note coverage ── */
  let creditBalance: MatchResult["creditBalance"] = null;
  if (isCredit) {
    const rel = inv.grnRefs.map((id) => ctx.grns.find((g) => g.id === normRef(id))).filter((g): g is Grn => !!g);
    const relList = rel.map((g) => g.id).join(", ") || "GRN";
    const results = items.map((l) => {
      const rejected = rel.reduce((a, g) => a + g.lines.filter((x) => x.sku === l.sku).reduce((b, x) => b + x.rejectedQty, 0), 0);
      const earlier = ctx.invoices.filter(
        (o) => o.id !== inv.id && o.docType === "credit_note" && o.supplierId === inv.supplierId && o.relatedInvoiceNo === inv.relatedInvoiceNo && isEarlier(o, inv) && o.status !== "rejected",
      );
      const credited = Math.abs(l.qty) + earlier.reduce((a, o) => a + o.lines.filter((x) => x.sku === l.sku).reduce((b, x) => b + Math.abs(x.qty), 0), 0);
      const price = poRec?.lines.find((x) => x.sku === l.sku)?.unitPrice ?? l.unitPrice;
      return { sku: l.sku!, unit: l.unit, rejected, credited, price };
    });
    const short = results.filter((x) => x.credited < x.rejected);
    if (short.length) {
      const s = short[0];
      const qty = s.rejected - s.credited;
      const net = r2(qty * s.price);
      const vat = r2(net * vatRate);
      creditBalance = { qty, net, vat, gross: r2(net + vat), sku: s.sku };
    }
    const u = results[0]?.unit ?? "";
    add({
      id: "credit",
      status: short.length ? "fail" : results.length ? "pass" : "na",
      expected: results.map((x) => `${fmtQty(x.rejected, x.unit)} ${x.unit} rejected on ${relList}`).join(" · "),
      expectedAr: results.map((x) => `${fmtQty(x.rejected, x.unit)} ${unitAr(x.unit)} مرفوضة في ${relList}`).join(" · "),
      actual: results.map((x) => `${fmtQty(x.credited, x.unit)} ${x.unit} credited`).join(" · "),
      actualAr: results.map((x) => `${fmtQty(x.credited, x.unit)} ${unitAr(x.unit)} في الإشعار`).join(" · "),
      variance: creditBalance?.gross ?? 0,
      detail: creditBalance
        ? {
            en: `Credit note covers only part of the rejection on ${inv.relatedInvoiceNo}; balance ${fmtQty(creditBalance.qty, u)} ${u} × ${fmt2(short[0].price)} still to recover.`,
            ar: `يغطي إشعار الدائن جزءاً فقط من المرفوض في ${inv.relatedInvoiceNo}؛ يتبقى ${fmtQty(creditBalance.qty, u)} ${unitAr(u)} × ${fmt2(short[0].price)} للاسترداد.`,
          }
        : { en: "Credit note fully covers the rejected quantity.", ar: "يغطي إشعار الدائن الكمية المرفوضة بالكامل." },
    });
  }

  /* ── Summary ── */
  const failing = checks.filter((c) => c.status === "fail");
  const primary = PRIORITY.find((id) => failing.some((c) => c.id === id)) ?? null;
  const dupOrPo = failing.find((c) => c.id === "duplicate") ?? failing.find((c) => c.id === "po");
  const variance = dupOrPo ? dupOrPo.variance : r2(failing.reduce((a, c) => a + c.variance, 0));
  const ordered = [...checks].sort((a, b) => PRIORITY.indexOf(a.id) - PRIORITY.indexOf(b.id));

  return {
    invoiceId: inv.id,
    poId: po?.id ?? null,
    poQuoted,
    poCorrected,
    grnIds: grns.map((g) => g.id),
    checks: ordered,
    lines,
    exception: failing.length > 0,
    primary,
    variance: r2(variance),
    unmatchedValue: failing.some((c) => c.id === "po") && !failing.some((c) => c.id === "duplicate") ? absTotal : 0,
    candidatePo,
    expected: {
      gross: r2(recomputedGross * sign),
      discount: r2(expectedDiscount * sign),
      taxable: r2(expectedTaxable * sign),
      vat: r2(expectedVat * sign),
      total: r2(expectedTotal * sign),
    },
    duplicateOf: dup?.id ?? null,
    creditBalance,
  };
}

export function matchAll(ctx: MatchContext): Record<string, MatchResult> {
  return Object.fromEntries(ctx.invoices.map((inv) => [inv.id, matchInvoice(inv, ctx)]));
}
