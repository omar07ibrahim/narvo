"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Building2, ClipboardList, Layers, MessageSquareWarning, Microscope, Zap } from "lucide-react";
import { SolutionPage } from "@/components/narvo/solution-page";
import { Pane, Workbench } from "@/components/narvo/pane";
import { MetricTile } from "@/components/narvo/metric";
import { AgentTrace } from "@/components/narvo/agent-trace";
import { SourceList } from "@/components/narvo/sources";
import { Markdown } from "@/components/narvo/markdown";
import { RunButton } from "@/components/narvo/run-button";
import { Confidence, StatusPill } from "@/components/narvo/status";
import { ThinkingLines } from "@/components/narvo/empty";
import { DirectionProvider } from "@/components/ui/direction";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useNarvoRun } from "@/hooks/use-narvo-run";
import type { ApprovalSummary, Citation } from "@/lib/ai/events";
import { useL, usePrefs } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { COMFORT, detectAnomalies, occupiedAgc, occupiedHq, zoneCol, type Anomaly, type Complaint, type Job, type Series, type Trip } from "../_lib/signals";
import { PlantChart, SpaceChart, fmtFull } from "./signal-charts";
import { WorkOrders, type Feed, type WO } from "./work-orders";
import { ComplaintsPanel, EnergyPanel, SpacesPanel, TriageCard, type TriageResult } from "./panels";
import { SCENARIO } from "./scenario";
import { textDir } from "./labels";

const API = "/api/solutions/20-facility-intelligence";
type Tab = "signals" | "work" | "complaints" | "spaces" | "energy";

interface SiteMeta {
  id: "AGC" | "HQ";
  name: string;
  nameAr: string;
  district: string;
  districtAr?: string;
  built: number;
  gfa: number;
  contract: string;
  contractor: string;
  contractorAr?: string;
  openingHours: string;
  cooling: string;
  coolingAr?: string;
  zones: Array<{ id: string; name: string; nameAr: string; floor: string; area: number; capacity: number; ahu: string[]; use: string; setpoint: number }>;
  assets: Array<{ id: string; type: string; name: string; location: string; capacityTR?: number; note?: string }>;
}

export interface InitialData {
  series: { AGC: Series; HQ: Series };
  sites: SiteMeta[];
  complaints: Complaint[];
  trips: Trip[];
  jobs: Job[];
  ppm: Array<{ id: string; site: string; asset: string; task: string; taskAr: string; frequency: string; lastDone: string; due: string; status: string; history: Array<{ date: string; event: string }> }>;
  feed: Feed[];
  energy: { tariffAedPerKwh: number; months: Array<{ month: string; y2025: number; y2026: number | null }>; oct2026PartialKwh: number };
  sep25: Array<{ date: string; ambient_mean_c: number; chiller_kwh: number }>;
  workOrders: WO[];
  cleanAt: string;
  pending: Array<{ approval: ApprovalSummary; record: WO }>;
}

const T0 = Date.parse("2026-09-01T00:00:00+04:00");
const T1 = Date.parse("2026-10-09T23:00:00+04:00");
const RANGES: Array<{ key: string; en: string; ar: string; r: [number, number] }> = [
  { key: "all", en: "1 Sep – 9 Oct", ar: "1 سبتمبر – 9 أكتوبر", r: [T0, T1] },
  { key: "s1", en: "1–15 Sep", ar: "1–15 سبتمبر", r: [T0, Date.parse("2026-09-15T23:00:00+04:00")] },
  { key: "s2", en: "16–30 Sep", ar: "16–30 سبتمبر", r: [Date.parse("2026-09-16T00:00:00+04:00"), Date.parse("2026-09-30T23:00:00+04:00")] },
  { key: "oct", en: "1–9 Oct", ar: "1–9 أكتوبر", r: [Date.parse("2026-10-01T00:00:00+04:00"), T1] },
];

/** Day, month and hour in UAE time, in the UI language (e.g. "9 Sep 14:00"). */
const fmtDay = (ms: number, lang: string) => fmtFull(ms, lang);

