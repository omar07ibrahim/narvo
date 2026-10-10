/**
 * Deterministic scoring engine (client-safe). The model judges evidence and suggests
 * 0–10 scores; everything numeric here — gates, normalised prices, commercial points,
 * combined totals, ranks, sensitivity — is computed in code per MNDA Procurement Manual v3.2.
 */

import type { Bi, CellStatus, MethodResult, Override, PriceSchedule, Supplier, SupplierEval, Tender } from "./types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

export interface GateResult {
  status: CellStatus | "pending";
  value: string;
  computed: boolean;
  note: string;
  valueAr?: string;
  noteAr?: string;
}

const MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const fmtDateAr = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS_AR[m - 1]} ${y}`;
};

export function gateResults(tender: Tender, supplier: Supplier, ev?: SupplierEval): Record<string, GateResult> {
  const out: Record<string, GateResult> = {};
  for (const g of tender.gates) {
    if (g.kind === "certificate") {
      const cert = supplier.certificates.find((c) => c.standard === g.standard);
      if (!cert) out[g.id] = { status: "missing", value: "No certificate", computed: true, note: `${g.standard} certificate not provided`, valueAr: "لا توجد شهادة", noteAr: `لم تُقدَّم شهادة ${g.standard}` };
      else {
        const valid = cert.expiry >= tender.closing;
        out[g.id] = {
          status: valid ? "met" : "missing",
          value: `${cert.number} · ${valid ? "valid to" : "expired"} ${fmtDate(cert.expiry)}`,
          computed: true,
          note: valid
            ? `Valid at closing (${fmtDate(tender.closing)})${cert.updatedBy ? ` — updated from ${cert.updatedBy}` : ""}`
            : `Expired ${fmtDate(cert.expiry)}, before the closing date ${fmtDate(tender.closing)} (Manual Art. 21)`,
          valueAr: `${cert.number} · ${valid ? "سارية حتى" : "انتهت في"} ${fmtDateAr(cert.expiry)}`,
          noteAr: valid
            ? `سارية عند الإغلاق (${fmtDateAr(tender.closing)})${cert.updatedBy ? ` — حُدّثت من ${cert.updatedBy}` : ""}`
            : `انتهت في ${fmtDateAr(cert.expiry)} قبل تاريخ الإغلاق ${fmtDateAr(tender.closing)} (المادة 21)`,
        };
      }
    } else if (g.kind === "icv") {
      const ok = supplier.icv.score >= tender.icvMin;
      out[g.id] = { status: ok ? "met" : "missing", value: `${supplier.icv.score}%`, computed: true, note: `${supplier.icv.certificate}, minimum ${tender.icvMin}%`, valueAr: `${supplier.icv.score}%`, noteAr: `${supplier.icv.certificate}، الحد الأدنى ${tender.icvMin}%` };
    } else {
      const ge = ev?.gates.find((x) => x.id === g.id);
      out[g.id] = ge
        ? { status: ge.status, value: ge.note ?? "", computed: false, note: ge.evidence?.quote ?? ge.note ?? "" }
        : { status: "pending", value: "", computed: false, note: "" };
    }
  }
  return out;
}

export function priceTotal(p?: PriceSchedule) {
  return p ? p.lines.reduce((a, l) => a + l.total, 0) : 0;
}

/** Price normalisation for omitted scope (Manual Art. 27): add the highest equivalent line from the other bids. */
export function normalisation(tender: Tender, supplierId: string, evals: Record<string, SupplierEval>, prices: PriceSchedule[]) {
  const ev = evals[supplierId];
  if (!ev) return [] as Array<{ scope: string; key: string; amount: number; from: string }>;
  const adds: Array<{ scope: string; key: string; amount: number; from: string }> = [];
  for (const s of ev.scope) {
    if (s.status !== "excluded") continue;
    const item = tender.scope.find((x) => x.id === s.id);
    if (!item) continue;
    let best = 0;
    let from = "";
    for (const p of prices) {
      if (p.supplierId === supplierId) continue;
      const line = p.lines.filter((l) => l.scope_key === item.key).reduce((a, l) => a + l.total, 0);
      if (line > best) {
        best = line;
        from = p.supplierId;
      }
    }
    if (best > 0) adds.push({ scope: item.label.en, key: item.key, amount: best, from });
  }
  return adds;
}

export function effectiveScore(ev: SupplierEval | undefined, overrides: Record<string, Override> | undefined, criterionId: string) {
  const o = overrides?.[criterionId];
  if (o) return o.score;
  return ev?.criteria.find((c) => c.id === criterionId)?.score ?? null;
}

export interface ScoreRow {
  supplierId: string;
  evaluated: boolean;
  tech100: number;
  techPts: number;
  price: number;
  normPrice: number;
  adjustments: ReturnType<typeof normalisation>;
  comPts: number | null;
  total: number | null;
  rank: number | null;
  compliant: boolean;
  belowPass: boolean;
  conditional: boolean;
  failed: string[];
  pending: string[];
}

export function computeScores(
  tender: Tender,
  suppliers: Supplier[],
  prices: PriceSchedule[],
  evals: Record<string, SupplierEval>,
  overrides: Record<string, Record<string, Override>>,
  weights = tender.weights,
): ScoreRow[] {
  const rows: ScoreRow[] = suppliers.map((s) => {
    const ev = evals[s.id];
    const tech100 = tender.criteria.reduce((a, c) => a + ((effectiveScore(ev, overrides[s.id], c.id) ?? 0) / 10) * c.weight, 0);
    const gates = gateResults(tender, s, ev);
    const failed = Object.entries(gates)
      .filter(([, g]) => g.status === "missing")
      .map(([id]) => id);
    const pending = Object.entries(gates)
      .filter(([, g]) => g.status === "clarify" || g.status === "partial" || g.status === "pending")
      .map(([id]) => id);
    const price = priceTotal(prices.find((p) => p.supplierId === s.id));
    const adjustments = normalisation(tender, s.id, evals, prices);
    const normPrice = price + adjustments.reduce((a, x) => a + x.amount, 0);
    const belowPass = !!ev && tech100 < tender.passMark;
    return {
      supplierId: s.id,
      evaluated: !!ev,
      tech100: round2(tech100),
      techPts: round2((tech100 * weights.technical) / 100),
      price,
      normPrice,
      adjustments,
      comPts: null,
      total: null,
      rank: null,
      compliant: !!ev && failed.length === 0 && !belowPass,
      belowPass,
      conditional: pending.length > 0,
      failed,
      pending,
    };
  });
  const eligible = rows.filter((r) => r.compliant);
  const lowest = Math.min(...eligible.map((r) => r.normPrice));
  for (const r of eligible) {
    r.comPts = round2((lowest / r.normPrice) * weights.commercial);
    r.total = round2(r.techPts + r.comPts);
  }
  [...eligible].sort((a, b) => (b.total ?? 0) - (a.total ?? 0)).forEach((r, i) => (r.rank = i + 1));
  return rows;
}

export function sensitivity(
  tender: Tender,
  suppliers: Supplier[],
  prices: PriceSchedule[],
  evals: Record<string, SupplierEval>,
  overrides: Record<string, Record<string, Override>>,
) {
  const points: Array<Record<string, number | null> & { tw: number }> = [];
  for (let tw = 50; tw <= 90; tw += 5) {
    const rows = computeScores(tender, suppliers, prices, evals, overrides, { technical: tw, commercial: 100 - tw });
    const p: Record<string, number | null> & { tw: number } = { tw };
    for (const r of rows) p[r.supplierId] = r.total;
    points.push(p);
  }
  return points;
}

/** How robust is the leader? Gap to #2 and the price #2 would need to overtake (computed). */
export function flipAnalysis(rows: ScoreRow[], weights: { technical: number; commercial: number }) {
  const ranked = rows.filter((r) => r.rank != null).sort((a, b) => a.rank! - b.rank!);
  if (ranked.length < 2) return null;
  const [first, second] = ranked;
  const gap = round2((first.total ?? 0) - (second.total ?? 0));
  const lowest = Math.min(...ranked.map((r) => r.normPrice));
  const needCom = (second.comPts ?? 0) + gap;
  // If #2 drops its price below the current lowest it scores the full commercial weight and the others are re-based;
  // we report the simple threshold under the current lowest price.
  const priceNeeded = needCom <= weights.commercial ? Math.floor((weights.commercial * lowest) / needCom / 100) * 100 : null;
  const techDropNeeded = round2((gap / weights.technical) * 100);
  return { leader: first.supplierId, runnerUp: second.supplierId, gap, priceNeeded, techDropNeeded };
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/* ───────────── procurement method thresholds (Manual Art. 10–16) ───────────── */

export function procurementMethod(estimate: number | null): MethodResult | null {
  if (estimate == null || !Number.isFinite(estimate) || estimate <= 0) return null;
  if (estimate <= 20000)
    return {
      method: "direct_one",
      label: { en: "Direct purchase — one quotation", ar: "شراء مباشر — عرض سعر واحد" },
      rule: { en: "≤ AED 20,000: one written quotation (Art. 11)", ar: "≤ 20,000 درهم: عرض سعر مكتوب واحد (المادة 11)" },
      approver: { en: "Section head", ar: "رئيس القسم" },
    };
  if (estimate <= 100000)
    return {
      method: "direct_three",
      label: { en: "Direct purchase — three quotations", ar: "شراء مباشر — ثلاثة عروض أسعار" },
      rule: { en: "AED 20,001 – 100,000: three written quotations (Art. 11)", ar: "من 20,001 إلى 100,000 درهم: ثلاثة عروض أسعار مكتوبة (المادة 11)" },
      approver: { en: "Section head", ar: "رئيس القسم" },
    };
  if (estimate <= 1000000)
    return {
      method: "limited",
      label: { en: "Limited tender (RFQ)", ar: "مناقصة محدودة (طلب عروض أسعار)" },
      rule: { en: "AED 100,001 – 1,000,000: RFQ to at least 3 registered suppliers (Art. 12)", ar: "من 100,001 إلى 1,000,000 درهم: دعوة 3 موردين مسجلين على الأقل (المادة 12)" },
      approver: { en: "Director, Procurement & Contracts", ar: "مدير إدارة المشتريات والعقود" },
      minDays: 10,
    };
  return {
    method: "public",
    label: { en: "Public tender", ar: "مناقصة عامة" },
    rule: { en: "Above AED 1,000,000: public tender on the Supplier Portal, minimum 21 days (Art. 13)", ar: "أكثر من 1,000,000 درهم: مناقصة عامة على بوابة الموردين لمدة 21 يوماً على الأقل (المادة 13)" },
    approver: estimate <= 10000000 ? { en: "Tender Committee + Director General", ar: "لجنة المناقصات + المدير العام" } : { en: "Tender Committee + Director General + Board notification", ar: "لجنة المناقصات + المدير العام + إخطار المجلس" },
    minDays: 21,
  };
}

export const STATUS_BI: Record<CellStatus | "pending", Bi> = {
  met: { en: "Evidenced", ar: "مُثبت" },
  partial: { en: "Partial", ar: "جزئي" },
  missing: { en: "Missing", ar: "مفقود" },
  clarify: { en: "Clarify", ar: "يحتاج استيضاح" },
  pending: { en: "Not evaluated", ar: "لم يُقيَّم" },
};
