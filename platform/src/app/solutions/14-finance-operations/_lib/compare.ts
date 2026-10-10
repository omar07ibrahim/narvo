/** Compare what the vision model read off the invoice image with the registered system record. Pure. */
import { fmt2 } from "./three-way";
import type { ExtractedInvoice, FieldCompare, Invoice, MatchResult, Supplier } from "./types";

const norm = (s: string | null | undefined) =>
  (s ?? "")
    .toLowerCase()
    .replace(/l\.l\.c\.?/g, "llc")
    .replace(/[^a-z0-9؀-ۿ]/g, "");
const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const num = (a: number | null | undefined, b: number | null | undefined) => a != null && b != null && Math.abs(Math.abs(a) - Math.abs(b)) < 0.011;

export function compareExtraction(x: ExtractedInvoice, inv: Invoice, supplier: Supplier | undefined, companyTrn: string, match?: MatchResult): FieldCompare[] {
  const c = x.confidence;
  const out: FieldCompare[] = [];
  const push = (f: FieldCompare) => out.push(f);

  // Supplier
  const nameOk = !!x.supplierName && (norm(x.supplierName).includes(norm(inv.supplierName)) || norm(inv.supplierName).includes(norm(x.supplierName)));
  push({
    key: "supplier",
    label: { en: "Supplier", ar: "المورد" },
    extracted: x.supplierName,
    system: inv.supplierName,
    confidence: c.supplierName,
    status: !x.supplierName ? "missing" : nameOk ? "ok" : "mismatch",
  });

  // Supplier TRN
  const vatCharged = Math.abs(inv.vatAmount) > 0;
  const sysTrn = supplier?.trn ?? null;
  const exTrn = x.supplierTrn ? digits(x.supplierTrn) : null;
  push({
    key: "trn",
    label: { en: "Supplier TRN", ar: "الرقم الضريبي للمورد" },
    extracted: x.supplierTrn,
    system: sysTrn ?? "Not on file",
    confidence: c.supplierTrn,
    status: !exTrn ? (vatCharged ? "missing" : "check") : sysTrn && exTrn !== sysTrn ? "mismatch" : !sysTrn ? "check" : "ok",
    note: !exTrn && vatCharged
      ? { en: `No TRN printed while VAT of ${fmt2(Math.abs(inv.vatAmount))} is charged`, ar: `لا يوجد رقم ضريبي مطبوع رغم احتساب ضريبة ${fmt2(Math.abs(inv.vatAmount))}` }
      : undefined,
  });

  // Invoice no.
  push({
    key: "invoiceNo",
    label: { en: "Invoice no.", ar: "رقم الفاتورة" },
    extracted: x.invoiceNo,
    system: inv.supplierInvoiceNo,
    confidence: c.invoiceNo,
    status: !x.invoiceNo ? "missing" : norm(x.invoiceNo) === norm(inv.supplierInvoiceNo) ? "ok" : "mismatch",
    note: match?.duplicateOf ? { en: `Same number already registered as ${match.duplicateOf}`, ar: `الرقم نفسه مسجل مسبقاً برقم ${match.duplicateOf}` } : undefined,
  });

  // Date
  push({
    key: "invoiceDate",
    label: { en: "Invoice date", ar: "تاريخ الفاتورة" },
    extracted: x.invoiceDate,
    system: inv.invoiceDate,
    confidence: c.invoiceDate,
    status: !x.invoiceDate ? "missing" : x.invoiceDate === inv.invoiceDate ? "ok" : "mismatch",
  });

  // PO reference
  const poFail = match?.checks.find((k) => k.id === "po" && k.status === "fail");
  push({
    key: "poRef",
    label: { en: "PO reference", ar: "مرجع أمر الشراء" },
    extracted: x.poRef,
    system: inv.poRef,
    confidence: c.poRef,
    status: !x.poRef ? "missing" : norm(x.poRef) !== norm(inv.poRef) ? "mismatch" : poFail ? "check" : "ok",
    note: poFail ? { en: poFail.actual, ar: poFail.actualAr } : undefined,
  });

  // Delivery / GRN refs
  const sysRefs = [...inv.deliveryNoteRefs, ...inv.grnRefs];
  const exRefs = x.deliveryRefs ?? [];
  const refOk = exRefs.length > 0 && exRefs.every((r) => sysRefs.some((s) => norm(s) === norm(r)));
  push({
    key: "refs",
    label: { en: "Delivery note / GRN", ar: "إشعار التسليم / الاستلام" },
    extracted: exRefs.length ? exRefs.join(", ") : null,
    system: sysRefs.join(", ") || "—",
    confidence: c.poRef,
    status: !exRefs.length ? (sysRefs.length ? "missing" : "check") : refOk ? "ok" : "mismatch",
  });

  // Bill-to TRN
  push({
    key: "billTo",
    label: { en: "Bill-to TRN (RBM)", ar: "الرقم الضريبي للعميل (رصين)" },
    extracted: x.billToTrn,
    system: companyTrn,
    confidence: c.supplierTrn,
    status: !x.billToTrn ? "missing" : digits(x.billToTrn) === companyTrn ? "ok" : "mismatch",
  });

  // Lines
  const sysLines = inv.lines;
  const linesOk =
    x.lines.length === sysLines.length &&
    sysLines.every((l, i) => num(x.lines[i]?.amount, l.amount) && num(x.lines[i]?.qty, l.qty) && num(x.lines[i]?.unitPrice, l.unitPrice));
  push({
    key: "lines",
    label: { en: "Line items", ar: "البنود" },
    extracted: x.lines.map((l) => `${l.qty ?? "?"} × ${l.unitPrice != null ? fmt2(l.unitPrice) : "?"} = ${l.amount != null ? fmt2(l.amount) : "?"}${l.isCharge ? " (charge)" : ""}`).join(" · "),
    system: sysLines.map((l) => `${Math.abs(l.qty)} × ${fmt2(l.unitPrice)} = ${fmt2(Math.abs(l.amount))}${l.kind === "charge" ? " (charge)" : ""}`).join(" · "),
    confidence: c.lines,
    status: linesOk ? "ok" : "mismatch",
  });

  // Totals
  const money = (key: string, label: { en: string; ar: string }, ex: number | null, sys: number | null) =>
    push({
      key,
      label,
      extracted: ex != null ? fmt2(ex) : null,
      system: sys != null ? fmt2(Math.abs(sys)) : "—",
      confidence: c.totals,
      status: ex == null ? (sys ? "missing" : "check") : num(ex, sys) ? "ok" : "mismatch",
    });
  if (inv.discount) money("discount", { en: "Discount", ar: "الخصم" }, x.discountAmount, inv.discount.amount);
  money("taxable", { en: "Taxable amount", ar: "المبلغ الخاضع للضريبة" }, x.taxableAmount, inv.taxableAmount);
  money("vat", { en: "VAT 5%", ar: "ضريبة القيمة المضافة 5%" }, x.vatAmount, inv.vatAmount);
  money("total", { en: "Total AED", ar: "الإجمالي بالدرهم" }, x.total, inv.total);

  return out;
}
