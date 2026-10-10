import "server-only";
import { z } from "zod";
import { search } from "@/lib/retrieval";
import { fmt2, fmtQty, type MatchContext } from "./three-way";
import { TREATMENT_LABELS } from "./treatments";
import type { CaseCitation, Grn, Invoice, MatchResult, PurchaseOrder, Supplier, Treatment, TreatmentKind } from "./types";

export const TREATMENT_KINDS = [
  "reject_duplicate",
  "correct_po_reference",
  "hold_for_trn",
  "request_corrected_invoice",
  "short_pay",
  "pay_at_po_price",
  "reject_line",
  "apply_credit_note",
  "approve",
] as const satisfies readonly TreatmentKind[];

export const caseSchema = z.object({
  headline: z.string().describe("One line, ≤ 14 words, naming the supplier, the discrepancy and the amount"),
  explanation: z.string().describe("2–4 sentences for the approver, every fact cited with [n]"),
  evidence: z
    .array(z.object({ text: z.string().describe("One factual line, with the exact figures"), cites: z.array(z.number()) }))
    .min(2)
    .max(6),
  recommendation: z.object({
    treatment: z.enum(TREATMENT_KINDS),
    agrees: z.boolean().describe("true if you agree with the computed treatment"),
    rationale: z.string().describe("1–2 sentences referring to RG-FIN-POL-09 with [n]"),
  }),
  nextSteps: z.array(z.string()).min(1).max(4),
});

const BUYER_EMAIL: Record<string, string> = { "Joseph Abraham": "joseph.a@raseen.ae", "Anitha Varghese": "anitha.v@raseen.ae" };

export function buyerEmail(po?: PurchaseOrder | null) {
  return po ? (BUYER_EMAIL[po.buyer] ?? "") : "";
}

