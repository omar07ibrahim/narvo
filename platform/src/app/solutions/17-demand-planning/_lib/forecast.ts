/**
 * Forecasting engine for 17 — Demand & Resource Planning. Pure TypeScript (no I/O), deterministic.
 *
 *  1. Calendar effects — log-linear regression of demand on trend + Fourier annual terms +
 *     Ramadan / Eid / summer midday-ban / fixed holidays / promotion (+ post-promotion dip).
 *  2. Holt-Winters — multiplicative 52-week seasonality with damped additive trend, fitted on the
 *     calendar-adjusted series; α, β, γ, φ chosen by grid search on one-step-ahead relative error.
 *  3. Uncertainty — residual bootstrap sample paths (state re-simulated each step) → P10 / P50 / P90.
 *  4. Backtest — refit without the last N weeks, compare with actuals; seasonal-naive baseline
 *     (same week last year) and P10–P90 interval coverage.
 */

import type { Backtest, CalendarDef, CalendarEffects, SeriesForecast, WhId } from "./types";

export const DAY = 86400000;
export const parseDay = (s: string) => Date.parse(s + "T00:00:00Z");
export const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addWeeks = (iso: string, n: number) => isoDay(parseDay(iso) + n * 7 * DAY);

export function mulberry32(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function quantile(sorted: number[], q: number) {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/* ───────────── Calendar regressors ───────────── */

export interface CalRow {
  ramadan: number;
  eid: number;
  summer: number;
  holiday: number;
  promo: number;
  post: number;
  promoName?: string;
}

/** Fractions of the six trading days (Mon–Sat) of a week inside each calendar event. */
export function calendarRow(weekIso: string, cal: CalendarDef, family: string): CalRow {
  const wk = parseDay(weekIso);
  let ram = 0,
    eid = 0,
    sum = 0,
    hol = 0;
  for (let k = 0; k < 6; k++) {
    const day = wk + k * DAY;
    if (cal.ramadan.some((r) => day >= parseDay(r.from) && day <= parseDay(r.to))) ram++;
    if (cal.eid.some((r) => day >= parseDay(r.from) && day <= parseDay(r.to))) eid++;
    const md = isoDay(day).slice(5);
    if (md >= cal.summerBan.fromMonthDay && md <= cal.summerBan.toMonthDay) sum++;
    const y = new Date(day).getUTCFullYear();
    for (const h of cal.fixedHolidays) {
      const s = parseDay(`${y}-${h.monthDay}`);
      if (day >= s && day < s + h.days * DAY) hol++;
    }
  }
  const promos = cal.promotions.filter((p) => p.family === family);
  const p = promos.find((x) => x.week === weekIso);
  const prev = promos.find((x) => x.week === addWeeks(weekIso, -1));
  return { ramadan: ram / 6, eid: eid / 6, summer: sum / 6, holiday: hol / 6, promo: p ? 1 : 0, post: prev ? 1 : 0, promoName: p?.name };
}

/* ───────────── Least squares (normal equations, tiny ridge) ───────────── */

function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    const d = M[c][c] || 1e-12;
    for (let k = c; k <= n; k++) M[c][k] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c];
      if (!f) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r) => r[n]);
}

function ols(X: number[][], y: number[], ridge = 1e-4): number[] {
  const p = X[0].length;
  const XtX = Array.from({ length: p }, () => new Array(p).fill(0));
  const Xty = new Array(p).fill(0);
  for (let i = 0; i < X.length; i++) {
    const r = X[i];
    for (let a = 0; a < p; a++) {
      Xty[a] += r[a] * y[i];
      for (let b = a; b < p; b++) XtX[a][b] += r[a] * r[b];
    }
  }
  for (let a = 0; a < p; a++) {
    for (let b = 0; b < a; b++) XtX[a][b] = XtX[b][a];
    if (a > 0) XtX[a][a] += ridge * X.length;
  }
  return solve(XtX, Xty);
}

const CAL_KEYS = ["ramadan", "eid", "summer", "holiday", "promo", "post"] as const;

