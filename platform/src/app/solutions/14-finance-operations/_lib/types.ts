/** Shared types for solution 14 — Finance Operations Intelligence (no server-only imports). */

export type Bi = { en: string; ar: string };

export interface Supplier {
  id: string;
  name: string;
  nameAr: string;
  trn: string | null;
  paymentTermsDays: number;
  contact: string;
  email: string;
  categories: string[];
  invoicePrefix: string;
  note?: string;
}

export interface Product {
  sku: string;
  name: string;
  nameAr: string;
  unit: string;
  unitAr: string;
  stdCost: number;
  supplierId: string;
  category: string;
}

export interface ApPolicy {
  ref: string;
  qtyTolerancePct: number;
  priceTolerancePct: number;
  totalToleranceAed: number;
  vatToleranceAed: number;
  approvalMatrix: Array<{ upToAed: number | null; approver: string; title: string }>;
  accounts: { apControl: string; grir: string; inputVat: string; ppv: string; freightIn: string; suspense: string };
}

export interface PoLine {
  lineNo: number;
  sku: string;
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  amount: number;
}

export interface PurchaseOrder {
  id: string;
  supplierId: string;
  date: string;
  buyer: string;
  kind: "goods" | "service";
  deliveryTerms: string;
  deliveryPoint: string;
  warehouse: "JA" | "MN05";
  currency: string;
  priceBasis: string;
  discountPct: number;
  note: string | null;
  status: string;
  lines: PoLine[];
  netAmount: number;
}

export interface GrnLine {
  lineNo: number;
  sku: string;
  description: string;
  unit: string;
  orderedQty: number;
  deliveredQty: number;
  receivedQty: number;
  acceptedQty: number;
  rejectedQty: number;
  rejectReason: string | null;
}

export interface Grn {
  id: string;
  poId: string;
  supplierId: string;
  kind: "goods" | "service";
  warehouse: "JA" | "MN05";
  date: string;
  deliveryNote: string;
  receivedBy: string;
  lines: GrnLine[];
  weighbridge: Array<{ ticket: string; vehicle: string; grossKg: number; tareKg: number; netKg: number }> | null;
  remarks: string;
}

export interface InvoiceLine {
  lineNo: number;
  kind: "item" | "charge";
  sku: string | null;
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  amount: number;
}

export type InvoiceStatus =
  | "received"
  | "approved_for_payment"
  | "short_paid"
  | "rejected"
  | "on_hold"
  | "credit_applied";

export interface Invoice {
  id: string;
  docType: "invoice" | "credit_note";
  supplierId: string;
  supplierName: string;
  supplierInvoiceNo: string;
  invoiceDate: string;
  receivedDate: string;
  channel: string;
  poRef: string;
  grnRefs: string[];
  deliveryNoteRefs: string[];
  lines: InvoiceLine[];
  grossAmount: number;
  discount: { label: string; pct: number; amount: number } | null;
  taxableAmount: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  currency: string;
  trnOnInvoice: string | null;
  image: string | null;
  dueDate: string;
  paymentTermsDays: number;
  relatedInvoiceNo: string | null;
  reason: string | null;
  note: string | null;
  status: InvoiceStatus;
  /* runtime (overlay) */
  source?: "seed" | "upload";
  payableAmount?: number;
  treatment?: string;
  poRefCorrected?: string;
  caseOpenedAt?: number;
  resolvedAt?: number;
  approvalId?: string;
  resolutionNote?: string;
  _updatedAt?: number;
  _createdAt?: number;
}

export interface HistoryItem {
  id: string;
  batch: string;
  supplierId: string;
  invoiceNo: string;
  poRef: string;
  invoiceTotal: number;
  type: string;
  variance: number;
  treatment: string;
  outcome: string;
  openedAt: string;
  resolvedAt: string;
  effortMinutes: number;
  handledBy: string;
  approvedBy: string;
  reopened: boolean;
}

export interface JournalLine {
  account: string;
  accountName: string;
  debit: number;
  credit: number;
  memo: string;
}

export interface JournalEntry {
  id: string;
  invoiceId: string;
  supplierInvoiceNo: string;
  supplierId: string;
  date: string;
  memo: string;
  lines: JournalLine[];
  treatment: string;
  approvedBy?: string;
  _createdAt?: number;
}

export interface OutboxEmail {
  id: string;
  invoiceId: string;
  to: string;
  cc?: string;
  subject: string;
  body: string;
  status: "sent";
  _createdAt?: number;
}

/* ───────── Match ───────── */

export type CheckId = "po" | "duplicate" | "trn" | "qty" | "price" | "charges" | "vat" | "total" | "credit";
export type CheckStatus = "pass" | "fail" | "warn" | "na";

export interface CheckResult {
  id: CheckId;
  label: Bi;
  status: CheckStatus;
  expected: string;
  actual: string;
  variance: number;
  detail: Bi;
}

export type CellTone = "ok" | "warn" | "fail" | "na";

