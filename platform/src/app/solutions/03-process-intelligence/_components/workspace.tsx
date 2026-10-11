"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, FlaskConical, GitBranch, Microscope, Network, RotateCcw, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";
import { SolutionPage } from "@/components/narvo/solution-page";
import { Pane, Workbench } from "@/components/narvo/pane";
import { MetricTile } from "@/components/narvo/metric";
import { AgentTrace } from "@/components/narvo/agent-trace";
import { SourceList } from "@/components/narvo/sources";
import { Markdown } from "@/components/narvo/markdown";
import { RunButton } from "@/components/narvo/run-button";
import { FileDrop } from "@/components/narvo/file-drop";
import { EmptyState, ThinkingLines } from "@/components/narvo/empty";
import { StatusPill } from "@/components/narvo/status";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNarvoRun } from "@/hooks/use-narvo-run";
import type { Citation } from "@/lib/ai/events";
import { useL, usePrefs } from "@/lib/i18n";
import {
  applyFilters,
  buildLog,
  computeDfg,
  computeStats,
  computeVariants,
  expand,
  fmt0,
  fmt1,
  reasonFamily,
  rolesOf,
  type CompactLog,
  type Filters,
  type Interventions,
  type PCase,
  type PLog,
} from "../_lib/mining";
import { ProcessMap } from "./process-map";
import { Performance, VariantsTable } from "./performance";
import { Simulation } from "./simulation";
import { Measure, type ChangeRow } from "./measure";
import { COHORTS, DISTRICTS, activityLabel, developerLabel } from "./labels";
import { SCENARIO } from "./scenario";

const API = "/api/solutions/03-process-intelligence";
type Tab = "map" | "variants" | "performance" | "simulate" | "measure";

function q3Throughput(log: PLog, cases: PCase[]) {
  const roles = rolesOf(log);
  const a = Date.parse("2026-07-01T00:00:00+04:00") / 60000;
  const b = Date.parse("2026-10-01T00:00:00+04:00") / 60000;
  return cases.filter((c) => {
    const l = c.ev[c.ev.length - 1];
    return l?.a === roles.end && l.t >= a && l.t < b;
  }).length / 3;
}

/** Statistics of an uploaded log, written as plain sentences for the model (computed here, in the browser). */
function byoFacts(log: PLog, cases: PCase[]): string[] {
  const st = computeStats(log, cases);
  const dfg = computeDfg(log, cases);
  const vars = computeVariants(log, cases);
  const A = log.activities;
  const waits = [...dfg.edges].filter((e) => e.count >= Math.max(3, cases.length * 0.05)).sort((a, b) => b.meanDays - a.meanDays).slice(0, 6);
  const facts = [
    `${log.name}: ${fmt0(st.cases)} cases, ${fmt0(st.events)} events, ${A.length} activities. ${fmt0(st.completed)} cases reached "${A[rolesOf(log).end]}"; median end-to-end time ${fmt1(st.cycleMedian)} days, mean ${fmt1(st.cycleMean)} days, 90th percentile ${fmt1(st.cycleP90)} days.`,
    `Rework: ${fmt0(st.reworkCases)} cases (${fmt1(st.reworkPct)}%) contain a return / query or a repeated activity; ${fmt0(st.returnEvents)} return or query events.`,
    st.reasons.length ? `Reasons recorded on return / query events: ${st.reasons.map((r) => `${r.label} ${r.count} (${fmt1(r.pct, 0)}%)`).join("; ")}.` : "",
    `Longest average waits between consecutive activities: ${waits.map((e) => `${A[e.from]} → ${A[e.to]} mean ${fmt1(e.meanDays)} days (n = ${e.count})`).join("; ")}.`,
    `${vars.length} variants. Most common: ${vars
      .slice(0, 4)
      .map((v) => `${v.steps.map((s) => A[s]).join(" → ")} — ${v.count} cases (${fmt1(v.share)}%), median ${fmt1(v.medianDays)} days`)
      .join(" | ")}.`,
  ];
  // attribute concentration of rework (first two categorical attributes)
  const roles = rolesOf(log);
  for (const key of log.attrKeys.slice(0, 3)) {
    const idx = log.attrKeys.indexOf(key);
    const m = new Map<string, { n: number; rw: number }>();
    for (const c of cases) {
      const v = c.v[idx] || "—";
      const x = m.get(v) ?? { n: 0, rw: 0 };
      x.n++;
      if (c.ev.some((e) => roles.returns.includes(e.a))) x.rw++;
      m.set(v, x);
    }
    if (m.size < 2 || m.size > 25) continue;
    const top = [...m.entries()].filter(([, x]) => x.n >= 5).sort((a, b) => b[1].rw / b[1].n - a[1].rw / a[1].n).slice(0, 4);
    facts.push(`Rework rate by ${key}: ${top.map(([k, x]) => `${k} ${fmt1((x.rw / x.n) * 100)}% of ${x.n}`).join("; ")}.`);
  }
  return facts.filter(Boolean);
}