function designRow(weekIso: string, t: number, c: CalRow): number[] {
  const doy = (parseDay(weekIso) - Date.UTC(new Date(parseDay(weekIso)).getUTCFullYear(), 0, 1)) / DAY;
  const w = (2 * Math.PI * doy) / 365.25;
  return [1, t / 52, Math.sin(w), Math.cos(w), Math.sin(2 * w), Math.cos(2 * w), Math.sin(3 * w), Math.cos(3 * w), c.ramadan, c.eid, c.summer, c.holiday, c.promo, c.post];
}

export interface CalendarModel {
  beta: Record<(typeof CAL_KEYS)[number], number>;
}

export function estimateCalendar(weeks: string[], values: number[], rows: CalRow[]): CalendarModel {
  const X: number[][] = [];
  const y: number[] = [];
  values.forEach((v, t) => {
    if (v <= 0) return;
    X.push(designRow(weeks[t], t, rows[t]));
    y.push(Math.log(v));
  });
  const b = ols(X, y);
  const beta = {} as CalendarModel["beta"];
  CAL_KEYS.forEach((k, i) => (beta[k] = b[8 + i]));
  // Promotions and calendar dips must keep their sign; guard against noise flipping them.
  beta.ramadan = Math.min(0, beta.ramadan);
  beta.eid = Math.min(0, beta.eid);
  beta.summer = Math.min(0, beta.summer);
  beta.holiday = Math.min(0, beta.holiday);
  beta.promo = Math.max(0, beta.promo);
  beta.post = Math.min(0, beta.post);
  return { beta };
}

export function calFactor(m: CalendarModel, c: CalRow) {
  let s = 0;
  for (const k of CAL_KEYS) s += m.beta[k] * c[k];
  return Math.exp(s);
}

export function effectsOf(m: CalendarModel): CalendarEffects {
  const pct = (b: number) => Math.exp(b) - 1;
  return { ramadan: pct(m.beta.ramadan), eid: pct(m.beta.eid), summer: pct(m.beta.summer), holiday: pct(m.beta.holiday), promo: pct(m.beta.promo) };
}

/* ───────────── Holt-Winters (multiplicative season, damped additive trend) ───────────── */

export interface HwParams {
  alpha: number;
  beta: number;
  gamma: number;
  phi: number;
}

export interface HwState {
  level: number;
  trend: number;
  season: number[]; // length m, indexed by (t mod m)
  n: number; // number of observations consumed
  m: number;
}

function hwInit(a: number[], m: number): HwState {
  const mean = (arr: number[]) => arr.reduce((x, y) => x + y, 0) / Math.max(1, arr.length);
  if (m <= 1 || a.length < 2 * m) {
    const k = Math.min(a.length, 8);
    const l0 = mean(a.slice(0, k));
    const b0 = a.length > 2 * k ? (mean(a.slice(k, 2 * k)) - l0) / k : 0;
    return { level: l0, trend: b0, season: [1], n: 0, m: 1 };
  }
  const y1 = a.slice(0, m);
  const y2 = a.slice(m, 2 * m);
  const m1 = mean(y1);
  const m2 = mean(y2);
  const b0 = (m2 - m1) / m;
  const mid = (m - 1) / 2;
  const raw = new Array(m).fill(0).map((_, i) => {
    const r1 = y1[i] / Math.max(1e-9, m1 + (i - mid) * b0);
    const r2 = y2[i] / Math.max(1e-9, m2 + (i - mid) * b0);
    return (r1 + r2) / 2;
  });
  // Weekly indices from two seasons are noisy: smooth with a 5-week triangular kernel (1-2-3-2-1).
  const K = [1, 2, 3, 2, 1];
  const sm =
    m >= 26
      ? raw.map((_, i) => K.reduce((acc, w, j) => acc + w * raw[(i + j - 2 + m) % m], 0) / 9)
      : m >= 12
        ? raw.map((_, i) => 0.25 * raw[(i + m - 1) % m] + 0.5 * raw[i] + 0.25 * raw[(i + 1) % m])
        : raw;
  const norm = mean(sm);
  return { level: m1 - (mid + 0.5) * b0, trend: b0, season: sm.map((s) => s / norm), n: 0, m };
}

