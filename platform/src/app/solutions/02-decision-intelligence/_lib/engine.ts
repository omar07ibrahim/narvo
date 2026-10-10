/**
 * Analytics engine for solution 02 — computes every KPI value, series, change and target status from the
 * daily fact table and the permit case table. Pure and isomorphic (no imports with side effects): used by
 * the API routes (briefing, figure check, ask-the-data) and by the client workspace for instant filtering.
 * Numbers shown anywhere in the module come from here — the model never produces a figure on its own.
 */
import type { Dept, MetricDef } from "./catalogue";

export interface PermitFact {
  /** submitted date (local, YYYY-MM-DD) */
  s: string;
  /** issued date or null */
  i: string | null;
  /** cycle days or null */
  c: number | null;
  /** returned to applicant at least once */
  r: 0 | 1;
  /** NOC hold days or null */
  n: number | null;
}

export interface Dataset {
  days: string[];
  cols: Record<string, number[]>;
  permits: PermitFact[];
}

export type Rag = "green" | "amber" | "red";

export interface MetricValue {
  value: number | null;
  /** cases / observations behind the value */
  n?: number;
  target: number | null;
  rag: Rag | null;
  from: string;
  to: string;
}

export type Granularity = "day" | "week" | "month" | "quarter" | "total";

export interface Bucket {
  key: string;
  from: string;
  to: string;
  label: { en: string; ar: string };
}

/* ───────────── dates ───────────── */

const DAY_MS = 86400000;
const toMs = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
export const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => fromMs(toMs(d) + n * DAY_MS);
export const daysBetween = (a: string, b: string) => Math.round((toMs(b) - toMs(a)) / DAY_MS);

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

export function dayLabel(d: string, lang: "en" | "ar" = "en") {
  const m = +d.slice(5, 7) - 1;
  return lang === "ar" ? `${+d.slice(8, 10)} ${MONTHS_AR[m]}` : `${+d.slice(8, 10)} ${MONTHS_EN[m]}`;
}

/** ISO-8601 week id, e.g. "2026-W41" */
export function isoWeek(d: string): string {
  const ms = toMs(d);
  const dow = (new Date(ms).getUTCDay() + 6) % 7; // Mon=0
  const thursday = ms + (3 - dow) * DAY_MS;
  const year = new Date(thursday).getUTCFullYear();
  const jan4 = Date.UTC(year, 0, 4);
  const jan4dow = (new Date(jan4).getUTCDay() + 6) % 7;
  const week1Mon = jan4 - jan4dow * DAY_MS;
  const w = Math.floor((thursday - week1Mon) / (7 * DAY_MS)) + 1;
  return `${year}-W${String(w).padStart(2, "0")}`;
}

export function weekRange(id: string): [string, string] {
  const year = +id.slice(0, 4);
  const w = +id.slice(6);
  const jan4 = Date.UTC(year, 0, 4);
  const jan4dow = (new Date(jan4).getUTCDay() + 6) % 7;
  const mon = jan4 - jan4dow * DAY_MS + (w - 1) * 7 * DAY_MS;
  return [fromMs(mon), fromMs(mon + 6 * DAY_MS)];
}

export function monthRange(id: string): [string, string] {
  const y = +id.slice(0, 4);
  const m = +id.slice(5, 7);
  return [`${id}-01`, fromMs(Date.UTC(y, m, 0))];
}

export function quarterRange(id: string): [string, string] {
  const y = +id.slice(0, 4);
  const q = +id.slice(6);
  return [fromMs(Date.UTC(y, (q - 1) * 3, 1)), fromMs(Date.UTC(y, q * 3, 0))];
}

export function weekLabel(id: string, lang: "en" | "ar" = "en") {
  const [a, b] = weekRange(id);
  const w = +id.slice(6);
  const sameMonth = a.slice(5, 7) === b.slice(5, 7);
  if (lang === "ar") return `الأسبوع ${w} (${+a.slice(8)}–${dayLabel(b, "ar")})`;
  return `W${w} · ${sameMonth ? +a.slice(8) : dayLabel(a)}–${dayLabel(b)}`;
}

