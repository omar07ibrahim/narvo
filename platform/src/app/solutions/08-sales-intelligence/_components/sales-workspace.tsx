"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Columns3, PanelsTopLeft, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useL, usePrefs } from "@/lib/i18n";
import { useNarvoRun } from "@/hooks/use-narvo-run";
import type { ApprovalSummary, Citation } from "@/lib/ai/events";
import { SolutionPage, type ScenarioStep } from "@/components/narvo/solution-page";
import { Pane, Workbench } from "@/components/narvo/pane";
import { MetricTile } from "@/components/narvo/metric";
import { AgentTrace } from "@/components/narvo/agent-trace";
import { SourceList } from "@/components/narvo/sources";
import { ApprovalCard } from "@/components/narvo/approval-card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMoney } from "./bits";
import { buildOppRows, FilterBar, PipelineBoard, PipelineList, type PipelineFilter } from "./pipeline";
import { OppHeader } from "./opp-header";
import { BriefTab } from "./brief-tab";
import { ConflictsTab } from "./conflicts-tab";
import { HandoverTab } from "./handover-tab";
import { ActionTab } from "./action-tab";
import { TimelineTab } from "./timeline-tab";
import { ByoTab } from "./byo-tab";
import { detectConflicts, oppHealth, pipelineKpis } from "../_lib/calc";
import type { SalesData } from "../_lib/types";

const SLUG = "08-sales-intelligence";
const API = `/api/solutions/${SLUG}`;

const SCENARIO: ScenarioStep[] = [
  {
    title: { en: "Spot the stalled deals", ar: "اكتشف الصفقات المتعثرة" },
    body: {
      en: "The board shows 13 open opportunities. Six are flagged stalled — computed from days in stage against each stage's threshold and overdue next steps. Gulf Crest's Marina Quarter Tower B package (AED 3.42M) has sat 23 days in Negotiation and changed owner on 1 October.",
      ar: "تعرض اللوحة 13 فرصة مفتوحة، ست منها متعثرة — محسوبة من عدد الأيام في المرحلة مقارنة بحدها ومن الخطوات التالية المتأخرة. حزمة برج المارينا B لشركة جلف كريست (3.42 مليون درهم) عالقة منذ 23 يوماً في التفاوض وتغيّر مسؤولها في 1 أكتوبر.",
    },
  },
  {
    title: { en: "Build the account brief", ar: "أعدّ ملخص الحساب" },
    body: {
      en: "Open Tower B and build the brief. NARVO reads 19 records — emails, Arabic WhatsApp messages, meeting and call notes, the expired quote, the customer's draft PO and the credit file — and writes a cited brief in seconds instead of 75 minutes. Hover any citation to see the exact source.",
      ar: "افتح برج B وأعدّ الملخص. يقرأ نارفو 19 سجلاً — رسائل بريد وواتساب بالعربية ومحاضر اجتماعات ومكالمات وعرض السعر المنتهي ومسودة أمر الشراء والملف الائتماني — ويكتب ملخصاً موثقاً خلال ثوانٍ بدلاً من 75 دقيقة. مرّر المؤشر على أي مرجع لرؤية المصدر.",
    },
  },
  {
    title: { en: "Resolve conflicting terms", ar: "عالج الشروط المتعارضة" },
    body: {
      en: "Terms & conflicts compares quote, draft PO and frame agreement line by line in code: AED 66,575 below frame, 90 vs 60 days, prices fixed to June 2027, Sunday 07:00 deliveries, 5% retention and credit already over limit. 'Explain & recommend' adds the resolution and who must approve each point.",
      ar: "تقارن «الشروط والتعارضات» العرض ومسودة أمر الشراء والاتفاقية بنداً ببند برمجياً: 66,575 درهم أقل من الاتفاقية، 90 يوماً مقابل 60، أسعار ثابتة حتى يونيو 2027، تسليم الأحد الساعة 07:00، محتجزات 5%، وتعرض ائتماني فوق الحد. «اشرح واقترح الحل» يضيف الحل ومن يعتمد كل بند.",
    },
  },
  {
    title: { en: "Take over with a handover pack", ar: "استلم الحساب بحزمة تسليم" },
    body: {
      en: "The handover pack reconstructs every commitment from the record — including Ahmed's '~2,700' hint the customer now treats as agreed, and the Sales Director's instruction that never made it into the four-line handover note.",
      ar: "تعيد حزمة التسليم بناء كل التزام من السجل — بما فيه تلميح أحمد بسعر «نحو 2,700» الذي يعامله المتعامل الآن كاتفاق، وتوجيه مدير المبيعات الذي لم يرد في مذكرة التسليم المكونة من أربعة أسطر.",
    },
  },
  {
    title: { en: "Accept the next action in the CRM", ar: "اعتمد الخطوة التالية في النظام" },
    body: {
      en: "Propose the next best action — an English email or an Arabic WhatsApp. Edit the draft; computed guardrails check it against frame rates and credit policy. Submit: Fadi Khoury approves, the interaction is logged, the next step and date update — and Tower B is no longer stalled.",
      ar: "اقترح الخطوة التالية — بريداً بالإنجليزية أو واتساب بالعربية. عدّل المسودة؛ تفحصها الضوابط مقابل أسعار الاتفاقية وسياسة الائتمان. أرسلها: يعتمدها فادي خوري، فيُسجَّل التفاعل وتتحدث الخطوة التالية وموعدها — ولا يعود برج B متعثراً.",
    },
  },
  {
    title: { en: "Bring your own message", ar: "أضف رسالتك الخاصة" },
    body: {
      en: "Paste any customer email (try Imran Qureshi's Arabic email), drop an .eml, or dictate a call note. NARVO extracts requested changes and claims, checks each against the contract and credit policy, and proposes the CRM update for approval.",
      ar: "الصق أي بريد من متعامل (جرّب بريد عمران قريشي بالعربية)، أو أسقط ملف ‎.eml، أو أملِ ملاحظة مكالمة صوتياً. يستخرج نارفو التغييرات المطلوبة والادعاءات، ويفحص كلاً منها مقابل العقد وسياسة الائتمان، ويقترح تحديث السجل للاعتماد.",
    },
  },
];

