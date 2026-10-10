"use client";

import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ClipboardList } from "lucide-react";
import type { NarvoRun } from "@/hooks/use-narvo-run";
import { AgentTrace } from "@/components/narvo/agent-trace";
import { Markdown } from "@/components/narvo/markdown";
import { Pane } from "@/components/narvo/pane";
import { RunButton } from "@/components/narvo/run-button";
import { SourceList } from "@/components/narvo/sources";
import { StatusPill } from "@/components/narvo/status";
import { EmptyState, ThinkingLines } from "@/components/narvo/empty";
import { CHART, ChartTooltip, axisProps, gridProps } from "@/components/narvo/chart";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useFormat, useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Citation } from "@/lib/ai/events";
import type { BmsLog, Job, PartAvailability } from "../_lib/types";

export interface BriefData {
  text: string;
  citations: Citation[];
  parts: PartAvailability[];
  cautions?: Array<{ partNo: string; desc: string; warning: string }>;
  ms?: number;
  generatedAt?: number;
}

const STATUS_TONE: Record<PartAvailability["status"], "success" | "info" | "warning" | "danger"> = {
  in_van: "success",
  site_store: "info",
  central_store: "warning",
  order: "danger",
};

export function PartsTable({ parts, compact }: { parts: PartAvailability[]; compact?: boolean }) {
  const L = useL();
  const label: Record<PartAvailability["status"], { en: string; ar: string }> = {
    in_van: { en: "In van", ar: "في الشاحنة" },
    site_store: { en: "Site store", ar: "مخزن الموقع" },
    central_store: { en: "Central store", ar: "المخزن المركزي" },
    order: { en: "Order", ar: "طلب شراء" },
  };
  return (
    <ul className="divide-y divide-border">
      {parts.map((p) => (
        <li key={p.partNo} className={cn("py-2", compact ? "text-[11.5px]" : "text-[12px]")}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[11px] font-medium">{p.partNo}</span>
                <span className="num text-muted-foreground">× {p.qty}</span>
              </div>
              <div className="truncate text-muted-foreground">{p.desc}</div>
            </div>
            <StatusPill tone={STATUS_TONE[p.status]}>{L(label[p.status])}</StatusPill>
          </div>
          {!compact && <div className="mt-0.5 text-[11px] text-faint">{p.action}</div>}
          {p.warning && (
            <div className="mt-1 flex items-start gap-1.5 rounded bg-danger-soft px-2 py-1 text-[11px] text-danger">
              <AlertTriangle className="mt-px size-3 shrink-0" />
              {p.warning}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export function BmsChart({ bms }: { bms: BmsLog }) {
  const L = useL();
  const f = useFormat();
  return (
    <div>
      <div className="h-[190px]" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={bms.daily} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="date" {...axisProps} tickFormatter={(d) => f.date(d, { day: "numeric", month: "short" })} interval={9} />
            <YAxis yAxisId="t" {...axisProps} width={34} domain={[34, 50]} tickFormatter={(v) => `${v}°`} />
            <YAxis yAxisId="n" orientation="right" {...axisProps} width={22} domain={[0, 4]} allowDecimals={false} />
            <Tooltip
              content={({ active, payload, label }) => (
                <ChartTooltip
                  active={active}
                  label={label ? f.date(String(label), { day: "numeric", month: "short" }) : undefined}
                  payload={(payload ?? []).map((p) => ({
                    name: p.dataKey === "trips" ? L({ en: "A21 trips", ar: "حالات التوقف A21" }) : L({ en: "Max ambient °C", ar: "أعلى حرارة °م" }),
                    value: p.value as number,
                    color: p.color as string,
                  }))}
                />
              )}
            />
            <ReferenceLine yAxisId="t" y={44} stroke={CHART.warning} strokeDasharray="4 3" label={{ value: "44 °C", position: "insideTopLeft", fontSize: 10, fill: "var(--warning)" }} />
            <Bar yAxisId="n" dataKey="trips" fill={CHART.danger} fillOpacity={0.75} barSize={6} isAnimationActive={false} />
            <Line yAxisId="t" dataKey="maxAmbientC" stroke={CHART.ink} strokeWidth={1.2} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex gap-4 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 bg-foreground" />
          {L({ en: "Daily max ambient", ar: "أعلى حرارة يومية" })}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-[2px] bg-danger" />
          {L({ en: "A21 trips (circuit B)", ar: "حالات التوقف A21 (الدائرة B)" })}
        </span>
      </div>
    </div>
  );
}

export function BriefView({ job, run, stored, bms, onRun }: { job: Job; run: NarvoRun; stored?: BriefData; bms?: BmsLog; onRun: () => void }) {
  const L = useL();
  const f = useFormat();
  const live = run.status !== "idle";
  const text = live ? (run.text.main ?? "") : (stored?.text ?? "");
  const citations = ((live ? run.data.citations : stored?.citations) as Citation[]) ?? [];
  const parts = ((live ? run.data.parts : stored?.parts) as PartAvailability[]) ?? [];
  const cautions = ((live ? run.data.cautions : stored?.cautions) as BriefData["cautions"]) ?? [];
  const hasBrief = !!text;

  return (
    <div className="flex flex-col gap-4">
      <Pane
        title={L({ en: "Job brief", ar: "ملخص المهمة" })}
        subtitle={
          stored && !live
            ? L({ en: `Prepared ${f.relative(stored.generatedAt ?? Date.now())} in ${((stored.ms ?? 0) / 1000).toFixed(0)} s`, ar: `أُعدّ ${f.relative(stored.generatedAt ?? Date.now())} خلال ${((stored.ms ?? 0) / 1000).toFixed(0)} ث` })
            : L({ en: "Service history, BMS trends and approved manuals → cited brief", ar: "سجل الخدمة واتجاهات نظام المبنى والأدلة المعتمدة ← ملخص موثق" })
        }
        actions={
          <RunButton size="sm" running={run.running} onRun={onRun} onStop={run.abort} icon={<ClipboardList />}>
            {hasBrief ? L({ en: "Regenerate", ar: "إعادة الإعداد" }) : L({ en: "Prepare job brief", ar: "إعداد ملخص المهمة" })}
          </RunButton>
        }
      >
        {!hasBrief && !run.running ? (
          run.status === "error" ? (
            <div className="rounded-md border border-danger/25 bg-danger-soft p-3 text-[12.5px] text-danger">{run.error}</div>
          ) : (
            <EmptyState icon={<ClipboardList className="size-4" />} title={L({ en: "No brief yet", ar: "لا يوجد ملخص بعد" })}>
              {L({
                en: "NARVO reads this asset's work orders and BMS log, finds the relevant sections of the approved manuals and procedures, and writes a brief the technician can trust — every claim cited.",
                ar: "يقرأ NARVO أوامر العمل وسجل نظام المبنى لهذا الأصل، ويجد الأقسام ذات الصلة في الأدلة والإجراءات المعتمدة، ويكتب ملخصاً موثوقاً — مع توثيق كل معلومة.",
              })}
            </EmptyState>
          )
        ) : text ? (
          <Markdown citations={citations} streaming={run.running} className="text-[13px]">
            {text}
          </Markdown>
        ) : (
          <ThinkingLines lines={8} />
        )}
        {citations.length > 0 && !run.running && (
          <Collapsible className="mt-4 border-t border-border pt-3">
            <CollapsibleTrigger className="label-caps hover:text-foreground">
              {L({ en: `Sources — ${citations.length} (work orders, BMS, manuals)`, ar: `المصادر — ${citations.length} (أوامر العمل، نظام المبنى، الأدلة)` })}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <SourceList citations={citations} text={text} />
            </CollapsibleContent>
          </Collapsible>
        )}
      </Pane>
      <div className="grid gap-4 md:grid-cols-2">
        <Pane title={L({ en: "Preparation pipeline", ar: "مسار الإعداد" })}>
          <AgentTrace run={run} showReasoning={false} emptyHint={L({ en: "History → BMS → manuals → brief → parts check.", ar: "السجل ← نظام المبنى ← الأدلة ← الملخص ← فحص القطع." })} />
        </Pane>
        {parts.length > 0 && (
          <Pane title={L({ en: "Parts & tools — stock check", ar: "القطع والأدوات — فحص المخزون" })} bodyClassName="pt-1">
            <PartsTable parts={parts} />
            {cautions.map((c) => (
              <div key={c.partNo} className="mt-2 flex items-start gap-1.5 rounded-md border border-danger/25 bg-danger-soft px-2.5 py-1.5 text-[11.5px] text-danger">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  <span className="font-mono font-medium">{c.partNo}</span> — {c.warning}
                </span>
              </div>
            ))}
          </Pane>
        )}
        {bms && (
          <Pane title={L({ en: "CH-02 · ambient vs A21 trips", ar: "CH-02 · الحرارة مقابل حالات التوقف" })}>
            <BmsChart bms={bms} />
          </Pane>
        )}
      </div>
    </div>
  );
}
