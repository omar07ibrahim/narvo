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
        dir="auto"
        className={cn(
          "num mt-2 text-left text-[26px] leading-none font-light tracking-tight rtl:text-right",
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

/** Arabic rendering of catalogue measure values ("13 days" → "13 يوماً", "3 min" → "3 دقائق", "312 / mo" → "312 شهرياً").
 *  Numbers stay Latin. (These regexes once held literal backspace bytes instead of \b and never matched.) */
const AR_PHRASES: Array<[RegExp, string]> = [
  [/^same day$/i, "في اليوم نفسه"],
  [/^Fully sourced$/i, "موثّق بالكامل"],
  [/(\d+) in (\d+)/, "$1 من $2"],
  [/^AED ([\d.,]+)(.*)$/, "$1 درهم$2"],
  [/weekly/i, "أسبوعياً"],
  [/eval/i, "تقييم"],
  [/energy/i, "طاقة"],
  [/\s*\/ task\b/, " لكل مهمة"],
  [/\s*\/ doc\b/, " لكل مستند"],
  [/\s*\/ inv\b/, " لكل فاتورة"],
  [/\s*\/ contract\b/, " لكل عقد"],
  [/\s*\/ mo\b/, " شهرياً"],
  [/\s*\/ yr\b/, " سنوياً"],
  [/\b1 day\b/, "يوم واحد"],
  [/\b1 round\b/, "جولة واحدة"],
  [/^([3-9]|10) درهم/, "$1 دراهم"],
];

/** unit → [singular (fractions, 1, 2, 11+), plural for 3–10] */
const AR_UNITS: Record<string, [string, string]> = {
  days: ["يوم", "أيام"], day: ["يوم", "أيام"], min: ["دقيقة", "دقائق"], h: ["ساعة", "ساعات"],
  touches: ["مرة", "مرات"], touch: ["مرة", "مرات"], rounds: ["جولة", "جولات"], round: ["جولة", "جولات"],
};

export function localizeMeasure(v: string, lang: "en" | "ar") {
  if (lang !== "ar") return v;
  let out = v;
  for (const [re, rep] of AR_PHRASES) out = out.replace(re, rep);
  // a count agrees with its unit: 3–10 take the plural, whole numbers from 11 the accusative singular (يوماً)
  return out.replace(/(\d+(?:\.\d+)?) (days|day|min|h|touches|touch|rounds|round)\b/g, (_, n: string, u: string) => {
    const [one, few] = AR_UNITS[u];
    const x = Number(n);
    if (Number.isInteger(x) && x >= 3 && x <= 10) return `${n} ${few}`;
    if (Number.isInteger(x) && x >= 11 && one === "يوم") return `${n} يوماً`;
    return `${n} ${one}`;
  });
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
