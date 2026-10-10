/**
 * Deterministic obligation dates (client-safe). Every due date shown in the module is
 * computed here from the contract's dates and the obligation trigger — never by the model.
 */

import { DEMO_TODAY } from "@/lib/world/orgs";
import type { Contract, KpiFile, Obligation, Trigger } from "./types";

const DAY = 86_400_000;
const t = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const TODAY = DEMO_TODAY;

export function addDays(d: string, n: number) {
  return iso(t(d) + n * DAY);
}
export function daysBetween(a: string, b: string) {
  return Math.round((t(b) - t(a)) / DAY);
}

function nthWorkingDay(year: number, month: number, n: number) {
  let count = 0;
  for (let d = 1; d <= 31; d++) {
    const date = new Date(Date.UTC(year, month, d));
    if (date.getUTCMonth() !== month) break;
    const wd = date.getUTCDay();
    if (wd !== 0 && wd !== 6) count++;
    if (count === n) return iso(date.getTime());
  }
  return iso(Date.UTC(year, month + 1, 0));
}

/** Compute the (next) due date of an obligation from its trigger and the contract dates. */
export function dueDate(trigger: Trigger, c: Pick<Contract, "start" | "end"> | null, today = TODAY): string | null {
  switch (trigger.kind) {
    case "date":
      return trigger.date;
    case "before_end":
      return c ? addDays(c.end, -trigger.days) : null;
    case "after_end":
      return c ? addDays(c.end, trigger.days) : null;
    case "after_start":
      return c ? addDays(c.start, trigger.days) : null;
    case "monthly_working_day":
    case "monthly_day": {
      const [y, m] = today.split("-").map(Number);
      for (let k = 0; k < 3; k++) {
        const month = m - 1 + k;
        const yy = y + Math.floor(month / 12);
        const mm = month % 12;
        const d = trigger.kind === "monthly_working_day" ? nthWorkingDay(yy, mm, trigger.day) : iso(Date.UTC(yy, mm, Math.min(trigger.day, 28)));
        if (d >= today) return d;
      }
      return null;
    }
    case "annual": {
      const y = Number(today.slice(0, 4));
      const d = iso(Date.UTC(y, trigger.month - 1, trigger.day));
      return d >= today ? d : iso(Date.UTC(y + 1, trigger.month - 1, trigger.day));
    }
  }
}

export function recurrenceLabel(trigger: Trigger): { en: string; ar: string } {
  switch (trigger.kind) {
    case "monthly_working_day":
      return { en: `Monthly · ${trigger.day}th working day`, ar: `شهرياً · يوم العمل ${trigger.day}` };
    case "monthly_day":
      return { en: `Monthly · day ${trigger.day}`, ar: `شهرياً · اليوم ${trigger.day}` };
    case "annual":
      return { en: "Annual", ar: "سنوياً" };
    case "before_end":
      return { en: `${trigger.days} days before expiry`, ar: `قبل الانتهاء بـ ${trigger.days} يوماً` };
    case "after_end":
      return { en: `${trigger.days} days after expiry`, ar: `بعد الانتهاء بـ ${trigger.days} يوماً` };
    case "after_start":
      return { en: `${trigger.days} days after start`, ar: `بعد البدء بـ ${trigger.days} يوماً` };
    default:
      return { en: "One-off", ar: "مرة واحدة" };
  }
}

export type ObStatus = "done" | "overdue" | "due_soon" | "upcoming";

export function obligationView(o: Obligation, contracts: Contract[], today = TODAY) {
  const c = contracts.find((x) => x.id === o.contractId) ?? null;
  const due = dueDate(o.trigger, c, today);
  const days = due ? daysBetween(today, due) : null;
  const status: ObStatus = o.status === "done" ? "done" : days != null && days < 0 ? "overdue" : days != null && days <= 30 ? "due_soon" : "upcoming";
  return { o, c, due, days, status };
}

/* ───────────── KPI & service-credit computation for MNDA/CON/2023/019 (Clause 6, Schedule 2) ───────────── */

export function serviceCredits(k: KpiFile) {
  const rows = k.months.map((m) => {
    const parts: Array<{ kpi: string; pct: number }> = [];
    const below = 95 - m.ppm;
    if (below > 0) parts.push({ kpi: "KPI-01 PPM", pct: Math.floor(below + 1e-9) });
    if (m.p1Attend < 95) parts.push({ kpi: "KPI-02 P1 attendance", pct: 1.5 });
    if (m.p1MakeSafe < 95) parts.push({ kpi: "KPI-03 P1 make safe", pct: 1.5 });
    if (m.p2Rectify < 90) parts.push({ kpi: "KPI-04 P2 rectification", pct: 1 });
    if (m.csat != null && m.csat < 4.0) parts.push({ kpi: "KPI-05 satisfaction", pct: 2 });
    if (!m.reportOnTime) parts.push({ kpi: "KPI-06 reporting", pct: 0.5 });
    if (m.coilCleaningDone === false) parts.push({ kpi: "KPI-07 coil cleaning", pct: 1 });
    const raw = parts.reduce((a, p) => a + p.pct, 0);
    const pct = Math.min(raw, k.capPct);
    return { month: m.month, ppm: m.ppm, parts: parts.filter((p) => p.pct > 0), pct, capped: raw > k.capPct, aed: Math.round((pct / 100) * k.monthlyFee) };
  });
  const total = rows.reduce((a, r) => a + r.aed, 0);
  const ppmAvg = Math.round((k.months.reduce((a, m) => a + m.ppm, 0) / k.months.length) * 10) / 10;
  const below95 = k.months.filter((m) => m.ppm < 95).length;
  let run = 0;
  let maxRunBelow90 = 0;
  for (const m of k.months) {
    run = m.ppm < 90 ? run + 1 : 0;
    maxRunBelow90 = Math.max(maxRunBelow90, run);
  }
  const p1Avg = Math.round((k.months.reduce((a, m) => a + m.p1Attend, 0) / k.months.length) * 10) / 10;
  const complaints = k.months.slice(-2).reduce((a, m) => a + m.complaintsAlGhaf, 0);
  const csat = k.months.filter((m) => m.csat != null).map((m) => ({ month: m.month, csat: m.csat! }));
  return { rows, total, ppmAvg, below95, maxRunBelow90, materialBreach: maxRunBelow90 >= 3, p1Avg, complaints, csat };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtDate = (d: string) => {
  const [y, m, dd] = d.slice(0, 10).split("-").map(Number);
  return `${dd} ${MONTHS[m - 1]} ${y}`;
};
