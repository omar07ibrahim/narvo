"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Severity } from "../_lib/types";
import { StatusPill } from "@/components/narvo/status";
import { useL } from "@/lib/i18n";

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
            "num rounded-[5px] px-2 py-1 text-[11.5px] whitespace-nowrap transition-colors",
            o.value === value ? "bg-card font-medium text-foreground shadow-[0_0_0_1px_var(--border)]" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SeverityPill({ severity, escalated }: { severity: Severity; escalated?: boolean }) {
  const L = useL();
  const tone = severity === "critical" ? "danger" : severity === "major" ? "warning" : "neutral";
  const label = severity === "critical" ? L({ en: "Critical", ar: "حرجة" }) : severity === "major" ? L({ en: "Major", ar: "جسيمة" }) : L({ en: "Minor", ar: "بسيطة" });
  return (
    <StatusPill tone={tone}>
      {label}
      {escalated ? ` · ${L({ en: "repeat", ar: "تكرار" })}` : ""}
    </StatusPill>
  );
}

export const SEV_COLOR: Record<Severity, string> = {
  critical: "var(--danger)",
  major: "var(--warning)",
  minor: "var(--info)",
};