export function buckets(gran: Granularity, from: string, to: string): Bucket[] {
  const out: Bucket[] = [];
  if (gran === "total") return [{ key: "total", from, to, label: { en: `${dayLabel(from)} – ${dayLabel(to)}`, ar: `${dayLabel(from, "ar")} – ${dayLabel(to, "ar")}` } }];
  if (gran === "day") {
    for (let d = from; d <= to; d = addDays(d, 1)) out.push({ key: d, from: d, to: d, label: { en: dayLabel(d), ar: dayLabel(d, "ar") } });
    return out;
  }
  if (gran === "week") {
    let wk = isoWeek(from);
    for (let guard = 0; guard < 80; guard++) {
      const [a, b] = weekRange(wk);
      if (a > to) break;
      out.push({ key: wk, from: a, to: b, label: { en: `W${+wk.slice(6)}`, ar: `أ${+wk.slice(6)}` } });
      wk = isoWeek(addDays(b, 1));
    }
    return out;
  }
  if (gran === "month") {
    let y = +from.slice(0, 4);
    let m = +from.slice(5, 7);
    for (let guard = 0; guard < 40; guard++) {
      const id = `${y}-${String(m).padStart(2, "0")}`;
      const [a, b] = monthRange(id);
      if (a > to) break;
      out.push({ key: id, from: a, to: b, label: { en: `${MONTHS_EN[m - 1]} ${String(y).slice(2)}`, ar: `${MONTHS_AR[m - 1]}` } });
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
    }
    return out;
  }
  // quarter
  let y = +from.slice(0, 4);
  let q = Math.floor((+from.slice(5, 7) - 1) / 3) + 1;
  for (let guard = 0; guard < 16; guard++) {
    const id = `${y}-Q${q}`;
    const [a, b] = quarterRange(id);
    if (a > to) break;
    out.push({ key: id, from: a, to: b, label: { en: `Q${q} ${y}`, ar: `الربع ${q} ${y}` } });
    q++;
    if (q > 4) {
      q = 1;
      y++;
    }
  }
  return out;
}

/* ───────────── computation ───────────── */

const prefixCache = new WeakMap<number[], number[]>();
function prefix(arr: number[]) {
  let p = prefixCache.get(arr);
  if (!p) {
    p = new Array(arr.length + 1);
    p[0] = 0;
    for (let i = 0; i < arr.length; i++) p[i + 1] = p[i] + (arr[i] || 0);
    prefixCache.set(arr, p);
  }
  return p;
}

export function clip(ds: Dataset, from: string, to: string): [string, string] | null {
  const a = from < ds.days[0] ? ds.days[0] : from;
  const b = to > ds.days[ds.days.length - 1] ? ds.days[ds.days.length - 1] : to;
  return a > b ? null : [a, b];
}

function idx(ds: Dataset, d: string) {
  return daysBetween(ds.days[0], d);
}

function sumCol(ds: Dataset, col: string, from: string, to: string) {
  const arr = ds.cols[col];
  if (!arr) throw new Error(`Unknown column ${col}`);
  const p = prefix(arr);
  return p[idx(ds, to) + 1] - p[idx(ds, from)];
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const k = s.length >> 1;
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
};

export function targetFor(ds: Dataset, def: MetricDef, from: string, to: string): number | null {
  const t = def.target;
  if (!t) return null;
  if ("plan" in t) {
    if (def.agg.kind !== "ytdShare") return null;
    return (sumCol(ds, def.agg.planCol, ds.days[0], to) / def.agg.annual) * 100;
  }
  if (t.per === "month") return (t.value * (daysBetween(from, to) + 1)) / 30.44;
  return t.value;
}

export function ragOf(def: MetricDef, value: number | null, target: number | null): Rag | null {
  if (value == null || target == null || def.better === "none") return null;
  const tol = def.amber ?? 0.1;
  if (def.better === "down") return value <= target ? "green" : value <= target * (1 + tol) ? "amber" : "red";
  return value >= target ? "green" : value >= target * (1 - tol) ? "amber" : "red";
}

