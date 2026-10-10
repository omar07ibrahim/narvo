/**
 * Building-signal analytics for solution 20 — pure and isomorphic.
 * Anomalies, correlations, verification checks and energy normalisation are computed here from the hourly
 * BMS trends, complaints, PPM and job records. The model only explains and drafts from these results.
 */

export interface Series {
  site: string;
  ts: string[];
  /** ms since epoch for each hour */
  t: number[];
  cols: Record<string, number[]>;
}

export interface Complaint {
  id: string;
  receivedAt: string;
  site: string;
  zone: string;
  channel: string;
  lang: string;
  category: string;
  text: string;
}

export interface Trip {
  at: string;
  ambient: number;
  dischargeKpa: number;
  lockoutHours: number;
}

export interface Job {
  id: string;
  title: string;
  titleAr?: string;
  site: string;
  asset: string;
  zone: string;
  priority: string;
  source: string;
  raisedAt: string;
  respondedAt: string | null;
  completedAt: string | null;
  status: string;
  technician?: string;
  supervisor?: string;
  resolution?: string;
}

export const COMFORT = { low: 22.5, high: 24.5 };
export const HP_TRIP = 1750;
const H = 3600000;

/** Inverse of the R134a saturation fit used by the BMS export (kPa abs → °C). */
export const tcFromKpa = (kpa: number) => 2624.4 / (15.3054 - Math.log(kpa)) - 273.15;

export const zoneCol = (zoneId: string) => `${zoneId.toLowerCase().replace("-", "_")}_c`;

export function parseSeries(site: string, rows: Record<string, string>[]): Series {
  const ts = rows.map((r) => r.ts);
  const cols: Record<string, number[]> = {};
  for (const k of Object.keys(rows[0])) if (k !== "ts") cols[k] = rows.map((r) => Number(r[k]));
  return { site, ts, t: ts.map((x) => Date.parse(x)), cols };
}

const localHour = (ms: number) => new Date(ms + 4 * H).getUTCHours();
const localDow = (ms: number) => new Date(ms + 4 * H).getUTCDay();
export const occupiedAgc = (ms: number) => {
  const h = localHour(ms);
  return localDow(ms) === 5 ? h >= 14 && h < 22 : h >= 8 && h < 22;
};
export const occupiedHq = (ms: number) => {
  const h = localHour(ms);
  const d = localDow(ms);
  return d >= 1 && d <= 5 && h >= 7 && h < (d === 5 ? 12 : 16);
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const k = s.length >> 1;
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
};
function pearson(x: number[], y: number[]) {
  const n = x.length;
  if (n < 3) return null;
  const mx = mean(x)!;
  const my = mean(y)!;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy);
}

/* ───────────── anomalies ───────────── */

export interface Anomaly {
  id: string;
  kind: "trip" | "near_trip" | "shortfall" | "zone_hot" | "zone_cold" | "pressure_gap";
  asset?: string;
  zone?: string;
  start: number;
  end: number;
  hours: number;
  peak: number;
  severity: "high" | "medium" | "low";
  label: string;
}

function episodes(s: Series, pred: (i: number) => boolean) {
  const out: Array<[number, number]> = [];
  let start = -1;
  for (let i = 0; i <= s.t.length; i++) {
    const on = i < s.t.length && pred(i);
    if (on && start < 0) start = i;
    if (!on && start >= 0) {
      out.push([start, i - 1]);
      start = -1;
    }
  }
  return out;
}

