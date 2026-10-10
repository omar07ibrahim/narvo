/**
 * Calendar & site-window arithmetic (pure). All times are local Gulf Standard Time strings:
 * dates "YYYY-MM-DD", date-times "YYYY-MM-DDTHH:mm". No Date timezone conversions are involved.
 */
import type { SalesOrder, SiteWindow } from "./types";

/** Demo "today": Sunday 11 Oct 2026, start of the business day. */
export const TODAY = "2026-10-11";
export const NOW = "2026-10-11T08:00";

/** UAE public holidays inside the planning horizon (no deliveries into gated communities). */
export const HOLIDAYS = ["2026-12-01", "2026-12-02", "2026-12-03"];

const DAY_MS = 86_400_000;
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function dayMs(d: string) {
  const [y, m, dd] = d.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, dd);
}
export function isoDate(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}
export function addDays(d: string, n: number) {
  return isoDate(dayMs(d) + n * DAY_MS);
}
export function weekday(d: string) {
  return new Date(dayMs(d)).getUTCDay();
}
export function daysBetween(a: string, b: string) {
  return Math.round((dayMs(b) - dayMs(a)) / DAY_MS);
}
export function timeOf(dt: string) {
  return dt.length > 10 ? dt.slice(11, 16) : "00:00";
}
export function minutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}
export function hhmm(mins: number) {
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}
export function addHours(dt: string, h: number) {
  const base = dayMs(dt) + minutes(timeOf(dt)) * 60_000 + h * 3_600_000;
  const d = new Date(base);
  return `${d.toISOString().slice(0, 10)}T${d.toISOString().slice(11, 16)}`;
}

/** Working days: Mon–Fri for suppliers, Mon–Sat for RBM logistics. Excludes holidays. */
export function addWorkingDays(d: string, n: number, opts: { saturday: boolean }) {
  let cur = d;
  let left = n;
  while (left > 0) {
    cur = addDays(cur, 1);
    const w = weekday(cur);
    if (w === 0 || (w === 6 && !opts.saturday) || HOLIDAYS.includes(cur)) continue;
    left--;
  }
  return cur;
}

/** Next RBM logistics day strictly after d (Mon–Sat). */
export function nextLogisticsDay(d: string) {
  return addWorkingDays(d, 1, { saturday: true });
}

/* ───────────── Site windows ───────────── */

function parseDays(spec: string): number[] {
  const m = spec.replace(/\s/g, "").split(/[–-]/);
  const a = DOW.indexOf(m[0]);
  const b = DOW.indexOf(m[1] ?? m[0]);
  if (a < 0 || b < 0) return [1, 2, 3, 4, 5, 6];
  const out: number[] = [];
  for (let i = a; ; i = (i + 1) % 7) {
    out.push(i);
    if (i === b) break;
  }
  return out;
}

export interface ZoneRule {
  window: SiteWindow | null;
  days: number[];
  from: number;
  to: number;
  gateLeadHours: number;
  gated: boolean;
  restrictions: Array<[number, number]>;
}

export function zoneRule(windows: SiteWindow[], zone: string): ZoneRule {
  const w = windows.find((x) => x.zone === zone) ?? null;
  if (!w) return { window: null, days: [1, 2, 3, 4, 5, 6], from: minutes("07:00"), to: minutes("18:00"), gateLeadHours: 0, gated: false, restrictions: [] };
  const lead = w.gate.match(/(\d+)\s*h\s*ahead/i);
  const restr = Array.from(w.maxVehicle.matchAll(/(\d{2}:\d{2})\s*[–-]\s*(\d{2}:\d{2})/g)).map((m) => [minutes(m[1]), minutes(m[2])] as [number, number]);
  return {
    window: w,
    days: parseDays(w.days),
    from: minutes(w.from),
    to: minutes(w.to),
    gateLeadHours: lead ? Number(lead[1]) : 0,
    gated: /^MN-0[368]/.test(w.zone),
    restrictions: restr,
  };
}

