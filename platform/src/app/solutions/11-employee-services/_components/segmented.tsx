"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Calm segmented control (catalogue style). */
export function Segmented<T extends string>({
  value,
  onChange,
  items,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  items: Array<{ value: T; label: ReactNode; icon?: ReactNode }>;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex items-center rounded-lg border border-border bg-surface p-0.5", className)}>
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          onClick={() => onChange(it.value)}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-[12.5px] font-medium whitespace-nowrap transition-colors",
            value === it.value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {it.icon}
          {it.label}
        </button>
      ))}
    </div>
  );
}
