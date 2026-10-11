"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Info, ScanSearch, Search } from "lucide-react";
import { toast } from "sonner";
import { useNarvoRun } from "@/hooks/use-narvo-run";
import { SolutionPage } from "@/components/narvo/solution-page";
import { Pane } from "@/components/narvo/pane";
import { MetricTile } from "@/components/narvo/metric";
import { AgentTrace } from "@/components/narvo/agent-trace";
import { RunButton } from "@/components/narvo/run-button";
import { StatusPill } from "@/components/narvo/status";
import { EmptyState } from "@/components/narvo/empty";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { DirectionProvider } from "@/components/ui/direction";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFormat, useL, usePrefs } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { ApprovalSummary } from "@/lib/ai/events";
import { computeKpis } from "../_lib/rules";
import type { Contractor, CorrectiveTask, Inspection, InspectionState, InspectionStatus, Taxonomy } from "../_lib/types";
import { CaptureDialog } from "./capture-dialog";
import { ChecklistView } from "./checklist-view";
import { ClosureDialog } from "./closure-dialog";
import { FindingsPanel } from "./findings-panel";
import { NoticePanel } from "./notice-panel";
import { PhotoViewer } from "./photo-viewer";
import { TaskRegister } from "./task-register";
import { SCENARIO } from "./scenario";
import { INSPECTION_TYPE, NamesProvider } from "./names";
import { Segmented, SeverityPill } from "./ui";

const STATUS: Record<InspectionStatus, { en: string; ar: string; tone: "neutral" | "ai" | "warning" | "success" | "info" }> = {
  awaiting_review: { en: "Awaiting review", ar: "بانتظار المراجعة", tone: "neutral" },
  in_review: { en: "In review", ar: "قيد المراجعة", tone: "ai" },
  notice_pending: { en: "Notice pending", ar: "الإشعار بانتظار الاعتماد", tone: "warning" },
  notice_issued: { en: "Notice issued", ar: "صدر الإشعار", tone: "info" },
  closed: { en: "Closed", ar: "مغلق", tone: "success" },
};