function hwRun(a: number[], p: HwParams, m: number, collect = false) {
  const st = hwInit(a, m);
  const mm = st.m;
  const warm = mm > 1 ? mm : Math.min(8, Math.floor(a.length / 3));
  let sse = 0;
  let count = 0;
  const residuals: number[] = [];
  const fitted: number[] = [];
  let { level, trend } = st;
  const S = st.season.slice();
  const gamma = mm > 1 ? p.gamma : 0;
  for (let t = 0; t < a.length; t++) {
    const idx = t % mm;
    const s = S[idx];
    const pred = (level + p.phi * trend) * s;
    if (collect) fitted.push(pred);
    if (t >= warm && pred > 0) {
      const e = (a[t] - pred) / pred;
      sse += e * e;
      count++;
      if (collect) residuals.push(e);
    }
    const lNew = (p.alpha * a[t]) / s + (1 - p.alpha) * (level + p.phi * trend);
    const bNew = p.beta * (lNew - level) + (1 - p.beta) * p.phi * trend;
    S[idx] = (gamma * a[t]) / Math.max(1e-9, lNew) + (1 - gamma) * s;
    level = lNew;
    trend = bNew;
  }
  return { sse: count ? sse / count : Infinity, residuals, fitted, state: { level, trend, season: S, n: a.length, m: mm } as HwState };
}

const GRID = {
  alpha: [0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5],
  beta: [0, 0.01, 0.03, 0.06],
  gamma: [0.02, 0.05, 0.1, 0.2],
  phi: [0.9, 0.98],
};

export function fitHW(a: number[], m = 52) {
  let best: { p: HwParams; sse: number } | null = null;
  const gammas = m > 1 && a.length >= 2 * m ? GRID.gamma : [0];
  for (const alpha of GRID.alpha)
    for (const beta of GRID.beta)
      for (const gamma of gammas)
        for (const phi of GRID.phi) {
          const r = hwRun(a, { alpha, beta, gamma, phi }, m);
          if (!best || r.sse < best.sse) best = { p: { alpha, beta, gamma, phi }, sse: r.sse };
        }
  const final = hwRun(a, best!.p, m, true);
  return { params: best!.p, ...final };
}

export function hwPoint(state: HwState, p: HwParams, h: number) {
  let damp = 0;
  for (let j = 1; j <= h; j++) damp += Math.pow(p.phi, j);
  return Math.max(0, (state.level + damp * state.trend) * state.season[(state.n + h - 1) % state.m]);
}

/** Simulate N sample paths of length H; returns paths[p][h] on the adjusted scale. */
export function hwPaths(state: HwState, p: HwParams, residuals: number[], H: number, N: number, rng: () => number) {
  const meanE = residuals.reduce((x, y) => x + y, 0) / Math.max(1, residuals.length);
  // In-sample residuals understate out-of-sample error: correct for the effective number of
  // fitted state parameters (level, trend, smoothed seasonal profile ≈ m/3 + 2).
  const pEff = state.m > 1 ? state.m / 3 + 2 : 2;
  const nRes = Math.max(pEff + 4, residuals.length);
  const inflate = Math.sqrt(nRes / (nRes - pEff));
  const res = residuals.map((e) => (e - meanE) * inflate);
  const mm = state.m;
  const gamma = mm > 1 ? p.gamma : 0;
  const out: number[][] = [];
  for (let k = 0; k < N; k++) {
    let { level, trend } = state;
    const S = state.season.slice();
    const path: number[] = [];
    for (let h = 1; h <= H; h++) {
      const idx = (state.n + h - 1) % mm;
      const s = S[idx];
      const pred = Math.max(0, (level + p.phi * trend) * s);
      const e = res.length ? res[Math.floor(rng() * res.length)] : 0;
      const y = Math.max(0, pred * (1 + e));
      path.push(y);
      const lNew = (p.alpha * y) / s + (1 - p.alpha) * (level + p.phi * trend);
      const bNew = p.beta * (lNew - level) + (1 - p.beta) * p.phi * trend;
      S[idx] = (gamma * y) / Math.max(1e-9, lNew) + (1 - gamma) * s;
      level = lNew;
      trend = bNew;
    }
    out.push(path);
  }
  return out;
}

