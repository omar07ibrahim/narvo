"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useNarvoRun } from "@/hooks/use-narvo-run";
import { SolutionPage } from "@/components/narvo/solution-page";
import { Pane } from "@/components/narvo/pane";
import { MetricTile } from "@/components/narvo/metric";
import { StatusPill } from "@/components/narvo/status";
import { DirectionProvider } from "@/components/ui/direction";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFormat, useL, usePrefs } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { ApprovalSummary } from "@/lib/ai/events";
import { computeKpis, partAvailability } from "../_lib/rules";
import type { Asset, BmsLog, HistoryEntry, Inventory, Job, JobStatus, Site, Technician } from "../_lib/types";
import { AssetView } from "./asset-view";
import { BriefView, type BriefData } from "./brief-view";
import { Phone } from "./phone";
import { ReviewView, type Draft } from "./review-view";
import { SCENARIO } from "./scenario";

export interface FieldState {
  jobs: Job[];
  history: HistoryEntry[];
  reports: Array<{ id: string; jobId: string }>;
  briefs: Record<string, BriefData>;
  drafts: Record<string, Draft>;
}

const TYPE: Record<string, { en: string; ar: string }> = {
  Reactive: { en: "Reactive", ar: "تصحيحية" },
  PPM: { en: "PPM", ar: "صيانة وقائية" },
  "Follow-up": { en: "Follow-up", ar: "متابعة" },
};

const STATUS: Record<JobStatus, { en: string; ar: string; tone: "neutral" | "ai" | "warning" | "success" | "info" | "danger" }> = {
  new: { en: "New", ar: "جديدة", tone: "neutral" },
  assigned: { en: "Assigned", ar: "مسندة", tone: "neutral" },
  scheduled: { en: "Scheduled", ar: "مجدولة", tone: "info" },
  in_progress: { en: "On site", ar: "في الموقع", tone: "ai" },
  awaiting_review: { en: "Report in review", ar: "التقرير قيد المراجعة", tone: "warning" },
  awaiting_parts: { en: "Awaiting parts", ar: "بانتظار القطع", tone: "warning" },
  completed: { en: "Completed", ar: "مكتملة", tone: "success" },
  overdue: { en: "Overdue", ar: "متأخرة", tone: "danger" },
};

