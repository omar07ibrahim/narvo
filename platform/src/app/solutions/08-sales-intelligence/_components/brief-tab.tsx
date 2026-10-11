"use client";

import { FileText, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFormat, useL, usePrefs } from "@/lib/i18n";
import type { NarvoRun } from "@/hooks/use-narvo-run";
import type { Citation } from "@/lib/ai/events";
import { Markdown } from "@/components/narvo/markdown";
import { RunButton } from "@/components/narvo/run-button";
import { EmptyState, ThinkingLines } from "@/components/narvo/empty";
import { StatusPill } from "@/components/narvo/status";
import type { ReactNode } from "react";
import { Block, ErrorBox, normCites, timeAgoLabel, useMoney } from "./bits";
import { arDays, type OppHealth } from "../_lib/calc";
import type { Account, CachedResult, Opportunity, Quote } from "../_lib/types";

export function CreditGauge({ exposure, limit, className }: { exposure: number; limit: number; className?: string }) {
  const max = Math.max(limit * 1.5, exposure * 1.05);
  const pct = (exposure / max) * 100;
  const limitPct = (limit / max) * 100;
  const over = exposure > limit;
  return (
    <div className={cn("relative h-1.5 w-full rounded-full bg-muted", className)}>
      <div className={cn("absolute inset-y-0 start-0 rounded-full", over ? "bg-danger" : "bg-foreground/45")} style={{ width: `${pct}%` }} />
      <div className="absolute -top-1 -bottom-1 w-px bg-foreground/70" style={{ insetInlineStart: `${limitPct}%` }} />
    </div>
  );
}

