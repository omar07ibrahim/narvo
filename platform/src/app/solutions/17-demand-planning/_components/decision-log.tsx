"use client";

import { useMemo } from "react";
import { CircleCheck, History, RotateCcw, TriangleAlert } from "lucide-react";
import { Pane } from "@/components/narvo/pane";
import { StatusPill } from "@/components/narvo/status";
import { EmptyState } from "@/components/narvo/empty";
import { Button } from "@/components/ui/button";
import { useFormat, useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { buildSimSeries, runPlans } from "../_lib/simulate";
import { DEFAULT_WHATIF, type ForecastBundle, type Override, type PlanningConfig, type Position, type PublishedPlan, type WhatIf } from "../_lib/types";
import { fmtK, fmtPct } from "./bits";

/** Published plans, revisit check against today's assumptions, and the planner override log. */
export function DecisionLog({
  cfg,
  bundle,
  positions,
  published,
  overrides,
  whatIf,
  onWithdraw,
  onRestore,
}: {
  cfg: PlanningConfig;
  bundle: ForecastBundle;
  positions: Record<string, Position>;
  published: PublishedPlan[];
  overrides: Override[];
  whatIf: WhatIf;
  onWithdraw: (id: string) => void;
  onRestore: (w: WhatIf) => void;
}) {
  const L = useL();
  const f = useFormat();
  const latest = published[0];

  // Re-run the latest published plan under today's assumptions (current what-if + overrides + updated supply data).
  const revisit = useMemo(() => {
    if (!latest) return null;
    const sim = buildSimSeries(bundle.series, overrides, whatIf, cfg);
    const run = runPlans({ cfg, positions, series: sim, whatIf });
    const now = run.plans.find((p) => p.id === latest.planId)!;
    const fillDelta = now.fillRate - latest.kpis.fillRate;
    const newViol = now.violations.length - latest.kpis.violations;
    const costDelta = now.cost.total - latest.kpis.totalCost;
    const reasons: string[] = [];
    if (fillDelta < -0.005) reasons.push(L({ en: `fill rate ${fmtPct(fillDelta)} pts vs approval`, ar: `نسبة التلبية ${fmtPct(fillDelta)} نقطة مقارنة بالاعتماد` }));
    if (newViol > 0) reasons.push(L({ en: `${newViol} new capacity violation(s)`, ar: `${newViol} مخالفة سعة جديدة` }));
    if (Math.abs(costDelta) > latest.kpis.totalCost * 0.1) reasons.push(L({ en: `cost ${costDelta > 0 ? "+" : ""}${fmtK(costDelta)} AED`, ar: `التكلفة ${costDelta > 0 ? "+" : ""}${fmtK(costDelta)} درهم` }));
    return { now, fillDelta, reasons, revisit: reasons.length > 0 };
  }, [latest, bundle, overrides, whatIf, cfg, positions, L]);

  const overrideRate = new Set(overrides.map((o) => o.key)).size / bundle.series.length;
  const cycles = [...cfg.history.overrideRateByCycle, { cycle: "2026-10", rate: overrideRate }];

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-4">
        <Pane title={L({ en: "Published plans", ar: "الخطط المنشورة" })} subtitle={L({ en: "Each version keeps the assumptions and KPIs it was approved on", ar: "تحتفظ كل نسخة بالافتراضات والمؤشرات التي اعتُمدت عليها" })} flush>
          {published.length === 0 ? (
            <EmptyState icon={<History className="size-4" />} title={L({ en: "No plan published yet", ar: "لم تُنشر أي خطة بعد" })} />
          ) : (
            <ul className="divide-y divide-border">
              {published.map((p, i) => (
                <li key={p.id} className="px-4 py-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[12px] font-medium">{p.id}</span>
                      {i === 0 ? <StatusPill tone="ai">{L({ en: "Current", ar: "الحالية" })}</StatusPill> : <StatusPill>{L({ en: "Superseded", ar: "مستبدلة" })}</StatusPill>}
                    </div>
                    <span className="text-[11.5px] text-muted-foreground">
                      {L({ en: "Approved by", ar: "اعتمدها" })} {p.approvedBy} · {f.date(p.publishedAt, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <div className="mt-1 text-[13px]">
                    {L({ en: "Plan", ar: "الخطة" })} {p.planId} — {p.planName}
                  </div>
                  <div className="mt-1 text-[11.5px] text-muted-foreground" dir="auto">
                    {p.whatIf.assumption}
                  </div>
                  <div className="num mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11.5px]">
                    <span>
                      {L({ en: "Fill", ar: "التلبية" })} <b className="font-medium">{fmtPct(p.kpis.fillRate)}</b>
                    </span>
                    <span>
                      P10 <b className="font-medium">{fmtPct(p.kpis.fillRateP10)}</b>
                    </span>
                    <span>
                      {L({ en: "Cost", ar: "التكلفة" })} <b className="font-medium">AED {fmtK(p.kpis.totalCost)}</b>
                    </span>
                    <span>
                      {L({ en: "Violations", ar: "المخالفات" })} <b className="font-medium">{p.kpis.violations}</b>
                    </span>
                    <span>
                      {L({ en: "Overrides", ar: "التعديلات" })} <b className="font-medium">{p.overrides}</b>
                    </span>
                  </div>
                  {i === 0 && p.whatIf.upliftScope && (
                    <Button
                      size="xs"
                      variant="ghost"
                      className="mt-1.5 -ms-2 text-muted-foreground"
                      onClick={() =>
                        onRestore({
                          upliftPct: p.whatIf.upliftPct ?? DEFAULT_WHATIF.upliftPct,
                          upliftScope: p.whatIf.upliftScope ?? DEFAULT_WHATIF.upliftScope,
                          palletLossJA: p.whatIf.palletLossJA ?? 0,
                          yardLossJA: p.whatIf.yardLossJA ?? 0,
                          millDelayWeeks: p.whatIf.millDelayWeeks ?? 0,
                          serviceTarget: p.whatIf.serviceTarget ?? DEFAULT_WHATIF.serviceTarget,
                        })
                      }
                    >
                      <RotateCcw /> {L({ en: "Load these assumptions", ar: "تحميل هذه الافتراضات" })}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Pane>

        {latest && revisit && (
          <Pane title={L({ en: "Revisit check", ar: "فحص الحاجة للمراجعة" })} subtitle={L({ en: "Latest published plan re-simulated under today's demand, overrides and constraints", ar: "إعادة محاكاة آخر خطة منشورة وفق الطلب والتعديلات والقيود الحالية" })}>
            <div className={cn("flex items-start gap-3 rounded-md border p-3", revisit.revisit ? "border-warning/35 bg-warning-soft/50" : "border-success/30 bg-success-soft/50")}>
              {revisit.revisit ? <TriangleAlert className="mt-0.5 size-4 text-warning" /> : <CircleCheck className="mt-0.5 size-4 text-success" />}
              <div className="text-[12.5px]">
                <div className="font-medium">
                  {revisit.revisit
                    ? L({ en: `Revisit ${latest.id}: conditions have moved`, ar: `يلزم مراجعة ${latest.id}: تغيّرت الظروف` })
                    : L({ en: `${latest.id} still holds under current assumptions`, ar: `${latest.id} ما زالت صالحة وفق الافتراضات الحالية` })}
                </div>
                {revisit.reasons.length > 0 && <div className="mt-0.5 text-muted-foreground">{revisit.reasons.join(" · ")}</div>}
                <div className="num mt-2 grid grid-cols-3 gap-3 text-[11.5px]">
                  <div>
                    <div className="label-caps !text-[9px]">{L({ en: "Fill at approval", ar: "التلبية عند الاعتماد" })}</div>
                    <div className="mt-0.5 text-[15px] font-light">{fmtPct(latest.kpis.fillRate)}</div>
                  </div>
                  <div>
                    <div className="label-caps !text-[9px]">{L({ en: "Fill today", ar: "التلبية اليوم" })}</div>
                    <div className={cn("mt-0.5 text-[15px] font-light", revisit.fillDelta < -0.005 && "text-warning")}>{fmtPct(revisit.now.fillRate)}</div>
                  </div>
                  <div>
                    <div className="label-caps !text-[9px]">{L({ en: "Violations today", ar: "المخالفات اليوم" })}</div>
                    <div className={cn("mt-0.5 text-[15px] font-light", revisit.now.violations.length > 0 && "text-danger")}>{revisit.now.violations.length}</div>
                  </div>
                </div>
              </div>
            </div>
          </Pane>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <Pane title={L({ en: "Planner overrides", ar: "تعديلات المخطِّط" })} subtitle={L({ en: "Share of the 24 forecasts changed by hand, by planning cycle", ar: "نسبة التوقعات الـ24 المعدّلة يدوياً حسب دورة التخطيط" })}>
          <div className="flex h-20 items-end gap-2">
            {cycles.map((c) => (
              <div key={c.cycle} className="flex flex-1 flex-col items-center gap-1">
                <span className="num text-[10.5px] text-muted-foreground">{Math.round(c.rate * 100)}%</span>
                <div className={cn("w-full rounded-t-[3px]", c.cycle === "2026-10" ? "bg-ai" : "bg-foreground/25")} style={{ height: `${Math.max(2, c.rate * 100)}px` }} />
                <span className="num text-[10px] text-faint">{c.cycle.slice(5)}/{c.cycle.slice(2, 4)}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-2">
            {overrides.length === 0 && <p className="text-[12px] text-muted-foreground">{L({ en: "No overrides this cycle — the statistical forecast is used as is.", ar: "لا توجد تعديلات في هذه الدورة — يُستخدم التوقع الإحصائي كما هو." })}</p>}
            {overrides.map((o) => (
              <div key={o.id} className="rounded-md border border-border bg-surface p-2.5 text-[12px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11.5px]">{o.key.replace("|", " · ")}</span>
                  <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={() => onWithdraw(o.id)}>
                    {L({ en: "Withdraw", ar: "سحب" })}
                  </Button>
                </div>
                <div className="num text-muted-foreground">
                  {L({ en: "w/c", ar: "أسبوع" })} {f.date(o.week, { day: "numeric", month: "short" })} · {f.number(o.original)} → <span className="font-medium text-warning">{f.number(o.value)}</span>
                </div>
                <div className="mt-0.5" dir="auto">
                  {o.reason}
                </div>
                <div className="mt-0.5 text-[10.5px] text-faint">
                  {o.by} · {f.date(o.ts, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            ))}
          </div>
        </Pane>
      </div>
    </div>
  );
}