/** Numbered sources: the documents themselves first, then the policy / supplier-notice passages. */
export function buildCitations(inv: Invoice, match: MatchResult, t: Treatment, ctx: MatchContext): CaseCitation[] {
  const out: CaseCitation[] = [];
  const add = (c: Omit<CaseCitation, "n">) => out.push({ ...c, n: out.length + 1 });
  const sup = ctx.suppliers.find((s) => s.id === inv.supplierId);

  add({
    docId: inv.id,
    title: `${inv.docType === "credit_note" ? "Credit note" : "Supplier invoice"} ${inv.supplierInvoiceNo} — ${inv.supplierName}`,
    ref: inv.id,
    section: "As received",
    quote: [
      `Dated ${inv.invoiceDate}, received ${inv.receivedDate}, quotes PO ${inv.poRef}${inv.grnRefs.length ? ` and ${inv.grnRefs.join(", ")}` : ""}${inv.deliveryNoteRefs.length ? `; delivery ref ${inv.deliveryNoteRefs.join(", ")}` : ""}.`,
      ...inv.lines.map((l) => `${l.sku ?? "Charge"} — ${l.description}: ${fmtQty(Math.abs(l.qty), l.unit)} ${l.unit} × ${fmt2(l.unitPrice)} = ${fmt2(l.amount)}.`),
      inv.discount ? `Discount ${fmt2(inv.discount.amount)}; net ${fmt2(inv.taxableAmount)}.` : "",
      `VAT ${fmt2(inv.vatAmount)}; total AED ${fmt2(inv.total)}; TRN printed: ${inv.trnOnInvoice ?? "none"}.`,
      inv.note ? `Note on invoice: "${inv.note}".` : "",
      inv.reason ? `Reason: ${inv.reason}.` : "",
    ]
      .filter(Boolean)
      .join(" "),
  });

  const poId = t.correctedPoRef ?? match.poId;
  const po = ctx.pos.find((p) => p.id === poId);
  if (po) {
    add({
      docId: po.id,
      title: `Purchase order ${po.id}`,
      ref: po.id,
      section: t.correctedPoRef ? "Proposed correct PO" : "Ordered",
      quote: `Dated ${po.date}, buyer ${po.buyer}, ${po.kind === "service" ? "service order" : `${po.deliveryTerms} — ${po.deliveryPoint}`}. ${po.lines
        .map((l) => `${l.sku} ${fmtQty(l.qty, l.unit)} ${l.unit} × ${fmt2(l.unitPrice)}`)
        .join("; ")}${po.discountPct ? `; volume discount ${po.discountPct}%` : ""}. Price basis: ${po.priceBasis}.${po.note ? ` ${po.note}.` : ""}`,
    });
  }
  const quotedPo = ctx.pos.find((p) => p.id === inv.poRef.toUpperCase());
  if (match.checks.some((c) => c.id === "po" && c.status === "fail") && quotedPo && quotedPo.id !== po?.id) {
    const qs = ctx.suppliers.find((s) => s.id === quotedPo.supplierId);
    add({
      docId: quotedPo.id,
      title: `Purchase order ${quotedPo.id} (as quoted on the invoice)`,
      ref: quotedPo.id,
      section: "Quoted reference",
      quote: `Issued ${quotedPo.date} to ${qs?.name ?? quotedPo.supplierId}: ${quotedPo.lines.map((l) => `${l.sku} ${fmtQty(l.qty, l.unit)} ${l.unit}`).join("; ")}.`,
    });
  }

  const grnIds = t.correctedPoRef ? ctx.grns.filter((g) => g.poId === t.correctedPoRef).map((g) => g.id) : match.grnIds.length ? match.grnIds : inv.grnRefs;
  for (const gid of grnIds.slice(0, 3)) {
    const g = ctx.grns.find((x) => x.id === gid) as Grn | undefined;
    if (!g) continue;
    add({
      docId: g.id,
      title: `${g.kind === "service" ? "Service confirmation" : "Goods received note"} ${g.id}`,
      ref: g.id,
      section: `${g.warehouse === "JA" ? "Jebel Ali" : "MN-05"} · ${g.date}`,
      quote: `Received by ${g.receivedBy} against ${g.deliveryNote}. ${g.lines
        .map((l) => `${l.sku}: delivered ${fmtQty(l.deliveredQty, l.unit)}, received ${fmtQty(l.receivedQty, l.unit)}, accepted ${fmtQty(l.acceptedQty, l.unit)}, rejected ${fmtQty(l.rejectedQty, l.unit)} ${l.unit}`)
        .join("; ")}.${g.weighbridge?.length ? ` Weighbridge ${g.weighbridge.map((w) => `${w.ticket} net ${w.netKg.toLocaleString("en-US")} kg`).join(", ")}.` : ""} Remarks: ${g.remarks}`,
    });
  }

  if (match.duplicateOf) {
    const orig = ctx.invoices.find((x) => x.id === match.duplicateOf);
    if (orig)
      add({
        docId: orig.id,
        title: `Original ${orig.supplierInvoiceNo} — registered ${orig.id}`,
        ref: orig.id,
        section: "Earlier document",
        quote: `Dated ${orig.invoiceDate}, received ${orig.receivedDate}, PO ${orig.poRef}, total AED ${fmt2(orig.total)}; matched and scheduled for payment, due ${orig.dueDate}.`,
      });
  }

  const hist = ctx.history.filter((h) => h.supplierId === inv.supplierId && (h.invoiceNo === inv.relatedInvoiceNo || h.type === (match.primary === "trn" ? "missing_trn" : "__")));
  for (const h of hist.slice(0, 2)) {
    add({
      docId: h.id,
      title: `August exception ${h.id} — ${h.invoiceNo}`,
      ref: h.id,
      section: "Resolution history",
      quote: `${h.outcome}. Opened ${h.openedAt.slice(0, 10)}, resolved ${h.resolvedAt.slice(0, 10)}, approved by ${h.approvedBy}.`,
    });
  }

  if (sup?.note || sup?.trn === null) {
    add({
      docId: sup.id,
      title: `Supplier master — ${sup.name}`,
      ref: "raseen-master · suppliers",
      section: "Supplier record",
      quote: `TRN on file: ${sup.trn ?? "none"}; payment terms ${sup.paymentTermsDays} days; contact ${sup.contact} <${sup.email}>.${sup.note ? ` ${sup.note}` : ""}`,
    });
  }

  // Policy + supplier notices (BM25 over the Raseen knowledge corpus).
  const Q: Partial<Record<string, string[]>> = {
    qty: ["short receipt short-pay GRN quantity credit note", "pay only what was received weighbridge"],
    charges: ["charges not on the PO surcharge freight exception reject the line", inv.supplierId === "SUP-NEC" ? "Northern Emirates Cement energy surcharge NEC/SALES/2026/208" : "delivered price freight"],
    duplicate: ["duplicate invoice same supplier invoice number reject never pay twice"],
    vat: ["VAT 5% taxable amount after discounts corrected tax invoice input VAT"],
    po: ["wrong PO reference correct after buyer confirmation re-match"],
    price: ["price above PO pay at PO price credit note valid quotation", "Andalus quotation AQ-26-0412 expired price revision not accepted"],
    trn: ["missing TRN hold tax invoice VAT certificate not VAT-registered"],
    credit: ["partial credit note match original claim pursue the balance"],
  };
  const failing = match.checks.filter((c) => c.status === "fail").map((c) => c.id);
  const queries = [...failing.flatMap((id) => Q[id] ?? []), "approval matrix AP supervisor Group CFO 50,000"];
  const ALLOWED = new Set(["RG-FIN-POL-09", "RBM-SUP-DIR-2026"]);
  const hits = search("raseen/knowledge", queries, 12).filter((h) => ALLOWED.has(h.docId) || ALLOWED.has(h.ref ?? ""));
  const seen = new Set<string>();
  let added = 0;
  for (const h of hits) {
    const key = `${h.docId}|${h.section}`;
    if (seen.has(key) || added >= 4) continue;
    seen.add(key);
    added++;
    add({ docId: h.docId, title: h.title, ref: h.ref, section: h.section, quote: h.text.length > 700 ? h.text.slice(0, 700) + "…" : h.text });
  }
  return out;
}

