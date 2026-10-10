"use client";

import { useState, type ReactNode } from "react";
import { BookOpen, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useL } from "@/lib/i18n";
import { AREAS, getSolution, pad2, type Bilingual, type Measure } from "@/lib/solutions/registry";
import { ORGS } from "@/lib/world/orgs";
import { cn } from "@/lib/utils";
import { MeasureStrip } from "./metric";
import { SolutionIcon } from "./icons";

export interface ScenarioStep {
  title: Bilingual;
  body: Bilingual;
}

/**
 * Standard frame for every solution: catalogue-style header, client organisation,
 * measures (baseline → pilot target), guided demo script and reset.
 */
export function SolutionPage({
  slug,
  children,
  measures,
  scenario,
  actions,
  className,
  hideMeasures,
}: {
  slug: string;
  children: ReactNode;
  measures?: Measure[];
  scenario?: ScenarioStep[];
  actions?: ReactNode;
  className?: string;
  hideMeasures?: boolean;
}) {
  const L = useL();
  const meta = getSolution(slug);
  const [guide, setGuide] = useState(false);
  const [step, setStep] = useState(0);
  if (!meta) return <div className="p-8">Unknown solution {slug}</div>;
  const area = AREAS.find((a) => a.id === meta.area)!;
  const org = ORGS[meta.org];

  async function reset() {
    await fetch("/api/demo/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ solution: slug }),
    });
    toast.success(L({ en: "Demo reset — data restored to its starting state", ar: "تمت إعادة الضبط — استعادة البيانات إلى حالتها الأولى" }));
    setTimeout(() => window.location.reload(), 350);
  }

  return (
    <div className={cn("mx-auto flex w-full max-w-[1680px] flex-col gap-5 px-6 pt-6 pb-10", className)}>
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-0 max-w-3xl">
          <div className="label-caps flex items-center gap-2">
            <span className="num">{pad2(meta.n)}</span>
            <span className="h-px w-5 bg-border-strong" />
            <span>{L(area.title)}</span>
            {meta.featured && (
              <span className="rounded-[3px] bg-foreground px-1.5 py-0.5 text-[9px] tracking-[0.14em] text-background">
                {L({ en: "Featured", ar: "مميز" })}
              </span>
            )}
          </div>
          <h1 className="display-title mt-2.5 text-[34px] leading-[1.08] max-md:text-[26px]">{L(meta.title)}</h1>
          <p className="mt-2 text-[15px] font-medium text-foreground/85">{L(meta.promise)}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{L(meta.summary)}</p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <div className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2">
            <span
              className="flex size-8 items-center justify-center rounded-md text-[11px] font-semibold tracking-wide text-white"
              style={{ background: org.color }}
            >
              {org.monogram}
            </span>
            <div className="text-[12px] leading-tight">
              <div className="font-medium">{L(org.name)}</div>
              <div className="text-muted-foreground">{L(org.kind)}</div>
            </div>
            <SolutionIcon name={meta.icon} className="ms-2 size-5 text-muted-foreground" />
          </div>
          <div className="flex items-center gap-1.5">
            {actions}
            {scenario && scenario.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setGuide(true)}>
                <BookOpen />
                {L({ en: "Demo script", ar: "سيناريو العرض" })}
              </Button>
            )}
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={reset}>
              <RotateCcw />
              {L({ en: "Reset", ar: "إعادة الضبط" })}
            </Button>
          </div>
        </div>
      </header>

      {!hideMeasures && <MeasureStrip measures={measures ?? meta.measures} />}

      {children}

      {scenario && (
        <Sheet open={guide} onOpenChange={setGuide}>
          <SheetContent side="right" className="w-[420px] sm:max-w-[420px]">
            <SheetHeader className="border-b border-border">
              <div className="label-caps">
                {pad2(meta.n)} · {L({ en: "Demo script", ar: "سيناريو العرض" })}
              </div>
              <SheetTitle className="text-lg font-light tracking-tight">{L(meta.title)}</SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-auto px-4 py-2">
              <ol className="space-y-2">
                {scenario.map((s, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => setStep(i)}
                      className={cn(
                        "w-full rounded-md border p-3 text-start transition-colors",
                        i === step ? "border-ai/40 bg-ai-soft" : "border-border hover:bg-muted/60",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "num flex size-5 items-center justify-center rounded-full text-[10.5px] font-medium",
                            i === step ? "bg-ai text-ai-foreground" : "bg-muted text-muted-foreground",
                          )}
                        >
                          {i + 1}
                        </span>
                        <span className="text-[13px] font-medium">{L(s.title)}</span>
                      </div>
                      {i === step && <p className="mt-2 ps-7 text-[12.5px] leading-relaxed text-muted-foreground">{L(s.body)}</p>}
                    </button>
                  </li>
                ))}
              </ol>
            </div>
            <div className="flex items-center justify-between border-t border-border p-3">
              <Button variant="ghost" size="sm" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
                <ChevronLeft className="rtl:rotate-180" />
                {L({ en: "Back", ar: "السابق" })}
              </Button>
              <span className="num text-[11px] text-muted-foreground">
                {step + 1} / {scenario.length}
              </span>
              <Button size="sm" disabled={step === scenario.length - 1} onClick={() => setStep((s) => s + 1)}>
                {L({ en: "Next", ar: "التالي" })}
                <ChevronRight className="rtl:rotate-180" />
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
