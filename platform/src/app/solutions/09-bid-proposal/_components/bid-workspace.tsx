"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, CalendarClock, ClipboardList, Download, FileSearch, FileText, Layers, ListChecks, Send, ShieldCheck, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SolutionPage } from "@/components/narvo/solution-page";
import { Pane, Workbench } from "@/components/narvo/pane";
import { AgentTrace } from "@/components/narvo/agent-trace";
import { MetricTile } from "@/components/narvo/metric";
import { RunButton } from "@/components/narvo/run-button";
import { StatusPill } from "@/components/narvo/status";
import { ApprovalCard } from "@/components/narvo/approval-card";
import { EmptyState } from "@/components/narvo/empty";
import { useNarvoRun, type NarvoRun } from "@/hooks/use-narvo-run";
import { useFormat, useL, usePrefs } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { daysToClosing, readiness, fmt, fmtAr } from "../_lib/compliance";
import { buildResponsePack, download } from "../_lib/export";
import type { BidSeed, BidState, Coverage, LibraryDoc, Requirement } from "../_lib/types";
import { CoverageView } from "./coverage-view";
import { DraftStudio } from "./draft-studio";
import { ComplianceView } from "./compliance-view";
import { TasksView, type Reply } from "./tasks-view";
import { ByoView } from "./byo-view";
import { DocDialog } from "./doc-dialog";
import { SCENARIO } from "./scenario";

const API = "/api/solutions/09-bid-proposal";
type RunKey = "extract" | "map" | "draft" | "claims" | "tasks" | "answer" | "byoExtract" | "byoMap";
const RUN_LABEL: Record<RunKey, { en: string; ar: string }> = {
  extract: { en: "Requirement extraction", ar: "استخراج المتطلبات" },
  map: { en: "Evidence mapping", ar: "ربط الأدلة" },
  draft: { en: "Section drafting", ar: "صياغة القسم" },
  claims: { en: "Claim check", ar: "فحص الادعاءات" },
  tasks: { en: "Task assignment", ar: "إسناد المهام" },
  answer: { en: "Contributor answer", ar: "إجابة المساهم" },
  byoExtract: { en: "Your RFP — extraction", ar: "مناقصتك — الاستخراج" },
  byoMap: { en: "Your RFP — mapping", ar: "مناقصتك — الربط" },
};