type TabKey = "brief" | "conflicts" | "handover" | "action" | "timeline" | "byo";
type RunKey = "brief" | "conflicts" | "handover" | "action" | "ingest";
const TAB_RUN: Partial<Record<TabKey, RunKey>> = { brief: "brief", conflicts: "conflicts", handover: "handover", action: "action", byo: "ingest" };

interface ModuleApproval extends ApprovalSummary {
  oppId?: string;
  kind?: string;
  decidedAt?: number;
}

export function SalesWorkspace({ initial }: { initial: SalesData }) {
  const L = useL();
  const { lang } = usePrefs();
  const m = useMoney();
  const [data, setData] = useState<SalesData>(initial);
  const [view, setView] = useState<"board" | "workspace">("board");
  const [selectedId, setSelectedId] = useState<string>("OPP-2026-0418");
  const [filter, setFilter] = useState<PipelineFilter>({ owner: "all", stalledOnly: false, q: "" });
  const [tab, setTab] = useState<TabKey>("brief");
  const [lastRun, setLastRun] = useState<RunKey>("brief");
  const [highlight, setHighlight] = useState<number | null>(null);
  const [approvals, setApprovals] = useState<ModuleApproval[]>([]);
  const mountedAt = useRef(Date.now());

  const runs = {
    brief: useNarvoRun(),
    conflicts: useNarvoRun(),
    handover: useNarvoRun(),
    action: useNarvoRun(),
    ingest: useNarvoRun(),
  };

  const refresh = useCallback(async () => {
    try {
      const [d, a] = await Promise.all([fetch(`${API}/data`).then((r) => r.json()), fetch(`/api/approvals?solution=${SLUG}`).then((r) => r.json())]);
      if (!d.error) setData(d);
      const list = (a.approvals ?? []) as Array<ModuleApproval & { payload?: { opportunityId?: string; kind?: string } }>;
      setApprovals(
        list
          .filter((x) => x.status === "pending" || (x.decidedAt ?? 0) > mountedAt.current)
          .map((x) => ({
            id: x.id,
            title: x.title,
            summary: x.summary,
            solution: x.solution,
            actionLabel: x.actionLabel,
            approver: x.approver,
            status: x.status,
            createdAt: x.createdAt,
            decidedAt: x.decidedAt,
            oppId: x.payload?.opportunityId,
            kind: x.payload?.kind,
          })),
      );
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const kpis = useMemo(() => pipelineKpis(data), [data]);
  const owners = useMemo(() => Array.from(new Set(data.opportunities.map((o) => o.owner))).sort(), [data]);
  const rows = useMemo(() => buildOppRows(data, filter), [data, filter]);
  const opp = data.opportunities.find((o) => o.id === selectedId) ?? data.opportunities[0];
  const account = data.accounts.find((a) => a.id === opp.accountId)!;
  const health = useMemo(() => oppHealth(opp, data.interactions, data.today), [opp, data]);
  const report = useMemo(() => detectConflicts(data, opp), [data, opp]);
  const handover = data.handovers.find((h) => h.accountIds.includes(opp.accountId)) ?? null;
  const handoverNote = handover ? (data.interactions.find((i) => i.id === handover.handoverNoteId) ?? null) : null;

  function resetRuns() {
    Object.values(runs).forEach((r) => r.reset());
    setHighlight(null);
  }

  function openOpp(id: string) {
    if (id !== selectedId) resetRuns();
    setSelectedId(id);
    setView("workspace");
  }

  function start(key: RunKey, path: string, body: Record<string, unknown>) {
    setLastRun(key);
    setHighlight(null);
    runs[key].start(`${API}/${path}`, { opportunityId: opp.id, ...body });
  }

  // Refresh cached AI results after runs complete.
  const doneSig = Object.values(runs)
    .map((r) => r.status)
    .join("|");
  useEffect(() => {
    if (Object.values(runs).some((r) => r.status === "done")) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneSig]);

  const activeKey = TAB_RUN[tab] ?? lastRun;
  const activeRun = runs[activeKey];
  const cacheFor = (kind: string) => {
    const c = data.cache[`${kind}:${opp.id}`];
    return c && c.lang === lang ? c : undefined;
  };
  const activeCitations = ((activeRun.status !== "idle" ? activeRun.data.citations : activeKey === "brief" || activeKey === "handover" || activeKey === "conflicts" ? cacheFor(activeKey)?.citations : undefined) ??
    []) as Citation[];
  const usedText = activeKey === "brief" ? (activeRun.text.brief ?? cacheFor("brief")?.text) : activeKey === "handover" ? (activeRun.text.pack ?? cacheFor("handover")?.text) : undefined;

  const oppApprovals = approvals.filter((a) => a.oppId === opp.id).sort((a, b) => b.createdAt - a.createdAt);
  const latestOf = (kind: string) => oppApprovals.find((a) => a.kind === kind && (a.status === "pending" || a.createdAt > mountedAt.current)) ?? null;
  const actionApproval = runs.action.status !== "idle" ? latestOf("follow_up") : null;
  const ingestApproval = runs.ingest.status !== "idle" ? latestOf("inbound_log") : null;

  function onApprovalCreated(a: ApprovalSummary, kind: string) {
    setApprovals((list) => [{ ...a, oppId: opp.id, kind }, ...list.filter((x) => x.id !== a.id)]);
  }
  function onDecided(id: string, status: "approved" | "rejected") {
    setApprovals((list) => list.map((a) => (a.id === id ? { ...a, status, decidedAt: Date.now() } : a)));
    setTimeout(refresh, 250);
  }

  function cite(n: number) {
    setHighlight(n);
    document.getElementById(`src-${n}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  const pendingCount = approvals.filter((a) => a.status === "pending").length;

  return (
    <SolutionPage slug={SLUG} scenario={SCENARIO}>
      <div className="grid grid-cols-4 gap-4 max-lg:grid-cols-2">
        <MetricTile
          label={L({ en: "Open pipeline", ar: "الفرص المفتوحة" })}
          // The tile renders its value left-to-right; "13.50 مليون درهم" must keep its own (RTL) order.
          value={<span dir="auto">{m.compact(kpis.openValue)}</span>}
          sub={L({ en: `${kpis.openCount} opportunities · weighted ${m.compact(kpis.weightedValue)}`, ar: `${kpis.openCount} فرصة · مرجّحة ${m.compact(kpis.weightedValue)}` })}
        />
        <MetricTile
          label={L({ en: "Stalled", ar: "متعثرة" })}
          value={kpis.stalledCount}
          tone={kpis.stalledCount ? "warning" : "success"}
          sub={L({ en: `${m.compact(kpis.stalledValue)} beyond stage threshold`, ar: `${m.compact(kpis.stalledValue)} تجاوزت حد المرحلة` })}
        />
        <MetricTile
          label={L({ en: "Terms in conflict", ar: "شروط متعارضة" })}
          value={kpis.conflictCount}
          tone={kpis.conflictCount ? "danger" : "success"}
          sub={L({ en: `on ${kpis.conflictOpps} opportunities · ${m.compact(kpis.belowFrameAed)} below frame`, ar: `في ${kpis.conflictOpps} فرص · ${m.compact(kpis.belowFrameAed)} دون الاتفاقية` })}
        />
        <MetricTile
          label={L({ en: "Next steps current", ar: "خطوات تالية محدثة" })}
          value={`${kpis.currentPct}%`}
          tone="ai"
          sub={L({
            en: `${kpis.currentCount} of ${kpis.openCount} records dated ahead${kpis.loggedViaNarvo ? ` · ${kpis.loggedViaNarvo} logged via NARVO` : ""}`,
            ar: `${kpis.currentCount} من ${kpis.openCount} سجلات بمواعيد قادمة${kpis.loggedViaNarvo ? ` · ${kpis.loggedViaNarvo} عبر نارفو` : ""}`,
          })}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border border-border bg-card p-0.5">
            {(
              [
                ["board", L({ en: "Pipeline board", ar: "لوحة الفرص" }), Columns3],
                ["workspace", L({ en: "Opportunity workspace", ar: "مساحة عمل الفرصة" }), PanelsTopLeft],
              ] as const
            ).map(([v, label, Icon]) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cn("flex h-7 items-center gap-1.5 rounded-[5px] px-2.5 text-[12px] transition-colors", view === v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
              >
                <Icon className="size-3.5" strokeWidth={1.75} />
                {label}
              </button>
            ))}
          </div>
          {pendingCount > 0 && (
            <span className="flex items-center gap-1.5 text-[11.5px] text-warning">
              <ShieldCheck className="size-3.5" />
              {L({ en: `${pendingCount} awaiting approval`, ar: `${pendingCount} بانتظار الاعتماد` })}
            </span>
          )}
        </div>
        {view === "board" && <FilterBar owners={owners} filter={filter} onChange={setFilter} />}
      </div>

      {view === "board" ? (
        <PipelineBoard rows={rows} onOpen={openOpp} selectedId={selectedId} />
      ) : (
        <Workbench cols="290px minmax(0,1fr) 340px">
          <Pane
            title={L({ en: "Pipeline", ar: "الفرص" })}
            flush
            className="h-[calc(100vh-200px)] min-h-[700px]"
            bodyClassName="scrollbar-thin overflow-auto"
            actions={
              <button type="button" onClick={() => setView("board")} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                <ChevronLeft className="size-3 rtl:rotate-180" />
                {L({ en: "Board", ar: "اللوحة" })}
              </button>
            }
          >
            <div className="border-b border-border px-3 py-2">
              <FilterBar owners={owners} filter={filter} onChange={setFilter} compact />
            </div>
            <PipelineList rows={rows} selectedId={selectedId} onOpen={openOpp} />
          </Pane>

          <section className="flex h-[calc(100vh-200px)] min-h-[700px] min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
            <OppHeader opp={opp} account={account} health={health} quote={report.quote} />
            <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="min-h-0 flex-1 gap-0">
              <div className="border-b border-border px-4">
                <TabsList variant="line" className="h-10">
                  <TabsTrigger value="brief" className="text-[12.5px]">
                    {L({ en: "Brief", ar: "الملخص" })}
                  </TabsTrigger>
                  <TabsTrigger value="conflicts" className="text-[12.5px]">
                    {L({ en: "Terms & conflicts", ar: "الشروط والتعارضات" })}
                    {report.conflicts.filter((c) => c.severity !== "low").length > 0 && (
                      <span className="num ms-1 rounded-full bg-danger-soft px-1.5 text-[10px] text-danger">{report.conflicts.filter((c) => c.severity !== "low").length}</span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="handover" className="text-[12.5px]">
                    {L({ en: "Handover", ar: "التسليم" })}
                  </TabsTrigger>
                  <TabsTrigger value="action" className="text-[12.5px]">
                    {L({ en: "Next action", ar: "الخطوة التالية" })}
                  </TabsTrigger>
                  <TabsTrigger value="timeline" className="text-[12.5px]">
                    {L({ en: "Timeline", ar: "السجل الزمني" })}
                  </TabsTrigger>
                  <TabsTrigger value="byo" className="text-[12.5px]">
                    {L({ en: "Bring your own", ar: "أضف رسالتك" })}
                  </TabsTrigger>
                </TabsList>
              </div>
              <div key={opp.id} className="scrollbar-thin min-h-0 flex-1 overflow-auto p-5">
                <div hidden={tab !== "brief"}>
                  <BriefTab opp={opp} account={account} health={health} quote={report.quote} run={runs.brief} cached={cacheFor("brief")} onRun={() => start("brief", "brief", {})} onCite={cite} />
                </div>
                <div hidden={tab !== "conflicts"}>
                  <ConflictsTab report={report} run={runs.conflicts} cached={cacheFor("conflicts")} onRun={() => start("conflicts", "conflicts", {})} onCite={cite} />
                </div>
                <div hidden={tab !== "handover"}>
                  <HandoverTab
                    opp={opp}
                    handover={handover}
                    note={handoverNote}
                    accounts={data.accounts}
                    run={runs.handover}
                    cached={cacheFor("handover")}
                    onRun={() => start("handover", "handover", {})}
                    onCite={cite}
                  />
                </div>
                <div hidden={tab !== "action"}>
                  <ActionTab
                    opp={opp}
                    today={data.today}
                    report={report}
                    run={runs.action}
                    onRun={(o) => start("action", "next-action", o)}
                    onCite={cite}
                    approval={actionApproval}
                    onApprovalCreated={(a) => onApprovalCreated(a, "follow_up")}
                    onDecided={onDecided}
                  />
                </div>
                <div hidden={tab !== "timeline"}>
                  <TimelineTab interactions={data.interactions} opps={data.opportunities} oppId={opp.id} />
                </div>
                <div hidden={tab !== "byo"}>
                  <ByoTab
                    opp={opp}
                    samples={data.samples}
                    run={runs.ingest}
                    onRun={(text) => start("ingest", "ingest", { text })}
                    approval={ingestApproval}
                    onApprovalCreated={(a) => onApprovalCreated(a, "inbound_log")}
                    onDecided={onDecided}
                  />
                </div>
              </div>
            </Tabs>
          </section>

          <div className="flex h-[calc(100vh-200px)] min-h-[700px] min-w-0 flex-col gap-4">
            <Pane className="shrink-0" bodyClassName="max-h-[300px] overflow-auto scrollbar-thin">
              <AgentTrace
                run={activeRun}
                emptyHint={L({
                  en: "Each capability runs as a traced pipeline — records gathered, numbers computed in code, policy retrieved, then the model writes. Run one to see its steps.",
                  ar: "تعمل كل قدرة كمسار متتبَّع — جمع السجلات، حساب الأرقام برمجياً، استرجاع السياسات، ثم يكتب النموذج. شغّل إحداها لرؤية خطواتها.",
                })}
              />
            </Pane>
            {oppApprovals.length > 0 && (
              <Pane title={L({ en: "Approvals", ar: "الاعتمادات" })} className="shrink-0" bodyClassName="space-y-2 max-h-[260px] overflow-auto scrollbar-thin">
                {oppApprovals.map((a) => (
                  <ApprovalCard key={`${a.id}-${a.status}`} approval={a} compact onDecided={(s) => onDecided(a.id, s)} />
                ))}
              </Pane>
            )}
            <Pane
              title={L({ en: "Sources", ar: "المصادر" })}
              subtitle={activeCitations.length ? L({ en: `${activeCitations.length} records the model was allowed to use`, ar: `${activeCitations.length} سجلات سُمح للنموذج باستخدامها` }) : undefined}
              className="min-h-0 flex-1"
              bodyClassName="scrollbar-thin overflow-auto"
            >
              <SourceList citations={activeCitations} highlight={highlight} usedOnly={false} text={usedText} />
            </Pane>
          </div>
        </Workbench>
      )}
    </SolutionPage>
  );
}