/** What the supplier is asked to do — computed facts the email must state. */
export function supplierAsk(inv: Invoice, match: MatchResult, t: Treatment, ctx: MatchContext): string[] {
  const asks: string[] = [];
  const po = ctx.pos.find((p) => p.id === (t.correctedPoRef ?? match.poId));
  for (const k of t.kinds) {
    if (k === "reject_duplicate") {
      const orig = ctx.invoices.find((x) => x.id === match.duplicateOf);
      asks.push(
        `Invoice ${inv.supplierInvoiceNo} dated ${inv.invoiceDate} (AED ${fmt2(inv.total)}) is a duplicate of the same invoice number dated ${orig?.invoiceDate ?? "earlier"} already registered and scheduled for payment on its due date ${orig?.dueDate ?? ""}. The re-sent copy is rejected and will not be paid. Ask the supplier not to re-issue invoices with new dates and to send a statement if they believe anything is outstanding.`,
      );
    }
    if (k === "correct_po_reference")
      asks.push(
        `The invoice quotes ${inv.poRef}, which is a different order. The correct reference is ${t.correctedPoRef} (${po?.lines.map((l) => `${l.sku} ${fmtQty(l.qty, l.unit)} ${l.unit}`).join(", ")}). RBM has corrected the reference after buyer confirmation; the invoice is approved for payment of AED ${fmt2(t.payableNow)} on its due date ${inv.dueDate}. Ask them to quote the correct PO on future invoices.`,
      );
    if (k === "hold_for_trn")
      asks.push(
        `The invoice charges VAT AED ${fmt2(Math.abs(inv.vatAmount))} but prints no TRN, and no VAT registration certificate is on file. The invoice (AED ${fmt2(inv.total)}) is on hold. Ask for either (a) a valid tax invoice showing their TRN plus a copy of the VAT registration certificate, or (b) if they are not VAT-registered, written confirmation and a re-issued invoice without VAT for AED ${fmt2(Math.abs(inv.taxableAmount))}.`,
      );
    if (k === "request_corrected_invoice" && t.correctedVat)
      asks.push(
        `VAT must be 5% of the taxable amount after the discount: 5% × ${fmt2(Math.abs(inv.taxableAmount))} = ${fmt2(t.correctedVat.expected)}, not ${fmt2(t.correctedVat.charged)} (difference ${fmt2(t.correctedVat.diff)}). Ask for a corrected tax invoice totalling AED ${fmt2(Math.abs(inv.taxableAmount) + t.correctedVat.expected)}; the invoice is on hold until it is received because input VAT cannot be recovered on an incorrect tax invoice.`,
      );
    if (k === "short_pay")
      for (const s of t.shortQty)
        asks.push(
          `Goods received note recorded less than invoiced for ${s.sku}: short ${fmtQty(s.qty, s.unit)} ${s.unit}. RBM pays to the GRN quantity: AED ${fmt2(t.payableNow)} now. Ask for a credit note for ${fmtQty(s.qty, s.unit)} ${s.unit} = AED ${fmt2(s.net)} + VAT ${fmt2(s.vat)} = AED ${fmt2(s.net + s.vat)}.`,
        );
    if (k === "pay_at_po_price")
      for (const p of t.priceVar)
        asks.push(
          `${p.sku} invoiced at ${fmt2(p.invPrice)} against the PO price ${fmt2(p.poPrice)} (${po?.priceBasis ?? "PO price"}); any increase needs a valid, accepted quotation. RBM pays at PO price: AED ${fmt2(t.payableNow)} now. Ask for a credit note for the difference ${fmt2(p.qty)} × ${fmt2(p.invPrice - p.poPrice)} = AED ${fmt2(p.net)} + VAT ${fmt2(p.vat)} = AED ${fmt2(p.net + p.vat)}.`,
        );
    if (k === "reject_line")
      for (const r of t.rejectedLines)
        asks.push(
          `The line "${r.description}" (AED ${fmt2(r.net)} + VAT ${fmt2(r.vat)}) is not on PO ${po?.id ?? inv.poRef}${po?.deliveryTerms === "delivered" ? " which is a delivered price including transport" : ""}${inv.supplierId === "SUP-NEC" ? "; RBM has not accepted the surcharge proposed in letter NEC/SALES/2026/208 and the contract price AED 14.20/bag applies to 31 Dec 2026" : ""}. The line is rejected; the balance AED ${fmt2(t.payableNow)} is approved. Ask for a credit note of AED ${fmt2(r.net + r.vat)} for the rejected line.`,
        );
    if (k === "apply_credit_note" && t.creditBalance)
      asks.push(
        `Credit note ${inv.supplierInvoiceNo} (AED ${fmt2(Math.abs(inv.total))}) has been applied against ${inv.relatedInvoiceNo}. It covers ${fmtQty(Math.abs(inv.lines[0]?.qty ?? 0), inv.lines[0]?.unit ?? "")} ${inv.lines[0]?.unit ?? ""}, but the GRN recorded ${fmtQty(t.creditBalance.qty + Math.abs(inv.lines[0]?.qty ?? 0), inv.lines[0]?.unit ?? "")} rejected. Ask for a further credit note for the balance ${fmtQty(t.creditBalance.qty, inv.lines[0]?.unit ?? "")} ${inv.lines[0]?.unit ?? ""} × ${fmt2(t.creditBalance.net / t.creditBalance.qty)} = AED ${fmt2(t.creditBalance.net)} + VAT ${fmt2(t.creditBalance.vat)} = AED ${fmt2(t.creditBalance.gross)}.`,
      );
  }
  return asks;
}

