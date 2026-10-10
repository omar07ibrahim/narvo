import "server-only";
import { z } from "zod";
import { generateObject } from "@/lib/ai/json";
import type { ExtractedInvoice, Product } from "./types";
import { SLUG } from "./data";

const numLike = z.union([z.number(), z.string()]).nullable();

const schema = z.object({
  documentType: z.enum(["tax_invoice", "credit_note", "other"]),
  supplierName: z.string().nullable().describe("Issuer company name in English as printed in the letterhead"),
  supplierTrn: z.string().nullable().describe("The ISSUER's 15-digit TRN; null if the issuer prints none"),
  invoiceNo: z.string().nullable(),
  invoiceDate: z.string().nullable().describe("ISO yyyy-mm-dd"),
  poRef: z.string().nullable().describe("Customer purchase order reference exactly as printed"),
  deliveryRefs: z.array(z.string()).describe("Delivery note / trip sheet / GRN references printed"),
  billToName: z.string().nullable(),
  billToTrn: z.string().nullable(),
  lines: z.array(
    z.object({
      description: z.string(),
      sku: z.string().nullable().describe("Item code printed on the line, or the matching RBM code from the list"),
      qty: numLike,
      unit: z.string().nullable(),
      unitPrice: numLike,
      amount: numLike,
      isCharge: z.boolean().describe("true only for add-on rows without an item code (surcharge, levy, delivery charge); false for supplied goods and contracted services"),
    }),
  ),
  grossAmount: numLike.describe("Sub-total before discount"),
  discountAmount: numLike,
  taxableAmount: numLike.describe("Net amount subject to VAT as printed (sub-total if no discount)"),
  vatAmount: numLike,
  total: numLike,
  iban: z.string().nullable(),
  confidence: z.object({
    supplierName: z.number(),
    supplierTrn: z.number(),
    invoiceNo: z.number(),
    invoiceDate: z.number(),
    poRef: z.number(),
    lines: z.number(),
    totals: z.number(),
  }),
  observations: z.array(z.string()).describe("2–5 short factual notes about what is printed: charges, discount, missing fields, stamps"),
});

const toNum = (v: number | string | null | undefined): number | null => {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = v.replace(/[()]/g, "").replace(/[^0-9.\-]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const clamp = (n: number) => {
  const v = n > 1 ? n / 100 : n;
  return Math.max(0, Math.min(1, v));
};

function system(products: Product[], lang: "en" | "ar") {
  return [
    "You are the document-reading component of the Accounts Payable desk at Raseen Building Materials Trading LLC (RBM), Dubai.",
    "You read scanned supplier tax invoices and credit notes. Transcribe EXACTLY what is printed — never correct, recompute or infer a value; if a field is not printed return null.",
    "Dates: convert DD/MM/YYYY or DD-Mon-YYYY to ISO yyyy-mm-dd. Amounts: plain numbers, no thousands separators, discounts as positive numbers.",
    "Supplier TRN: the issuer's own TRN only. RBM's TRN 100274910600003 is the CUSTOMER (bill-to) TRN — never return it as the supplier TRN.",
    "Lines: every row of the item table in order. isCharge=true ONLY for add-on rows that carry no item code and sit on top of the supplied goods — surcharges, levies, 'delivery charges', pallet or fuel charges. A row with a printed item code (including freight-service codes such as FRT-…) is the supplied item or contracted service itself: isCharge=false.",
    `RBM item codes (use only if printed or clearly the same item): ${products.map((p) => `${p.sku} = ${p.name} (${p.unit})`).join("; ")}; freight services FRT-JA-MN05-T, FRT-JA-MN05-P, FRT-SHUTTLE-10T.`,
    "confidence: 0–1 per group, reflecting legibility (stamps or handwriting over text lower it).",
    `observations: short factual notes in ${lang === "ar" ? "Arabic" : "English"} — e.g. extra charges, discount and the VAT base, missing TRN, stamps. Do not judge or recommend.`,
  ].join("\n");
}

export async function extractInvoiceImage(opts: {
  dataUrl: string;
  products: Product[];
  modelKey?: string | null;
  lang: "en" | "ar";
  task?: string;
}): Promise<{ object: ExtractedInvoice; ms: number; model: string }> {
  const r = await generateObject({
    schema,
    name: "supplier_invoice",
    system: system(opts.products, opts.lang),
    user: [
      { type: "text", text: "Read this supplier document and return its header, lines and totals." },
      { type: "image_url", image_url: { url: opts.dataUrl } },
    ],
    modelKey: opts.modelKey,
    solution: SLUG,
    task: opts.task ?? "extract.invoice",
    maxTokens: 2200,
    temperature: 0,
  });
  const o = r.object;
  const object: ExtractedInvoice = {
    documentType: o.documentType,
    supplierName: o.supplierName,
    supplierTrn: o.supplierTrn && o.supplierTrn.replace(/\D/g, "") === "100274910600003" ? null : o.supplierTrn,
    invoiceNo: o.invoiceNo,
    invoiceDate: o.invoiceDate,
    poRef: o.poRef,
    deliveryRefs: o.deliveryRefs ?? [],
    billToName: o.billToName,
    billToTrn: o.billToTrn,
    lines: o.lines.map((l) => ({ ...l, qty: toNum(l.qty), unitPrice: toNum(l.unitPrice), amount: toNum(l.amount) })),
    grossAmount: toNum(o.grossAmount),
    discountAmount: toNum(o.discountAmount) != null ? Math.abs(toNum(o.discountAmount)!) : null,
    taxableAmount: toNum(o.taxableAmount),
    vatAmount: toNum(o.vatAmount),
    total: toNum(o.total),
    iban: o.iban,
    confidence: {
      supplierName: clamp(o.confidence.supplierName),
      supplierTrn: clamp(o.confidence.supplierTrn),
      invoiceNo: clamp(o.confidence.invoiceNo),
      invoiceDate: clamp(o.confidence.invoiceDate),
      poRef: clamp(o.confidence.poRef),
      lines: clamp(o.confidence.lines),
      totals: clamp(o.confidence.totals),
    },
    observations: o.observations ?? [],
  };
  return { object, ms: r.ms, model: r.model };
}
