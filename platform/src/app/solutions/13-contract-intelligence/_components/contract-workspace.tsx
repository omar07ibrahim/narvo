"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpenCheck, CalendarClock, FileSignature, Library, MessageSquareText, ScrollText } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SolutionPage } from "@/components/narvo/solution-page";
import { Pane, Workbench } from "@/components/narvo/pane";
import { AgentTrace } from "@/components/narvo/agent-trace";
import { MetricTile } from "@/components/narvo/metric";
import { StatusPill } from "@/components/narvo/status";
import { useNarvoRun, type NarvoRun } from "@/hooks/use-narvo-run";
import { useFormat, useL, usePrefs } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { TODAY, obligationView } from "../_lib/dates";
import type { ContractState, Extraction, Finding, KpiFile, Playbook, RenewalBrief, Review } from "../_lib/types";
import { RegisterView, STATUS_TONE } from "./register-view";
import { ReviewView } from "./review-view";
import { ObligationsView } from "./obligations-view";
import { AskView } from "./ask-view";
import { RenewalView } from "./renewal-view";
import { DocDialog } from "./doc-dialog";
import { SCENARIO } from "./scenario";

const API = "/api/solutions/13-contract-intelligence";
type RunKey = "review" | "extract" | "ask" | "renewal";
const RUN_LABEL: Record<RunKey, { en: string; ar: string }> = {
  review: { en: "Playbook review", ar: "مراجعة الدليل" },
  extract: { en: "Obligation extraction", ar: "استخراج الالتزامات" },
  ask: { en: "Ask a contract", ar: "اسأل العقد" },
  renewal: { en: "Renewal brief", ar: "مذكرة التجديد" },
};

