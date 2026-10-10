/**
 * Turning an interpreted customer document into a proposed order change, and comparing detection
 * results before/after (pure — used by the interpret route and the options route).
 */
import { DOW_AR, DOW_EN, addDays, checkSlot, fmtDay, fmtSlot, weekday, zoneRule } from "./calendar";
import { analyzeWorld, openQty } from "./detect";
import { aedBi, customerOf, fmtNum, productOf, qtyBi, referencePrice, round2 } from "./rules";
import type { Bi, ExceptionItem, OrderAnalysis, Proposal, ProposalChange, SalesOrder, Snapshot } from "./types";

export interface Extraction {
  docType: "whatsapp" | "email" | "purchase_order" | "other";
  language: "ar" | "en" | "mixed";
  orderRef: string | null;
  customerPoRef: string | null;
  customerName: string | null;
  summary: string;
  requestedDelivery: { primary: string | null; alternatives: string[]; evidence: string } | null;
  lineChanges: Array<{ action: "add" | "change_qty" | "remove"; sku: string | null; description: string; qty: number | null; unit: string | null; evidence: string }>;
  priceClaims: Array<{ sku: string | null; claimedPrice: number; basis: string; evidence: string }>;
  split: { accepted: boolean | null; minFirstDropQty: number | null; balanceByDate: string | null; evidence: string } | null;
  paymentCommitment: { amount: number; date: string | null; evidence: string } | null;
  contacts: Array<{ name: string; role: string | null; phone: string | null; email: string | null }>;
  otherRequests: Array<{ text: string; evidence: string }>;
}

/* ───────────── Quote verification ───────────── */

