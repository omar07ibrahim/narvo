"use client";

/** Shared chart styling for Recharts so every module's charts read as one system. */

export const CHART = {
  ai: "var(--ai)",
  ink: "var(--foreground)",
  muted: "var(--muted-foreground)",
  faint: "var(--faint)",
  grid: "var(--border)",
  warning: "var(--warning)",
  danger: "var(--danger)",
  success: "var(--success)",
  info: "var(--info)",
  series: ["#1f6f68", "#161513", "#a8691a", "#2f5d8a", "#8f8a80", "#b4432f"],
};

export const axisProps = {
  stroke: "var(--border-strong)",
  tick: { fill: "var(--muted-foreground)", fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

export const gridProps = {
  stroke: "var(--border)",
  strokeDasharray: "2 4",
  vertical: false,
} as const;

export function ChartTooltip({
  active,
  payload,
  label,
  format,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; color?: string; dataKey?: string }>;
  label?: string | number;
  format?: (v: number | string, name?: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-[11.5px] shadow-lg">
      {label != null && <div className="mb-1 font-medium">{label}</div>}
      <div className="space-y-0.5">
        {payload
          .filter((p) => p.value != null)
          .map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="size-2 rounded-full" style={{ background: p.color }} />
              <span className="text-muted-foreground">{p.name ?? p.dataKey}</span>
              <span className="num ms-auto font-medium">{format ? format(p.value!, p.name) : p.value}</span>
            </div>
          ))}
      </div>
    </div>
  );
}