export interface LineCompare {
  lineNo: number;
  kind: "item" | "charge";
  sku: string | null;
  description: string;
  unit: string;
  inv: { qty: number; unitPrice: number; amount: number };
  po: { qty: number; unitPrice: number } | null;
  grn: { delivered: number; received: number; accepted: number; rejected: number } | null;
  qtyTone: CellTone;
  priceTone: CellTone;
  lineTone: CellTone;
  qtyVariance: number;
  priceVariance: number;
  note?: Bi;
}

export interface CandidatePo {
  id: string;
  score: number;
  reason: Bi;
}

export interface MatchResult {
  invoiceId: string;
  poId: string | null;
  poQuoted: string;
  poCorrected: boolean;
  grnIds: string[];
  checks: CheckResult[];
  lines: LineCompare[];
  exception: boolean;
  primary: CheckId | null;
  variance: number;
  unmatchedValue: number;
  candidatePo: CandidatePo | null;
  expected: { gross: number; discount: number; taxable: number; vat: number; total: number };
  duplicateOf: string | null;
  creditBalance: { qty: number; net: number; vat: number; gross: number; sku: string } | null;
}

export interface Dataset {
  invoices: Invoice[];
  pos: PurchaseOrder[];
  grns: Grn[];
  suppliers: Supplier[];
  products: Product[];
  policy: ApPolicy;
  vatRate: number;
  history: HistoryItem[];
  journals: JournalEntry[];
  outbox: OutboxEmail[];
  cases: Record<string, StoredCase>;
  extractions: Record<string, StoredExtraction>;
  approvals: Record<string, "pending" | "approved" | "rejected">;
  company: { name: string; nameAr: string; trn: string };
  people: Array<{ name: string; role: string; email: string }>;
}

/* ───────── Treatment ───────── */

export type TreatmentKind =
  | "reject_duplicate"
  | "correct_po_reference"
  | "hold_for_trn"
  | "request_corrected_invoice"
  | "short_pay"
  | "pay_at_po_price"
  | "reject_line"
  | "apply_credit_note"
  | "approve";

export interface Treatment {
  kind: TreatmentKind;
  kinds: TreatmentKind[];
  invoiceTotal: number;
  payableNow: number;
  toSuspense: number;
  recover: number;
  paymentAvoided: number;
  correctedVat: { expected: number; charged: number; diff: number } | null;
  correctedPoRef: string | null;
  rejectedLines: Array<{ description: string; net: number; vat: number }>;
  shortQty: Array<{ sku: string; qty: number; unit: string; net: number; vat: number }>;
  priceVar: Array<{ sku: string; qty: number; invPrice: number; poPrice: number; net: number; vat: number }>;
  creditBalance: { qty: number; net: number; vat: number; gross: number; sku: string } | null;
  newStatus: InvoiceStatus;
  journal: { lines: JournalLine[]; memo: string; balanced: boolean };
  approver: { name: string; title: string; amount: number; threshold: number | null; rule: string };
}

/* ───────── Stored AI results ───────── */

export interface ExtractedInvoice {
  documentType: "tax_invoice" | "credit_note" | "other";
  supplierName: string | null;
  supplierTrn: string | null;
  invoiceNo: string | null;
  invoiceDate: string | null;
  poRef: string | null;
  deliveryRefs: string[];
  billToName: string | null;
  billToTrn: string | null;
  lines: Array<{ description: string; sku: string | null; qty: number | null; unit: string | null; unitPrice: number | null; amount: number | null; isCharge: boolean }>;
  grossAmount: number | null;
  discountAmount: number | null;
  taxableAmount: number | null;
  vatAmount: number | null;
  total: number | null;
  iban: string | null;
  confidence: {
    supplierName: number;
    supplierTrn: number;
    invoiceNo: number;
    invoiceDate: number;
    poRef: number;
    lines: number;
    totals: number;
  };
  observations: string[];
}

export interface FieldCompare {
  key: string;
  label: Bi;
  extracted: string | null;
  system: string | null;
  confidence: number;
  status: "ok" | "mismatch" | "missing" | "check";
  note?: Bi;
}

export interface StoredExtraction {
  at: number;
  ms: number;
  model: string;
  object: ExtractedInvoice;
}

export interface CaseAi {
  headline: string;
  explanation: string;
  evidence: Array<{ text: string; cites: number[] }>;
  recommendation: { treatment: TreatmentKind; agrees: boolean; rationale: string };
  nextSteps: string[];
}

export interface CaseCitation {
  n: number;
  docId: string;
  title: string;
  ref?: string;
  section?: string;
  quote: string;
}

export interface StoredCase {
  invoiceId: string;
  at: number;
  lang: "en" | "ar";
  treatment: Treatment;
  ai: CaseAi;
  citations: CaseCitation[];
  email: { to: string; cc: string; subject: string; body: string };
  approval: {
    id: string;
    title: string;
    summary: string;
    solution: string;
    actionLabel: string;
    approver: { name: string; title: string };
    status: "pending" | "approved" | "rejected";
    createdAt: number;
  } | null;
  model?: string;
}