export function Workspace({ data }: { data: InitialData }) {
  const L = useL();
  const { lang, dir } = usePrefs();
  const [siteId, setSiteId] = useState<"AGC" | "HQ">("AGC");
  const [tab, setTab] = useState<Tab>("signals");
  const [rangeKey, setRangeKey] = useState("all");
  const [custom, setCustom] = useState<[number, number] | null>(null);
  const [workOrders, setWorkOrders] = useState<WO[]>(data.workOrders);
  const [pending, setPending] = useState(data.pending ?? []);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [active, setActive] = useState<"correlate" | "draft" | "verify" | "triage">("correlate");
  const [highlight, setHighlight] = useState<number | null>(null);
  const [saved, setSaved] = useState<{ finding: Finding; text: string; citations: Citation[] } | null>(null);
  const correlate = useNarvoRun();
  const draft = useNarvoRun();
  const verify = useNarvoRun();
  const triage = useNarvoRun();

  const site = data.sites.find((s) => s.id === siteId)!;
  const s = data.series[siteId];
  const range = custom ?? RANGES.find((r) => r.key === rangeKey)!.r;
  const cleanAt = Date.parse(data.cleanAt);
  const anomalies = useMemo(() => detectAnomalies(s, site.zones), [s, site]);

  useEffect(() => {
    fetch(`${API}/correlate`)
      .then((r) => r.json())
      .then((j) => j.result && setSaved(j.result))
      .catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    const r = await fetch(`${API}/work-orders`);
    const j = await r.json();
    setWorkOrders(j.workOrders);
    return j.workOrders as WO[];
  }, []);

  /* KPIs computed from the records */
  const kpi = useMemo(() => {
    const sepStart = T0;
    const sepEnd = Date.parse("2026-10-01T00:00:00+04:00");
    const comp = data.complaints.filter((c) => c.site === siteId);
    const augSep = comp.filter((c) => c.receivedAt >= "2026-08-01" && c.receivedAt < "2026-10-01").length;
    const sep = comp.filter((c) => c.receivedAt.startsWith("2026-09")).length;
    const since = comp.filter((c) => Date.parse(c.receivedAt) >= cleanAt).length;
    const trips = siteId === "AGC" ? data.trips.filter((t) => Date.parse(t.at) < sepEnd).length : 0;
    const occ = siteId === "HQ" ? occupiedHq : occupiedAgc;
    const hoursAbove = site.zones
      .map((z) => ({ z, h: s.t.filter((t, i) => t >= sepStart && t < sepEnd && occ(t) && (s.cols[zoneCol(z.id)]?.[i] ?? 0) > COMFORT.high).length }))
      .sort((a, b) => b.h - a.h);
    const overdue = data.ppm.filter((p) => p.site === siteId && p.status === "Overdue");
    const jobs = data.jobs.filter((j) => j.site === siteId && j.respondedAt);
    const resp = jobs.map((j) => (Date.parse(j.respondedAt!) - Date.parse(j.raisedAt)) / 3600000);
    const meanResp = resp.length ? resp.reduce((a, b) => a + b, 0) / resp.length : null;
    const sep9 = data.energy.months[8];
    return { augSep, sep, since, trips, hoursAbove, overdue, meanResp, energyUp: sep9.y2026 ? sep9.y2026 / sep9.y2025 - 1 : null, jobs: jobs.length };
  }, [data, siteId, site, s, cleanAt]);

  const finding: Finding | undefined = correlate.data.finding ?? (correlate.status === "idle" ? saved?.finding : undefined);
  const explain = correlate.status !== "idle" ? (correlate.text.explain ?? "") : (saved?.text ?? "");
  const citations: Citation[] = (correlate.status !== "idle" ? correlate.data.citations : saved?.citations) ?? [];
  const activeRun = active === "draft" ? draft : active === "verify" ? verify : active === "triage" ? triage : correlate;
  const onCite = (n: number) => {
    setHighlight(n);
    requestAnimationFrame(() => document.getElementById(`src-${n}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };

  const startDraft = (issue?: { text: string; zone?: string; asset?: string; category?: string; priority?: string }, site?: "AGC" | "HQ") => {
    setActive("draft");
    setTab("work");
    if (site && site !== siteId) setSiteId(site);
    draft.start(`${API}/work-order`, { site: site ?? siteId, ...(issue ? { issue } : {}) });
  };

  const anomalyGroups = useMemo(() => {
    const order: Anomaly["kind"][] = ["trip", "shortfall", "near_trip", "zone_hot", "zone_cold"];
    return order
      .map((k) => ({ k, items: anomalies.filter((a) => a.kind === k) }))
      .filter((g) => g.items.length);
  }, [anomalies]);
  const kindLabel: Record<string, { en: string; ar: string }> = {
    trip: { en: "High-pressure trips", ar: "توقفات بسبب الضغط العالي" },
    shortfall: { en: "Cooling shortfall (CHW > 8 °C)", ar: "نقص التبريد (مياه التبريد > 8)" },
    near_trip: { en: "HP unloading near trip", ar: "تخفيض الحمل قرب حد الفصل" },
    zone_hot: { en: "Zones above comfort band", ar: "مساحات فوق نطاق الراحة" },
    zone_cold: { en: "Zones below comfort band", ar: "مساحات تحت نطاق الراحة" },
    pressure_gap: { en: "Pressure gap", ar: "فرق الضغط" },
  };

  return (
    <SolutionPage
      slug="20-facility-intelligence"
      scenario={SCENARIO}
      actions={
        <StatusPill tone="neutral" dot={false} className="h-7 px-2.5">
          {L({ en: "BMS hourly · 1 Sep – 9 Oct 2026", ar: "بيانات المبنى كل ساعة · 1 سبتمبر – 9 أكتوبر 2026" })}
        </StatusPill>
      }
    >
      <DirectionProvider dir={dir}>
      {/* site bar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-border bg-card px-4 py-3">
        <ToggleGroup type="single" size="sm" variant="outline" value={siteId} onValueChange={(v) => v && (setSiteId(v as "AGC" | "HQ"), setCustom(null))}>
          {data.sites.map((x) => (
            <ToggleGroupItem key={x.id} value={x.id} className="px-3 text-[12.5px]">
              <Building2 className="size-3.5" />
              {L({ en: x.name, ar: x.nameAr })}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="min-w-0 text-[12px] text-muted-foreground">
          {L({ en: site.district, ar: site.districtAr ?? site.district })} · <bdi dir="ltr">{site.gfa.toLocaleString("en-US")} m²</bdi> · {L({ en: site.cooling, ar: site.coolingAr ?? site.cooling })}
        </div>
        <div className="ms-auto text-[12px] text-muted-foreground">
          {L({ en: site.contractor, ar: site.contractorAr ?? site.contractor })}
          {site.contract.startsWith("MNDA/") && (
            <>
              {" · "}
              <span className="font-mono text-[11px]">{site.contract.split(" ")[0]}</span>
            </>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
        <MetricTile
          label={L({ en: "Comfort complaints", ar: "شكاوى الراحة" })}
          value={kpi.augSep}
          sub={L({ en: `Aug–Sep · ${kpi.sep} in Sep · ${kpi.since} since 6 Oct`, ar: `أغسطس–سبتمبر · ${kpi.sep} في سبتمبر · ${kpi.since} منذ 6 أكتوبر` })}
          tone={kpi.augSep > 10 ? "danger" : "default"}
        />
        <MetricTile
          label={L({ en: "Chiller trips (Sep)", ar: "توقفات المبردات (سبتمبر)" })}
          value={kpi.trips}
          sub={siteId === "AGC" ? L({ en: "CH-02 · all above 44 °C", ar: "CH-02 · جميعها فوق 44 درجة" }) : L({ en: "N+1 plant, no trips", ar: "محطة احتياطية بلا توقفات" })}
          tone={kpi.trips ? "danger" : "success"}
        />
        <MetricTile
          label={L({ en: "Hours > 24.5 °C · Sep", ar: "ساعات فوق 24.5 °م · سبتمبر" })}
          value={kpi.hoursAbove[0]?.h ?? 0}
          sub={kpi.hoursAbove[0] ? `${L({ en: kpi.hoursAbove[0].z.name, ar: kpi.hoursAbove[0].z.nameAr })}${kpi.hoursAbove[1] ? ` · ${L({ en: kpi.hoursAbove[1].z.name, ar: kpi.hoursAbove[1].z.nameAr })} ${kpi.hoursAbove[1].h}` : ""}` : ""}
          tone={(kpi.hoursAbove[0]?.h ?? 0) > 20 ? "warning" : "default"}
        />
        <MetricTile
          label={L({ en: "Overdue PPM", ar: "صيانة وقائية متأخرة" })}
          value={kpi.overdue.length}
          sub={
            kpi.overdue[0]
              ? L({
                  en: `${kpi.overdue[0].task} · due ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(Date.parse(kpi.overdue[0].due))}`,
                  ar: `${kpi.overdue[0].taskAr} · الاستحقاق ${new Intl.DateTimeFormat("ar-AE-u-nu-latn", { day: "numeric", month: "long" }).format(Date.parse(kpi.overdue[0].due))}`,
                })
              : L({ en: "all on schedule", ar: "جميعها في موعدها" })
          }
          tone={kpi.overdue.length ? "danger" : "success"}
        />
        <MetricTile
          label={L({ en: "Service response", ar: "زمن الاستجابة" })}
          value={<bdi dir="ltr">{kpi.meanResp != null ? `${kpi.meanResp.toFixed(1)} h` : "—"}</bdi>}
          sub={L({ en: `mean of ${kpi.jobs} jobs · target 4 h`, ar: `متوسط ${kpi.jobs} أعمال · المستهدف 4 ساعات` })}
        />
        <MetricTile
          label={L({ en: "Chiller energy (Sep)", ar: "طاقة المبردات (سبتمبر)" })}
          value={siteId === "AGC" && kpi.energyUp != null ? <bdi dir="ltr">{`+${(kpi.energyUp * 100).toFixed(0)}%`}</bdi> : "—"}
          sub={siteId === "AGC" ? L({ en: "vs September 2025", ar: "مقارنة بسبتمبر 2025" }) : L({ en: "metered at building level", ar: "مقاسة على مستوى المبنى" })}
          tone={siteId === "AGC" ? "warning" : "default"}
        />
      </div>

      <Workbench cols="minmax(0,1fr) 400px" className="items-start">
        <Pane flush className="min-h-[760px]">
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="gap-0">
            <div className="scrollbar-thin overflow-x-auto border-b border-border px-3 pt-2">
              <TabsList variant="line" className="h-9 gap-1">
                <TabsTrigger value="signals" className="text-[12.5px]">
                  <Activity className="size-3.5" />
                  {L({ en: "Signals", ar: "الإشارات" })}
                </TabsTrigger>
                <TabsTrigger value="work" className="text-[12.5px]">
                  <ClipboardList className="size-3.5" />
                  {L({ en: "Work orders", ar: "أوامر العمل" })}
                </TabsTrigger>
                <TabsTrigger value="complaints" className="text-[12.5px]">
                  <MessageSquareWarning className="size-3.5" />
                  {L({ en: "Complaints", ar: "الشكاوى" })}
                </TabsTrigger>
                <TabsTrigger value="spaces" className="text-[12.5px]">
                  <Layers className="size-3.5" />
                  {L({ en: "Spaces & assets", ar: "المساحات والأصول" })}
                </TabsTrigger>
                <TabsTrigger value="energy" className="text-[12.5px]" disabled={siteId !== "AGC"}>
                  <Zap className="size-3.5" />
                  {L({ en: "Energy", ar: "الطاقة" })}
                </TabsTrigger>
              </TabsList>
            </div>
            <div className="p-5">
              <TabsContent value="signals">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <ToggleGroup
                    type="single"
                    size="sm"
                    variant="outline"
                    value={custom ? "" : rangeKey}
                    onValueChange={(v) => {
                      if (v) {
                        setRangeKey(v);
                        setCustom(null);
                      }
                    }}
                  >
                    {RANGES.map((r) => (
                      <ToggleGroupItem key={r.key} value={r.key} className="px-2.5 text-[12px]">
                        {L(r)}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  {!custom && range[1] - range[0] > 16 * 86400000 && (
                    <span className="text-[11px] text-faint">
                      {L({ en: "Daily peaks — pick a fortnight or an anomaly for hourly detail", ar: "القيم القصوى اليومية — اختر نصف شهر أو حالة شاذة لعرض البيانات كل ساعة" })}
                    </span>
                  )}
                  {custom && (
                    <StatusPill tone="ai" dot={false}>
                      <bdi dir="ltr">
                        {fmtDay(custom[0], lang)} → {fmtDay(custom[1], lang)}
                      </bdi>
                    </StatusPill>
                  )}
                </div>
                <div className="label-caps mb-1">{siteId === "AGC" ? L({ en: "Chiller plant — discharge pressure and ambient", ar: "محطة التبريد — ضغط التصريف والحرارة الخارجية" }) : L({ en: "Chiller plant — power and ambient", ar: "محطة التبريد — القدرة والحرارة الخارجية" })}</div>
                <PlantChart s={s} range={range} trips={siteId === "AGC" ? data.trips : []} cleanAt={cleanAt} />

                <div className="label-caps mt-5 mb-1">{L({ en: "Spaces — zone temperatures, comfort band 22.5–24.5 °C, complaints (○)", ar: "المساحات — درجات الحرارة ونطاق الراحة 22.5–24.5 والشكاوى (○)" })}</div>
                <SpaceChart s={s} range={range} zones={site.zones} complaints={data.complaints} />
                <div className="mt-6">
                  <div className="label-caps mb-2">{L({ en: "Anomalies detected in code", ar: "الحالات الشاذة المكتشفة برمجياً" })}</div>
                  <div className="grid grid-cols-2 gap-3 max-xl:grid-cols-1">
                    {anomalyGroups.map((g) => (
                      <div key={g.k} className="rounded-md border border-border">
                        <div className="flex items-center justify-between border-b border-border px-3 py-2">
                          <span className="text-[12.5px] font-medium">{L(kindLabel[g.k])}</span>
                          <span className="num text-[12px] text-muted-foreground">{g.items.length}</span>
                        </div>
                        <ul className="scrollbar-thin max-h-44 divide-y divide-border overflow-y-auto">
                          {g.items.slice(0, 40).map((a) => (
                            <li key={a.id}>
                              <button
                                type="button"
                                onClick={() => setCustom([a.start - 30 * 3600000, a.end + 30 * 3600000])}
                                className="flex w-full items-baseline justify-between gap-2 px-3 py-1.5 text-start text-[11.5px] hover:bg-muted/50"
                              >
                                <span className="min-w-0 truncate">{lang === "ar" ? a.label_ar : a.label}</span>
                                <span className={cn("num shrink-0 text-muted-foreground", a.severity === "high" && "text-danger")}>{fmtDay(a.start, lang)}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                    {!anomalyGroups.length && <p className="text-[12px] text-muted-foreground">{L({ en: "No anomalies in this period.", ar: "لا توجد حالات شاذة في هذه الفترة." })}</p>}
                  </div>
                  <p className="mt-2 text-[11px] text-faint">
                    {L({
                      en: "Rules: trips from the chiller alarm point; HP unloading ≥ 1,700 kPa; CHW supply > 8 °C; occupied-hour zone temperatures outside 22.5–24.5 °C (Schedule 4). Click an item to zoom the charts.",
                      ar: "القواعد: التوقف من نقطة إنذار المبرد؛ تخفيض الحمل ≥ 1,700 kPa؛ مياه التبريد > 8 درجات؛ حرارة المساحات خارج 22.5–24.5 خلال ساعات التشغيل (الجدول 4). انقر على عنصر لتكبير الرسوم.",
                    })}
                  </p>
                </div>
              </TabsContent>
              <TabsContent value="work">
                <WorkOrders
                  site={siteId}
                  workOrders={workOrders}
                  pending={pending.filter((p) => p.record.site === siteId)}
                  onPendingDecided={(id) => setPending((x) => x.filter((p) => p.approval.id !== id))}
                  jobs={data.jobs}
                  feed={data.feed}
                  draftRun={draft}
                  verifyRun={verify}
                  verifyingId={verifyingId}
                  onDraft={() => startDraft()}
                  onRefresh={refresh}
                  onVerify={async (id) => {
                    setVerifyingId(id);
                    setActive("verify");
                    await verify.start(`${API}/verify`, { woId: id });
                    await refresh();
                  }}
                />
              </TabsContent>
              <TabsContent value="complaints">
                <ComplaintsPanel s={s} complaints={data.complaints} trips={siteId === "AGC" ? data.trips : []} zones={site.zones} />
              </TabsContent>
              <TabsContent value="spaces">
                <SpacesPanel s={s} site={site} ppm={data.ppm} />
              </TabsContent>
              <TabsContent value="energy">
                {siteId === "AGC" && <EnergyPanel s={s} energy={data.energy} sep25={data.sep25} cleanAt={data.cleanAt} />}
              </TabsContent>
            </div>
          </Tabs>
        </Pane>

        <div className="flex flex-col gap-4">
          <Pane
            title={L({ en: "Connect the issue", ar: "ربط المشكلة" })}
            actions={
              siteId === "AGC" ? (
                <RunButton
                  running={correlate.running}
                  onRun={() => {
                    setActive("correlate");
                    correlate.start(`${API}/correlate`, {});
                  }}
                  onStop={correlate.abort}
                  size="sm"
                  icon={<Microscope />}
                >
                  {explain ? L({ en: "Re-run", ar: "إعادة" }) : L({ en: "Correlate & explain", ar: "اربط وفسّر" })}
                </RunButton>
              ) : undefined
            }
          >
            {siteId === "HQ" ? (
              <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                {L({
                  en: "No recurring issue at MNDA Tower: the Level 14 north complaints (13–17 Sep) matched a failed VAV actuator, replaced on 17 Sep; the 22 Sep supply-temperature blip was the planned CH-T2 service changeover.",
                  ar: "لا توجد مشكلة متكررة في برج الهيئة: شكاوى الطابق 14 (13–17 سبتمبر) ارتبطت بعطل محرك صندوق VAV استُبدل في 17 سبتمبر، وارتفاع حرارة المياه في 22 سبتمبر كان أثناء الصيانة المخططة للمبرد CH-T2.",
                })}
              </p>
            ) : (
              <>
                {!finding && !correlate.running && correlate.status !== "error" && (
                  <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                    {L({
                      en: "The model receives the computed correlations — trips vs ambient, condenser approach, shortfall hours, complaint timing, PPM and contract terms — and explains the recurring issue with a confidence level.",
                      ar: "يتلقى النموذج الارتباطات المحسوبة — التوقفات مقابل الحرارة، وفرق حرارة المكثف، وساعات نقص التبريد، وتوقيت الشكاوى، والصيانة وشروط العقد — ويفسر المشكلة المتكررة مع درجة الثقة.",
                    })}
                  </p>
                )}
                {correlate.running && !finding && <ThinkingLines lines={5} />}
                {finding && (
                  <div className="mb-3 rounded-md border border-ai/25 bg-ai-soft/50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="label-caps !text-[9.5px]">{L({ en: "Root cause", ar: "السبب الجذري" })}</span>
                      <Confidence value={finding.confidence} />
                    </div>
                    <p className="mt-1.5 text-[13px] leading-snug font-medium" dir="auto">
                      {finding.rootCause}
                    </p>
                    <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground" dir="auto">
                      {finding.mechanism}
                    </p>
                    {finding.nextStep && (
                      <p className="mt-2 text-[12px]" dir="auto">
                        <span className="label-caps me-1 !text-[9.5px]">{L({ en: "Next", ar: "التالي" })}</span>
                        {finding.nextStep}
                      </p>
                    )}
                    <div className="mt-2.5">
                      <RunButton running={draft.running} onRun={() => startDraft()} size="sm" icon={<ClipboardList />}>
                        {L({ en: "Prepare the response", ar: "إعداد الاستجابة" })}
                      </RunButton>
                    </div>
                  </div>
                )}
                {explain && (
                  <div className="scrollbar-thin max-h-[520px] overflow-y-auto pe-1" dir={textDir(explain)}>
                    <Markdown citations={citations} onCite={onCite} streaming={correlate.running} className="text-[13px] [&_h2]:!mt-4 [&_h2]:!mb-1.5 [&_h2]:!text-[10.5px] [&_h2]:!font-medium [&_h2]:tracking-[0.16em] [&_h2]:!text-muted-foreground [&_h2]:uppercase [&_h2:first-child]:!mt-0">
                      {explain.replace(/\[(\d+(?:\s*,\s*\d+)+)\]/g, (_, g2: string) => g2.split(/\s*,\s*/).map((n) => `[${n}]`).join("")).replace(/\]\s*,\s*\[/g, "][")}
                    </Markdown>
                  </div>
                )}
                {correlate.status === "error" && <div className="rounded-md border border-danger/25 bg-danger-soft p-3 text-[12.5px] text-danger">{correlate.error}</div>}
              </>
            )}
          </Pane>
          <Pane>
            <AgentTrace
              run={activeRun}
              title={
                active === "draft"
                  ? L({ en: "Work-order agent", ar: "وكيل أوامر العمل" })
                  : active === "verify"
                    ? L({ en: "Verification", ar: "التحقق" })
                    : active === "triage"
                      ? L({ en: "Triage", ar: "الفرز" })
                      : L({ en: "Correlation pipeline", ar: "مسار الربط" })
              }
              emptyHint={L({ en: "Anomaly detection and correlations are computed in code; the model explains, drafts and verifies.", ar: "يتم رصد الحالات الشاذة والارتباطات برمجياً، ويقوم النموذج بالتفسير والصياغة والتحقق." })}
            />
          </Pane>
          {siteId === "AGC" && (
            <Pane title={L({ en: "Evidence", ar: "الأدلة" })}>
              <div className="scrollbar-thin max-h-[420px] overflow-y-auto pe-1">
                <SourceList citations={citations} highlight={highlight} usedOnly={!!explain} text={explain} />
              </div>
            </Pane>
          )}
          <Pane title={L({ en: "Report an issue", ar: "أبلغ عن مشكلة" })} subtitle={L({ en: "Bring your own complaint or photo", ar: "أدخل شكوى أو صورة" })}>
            <TriageCard
              run={triage}
              site={siteId}
              onTriage={(text, image) => {
                setActive("triage");
                triage.start(`${API}/triage`, { text, image, site: siteId });
              }}
              onWorkOrder={(t: TriageResult, text: string) =>
                startDraft({ text: `${text}\n\nTriage: ${t.category}, ${t.priority} — ${t.observation} Likely cause: ${t.likelyCause}`, zone: t.zone, asset: t.asset, category: t.category, priority: t.priority }, t.site === "HQ" ? "HQ" : "AGC")
              }
            />
          </Pane>
        </div>
      </Workbench>
      </DirectionProvider>
    </SolutionPage>
  );
}

interface Finding {
  rootCause: string;
  mechanism: string;
  confidence: number;
  contributing: string[];
  ruledOut: string[];
  assets: string[];
  zones: string[];
  nextStep: string;
}
