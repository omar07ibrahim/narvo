"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** Minimal accessible checkbox matching the platform's hairline style. */
export function Checkbox({ checked, onChange, disabled, label }: { checked: boolean; onChange: () => void; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label ?? "Select"}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        "flex size-4 items-center justify-center rounded-[4px] border transition-colors disabled:opacity-40",
        checked ? "border-foreground bg-foreground text-background" : "border-border-strong bg-card hover:border-foreground/60",
      )}
    >
      {checked && <Check className="size-3" strokeWidth={3} />}
    </button>
  );
}
