"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Minimal range input in the catalogue style (hairline track, ink thumb). */
export function Range({
  value,
  min,
  max,
  step,
  onChange,
  label,
  display,
  className,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  label: ReactNode;
  display: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block min-w-0", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="label-caps truncate !text-[9.5px]">{label}</span>
        <span className={cn("num text-[12.5px] font-medium", value !== 0 && value !== min ? "text-ai" : "text-muted-foreground")}>{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 h-1 w-full cursor-pointer appearance-none rounded-full bg-border accent-[var(--ai)] [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-card [&::-webkit-slider-thumb]:bg-foreground [&::-webkit-slider-thumb]:shadow"
      />
    </label>
  );
}

/** Segmented control (small). */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: Array<{ value: T; label: ReactNode }>;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex rounded-md border border-border bg-surface p-0.5", className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "num rounded-[5px] px-2 py-1 text-[11.5px] transition-colors",
            o.value === value ? "bg-card font-medium text-foreground shadow-[0_0_0_1px_var(--border)]" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Tiny inline sparkline (history ink, forecast teal). */
export function Sparkline({ history, forecast, className }: { history: number[]; forecast: number[]; className?: string }) {
  const all = [...history, ...forecast];
  if (!all.length) return <svg className={className} />;
  const W = 92;
  const Hh = 22;
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const x = (i: number) => (i / Math.max(1, all.length - 1)) * W;
  const y = (v: number) => Hh - 2 - ((v - min) / span) * (Hh - 4);
  const path = (vals: number[], offset: number) => vals.map((v, i) => `${i === 0 ? "M" : "L"}${x(i + offset).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} className={cn("h-[22px] w-[92px] rtl:-scale-x-100", className)} aria-hidden>
      {history.length > 0 && <path d={path(history, 0)} fill="none" stroke="var(--muted-foreground)" strokeWidth={1} />}
      {forecast.length > 0 && (
        <path
          d={path(history.length ? [history[history.length - 1], ...forecast] : forecast, history.length ? history.length - 1 : 0)}
          fill="none"
          stroke="var(--ai)"
          strokeWidth={1.4}
        />
      )}
    </svg>
  );
}

/** Thin utilisation bar with capacity marker. */
export function UseBar({ value, capacity, className }: { value: number; capacity: number; className?: string }) {
  const max = Math.max(capacity * 1.25, value);
  const pctW = Math.min(100, (value / max) * 100);
  const capPct = (capacity / max) * 100;
  const over = value > capacity;
  const tight = !over && value > capacity * 0.95;
  return (
    <div className={cn("relative h-1.5 w-full rounded-full bg-muted", className)}>
      <div
        className={cn("absolute inset-y-0 start-0 rounded-full", over ? "bg-danger" : tight ? "bg-warning" : "bg-foreground/70")}
        style={{ width: `${pctW}%` }}
      />
      <div className="absolute -inset-y-0.5 w-px bg-foreground" style={{ insetInlineStart: `${capPct}%` }} />
    </div>
  );
}

export const fmtPct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;
export const fmtK = (v: number) => (Math.abs(v) >= 1_000_000 ? `${(v / 1_000_000).toFixed(2)}M` : Math.abs(v) >= 10_000 ? `${Math.round(v / 1000)}k` : Math.round(v).toLocaleString("en-US"));