function quantilesByH(paths: number[][], H: number) {
  const p10: number[] = [];
  const p50: number[] = [];
  const p90: number[] = [];
  for (let h = 0; h < H; h++) {
    const col = paths.map((p) => p[h]).sort((a, b) => a - b);
    p10.push(quantile(col, 0.1));
    p50.push(quantile(col, 0.5));
    p90.push(quantile(col, 0.9));
  }
  return { p10, p50, p90 };
}

const round = (v: number, dec: boolean) => (dec ? Math.round(v * 10) / 10 : Math.round(v));

/* ───────────── Series-level forecast ───────────── */

export interface SeriesInput {
  key: string;
  sku: string;
  wh: WhId;
  family: string;
  tonnes?: boolean;
  weeks: string[];
  values: number[];
  promo: number[];
}

export interface ForecastOptions {
  cal: CalendarDef;
  horizon: number; // forecast weeks
  planWeeks: number; // weeks of sample paths kept for planning
  backtestWeeks: number;
  nPaths: number; // for quantiles
  nPlanPaths: number;
}

function noteFor(c: CalRow, lang: "en" | "ar" = "en") {
  const notes: string[] = [];
  if (c.ramadan > 0) notes.push(lang === "ar" ? "رمضان" : `Ramadan ${Math.round(c.ramadan * 6)}/6 d`);
  if (c.eid > 0) notes.push("Eid");
  if (c.holiday > 0) notes.push("Public holiday");
  if (c.promoName) notes.push(`Promo: ${c.promoName}`);
  if (c.post > 0) notes.push("Post-promo");
  return notes.join(" · ");
}

export function forecastSeries(input: SeriesInput, o: ForecastOptions): SeriesForecast & { _hw: ReturnType<typeof fitHW>; _cal: CalendarModel } {
  const { weeks, values } = input;
  const n = values.length;
  const rows = weeks.map((w) => calendarRow(w, o.cal, input.family));
  const calModel = estimateCalendar(weeks, values, rows);
  const adj = values.map((v, t) => Math.max(0.0001, v / calFactor(calModel, rows[t])));
  const hw = fitHW(adj);

  const lastWeek = weeks[n - 1];
  const fWeeks = Array.from({ length: o.horizon }, (_, h) => addWeeks(lastWeek, h + 1));
  const fRows = fWeeks.map((w) => calendarRow(w, o.cal, input.family));
  const fFactor = fRows.map((r) => calFactor(calModel, r));
  const rng = mulberry32(hashSeed(input.key));
  const rawPaths = hwPaths(hw.state, hw.params, hw.residuals, o.horizon, o.nPaths, rng).map((p) => p.map((v, h) => v * fFactor[h]));
  const q = quantilesByH(rawPaths, o.horizon);
  const dec = !!input.tonnes;

  // Backtest: everything re-estimated on the training window only.
  const B = o.backtestWeeks;
  const trainW = weeks.slice(0, n - B);
  const trainV = values.slice(0, n - B);
  const trainRows = rows.slice(0, n - B);
  const calB = estimateCalendar(trainW, trainV, trainRows);
  const adjB = trainV.map((v, t) => Math.max(0.0001, v / calFactor(calB, trainRows[t])));
  const hwB = fitHW(adjB);
  const testRows = rows.slice(n - B);
  const model = testRows.map((r, h) => hwPoint(hwB.state, hwB.params, h + 1) * calFactor(calB, r));
  const bPaths = hwPaths(hwB.state, hwB.params, hwB.residuals, B, 200, mulberry32(hashSeed(input.key + ":bt"))).map((p) =>
    p.map((v, h) => v * calFactor(calB, testRows[h])),
  );
  const bq = quantilesByH(bPaths, B);
  const actual = values.slice(n - B);
  const naive = actual.map((_, h) => values[n - B + h - 52]);
  const mape = (pred: number[]) => actual.reduce((s, a, i) => s + Math.abs(a - pred[i]) / Math.max(1e-9, a), 0) / B;
  const coverage = actual.filter((a, i) => a >= bq.p10[i] && a <= bq.p90[i]).length / B;
  const backtest: Backtest = {
    weeks: weeks.slice(n - B),
    actual,
    model: model.map((v) => round(v, dec)),
    naive,
    p10: bq.p10.map((v) => round(v, dec)),
    p90: bq.p90.map((v) => round(v, dec)),
    mape: mape(model),
    naiveMape: mape(naive),
    coverage,
  };

  const resCv = Math.sqrt(hw.residuals.reduce((s, e) => s + e * e, 0) / Math.max(1, hw.residuals.length));
  return {
    key: input.key,
    sku: input.sku,
    wh: input.wh,
    method: "hw",
    params: hw.params,
    effects: effectsOf(calModel),
    residualCv: resCv,
    history: { weeks, values, promo: input.promo },
    forecast: {
      weeks: fWeeks,
      p10: q.p10.map((v) => round(v, dec)),
      p50: q.p50.map((v) => round(v, dec)),
      p90: q.p90.map((v) => round(v, dec)),
      notes: fRows.map((r) => noteFor(r)),
    },
    backtest,
    paths: rawPaths.slice(0, o.nPlanPaths).map((p) => p.slice(0, o.planWeeks).map((v) => round(v, dec))),
    _hw: hw,
    _cal: calModel,
  };
}