export function FieldWorkspace({
  initial,
  sites,
  assets,
  techs,
  inventory,
  bms,
  samplePhotos,
  initialApprovals,
}: {
  initial: FieldState;
  sites: Site[];
  assets: Asset[];
  techs: Technician[];
  inventory: Inventory;
  bms: BmsLog;
  samplePhotos: Array<{ src: string; caption: string; caption_ar?: string; phase: string }>;
  initialApprovals: Array<ApprovalSummary & { jobId?: string }>;
}) {
  const L = useL();
  const f = useFormat();
  const { lang, dir } = usePrefs();
  const personName = (t?: Technician) => (t ? (lang === "ar" && t.name_ar) || t.name : "");
  const [state, setState] = useState<FieldState>(initial);
  const [selectedId, setSelectedId] = useState("JOB-RFM-26-04471");
  const [tab, setTab] = useState("brief");
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t) setTab(t);
  }, []);
  const [filter, setFilter] = useState<"open" | "all" | "done">("open");
  const [approvals, setApprovals] = useState(initialApprovals);
  const briefRun = useNarvoRun();
  const reportRun = useNarvoRun();

  const job = state.jobs.find((j) => j.id === selectedId) ?? state.jobs[0];
  const asset = assets.find((a) => a.id === job.asset)!;
  const site = sites.find((s) => s.id === job.site)!;
  const tech = techs.find((t) => t.id === job.technician)!;
  const today = new Date(Date.now() + 4 * 3600000).toISOString().slice(0, 10);
  const kpi = useMemo(() => computeKpis(state.jobs, state.history, today), [state, today]);

  const refresh = useCallback(async () => {
    const [s, a] = await Promise.all([
      fetch("/api/solutions/19-field-service/state").then((r) => r.json()),
      fetch("/api/approvals?solution=19-field-service").then((r) => r.json()),
    ]);
    setState(s);
    setApprovals((a.approvals ?? []).map((x: ApprovalSummary & { payload?: { jobId?: string } }) => ({ ...x, jobId: x.payload?.jobId })));
  }, []);

  useEffect(() => {
    briefRun.reset();
    reportRun.reset();
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (briefRun.status === "done") refresh();
  }, [briefRun.status, refresh]);
  useEffect(() => {
    if (reportRun.status === "done") {
      refresh();
      setTab("review");
      toast.success(L({ en: "Draft report received — supervisor review opened", ar: "وصلت مسودة التقرير — فُتحت مراجعة المشرف" }));
    }
  }, [reportRun.status, refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  async function jobAction(action: "brief_reviewed" | "check_in", minutes?: number) {
    const res = await fetch("/api/solutions/19-field-service/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, jobId: job.id, minutes }),
    });
    if (!res.ok) return toast.error(await res.text());
    await refresh();
    if (action === "brief_reviewed") toast.success(L({ en: `Preparation time recorded: ${minutes} min`, ar: `سُجّل وقت التحضير: ${minutes} دقيقة` }));
  }

  const list = state.jobs
    .filter((j) => (filter === "all" ? true : filter === "done" ? j.status === "completed" : j.status !== "completed"))
    .sort((a, b) => (a.id === "JOB-RFM-26-04471" ? -1 : b.id === "JOB-RFM-26-04471" ? 1 : a.scheduledFor.localeCompare(b.scheduledFor)));
  const draft = (reportRun.data.draft as Draft | undefined) ?? state.drafts[job.id];
  const jobApprovals = approvals.filter((a) => a.jobId === job.id);
  const storedBrief = state.briefs[job.id];
  const brief = useMemo(
    () =>
      storedBrief && {
        ...storedBrief,
        parts: storedBrief.parts.some((p) => !p.action_ar)
          ? partAvailability(
              storedBrief.parts.map((p) => ({ partNo: p.partNo, qty: p.qty, purpose: p.purpose })),
              inventory,
              tech.van,
              site.id,
              asset.description,
            )
          : storedBrief.parts,
      },
    [storedBrief, inventory, tech.van, site.id, asset.description],
  );

  return (
    <SolutionPage slug="19-field-service" scenario={SCENARIO}>
      <DirectionProvider dir={dir}>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <MetricTile
          label={L({ en: "Preparation time", ar: "وقت التحضير" })}
          value={L({ en: `${f.number(kpi.prepAi, { maximumFractionDigits: 1 })} min`, ar: `${f.number(kpi.prepAi, { maximumFractionDigits: 1 })} دقيقة` })}
          tone="ai"
          delta={{ value: `${Math.round(kpi.prepSaved * 100)}%`, good: true }}
          sub={L({ en: `vs ${f.number(kpi.prepManual, { maximumFractionDigits: 1 })} min manual`, ar: `مقابل ${f.number(kpi.prepManual, { maximumFractionDigits: 1 })} دقيقة يدوياً` })}
        />
        <MetricTile
          label={L({ en: "Report completeness", ar: "اكتمال التقارير" })}
          value={`${Math.round(kpi.complAi * 100)}%`}
          sub={L({ en: `before pilot ${Math.round(kpi.complManual * 100)}% · RFM-QA-STD-004`, ar: `قبل التجربة ${Math.round(kpi.complManual * 100)}% · RFM-QA-STD-004` })}
        />
        <MetricTile
          label={L({ en: "First-time fix", ar: "الإصلاح من المرة الأولى" })}
          value={`${Math.round(kpi.ftf * 100)}%`}
          tone={kpi.ftf >= 0.85 ? "success" : "warning"}
          sub={L({ en: `${kpi.ftfN} corrective jobs · target 85%`, ar: `${kpi.ftfN} مهمة تصحيحية · الهدف 85%` })}
        />
        <MetricTile
          label={L({ en: "Open follow-ups", ar: "المتابعات المفتوحة" })}
          value={kpi.openFollowUps}
          tone={kpi.openFollowUps ? "warning" : "default"}
          sub={L({ en: "each with owner, part status & date", ar: "لكل منها مسؤول وحالة القطعة وموعد" })}
        />
        <MetricTile
          label={L({ en: "Today · overdue PPM", ar: "اليوم · صيانة متأخرة" })}
          value={`${kpi.jobsToday} · ${kpi.overdue}`}
          tone={kpi.overdue ? "danger" : "default"}
          sub={L({ en: "jobs scheduled today · PPM overdue", ar: "مهام اليوم · صيانة وقائية متأخرة" })}
        />
      </div>

      <div className={cn("grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]", tab !== "review" && "2xl:grid-cols-[300px_minmax(0,1fr)_390px]")}>
        <Pane
          title={L({ en: "Work orders · RFM Connect", ar: "أوامر العمل · RFM Connect" })}
          flush
          actions={
            <div className="inline-flex rounded-md border border-border bg-surface p-0.5">
              {(["open", "done", "all"] as const).map((k) => (
                <button key={k} type="button" onClick={() => setFilter(k)} className={cn("rounded-[5px] px-2 py-1 text-[11px]", filter === k ? "bg-card font-medium shadow-[0_0_0_1px_var(--border)]" : "text-muted-foreground")}>
                  {k === "open" ? L({ en: "Open", ar: "مفتوحة" }) : k === "done" ? L({ en: "Done", ar: "منجزة" }) : L({ en: "All", ar: "الكل" })}
                </button>
              ))}
            </div>
          }
        >
          <ul className="max-h-[880px] divide-y divide-border overflow-auto scrollbar-thin">
            {list.map((j) => {
              const s = STATUS[j.status] ?? STATUS.assigned;
              const t = techs.find((x) => x.id === j.technician);
              return (
                <li key={j.id}>
                  <button type="button" onClick={() => setSelectedId(j.id)} className={cn("w-full px-4 py-2.5 text-start transition-colors", j.id === job.id ? "bg-ai-soft/70" : "hover:bg-muted/50")}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] font-medium">{j.id}</span>
                      <StatusPill tone={s.tone}>{L(s)}</StatusPill>
                    </div>
                    <div className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug" dir="auto">
                      {lang === "ar" ? j.title_ar : j.title}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[10.5px] text-muted-foreground">
                      <span>{L(TYPE[j.type] ?? j.type)}</span>·<span>{j.priority}</span>·<span>{j.site}</span>·<span>{personName(t)}</span>
                    </div>
                    <div className="num text-[10.5px] text-faint">{f.date(j.scheduledFor, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                  </button>
                </li>
              );
            })}
          </ul>
        </Pane>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="rounded-lg border border-border bg-card px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[12px] font-medium">{job.id}</span>
                  <StatusPill tone={(STATUS[job.status] ?? STATUS.assigned).tone}>{L(STATUS[job.status] ?? STATUS.assigned)}</StatusPill>
                  <span className="text-[11.5px] text-muted-foreground">{L(TYPE[job.type] ?? job.type)} · {job.priority}{lang === "en" ? ` · ${job.sla}` : ""}</span>
                </div>
                <h2 className="mt-1 text-[18px] font-light tracking-tight" dir="auto">
                  {lang === "ar" ? job.title_ar : job.title}
                </h2>
                <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-muted-foreground" dir="auto">
                  {lang === "ar" ? job.symptom_ar : job.symptom}
                </p>
              </div>
              <div className="text-end text-[11.5px] text-muted-foreground">
                <div>{personName(tech)} · {lang === "ar" ? tech.role_ar : tech.role}</div>
                <div>{L({ en: "Supervisor", ar: "المشرف" })}: {personName(techs.find((t) => t.id === job.supervisor))}</div>
                <div className="num">{f.date(job.scheduledFor, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
              </div>
            </div>
          </div>

          <Tabs value={tab} onValueChange={setTab} className="gap-4">
            <TabsList variant="line" className="h-9">
              <TabsTrigger value="brief">{L({ en: "Job brief", ar: "ملخص المهمة" })}</TabsTrigger>
              <TabsTrigger value="asset">{L({ en: "Asset & history", ar: "الأصل والسجل" })}</TabsTrigger>
              <TabsTrigger value="review">
                {L({ en: "Supervisor review", ar: "مراجعة المشرف" })}
                {draft && job.status === "awaiting_review" && <span className="size-1.5 rounded-full bg-warning" />}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="brief" className="mt-0">
              <BriefView job={job} run={briefRun} stored={brief} bms={asset.id === bms.asset ? bms : undefined} onRun={() => briefRun.start("/api/solutions/19-field-service/brief", { jobId: job.id })} />
            </TabsContent>
            <TabsContent value="asset" className="mt-0">
              <AssetView asset={asset} site={site} history={state.history} jobs={state.jobs} techs={techs} bms={bms} />
            </TabsContent>
            <TabsContent value="review" className="mt-0">
              <ReviewView
                job={job}
                asset={asset}
                site={site}
                tech={tech}
                draft={draft}
                inventory={inventory}
                approvals={jobApprovals}
                onApproval={(a) => setApprovals((x) => [{ ...a, jobId: job.id }, ...x])}
                onDecided={async (id, s) => {
                  setApprovals((x) => x.map((a) => (a.id === id ? { ...a, status: s } : a)));
                  await refresh();
                  if (s === "approved") toast.success(L({ en: "Job closed · follow-up raised · asset history updated", ar: "أُغلقت المهمة · أُنشئت المتابعة · حُدّث سجل الأصل" }));
                }}
                onReturned={refresh}
              />
            </TabsContent>
          </Tabs>
        </div>

        <div className={cn("lg:col-span-2 2xl:col-span-1 2xl:sticky 2xl:top-4", tab === "review" && "hidden")}>
          <Phone
            job={job}
            site={site}
            asset={asset}
            tech={tech}
            brief={brief}
            briefRun={briefRun}
            onRunBrief={() => {
              setTab("brief");
              briefRun.start("/api/solutions/19-field-service/brief", { jobId: job.id });
            }}
            onReviewed={(m) => jobAction("brief_reviewed", m)}
            onCheckIn={() => jobAction("check_in")}
            reportRun={reportRun}
            onGenerate={(notes, photos) => reportRun.start("/api/solutions/19-field-service/report", { jobId: job.id, notes, photos })}
            samplePhotos={samplePhotos}
          />
        </div>
      </div>
      </DirectionProvider>
    </SolutionPage>
  );
}
