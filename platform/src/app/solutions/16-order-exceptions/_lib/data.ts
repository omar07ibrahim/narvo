import "server-only";
import { readJson } from "@/lib/world/data";
import { getApproval, kvGet, kvSet, withOverlay } from "@/lib/store/db";
import { SLUG } from "./rules";
import type { Citation } from "@/lib/ai/events";
import type {
  AltSource,
  ExceptionHistoryItem,
  HistoryLine,
  InboundPo,
  LiveResolution,
  MasterSubset,
  Proposal,
  ProposedOption,
  OptionImpact,
  SalesOrder,
  Snapshot,
  StockItem,
} from "./types";

export const COL = {
  orders: `${SLUG}/orders`,
  resolutions: `${SLUG}/resolutions`,
  handovers: `${SLUG}/handovers`,
  notifications: `${SLUG}/notifications`,
};
export const KV = {
  proposals: `${SLUG}:proposals`,
  opened: `${SLUG}:opened`,
  options: (orderId: string) => `${SLUG}:options:${orderId}`,
};

const DIR = `raseen/${SLUG}`;

export function loadMaster(): MasterSubset {
  const raw = readJson<Record<string, any>>("raseen/knowledge/reference/raseen-master.json");
  return {
    vatRate: raw.vatRate,
    priceList: raw.company.priceList,
    products: raw.products,
    customers: raw.customers,
    contracts: raw.contracts,
    suppliers: raw.suppliers.map((s: any) => ({ id: s.id, name: s.name, nameAr: s.nameAr, note: s.note })),
    people: raw.people,
    creditPolicy: raw.creditPolicy,
    deliveryRules: raw.deliveryRules,
  };
}

export function loadOrders(): SalesOrder[] {
  const seed = readJson<{ orders: SalesOrder[] }>(`${DIR}/sales-orders.json`).orders;
  return withOverlay<SalesOrder>(COL.orders, seed);
}

function loadProposals(orders: SalesOrder[]): Record<string, Proposal> {
  const all = kvGet<Record<string, Proposal>>(KV.proposals) ?? {};
  const out: Record<string, Proposal> = {};
  for (const [id, p] of Object.entries(all)) {
    const o = orders.find((x) => x.id === id);
    // A proposal is superseded once an approved resolution has patched the order.
    if (o && !(o._updatedAt && o._updatedAt > p.createdAt)) out[id] = p;
  }
  return out;
}

export function saveProposal(p: Proposal) {
  const all = kvGet<Record<string, Proposal>>(KV.proposals) ?? {};
  kvSet(KV.proposals, { ...all, [p.orderId]: p });
}
export function clearProposal(orderId: string) {
  const all = { ...(kvGet<Record<string, Proposal>>(KV.proposals) ?? {}) };
  delete all[orderId];
  kvSet(KV.proposals, all);
}
export function getProposal(orderId: string): Proposal | null {
  return loadProposals(loadOrders())[orderId] ?? null;
}

/** First AI action on an order marks the case as opened (effort is measured from here to approval). */
export function markOpened(orderId: string): number {
  const all = kvGet<Record<string, number>>(KV.opened) ?? {};
  if (all[orderId]) return all[orderId];
  const t = Date.now();
  kvSet(KV.opened, { ...all, [orderId]: t });
  return t;
}
export function openedAt(orderId: string): number | null {
  return (kvGet<Record<string, number>>(KV.opened) ?? {})[orderId] ?? null;
}

export interface StoredOptions {
  orderId: string;
  createdAt: number;
  proposalId: string | null;
  options: Array<{ option: ProposedOption; impact: OptionImpact }>;
  recommended: string | null;
  recommendedReason: string;
  citations: Citation[];
  brief?: string;
}
export function saveOptions(v: StoredOptions) {
  kvSet(KV.options(v.orderId), v);
}
export function getOptions(orderId: string): StoredOptions | null {
  return kvGet<StoredOptions>(KV.options(orderId)) ?? null;
}

export function loadSnapshot(): Snapshot {
  const orders = loadOrders();
  const stock = readJson<{ items: StockItem[] }>(`${DIR}/stock.json`).items;
  const inb = readJson<{ pos: InboundPo[]; alternativeSources: AltSource[] }>(`${DIR}/inbound.json`);
  const resolutions = withOverlay<LiveResolution>(COL.resolutions, []).map((r) => {
    const opened = Date.parse(r.openedAt);
    const approvedAt = r._createdAt ?? (r.approvalId ? getApproval(r.approvalId)?.decidedAt : undefined);
    return { ...r, effortMinutes: approvedAt && opened ? Math.max(1, Math.round((approvedAt - opened) / 60000)) : null };
  });
  return {
    paymentCommitments: readJson<{ items: Snapshot["paymentCommitments"] }>(`${DIR}/payment-commitments.json`).items,
    orders,
    stock,
    inbound: inb.pos,
    altSources: inb.alternativeSources,
    master: loadMaster(),
    deliveryHistory: readJson<{ lines: HistoryLine[] }>(`${DIR}/delivery-history.json`).lines,
    exceptionHistory: readJson<{ items: ExceptionHistoryItem[] }>(`${DIR}/exception-history.json`).items,
    resolutions,
    proposals: loadProposals(orders),
    notifications: withOverlay(COL.notifications, []) as Snapshot["notifications"],
    handovers: withOverlay(COL.handovers, []) as Snapshot["handovers"],
  };
}

export interface CustomerDoc {
  id: string;
  title: { en: string; ar: string };
  channel: string;
  lang: string;
  from: string;
  receivedAt: string;
  orderHint: string;
  text: string;
}
export function loadCustomerDocs(): CustomerDoc[] {
  return readJson<CustomerDoc[]>(`${DIR}/customer-docs.json`);
}
