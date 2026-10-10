"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, ClipboardCheck, FileText, Gavel, MessageSquareText } from "lucide-react";
import { SolutionPage } from "@/components/narvo/solution-page";
import { Pane, Workbench } from "@/components/narvo/pane";
import { MetricTile } from "@/components/narvo/metric";
import { AgentTrace } from "@/components/narvo/agent-trace";
import { SourceList } from "@/components/narvo/sources";
import { StatusPill } from "@/components/narvo/status";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useNarvoRun } from "@/hooks/use-narvo-run";
import type { Citation } from "@/lib/ai/events";
import { useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { DEPTS, HEADLINE, METRICS, REVIEW, metricById, type Dept } from "../_lib/catalogue";
import { actionStats, compute, fmtDelta, fmtValue, weekRange, addDays, type ActionItem, type Dataset } from "../_lib/engine";
import type { FigureCheckResult } from "../_lib/check";
import { KpiCard, useSnapshots } from "./kpi-header";
import { BriefingTab, type SavedBriefing } from "./briefing-tab";
import { FigureTab } from "./figure-tab";
import { AskTab, type AskEntry } from "./ask-tab";
import { ActionsTab } from "./actions-tab";
import { TrendsTab } from "./trends-tab";
import { RagDot } from "./bits";
import { SCENARIO } from "./scenario";

type Tab = "briefing" | "check" | "ask" | "decisions" | "trends";
const API = "/api/solutions/02-decision-intelligence";

export function Workspace({ dataset, initialActions, counts }: { dataset: Dataset; initialActions: ActionItem[]; counts: { facts: number; updates: number } }) {
  const L = useL();
  const [dept, setDept] = useState<Dept | "all">("all");
  const [tab, setTab] = useState<Tab>("briefing");
  const [metricId, setMetricId] = useState<string>("hg_backlog");
  const [actions, setActions] = useState<ActionItem[]>(initialActions);
  const [storedBriefing, setStoredBriefing] = useState<SavedBriefing | null>(null);
  const [storedCheck, setStoredCheck] = useState<FigureCheckResult | null>(null);
  const [askHistory, setAskHistory] = useState<AskEntry[]>([]);
  const [currentQ, setCurrentQ] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<number | null>(null);

  const briefing = useNarvoRun();
  const checker = useNarvoRun();
  const ask = useNarvoRun();
  const decide = useNarvoRun();

  const stats = useMemo(() => actionStats(actions, REVIEW.today), [actions]);

  /* restore persisted results */
  useEffect(() => {
    fetch(`${API}/briefing`)
      .then((r) => r.json())
      .then((j) => setStoredBriefing(j.briefing))
      .catch(() => {});
    fetch(`${API}/figure-check`)
      .then((r) => r.json())
      .then((j) => setStoredCheck(j.result))
      .catch(() => {});
  }, []);
  /* the latest completed run supersedes what was stored */
  const saved: SavedBriefing | null =
    briefing.status === "done" && briefing.text.briefing
      ? {
          text: briefing.text.briefing,
          citations: briefing.data.citations ?? [],
          verification: briefing.data.verification,
          lang: "en",
          dept,
          ms: briefing.data.saved?.ms ?? briefing.ms ?? 0,
          at: briefing.data.saved?.at ?? 0,
        }
      : storedBriefing;
  const check: FigureCheckResult | null =
    checker.status === "done" && checker.data.result && checker.data.result.checks?.[0]?.updateId !== "UPD-PASTED" ? checker.data.result : storedCheck;

  const refreshActions = useCallback(async () => {
    const r = await fetch(`${API}/actions`);
    const j = await r.json();
    setActions(j.actions);
  }, []);

  /* ask: the finished question moves into the history when the next one is asked */
  const askQuestion = (q: string) => {
    if (currentQ && (ask.status === "done" || ask.status === "error")) {
      const prev: AskEntry = { q: currentQ, spec: ask.data.spec, result: ask.data.result, answer: ask.text.answer ?? "", citations: ask.data.citations ?? [], error: ask.status === "error" ? ask.error : undefined };
      setAskHistory((h) => [prev, ...h]);
    }
    setCurrentQ(q);
    ask.start(`${API}/ask`, { question: q, history: askHistory.slice(0, 3).map((h) => ({ q: h.q, a: h.answer })) });
  };

  const defs = useMemo(() => (dept === "all" ? HEADLINE.map((id) => metricById(id)!) : METRICS.filter((m) => m.dept === dept).slice(0, 8)), [dept]);
  const snaps = useSnapshots(dataset, defs);
  const allWeek = useMemo(() => {
    const [w0] = weekRange(REVIEW.week);
    const [p0, p1] = weekRange(REVIEW.previousWeek);
    return METRICS.map((def) => {
      const isFlow = def.unit === "count" && def.agg.kind !== "stock";
      const cur = compute(dataset, def, w0, REVIEW.dataTo);
      const prev = compute(dataset, def, p0, isFlow ? addDays(p0, 4) : p1);
      return { def, cur, prev };
    });
  }, [dataset]);
  const redCount = allWeek.filter((x) => x.cur.rag === "red").length;
  const withTarget = allWeek.filter((x) => x.cur.rag != null).length;

  const activeRun = tab === "check" ? checker : tab === "ask" ? ask : tab === "decisions" ? decide : briefing;
  const activeCitations: Citation[] =
    tab === "briefing"
      ? ((briefing.status !== "idle" ? briefing.data.citations : saved?.citations) ?? [])
      : tab === "ask"
        ? (ask.data.citations ?? askHistory[0]?.citations ?? [])
        : tab === "decisions"
          ? (decide.data.citations ?? [])
          : [];
  const activeText = tab === "briefing" ? (briefing.text.briefing ?? saved?.text ?? "") : tab === "ask" ? (ask.text.answer ?? askHistory[0]?.answer ?? "") : tab === "decisions" ? (decide.data.proposals ?? []).map((p: { rationale: string }) => p.rationale).join(" ") : "";

  const onCite = (n: number) => {
    setHighlight(n);
    requestAnimationFrame(() => document.getElementById(`src-${n}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };

  const generate = () => {
    setTab("briefing");
    briefing.start(`${API}/briefing`, { dept });
  };
  const propose = (text?: string) => {
    setTab("decisions");
    decide.start(`${API}/decisions`, text ? { briefing: text } : {});
  };

  const deptLabel = dept === "all" ? "" : L(DEPTS[dept].name);
  const selected = metricById(metricId)!;

  return (
    <SolutionPage
      slug="02-decision-intelligence"
      scenario={SCENARIO}
      actions={
        <StatusPill tone="neutral" dot={false} className="h-7 px-2.5">
          {L({ en: "Week 41 · data to Fri 9 Oct", ar: "الأسبوع 41 · البيانات حتى الجمعة 9 أكتوبر" })}
        </StatusPill>
      }
    >
      {/* review bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="label-caps">{L({ en: "Director-General weekly review", ar: "المراجعة الأسبوعية لسعادة المدير العام" })}</div>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {L({
              en: "Weeks 40–41 · meeting Monday 12 October 2026 · prepared by Dr. Amna Rashid Al Ketbi, Strategy & Performance Office",
              ar: "الأسبوعان 40 و41 · الاجتماع الاثنين 12 أكتوبر 2026 · إعداد د. آمنة راشد الكتبي، مكتب الاستراتيجية والأداء",
            })}
          </p>
        </div>
        <ToggleGroup type="single" size="sm" variant="outline" value={dept} onValueChange={(v) => v && setDept(v as Dept | "all")} className="flex-wrap">
          <ToggleGroupItem value="all" className="px-2.5 text-[12px]">
            {L({ en: "All", ar: "الكل" })}
          </ToggleGroupItem>
          {(Object.keys(DEPTS) as Dept[]).map((d) => (
            <ToggleGroupItem key={d} value={d} className="px-2.5 text-[12px]">
              {L(
                {
                  housing: { en: "Housing", ar: "الإسكان" },
                  permits: { en: "Permits", ar: "الرخص" },
                  chc: { en: "CHC", ar: "إسعاد المتعاملين" },
                  inspection: { en: "Inspection", ar: "التفتيش" },
                  finance: { en: "Finance", ar: "المالية" },
                  facilities: { en: "Facilities", ar: "المرافق" },
                  hr: { en: "HR", ar: "الموارد البشرية" },
                }[d],
              )}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {/* KPI header */}
      <div className={cn("grid gap-3", defs.length >= 8 ? "grid-cols-8 max-2xl:grid-cols-4" : "grid-cols-4", "max-md:grid-cols-2")}>
        {snaps.map((s, i) => (
          <KpiCard
            key={s.def.id}
            s={s}
            index={i}
            active={tab === "trends" && metricId === s.def.id}
            onClick={() => {
              setMetricId(s.def.id);
              setTab("trends");
            }}
          />
        ))}
      </div>

      {/* computed measures */}
      <div className="grid grid-cols-4 gap-3 max-md:grid-cols-2">
        <MetricTile
          label={L({ en: "Briefing preparation", ar: "إعداد الإحاطة" })}
          value={saved?.ms ? <bdi dir="ltr">{`${Math.max(1, Math.round(saved.ms / 1000))} s`}</bdi> : "—"}
          sub={L({ en: "baseline 2.5 days · target 40 min", ar: "خط الأساس 2.5 يوم · المستهدف 40 دقيقة" })}
          tone={saved?.ms ? "ai" : "default"}
        />
        <MetricTile
          label={L({ en: "Figure consistency", ar: "اتساق الأرقام" })}
          value={check?.rate != null ? `${check.rate.toFixed(0)}%` : "—"}
          sub={
            check
              ? L({ en: `${check.discrepancies} discrepancies in updates · target 99%`, ar: `${check.discrepancies} اختلافات في التحديثات · المستهدف 99%` })
              : L({ en: "run the figure check · target 99%", ar: "شغّل فحص الأرقام · المستهدف 99%" })
          }
          tone={check?.rate != null ? (check.rate >= 99 ? "success" : "warning") : "default"}
        />
        <MetricTile
          label={L({ en: "Action closure", ar: "إغلاق الإجراءات" })}
          value={stats.closureRate != null ? `${stats.closureRate.toFixed(0)}%` : "—"}
          sub={L({ en: `${stats.overdue} overdue · target 83%`, ar: `${stats.overdue} متأخرة · المستهدف 83%` })}
          tone={stats.closureRate != null && stats.closureRate >= 83 ? "success" : "warning"}
        />
        <MetricTile
          label={L({ en: "KPIs off target", ar: "مؤشرات خارج المستهدف" })}
          value={<bdi dir="ltr">{`${redCount} / ${withTarget}`}</bdi>}
          sub={L({ en: "week 41, computed from source data", ar: "الأسبوع 41، محسوبة من البيانات المصدرية" })}
          tone={redCount ? "danger" : "success"}
        />
      </div>

      <Workbench cols="290px minmax(0,1fr) 350px" className="items-start">
        {/* scorecard */}
        <Pane title={L({ en: "Scorecard · week 41", ar: "بطاقة الأداء · الأسبوع 41" })} flush className="max-lg:order-2">
          <div className="scrollbar-thin max-h-[860px] overflow-y-auto">
            {(Object.keys(DEPTS) as Dept[])
              .filter((d) => dept === "all" || d === dept)
              .map((d) => (
                <div key={d}>
                  <div className="sticky top-0 z-10 border-b border-border bg-card/95 px-4 py-2 backdrop-blur">
                    <span className="label-caps !text-[9.5px]">{L(DEPTS[d].name)}</span>
                  </div>
                  <ul className="divide-y divide-border">
                    {allWeek
                      .filter((x) => x.def.dept === d)
                      .map(({ def, cur, prev }) => {
                        const delta = cur.value != null && prev.value != null ? cur.value - prev.value : null;
                        return (
                          <li key={def.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setMetricId(def.id);
                                setTab("trends");
                              }}
                              className={cn(
                                "flex w-full items-center gap-2.5 px-4 py-2 text-start transition-colors hover:bg-muted/50",
                                tab === "trends" && metricId === def.id && "bg-muted/70",
                              )}
                            >
                              <RagDot rag={cur.rag} />
                              <span className="min-w-0 flex-1 truncate text-[12.5px]">{L(def.name)}</span>
                              <span className="flex flex-col items-end">
                                <span className="num text-[12.5px] font-medium" dir="ltr">{fmtValue(def, cur.value).replace(" days", " d")}</span>
                                {delta != null && Math.abs(delta) > 1e-9 && (
                                  <span className="num text-[10.5px] text-faint" dir="ltr">{fmtDelta(def, delta)}</span>
                                )}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                  </ul>
                </div>
              ))}
          </div>
        </Pane>

        {/* work area */}
        <Pane flush className="min-h-[640px]">
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="gap-0">
            <div className="scrollbar-thin overflow-x-auto border-b border-border px-3 pt-2">
              <TabsList variant="line" className="h-9 gap-1">
                <TabsTrigger value="briefing" className="text-[12.5px]">
                  <FileText className="size-3.5" />
                  {L({ en: "Review briefing", ar: "إحاطة المراجعة" })}
                </TabsTrigger>
                <TabsTrigger value="check" className="text-[12.5px]">
                  <ClipboardCheck className="size-3.5" />
                  {L({ en: "Figure check", ar: "فحص الأرقام" })}
                </TabsTrigger>
                <TabsTrigger value="ask" className="text-[12.5px]">
                  <MessageSquareText className="size-3.5" />
                  {L({ en: "Ask the data", ar: "اسأل البيانات" })}
                </TabsTrigger>
                <TabsTrigger value="decisions" className="text-[12.5px]">
                  <Gavel className="size-3.5" />
                  {L({ en: "Decisions & actions", ar: "القرارات والإجراءات" })}
                </TabsTrigger>
                <TabsTrigger value="trends" className="text-[12.5px]">
                  <BarChart3 className="size-3.5" />
                  {L({ en: "Trends", ar: "الاتجاهات" })}
                </TabsTrigger>
              </TabsList>
            </div>
            <div className="p-5">
              <TabsContent value="briefing">
                <BriefingTab
                  run={briefing}
                  saved={saved}
                  onGenerate={generate}
                  onPropose={(t) => propose(t)}
                  onCite={onCite}
                  deptLabel={deptLabel}
                  counts={{ facts: counts.facts, updates: counts.updates, overdue: stats.overdue }}
                />
              </TabsContent>
              <TabsContent value="check">
                <FigureTab run={checker} saved={check} onRun={(text) => checker.start(`${API}/figure-check`, text ? { text } : {})} />
              </TabsContent>
              <TabsContent value="ask">
                <AskTab run={ask} currentQ={currentQ} history={askHistory} onCite={onCite} onAsk={askQuestion} />
              </TabsContent>
              <TabsContent value="decisions">
                <ActionsTab run={decide} actions={actions} stats={stats} onPropose={() => propose(saved?.text)} onCite={onCite} refresh={refreshActions} />
              </TabsContent>
              <TabsContent value="trends">
                <TrendsTab ds={dataset} def={selected} />
              </TabsContent>
            </div>
          </Tabs>
        </Pane>

        {/* trace + sources */}
        <div className="flex flex-col gap-4 max-lg:order-3">
          <Pane>
            <AgentTrace
              run={activeRun}
              title={
                tab === "check"
                  ? L({ en: "Figure check pipeline", ar: "مسار فحص الأرقام" })
                  : tab === "ask"
                    ? L({ en: "Query pipeline", ar: "مسار الاستعلام" })
                    : tab === "decisions"
                      ? L({ en: "Decision pipeline", ar: "مسار القرارات" })
                      : L({ en: "Briefing pipeline", ar: "مسار إعداد الإحاطة" })
              }
              emptyHint={
                tab === "trends"
                  ? L({ en: "Trends are computed instantly from the daily facts — no model involved.", ar: "تُحتسب الاتجاهات فوراً من البيانات اليومية — دون استخدام النموذج." })
                  : tab === "briefing" && saved
                    ? L({ en: "Showing the last saved briefing. Regenerate to watch each stage run live: computation, change detection, drafting and figure verification.", ar: "تُعرض آخر إحاطة محفوظة. أعد الإعداد لمتابعة كل مرحلة مباشرة: الاحتساب ورصد التغيرات والصياغة والتحقق من الأرقام." })
                    : L({ en: "Run a step to see each stage: computation, retrieval, drafting and verification.", ar: "شغّل خطوة لرؤية كل مرحلة: الاحتساب والاسترجاع والصياغة والتحقق." })
              }
            />
          </Pane>
          <Pane title={L({ en: "Sources", ar: "المصادر" })} subtitle={activeCitations.length ? L({ en: `${activeCitations.length} numbered sources · cited ones highlighted`, ar: `${activeCitations.length} مصدراً مرقماً · المستشهد بها مميزة` }) : undefined}>
            <div className="scrollbar-thin max-h-[560px] overflow-y-auto pe-1">
              <SourceList citations={activeCitations} highlight={highlight} usedOnly={!!activeText} text={activeText} />
            </div>
          </Pane>
        </div>
      </Workbench>
    </SolutionPage>
  );
}