/** New product without history: analogue seasonality × launch ramp × pre-orders, with level + weekly uncertainty. */
export function analogueForecast(
  args: {
    key: string;
    sku: string;
    wh: WhId;
    family: string;
    analogue: { hw: ReturnType<typeof fitHW>; cal: CalendarModel };
    launchDate: string;
    runRate: number;
    rampWeeks: number;
    preOrders: number;
    levelCv: number;
    weeklyCv: number;
    firstWeek: string;
  },
  o: ForecastOptions,
): SeriesForecast {
  const fWeeks = Array.from({ length: o.horizon }, (_, h) => addWeeks(args.firstWeek, h));
  const fRows = fWeeks.map((w) => calendarRow(w, o.cal, args.family));
  const S = args.analogue.hw.state;
  const meanS = S.season.reduce((a, b) => a + b, 0) / S.season.length;
  const launchMs = parseDay(args.launchDate);
  const base = fWeeks.map((w, h) => {
    const k = Math.floor((parseDay(w) - launchMs) / (7 * DAY));
    if (k < 0) return 0;
    const ramp = Math.min(1, 0.35 + (0.65 * k) / args.rampWeeks);
    const season = S.season[(S.n + h) % S.m] / meanS;
    return args.runRate * ramp * season * calFactor(args.analogue.cal, fRows[h]) + (k === 0 ? args.preOrders : 0);
  });
  const rng = mulberry32(hashSeed(args.key));
  const g = () => {
    let u = 0;
    let v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const paths: number[][] = [];
  for (let p = 0; p < o.nPaths; p++) {
    const lvl = Math.exp(args.levelCv * g() - (args.levelCv * args.levelCv) / 2);
    paths.push(base.map((b) => Math.max(0, Math.round(b * lvl * Math.exp(args.weeklyCv * g() - (args.weeklyCv * args.weeklyCv) / 2)))));
  }
  const q = quantilesByH(paths, o.horizon);
  return {
    key: args.key,
    sku: args.sku,
    wh: args.wh,
    method: "analogue",
    residualCv: args.weeklyCv,
    history: { weeks: [], values: [], promo: [] },
    forecast: {
      weeks: fWeeks,
      p10: q.p10.map(Math.round),
      p50: q.p50.map(Math.round),
      p90: q.p90.map(Math.round),
      notes: fRows.map((r, h) => {
        const k = Math.floor((parseDay(fWeeks[h]) - launchMs) / (7 * DAY));
        const n = noteFor(r);
        if (k === 0) return ["Launch week (incl. pre-orders)", n].filter(Boolean).join(" · ");
        if (k < 0) return "Pre-launch";
        return n;
      }),
    },
    paths: paths.slice(0, o.nPlanPaths).map((p) => p.slice(0, o.planWeeks)),
  };
}

/* ───────────── Bring-your-own series (CSV upload) ───────────── */

export interface ByoResult {
  frequency: "daily" | "weekly" | "monthly";
  periods: number;
  seasonLength: number;
  method: string;
  params?: HwParams;
  history: { t: string; v: number }[];
  forecast: { t: string; p10: number; p50: number; p90: number }[];
  backtest: { t: string; actual: number; model: number; naive: number }[];
  mape: number;
  naiveMape: number;
  coverage: number;
}

/** Forecast an arbitrary uploaded series: frequency detection, weekly aggregation of daily data, HW/Holt fit, backtest. */
export function forecastByo(input: Array<{ t: string; v: number }>): ByoResult {
  const pts = input
    .filter((p) => Number.isFinite(p.v) && !Number.isNaN(parseDay(p.t)))
    .sort((a, b) => parseDay(a.t) - parseDay(b.t));
  if (pts.length < 8) throw new Error("At least 8 dated values are needed to fit a forecast.");
  const gaps = pts.slice(1).map((p, i) => (parseDay(p.t) - parseDay(pts[i].t)) / DAY).sort((a, b) => a - b);
  const medGap = gaps[Math.floor(gaps.length / 2)];
  let frequency: ByoResult["frequency"] = medGap <= 1.5 ? "daily" : medGap <= 10 ? "weekly" : "monthly";
  let series = pts;
  if (frequency === "daily") {
    const byWeek = new Map<string, number>();
    for (const p of pts) {
      const ms = parseDay(p.t);
      const dow = (new Date(ms).getUTCDay() + 6) % 7; // Monday = 0
      const wk = isoDay(ms - dow * DAY);
      byWeek.set(wk, (byWeek.get(wk) ?? 0) + p.v);
    }
    series = Array.from(byWeek.entries())
      .sort((a, b) => parseDay(a[0]) - parseDay(b[0]))
      .map(([t, v]) => ({ t, v }));
    frequency = "weekly";
  }
  const n = series.length;
  const seasonLength = frequency === "weekly" ? (n >= 104 + 8 ? 52 : 1) : n >= 24 + 4 ? 12 : 1;
  const values = series.map((p) => Math.max(0.0001, p.v));
  const B = Math.max(2, Math.min(frequency === "weekly" ? 12 : 6, Math.floor(n / 5)));
  const H = frequency === "weekly" ? 26 : 12;
  const step = (t: string, k: number) => {
    if (frequency === "weekly") return addWeeks(t, k);
    const dt = new Date(parseDay(t));
    dt.setUTCMonth(dt.getUTCMonth() + k);
    return isoDay(dt.getTime());
  };

  const fit = fitHW(values, seasonLength);
  const rng = mulberry32(hashSeed(series.map((p) => p.v).join(",").slice(0, 400)));
  const paths = hwPaths(fit.state, fit.params, fit.residuals, H, 400, rng);
  const q = quantilesByH(paths, H);

  const train = values.slice(0, n - B);
  const fitB = fitHW(train, seasonLength >= 2 && train.length >= 2 * seasonLength ? seasonLength : 1);
  const bPaths = hwPaths(fitB.state, fitB.params, fitB.residuals, B, 200, mulberry32(7));
  const bq = quantilesByH(bPaths, B);
  const actual = values.slice(n - B);
  const model = actual.map((_, h) => hwPoint(fitB.state, fitB.params, h + 1));
  const naive = actual.map((_, h) => (seasonLength > 1 && n - B + h - seasonLength >= 0 ? values[n - B + h - seasonLength] : values[n - B - 1]));
  const mape = (pred: number[]) => actual.reduce((s, a, i) => s + Math.abs(a - pred[i]) / Math.max(1e-9, Math.abs(a)), 0) / B;
  const r2 = (v: number) => Math.round(v * 100) / 100;
  return {
    frequency,
    periods: n,
    seasonLength,
    method: seasonLength > 1 ? `Holt-Winters (multiplicative, damped trend, season ${seasonLength})` : "Holt damped trend (series too short for seasonality)",
    params: fit.params,
    history: series.map((p) => ({ t: p.t, v: r2(p.v) })),
    forecast: q.p50.map((_, h) => ({ t: step(series[n - 1].t, h + 1), p10: r2(q.p10[h]), p50: r2(q.p50[h]), p90: r2(q.p90[h]) })),
    backtest: actual.map((a, h) => ({ t: series[n - B + h].t, actual: r2(a), model: r2(model[h]), naive: r2(naive[h]) })),
    mape: mape(model),
    naiveMape: mape(naive),
    coverage: actual.filter((a, i) => a >= bq.p10[i] && a <= bq.p90[i]).length / B,
  };
}