export function InspectionWorkspace({
  initialState,
  tax,
  contractors,
  names,
  initialApprovals,
  serverNow,
}: {
  initialState: InspectionState;
  tax: Taxonomy;
  contractors: Contractor[];
  names: Record<string, string>;
  initialApprovals: Array<ApprovalSummary & { inspectionId?: string }>;
  serverNow: number;
}) {
  const L = useL();
  const f = useFormat();
  const { lang, dir } = usePrefs();
  const tr = (en?: string | null, ar?: string | null) => (lang === "ar" ? ar || (en ? names[en] : undefined) || en || "" : en || "");
  const [state, setState] = useState(initialState);
  const [tab, setTab] = useState("inspections");
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t) setTab(t);
  }, []);
  const [filter, setFilter] = useState<"all" | "review" | "notice" | "closed">("all");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState(
    initialState.inspections.find((i) => i.id === "MNDA-INS-2026-07114" && (i.status === "awaiting_review" || i.status === "in_review" || i.status === "notice_pending"))?.id ??
      initialState.inspections.find((i) => i.status === "awaiting_review")?.id ??
      initialState.inspections[0]?.id,
  );
  const [photo, setPhoto] = useState(0);
  const [showBoxes, setShowBoxes] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [drawMode, setDrawMode] = useState(false);
  const [draft, setDraft] = useState<[number, number, number, number] | null>(null);
  const [closureTask, setClosureTask] = useState<CorrectiveTask | null>(null);
  const [approvals, setApprovals] = useState(initialApprovals);
  const run = useNarvoRun();

  const insp = state.inspections.find((i) => i.id === selectedId) ?? state.inspections[0];
  // A stable "now" for SSR + hydration, refreshed on the client after mount and every minute.
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
  const kpi = useMemo(() => computeKpis(state, now), [state, now]);

  const refresh = useCallback(async () => {
    const [s, a] = await Promise.all([
      fetch("/api/solutions/18-visual-inspection/state").then((r) => r.json()),
      fetch("/api/approvals?solution=18-visual-inspection&status=pending").then((r) => r.json()),
    ]);
    setState(s);
    setApprovals(
      (a.approvals ?? []).map((x: ApprovalSummary & { payload?: { inspectionId?: string } }) => ({ ...x, inspectionId: x.payload?.inspectionId })),
    );
  }, []);

  useEffect(() => {
    setPhoto(0);
    setDrawMode(false);
    setDraft(null);
    setActiveId(null);
    run.reset();
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // When the vision run finishes, pull the saved findings
  useEffect(() => {
    if (run.status === "done") refresh();
  }, [run.status, refresh]);

  const list = state.inspections.filter((i) => {
    const okF =
      filter === "all" ||
      (filter === "review" && (i.status === "awaiting_review" || i.status === "in_review")) ||
      (filter === "notice" && (i.status === "notice_pending" || i.status === "notice_issued")) ||
      (filter === "closed" && i.status === "closed");
    const needle = q.trim().toLowerCase();
    const okQ = !needle || [i.id, i.plot, i.contractor, i.project, i.inspector.name].some((x) => x.toLowerCase().includes(needle));
    return okF && okQ;
  });

  const findings = insp ? state.findings.filter((x) => x.inspectionId === insp.id) : [];
  const photoFindings = findings.filter((x) => x.photo === photo);
  const locked = !insp || insp.status === "notice_pending" || insp.status === "notice_issued" || insp.status === "closed";
  const inspTasks = insp ? state.tasks.filter((t) => t.inspectionId === insp.id) : [];
  const counts = (fn: (i: Inspection) => boolean) => state.inspections.filter(fn).length;

  return (
    <SolutionPage slug="18-visual-inspection" scenario={SCENARIO}>
      <NamesProvider map={names}>
      <DirectionProvider dir={dir}>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <MetricTile
          label={L({ en: "Confirmed findings", ar: "الملاحظات المؤكدة" })}
          value={f.number(kpi.findings)}
          sub={L({ en: `${kpi.aiAccepted} AI · ${kpi.reviewerAdded} reviewer · ${kpi.pendingReview} to review`, ar: `${kpi.aiAccepted} آلية · ${kpi.reviewerAdded} من المراجع · ${kpi.pendingReview} للمراجعة` })}
        />
        <MetricTile
          label={L({ en: "AI flag acceptance", ar: "قبول الإشارات الآلية" })}
          value={`${Math.round(kpi.acceptanceRate * 100)}%`}
          tone="ai"
          sub={L({ en: `${kpi.aiAccepted} of ${kpi.aiReviewed} reviewed flags`, ar: `${kpi.aiAccepted} من ${kpi.aiReviewed} إشارة مراجعة` })}
        />
        <MetricTile
          label={L({ en: "False flags", ar: "الإنذارات الخاطئة" })}
          value={`${Math.round(kpi.falseFlagRate * 100)}%`}
          tone={kpi.falseFlagRate < 0.08 ? "success" : "warning"}
          sub={L({ en: `${kpi.aiRejected} rejected · target < 8% · pilot 2025: 23%`, ar: `${kpi.aiRejected} مرفوضة · الهدف < 8% · تجربة 2025: 23%` })}
        />
        <MetricTile
          label={L({ en: "Missed defects", ar: "العيوب الفائتة" })}
          value={`${Math.round(kpi.missedRate * 100)}%`}
          tone={kpi.missedRate <= 0.04 ? "success" : "warning"}
          sub={L({ en: `${kpi.reviewerAdded} added by reviewers · target 4%`, ar: `${kpi.reviewerAdded} أضافها المراجعون · الهدف 4%` })}
        />
        <MetricTile
          label={L({ en: "Correction closure", ar: "إغلاق التصحيحات" })}
          value={`${Math.round(kpi.closureRate * 100)}%`}
          tone={kpi.overdue ? "warning" : "success"}
          sub={L({ en: `${kpi.tasksDue - kpi.overdue} of ${kpi.tasksDue} due · ${kpi.overdue} overdue · ${kpi.openTasks} open`, ar: `${kpi.tasksDue - kpi.overdue} من ${kpi.tasksDue} مستحقة · ${kpi.overdue} متأخرة · ${kpi.openTasks} مفتوحة` })}
        />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <TabsList variant="line" className="h-9">
          <TabsTrigger value="inspections">{L({ en: "Inspections", ar: "عمليات التفتيش" })}</TabsTrigger>
          <TabsTrigger value="tasks">
            {L({ en: "Corrective tasks", ar: "المهام التصحيحية" })}
            {kpi.overdue > 0 && <span className="num rounded-full bg-danger-soft px-1.5 text-[10px] text-danger">{kpi.overdue}</span>}
          </TabsTrigger>
          <TabsTrigger value="checklist">{L({ en: "Defect checklist (CSSR-2025)", ar: "قائمة العيوب (CSSR-2025)" })}</TabsTrigger>
        </TabsList>

        <TabsContent value="inspections" className="mt-0">
          <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[300px_minmax(0,1fr)_380px]">
            {/* List */}
            <Pane
              title={L({ en: "Inspections", ar: "عمليات التفتيش" })}
              subtitle={L({ en: "Sep–Oct 2026 · AI-assisted pilot", ar: "سبتمبر–أكتوبر 2026 · تجربة الفحص الذكي" })}
              flush
              actions={<CaptureDialog contractors={contractors} plots={[...new Set(state.inspections.map((i) => i.plot))]} onCreated={(i, s) => { setState(s); setSelectedId(i.id); setFilter("all"); }} />}
            >
              <div className="space-y-2 border-b border-border p-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L({ en: "Plot, contractor, ID…", ar: "القطعة، المقاول، الرقم…" })} className="h-8 ps-8 text-[12px]" />
                </div>
                <Segmented
                  value={filter}
                  onChange={setFilter}
                  className="w-full justify-between"
                  options={[
                    { value: "all", label: `${L({ en: "All", ar: "الكل" })} ${state.inspections.length}` },
                    { value: "review", label: `${L({ en: "Review", ar: "مراجعة" })} ${counts((i) => i.status === "awaiting_review" || i.status === "in_review")}` },
                    { value: "notice", label: `${L({ en: "Notices", ar: "إشعارات" })} ${counts((i) => i.status === "notice_pending" || i.status === "notice_issued")}` },
                    { value: "closed", label: `${L({ en: "Closed", ar: "مغلقة" })} ${counts((i) => i.status === "closed")}` },
                  ]}
                />
              </div>
              <ul className="max-h-[820px] divide-y divide-border overflow-auto scrollbar-thin">
                {list.map((i) => {
                  const s = STATUS[i.status];
                  const nf = state.findings.filter((x) => x.inspectionId === i.id && x.status !== "superseded" && x.status !== "rejected").length;
                  return (
                    <li key={i.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(i.id)}
                        className={cn("flex w-full gap-3 px-3 py-2.5 text-start transition-colors", i.id === insp?.id ? "bg-ai-soft/70" : "hover:bg-muted/50")}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={i.photos[0]?.src} alt="" className="size-14 shrink-0 rounded object-cover" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[11px] font-medium">{i.id.replace("MNDA-INS-", "")}</span>
                            <StatusPill tone={s.tone}>{L(s)}</StatusPill>
                          </div>
                          <div className="mt-0.5 truncate text-[12px]" dir="auto">
                            {lang === "ar" ? i.project_ar : i.project}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5 truncate text-[10.5px] text-muted-foreground">
                            <span className="font-mono">{i.plot}</span>·<span className="truncate">{tr(i.contractor)}</span>
                          </div>
                          <div className="mt-0.5 truncate text-[10.5px] text-faint">
                            {f.date(i.date, { day: "numeric", month: "short" })} · {tr(i.inspector.name, i.inspector.name_ar)}
                            {nf > 0 && ` · ${nf} ${L({ en: "findings", ar: "ملاحظات" })}`}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
                {list.length === 0 && <li className="p-6 text-center text-[12px] text-muted-foreground">{L({ en: "No inspections match.", ar: "لا توجد نتائج." })}</li>}
              </ul>
            </Pane>

            {/* Detail */}
            {insp ? (
              <div className="flex min-w-0 flex-col gap-4">
                <Pane
                  title={<span className="font-mono normal-case tracking-normal text-foreground">{insp.id}</span>}
                  subtitle={`${lang === "ar" ? insp.project_ar : insp.project} · ${L(INSPECTION_TYPE[insp.type] ?? { en: insp.type, ar: insp.type })}`}
                  actions={
                    <label className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
                      <Switch checked={showBoxes} onCheckedChange={setShowBoxes} />
                      {L({ en: "Boxes", ar: "الإطارات" })}
                    </label>
                  }
                >
                  <div className="min-w-0">
                    <PhotoViewer
                      className="mx-auto max-w-[720px]"
                      src={insp.photos[photo]?.src ?? insp.photos[0].src}
                      alt={insp.photos[photo]?.caption ?? ""}
                      findings={photoFindings}
                      tax={tax}
                      showBoxes={showBoxes}
                      activeId={activeId}
                      onHover={setActiveId}
                      drawMode={drawMode}
                      onDraw={setDraft}
                      draft={draft}
                    />
                    <div className="mt-2 flex flex-wrap items-start justify-between gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                      <span dir="auto">{(lang === "ar" && insp.photos[photo]?.caption_ar) || insp.photos[photo]?.caption}</span>
                      <span className="flex items-center gap-1.5 text-faint">
                        <Info className="size-3" />
                        {L({ en: "Boxes are approximate — the inspector decides", ar: "الإطارات تقريبية — القرار للمفتش" })}
                        {insp.photos[photo]?.credit?.includes("Wikimedia") ? (
                          <a href="/demo/18-visual-inspection/CREDITS.md" target="_blank" rel="noreferrer" className="hover:text-foreground hover:underline">
                            · {L({ en: "Photo: Wikimedia Commons", ar: "الصورة: ويكيميديا كومنز" })}
                          </a>
                        ) : (
                          insp.photos[photo]?.credit && <span>· {insp.photos[photo].credit}</span>
                        )}
                      </span>
                    </div>
                    {insp.photos.length > 1 && (
                      <div className="mt-2 flex gap-2">
                        {insp.photos.map((p, i) => (
                          <button key={i} type="button" onClick={() => setPhoto(i)} className={cn("overflow-hidden rounded border-2", i === photo ? "border-foreground" : "border-transparent opacity-70")}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={p.src} alt="" className="h-12 w-16 object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border pt-3 text-[12px] sm:grid-cols-3">
                    {[
                      [L({ en: "Plot", ar: "القطعة" }), <span key="p" className="font-mono">{insp.plot}</span>],
                      [L({ en: "Permit", ar: "الرخصة" }), <span key="r" className="font-mono">{insp.permit}</span>],
                      [L({ en: "Contractor", ar: "المقاول" }), tr(insp.contractor)],
                      [L({ en: "Consultant", ar: "الاستشاري" }), tr(insp.consultant, insp.consultant_ar)],
                      [L({ en: "Inspector", ar: "المفتش" }), `${lang === "ar" ? insp.inspector.name_ar : insp.inspector.name} · ${insp.inspector.id}`],
                      [L({ en: "Visited", ar: "الزيارة" }), f.date(insp.date, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })],
                      [L({ en: "Conditions", ar: "الأحوال" }), tr(insp.weather, insp.weather_ar) || "—"],
                      [L({ en: "Status", ar: "الحالة" }), <StatusPill key="s" tone={STATUS[insp.status].tone}>{L(STATUS[insp.status])}</StatusPill>],
                    ].map(([k, v], i) => (
                      <div key={i} className="min-w-0">
                        <dt className="label-caps !text-[9px]">{k}</dt>
                        <dd className="mt-0.5 font-medium break-words">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  {insp.note && (
                    <p className="mt-3 rounded-md bg-muted/60 p-2.5 text-[12px] leading-relaxed text-muted-foreground" dir="auto">
                      <span className="label-caps me-2 !text-[9px]">{L({ en: "Field note", ar: "ملاحظة ميدانية" })}</span>
                      {lang === "ar" && insp.note_ar ? insp.note_ar : insp.note}
                    </p>
                  )}
                </Pane>

                <Pane
                  title={L({ en: "Findings", ar: "الملاحظات" })}
                  subtitle={L({ en: "Accept, reject (with reason), re-code, or add what the model missed", ar: "اقبل أو ارفض (مع السبب) أو أعد التصنيف أو أضف ما فات النموذج" })}
                  actions={
                    !locked && (
                      <RunButton
                        size="sm"
                        running={run.running}
                        onRun={() => run.start("/api/solutions/18-visual-inspection/analyze", { inspectionId: insp.id, photo })}
                        onStop={run.abort}
                        icon={<ScanSearch />}
                      >
                        {photoFindings.some((x) => x.source === "ai") ? L({ en: "Re-screen photo", ar: "أعد الفحص" }) : L({ en: "Screen photo with vision", ar: "افحص الصورة بنموذج الرؤية" })}
                      </RunButton>
                    )
                  }
                >
                  {run.data.scene && (
                    <p className="mb-3 rounded-md border border-ai/20 bg-ai-soft/50 p-2.5 text-[12px] leading-relaxed" dir="auto">
                      <span className="label-caps me-2 !text-[9px] text-ai">{L({ en: "Scene", ar: "المشهد" })}</span>
                      {run.data.scene as string}
                    </p>
                  )}
                  <FindingsPanel
                    insp={insp}
                    findings={photoFindings}
                    tax={tax}
                    activeId={activeId}
                    onHover={setActiveId}
                    locked={locked}
                    onState={setState}
                    drawMode={drawMode}
                    setDrawMode={setDrawMode}
                    draft={draft}
                    setDraft={setDraft}
                    photo={photo}
                  />
                </Pane>
              </div>
            ) : (
              <EmptyState title={L({ en: "Select an inspection", ar: "اختر عملية تفتيش" })} />
            )}

            {/* Right rail */}
            {insp && (
              <div className="flex flex-col gap-4 lg:col-span-2 2xl:col-span-1">
                <Pane title={L({ en: "Vision pipeline", ar: "مسار الفحص البصري" })}>
                  <AgentTrace
                    run={run}
                    showReasoning={false}
                    emptyHint={L({ en: "Screen a photo to see each step: checklist, vision model, CSSR mapping, repeat check.", ar: "افحص صورة لرؤية كل خطوة: قائمة الفحص، نموذج الرؤية، ربط المواد، فحص التكرار." })}
                  />
                </Pane>
                <Pane title={L({ en: "Notice of Violation", ar: "إشعار المخالفة" })}>
                  <NoticePanel
                    now={now}
                    insp={insp}
                    state={state}
                    tax={tax}
                    pendingApproval={approvals.find((a) => a.inspectionId === insp.id && a.status === "pending")}
                    onRefresh={async (decision) => {
                      if (decision === "rejected") {
                        await fetch("/api/solutions/18-visual-inspection/inspections", {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ id: insp.id, status: "in_review" }),
                        });
                      }
                      await refresh();
                    }}
                  />
                </Pane>
                {inspTasks.length > 0 && (
                  <Pane title={L({ en: "Corrective tasks", ar: "المهام التصحيحية" })} flush>
                    <ul className="divide-y divide-border">
                      {inspTasks.map((t) => {
                        const od = t.status === "open" && Date.parse(t.dueAt) < now;
                        return (
                          <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-[11px]">{t.id}</span>
                                <SeverityPill severity={t.severity} escalated={t.escalated} />
                              </div>
                              <div className="mt-0.5 truncate text-[12px]" dir="auto">
                                {t.code} · {tr(t.title, t.title_ar)}
                              </div>
                              <div className={cn("num text-[10.5px]", od ? "text-danger" : "text-muted-foreground")}>
                                {t.status === "closed" ? L({ en: "Closed", ar: "مغلقة" }) : `${L({ en: "Due", ar: "الموعد" })} ${f.date(t.dueAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`}
                              </div>
                            </div>
                            <Button size="xs" variant={t.status === "open" ? "outline" : "ghost"} onClick={() => setClosureTask(t)}>
                              {t.status === "open" ? L({ en: "Verify", ar: "تحقق" }) : L({ en: "View", ar: "عرض" })}
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  </Pane>
                )}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="tasks" className="mt-0">
          <TaskRegister
            now={now}
            state={state}
            onOpen={setClosureTask}
            onInspection={(id) => {
              setSelectedId(id);
              setTab("inspections");
            }}
          />
        </TabsContent>
        <TabsContent value="checklist" className="mt-0">
          <ChecklistView tax={tax} />
        </TabsContent>
      </Tabs>

      <ClosureDialog
        task={closureTask ? state.tasks.find((t) => t.id === closureTask.id) ?? closureTask : null}
        state={state}
        tax={tax}
        open={!!closureTask}
        onOpenChange={(v) => !v && setClosureTask(null)}
        onState={(s) => {
          setState(s);
          toast.message(L({ en: "Closure KPI updated", ar: "تم تحديث مؤشر الإغلاق" }));
        }}
      />
      </DirectionProvider>
      </NamesProvider>
    </SolutionPage>
  );
}
