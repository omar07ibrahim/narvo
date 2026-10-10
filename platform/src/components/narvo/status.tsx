"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export type Tone = "neutral" | "ai" | "success" | "warning" | "danger" | "info";

const TONES: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  ai: "bg-ai-soft text-ai border-ai/20",
  success: "bg-success-soft text-success border-success/20",
  warning: "bg-warning-soft text-warning border-warning/25",
  danger: "bg-danger-soft text-danger border-danger/20",
  info: "bg-info-soft text-info border-info/20",
};

const DOTS: Record<Tone, string> = {
  neutral: "bg-faint",
  ai: "bg-ai",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
};

export function StatusPill({
  tone = "neutral",
  children,
  dot = true,
  pulse,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  dot?: boolean;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full border px-2 text-[11px] font-medium whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {dot && <span className={cn("size-1.5 rounded-full", DOTS[tone], pulse && "animate-pulse-soft")} />}
      {children}
    </span>
  );
}

export function Dot({ tone = "neutral", pulse, className }: { tone?: Tone; pulse?: boolean; className?: string }) {
  return <span className={cn("inline-block size-1.5 shrink-0 rounded-full", DOTS[tone], pulse && "animate-pulse-soft", className)} />;
}

/** Thin confidence meter 0..1 */
export function Confidence({ value, className, showLabel = true }: { value: number; className?: string; showLabel?: boolean }) {
  const v = Math.max(0, Math.min(1, value));
  const tone = v >= 0.85 ? "bg-success" : v >= 0.6 ? "bg-warning" : "bg-danger";
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="relative h-1 w-12 overflow-hidden rounded-full bg-muted">
        <span className={cn("absolute inset-y-0 start-0 rounded-full", tone)} style={{ width: `${v * 100}%` }} />
      </span>
      {showLabel && <span className="num text-[11px] text-muted-foreground">{Math.round(v * 100)}%</span>}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border-strong bg-card px-1 font-mono text-[10px] text-muted-foreground">
      {children}
    </kbd>
  );
}
