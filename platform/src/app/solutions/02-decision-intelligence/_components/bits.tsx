"use client";

import { cn } from "@/lib/utils";
import { usePrefs } from "@/lib/i18n";
import type { MetricDef } from "../_lib/catalogue";
import { fmtDelta, fmtValue, type Rag } from "../_lib/engine";

export const RAG_TONE: Record<Rag, "success" | "warning" | "danger"> = { green: "success", amber: "warning", red: "danger" };

export function RagDot({ rag, className }: { rag: Rag | null | undefined; className?: string }) {
  return (
    <span
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        rag === "green" ? "bg-success" : rag === "amber" ? "bg-warning" : rag === "red" ? "bg-danger" : "bg-faint/60",
        className,
      )}
    />
  );
}

export function ragLabel(rag: Rag | null | undefined, L: (t: { en: string; ar: string }) => string) {
  if (rag === "green") return L({ en: "On target", ar: "ضمن المستهدف" });
  if (rag === "amber") return L({ en: "Near target", ar: "قريب من المستهدف" });
  if (rag === "red") return L({ en: "Off target", ar: "خارج المستهدف" });
  return L({ en: "No target", ar: "بلا مستهدف" });
}

/** Minimal sparkline with optional target line (SVG, crisp at any size). */
export function Sparkline({
  values,
  target,
  better,
  className,
  height = 34,
  width = 140,
  tone = "ink",
}: {
  values: Array<number | null>;
  target?: number | null;
  better?: "up" | "down" | "none";
  className?: string;
  height?: number;
  width?: number;
  tone?: "ink" | "danger" | "success" | "warning";
}) {
  const pts = values.map((v, i) => [i, v] as const).filter(([, v]) => v != null) as Array<readonly [number, number]>;
  if (pts.length < 2) return <div className={className} style={{ height }} />;
  const all = pts.map(([, v]) => v).concat(target != null ? [target] : []);
  let min = Math.min(...all);
  let max = Math.max(...all);
  if (max - min < 1e-9) {
    max += 1;
    min -= 1;
  }
  const pad = (max - min) * 0.12;
  min -= pad;
  max += pad;
  const n = values.length - 1 || 1;
  const x = (i: number) => (i / n) * (width - 4) + 2;
  const y = (v: number) => height - 2 - ((v - min) / (max - min)) * (height - 4);
  const d = pts.map(([i, v], k) => `${k ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  const stroke = tone === "danger" ? "var(--danger)" : tone === "success" ? "var(--success)" : tone === "warning" ? "var(--warning)" : "var(--foreground)";
  const area = `${d} L${x(last[0]).toFixed(1)},${height} L${x(pts[0][0]).toFixed(1)},${height} Z`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={cn("block w-full overflow-visible", className)} style={{ height }}>
      {target != null && (
        <line x1={0} x2={width} y1={y(target)} y2={y(target)} stroke="var(--ai)" strokeWidth={1} strokeDasharray="2 3" opacity={0.7} vectorEffect="non-scaling-stroke" />
      )}
      <path d={area} fill={stroke} opacity={0.05} />
      <path d={d} fill="none" stroke={stroke} strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity={0.85} />
      <circle cx={x(last[0])} cy={y(last[1])} r={2.2} fill={stroke} />
      {better && better !== "none" ? null : null}
    </svg>
  );
}

/** Models sometimes write [3, 7] — turn into [3][7] so citation chips render. */
export function normCites(text: string) {
  return text.replace(/\[(\d+(?:\s*[,،]\s*\d+)+)\]/g, (_, g: string) => g.split(/\s*[,،]\s*/).map((n) => `[${n}]`).join(""));
}

export function MiniStat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "danger" | "success" | "warning" | "ai" }) {
  return (
    <div className="min-w-0">
      <div className="label-caps truncate !text-[9.5px]">{label}</div>
      <div
        className={cn(
          "num mt-1 text-[20px] leading-none font-light tracking-tight",
          tone === "danger" && "text-danger",
          tone === "success" && "text-success",
          tone === "warning" && "text-warning",
          tone === "ai" && "text-ai",
        )}
      >
        {value}
      </div>
      {sub && <div className="mt-1 truncate text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

/**
 * A KPI figure whose number stays left-to-right while its unit word follows the reading direction
 * (Arabic: «22.3 يوم», «+1.8 نقطة»). `compact` uses short English units (d, pt).
 */
export function Fig({
  def,
  value,
  delta = false,
  compact = false,
  prefix = "",
  className,
}: {
  def: Pick<MetricDef, "unit" | "decimals">;
  value: number | null | undefined;
  delta?: boolean;
  compact?: boolean;
  prefix?: string;
  className?: string;
}) {
  const { lang } = usePrefs();
  const ar = lang === "ar";
  if (value == null || Number.isNaN(value)) return <span className={className}>—</span>;
  let num: string;
  let unit = "";
  if (delta) {
    num = fmtDelta(def, value).replace(/ pts$/, "");
    if (def.unit === "pct") unit = ar ? "نقطة" : compact ? "pt" : "pts";
  } else if (def.unit === "days") {
    num = fmtValue(def, value, "en").replace(/ days$/, "");
    unit = ar ? "يوم" : compact ? "d" : "days";
  } else if (def.unit === "aed" && ar) {
    num = fmtValue(def, value, "ar").replace(/ درهم$/, "");
    unit = "درهم";
  } else {
    num = fmtValue(def, value, "en");
  }
  return (
    <span className={className}>
      <bdi dir="ltr">
        {prefix}
        {num}
      </bdi>
      {unit && ` ${unit}`}
    </span>
  );
}