function Stat({ label, value, sub, tone, mono }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "danger" | "warning"; mono?: boolean }) {
  return (
    <div className="min-w-0 bg-card px-3.5 py-3">
      <div className="label-caps truncate !text-[9.5px]">{label}</div>
      <div className={cn("num mt-1 truncate text-[15px] font-light tracking-tight", mono && "font-mono text-[13px] font-normal", tone === "danger" && "text-danger", tone === "warning" && "text-warning")}>{value}</div>
      {sub ? <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

export function BriefTab({
  opp,
  account,
  health,
  quote,
  run,
  cached,
  onRun,
  onCite,
}: {
  opp: Opportunity;
  account: Account;
  health: OppHealth;
  quote: Quote | null;
  run: NarvoRun;
  cached?: CachedResult;
  onRun: () => void;
  onCite: (n: number) => void;
}) {
  const L = useL();
  const f = useFormat();
  const m = useMoney();
  const { lang } = usePrefs();
  const exposure = account.arOutstanding + account.openOrdersInclVat;
  const live = run.status !== "idle";
  const text = live ? (run.text.brief ?? "") : (cached?.text ?? "");
  const citations = (live ? run.data.citations : cached?.citations) as Citation[] | undefined;
  const ms = live ? run.ms : cached?.ms;

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border border-border bg-surface/60">
        <div className="grid grid-cols-3 gap-px bg-border max-md:grid-cols-2">
          <Stat label={L({ en: "Credit limit", ar: "الحد الائتماني" })} value={m.aed(account.creditLimit)} sub={L({ en: `Tier ${account.tier} · ${account.paymentTermsDays} days`, ar: `الفئة ${account.tier} · ${account.paymentTermsDays} يوماً` })} />
          <Stat
            label={L({ en: "Exposure", ar: "التعرض" })}
            value={m.aed(exposure)}
            tone={exposure > account.creditLimit ? "danger" : undefined}
            sub={<CreditGauge exposure={exposure} limit={account.creditLimit} className="mt-2" />}
          />
          <Stat label={L({ en: "Overdue > 30 days", ar: "متأخرات > 30 يوماً" })} value={m.aed(account.overdue30)} tone={account.overdue30 > 0 ? "warning" : undefined} sub={L({ en: `YTD revenue ${m.compact(account.ytd2026)}`, ar: `إيرادات السنة ${m.compact(account.ytd2026)}` })} />
          <Stat
            label={L({ en: "Days in stage", ar: "أيام في المرحلة" })}
            value={`${health.daysInStage} / ${health.threshold}`}
            tone={health.stalled ? "warning" : undefined}
            sub={health.stalled ? L({ en: "Stalled", ar: "متعثرة" }) : health.overThreshold ? L({ en: "Over threshold, active", ar: "فوق الحد، نشطة" }) : L({ en: "Within threshold", ar: "ضمن الحد" })}
          />
          <Stat
            label={L({ en: "Last customer contact", ar: "آخر تواصل مع المتعامل" })}
            value={health.lastTouch ? f.date(health.lastTouch.at, { day: "numeric", month: "short" }) : "—"}
            sub={
              health.daysSinceTouch == null
                ? ""
                : health.daysSinceTouch === 0
                  ? L({ en: "today", ar: "اليوم" })
                  : L({ en: `${health.daysSinceTouch} days ago`, ar: `قبل ${arDays(health.daysSinceTouch)}` })
            }
          />
          <Stat
            label={L({ en: "Quotation", ar: "عرض السعر" })}
            value={quote ? quote.id : "—"}
            mono
            tone={quote?.status === "Expired" ? "danger" : undefined}
            sub={quote ? `${quote.status} · ${f.date(quote.validUntil, { day: "numeric", month: "short" })}` : opp.competitor ? L({ en: `Competing: ${opp.competitor}`, ar: `منافس: ${opp.competitor}` }) : ""}
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border px-3.5 py-2.5 text-[12.5px]">
          <span className="label-caps !text-[9.5px]">{L({ en: "Next step", ar: "الخطوة التالية" })}</span>
          <span className={cn("min-w-0", health.nextStepOverdue && "text-danger")} dir="auto">
            {L({ en: opp.nextStep, ar: opp.nextStepAr || opp.nextStep })}
          </span>
          {opp.nextStepDate && <span className={cn("num text-[11.5px]", health.nextStepOverdue ? "text-danger" : "text-muted-foreground")}>{f.date(opp.nextStepDate, { day: "numeric", month: "short" })}</span>}
          {health.reasons.length > 0 && (
            <span className="ms-auto flex flex-wrap gap-1">
              {health.reasons.map((r, i) => (
                <StatusPill key={i} tone="warning">
                  {L(r)}
                </StatusPill>
              ))}
            </span>
          )}
        </div>
      </div>

      <Block
        label={L({ en: "Account brief", ar: "ملخص الحساب" })}
        actions={
          <RunButton running={run.running} onRun={onRun} onStop={run.abort} size="sm" icon={<Sparkles className="size-3.5" />} variant={text ? "outline" : "default"}>
            {text ? L({ en: "Regenerate", ar: "إعادة الإنشاء" }) : L({ en: "Build account brief", ar: "إعداد ملخص الحساب" })}
          </RunButton>
        }
      >
        {run.status === "error" && <ErrorBox message={run.error} onRetry={onRun} />}
        {!text && run.running && <ThinkingLines lines={7} />}
        {!text && !run.running && run.status !== "error" && (
          <EmptyState icon={<FileText className="size-4" />} title={L({ en: "No brief yet", ar: "لا يوجد ملخص بعد" })}>
            {L({
              en: "NARVO reads every enquiry, call note, meeting, WhatsApp, quote and customer document on this account and writes a cited brief for the owner.",
              ar: "يقرأ نارفو كل استفسار ومكالمة واجتماع ورسالة واتساب وعرض ومستند للمتعامل في هذا الحساب، ويكتب ملخصاً موثقاً بالمصادر للمسؤول.",
            })}
          </EmptyState>
        )}
        {text && <Markdown citations={citations} onCite={onCite} streaming={run.running}>{normCites(text)}</Markdown>}
        {text && !run.running && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-2.5 text-[11px] text-muted-foreground">
            {ms != null && (
              <span className="num">
                {L({ en: `Prepared in ${(ms / 1000).toFixed(1)} s`, ar: `أُعدّ في ${(ms / 1000).toFixed(1)} ثانية` })}
                <span className="text-faint"> · {L({ en: "baseline 75 min", ar: "المرجع 75 دقيقة" })}</span>
              </span>
            )}
            {!live && cached && <span>{timeAgoLabel(cached.at, lang)}</span>}
            {citations && (
              <span className="num">
                {L({ en: `${new Set(Array.from(text.matchAll(/\[(\d+)\]/g)).map((x) => x[1])).size} of ${citations.length} sources cited`, ar: `${new Set(Array.from(text.matchAll(/\[(\d+)\]/g)).map((x) => x[1])).size} من ${citations.length} مصادر مستشهد بها` })}
              </span>
            )}
          </div>
        )}
      </Block>
    </div>
  );
}