function norm(t: string) {
  return t
    .normalize("NFKC")
    .replace(/[ً-ْـ]/g, "") // harakat + tatweel
    .replace(/[إأآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[“”"'`’]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

/** True when the quoted evidence really appears in the source text (exact or ≥ 80% token overlap in order). */
export function verifyQuote(source: string, quote: string | null | undefined) {
  if (!quote || quote.trim().length < 3) return false;
  const S = norm(source);
  const Q = norm(quote).replace(/^\.+|\.+$/g, "").trim();
  if (!Q) return false;
  if (S.includes(Q)) return true;
  const toks = Q.split(" ").filter((x) => x.length > 1);
  if (toks.length < 3) return false;
  let pos = 0;
  let hit = 0;
  for (const t of toks) {
    const i = S.indexOf(t, pos);
    if (i >= 0) {
      hit++;
      pos = i + t.length;
    }
  }
  return hit / toks.length >= 0.8;
}

const WEEKDAY_WORDS: Array<[RegExp, number]> = [
  [/\bsunday\b|الأحد|الاحد/i, 0],
  [/\bmonday\b|الاثنين|الإثنين|الاثنين/i, 1],
  [/\btuesday\b|الثلاثاء|الثلاثا/i, 2],
  [/\bwednesday\b|الأربعاء|الاربعاء|الاربعا/i, 3],
  [/\bthursday\b|الخميس/i, 4],
  [/\bfriday\b|الجمعة|الجمعه/i, 5],
  [/\bsaturday\b|السبت/i, 6],
];

/** The single weekday named in a quote (null if none or several). */
export function weekdayNamed(quote: string | null | undefined): number | null {
  if (!quote) return null;
  const hits = WEEKDAY_WORDS.filter(([re]) => re.test(quote)).map(([, d]) => d);
  return hits.length === 1 ? hits[0] : null;
}

/* ───────────── Build & apply ───────────── */

const SKU_RE = /^(CEM-OPC-50|CEM-SRC-50|RB-B500-(12|16|20|25)|BLK-HOL-20|TIL-POR-60120|TIL-CER-3060|SAN-WC-WH|WPF-BIT-4|PNT-TS-20)$/;

export function buildProposal(s: Snapshot, order: SalesOrder, x: Extraction, docTitle: string, text: string): Proposal {
  const m = s.master;
  const customer = customerOf(m, order.customerId)!;
  const rule = zoneRule(m.deliveryRules.siteWindows, order.zone);
  const permitDate = order.gatePermit?.date ?? null;
  const changes: ProposalChange[] = [];

  // Requested delivery: first candidate that fits the site window; otherwise the customer's primary request.
  let requested: string | null = null;
  if (x.requestedDelivery?.primary) {
    let cands = [x.requestedDelivery.primary, ...(x.requestedDelivery.alternatives ?? [])].filter((c) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(c)).map((c) => c.slice(0, 16));
    // Weekday guard: if the quoted words name a weekday the model's date does not fall on, shift to it.
    const named = weekdayNamed(x.requestedDelivery.evidence);
    if (cands[0] && named != null && weekday(cands[0].slice(0, 10)) !== named) {
      const w = weekday(cands[0].slice(0, 10));
      const delta = [((named - w + 7) % 7), ((named - w + 7) % 7) - 7].sort((a, b) => Math.abs(a) - Math.abs(b))[0];
      const fixed = cands.map((c) => `${addDays(c.slice(0, 10), delta)}${c.slice(10)}`);
      changes.push({
        kind: "note",
        applied: true,
        evidence: x.requestedDelivery.evidence,
        verified: verifyQuote(text, x.requestedDelivery.evidence),
        label: { en: `Date check: the message says ${DOW_EN[named]} — ${fmtSlot(cands[0])} corrected to ${fmtSlot(fixed[0])}`, ar: `تدقيق التاريخ: الرسالة تذكر ${DOW_AR[named]} — تم تصحيح ${fmtSlot(cands[0], "ar")} إلى ${fmtSlot(fixed[0], "ar")}` },
      });
      cands = fixed;
    }
    const valid = cands.find((c) => checkSlot(rule, c, { cityCentre: order.cityCentre, permitDate }).length === 0);
    requested = valid ?? cands[0] ?? null;
    if (requested && requested !== order.requestedDelivery) {
      const fallbackUsed = valid && valid !== cands[0];
      changes.push({
        kind: "requested_delivery",
        applied: true,
        evidence: x.requestedDelivery.evidence,
        verified: verifyQuote(text, x.requestedDelivery.evidence),
        label: {
          en: `Requested delivery ${fmtSlot(order.requestedDelivery)} → ${fmtSlot(requested)}${fallbackUsed ? ` (customer's fallback; ${fmtSlot(cands[0])} is outside the ${order.zone} window)` : ""}`,
          ar: `موعد التسليم المطلوب ${fmtSlot(order.requestedDelivery, "ar")} ← ${fmtSlot(requested, "ar")}${fallbackUsed ? ` (البديل الذي اقترحه المتعامل؛ ${fmtSlot(cands[0], "ar")} خارج نافذة الموقع)` : ""}`,
        },
      });
    }
  }

  const lineChanges: Proposal["lineChanges"] = [];
  for (const lc of x.lineChanges ?? []) {
    const sku = lc.sku && SKU_RE.test(lc.sku) ? lc.sku : null;
    const p = sku ? productOf(m, sku) : undefined;
    if (!sku || !p) {
      changes.push({ kind: "note", applied: false, evidence: lc.evidence, verified: verifyQuote(text, lc.evidence), label: { en: `Not applied — item not matched to the catalogue: "${lc.description}"`, ar: `لم يُطبّق — لم تتم مطابقة الصنف مع الكتالوج: "${lc.description}"` } });
      continue;
    }
    // Customers often order tiles in boxes: convert to m² (1.44 m²/box).
    let qty = lc.qty;
    if (qty != null && /box|كرتون|علب/i.test(`${lc.unit ?? ""} ${lc.description}`) && p.unit === "m²") qty = round2(qty * 1.44);
    const existing = order.lines.find((l) => l.sku === sku);
    if (lc.action === "add" && existing && qty != null) {
      lineChanges.push({ action: "change_qty", sku, qty: round2(existing.qty + qty) });
      changes.push({ kind: "change_qty", applied: true, evidence: lc.evidence, verified: verifyQuote(text, lc.evidence), label: { en: `${sku}: add ${qtyBi(qty, p).en} to line ${existing.lineNo} (${qtyBi(existing.qty, p).en} → ${qtyBi(existing.qty + qty, p).en})`, ar: `${sku}: إضافة ${qtyBi(qty, p).ar} إلى البند ${existing.lineNo} (${qtyBi(existing.qty, p).ar} ← ${qtyBi(existing.qty + qty, p).ar})` } });
    } else if (lc.action === "add" && qty != null) {
      const ref = referencePrice(m, customer, sku);
      const price = ref.kind === "contract" ? ref.reference : ref.list;
      lineChanges.push({ action: "add", sku, qty });
      changes.push({ kind: "add_line", applied: true, evidence: lc.evidence, verified: verifyQuote(text, lc.evidence), label: { en: `Add ${sku} ${qtyBi(qty, p).en} at ${ref.kind === "contract" ? `${ref.contractId} rate` : "list price"} AED ${fmtNum(price, 2)}`, ar: `إضافة ${sku} بكمية ${qtyBi(qty, p).ar} بسعر ${ref.kind === "contract" ? `اتفاقية ${ref.contractId}` : "القائمة"} ${fmtNum(price, 2)} درهم` } });
    } else if (lc.action === "change_qty" && existing && qty != null) {
      lineChanges.push({ action: "change_qty", sku, qty });
      changes.push({ kind: "change_qty", applied: true, evidence: lc.evidence, verified: verifyQuote(text, lc.evidence), label: { en: `${sku}: quantity ${qtyBi(existing.qty, p).en} → ${qtyBi(qty, p).en}`, ar: `${sku}: الكمية ${qtyBi(existing.qty, p).ar} ← ${qtyBi(qty, p).ar}` } });
    } else if (lc.action === "remove" && existing) {
      lineChanges.push({ action: "remove", sku, qty: null });
      changes.push({ kind: "remove_line", applied: true, evidence: lc.evidence, verified: verifyQuote(text, lc.evidence), label: { en: `Remove line ${existing.lineNo} (${sku})`, ar: `حذف البند ${existing.lineNo} (${sku})` } });
    }
  }

  const priceClaims: Proposal["priceClaims"] = [];
  for (const pc of x.priceClaims ?? []) {
    const sku = pc.sku && SKU_RE.test(pc.sku) ? pc.sku : order.lines[0]?.sku ?? null;
    if (!sku || !(pc.claimedPrice > 0)) continue;
    const ref = referencePrice(m, customer, sku);
    const refPrice = ref.kind === "contract" ? ref.reference : ref.list;
    const line = order.lines.find((l) => l.sku === sku);
    const supported = Math.abs(pc.claimedPrice - refPrice) < 0.005 || (ref.kind === "list" && pc.claimedPrice >= (ref.minAllowed ?? 0) - 0.004);
    priceClaims.push({ sku, claimedPrice: pc.claimedPrice, basis: pc.basis });
    const gap = line ? round2((refPrice - pc.claimedPrice) * openQty(line)) : 0;
    changes.push({
      kind: "price_claim",
      applied: false,
      evidence: pc.evidence,
      verified: verifyQuote(text, pc.evidence),
      label: supported
        ? { en: `Price claim AED ${fmtNum(pc.claimedPrice, 2)} for ${sku} matches the reference price — supported`, ar: `مطالبة السعر ${fmtNum(pc.claimedPrice, 2)} درهم للصنف ${sku} مطابقة للسعر المرجعي — مقبولة` }
        : {
            en: `Price claim AED ${fmtNum(pc.claimedPrice, 2)} for ${sku} (${pc.basis}) is not supported — ${ref.kind === "contract" ? `${ref.contractId} Q4 rate is AED ${fmtNum(refPrice, 2)}${ref.q3Rate ? ` (Q3 was ${fmtNum(ref.q3Rate, 2)})` : ""}` : `list AED ${fmtNum(refPrice, 2)}, desk floor ${fmtNum(ref.minAllowed ?? 0, 2)}`}${gap ? `; gap ${aedBi(Math.abs(gap)).en}` : ""}`,
            ar: `مطالبة السعر ${fmtNum(pc.claimedPrice, 2)} درهم للصنف ${sku} غير مدعومة — ${ref.kind === "contract" ? `سعر الربع الرابع في ${ref.contractId} هو ${fmtNum(refPrice, 2)} درهم${ref.q3Rate ? ` (الربع الثالث ${fmtNum(ref.q3Rate, 2)})` : ""}` : `سعر القائمة ${fmtNum(refPrice, 2)} والحد الأدنى ${fmtNum(ref.minAllowed ?? 0, 2)}`}${gap ? `؛ الفرق ${aedBi(Math.abs(gap)).ar}` : ""}`,
          },
    });
  }

  if (x.split && (x.split.accepted != null || x.split.minFirstDropQty != null || x.split.balanceByDate)) {
    const p = productOf(m, order.lines[0]?.sku ?? "");
    changes.push({
      kind: "split_terms",
      applied: true,
      evidence: x.split.evidence,
      verified: verifyQuote(text, x.split.evidence),
      label: {
        en: `Customer ${x.split.accepted === false ? "does not accept" : "accepts"} a split delivery${x.split.minFirstDropQty ? ` — first drop at least ${qtyBi(x.split.minFirstDropQty, p).en}` : ""}${x.split.balanceByDate ? `, balance by ${fmtDay(x.split.balanceByDate)}` : ""}`,
        ar: `المتعامل ${x.split.accepted === false ? "لا يقبل" : "يقبل"} التسليم على دفعات${x.split.minFirstDropQty ? ` — الدفعة الأولى لا تقل عن ${qtyBi(x.split.minFirstDropQty, p).ar}` : ""}${x.split.balanceByDate ? `، والباقي قبل ${fmtDay(x.split.balanceByDate, "ar")}` : ""}`,
      },
    });
  }

  if (x.paymentCommitment && x.paymentCommitment.amount > 0) {
    changes.push({
      kind: "payment_commitment",
      applied: true,
      evidence: x.paymentCommitment.evidence,
      verified: verifyQuote(text, x.paymentCommitment.evidence),
      label: {
        en: `Payment commitment ${aedBi(x.paymentCommitment.amount).en}${x.paymentCommitment.date ? ` on ${fmtDay(x.paymentCommitment.date)}` : ""}`,
        ar: `التزام بالسداد ${aedBi(x.paymentCommitment.amount).ar}${x.paymentCommitment.date ? ` بتاريخ ${fmtDay(x.paymentCommitment.date, "ar")}` : ""}`,
      },
    });
  }
  for (const r of x.otherRequests ?? []) {
    changes.push({ kind: "note", applied: false, evidence: r.evidence, verified: verifyQuote(text, r.evidence), label: { en: r.text, ar: r.text } });
  }

  return {
    id: `PRP-${Date.now().toString(36).toUpperCase()}`,
    orderId: order.id,
    docTitle,
    createdAt: Date.now(),
    requestedDelivery: requested,
    lineChanges,
    priceClaims,
    splitAccepted: x.split?.accepted ?? null,
    minFirstDropQty: x.split?.minFirstDropQty ?? null,
    balanceByDate: x.split?.balanceByDate ?? null,
    paymentCommitment: x.paymentCommitment ? { amount: x.paymentCommitment.amount, date: x.paymentCommitment.date } : null,
    changes,
  };
}

/** Apply a proposal to an order (returns a new order; prices of added lines come from the reference price). */
export function applyProposal(s: Snapshot, order: SalesOrder, p: Proposal | null | undefined): SalesOrder {
  if (!p) return order;
  const m = s.master;
  const customer = customerOf(m, order.customerId)!;
  let lines = order.lines.map((l) => ({ ...l }));
  for (const lc of p.lineChanges) {
    const idx = lines.findIndex((l) => l.sku === lc.sku);
    if (lc.action === "remove" && idx >= 0 && !(lines[idx].deliveredQty ?? 0)) lines.splice(idx, 1);
    else if (lc.action === "change_qty" && idx >= 0 && lc.qty != null) lines[idx] = { ...lines[idx], qty: Math.max(lc.qty, lines[idx].deliveredQty ?? 0) };
    else if (lc.action === "add" && lc.qty != null) {
      const prod = productOf(m, lc.sku);
      const ref = referencePrice(m, customer, lc.sku);
      lines = [...lines, { lineNo: Math.max(0, ...lines.map((l) => l.lineNo)) + 1, sku: lc.sku, qty: lc.qty, unit: prod?.unit ?? "", unitPrice: ref.kind === "contract" ? ref.reference : ref.list, deliveredQty: 0, note: `Added from customer message (${p.docTitle})` }];
    }
  }
  return { ...order, lines, requestedDelivery: p.requestedDelivery ?? order.requestedDelivery };
}

/* ───────────── Before/after detection ───────────── */

export interface ExceptionDiff {
  added: ExceptionItem[];
  cleared: ExceptionItem[];
  changed: Array<{ before: ExceptionItem; after: ExceptionItem }>;
  unchanged: ExceptionItem[];
  before: OrderAnalysis;
  after: OrderAnalysis;
  exposureBefore: number;
  exposureAfter: number;
  ifPaid?: { amount: number; exposure: number; underLimit: boolean } | null;
}

export function diffForProposal(s: Snapshot, order: SalesOrder, p: Proposal): ExceptionDiff {
  const base = analyzeWorld(s);
  const proposed = applyProposal(s, order, p);
  const after = analyzeWorld(s, { orders: s.orders.map((o) => (o.id === order.id ? proposed : o)) });
  const b = base.byId[order.id];
  const a = after.byId[order.id];
  const bk = new Map(b.exceptions.map((e) => [e.key, e]));
  const ak = new Map(a.exceptions.map((e) => [e.key, e]));
  const added = a.exceptions.filter((e) => !bk.has(e.key));
  const cleared = b.exceptions.filter((e) => !ak.has(e.key));
  const changed: ExceptionDiff["changed"] = [];
  const unchanged: ExceptionItem[] = [];
  for (const e of a.exceptions) {
    const prev = bk.get(e.key);
    if (!prev) continue;
    if (prev.detail.en !== e.detail.en) changed.push({ before: prev, after: e });
    else unchanged.push(e);
  }
  const pay = p.paymentCommitment?.amount ?? 0;
  return {
    added,
    cleared,
    changed,
    unchanged,
    before: b,
    after: a,
    exposureBefore: b.credit.exposure,
    exposureAfter: a.credit.exposure,
    ifPaid: pay ? { amount: pay, exposure: round2(a.credit.exposure - pay), underLimit: a.credit.exposure - pay <= a.credit.limit + a.credit.release } : null,
  };
}

export function changeLabel(c: { label: Bi }, lang: "en" | "ar") {
  return c.label[lang];
}
