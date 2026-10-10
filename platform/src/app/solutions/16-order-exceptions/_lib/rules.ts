/** Business rules & formatting shared by detection, impact and UI (pure). */
import type { Bi, Customer, MasterSubset, Product } from "./types";

export const SLUG = "16-order-exceptions";

/** RBM-COM-PRC-07 rev. 2 — maximum discount off PL-2026-Q4 without further approval. */
export const ALLOWED_DISCOUNT: Record<"A" | "B" | "C", number> = { A: 0.05, B: 0.035, C: 0.02 };
export const PRICING_REF = "RBM-COM-PRC-07";

export const APPROVERS = {
  planning: { name: "Joseph Abraham", title: "Supply Chain & Planning Manager" },
  cfo: { name: "Priya Raghavan", title: "Group CFO" },
  sales: { name: "Fadi Khoury", title: "Sales Director, RBM" },
  credit: { name: "Nadia Rahimi", title: "Credit Controller, Group Finance" },
  dispatch: { name: "Marwan Qasim", title: "Logistics & Dispatch Supervisor, MN-05" },
};

export const WH_LABEL: Record<string, Bi> = {
  JA: { en: "Jebel Ali", ar: "جبل علي" },
  MN05: { en: "MN-05 Ras Al Marsa", ar: "رأس المرسى MN-05" },
};

export const TYPE_LABEL: Record<string, Bi> = {
  stock: { en: "Stock", ar: "المخزون" },
  price: { en: "Price", ar: "السعر" },
  window: { en: "Delivery window", ar: "نافذة التسليم" },
  credit: { en: "Credit", ar: "الائتمان" },
};

export const ZONE_AR: Record<string, string> = {
  "MN-08 Marina Quarter": "حي المارينا MN-08",
  "MN-03 Al Lulu Island": "جزيرة اللؤلؤ MN-03",
  "MN-06 Al Sidr Residential": "السدر السكنية MN-06",
  "Other Marsa Al Noor districts": "مناطق مرسى النور الأخرى",
  "Dubai sites": "مواقع دبي",
};

export const round2 = (n: number) => Math.round(n * 100) / 100;

export function fmtNum(n: number, dp = 0) {
  return n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
/** Exact-looking AED amounts: "AED 2,109,582" (en) · "2,109,582 درهم" (ar). */
export function aedBi(n: number, dp = 0): Bi {
  const v = fmtNum(Math.abs(n) < 0.005 ? 0 : n, dp);
  return { en: `AED ${v}`, ar: `${v} درهم` };
}
export function aedText(n: number, lang: "en" | "ar", dp = 0) {
  return aedBi(n, dp)[lang];
}
export function qtyBi(n: number, p?: Pick<Product, "unit" | "unitAr">): Bi {
  const dp = Number.isInteger(n) ? 0 : Math.abs(n * 10 - Math.round(n * 10)) < 1e-6 ? 1 : 2;
  const v = fmtNum(n, dp);
  return { en: `${v} ${p?.unit ?? ""}`.trim(), ar: `${v} ${p?.unitAr ?? p?.unit ?? ""}`.trim() };
}

export function productOf(m: MasterSubset, sku: string): Product | undefined {
  return m.products.find((p) => p.sku === sku);
}
export function customerOf(m: MasterSubset, id: string): Customer | undefined {
  return m.customers.find((c) => c.id === id);
}
export function contractOf(m: MasterSubset, customerId: string) {
  return m.contracts.find((c) => c.customerId === customerId);
}
export function isRebar(m: MasterSubset, sku: string) {
  return productOf(m, sku)?.category === "Steel";
}

/** Reference price for a line (frame rate for key accounts, otherwise list with allowed tier discount). */
export function referencePrice(m: MasterSubset, customer: Customer, sku: string) {
  const p = productOf(m, sku);
  const k = contractOf(m, customer.id);
  if (k && k.rates[sku] != null) {
    return { kind: "contract" as const, reference: k.rates[sku], contractId: k.id, q3Rate: k.ratesQ3?.[sku], list: p?.listPrice ?? 0 };
  }
  const pct = ALLOWED_DISCOUNT[customer.tier] ?? 0;
  const list = p?.listPrice ?? 0;
  return { kind: "list" as const, reference: list, allowedDiscountPct: pct, minAllowed: round2(list * (1 - pct)), list };
}

/** Trucks needed for a quantity (25 t trailers for steel, 600 bags per 30 t truck for cement, 1 otherwise). */
export function trucksFor(m: MasterSubset, sku: string, qty: number) {
  const p = productOf(m, sku);
  if (!p || qty <= 0) return 0;
  if (p.category === "Steel") return Math.ceil(qty / m.deliveryRules.truckCapacityT - 1e-9);
  if (p.category === "Cement") return Math.ceil(qty / 600 - 1e-9);
  if (p.unit === "pc") return Math.ceil(qty / 8100 - 1e-9); // 90 pallets × 90 pcs per trailer
  return 1;
}

export function personTitle(m: MasterSubset, name: string, lang: "en" | "ar") {
  const p = m.people.find((x) => x.name === name);
  if (!p) return name;
  return lang === "ar" ? `${p.nameAr} — ${p.roleAr}` : `${p.name} — ${p.role}`;
}