export function compute(ds: Dataset, def: MetricDef, fromIn: string, toIn: string): MetricValue {
  const c = clip(ds, fromIn, toIn);
  if (!c) return { value: null, target: null, rag: null, from: fromIn, to: toIn };
  const [from, to] = c;
  let value: number | null = null;
  let n: number | undefined;
  const a = def.agg;
  switch (a.kind) {
    case "sum":
      value = sumCol(ds, a.col, from, to);
      break;
    case "sumOf":
      value = a.cols.reduce((s, col) => s + sumCol(ds, col, from, to), 0);
      break;
    case "ratio": {
      const num = a.num.reduce((s, col) => s + sumCol(ds, col, from, to), 0);
      const den = a.den.reduce((s, col) => s + sumCol(ds, col, from, to), 0) - (a.denMinus ?? []).reduce((s, col) => s + sumCol(ds, col, from, to), 0);
      value = den > 0 ? (num / den) * (a.scale ?? 1) : null;
      n = den;
      break;
    }
    case "stock":
      value = ds.cols[a.col][idx(ds, to)];
      break;
    case "ytdShare":
      value = (sumCol(ds, a.col, ds.days[0], to) / a.annual) * 100;
      break;
    case "permit": {
      const P = ds.permits;
      if (a.measure === "received") {
        value = P.filter((p) => p.s >= from && p.s <= to).length;
      } else if (a.measure === "issued") {
        value = P.filter((p) => p.i && p.i >= from && p.i <= to).length;
      } else if (a.measure === "cycleMedian") {
        const xs = P.filter((p) => p.i && p.i >= from && p.i <= to && p.c != null).map((p) => p.c!);
        value = median(xs);
        n = xs.length;
      } else if (a.measure === "rework") {
        const xs = P.filter((p) => p.s >= from && p.s <= to);
        value = xs.length ? (xs.filter((p) => p.r).length / xs.length) * 100 : null;
        n = xs.length;
      } else {
        const xs = P.filter((p) => p.s >= from && p.s <= to && p.n != null).map((p) => p.n!);
        value = xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
        n = xs.length;
      }
      break;
    }
  }
  const target = targetFor(ds, def, from, to);
  return { value, n, target, rag: ragOf(def, value, target), from, to };
}

export interface SeriesPoint extends MetricValue {
  key: string;
  label: { en: string; ar: string };
}

export function series(ds: Dataset, def: MetricDef, gran: Granularity, from: string, to: string): SeriesPoint[] {
  return buckets(gran, from, to)
    .map((b) => ({ ...compute(ds, def, b.from, b.to), key: b.key, label: b.label }))
    .filter((p) => p.value != null);
}

/* ───────────── formatting ───────────── */