export function Workspace({ initialLog, initialChanges }: { initialLog: CompactLog; initialChanges: ChangeRow[] }) {
  const L = useL();
  const { lang } = usePrefs();
  const mndaLog = useMemo(() => expand(initialLog), [initialLog]);
  const [byo, setByo] = useState<PLog | null>(null);
  const log = byo ?? mndaLog;
  const [filters, setFilters] = useState<Filters>({ cohort: "Q3 2026", gated: "all", district: "all", month: "all" });
  const [tab, setTab] = useState<Tab>("map");
  const [changes, setChanges] = useState<ChangeRow[]>(initialChanges);
  const [highlight, setHighlight] = useState<number | null>(null);
  const [savedRca, setSavedRca] = useState<{ text: string; citations: Citation[]; label: string } | null>(null);
  const rca = useNarvoRun();
  const memoRun = useNarvoRun();

  useEffect(() => {
    fetch(`${API}/rca`)
      .then((r) => r.json())
      .then((j) => j.rca && setSavedRca(j.rca))
      .catch(() => {});
  }, []);

  const cases = useMemo(() => (byo ? byo.cases : applyFilters(log, filters)), [byo, log, filters]);
  const st = useMemo(() => computeStats(log, cases), [log, cases]);
  const thr = useMemo(() => q3Throughput(log, byo ? log.cases : applyFilters(log, { ...filters, cohort: "all" })), [log, byo, filters]);
  const famNoc = useMemo(() => {
    const tot = st.reasons.reduce((a, r) => a + r.count, 0);
    const noc = st.reasons.filter((r) => reasonFamily(r.label) === "NOC missing or expired").reduce((a, r) => a + r.count, 0);
    return tot ? (noc / tot) * 100 : null;
  }, [st]);
  const months = useMemo(() => {
    const s = new Set<string>();
    for (const c of mndaLog.cases) s.add(new Date(c.ev[0].t * 60000 + 4 * 3600000).toISOString().slice(0, 7));
    return [...s].sort();
  }, [mndaLog]);

  const refreshChanges = useCallback(async () => {
    const r = await fetch(`${API}/changes`);
    const j = await r.json();
    setChanges(j.changes);
  }, []);

  const runRca = () => {
    if (byo) rca.start(`${API}/rca`, { byo: { name: byo.name, facts: byoFacts(byo, byo.cases) } });
    else rca.start(`${API}/rca`, { filters });
  };
  const onCite = (n: number) => {
    setHighlight(n);
    requestAnimationFrame(() => document.getElementById(`src-${n}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };

  async function loadFile(text: string, name: string) {
    const r = buildLog(text, name, "byo");
    if ("error" in r) {
      toast.error(r.error);
      return;
    }
    setByo(r.log);
    rca.reset();
    setTab("map");
    toast.success(L({ en: `Loaded ${r.log.cases.length} cases from ${name}`, ar: `تم تحميل ${r.log.cases.length} حالة من ${name}` }), {
      description: r.skipped ? L({ en: `${r.skipped} rows skipped (missing case, activity or time)`, ar: `تم تجاهل ${r.skipped} صفوف ناقصة` }) : undefined,
    });
  }
  async function loadSample() {
    const res = await fetch("/demo/03-process-intelligence/sample-invoice-log.csv");
    await loadFile(await res.text(), L({ en: "MNDA Finance — supplier invoices, Aug–Sep 2026", ar: "المالية — فواتير الموردين، أغسطس–سبتمبر 2026" }));
  }

  const rcaText = rca.status !== "idle" ? (rca.text.rca ?? "") : !byo ? (savedRca?.text ?? "") : "";
  const rcaCites: Citation[] = (rca.status !== "idle" ? rca.data.citations : !byo ? savedRca?.citations : undefined) ?? [];
  const isMnda = !byo;

  return (
    <SolutionPage
      slug="03-process-intelligence"
      scenario={SCENARIO}
      actions={
        <StatusPill tone="neutral" dot={false} className="h-7 px-2.5">
          {isMnda ? L({ en: "Permits event log · Jun–9 Oct 2026", ar: "سجل أحداث الرخص · يونيو–9 أكتوبر 2026" }) : L({ en: "Your event log", ar: "سجل الأحداث الخاص بك" })}
        </StatusPill>
      }
    >
      {/* filter bar */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-3 rounded-lg border border-border bg-card px-4 py-2.5">
        {isMnda ? (
          <>
            <div className="flex items-center gap-2">
              <span className="label-caps max-2xl:hidden">{L({ en: "Cohort", ar: "المجموعة" })}</span>
              <Select value={filters.cohort} onValueChange={(v) => setFilters((f) => ({ ...f, cohort: v }))}>
                <SelectTrigger size="sm" className="h-8 min-w-44 text-[12.5px] max-2xl:min-w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COHORTS.map((c) => (
                    <SelectItem key={c.value} value={c.value} className="text-[12.5px]">
                      {L(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ToggleGroup type="single" size="sm" variant="outline" value={filters.gated} onValueChange={(v) => v && setFilters((f) => ({ ...f, gated: v as Filters["gated"] }))}>
              <ToggleGroupItem value="all" className="px-2.5 text-[12px]">
                {L({ en: "All districts", ar: "كل المناطق" })}
              </ToggleGroupItem>
              <ToggleGroupItem value="yes" className="px-2.5 text-[12px]">
                {L({ en: "Gated", ar: "مسوّرة" })}
              </ToggleGroupItem>
              <ToggleGroupItem value="no" className="px-2.5 text-[12px]">
                {L({ en: "Non-gated", ar: "غير مسوّرة" })}
              </ToggleGroupItem>
            </ToggleGroup>
            <Select value={filters.district} onValueChange={(v) => setFilters((f) => ({ ...f, district: v }))}>
              <SelectTrigger size="sm" className="h-8 min-w-36 text-[12.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-[12.5px]">
                  {L({ en: "Any district", ar: "أي منطقة" })}
                </SelectItem>
                {Object.entries(DISTRICTS).map(([k, v]) => (
                  <SelectItem key={k} value={k} className="text-[12.5px]">
                    {k} · {L(v)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filters.month} onValueChange={(v) => setFilters((f) => ({ ...f, month: v }))}>
              <SelectTrigger size="sm" className="h-8 min-w-32 text-[12.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-[12.5px]">
                  {L({ en: "Any month", ar: "أي شهر" })}
                </SelectItem>
                {months.map((m) => (
                  <SelectItem key={m} value={m} className="text-[12.5px]">
                    {L({ en: "Submitted", ar: "قُدّمت" })} {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(filters.gated !== "all" || filters.district !== "all" || filters.month !== "all" || filters.cohort !== "Q3 2026") && (
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setFilters({ cohort: "Q3 2026", gated: "all", district: "all", month: "all" })}>
                <RotateCcw />
                {L({ en: "Reset filters", ar: "إعادة الضبط" })}
              </Button>
            )}
          </>
        ) : (
          <div className="flex min-w-0 items-center gap-3">
            <StatusPill tone="ai">
              <Upload className="size-3" />
              {L({ en: "Uploaded log", ar: "سجل مرفوع" })}
            </StatusPill>
            <span className="truncate text-[13px] font-medium">{byo.name}</span>
            <span className="text-[12px] text-muted-foreground">
              {fmt0(byo.cases.length)} {L({ en: "cases", ar: "حالة" })} · {byo.activities.length} {L({ en: "activities", ar: "أنشطة" })}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setByo(null);
                rca.reset();
              }}
            >
              {L({ en: "Back to permits", ar: "العودة إلى الرخص" })}
            </Button>
          </div>
        )}
        <div className="ms-auto flex items-center gap-2">
          <FileDrop
            compact
            accept=".csv,.txt"
            className="w-[250px] max-2xl:w-[224px]"
            label={L({ en: "Bring your own event log", ar: "استخدم سجل أحداثك" })}
            hint={L({ en: "CSV with case id, activity, timestamp", ar: "CSV برقم الحالة والنشاط والوقت" })}
            onFiles={(fs) => fs[0]?.text && loadFile(fs[0].text, fs[0].name)}
          />
          {isMnda && (
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={loadSample}>
              {L({ en: "Try a sample", ar: "جرّب مثالاً" })}
            </Button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-6 gap-3 max-xl:grid-cols-3 max-md:grid-cols-2">
        <MetricTile label={L({ en: isMnda ? "Applications" : "Cases", ar: isMnda ? "الطلبات" : "الحالات" })} value={fmt0(st.cases)} sub={L({ en: `${fmt0(st.completed)} completed · ${fmt0(st.open)} open`, ar: `${fmt0(st.completed)} منجزة · ${fmt0(st.open)} مفتوحة` })} />
        <MetricTile
          label={L({ en: "Median cycle time", ar: "وسيط زمن الدورة" })}
          value={<span dir="auto">{L({ en: `${fmt1(st.cycleMedian)} d`, ar: `${fmt1(st.cycleMedian)} يوم` })}</span>}
          sub={isMnda ? L({ en: "target 15 d · pilot 13 d", ar: "المستهدف 15 يوماً · التجربة 13 يوماً" }) : L({ en: `P90 ${fmt1(st.cycleP90)} d`, ar: `المئين 90: ${fmt1(st.cycleP90)} يوم` })}
          tone={isMnda && st.cycleMedian != null && st.cycleMedian > 15 ? "danger" : "default"}
        />
        {isMnda ? (
          <MetricTile
            label={L({ en: "Gated / non-gated", ar: "مسوّرة / غير مسوّرة" })}
            value={<span dir={lang === "ar" ? "rtl" : "ltr"}>{`${fmt1(st.gatedMedian)} / ${fmt1(st.nonGatedMedian)}`}</span>}
            sub={L({ en: "median days", ar: "الوسيط بالأيام" })}
          />
        ) : (
          <MetricTile label={L({ en: "Events", ar: "الأحداث" })} value={fmt0(st.events)} sub={L({ en: `${log.activities.length} activities`, ar: `${log.activities.length} أنشطة` })} />
        )}
        <MetricTile
          label={L({ en: "Rework", ar: "إعادة العمل" })}
          value={<bdi dir="ltr">{`${fmt1(st.reworkPct)}%`}</bdi>}
          sub={isMnda ? L({ en: `NOC ${fmt1(famNoc, 0)}% of returns · target 11%`, ar: `الشهادة ${fmt1(famNoc, 0)}% من الإعادات · المستهدف 11%` }) : L({ en: `${fmt0(st.returnEvents)} returns / queries`, ar: `${fmt0(st.returnEvents)} إعادة / استفسار` })}
          tone={st.reworkPct != null && st.reworkPct > 15 ? "warning" : "default"}
        />
        {isMnda ? (
          <MetricTile
            label={L({ en: "NOC hold (mean)", ar: "انتظار الشهادة (متوسط)" })}
            value={<span dir="auto">{L({ en: `${fmt1(st.holdMean)} d`, ar: `${fmt1(st.holdMean)} يوم` })}</span>}
            sub={st.byDeveloper[0] ? `${developerLabel(st.byDeveloper[0].name, lang, true)} ${fmt1(st.byDeveloper[0].mean)} ${lang === "ar" ? "يوم" : "d"}` : "—"}
          />
        ) : (
          <MetricTile label={L({ en: "Variants", ar: "المسارات" })} value={fmt0(computeVariants(log, cases).length)} />
        )}
        <MetricTile
          label={L({ en: isMnda ? "Issued per month" : "Completed / month", ar: isMnda ? "الرخص الصادرة شهرياً" : "المنجز شهرياً" })}
          value={fmt0(isMnda ? thr : st.issuedPerMonth)}
          sub={isMnda ? L({ en: "Jul–Sep 2026 · target 455", ar: "يوليو–سبتمبر 2026 · المستهدف 455" }) : undefined}
        />
      </div>

      <Workbench cols="minmax(0,1fr) 400px" className="items-start">
        <Pane flush className="min-h-[760px]">
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="gap-0">
            <div className="scrollbar-thin overflow-x-auto border-b border-border px-3 pt-2">
              <TabsList variant="line" className="h-9 gap-1">
                <TabsTrigger value="map" className="text-[12.5px]">
                  <Network className="size-3.5" />
                  {L({ en: "Process map", ar: "خريطة العملية" })}
                </TabsTrigger>
                <TabsTrigger value="variants" className="text-[12.5px]">
                  <GitBranch className="size-3.5" />
                  {L({ en: "Variants", ar: "المسارات" })}
                </TabsTrigger>
                <TabsTrigger value="performance" className="text-[12.5px]">
                  <Activity className="size-3.5" />
                  {L({ en: "Performance", ar: "الأداء" })}
                </TabsTrigger>
                <TabsTrigger value="simulate" className="text-[12.5px]" disabled={!isMnda}>
                  <Sparkles className="size-3.5" />
                  {L({ en: "Simulate & improve", ar: "المحاكاة والتحسين" })}
                </TabsTrigger>
                <TabsTrigger value="measure" className="text-[12.5px]" disabled={!isMnda}>
                  <FlaskConical className="size-3.5" />
                  {L({ en: "Measure the change", ar: "قياس التغيير" })}
                </TabsTrigger>
              </TabsList>
            </div>
            <div className="p-5">
              {cases.length === 0 ? (
                <EmptyState title={L({ en: "No cases match these filters", ar: "لا توجد حالات مطابقة" })}>{L({ en: "Widen the cohort, district or month.", ar: "وسّع نطاق المجموعة أو المنطقة أو الشهر." })}</EmptyState>
              ) : (
                <>
                  <TabsContent value="map">
                    <ProcessMap log={log} cases={cases} lang={lang} />
                  </TabsContent>
                  <TabsContent value="variants">
                    <VariantsTable log={log} cases={cases} lang={lang} />
                  </TabsContent>
                  <TabsContent value="performance">
                    <Performance log={log} cases={cases} lang={lang} />
                  </TabsContent>
                  {isMnda && (
                    <>
                      <TabsContent value="simulate">
                        <Simulation
                          log={log}
                          cases={cases}
                          throughput={thr}
                          memoRun={memoRun}
                          onDraft={(iv: Interventions) => memoRun.start(`${API}/memo`, { interventions: iv, filters: { cohort: filters.cohort } })}
                          onChangeLogged={() => {
                            refreshChanges();
                            toast.success(L({ en: "Change logged — see Measure the change", ar: "سُجّل التغيير — راجع قياس التغيير" }));
                          }}
                        />
                      </TabsContent>
                      <TabsContent value="measure">
                        <Measure log={log} changes={changes} />
                      </TabsContent>
                    </>
                  )}
                </>
              )}
            </div>
          </Tabs>
        </Pane>

        <div className="flex flex-col gap-4">
          <Pane
            title={L({ en: "Root-cause analysis", ar: "تحليل الأسباب الجذرية" })}
            actions={
              <RunButton running={rca.running} onRun={runRca} onStop={rca.abort} size="sm" icon={<Microscope />} disabled={!cases.length}>
                {rcaText ? L({ en: "Re-run", ar: "إعادة" }) : L({ en: "Explain the delays", ar: "فسّر التأخير" })}
              </RunButton>
            }
          >
            {!rcaText && !rca.running && rca.status !== "error" && (
              <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                {isMnda
                  ? L({
                      en: "The model receives the statistics computed for the current selection and a balanced sample of officer case notes (Arabic and English), and explains the causes of delay and rework — each with figures and quotes.",
                      ar: "يتلقى النموذج الإحصاءات المحسوبة للاختيار الحالي وعينة متوازنة من ملاحظات الموظفين (بالعربية والإنجليزية)، ويشرح أسباب التأخير وإعادة العمل مع الأرقام والاقتباسات.",
                    })
                  : L({ en: "The model explains the delays in your log from statistics computed in your browser.", ar: "يشرح النموذج التأخير في سجلك من إحصاءات محسوبة في متصفحك." })}
              </p>
            )}
            {rca.running && !rcaText && <ThinkingLines lines={7} />}
            {rcaText && (
              <div className="scrollbar-thin max-h-[640px] overflow-y-auto pe-1">
                {!rca.running && rca.status === "idle" && savedRca && (
                  <p className="mb-2 text-[11px] text-faint">
                    {L({ en: "Last analysis", ar: "آخر تحليل" })} · {savedRca.label}
                  </p>
                )}
                <Markdown citations={rcaCites} onCite={onCite} streaming={rca.running} className="text-[13px] [&_h2]:mt-4 [&_h2]:text-[10.5px] [&_h2]:font-medium [&_h2]:tracking-[0.16em] [&_h2]:text-muted-foreground [&_h2]:uppercase [&_h2:first-child]:mt-0">
                  {rcaText.replace(/\[(\d+(?:\s*,\s*\d+)+)\]/g, (_, g: string) => g.split(/\s*,\s*/).map((n) => `[${n}]`).join(""))}
                </Markdown>
              </div>
            )}
            {rca.status === "error" && <div className="rounded-md border border-danger/25 bg-danger-soft p-3 text-[12.5px] text-danger">{rca.error}</div>}
          </Pane>
          <Pane>
            <AgentTrace
              run={tab === "simulate" && memoRun.status !== "idle" ? memoRun : rca}
              title={tab === "simulate" && memoRun.status !== "idle" ? L({ en: "Change memo pipeline", ar: "مسار مذكرة التغيير" }) : L({ en: "Analysis pipeline", ar: "مسار التحليل" })}
              emptyHint={L({ en: "Process discovery, variants, statistics and simulation are computed instantly in code; the model is used to explain and to draft.", ar: "يتم احتساب اكتشاف العملية والمسارات والإحصاءات والمحاكاة فوراً برمجياً، ويُستخدم النموذج للتفسير والصياغة." })}
            />
          </Pane>
          <Pane title={L({ en: "Evidence", ar: "الأدلة" })} subtitle={rcaCites.length ? L({ en: "computed statistics and officer notes", ar: "إحصاءات محسوبة وملاحظات الموظفين" }) : undefined}>
            <div className="scrollbar-thin max-h-[520px] overflow-y-auto pe-1">
              <SourceList citations={tab === "simulate" && memoRun.data.citations ? memoRun.data.citations : rcaCites} highlight={highlight} usedOnly text={tab === "simulate" && memoRun.text.memo ? memoRun.text.memo : rcaText} />
            </div>
          </Pane>
          {isMnda && (
            <p className="px-1 text-[11px] leading-relaxed text-faint">
              {L({ en: "Activities:", ar: "الأنشطة:" })} {mndaLog.activities.map((a) => activityLabel(a, lang)).join(" · ")}
            </p>
          )}
        </div>
      </Workbench>
    </SolutionPage>
  );
}
