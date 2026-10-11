"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { SolutionPage } from "@/components/narvo/solution-page";
import { MetricTile } from "@/components/narvo/metric";
import { DirectionProvider } from "@/components/ui/direction";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useL, usePrefs } from "@/lib/i18n";
import type { ApprovalSummary } from "@/lib/ai/events";
import { buildSimSeries, runPlans } from "../_lib/simulate";
import { DEFAULT_WHATIF, type CalendarDef, type ForecastBundle, type Override, type PlanningConfig, type Position, type PublishedPlan, type WhatIf } from "../_lib/types";
import { AnalystPane } from "./analyst-pane";
import { ByoView } from "./byo-view";
import { DecisionLog } from "./decision-log";
import { ForecastView } from "./forecast-view";
import { CostChart, PlanCards, SkuRiskTable, StorageChart, SubmitBar, ViolationList, WhatIfBar } from "./plans-view";
import { SCENARIO } from "./scenario";
import { fmtK, fmtPct } from "./bits";

export function PlanningWorkspace({
  cfg,
  bundle,
  calendar,
  positions,
  initialOverrides,
  initialPublished,
  initialApprovals,
}: {
  cfg: PlanningConfig;
  bundle: ForecastBundle;
  calendar: CalendarDef;
  positions: Record<string, Position>;
  initialOverrides: Override[];
  initialPublished: PublishedPlan[];
  initialApprovals: ApprovalSummary[];
}) {
  const L = useL();
  const { dir } = usePrefs();
  const [tab, setTab] = useState("forecast");
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t) setTab(t);
  }, []);
  // Ras Al Marsa (MN-05) serves the Marina Quarter projects — the series the demo opens on.
  const [selectedKey, setSelectedKey] = useState("RB-B500-16|MN");
  const [whatIf, setWhatIf] = useState<WhatIf>(DEFAULT_WHATIF);
  const [overrides, setOverrides] = useState<Override[]>(initialOverrides);
  const [published, setPublished] = useState<PublishedPlan[]>(initialPublished);
  const [approvals, setApprovals] = useState<ApprovalSummary[]>(initialApprovals.filter((a) => a.status === "pending"));
  const [plan, setPlan] = useState<"A" | "B" | "C">("A");
  const [submitting, setSubmitting] = useState(false);

  const deferred = useDeferredValue(whatIf);
  const computing = deferred !== whatIf;
  const run = useMemo(() => {
    const sim = buildSimSeries(bundle.series, overrides, deferred, cfg);
    return runPlans({ cfg, positions, series: sim, whatIf: deferred });
  }, [bundle, overrides, deferred, cfg, positions]);
  const sel = run.plans.find((p) => p.id === plan)!;

  const overrideKeys = new Set(overrides.map((o) => o.key)).size;
  const overrideRate = overrideKeys / bundle.series.length;
  const lastCycle = cfg.history.overrideRateByCycle[cfg.history.overrideRateByCycle.length - 1];

  async function refreshPlans() {
    const res = await fetch("/api/solutions/17-demand-planning/plans");
    if (!res.ok) return;
    const j = await res.json();
    setPublished(j.published);
    setOverrides(j.overrides);
  }

  async function submit() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/solutions/17-demand-planning/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan, whatIf }),
      });
      if (!res.ok) throw new Error(await res.text());
      const j = await res.json();
      setApprovals((a) => [j.approval, ...a.filter((x) => x.id !== j.approval.id)]);
      toast.success(L({ en: "Plan submitted — awaiting Joseph Abraham's approval", ar: "أُرسلت الخطة — بانتظار اعتماد جوزيف أبراهام" }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function withdrawOverride(id: string) {
    const res = await fetch("/api/solutions/17-demand-planning/overrides", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) setOverrides((await res.json()).overrides);
  }

  return (
    <SolutionPage slug="17-demand-planning" scenario={SCENARIO}>
      <DirectionProvider dir={dir}>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <MetricTile
          label={L({ en: "Forecast error · WAPE", ar: "خطأ التوقع · WAPE" })}
          value={fmtPct(bundle.portfolio.wape)}
          tone="ai"
          sub={L({
            en: `naive ${fmtPct(bundle.portfolio.naiveWape)} · legacy ${Math.round(cfg.history.legacyMape * 100)}% MAPE`,
            ar: `بسيط ${fmtPct(bundle.portfolio.naiveWape)} · السابق ${Math.round(cfg.history.legacyMape * 100)}%`,
          })}
        />
        <MetricTile
          label={L({ en: `Fill rate · plan ${plan}`, ar: `نسبة التلبية · الخطة ${plan}` })}
          value={fmtPct(sel.fillRate)}
          sub={`P10 ${fmtPct(sel.fillRateP10)} · ${L({ en: "100 demand paths", ar: "100 مسار طلب" })}`}
        />
        <MetricTile
          label={L({ en: `Constraint fit · plan ${plan}`, ar: `التوافق مع القيود · الخطة ${plan}` })}
          value={fmtPct(sel.constraintFit, 0)}
          tone={sel.violations.length ? "danger" : "success"}
          sub={sel.violations.length ? L({ en: `${sel.violations.length} resource-week${sel.violations.length === 1 ? "" : "s"} over limit`, ar: `${sel.violations.length} أسبوع-مورد فوق الحد` }) : L({ en: "4 resources × 13 weeks within limits", ar: "4 موارد × 13 أسبوعاً ضمن الحدود" })}
        />
        <MetricTile
          label={L({ en: `13-week cost · plan ${plan}`, ar: `تكلفة 13 أسبوعاً · الخطة ${plan}` })}
          value={`AED ${fmtK(sel.cost.total)}`}
          sub={`P10–P90 ${fmtK(sel.cost.totalP10)}–${fmtK(sel.cost.totalP90)}`}
        />
        <MetricTile
          label={L({ en: "Planner overrides", ar: "تعديلات المخطِّط" })}
          value={fmtPct(overrideRate, 0)}
          tone={overrideRate > 0.12 ? "warning" : "default"}
          sub={L({ en: `${overrideKeys} of ${bundle.series.length} forecasts · Sep cycle ${Math.round(lastCycle.rate * 100)}%`, ar: `${overrideKeys} من ${bundle.series.length} · دورة سبتمبر ${Math.round(lastCycle.rate * 100)}%` })}
        />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_400px]">
        <Tabs value={tab} onValueChange={setTab} className="min-w-0 gap-4">
          <TabsList variant="line" className="h-9">
            <TabsTrigger value="forecast">{L({ en: "Forecast", ar: "التوقعات" })}</TabsTrigger>
            <TabsTrigger value="plans">{L({ en: "Plan scenarios", ar: "سيناريوهات الخطط" })}</TabsTrigger>
            <TabsTrigger value="log">
              {L({ en: "Decision log", ar: "سجل القرارات" })}
              {approvals.some((a) => a.status === "pending") && <span className="size-1.5 rounded-full bg-warning" />}
            </TabsTrigger>
            <TabsTrigger value="byo">{L({ en: "Your data", ar: "بياناتك" })}</TabsTrigger>
          </TabsList>

          <TabsContent value="forecast" className="mt-0">
            <ForecastView
              cfg={cfg}
              bundle={bundle}
              calendar={calendar}
              selectedKey={selectedKey}
              onSelect={setSelectedKey}
              overrides={overrides}
              onOverridesChange={setOverrides}
              plan={sel}
            />
          </TabsContent>

          <TabsContent value="plans" className="mt-0 flex flex-col gap-4">
            <WhatIfBar whatIf={whatIf} onChange={setWhatIf} computing={computing} ms={run.ms} />
            <PlanCards cfg={cfg} run={run} selected={plan} onSelect={setPlan} />
            <SubmitBar cfg={cfg} run={run} selected={plan} onSubmit={submit} busy={submitting} pending={approvals.some((a) => a.status === "pending")} />
            <div className="grid gap-4 2xl:grid-cols-2">
              <StorageChart run={run} selected={plan} />
              <CostChart run={run} />
            </div>
            <div className="grid gap-4 2xl:grid-cols-2">
              <SkuRiskTable
                cfg={cfg}
                run={run}
                onPick={(k) => {
                  setSelectedKey(k);
                  setTab("forecast");
                }}
              />
              <ViolationList run={run} />
            </div>
          </TabsContent>

          <TabsContent value="log" className="mt-0">
            <DecisionLog
              cfg={cfg}
              bundle={bundle}
              positions={positions}
              published={published}
              overrides={overrides}
              whatIf={deferred}
              onWithdraw={withdrawOverride}
              onRestore={(w) => {
                setWhatIf(w);
                setTab("plans");
              }}
            />
          </TabsContent>

          <TabsContent value="byo" className="mt-0">
            <ByoView />
          </TabsContent>
        </Tabs>

        <div className="lg:sticky lg:top-4">
          <AnalystPane
            whatIf={deferred}
            approvals={approvals}
            onDecided={async (id, status) => {
              setApprovals((a) => a.map((x) => (x.id === id ? { ...x, status } : x)));
              await refreshPlans();
              if (status === "approved") setTab("log");
            }}
          />
        </div>
      </div>
      </DirectionProvider>
    </SolutionPage>
  );
}