export function fmtNumber(v: number, decimals = 0) {
  return v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fmtValue(def: Pick<MetricDef, "unit" | "decimals">, v: number | null | undefined, lang: "en" | "ar" = "en"): string {
  if (v == null || Number.isNaN(v)) return "—";
  switch (def.unit) {
    case "count":
      return fmtNumber(Math.round(v));
    case "pct":
      return `${fmtNumber(v, def.decimals)}%`;
    case "days":
      return lang === "ar" ? `${fmtNumber(v, def.decimals)} يوم` : `${fmtNumber(v, def.decimals)} days`;
    case "duration": {
      const s = Math.round(v);
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    }
    case "aed":
      return lang === "ar" ? `${fmtNumber(v, def.decimals)} درهم` : `AED ${fmtNumber(v, def.decimals)}`;
    default:
      return fmtNumber(v, def.decimals);
  }
}

/** Short value without unit words (charts, tables) */
export function fmtShort(def: Pick<MetricDef, "unit" | "decimals">, v: number | null | undefined) {
  if (v == null) return "—";
  if (def.unit === "duration") return fmtValue(def, v);
  if (def.unit === "pct") return `${fmtNumber(v, def.decimals)}%`;
  return fmtNumber(v, def.unit === "count" ? 0 : def.decimals);
}

export function fmtDelta(def: Pick<MetricDef, "unit" | "decimals">, d: number) {
  const sign = d > 0 ? "+" : d < 0 ? "−" : "±";
  const a = Math.abs(d);
  if (def.unit === "duration") return `${sign}${Math.floor(Math.round(a) / 60)}:${String(Math.round(a) % 60).padStart(2, "0")}`;
  if (def.unit === "pct") return `${sign}${fmtNumber(a, def.decimals)} pts`;
  return `${sign}${fmtNumber(a, def.unit === "count" ? 0 : def.decimals)}`;
}

/* ───────────── review facts (what changed this week) ───────────── */

export interface Fact {
  id: string;
  metricId: string;
  dept: Dept;
  kind: "week" | "month" | "quarter" | "level";
  title: string;
  text: string;
  value: number | null;
  formatted: string;
  rag: Rag | null;
  /** |z| vs trailing weeks, or relative change */
  signal: number;
  change: "up" | "down" | "flat";
  numbers: string[];
}

export interface FactOptions {
  week: string;
  previousWeek: string;
  dataTo: string;
}

/**
 * Builds the numbered fact base for the review briefing: one fact per KPI for the review week (with week-on-week
 * change, trailing-8-week z-score, target status) plus monthly and quarterly facts for the storyline metrics.
 */
export function buildFacts(ds: Dataset, metrics: MetricDef[], opt: FactOptions): Fact[] {
  const facts: Fact[] = [];
  const [w0, w1] = weekRange(opt.week);
  const [p0, p1] = weekRange(opt.previousWeek);
  const weekTo = w1 > opt.dataTo ? opt.dataTo : w1;
  const span = daysBetween(w0, weekTo); // 0..6
  const partialWeek = weekTo < w1;
  for (const def of metrics) {
    const cur = compute(ds, def, w0, weekTo);
    const prev = compute(ds, def, p0, p1);
    if (cur.value == null) continue;
    const isFlowCount = def.unit === "count" && def.agg.kind !== "stock";
    // comparable baseline: same weekdays of earlier weeks when the review week is still partial
    const trailing: number[] = [];
    for (let k = 1; k <= 8; k++) {
      const a = addDays(w0, -7 * k);
      const v = compute(ds, def, a, partialWeek ? addDays(a, span) : addDays(a, 6)).value;
      if (v != null) trailing.push(v);
    }
    const mean = trailing.reduce((s, x) => s + x, 0) / Math.max(1, trailing.length);
    const sd = Math.sqrt(trailing.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, trailing.length - 1)) || 1e-9;
    const lowN = cur.n != null && def.agg.kind === "permit" && cur.n < 10;
    const z = lowN ? 0 : (cur.value - mean) / sd;
    const prevSame = partialWeek && isFlowCount ? compute(ds, def, p0, addDays(p0, span)).value : null;
    const delta = prevSame != null ? cur.value - prevSame : prev.value != null ? cur.value - prev.value : null;
    const fv = fmtValue(def, cur.value);
    const ft = cur.target != null ? fmtValue(def, cur.target) : null;
    const wk = +opt.week.slice(6);
    const pwk = +opt.previousWeek.slice(6);
    const level = def.agg.kind === "stock" || def.agg.kind === "ytdShare";
    const parts = [
      level
        ? `${def.name.en}: ${fv} at ${dayLabel(weekTo)} (end of week ${wk} data)`
        : `${def.name.en}: ${fv} in week ${wk} (${dayLabel(w0)}–${dayLabel(weekTo)}${partialWeek ? ", Mon–Fri" : ""})`,
      prev.value != null ? `week ${pwk}${partialWeek && !level ? " full week" : ""}: ${fmtValue(def, prev.value)}` : "",
      prevSame != null ? `week ${pwk} same weekdays: ${fmtValue(def, prevSame)} (${fmtDelta(def, delta!)})` : prev.value != null ? `change ${fmtDelta(def, delta!)}` : "",
      ft ? `target ${def.better === "down" ? "≤" : "≥"} ${ft}` : "",
      cur.rag ? `status ${cur.rag.toUpperCase()}` : "",
      trailing.length >= 4 && !lowN ? `average of previous 8 weeks${partialWeek && !level ? " (same weekdays)" : ""} ${fmtValue(def, mean)}` : "",
      cur.n != null && def.agg.kind === "permit" ? `n = ${fmtNumber(cur.n)}` : "",
      lowN ? "provisional — too few completed cases this week" : "",
    ].filter(Boolean);
    const text = parts.join("; ") + ".";
    facts.push({
      id: `K-${def.id}-${opt.week}`,
      metricId: def.id,
      dept: def.dept,
      kind: level ? "level" : "week",
      title: `${def.name.en} — week ${wk}`,
      text,
      value: cur.value,
      formatted: fv,
      rag: cur.rag,
      signal: Math.min(5, Math.abs(z)) + (cur.rag === "red" ? 0.6 : 0),
      change: delta == null || Math.abs(delta) < 1e-9 ? "flat" : delta > 0 ? "up" : "down",
      numbers: extractNumbers(text),
    });
  }
  // Month & quarter facts for the storyline metrics (September vs August; Q3)
  const monthly = ["hg_received", "hg_incomplete", "hg_resolution", "hg_touches", "hg_closed", "chc_contacts", "chc_wait", "chc_abandon", "chc_fcr", "chc_repeat", "chc_cost", "cmp_ontime", "fm_comfort_agc", "fm_ppm", "bp_issued", "bp_cycle", "insp_count"];
  for (const id of monthly) {
    const def = metrics.find((m) => m.id === id);
    if (!def) continue;
    const sep = compute(ds, def, "2026-09-01", "2026-09-30");
    const aug = compute(ds, def, "2026-08-01", "2026-08-31");
    if (sep.value == null || aug.value == null) continue;
    const rel = aug.value ? ((sep.value - aug.value) / aug.value) * 100 : 0;
    const text = `${def.name.en}: September 2026 ${fmtValue(def, sep.value)} vs August 2026 ${fmtValue(def, aug.value)} (${def.unit === "count" || def.unit === "aed" ? `${rel >= 0 ? "+" : "−"}${fmtNumber(Math.abs(rel), 0)}%` : fmtDelta(def, sep.value - aug.value)})${sep.target != null ? `; September target ${def.better === "down" ? "≤" : "≥"} ${fmtValue(def, sep.target)}` : ""}.`;
    facts.push({
      id: `K-${def.id}-2026-09`,
      metricId: def.id,
      dept: def.dept,
      kind: "month",
      title: `${def.name.en} — September vs August`,
      text,
      value: sep.value,
      formatted: fmtValue(def, sep.value),
      rag: sep.rag,
      signal: Math.min(4, Math.abs(rel) / 12),
      change: rel > 0.5 ? "up" : rel < -0.5 ? "down" : "flat",
      numbers: extractNumbers(text),
    });
  }
  const quarterly = ["bp_received", "bp_issued", "bp_cycle", "bp_rework", "bp_noc", "insp_count", "insp_violations", "fm_comfort_agc"];
  for (const id of quarterly) {
    const def = metrics.find((m) => m.id === id);
    if (!def) continue;
    const q3 = compute(ds, def, "2026-07-01", "2026-09-30");
    const h1 = compute(ds, def, "2026-01-01", "2026-06-30");
    if (q3.value == null) continue;
    const perMonth = def.unit === "count" ? ` (${fmtNumber(q3.value / 3, 0)} per month)` : "";
    const h1Text = h1.value != null ? `; H1 2026 ${def.unit === "count" ? `${fmtNumber(h1.value / 6, 0)} per month` : fmtValue(def, h1.value)}` : "";
    const text = `${def.name.en}: Q3 2026 ${fmtValue(def, q3.value)}${perMonth}${q3.n != null && def.agg.kind === "permit" ? ` (n = ${fmtNumber(q3.n)})` : ""}${h1Text}${q3.target != null ? `; target ${def.better === "down" ? "≤" : "≥"} ${fmtValue(def, q3.target)}` : ""}.`;
    facts.push({
      id: `K-${def.id}-2026-Q3`,
      metricId: def.id,
      dept: def.dept,
      kind: "quarter",
      title: `${def.name.en} — Q3 2026`,
      text,
      value: q3.value,
      formatted: fmtValue(def, q3.value),
      rag: q3.rag,
      signal: 0.5,
      change: "flat",
      numbers: extractNumbers(text),
    });
  }
  return facts;
}

