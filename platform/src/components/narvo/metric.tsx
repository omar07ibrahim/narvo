"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useL, usePrefs } from "@/lib/i18n";
import type { Measure } from "@/lib/solutions/registry";

export function MetricTile({
  label,
  value,
  sub,
  delta,
  tone,
  icon,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  delta?: { value: string; good: boolean };
  tone?: "default" | "ai" | "warning" | "danger" | "success";
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-border bg-card p-3.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="label-caps truncate">{label}</span>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <div
        dir="ltr"
        className={cn(
          "num mt-2 text-start text-[26px] leading-none font-light tracking-tight rtl:text-end",
          tone === "ai" && "text-ai",
          tone === "warning" && "text-warning",
          tone === "danger" && "text-danger",
          tone === "success" && "text-success",
        )}
      >
        {value}
      </div>
      {(sub || delta) && (
        <div className="mt-2 flex items-center gap-2 text-[11.5px] text-muted-foreground">
          {delta && (
            <span className={cn("inline-flex items-center gap-0.5 font-medium", delta.good ? "text-success" : "text-danger")}>
              {delta.good ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
              {delta.value}
            </span>
          )}
          {sub}
        </div>
      )}
    </div>
  );
}

/** Arabic rendering of catalogue measure values ("19.4 days" → "19.4 يوماً"). Numbers stay Latin. */
const AR_PHRASES: Array<[RegExp, string]> = [
  [/^same day$/i, "في اليوم نفسه"],
  [/^Fully sourced$/i, "موثّق بالكامل"],
  [/(\d+) in (\d+)/, "$1 من $2"],
  [/^AED ([\d.,]+)(.*)$/, "$1 درهم$2"],
  [/weekly/i, "أسبوعياً"],
  [/eval/i, "تقييم"],
  [/energy/i, "طاقة"],
  [/\/ task/, "/ مهمة"],
  [/\/ doc/, "/ مستند"],
  [/\/ inv/, "/ فاتورة"],
  [/\/ contract/, "/ عقد"],
  [/\/ mo/, "/ شهرياً"],
  [/\/ yr/, "/ سنوياً"],
  [/1 day/, "يوم واحد"],
  [/days/, "يوم"],
  [/day/, "يوم"],
  [/min/, "دقيقة"],
  [/h/, "ساعة"],
  [/touches/, "مرات"],
  [/touch/, "مرة"],
  [/rounds/, "جولات"],
  [/round/, "جولة"],
];

export function localizeMeasure(v: string, lang: "en" | "ar") {
  if (lang !== "ar") return v;
  let out = v;
  for (const [re, rep] of AR_PHRASES) out = out.replace(re, rep);
  return out;
}

/** Catalogue "Measures to agree" — baseline vs. pilot target. */
export function MeasureStrip({ measures, className }: { measures: Measure[]; className?: string }) {
  const L = useL();
  const { lang } = usePrefs();
  return (
    <div className={cn("grid grid-cols-3 divide-x divide-border overflow-hidden rounded-lg border border-border bg-card rtl:divide-x-reverse max-md:grid-cols-1 max-md:divide-x-0 max-md:divide-y", className)}>
      {measures.map((m) => (
        <div key={m.label.en} className="px-4 py-3">
          <div className="label-caps">{L(m.label)}</div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span dir={lang === "ar" ? "rtl" : "ltr"} className="num text-[13px] text-muted-foreground line-through decoration-faint/60">
              {localizeMeasure(m.baseline, lang)}
            </span>
            <span className="text-faint">{lang === "ar" ? "←" : "→"}</span>
            <span dir={lang === "ar" ? "rtl" : "ltr"} className="num text-[17px] font-light tracking-tight">
              {localizeMeasure(m.target, lang)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
