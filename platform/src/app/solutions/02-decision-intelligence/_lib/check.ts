import { z } from "zod";
import { METRIC_IDS, REVIEW, metricById } from "./catalogue";
import { compute, fmtValue, monthRange, quarterRange, weekLabel, weekRange, dayLabel, type Dataset } from "./engine";

/**
 * Figure consistency check: the model only extracts and maps claims (what figure, which KPI, which period);
 * the comparison against the scorecard is computed here.
 */

const periodSchema = z.object({
  type: z.enum(["week", "month", "quarter", "as_at", "range"]),
  value: z
    .string()
    .describe('week "2026-W41"; month "2026-09"; quarter "2026-Q3"; as_at "2026-10-09" (level at a date); range "2026-10-01/2026-10-09"'),
});

export const claimsSchema = z.object({
  claims: z
    .array(
      z.object({
        updateId: z.string().describe("id of the department update, e.g. UPD-W41-HOU"),
        quote: z.string().describe("the exact phrase from the update that contains the figure, in its original language"),
        metric: z.enum([...METRIC_IDS, "none"] as [string, ...string[]]).describe("KPI id this figure refers to, or none"),
        period: periodSchema,
        statistic: z.enum(["value", "monthly_average", "pct_change"]),
        compareTo: periodSchema.nullable().describe("base period for pct_change, otherwise null"),
        claimed: z.number().describe("the figure as a number; durations m:ss in seconds (6:40 → 400); percentages as 41 for 41%"),
        approximate: z.boolean().describe("true when the update says around / about / نحو / approximately"),
      }),
    )
    .max(60),
});

export type Claim = z.infer<typeof claimsSchema>["claims"][number];

export interface CheckItem {
  updateId: string;
  dept: string;
  author: string;
  quote: string;
  metricId: string | null;
  metricName: string;
  periodLabel: string;
  claimed: number;
  claimedText: string;
  actual: number | null;
  actualText: string;
  status: "consistent" | "discrepancy" | "unverifiable";
  source: string;
  approximate: boolean;
}

export interface FigureCheckResult {
  at: number;
  checks: CheckItem[];
  consistent: number;
  discrepancies: number;
  unverifiable: number;
  rate: number | null;
  model?: string;
}

function rangeOf(p: z.infer<typeof periodSchema>): [string, string] | null {
  try {
    if (p.type === "week") return weekRange(p.value);
    if (p.type === "month") return monthRange(p.value);
    if (p.type === "quarter") return quarterRange(p.value);
    if (p.type === "as_at") return [p.value.slice(0, 10), p.value.slice(0, 10)];
    const [a, b] = p.value.split("/");
    return a && b ? [a.slice(0, 10), b.slice(0, 10)] : null;
  } catch {
    return null;
  }
}

function labelOf(p: z.infer<typeof periodSchema>) {
  if (p.type === "week") return weekLabel(p.value);
  if (p.type === "month") return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+p.value.slice(5, 7) - 1]} ${p.value.slice(0, 4)}`;
  if (p.type === "quarter") return p.value.replace(/(\d{4})-Q(\d)/, "Q$2 $1");
  if (p.type === "as_at") return `as at ${dayLabel(p.value.slice(0, 10))}`;
  const [a, b] = p.value.split("/");
  return `${dayLabel(a)}–${dayLabel(b)}`;
}

const decimalsOf = (x: number) => {
  const s = String(x);
  return s.includes(".") ? s.split(".")[1].length : 0;
};

export function evaluateClaims(ds: Dataset, claims: Claim[], updates: Array<{ id: string; dept: string; author: string }>): FigureCheckResult {
  const checks: CheckItem[] = [];
  const seen = new Set<string>();
  for (const c of claims) {
    const key = `${c.updateId}|${c.metric}|${c.claimed}|${c.period.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const u = updates.find((x) => x.id === c.updateId);
    const def = c.metric !== "none" ? metricById(c.metric) : undefined;
    const base: Omit<CheckItem, "actual" | "actualText" | "status"> = {
      updateId: c.updateId,
      dept: u?.dept ?? "",
      author: u?.author ?? "",
      quote: c.quote,
      metricId: def?.id ?? null,
      metricName: def?.name.en ?? "No scorecard KPI",
      periodLabel: labelOf(c.period),
      claimed: c.claimed,
      claimedText: def ? (c.statistic === "pct_change" ? `${c.claimed >= 0 ? "+" : ""}${c.claimed}%` : fmtValue(def, c.claimed)) : String(c.claimed),
      source: def?.source ?? "—",
      approximate: c.approximate,
    };
    const range = rangeOf(c.period);
    if (!def || !range || range[0] > REVIEW.dataTo) {
      checks.push({ ...base, actual: null, actualText: "—", status: "unverifiable" });
      continue;
    }
    let [from, to] = range;
    if (to > REVIEW.dataTo) to = REVIEW.dataTo;
    // a level ("as at") for a flow metric means month-to-date
    if (c.period.type === "as_at" && def.agg.kind !== "stock" && def.agg.kind !== "ytdShare") from = `${to.slice(0, 7)}-01`;
    let actual = compute(ds, def, from, to).value;
    if (actual != null && c.statistic === "monthly_average") {
      const months = Math.max(1, Math.round(((Date.parse(to) - Date.parse(from)) / 86400000 + 1) / 30.4));
      actual = actual / months;
    }
    if (actual != null && c.statistic === "pct_change") {
      const r0 = c.compareTo ? rangeOf(c.compareTo) : null;
      const v0 = r0 ? compute(ds, def, r0[0], r0[1]).value : null;
      actual = v0 ? ((actual - v0) / v0) * 100 : null;
    }
    if (actual == null) {
      checks.push({ ...base, actual: null, actualText: "—", status: "unverifiable" });
      continue;
    }
    // tolerance: rounding of the stated figure (or ±5% when the update says "around")
    let tol = 0.5 * Math.pow(10, -decimalsOf(c.claimed)) + 1e-9;
    if (def.unit === "duration") tol = 5;
    if (c.approximate) tol = Math.max(tol, Math.abs(actual) * 0.05);
    const ok = Math.abs(actual - c.claimed) <= tol;
    const actualText =
      c.statistic === "pct_change" ? `${actual >= 0 ? "+" : "−"}${Math.abs(actual).toFixed(1)}%` : c.statistic === "monthly_average" ? `${fmtValue(def, actual)} per month` : fmtValue(def, actual);
    checks.push({ ...base, actual, actualText, status: ok ? "consistent" : "discrepancy" });
  }
  const consistent = checks.filter((c) => c.status === "consistent").length;
  const discrepancies = checks.filter((c) => c.status === "discrepancy").length;
  return {
    at: Date.now(),
    checks,
    consistent,
    discrepancies,
    unverifiable: checks.filter((c) => c.status === "unverifiable").length,
    rate: consistent + discrepancies ? (consistent / (consistent + discrepancies)) * 100 : null,
  };
}