/** All numeric tokens in a text, normalised (commas removed, m:ss kept) — used to trace figures to sources. */
export function extractNumbers(text: string): string[] {
  const out: string[] = [];
  const re = /\d+:\d{2}|\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;
  for (const m of text.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).matchAll(re)) out.push(m[0].replace(/,/g, ""));
  return out;
}

/* ───────────── actions register ───────────── */

export interface ActionItem {
  id: string;
  title: string;
  titleAr?: string;
  owner: string;
  dept: Dept | "strategy" | "procurement";
  raisedIn: string;
  raisedAt: string;
  due: string;
  status: "open" | "in_progress" | "done";
  closedAt?: string | null;
  kpi?: string | null;
  note?: string;
  source?: "seed" | "approved";
}

export function actionStats(actions: ActionItem[], today: string) {
  const due = actions.filter((a) => a.due <= today);
  const closedOnTime = due.filter((a) => a.status === "done" && a.closedAt && a.closedAt.slice(0, 10) <= a.due);
  const closedLate = due.filter((a) => a.status === "done" && (!a.closedAt || a.closedAt.slice(0, 10) > a.due));
  const overdue = actions.filter((a) => a.status !== "done" && a.due < today);
  const open = actions.filter((a) => a.status !== "done");
  const dueSoon = actions.filter((a) => a.status !== "done" && a.due >= today && daysBetween(today, a.due) <= 7);
  return {
    total: actions.length,
    due: due.length,
    closedOnTime: closedOnTime.length,
    closedLate: closedLate.length,
    overdue: overdue.length,
    open: open.length,
    dueSoon: dueSoon.length,
    /** catalogue measure: actions due to date that have been closed */
    closureRate: due.length ? ((closedOnTime.length + closedLate.length) / due.length) * 100 : null,
    onTimeRate: due.length ? (closedOnTime.length / due.length) * 100 : null,
  };
}
