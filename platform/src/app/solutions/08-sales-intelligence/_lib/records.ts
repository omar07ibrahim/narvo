import "server-only";
import { readJson } from "@/lib/world/data";
import { kvGet, withOverlay } from "@/lib/store/db";
import { DEMO_TODAY } from "@/lib/world/orgs";
import type {
  Account,
  CachedResult,
  Contact,
  Contract,
  CreditPolicy,
  CustomerDoc,
  Handover,
  Interaction,
  Opportunity,
  Person,
  Product,
  Quote,
  SalesData,
  Sample,
  SiteWindow,
} from "./types";

export const SLUG = "08-sales-intelligence";
export const COL_OPPS = `${SLUG}/opportunities`;
export const COL_INTERACTIONS = `${SLUG}/interactions`;
export const cacheKey = (kind: string, oppId: string) => `${SLUG}:${kind}:${oppId}`;

const DIR = `raseen/${SLUG}`;

interface Master {
  vatRate: number;
  people: Person[];
  products: Product[];
  customers: Omit<Account, "since" | "revenue2025" | "ytd2026" | "openOrdersInclVat" | "website" | "address" | "health" | "notes">[];
  contracts: Contract[];
  creditPolicy: CreditPolicy;
  deliveryRules: { siteWindows: SiteWindow[] };
}

export function loadMaster(): Master {
  return readJson<Master>("raseen/knowledge/reference/raseen-master.json");
}

export function loadSalesData(): SalesData {
  const master = loadMaster();
  const crm = readJson<Array<Pick<Account, "id" | "since" | "revenue2025" | "ytd2026" | "openOrdersInclVat" | "website" | "address" | "health" | "notes">>>(
    `${DIR}/accounts.json`,
  );
  const accounts: Account[] = master.customers.map((c) => {
    const x = crm.find((a) => a.id === c.id);
    return {
      ...c,
      since: x?.since ?? 2020,
      revenue2025: x?.revenue2025 ?? 0,
      ytd2026: x?.ytd2026 ?? 0,
      openOrdersInclVat: x?.openOrdersInclVat ?? 0,
      website: x?.website ?? "",
      address: x?.address ?? "",
      health: x?.health ?? "Steady",
      notes: x?.notes ?? "",
    } as Account;
  });
  const opportunities = withOverlay<Opportunity>(COL_OPPS, readJson<Opportunity[]>(`${DIR}/opportunities.json`));
  const interactions = withOverlay<Interaction>(COL_INTERACTIONS, readJson<Interaction[]>(`${DIR}/interactions.json`)).sort((a, b) =>
    a.at.localeCompare(b.at),
  );
  const cache: Record<string, CachedResult> = {};
  for (const o of opportunities) {
    for (const kind of ["brief", "handover", "conflicts"] as const) {
      const v = kvGet<CachedResult>(cacheKey(kind, o.id));
      if (v) cache[`${kind}:${o.id}`] = v;
    }
  }
  return {
    today: DEMO_TODAY,
    vatRate: master.vatRate,
    accounts,
    contacts: readJson<Contact[]>(`${DIR}/contacts.json`),
    opportunities,
    interactions,
    quotes: readJson<Quote[]>(`${DIR}/quotes.json`),
    customerDocs: readJson<CustomerDoc[]>(`${DIR}/customer-docs.json`),
    contracts: master.contracts,
    products: master.products,
    handovers: readJson<Handover[]>(`${DIR}/handovers.json`),
    samples: readJson<Sample[]>(`${DIR}/samples.json`),
    creditPolicy: master.creditPolicy,
    siteWindows: master.deliveryRules.siteWindows,
    people: master.people,
    cache,
  };
}

export function findOpp(data: SalesData, id: unknown) {
  return typeof id === "string" ? data.opportunities.find((o) => o.id === id) : undefined;
}