export function BidWorkspace({ seed, initial, library, replies }: { seed: BidSeed; initial: BidState; library: LibraryDoc[]; replies: Reply[] }) {
  const L = useL();
  const f = useFormat();
  const { lang } = usePrefs();
  const [state, setState] = useState<BidState>(initial);
  const [tab, setTab] = useState("coverage");
  const [doc, setDoc] = useState<string | null>(null);
  const [active, setActive] = useState<RunKey>("extract");
  const [draftSec, setDraftSec] = useState<string | null>(null);
  const [checkSec, setCheckSec] = useState<string | null>(null);
  const [answering, setAnswering] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);

  const runs: Record<RunKey, NarvoRun> = {
    extract: useNarvoRun(),
    map: useNarvoRun(),
    draft: useNarvoRun(),
    claims: useNarvoRun(),
    tasks: useNarvoRun(),
    answer: useNarvoRun(),
    byoExtract: useNarvoRun(),
    byoMap: useNarvoRun(),
  };
  const start = (k: RunKey, path: string, body: Record<string, unknown> = {}) => {
    setActive(k);
    runs[k].start(`${API}/${path}`, body);
  };

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${API}/state`, { cache: "no-store" });
      if (res.ok) setState(await res.json());
    } catch {}
  }, []);

  /* ── stream → state ── */
  const reqData = runs.extract.data.requirements as Requirement[] | undefined;
  useEffect(() => {
    if (reqData) setState((s) => ({ ...s, requirements: { at: Date.now(), items: reqData } }));
  }, [reqData]);
  const covData = runs.map.data.coverage as Record<string, Coverage> | undefined;
  useEffect(() => {
    if (covData) setState((s) => ({ ...s, coverage: { ...s.coverage, ...covData } }));
  }, [covData]);
  const secData = runs.draft.data.section as { id: string; state: BidState["sections"][string] } | undefined;
  useEffect(() => {
    if (secData) setState((s) => ({ ...s, sections: { ...s.sections, [secData.id]: secData.state } }));
  }, [secData]);
  const checkData = runs.claims.data.check as { id: string; check: NonNullable<BidState["sections"][string]["check"]> } | undefined;
  useEffect(() => {
    if (checkData) setState((s) => ({ ...s, sections: { ...s.sections, [checkData.id]: { ...s.sections[checkData.id], check: checkData.check } } }));
  }, [checkData]);
  useEffect(() => {
    if (runs.tasks.status === "done" || runs.answer.status === "done" || runs.byoMap.status === "done") refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs.tasks.status, runs.answer.status, runs.byoMap.status, refresh]);
  useEffect(() => {
    if (runs.byoExtract.status === "done" && runs.byoExtract.data.requirements) {
      setActive("byoMap");
      runs.byoMap.start(`${API}/map`, { source: "custom" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs.byoExtract.status]);
  useEffect(() => {
    for (const k of Object.keys(runs) as RunKey[]) {
      if (runs[k].status === "error" && runs[k].error) toast.error(`${L(RUN_LABEL[k])}: ${runs[k].error}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs.extract.status, runs.map.status, runs.draft.status, runs.claims.status, runs.tasks.status, runs.answer.status, runs.byoExtract.status, runs.byoMap.status]);

  const requirements = state.requirements?.items ?? [];
  const r = useMemo(() => readiness(seed, state), [seed, state]);
  const days = daysToClosing(seed);
  const openGapsNoTask = requirements.filter((q) => state.coverage[q.id] && state.coverage[q.id].status !== "met" && !state.tasks.some((t) => t.reqId === q.id && t.status === "open")).length;
  const approved = state.bid.status === "approved_for_submission";
  const pending = state.approvals.find((a) => a.status === "pending");
  const lastApproval = state.approvals[0];

  async function saveSection(sectionId: string, text: string, note?: string) {
    const res = await fetch(`${API}/section`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sectionId, text, note, lang }) });
    if (!res.ok) throw new Error(await res.text());
    const d = (await res.json()) as { id: string; state: BidState["sections"][string] };
    setState((s) => ({ ...s, sections: { ...s.sections, [d.id]: d.state } }));
  }

  async function setForm(formId: string, status: string) {
    const res = await fetch(`${API}/forms`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ formId, status }) });
    if (!res.ok) return toast.error(await res.text());
    const d = await res.json();
    setState((s) => ({ ...s, forms: d.forms, coverage: { ...s.coverage, ...(d.coverage ?? {}) } }));
  }

  async function requestApproval() {
    setRequesting(true);
    try {
      const res = await fetch(`${API}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lang }) });
      if (!res.ok) throw new Error(await res.text());
      await refresh();
      toast.success(L({ en: "Routed to Leena Mattar for approval", ar: "أُحيل إلى لينا مطر للاعتماد" }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRequesting(false);
    }
  }

  function exportPack() {
    download(`${seed.tender.ref.replace(/\//g, "-")}-response-pack.md`, buildResponsePack(seed, state));
  }

  const coverageEmpty = (
    <EmptyState
      icon={<ClipboardList className="size-4" />}
      title={L({ en: "Start from the tender itself", ar: "ابدأ من المناقصة نفسها" })}
      action={
        <div className="flex items-center gap-2">
          <RunButton running={runs.extract.running} onRun={() => start("extract", "extract", { source: "057" })} icon={<Sparkles />}>
            {L({ en: "Extract requirements", ar: "استخراج المتطلبات" })}
          </RunButton>
          <Button variant="outline" onClick={() => setDoc("rfp")}>
            <BookOpen /> {L({ en: "Read the RFP", ar: "اقرأ كراسة الشروط" })}
          </Button>
        </div>
      }
    >
      {L({
        en: "NARVO reads the MNDA RFP and builds the requirement list — each with its clause, category, pass/fail flag and the evidence that would satisfy it.",
        ar: "يقرأ نارفو كراسة شروط الهيئة ويبني قائمة المتطلبات — لكل منها البند والفئة وما إذا كان إلزامياً والدليل الذي يستوفيه.",
      })}
    </EmptyState>
  );

  return (
    <SolutionPage
      slug="09-bid-proposal"
      scenario={SCENARIO}
      actions={
        <Button variant="outline" size="sm" onClick={exportPack}>
          <Download /> {L({ en: "Export pack", ar: "تصدير الحزمة" })}
        </Button>
      }
    >
      {/* tender strip */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border border-border bg-card px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="label-caps flex items-center gap-2">
            <span className="font-mono normal-case tracking-normal">{seed.tender.ref}</span>
            <span className="h-px w-4 bg-border-strong" />
            {L(seed.tender.client)}
          </div>
          <div className="mt-1 truncate text-[14px] font-medium" title={L(seed.tender.title)}>
            {L(seed.tender.title)}
          </div>
        </div>
        <div className="flex items-center gap-5 text-[12px]">
          <div>
            <div className="text-muted-foreground">{L({ en: "Bidder", ar: "مقدم العطاء" })}</div>
            <div className="font-medium">{L({ en: seed.bidder.short, ar: "رصين لإدارة المرافق" })}</div>
          </div>
          <div>
            <div className="text-muted-foreground">{L({ en: "Closing", ar: "الإغلاق" })}</div>
            <div className="num font-medium">
              {f.date(seed.tender.closing)} · <span dir="auto">{L({ en: seed.tender.closingTime, ar: seed.tender.closingTime.replace("GST", "بتوقيت الإمارات") })}</span>
            </div>
          </div>
          <StatusPill tone={approved ? "success" : "warning"}>
            {approved ? L({ en: "Approved for submission", ar: "معتمد للتقديم" }) : L({ en: "In preparation", ar: "قيد الإعداد" })}
          </StatusPill>
          <Button variant="ghost" size="sm" onClick={() => setDoc("rfp")}>
            <BookOpen /> {L({ en: "RFP", ar: "كراسة الشروط" })}
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-6 gap-3 max-xl:grid-cols-3 max-md:grid-cols-2">
        <MetricTile label={L({ en: "Requirements", ar: "المتطلبات" })} value={r.cov.total || "—"} sub={r.cov.total ? `${requirements.filter((q) => q.mandatory).length} ${L({ en: "pass/fail", ar: "إلزامي" })}` : L({ en: "not extracted", ar: "لم تُستخرج" })} />
        <MetricTile label={L({ en: "Evidenced", ar: "مستوفى" })} value={r.cov.mapped ? `${r.cov.pct}%` : "—"} tone="ai" sub={r.cov.mapped ? `${r.cov.met}/${r.cov.total} · ${r.cov.weighted}% ${L({ en: "incl. partial", ar: "مع الجزئي" })}` : undefined} />
        <MetricTile label={L({ en: "Open gaps", ar: "فجوات مفتوحة" })} value={r.cov.mapped ? r.cov.partial + r.cov.missing : "—"} tone={r.cov.missing ? "warning" : "default"} sub={r.cov.mapped ? `${r.cov.mandatoryOpen} ${L({ en: "mandatory", ar: "إلزامية" })}` : undefined} />
        <MetricTile label={L({ en: "Claims flagged", ar: "ادعاءات غير مدعومة" })} value={r.claims.checked ? r.claims.flagged : "—"} tone={r.claims.flagged ? "danger" : "default"} sub={`${r.claims.checked}/${seed.sections.length} ${L({ en: "sections checked", ar: "أقسام مفحوصة" })}`} />
        <MetricTile label={L({ en: "Compliance flags", ar: "تنبيهات الامتثال" })} value={r.critical} tone={r.critical ? "danger" : "success"} sub={`${r.warnings} ${L({ en: "warnings", ar: "تحذيرات" })}`} />
        <MetricTile label={L({ en: "Days to closing", ar: "أيام حتى الإغلاق" })} value={days} icon={<CalendarClock className="size-3.5" />} sub={L({ en: fmt(seed.tender.closing), ar: fmtAr(seed.tender.closing) })} />
      </div>

      <Workbench cols="minmax(0,1fr) 340px">
        <Pane flush className="min-h-[640px]">
          <Tabs value={tab} onValueChange={setTab} className="gap-0">
            <div className="flex items-center justify-between gap-3 overflow-x-auto border-b border-border px-3 pt-2 [scrollbar-width:none]">
              <TabsList variant="line" className="h-9 min-w-max">
                <TabsTrigger value="coverage" className="text-[12.5px] group-data-[variant=line]/tabs-list:px-2.5">
                  <ListChecks /> {L({ en: "Requirements & coverage", ar: "المتطلبات والتغطية" })}
                </TabsTrigger>
                <TabsTrigger value="draft" className="text-[12.5px] group-data-[variant=line]/tabs-list:px-2.5">
                  <FileText /> {L({ en: "Response drafting", ar: "صياغة الرد" })}
                </TabsTrigger>
                <TabsTrigger value="compliance" className="text-[12.5px] group-data-[variant=line]/tabs-list:px-2.5">
                  <ShieldCheck /> {L({ en: "Compliance checks", ar: "فحوص الامتثال" })}
                  {r.critical > 0 && <span className="num ms-1 rounded-full bg-danger px-1.5 text-[10px] text-white">{r.critical}</span>}
                </TabsTrigger>
                <TabsTrigger value="tasks" className="text-[12.5px] group-data-[variant=line]/tabs-list:px-2.5">
                  <Layers /> {L({ en: "Contributor tasks", ar: "مهام المساهمين" })}
                  {state.tasks.filter((t) => t.status === "open").length > 0 && (
                    <span className="num ms-1 text-[11px] text-muted-foreground">{state.tasks.filter((t) => t.status === "open").length}</span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="byo" className="text-[12.5px] group-data-[variant=line]/tabs-list:px-2.5">
                  <Upload /> {L({ en: "Your RFP", ar: "مناقصتك" })}
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="coverage" className="p-4">
              {requirements.length > 0 && (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[12.5px] text-muted-foreground" suppressHydrationWarning>
                    {L({ en: "Extracted", ar: "استُخرجت" })} {state.requirements?.at ? f.relative(state.requirements.at) : ""} · {requirements.length}{" "}
                    {L({ en: "requirements from", ar: "متطلباً من" })} <span className="font-mono">{seed.tender.ref}</span>
                  </p>
                  <div className="flex items-center gap-2">
                    <RunButton size="sm" variant="outline" running={runs.extract.running} onRun={() => start("extract", "extract", { source: "057" })} icon={<Sparkles />} disabled={runs.map.running}>
                      {L({ en: "Re-extract", ar: "إعادة الاستخراج" })}
                    </RunButton>
                    <RunButton size="sm" running={runs.map.running} onRun={() => start("map", "map", { source: "057" })} icon={<FileSearch />} disabled={runs.extract.running}>
                      {Object.keys(state.coverage).length ? L({ en: "Re-map evidence", ar: "إعادة ربط الأدلة" }) : L({ en: "Map evidence", ar: "ربط الأدلة" })}
                    </RunButton>
                  </div>
                </div>
              )}
              {runs.extract.running && !requirements.length ? (
                <div className="space-y-2 py-6">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="h-9 animate-pulse rounded bg-muted/70" style={{ animationDelay: `${i * 90}ms` }} />
                  ))}
                </div>
              ) : (
                <CoverageView
                  requirements={requirements}
                  coverage={state.coverage}
                  tasks={state.tasks}
                  running={runs.map.running}
                  onOpenDoc={setDoc}
                  empty={coverageEmpty}
                  rowActions={(q, c) =>
                    c && c.status !== "met" ? (
                      <div className="flex flex-wrap gap-2">
                        {!state.tasks.some((t) => t.reqId === q.id && t.status === "open") && (
                          <Button
                            size="xs"
                            variant="outline"
                            disabled={runs.tasks.running}
                            onClick={() => {
                              start("tasks", "tasks", { only: [q.id] });
                              toast(L({ en: `Assigning ${q.id} to a contributor…`, ar: `جارٍ إسناد ${q.id} إلى مساهم…` }));
                            }}
                          >
                            <Send /> {L({ en: "Assign to contributor", ar: "إسناد إلى مساهم" })}
                          </Button>
                        )}
                        <Button size="xs" variant="ghost" disabled={runs.map.running} onClick={() => start("map", "map", { source: "057", only: [q.id] })}>
                          <FileSearch /> {L({ en: "Re-judge", ar: "إعادة التقييم" })}
                        </Button>
                      </div>
                    ) : null
                  }
                />
              )}
            </TabsContent>

            <TabsContent value="draft" className="p-4">
              <DraftStudio
                seed={seed}
                sections={state.sections}
                requirements={requirements}
                coverage={state.coverage}
                draftRun={runs.draft}
                claimRun={runs.claims}
                draftSection={draftSec}
                checkSection={checkSec}
                onDraft={(id, l) => {
                  setDraftSec(id);
                  start("draft", "draft", { sectionId: id, draftLang: l });
                }}
                onCheck={(id) => {
                  setCheckSec(id);
                  start("claims", "claims", { sectionId: id });
                }}
                onSave={saveSection}
                onOpenDoc={setDoc}
              />
            </TabsContent>

            <TabsContent value="compliance" className="p-4">
              <ComplianceView seed={seed} state={state} onFormStatus={setForm} onOpenDoc={setDoc} />
            </TabsContent>

            <TabsContent value="tasks" className="p-4">
              <TasksView
                tasks={state.tasks}
                team={seed.team}
                coverage={state.coverage}
                openGaps={openGapsNoTask}
                replies={replies}
                taskRun={runs.tasks}
                answerRun={runs.answer}
                answering={answering}
                onPlan={() => start("tasks", "tasks", {})}
                onAnswer={(taskId, text) => {
                  setAnswering(taskId);
                  start("answer", "answer", { taskId, answer: text });
                }}
              />
            </TabsContent>

            <TabsContent value="byo" className="p-4">
              <ByoView
                byo={state.byo}
                liveReqs={runs.byoExtract.data.requirements as Requirement[] | undefined}
                liveCoverage={runs.byoMap.data.coverage as Record<string, Coverage> | undefined}
                extractRun={runs.byoExtract}
                mapRun={runs.byoMap}
                onRun={(name, text) => {
                  runs.byoMap.reset();
                  start("byoExtract", "extract", { source: "custom", name, text });
                }}
                onOpenDoc={setDoc}
              />
            </TabsContent>
          </Tabs>
        </Pane>

        <div className="flex min-w-0 flex-col gap-4">
          <Pane
            title={L({ en: "Agent trace", ar: "مسار عمل الوكيل" })}
            subtitle={L(RUN_LABEL[active])}
            actions={
              <select
                value={active}
                onChange={(e) => setActive(e.target.value as RunKey)}
                className="h-7 rounded-md border border-border bg-card px-1.5 text-[11.5px] text-muted-foreground"
                aria-label="Run"
              >
                {(Object.keys(RUN_LABEL) as RunKey[]).map((k) => (
                  <option key={k} value={k}>
                    {L(RUN_LABEL[k])}
                    {runs[k].status === "running" ? " …" : ""}
                  </option>
                ))}
              </select>
            }
          >
            <AgentTrace run={runs[active]} title=" " />
          </Pane>

          <Pane title={L({ en: "Submission", ar: "التقديم" })}>
            <ul className="space-y-1.5 text-[12.5px]">
              <Check ok={r.cov.mapped > 0 && r.cov.missing === 0} warn={r.cov.mapped > 0 && r.cov.missing > 0} label={L({ en: "Requirements evidenced", ar: "المتطلبات المستوفاة" })} value={r.cov.mapped ? `${r.cov.met}/${r.cov.total}` : "—"} />
              <Check ok={r.cov.mapped > 0 && r.cov.mandatoryOpen === 0} warn={r.cov.mandatoryOpen > 0} label={L({ en: "Mandatory items open", ar: "بنود إلزامية مفتوحة" })} value={r.cov.mapped ? r.cov.mandatoryOpen : "—"} />
              <Check ok={r.drafted === seed.sections.length} warn={r.drafted < seed.sections.length} label={L({ en: "Sections drafted", ar: "الأقسام المصاغة" })} value={`${r.drafted}/${seed.sections.length}`} />
              <Check ok={r.claims.checked > 0 && r.claims.flagged === 0} warn={r.claims.flagged > 0 || r.claims.checked === 0} label={L({ en: "Unsupported claims", ar: "ادعاءات غير مدعومة" })} value={r.claims.checked ? r.claims.flagged : "—"} />
              <Check ok={r.claims.gaps === 0} warn={r.claims.gaps > 0} label={L({ en: "Evidence gaps in drafts", ar: "فجوات أدلة في المسودات" })} value={r.claims.gaps} />
              <Check ok={r.critical === 0} warn={r.critical > 0} label={L({ en: "Critical compliance flags", ar: "تنبيهات امتثال حرجة" })} value={r.critical} />
              <Check ok={r.openTasks === 0} warn={r.openTasks > 0} label={L({ en: "Open contributor tasks", ar: "مهام مفتوحة" })} value={r.openTasks} />
            </ul>
            <div className="mt-4 space-y-2">
              {pending ? (
                <ApprovalCard key={pending.id} approval={pending} onDecided={() => refresh()} />
              ) : approved ? (
                <>
                  {lastApproval && <ApprovalCard key={lastApproval.id} approval={lastApproval} compact />}
                  <Button className="w-full" onClick={exportPack}>
                    <Download /> {L({ en: "Export response pack (.md)", ar: "تصدير حزمة الرد (.md)" })}
                  </Button>
                </>
              ) : (
                <>
                  {lastApproval?.status === "rejected" && <ApprovalCard key={lastApproval.id} approval={lastApproval} compact />}
                  <Button className="w-full" onClick={requestApproval} disabled={requesting || !requirements.length}>
                    <ShieldCheck /> {L({ en: "Request submission approval", ar: "طلب اعتماد التقديم" })}
                  </Button>
                  <Button variant="outline" className="w-full" onClick={exportPack}>
                    <Download /> {L({ en: "Export draft pack (.md)", ar: "تصدير مسودة الحزمة (.md)" })}
                  </Button>
                </>
              )}
            </div>
          </Pane>

          <Pane title={L({ en: "Approved evidence library", ar: "مكتبة الأدلة المعتمدة" })} subtitle={`${library.length} ${L({ en: "documents · Raseen FM", ar: "مستنداً · رصين" })}`} flush>
            <ul className="scrollbar-thin max-h-[320px] divide-y divide-border overflow-auto">
              {library.map((d) => (
                <li key={d.id}>
                  <button type="button" onClick={() => setDoc(d.id)} className="flex w-full items-start gap-2.5 px-4 py-2 text-start hover:bg-muted/50">
                    <FileText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0">
                      <span className="block truncate text-[12.5px]">{lang === "ar" && d.title_ar ? d.title_ar : d.title}</span>
                      <span className="block truncate font-mono text-[10.5px] text-faint">
                        {d.ref ?? d.id}
                        {d.type ? ` · ${d.type}` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Pane>
        </div>
      </Workbench>

      <DocDialog docId={doc} onClose={() => setDoc(null)} endpoint={`${API}/doc`} />
    </SolutionPage>
  );
}

function Check({ ok, warn, label, value }: { ok: boolean; warn: boolean; label: string; value: string | number }) {
  return (
    <li className="flex items-center gap-2">
      <span className={cn("size-1.5 shrink-0 rounded-full", ok ? "bg-success" : warn ? "bg-warning" : "bg-faint")} />
      <span className="flex-1 text-muted-foreground">{label}</span>
      <span className="num font-medium">{value}</span>
    </li>
  );
}