export function caseFacts(inv: Invoice, match: MatchResult, t: Treatment, sup: Supplier | undefined) {
  return {
    document: {
      register: inv.id,
      type: inv.docType,
      supplier: inv.supplierName,
      number: inv.supplierInvoiceNo,
      date: inv.invoiceDate,
      poQuoted: inv.poRef,
      total: fmt2(inv.total),
      vat: fmt2(inv.vatAmount),
      trnPrinted: inv.trnOnInvoice,
      supplierTermsDays: sup?.paymentTermsDays,
      dueDate: inv.dueDate,
    },
    failedChecks: match.checks
      .filter((c) => c.status === "fail")
      .map((c) => ({ check: c.label.en, expected: c.expected, actual: c.actual, variance: fmt2(c.variance), note: c.detail.en })),
    computedTreatment: {
      treatment: t.kind,
      label: TREATMENT_LABELS[t.kind].en,
      allTreatments: t.kinds,
      invoiceTotal: fmt2(t.invoiceTotal),
      payableNow: fmt2(t.payableNow),
      toApSuspense: fmt2(t.toSuspense),
      toRecoverFromSupplier: fmt2(t.recover),
      paymentAvoided: fmt2(t.paymentAvoided),
      correctedVat: t.correctedVat && { expected: fmt2(t.correctedVat.expected), charged: fmt2(t.correctedVat.charged), difference: fmt2(t.correctedVat.diff) },
      correctedPoRef: t.correctedPoRef,
      creditBalance: t.creditBalance && { qty: t.creditBalance.qty, gross: fmt2(t.creditBalance.gross) },
      newStatus: t.newStatus,
      journal: t.journal.lines.map((l) => `${l.account} ${l.accountName}: Dr ${fmt2(l.debit)} / Cr ${fmt2(l.credit)}`),
      approver: t.approver.rule,
    },
  };
}
