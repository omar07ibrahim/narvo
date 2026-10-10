"use client";

import { Bar, ComposedChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART, axisProps, gridProps, ChartTooltip } from "@/components/narvo/chart";
import { useL } from "@/lib/i18n";
import type { MetricDef } from "../_lib/catalogue";
import { fmtShort, type SeriesPoint } from "../_lib/engine";

export function MetricChart({
  def,
  points,
  height = 220,
  kind,
  showTarget = true,
  color = CHART.ink,
}: {
  def: Pick<MetricDef, "unit" | "decimals" | "better" | "name" | "agg">;
  points: SeriesPoint[];
  height?: number;
  kind?: "line" | "bar";
  showTarget?: boolean;
  color?: string;
}) {
  const L = useL();
  const data = points.map((p) => ({
    label: L(p.label),
    value: p.value != null ? Number(p.value.toFixed(def.unit === "count" ? 0 : Math.max(def.decimals, 1))) : null,
    target: p.target,
    rag: p.rag,
  }));
  const target = showTarget ? (points.find((p) => p.target != null)?.target ?? null) : null;
  const sameTarget = target != null && points.every((p) => p.target == null || Math.abs(p.target - target) < 1e-6);
  const fmt = (v: number | string) => fmtShort(def, typeof v === "number" ? v : Number(v));
  const isFlow = def.unit === "count" && def.agg.kind !== "stock";
  const useBar = (kind ?? (isFlow && points.length <= 14 ? "bar" : "line")) === "bar" && isFlow;
  const common = {
    data,
    margin: { top: 10, right: 8, bottom: 0, left: -8 },
  };
  const yAxis = (
    <YAxis
      {...axisProps}
      width={def.unit === "duration" ? 44 : 48}
      tickFormatter={(v: number) => fmtShort(def, v)}
      domain={def.unit === "pct" || useBar ? [0, "auto"] : ["auto", "auto"]}
      allowDecimals={def.unit !== "count"}
    />
  );
  const tooltip = <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.5 }} content={<ChartTooltip format={(v) => fmt(v)} />} />;
  return (
    <div style={{ height }} className="w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        {useBar ? (
          <ComposedChart {...common}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={8} />
            {yAxis}
            {tooltip}
            {sameTarget && target != null && <ReferenceLine y={target} stroke={CHART.ai} strokeDasharray="3 4" ifOverflow="extendDomain" />}
            <Bar dataKey="value" name={L(def.name)} fill={color} radius={[2, 2, 0, 0]} maxBarSize={28} opacity={0.82} />
            {!sameTarget && <Line dataKey="target" name={L({ en: "Target", ar: "المستهدف" })} stroke={CHART.ai} strokeDasharray="3 4" dot={false} />}
          </ComposedChart>
        ) : (
          <LineChart {...common}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={14} />
            {yAxis}
            {tooltip}
            {sameTarget && target != null && (
              <ReferenceLine
                y={target}
                stroke={CHART.ai}
                strokeDasharray="3 4"
                ifOverflow="extendDomain"
                label={{ value: L({ en: "target", ar: "المستهدف" }), position: "insideTopRight", fill: "var(--ai)", fontSize: 10 }}
              />
            )}
            {!sameTarget && target != null && (
              <Line dataKey="target" name={L({ en: "Target", ar: "المستهدف" })} stroke={CHART.ai} strokeDasharray="3 4" dot={false} strokeWidth={1} />
            )}
            <Line dataKey="value" name={L(def.name)} stroke={color} strokeWidth={1.6} dot={{ r: 1.8, strokeWidth: 0, fill: color }} activeDot={{ r: 3.5 }} connectNulls />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