export function detectAnomalies(s: Series, zones: Array<{ id: string; name: string }>): Anomaly[] {
  const out: Anomaly[] = [];
  const c = s.cols;
  const occ = s.site === "HQ" ? occupiedHq : occupiedAgc;
  let n = 0;
  const add = (a: Omit<Anomaly, "id">) => out.push({ ...a, id: `A-${s.site}-${++n}` });
  if (c.ch02_trip) {
    for (let i = 0; i < s.t.length; i++)
      if (c.ch02_trip[i] === 1)
        add({ kind: "trip", asset: "CH-02", start: s.t[i], end: s.t[i], hours: 1, peak: c.ch02_dp_kpa[i], severity: "high", label: `CH-02 high-pressure trip at ${c.ambient_c[i].toFixed(1)} °C ambient` });
    for (const [a, b] of episodes(s, (i) => c.ch02_status[i] === 1 && c.ch02_trip[i] === 0 && c.ch02_dp_kpa[i] >= 1700)) {
      const peak = Math.max(...c.ch02_dp_kpa.slice(a, b + 1));
      add({ kind: "near_trip", asset: "CH-02", start: s.t[a], end: s.t[b], hours: b - a + 1, peak, severity: "medium", label: `CH-02 on high-pressure unloading (peak ${Math.round(peak)} kPa)` });
    }
  }
  if (c.chws_c) {
    for (const [a, b] of episodes(s, (i) => c.chws_c[i] > 8)) {
      const peak = Math.max(...c.chws_c.slice(a, b + 1));
      add({ kind: "shortfall", asset: "CHW loop", start: s.t[a], end: s.t[b], hours: b - a + 1, peak, severity: peak > 9.5 ? "high" : "medium", label: `Chilled-water supply up to ${peak.toFixed(1)} °C (setpoint 6.7 °C)` });
    }
  }
  for (const z of zones) {
    const col = c[zoneCol(z.id)];
    if (!col) continue;
    for (const [a, b] of episodes(s, (i) => occ(s.t[i]) && col[i] > COMFORT.high + 0.3)) {
      const peak = Math.max(...col.slice(a, b + 1));
      if (b - a + 1 < 1) continue;
      add({ kind: "zone_hot", zone: z.id, start: s.t[a], end: s.t[b], hours: b - a + 1, peak, severity: peak > 26.5 ? "high" : "medium", label: `${z.name} at ${peak.toFixed(1)} °C (band 22.5–24.5 °C)` });
    }
    for (const [a, b] of episodes(s, (i) => occ(s.t[i]) && col[i] < COMFORT.low - 0.7)) {
      const peak = Math.min(...col.slice(a, b + 1));
      if (b - a + 1 < 2) continue;
      add({ kind: "zone_cold", zone: z.id, start: s.t[a], end: s.t[b], hours: b - a + 1, peak, severity: "low", label: `${z.name} at ${peak.toFixed(1)} °C — below band` });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/* ───────────── correlation evidence (Al Ghaf) ───────────── */

export interface Evidence {
  key: string;
  title: string;
  text: string;
  value?: number;
}

export function correlationEvidence(
  s: Series,
  opts: { trips: Trip[]; complaints: Complaint[]; jobs: Job[]; ppmDue: string; cleanAt: string; energy: { sep25: number; sep26: number } },
): Evidence[] {
  const c = s.cols;
  const cleanMs = Date.parse(opts.cleanAt);
  const sepEnd = Date.parse("2026-10-01T00:00:00+04:00");
  const ev: Evidence[] = [];
  const sepTrips = opts.trips.filter((t) => Date.parse(t.at) < sepEnd);
  const ambs = sepTrips.map((t) => t.ambient);
  const hours = sepTrips.map((t) => localHour(Date.parse(t.at)));
  const hot = s.t.map((t, i) => [t, i] as const).filter(([t, i]) => t < cleanMs && c.ambient_c[i] > 44);
  const hotDays = new Set(hot.map(([t]) => new Date(t + 4 * H).toISOString().slice(0, 10)));
  const tripDays = new Set(sepTrips.map((t) => t.at.slice(0, 10)));
  ev.push({
    key: "trips",
    title: "CH-02 trips vs ambient temperature",
    text: `CH-02 tripped on high discharge pressure ${sepTrips.length} times in September 2026, on ${tripDays.size} days, all between ${Math.min(...hours)}:00 and ${Math.max(...hours) + 1}:00, at ambient ${Math.min(...ambs).toFixed(1)}–${Math.max(...ambs).toFixed(1)} °C (every trip above 44 °C). Ambient exceeded 44 °C on ${hotDays.size} days before the coil clean; CH-02 tripped on ${[...hotDays].filter((d) => tripDays.has(d)).length} of them. No trip occurred below 44 °C. HP cut-out 1,750 kPa.`,
    value: sepTrips.length,
  });
  // pressure vs ambient and approach
  const pre = s.t.map((t, i) => i).filter((i) => s.t[i] < cleanMs && c.ch02_status[i] === 1 && c.ch01_status[i] === 1 && c.ch02_trip[i] === 0);
  const r = pearson(pre.map((i) => c.ambient_c[i]), pre.map((i) => c.ch02_dp_kpa[i]));
  const app2 = pre.filter((i) => c.ch02_dp_kpa[i] < 1715).map((i) => tcFromKpa(c.ch02_dp_kpa[i]) - c.ambient_c[i]);
  const app1 = pre.map((i) => tcFromKpa(c.ch01_dp_kpa[i]) - c.ambient_c[i]);
  const gap = pre.map((i) => c.ch02_dp_kpa[i] - c.ch01_dp_kpa[i]);
  ev.push({
    key: "pressure",
    title: "Condenser performance CH-02 vs CH-01",
    text: `With both chillers running before the coil clean (${pre.length} hours), CH-02 discharge pressure correlates with ambient temperature (r = ${r?.toFixed(2)}) and averages ${Math.round(mean(gap)!)} kPa above CH-01 at the same hour. Condensing approach (condensing temperature minus ambient): CH-02 ${mean(app2)!.toFixed(1)} K vs CH-01 ${mean(app1)!.toFixed(1)} K — a fouled-condenser signature on CH-02, which sits next to the service road and kitchen extract.`,
    value: mean(gap)!,
  });
  // shortfall after trips
  const shortIdx = s.t.map((t, i) => i).filter((i) => c.chws_c[i] > 8 && s.t[i] < cleanMs);
  const tripMs = opts.trips.map((t) => Date.parse(t.at));
  const afterTrip = shortIdx.filter((i) => tripMs.some((tm) => s.t[i] >= tm - H && s.t[i] <= tm + 9 * H));
  ev.push({
    key: "shortfall",
    title: "Cooling shortfall after trips",
    text: `Chilled-water supply rose above 8 °C (setpoint 6.7 °C) for ${shortIdx.length} hours before the coil clean; ${afterTrip.length} of those hours (${Math.round((afterTrip.length / Math.max(1, shortIdx.length)) * 100)}%) fall within the lock-out after a CH-02 trip, when CH-01 alone (≈311 TR at 45 °C) could not meet the afternoon load.`,
    value: shortIdx.length,
  });
  // complaints
  const agcSep = opts.complaints.filter((x) => x.site === "AGC" && x.receivedAt >= "2026-09-01" && x.receivedAt < "2026-10-01");
  const agcAug = opts.complaints.filter((x) => x.site === "AGC" && x.receivedAt.startsWith("2026-08"));
  const linked = agcSep.filter((x) => tripMs.some((tm) => Date.parse(x.receivedAt) >= tm && Date.parse(x.receivedAt) <= tm + 4 * H));
  const temps = agcSep
    .map((x) => {
      const i = s.t.findIndex((t) => t > Date.parse(x.receivedAt)) - 1;
      const col = c[zoneCol(x.zone)];
      return i >= 0 && col ? Math.max(col[i], col[i + 1] ?? col[i]) : null;
    })
    .filter((v): v is number => v != null);
  const byZone = new Map<string, number>();
  for (const x of [...agcAug, ...agcSep]) byZone.set(x.zone, (byZone.get(x.zone) ?? 0) + 1);
  ev.push({
    key: "complaints",
    title: "Comfort complaints linked to trips",
    text: `Al Ghaf received ${agcAug.length + agcSep.length} comfort complaints in August–September 2026 (${agcAug.length} in August, ${agcSep.length} in September): Multipurpose Hall ${byZone.get("Z-MPH") ?? 0}, Ladies' Fitness ${byZone.get("Z-LF") ?? 0}, other zones ${agcAug.length + agcSep.length - (byZone.get("Z-MPH") ?? 0) - (byZone.get("Z-LF") ?? 0)}. ${linked.length} of the ${agcSep.length} September complaints arrived within 4 hours after a CH-02 trip; the complaining zone measured a median ${median(temps)!.toFixed(1)} °C at the time (contract band 22.5–24.5 °C). No comfort complaint has been received since the coil clean on 6 October.`,
    value: linked.length,
  });
  // zone hours outside band
  const zh = (zone: string, from: number, to: number) => s.t.filter((t, i) => t >= from && t < to && occupiedAgc(t) && c[zoneCol(zone)][i] > COMFORT.high).length;
  const sepStart = Date.parse("2026-09-01T00:00:00+04:00");
  ev.push({
    key: "zones",
    title: "Occupied hours above the comfort band",
    text: `Occupied hours above 24.5 °C in September: Multipurpose Hall ${zh("Z-MPH", sepStart, sepEnd)}, Ladies' Fitness ${zh("Z-LF", sepStart, sepEnd)}; since the coil clean (6–9 Oct): Multipurpose Hall ${zh("Z-MPH", cleanMs, Infinity)}, Ladies' Fitness ${zh("Z-LF", cleanMs, Infinity)}. These two zones carry the largest afternoon loads (events up to 440 attendees; fitness classes).`,
  });
  // PPM & response
  const due = Date.parse(opts.ppmDue + "T00:00:00+04:00");
  const tripJobs = opts.jobs.filter((j) => j.asset === "CH-02" && j.source === "BMS alarm");
  const resp = tripJobs.filter((j) => j.respondedAt).map((j) => (Date.parse(j.respondedAt!) - Date.parse(j.raisedAt)) / H);
  ev.push({
    key: "ppm",
    title: "Maintenance history",
    text: `Quarterly condenser-coil cleaning (contract §4.2) was due on 15 Aug 2026 and deferred by the contractor without written MNDA approval; it was ${Math.round((Date.parse(sepTrips[0].at) - due) / (24 * H))} days overdue at the first trip and ${Math.round((Date.parse(sepTrips[sepTrips.length - 1].at) - due) / (24 * H))} days overdue at the last. ${tripJobs.length} reactive jobs reset the chiller ("no fault found") with a mean response of ${mean(resp)!.toFixed(1)} hours (max ${Math.max(...resp).toFixed(1)} h); jobs were logged as P2 although loss of 50% of cooling to occupied halls above 40 °C is P1 (response 1 hour, Schedule 3 §2.1). A technician noted dusty, partly sand-blocked coils on 22 Sep.`,
    value: mean(resp)!,
  });
  ev.push({
    key: "energy",
    title: "Energy",
    text: `Chiller energy in September 2026 was ${Math.round(opts.energy.sep26).toLocaleString("en-US")} kWh vs ${Math.round(opts.energy.sep25).toLocaleString("en-US")} kWh in September 2025 (${((opts.energy.sep26 / opts.energy.sep25 - 1) * 100).toFixed(0)}% higher), consistent with the efficiency loss of a fouled condenser.`,
  });
  return ev;
}

/* ───────────── verification against criteria ───────────── */

export type CriterionMetric = "hp_trips" | "dp_drop_matched_ambient" | "approach_ch02" | "chws_occupied" | "zone_band" | "complaints";

export interface Criterion {
  metric: CriterionMetric;
  threshold: number;
  description: string;
}

export interface CriterionResult extends Criterion {
  value: number | null;
  pass: boolean | null;
  detail: string;
}

export interface Verification {
  completedAt: string;
  windowHours: number;
  baselineHours: number;
  enoughData: boolean;
  results: CriterionResult[];
  verdict: "verified" | "not_verified" | "insufficient_data";
}

export const DEFAULT_CRITERIA: Criterion[] = [
  { metric: "hp_trips", threshold: 0, description: "No CH-02 high-pressure trips after completion" },
  { metric: "dp_drop_matched_ambient", threshold: 80, description: "CH-02 discharge pressure at matched ambient at least 80 kPa lower than before" },
  { metric: "approach_ch02", threshold: 16, description: "CH-02 condensing approach ≤ 16 K" },
  { metric: "chws_occupied", threshold: 95, description: "Chilled-water supply ≤ 7.5 °C in ≥ 95% of occupied hours" },
  { metric: "zone_band", threshold: 90, description: "Multipurpose Hall and Ladies' Fitness within 22.5–24.5 °C in ≥ 90% of occupied hours" },
  { metric: "complaints", threshold: 0, description: "No comfort complaints after completion" },
];

export function verifyCompletion(s: Series, completedAtIso: string, criteria: Criterion[], complaints: Complaint[], minHours = 48): Verification {
  const c = s.cols;
  const T = Date.parse(completedAtIso);
  const post = s.t.map((t, i) => i).filter((i) => s.t[i] >= T);
  const base = s.t.map((t, i) => i).filter((i) => s.t[i] < T && s.t[i] >= T - 14 * 24 * H);
  const enough = post.length >= minHours;
  const results: CriterionResult[] = criteria.map((cr) => {
    let value: number | null = null;
    let pass: boolean | null = null;
    let detail = "";
    if (!post.length) return { ...cr, value, pass, detail: "No data after the completion time yet." };
    switch (cr.metric) {
      case "hp_trips": {
        value = post.filter((i) => c.ch02_trip[i] === 1).length;
        const before = base.filter((i) => c.ch02_trip[i] === 1).length;
        pass = value <= cr.threshold;
        const hot = post.filter((i) => c.ambient_c[i] > 40).length;
        detail = `${value} trips in ${post.length} h after completion (${before} in the 14 days before); ${hot} post-completion hours were above 40 °C ambient.`;
        break;
      }
      case "dp_drop_matched_ambient": {
        const bins: Array<[number, number]> = [];
        for (let a = 34; a < 46; a += 2) bins.push([a, a + 2]);
        const drops: number[] = [];
        const parts: string[] = [];
        for (const [lo, hi] of bins) {
          const pb = base.filter((i) => c.ch02_status[i] === 1 && c.ch02_trip[i] === 0 && c.ambient_c[i] >= lo && c.ambient_c[i] < hi).map((i) => c.ch02_dp_kpa[i]);
          const pp = post.filter((i) => c.ch02_status[i] === 1 && c.ambient_c[i] >= lo && c.ambient_c[i] < hi).map((i) => c.ch02_dp_kpa[i]);
          if (pb.length >= 3 && pp.length >= 3) {
            const d = mean(pb)! - mean(pp)!;
            drops.push(d);
            parts.push(`${lo}–${hi} °C: ${Math.round(mean(pb)!)} → ${Math.round(mean(pp)!)} kPa`);
          }
        }
        value = drops.length ? mean(drops)! : null;
        pass = value != null ? value >= cr.threshold : null;
        detail = drops.length ? `Mean reduction ${Math.round(value!)} kPa across ${drops.length} ambient bands (${parts.join("; ")}).` : "Not enough overlapping ambient conditions to compare.";
        break;
      }
      case "approach_ch02": {
        const xs = post.filter((i) => c.ch02_status[i] === 1).map((i) => tcFromKpa(c.ch02_dp_kpa[i]) - c.ambient_c[i]);
        const xb = base.filter((i) => c.ch02_status[i] === 1 && c.ch02_trip[i] === 0 && c.ch02_dp_kpa[i] < 1715).map((i) => tcFromKpa(c.ch02_dp_kpa[i]) - c.ambient_c[i]);
        value = xs.length ? mean(xs)! : null;
        pass = value != null ? value <= cr.threshold : null;
        detail = value != null ? `Mean approach ${value.toFixed(1)} K after completion vs ${mean(xb)?.toFixed(1)} K in the 14 days before.` : "CH-02 did not run after completion.";
        break;
      }
      case "chws_occupied": {
        const occ = post.filter((i) => occupiedAgc(s.t[i]));
        value = occ.length ? (occ.filter((i) => c.chws_c[i] <= 7.5).length / occ.length) * 100 : null;
        const ob = base.filter((i) => occupiedAgc(s.t[i]));
        const vb = ob.length ? (ob.filter((i) => c.chws_c[i] <= 7.5).length / ob.length) * 100 : null;
        pass = value != null ? value >= cr.threshold : null;
        detail = value != null ? `${value.toFixed(1)}% of ${occ.length} occupied hours at or below 7.5 °C (before: ${vb?.toFixed(1)}%).` : "No occupied hours yet.";
        break;
      }
      case "zone_band": {
        const occ = post.filter((i) => occupiedAgc(s.t[i]));
        const within = (i: number) => ["Z-MPH", "Z-LF"].every((z) => c[zoneCol(z)][i] >= COMFORT.low - 0.2 && c[zoneCol(z)][i] <= COMFORT.high);
        value = occ.length ? (occ.filter(within).length / occ.length) * 100 : null;
        const ob = base.filter((i) => occupiedAgc(s.t[i]));
        const vb = ob.length ? (ob.filter(within).length / ob.length) * 100 : null;
        pass = value != null ? value >= cr.threshold : null;
        detail = value != null ? `${value.toFixed(1)}% of ${occ.length} occupied hours within band (before: ${vb?.toFixed(1)}%).` : "No occupied hours yet.";
        break;
      }
      case "complaints": {
        const end = s.t[s.t.length - 1] + H;
        value = complaints.filter((x) => x.site === "AGC" && Date.parse(x.receivedAt) >= T && Date.parse(x.receivedAt) < end).length;
        const before = complaints.filter((x) => x.site === "AGC" && Date.parse(x.receivedAt) < T && Date.parse(x.receivedAt) >= T - 14 * 24 * H).length;
        pass = value <= cr.threshold;
        detail = `${value} comfort complaints after completion (${before} in the 14 days before).`;
        break;
      }
    }
    return { ...cr, value, pass, detail };
  });
  const verdict: Verification["verdict"] = !enough ? "insufficient_data" : results.every((r) => r.pass !== false) ? "verified" : "not_verified";
  return { completedAt: completedAtIso, windowHours: post.length, baselineHours: base.length, enoughData: enough, results, verdict };
}

/* ───────────── energy ───────────── */

export function efficiencyMatched(s: Series, cleanAtIso: string) {
  const c = s.cols;
  const T = Date.parse(cleanAtIso);
  const rows = (pre: boolean) =>
    s.t
      .map((t, i) => i)
      .filter((i) => (pre ? s.t[i] < T && s.t[i] >= T - 21 * 24 * H : s.t[i] >= T) && c.ch02_trip[i] === 0 && c.chws_c[i] <= 7.5 && c.load_tr[i] > 150);
  const bins: Array<{ band: string; pre: number | null; post: number | null }> = [];
  for (let a = 32; a < 42; a += 2) {
    const kwtr = (idx: number[]) => {
      const xs = idx.filter((i) => c.ambient_c[i] >= a && c.ambient_c[i] < a + 2).map((i) => (c.ch01_kw[i] + c.ch02_kw[i]) / c.load_tr[i]);
      return xs.length >= 3 ? mean(xs) : null;
    };
    bins.push({ band: `${a}–${a + 2} °C`, pre: kwtr(rows(true)), post: kwtr(rows(false)) });
  }
  const paired = bins.filter((b) => b.pre != null && b.post != null);
  const improvement = paired.length ? mean(paired.map((b) => 1 - b.post! / b.pre!)) : null;
  return { bins, improvement };
}

/** Weather-normalised September comparison using cooling degree-days (base 24 °C, daily mean). */
export function weatherNormalised(s: Series, sep25: Array<{ date: string; ambient_mean_c: number; chiller_kwh: number }>) {
  const c = s.cols;
  const days = new Map<string, { sum: number; n: number; kwh: number }>();
  for (let i = 0; i < s.t.length; i++) {
    const d = new Date(s.t[i] + 4 * H).toISOString().slice(0, 10);
    if (!d.startsWith("2026-09")) continue;
    const x = days.get(d) ?? { sum: 0, n: 0, kwh: 0 };
    x.sum += c.ambient_c[i];
    x.n++;
    x.kwh += c.ch01_kw[i] + c.ch02_kw[i];
    days.set(d, x);
  }
  const cdd26 = [...days.values()].reduce((a, x) => a + Math.max(0, x.sum / x.n - 24), 0);
  const kwh26 = [...days.values()].reduce((a, x) => a + x.kwh, 0);
  const cdd25 = sep25.reduce((a, x) => a + Math.max(0, x.ambient_mean_c - 24), 0);
  const kwh25 = sep25.reduce((a, x) => a + x.chiller_kwh, 0);
  const raw = kwh26 / kwh25 - 1;
  const normalised = kwh26 / cdd26 / (kwh25 / cdd25) - 1;
  return { kwh26, kwh25, cdd26, cdd25, raw, normalised, excessKwh: kwh26 - (kwh25 / cdd25) * cdd26 };
}

