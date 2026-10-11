"use client";

import { useState } from "react";
import { CheckCheck, Copy, FileText, Gavel, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/narvo/markdown";
import { RunButton } from "@/components/narvo/run-button";
import { EmptyState, ThinkingLines } from "@/components/narvo/empty";
import { StatusPill } from "@/components/narvo/status";
import type { NarvoRun } from "@/hooks/use-narvo-run";
import type { Citation } from "@/lib/ai/events";
import { useFormat, useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { normCites } from "./bits";

export interface SavedBriefing {
  text: string;
  citations: Citation[];
  verification: { total: number; toScorecard: string[]; toNarrative: string[]; untraced: string[] };
  lang: "en" | "ar";
  dept: string;
  ms: number;
  at: number;
  model?: string;
}

export function BriefingTab({
  run,
  saved,
  onGenerate,
  onPropose,
  onCite,
  deptLabel,
  counts,
}: {
  run: NarvoRun;
  saved: SavedBriefing | null;
  onGenerate: () => void;
  onPropose: (text: string) => void;
  onCite: (n: number) => void;
  deptLabel: string;
  counts: { facts: number; updates: number; overdue: number };
}) {
  const L = useL();
  const f = useFormat();
  const [copied, setCopied] = useState(false);
  const live = run.status !== "idle";
  const text = live ? (run.text.briefing ?? "") : (saved?.text ?? "");
  const citations: Citation[] = (live ? run.data.citations : saved?.citations) ?? [];
  const verification = (live ? run.data.verification : saved?.verification) as SavedBriefing["verification"] | undefined;
  const ms = live ? run.data.saved?.ms : saved?.ms;

  if (!text && !run.running && run.status !== "error") {
    return (
      <EmptyState
        icon={<FileText className="size-4" />}
        title={L({ en: "Week-41 review briefing", ar: "إحاطة مراجعة الأسبوع 41" })}
        action={
          <RunButton running={run.running} onRun={onGenerate} icon={<FileText />}>
            {L({ en: "Generate briefing", ar: "إعداد الإحاطة" })}
          </RunButton>
        }
      >
        {L({
          en: `Combines ${counts.facts} computed scorecard facts, ${counts.updates} department updates and ${counts.overdue} overdue actions into a sourced briefing for H.E. the Director General. Every figure is computed from the data and traced to its source.`,
          ar: `يدمج ${counts.facts} حقيقة محسوبة من بطاقة الأداء و${counts.updates} تحديثاً من الإدارات و${counts.overdue} إجراءات متأخرة في إحاطة موثقة لسعادة المدير العام. كل رقم محسوب من البيانات ومربوط بمصدره.`,
        })}
      </EmptyState>
    );
  }

  const traced = verification ? verification.total - verification.untraced.length : 0;
  return (
    <div className="flex flex-col">
      {/* memo header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div className="min-w-0">
          <div className="label-caps">{L({ en: "MNDA · Strategy & Performance Office", ar: "هيئة مرسى النور للتطوير · مكتب الاستراتيجية والأداء" })}</div>
          <h2 className="mt-1.5 text-[20px] leading-tight font-light tracking-tight">
            {L({ en: "Director-General weekly review — week 41", ar: "المراجعة الأسبوعية لسعادة المدير العام — الأسبوع 41" })}
          </h2>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {L({
              en: "Covers weeks 40–41 · data to Fri 9 Oct 2026 · meeting Mon 12 Oct, 09:00 · prepared for H.E. Eng. Khalid Saif Al Mazrouei",
              ar: "يغطي الأسبوعين 40 و41 · البيانات حتى الجمعة 9 أكتوبر 2026 · الاجتماع الاثنين 12 أكتوبر 09:00 · مُعدّة لسعادة المهندس خالد سيف المزروعي",
            })}
            {deptLabel ? ` · ${deptLabel}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {run.running ? (
            <RunButton running onRun={() => {}} onStop={run.abort} size="sm">
              {""}
            </RunButton>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={async () => {
                  await navigator.clipboard.writeText(text);
                  setCopied(true);
                  toast.success(L({ en: "Briefing copied", ar: "تم نسخ الإحاطة" }));
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? <CheckCheck /> : <Copy />}
                {L({ en: "Copy", ar: "نسخ" })}
              </Button>
              <Button variant="outline" size="sm" onClick={onGenerate}>
                <RefreshCw />
                {L({ en: "Regenerate", ar: "إعادة الإعداد" })}
              </Button>
              <Button size="sm" onClick={() => onPropose(text)} disabled={!text}>
                <Gavel />
                {L({ en: "Propose decisions", ar: "اقتراح القرارات" })}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="pt-2">
        {run.running && !text && <ThinkingLines lines={8} className="mt-4" />}
        {text && (
          <Markdown
            citations={citations}
            onCite={onCite}
            streaming={run.running}
            className={cn(
              "max-w-[820px]",
              "[&_h2]:mt-6 [&_h2]:mb-2.5 [&_h2]:border-b [&_h2]:border-border [&_h2]:pb-1.5 [&_h2]:text-[10.5px] [&_h2]:font-medium [&_h2]:tracking-[0.16em] [&_h2]:text-muted-foreground [&_h2]:uppercase",
              "[&_h2:first-child]:mt-3 [&_li]:my-1.5 [&_li]:leading-relaxed",
            )}
          >
            {normCites(text)}
          </Markdown>
        )}
        {run.status === "error" && !text && (
          <div className="mt-4 rounded-md border border-danger/25 bg-danger-soft p-3 text-[12.5px] text-danger">
            {L({ en: "The briefing could not be generated: ", ar: "تعذر إعداد الإحاطة: " })}
            {run.error}
          </div>
        )}
      </div>

      {verification && !run.running && (
        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-border bg-surface px-3.5 py-2.5 text-[12px]">
          {verification.untraced.length === 0 ? (
            <StatusPill tone="success">
              <ShieldCheck className="size-3" />
              {L({ en: `All ${verification.total} figures traced to sources`, ar: `جميع الأرقام (${verification.total}) موثقة بمصادرها` })}
            </StatusPill>
          ) : (
            <StatusPill tone="warning">
              <TriangleAlert className="size-3" />
              {L({ en: `${traced} of ${verification.total} figures traced`, ar: `${traced} من ${verification.total} أرقام موثقة` })}
            </StatusPill>
          )}
          <span className="text-muted-foreground">
            {L({ en: "Scorecard", ar: "بطاقة الأداء" })} <span className="num font-medium text-foreground">{verification.toScorecard.length}</span> ·{" "}
            {L({ en: "department updates", ar: "تحديثات الإدارات" })} <span className="num font-medium text-foreground">{verification.toNarrative.length}</span>
            {verification.untraced.length > 0 && (
              <>
                {" "}
                · {L({ en: "untraced", ar: "غير موثق" })}{" "}
                <span className="num font-medium text-warning">{verification.untraced.join(", ")}</span>
              </>
            )}
          </span>
          {ms != null && (
            <span className="ms-auto text-muted-foreground">
              {L({ en: "Prepared in", ar: "أُعدّت خلال" })} <span className="num font-medium text-foreground">{f.number(ms / 1000, { maximumFractionDigits: 0 })} {L({ en: "s", ar: "ث" })}</span>
              {saved?.at && !live ? ` · ${f.date(saved.at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