export function ContractWorkspace({ initial, playbook, kpi }: { initial: ContractState; playbook: Playbook; kpi: KpiFile }) {
  const L = useL();
  const f = useFormat();
  const { lang } = usePrefs();
  const [state, setState] = useState<ContractState>(initial);
  const [tab, setTab] = useState("register");
  const [sel, setSel] = useState("MNDA-CON-2023-019");
  const [target, setTarget] = useState("DRAFT-2026-CHC-OMNI");
  const [askId, setAskId] = useState("MNDA-CON-2023-019");
  const [extractTarget, setExtractTarget] = useState<string | null>(null);
  const [doc, setDoc] = useState<string | null>(null);
  const [active, setActive] = useState<RunKey>("review");
  const [byoTargets, setByoTargets] = useState<Array<{ id: string; name: string }>>(() =>
    Object.values(initial.reviews)
      .filter((r) => r.contractId.startsWith("BYO-"))
      .map((r) => ({ id: r.contractId, name: r.name })),
  );

  const runs: Record<RunKey, NarvoRun> = { review: useNarvoRun(), extract: useNarvoRun(), ask: useNarvoRun(), renewal: useNarvoRun() };
  const start = (k: RunKey, path: string, body: Record<string, unknown>) => {
    setActive(k);
    runs[k].start(`${API}/${path}`, body);
  };
  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`${API}/state`, { cache: "no-store" });
      if (r.ok) setState(await r.json());
    } catch {}
  }, []);

  const rev = runs.review.data.review as Review | undefined;
  useEffect(() => {
    if (!rev) return;
    setState((s) => ({ ...s, reviews: { ...s.reviews, [rev.contractId]: rev } }));
    setTarget(rev.contractId);
    if (rev.contractId.startsWith("BYO-")) setByoTargets((b) => (b.some((x) => x.id === rev.contractId) ? b : [...b, { id: rev.contractId, name: rev.name }]));
  }, [rev]);
  const ext = runs.extract.data.extraction as Extraction | undefined;
  useEffect(() => {
    if (ext) setState((s) => ({ ...s, extractions: { ...s.extractions, [ext.contractId]: ext } }));
  }, [ext]);
  const ren = runs.renewal.data.renewal as RenewalBrief | undefined;
  useEffect(() => {
    if (ren) refresh();
  }, [ren, refresh]);
  useEffect(() => {
    for (const k of Object.keys(runs) as RunKey[]) if (runs[k].status === "error" && runs[k].error) toast.error(`${L(RUN_LABEL[k])}: ${runs[k].error}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs.review.status, runs.extract.status, runs.ask.status, runs.renewal.status]);

  const views = useMemo(() => state.obligations.map((o) => obligationView(o, state.contracts)), [state]);
  const active_ = state.contracts.filter((c) => c.status !== "draft");
  const annual = active_.reduce((a, c) => a + (c.annualValue ?? 0), 0);
  const due30 = views.filter((v) => v.status === "due_soon").length;
  const overdue = views.filter((v) => v.status === "overdue").length;
  const notices = views.filter((v) => v.o.type === "notice" && v.status !== "done" && v.due && v.due <= "2026-12-31").length;
  const openFlags = Object.values(state.reviews).reduce((a, r) => a + r.findings.filter((x) => x.status !== "compliant" && !x.decision).length, 0);
  const upcoming = views.filter((v) => v.status !== "done").sort((a, b) => ((a.due ?? "9") < (b.due ?? "9") ? -1 : 1)).slice(0, 6);

  async function decide(contractId: string, positionId: string, decision: Finding["decision"] | null) {
    const res = await fetch(`${API}/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contractId, positionId, decision }) });
    if (!res.ok) return void toast.error(await res.text());
    const d = await res.json();
    setState((s) => ({ ...s, reviews: { ...s.reviews, [contractId]: d.review } }));
  }
  async function sendRedlines(contractId: string) {
    const res = await fetch(`${API}/redlines`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contractId, lang }) });
    if (!res.ok) return void toast.error(await res.text());
    await refresh();
    toast.success(L({ en: "Redline pack routed to the Head of Legal Affairs", ar: "أُحيلت حزمة التعديلات إلى رئيسة الشؤون القانونية" }));
  }
  async function confirm(contractId: string, keys: string[]) {
    const res = await fetch(`${API}/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contractId, keys, lang }) });
    if (!res.ok) return void toast.error(await res.text());
    await refresh();
    toast.success(L({ en: "Sent to Shamma Khalid Al Mansoori for confirmation", ar: "أُرسلت إلى شما المنصوري للتأكيد" }));
  }
  async function action(id: string, text: string, close: boolean) {
    const res = await fetch(`${API}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ obligationId: id, action: text, close }) });
    if (!res.ok) throw new Error(await res.text());
    const d = await res.json();
    setState((s) => ({ ...s, obligations: d.obligations }));
  }

  return (
    <SolutionPage slug="13-contract-intelligence" scenario={SCENARIO}>
      <div className="grid grid-cols-6 gap-3 max-xl:grid-cols-3 max-md:grid-cols-2">
        <MetricTile label={L({ en: "Contracts in force", ar: "العقود السارية" })} value={active_.length} sub={`+1 ${L({ en: "draft under review", ar: "مسودة قيد المراجعة" })}`} />
        <MetricTile label={L({ en: "Annual committed", ar: "الالتزام السنوي" })} value={`${(annual / 1e6).toFixed(2)}M`} sub="AED / yr" />
        <MetricTile label={L({ en: "Due ≤ 30 days", ar: "مستحقة خلال 30 يوماً" })} value={due30} tone={due30 ? "warning" : "default"} sub={L({ en: `from ${f.date(TODAY)}`, ar: `من ${f.date(TODAY)}` })} />
        <MetricTile label={L({ en: "Overdue", ar: "متأخرة" })} value={overdue} tone={overdue ? "danger" : "success"} />
        <MetricTile label={L({ en: "Notices before 31 Dec", ar: "إشعارات قبل 31 ديسمبر" })} value={notices} tone="ai" sub={L({ en: "renewal / non-renewal", ar: "تجديد / عدم تجديد" })} />
        <MetricTile label={L({ en: "Open review flags", ar: "ملاحظات مراجعة مفتوحة" })} value={openFlags} sub={L({ en: "awaiting a reviewer", ar: "بانتظار مراجع" })} />
      </div>

      <Workbench cols="minmax(0,1fr) 320px">
        <Pane flush className="min-h-[640px]">
          <Tabs value={tab} onValueChange={setTab} className="gap-0">
            <div className="border-b border-border px-3 pt-2">
              <TabsList variant="line" className="h-9">
                <TabsTrigger value="register" className="px-2.5 text-[12.5px]">
                  <Library /> {L({ en: "Contract register", ar: "سجل العقود" })}
                </TabsTrigger>
                <TabsTrigger value="review" className="px-2.5 text-[12.5px]">
                  <ScrollText /> {L({ en: "Playbook review", ar: "مراجعة الدليل" })}
                </TabsTrigger>
                <TabsTrigger value="obligations" className="px-2.5 text-[12.5px]">
                  <CalendarClock /> {L({ en: "Obligations", ar: "الالتزامات" })}
                  {overdue > 0 && <span className="num ms-1 rounded-full bg-danger px-1.5 text-[10px] text-white">{overdue}</span>}
                </TabsTrigger>
                <TabsTrigger value="ask" className="px-2.5 text-[12.5px]">
                  <MessageSquareText /> {L({ en: "Ask a contract", ar: "اسأل العقد" })}
                </TabsTrigger>
                <TabsTrigger value="renewal" className="px-2.5 text-[12.5px]">
                  <FileSignature /> {L({ en: "Renewal — 019", ar: "التجديد — 019" })}
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="register" className="p-4">
              <RegisterView
                state={state}
                sel={sel}
                onSelect={setSel}
                onReview={(id) => {
                  setTarget(id);
                  setTab("review");
                  start("review", "review", { contractId: id });
                }}
                onExtract={(id) => {
                  setExtractTarget(id);
                  setTab("obligations");
                  start("extract", "extract", { contractId: id });
                }}
                onAsk={(id) => {
                  setAskId(id);
                  setTab("ask");
                }}
                onOpenDoc={setDoc}
              />
            </TabsContent>
            <TabsContent value="review" className="p-4">
              <ReviewView
                state={state}
                playbook={playbook}
                target={target}
                byoTargets={byoTargets}
                onTarget={setTarget}
                run={runs.review}
                onRun={(id) => start("review", "review", { contractId: id })}
                onRunText={(name, text) => start("review", "review", { name, text })}
                onDecide={decide}
                onSendRedlines={sendRedlines}
                onExtract={(id) => {
                  setExtractTarget(id);
                  setTab("obligations");
                  start("extract", "extract", { contractId: id });
                }}
                onOpenDoc={setDoc}
                onDecided={refresh}
              />
            </TabsContent>
            <TabsContent value="obligations" className="p-4">
              <ObligationsView state={state} extractRun={runs.extract} extractTarget={extractTarget} onAction={action} onConfirm={confirm} onRenewal={() => setTab("renewal")} onDecided={refresh} />
            </TabsContent>
            <TabsContent value="ask" className="p-4">
              <AskView state={state} contractId={askId} onContract={setAskId} run={runs.ask} onAsk={(question, history) => start("ask", "ask", { contractId: askId, question, history })} />
            </TabsContent>
            <TabsContent value="renewal" className="p-4">
              <RenewalView state={state} kpi={kpi} run={runs.renewal} onRun={() => start("renewal", "renewal", {})} onDecided={refresh} />
            </TabsContent>
          </Tabs>
        </Pane>

        <div className="flex min-w-0 flex-col gap-4">
          <Pane
            title={L({ en: "Agent trace", ar: "مسار عمل الوكيل" })}
            subtitle={L(RUN_LABEL[active])}
            actions={
              <select value={active} onChange={(e) => setActive(e.target.value as RunKey)} className="h-7 rounded-md border border-border bg-card px-1.5 text-[11.5px] text-muted-foreground" aria-label="Run">
                {(Object.keys(RUN_LABEL) as RunKey[]).map((k) => (
                  <option key={k} value={k}>
                    {L(RUN_LABEL[k])}
                    {runs[k].running ? " …" : ""}
                  </option>
                ))}
              </select>
            }
          >
            <AgentTrace run={runs[active]} title=" " />
          </Pane>
          <Pane title={L({ en: "Next deadlines", ar: "المواعيد القادمة" })} flush>
            <ul className="divide-y divide-border">
              {upcoming.map((v) => (
                <li key={v.o.id} className="flex items-start gap-2.5 px-4 py-2">
                  <StatusPill tone={STATUS_TONE[v.status]} className="mt-0.5 w-12 justify-center">
                    {v.days != null ? `${v.days}d` : "—"}
                  </StatusPill>
                  <div className="min-w-0 text-[12px] leading-snug">
                    <div className={cn("truncate", v.o.critical && "font-medium")}>{L(v.o.title)}</div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {v.c?.ref} · {v.o.owner}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Pane>
          <Pane title={L({ en: "Contract playbook", ar: "دليل مواقف التعاقد" })} subtitle={`${playbook.ref} · ${playbook.positions.length} ${L({ en: "positions", ar: "موقفاً" })}`} flush>
            <ul className="scrollbar-thin max-h-[260px] divide-y divide-border overflow-auto">
              {playbook.positions.map((p) => (
                <li key={p.id} className="px-4 py-2 text-[12px]">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10.5px] text-muted-foreground">{p.id}</span>
                    <span className="font-medium">{L(p.topic)}</span>
                    <span className={cn("ms-auto size-1.5 rounded-full", p.severity === "high" ? "bg-danger" : p.severity === "medium" ? "bg-warning" : "bg-faint")} />
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{p.position}</p>
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-1.5 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
              <BookOpenCheck className="size-3" /> {playbook.owner}
            </div>
          </Pane>
        </div>
      </Workbench>
      <DocDialog docId={doc} onClose={() => setDoc(null)} endpoint={`${API}/doc`} />
    </SolutionPage>
  );
}