/** Effective delivery segments for a day, after city-centre truck restrictions. */
export function segments(rule: ZoneRule, cityCentre: boolean): Array<[number, number]> {
  let segs: Array<[number, number]> = [[rule.from, rule.to]];
  if (cityCentre) {
    for (const [a, b] of rule.restrictions) {
      segs = segs.flatMap(([s, e]) => {
        if (b <= s || a >= e) return [[s, e] as [number, number]];
        const out: Array<[number, number]> = [];
        if (a > s) out.push([s, a]);
        if (b < e) out.push([b, e]);
        return out;
      });
    }
  }
  return segs.filter(([s, e]) => e - s >= 30);
}

export function windowLabel(rule: ZoneRule, cityCentre: boolean) {
  return segments(rule, cityCentre)
    .map(([s, e]) => `${hhmm(s)}–${hhmm(e)}`)
    .join(", ");
}

function dayAllowed(rule: ZoneRule, d: string) {
  return rule.days.includes(weekday(d)) && !HOLIDAYS.includes(d);
}

/** Check a requested slot against the zone window and the gate-permit lead time. */
export function checkSlot(
  rule: ZoneRule,
  dt: string,
  opts: { cityCentre?: boolean; permitDate?: string | null; now?: string },
): Array<"day" | "time" | "gate_lead" | "city_centre" | "past" | "holiday"> {
  const now = opts.now ?? NOW;
  const d = dt.slice(0, 10);
  const t = minutes(timeOf(dt));
  const reasons: Array<"day" | "time" | "gate_lead" | "city_centre" | "past" | "holiday"> = [];
  if (dt < now) reasons.push("past");
  if (HOLIDAYS.includes(d)) reasons.push("holiday");
  if (!rule.days.includes(weekday(d))) reasons.push("day");
  if (t < rule.from || t >= rule.to) reasons.push("time");
  else if (opts.cityCentre && !segments(rule, true).some(([s, e]) => t >= s && t < e)) reasons.push("city_centre");
  if (rule.gateLeadHours && opts.permitDate !== d && dt < addHours(now, rule.gateLeadHours)) reasons.push("gate_lead");
  return reasons;
}

/** First valid delivery slot at or after `start` (rounded up to 30 minutes). */
export function nextValidSlot(
  rule: ZoneRule,
  start: string,
  opts: { cityCentre?: boolean; permitDate?: string | null; now?: string },
): string | null {
  const now = opts.now ?? NOW;
  const lead = rule.gateLeadHours ? addHours(now, rule.gateLeadHours) : now;
  const startDt = start.length > 10 ? start : `${start}T00:00`;
  const lower0 = startDt > now ? startDt : now;
  let day = lower0.slice(0, 10);
  for (let i = 0; i < 45; i++, day = addDays(day, 1)) {
    if (!dayAllowed(rule, day)) continue;
    let lowerDt = lower0.slice(0, 10) === day ? lower0 : `${day}T00:00`;
    if (rule.gateLeadHours && opts.permitDate !== day && lead > lowerDt) lowerDt = lead;
    if (lowerDt.slice(0, 10) > day) continue;
    const lower = minutes(timeOf(lowerDt));
    for (const [s, e] of segments(rule, !!opts.cityCentre)) {
      let t = Math.max(lower, s);
      t = Math.ceil(t / 30) * 30;
      if (t < e) return `${day}T${hhmm(t)}`;
    }
  }
  return null;
}

export function orderZoneRule(windows: SiteWindow[], o: SalesOrder) {
  return zoneRule(windows, o.zone);
}

export const DOW_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DOW_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const MON_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MON_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

/** "Mon 12 Oct 09:30" / "الاثنين 12 أكتوبر 09:30" */
export function fmtSlot(dt: string | null | undefined, lang: "en" | "ar" = "en", withTime = true) {
  if (!dt) return "—";
  const d = dt.slice(0, 10);
  const [, m, dd] = d.split("-").map(Number);
  const w = weekday(d);
  const t = dt.length > 10 && withTime ? ` ${timeOf(dt)}` : "";
  return lang === "ar" ? `${DOW_AR[w]} ${dd} ${MON_AR[m - 1]}${t}` : `${DOW_EN[w]} ${dd} ${MON_EN[m - 1]}${t}`;
}
export function fmtDay(d: string | null | undefined, lang: "en" | "ar" = "en") {
  return fmtSlot(d ? d.slice(0, 10) : d, lang, false);
}
