import "server-only";
import { readJson } from "@/lib/world/data";
import { kvGet, kvSet, listApprovals, withOverlay } from "@/lib/store/db";
import type { MatchContext } from "./three-way";
import type {
  ApPolicy,
  Dataset,
  Grn,
  HistoryItem,
  Invoice,
  JournalEntry,
  OutboxEmail,
  Product,
  PurchaseOrder,
  StoredCase,
  StoredExtraction,
  Supplier,
} from "./types";

export const SLUG = "14-finance-operations";
export const COL_INVOICES = `${SLUG}/invoices`;
export const COL_JOURNALS = `${SLUG}/journals`;
export const COL_OUTBOX = `${SLUG}/outbox`;
export const KV_CASES = `${SLUG}:cases`;
export const KV_EXTRACTIONS = `${SLUG}:extractions`;
export const kvUploadKey = (id: string) => `${SLUG}:upload:${id}`;

interface Master {
  vatRate: number;
  company: { name: string; nameAr: string; trn: string };
  people: Array<{ name: string; role: string; email: string }>;
  products: Product[];
  suppliers: Supplier[];
  apPolicy: ApPolicy;
}

export function loadMaster(): Master {
  return readJson<Master>("raseen/knowledge/reference/raseen-master.json");
}

export function loadInvoices(): Invoice[] {
  const seed = readJson<Invoice[]>(`raseen/${SLUG}/invoices.json`).map((i) => ({ ...i, source: "seed" as const }));
  return withOverlay<Invoice>(COL_INVOICES, seed).map((i) => ({
    ...i,
    resolvedAt: i.status !== "received" ? (i.resolvedAt ?? i._updatedAt) : undefined,
  }));
}

export function loadPos(): PurchaseOrder[] {
  return readJson<PurchaseOrder[]>(`raseen/${SLUG}/purchase-orders.json`);
}

export function loadGrns(): Grn[] {
  return readJson<Grn[]>(`raseen/${SLUG}/grns.json`);
}

export function loadHistory(): HistoryItem[] {
  return readJson<HistoryItem[]>(`raseen/${SLUG}/resolution-history.json`);
}

export function loadCases(): Record<string, StoredCase> {
  return kvGet<Record<string, StoredCase>>(KV_CASES) ?? {};
}

export function saveCase(c: StoredCase) {
  kvSet(KV_CASES, { ...loadCases(), [c.invoiceId]: c });
}

export function loadExtractions(): Record<string, StoredExtraction> {
  return kvGet<Record<string, StoredExtraction>>(KV_EXTRACTIONS) ?? {};
}

export function saveExtraction(invoiceId: string, x: StoredExtraction) {
  kvSet(KV_EXTRACTIONS, { ...loadExtractions(), [invoiceId]: x });
}

export function matchContext(): MatchContext & { master: Master } {
  const master = loadMaster();
  return {
    master,
    invoices: loadInvoices(),
    pos: loadPos(),
    grns: loadGrns(),
    suppliers: master.suppliers,
    policy: master.apPolicy,
    vatRate: master.vatRate,
    history: loadHistory(),
  };
}

export function loadDataset(): Dataset {
  const master = loadMaster();
  const approvals = Object.fromEntries(listApprovals({ solution: SLUG }).map((a) => [a.id, a.status]));
  const cases = loadCases();
  for (const c of Object.values(cases)) if (c.approval && approvals[c.approval.id]) c.approval.status = approvals[c.approval.id];
  return {
    invoices: loadInvoices(),
    pos: loadPos(),
    grns: loadGrns(),
    suppliers: master.suppliers,
    products: master.products,
    policy: master.apPolicy,
    vatRate: master.vatRate,
    history: loadHistory(),
    journals: withOverlay<JournalEntry>(COL_JOURNALS, []),
    outbox: withOverlay<OutboxEmail>(COL_OUTBOX, []),
    cases,
    extractions: loadExtractions(),
    approvals,
    company: { name: master.company.name, nameAr: master.company.nameAr, trn: master.company.trn },
    people: master.people.map((p) => ({ name: p.name, role: p.role, email: p.email })),
  };
}
