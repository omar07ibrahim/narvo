import { z } from "zod";
import { METRIC_IDS, metricById } from "./catalogue";
import { addDays, buckets, compute, daysBetween, fmtDelta, fmtValue, series, dayLabel, type Dataset, type Granularity, type SeriesPoint } from "./engine";

/** "Ask the data": the model writes this spec; the code validates it and computes the answer. */
export const querySpecSchema = z.object({
  feasible: z.boolean(),
  reason: z.string().nullable(),
  metrics: z.array(z.enum(METRIC_IDS)).min(1).max(3),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  granularity: z.enum(["day", "week", "month", "quarter", "total"]),
  compare: z.enum(["none", "previous_period", "target"]),
  title: z.string(),
  restatement: z.string(),
});

export type QuerySpec = z.infer<typeof querySpecSchema>;

export interface QueryMetricResult {
  id: string;
  name: { en: string; ar: string };
  unit: string;
  decimals: number;
  better: string;
  series: SeriesPoint[];
  total: { value: number | null; text: string; target: number | null; targetText: string | null; rag: string | null; n?: number };
  previous?: { from: string; to: string; value: number | null; text: string; deltaText: string | null };
}

export interface QueryResult {
  spec: QuerySpec;
  from: string;
  to: string;
  granularity: Granularity;
  adjusted: string[];
  metrics: QueryMetricResult[];
}

export function runQuery(ds: Dataset, raw: QuerySpec): QueryResult {
  const adjusted: string[] = [];
  const first = ds.days[0];
  const last = ds.days[ds.days.length - 1];
  let from = raw.from;
  let to = raw.to;
  if (from < first) {
    from = first;
    adjusted.push(`start moved to ${first} (first day of data)`);
  }
  if (to > last) {
    to = last;
    adjusted.push(`end moved to ${last} (latest data)`);
  }
  if (from > to) [from, to] = [to, from];
  let gran: Granularity = raw.granularity;
  const span = daysBetween(from, to) + 1;
  if (gran === "day" && span > 60) {
    gran = "week";
    adjusted.push("daily view changed to weekly for readability");
  }
  if (gran === "week" && span > 300) {
    gran = "month";
    adjusted.push("weekly view changed to monthly for readability");
  }
  const metrics: QueryMetricResult[] = [];
  for (const id of Array.from(new Set(raw.metrics))) {
    const def = metricById(id);
    if (!def) continue;
    const pts = series(ds, def, gran, from, to);
    const tot = compute(ds, def, from, to);
    const r: QueryMetricResult = {
      id,
      name: def.name,
      unit: def.unit,
      decimals: def.decimals,
      better: def.better,
      series: pts,
      total: {
        value: tot.value,
        text: fmtValue(def, tot.value),
        target: tot.target,
        targetText: tot.target != null ? `${def.better === "down" ? "≤" : "≥"} ${fmtValue(def, tot.target)}` : null,
        rag: tot.rag,
        n: tot.n,
      },
    };
    if (raw.compare === "previous_period") {
      const pTo = addDays(from, -1);
      const pFrom = addDays(pTo, -(span - 1));
      const prev = compute(ds, def, pFrom, pTo);
      r.previous = {
        from: pFrom,
        to: pTo,
        value: prev.value,
        text: fmtValue(def, prev.value),
        deltaText: prev.value != null && tot.value != null ? fmtDelta(def, tot.value - prev.value) : null,
      };
    }
    metrics.push(r);
  }
  return { spec: raw, from, to, granularity: gran, adjusted, metrics };
}

/** Numbered sources for the answer — each a computed value. */
export function querySources(res: QueryResult) {
  const out: Array<{ n: number; text: string; title: string; ref: string }> = [];
  let n = 1;
  const period = `${dayLabel(res.from)} ${res.from.slice(0, 4)} – ${dayLabel(res.to)} ${res.to.slice(0, 4)}`;
  for (const m of res.metrics) {
    const def = metricById(m.id)!;
    out.push({
      n: n++,
      title: `${m.name.en} — ${period}`,
      ref: def.source,
      text: `${m.name.en}, ${period}: ${m.total.text}${m.total.n != null && def.agg.kind === "permit" ? ` (n = ${m.total.n})` : ""}${m.total.targetText ? `; target ${m.total.targetText}; status ${m.total.rag?.toUpperCase() ?? "—"}` : ""}${def.agg.kind === "stock" || def.agg.kind === "ytdShare" ? " (level at end of period)" : ""}.`,
    });
    if (m.previous) {
      out.push({
        n: n++,
        title: `${m.name.en} — previous period`,
        ref: def.source,
        text: `${m.name.en}, previous period ${dayLabel(m.previous.from)}–${dayLabel(m.previous.to)}: ${m.previous.text}; change ${m.previous.deltaText ?? "—"}.`,
      });
    }
    if (m.series.length > 1) {
      const vals = m.series.filter((p) => p.value != null);
      const max = vals.reduce((a, b) => (b.value! > a.value! ? b : a));
      const min = vals.reduce((a, b) => (b.value! < a.value! ? b : a));
      const lastP = vals[vals.length - 1];
      const firstP = vals[0];
      out.push({
        n: n++,
        title: `${m.name.en} — ${res.granularity} series`,
        ref: def.source,
        text: `${m.name.en} by ${res.granularity}: first ${firstP.label.en} ${fmtValue(def, firstP.value)}; latest ${lastP.label.en} ${fmtValue(def, lastP.value)}${lastP.to > res.to ? " (partial period)" : ""}; highest ${max.label.en} ${fmtValue(def, max.value)}; lowest ${min.label.en} ${fmtValue(def, min.value)}. Series: ${vals.map((p) => `${p.label.en} ${fmtValue(def, p.value)}`).join(", ")}.`,
      });
    }
  }
  return out;
}

export { buckets };
