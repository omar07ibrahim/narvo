"use client";

import { useEffect, useState } from "react";
import { EyeOff, LoaderCircle, ShieldCheck } from "lucide-react";
import { useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { StatusPill } from "@/components/narvo/status";
import type { Redaction } from "../_lib/types";

interface Preview {
  appId: string;
  original: string;
  redacted: string;
  removed: Redaction[];
  counts: Record<string, number>;
  leaks: string[];
  autoFixed: number;
}

/** Highlights [REDACTED …] markers so reviewers can see exactly what the model never receives. */
export function RedactedText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(\[REDACTED[^\]]*\]|\[Candidate\])/g);
  return (
    <pre className={cn("font-sans text-[12.5px] leading-relaxed whitespace-pre-wrap text-foreground/90", className)} dir="auto">
      {parts.map((p, i) =>
        /^\[(REDACTED|Candidate)/.test(p) ? (
          <span key={i} className="mx-0.5 rounded-[3px] bg-foreground px-1 py-px text-[10.5px] font-medium tracking-wide text-background">
            {p.replace(/^\[|\]$/g, "")}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </pre>
  );
}

export function RedactionDialog({ appId, title, open, onOpenChange }: { appId: string | null; title: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const L = useL();
  const [data, setData] = useState<Preview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<"redacted" | "original">("redacted");

  useEffect(() => {
    if (!open || !appId) return;
    setData(null);
    setErr(null);
    setView("redacted");
    fetch(`/api/solutions/12-recruitment/redact?appId=${encodeURIComponent(appId)}`, { cache: "no-store" })
      .then(async (r) => (r.ok ? setData(await r.json()) : setErr(await r.text())))
      .catch((e) => setErr(String(e)));
  }, [open, appId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[min(1040px,94vw)] overflow-hidden p-0 sm:max-w-[min(1040px,94vw)]">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <DialogTitle className="text-sm font-medium">
            {L({ en: "Fairness guard", ar: "حارس العدالة" })} · {title}
          </DialogTitle>
          <ToggleGroup type="single" size="sm" variant="outline" value={view} onValueChange={(v) => v && setView(v as "redacted" | "original")} className="me-8">
            <ToggleGroupItem value="redacted" className="gap-1 px-2.5 text-[12px]">
              <EyeOff className="size-3" />
              {L({ en: "What the model sees", ar: "ما يراه النموذج" })}
            </ToggleGroupItem>
            <ToggleGroupItem value="original" className="px-2.5 text-[12px]">
              {L({ en: "Original (HR only)", ar: "الأصل (للموارد البشرية فقط)" })}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        {!data && !err && (
          <div className="flex items-center justify-center gap-2 p-10 text-[12px] text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" /> {L({ en: "Applying the guard…", ar: "جارٍ تطبيق الحارس…" })}
          </div>
        )}
        {err && <div className="p-6 text-[12.5px] text-danger">{err}</div>}
        {data && (
          <div className="grid max-h-[calc(90vh-56px)] grid-cols-[minmax(0,1fr)_280px] max-md:grid-cols-1">
            <div className="scrollbar-thin overflow-y-auto bg-surface p-5">
              {view === "redacted" ? <RedactedText text={data.redacted} /> : <pre className="font-sans text-[12.5px] leading-relaxed whitespace-pre-wrap" dir="auto">{data.original}</pre>}
            </div>
            <div className="scrollbar-thin overflow-y-auto border-s border-border p-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-success" />
                <span className="text-[13px] font-medium">
                  {data.removed.length} {L({ en: "items withheld", ar: "عنصراً محجوباً" })}
                </span>
              </div>
              <div className="mt-1 text-[11.5px] text-muted-foreground">
                {L({ en: "Leak scan after redaction", ar: "فحص التسرب بعد الحجب" })}:{" "}
                <span className={data.leaks.length ? "text-warning" : "text-success"}>
                  {data.leaks.length ? `${data.leaks.length} ${L({ en: "found and removed", ar: "وُجدت وأُزيلت" })}` : L({ en: "clean", ar: "سليم" })}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {Object.entries(data.counts).map(([k, v]) => (
                  <StatusPill key={k} tone="neutral" dot={false}>
                    {k} <span className="num opacity-70">{v}</span>
                  </StatusPill>
                ))}
              </div>
              <div className="label-caps mt-4 mb-1.5">{L({ en: "Withheld from the model", ar: "محجوب عن النموذج" })}</div>
              <ul className="space-y-1.5">
                {data.removed.map((r, i) => (
                  <li key={i} className="text-[11.5px] leading-snug">
                    <span className="text-muted-foreground">{r.kind}: </span>
                    <span className="blur-[3px] transition hover:blur-none" dir="auto">{r.original}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
                {L({
                  en: "Scoring functions only accept guarded text. Emiratisation is applied later by HR as a separate, visible policy step.",
                  ar: "لا تقبل دوال التقييم إلا النص المحمي. وتُطبَّق سياسة التوطين لاحقاً من قبل الموارد البشرية كخطوة منفصلة وظاهرة.",
                })}
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
