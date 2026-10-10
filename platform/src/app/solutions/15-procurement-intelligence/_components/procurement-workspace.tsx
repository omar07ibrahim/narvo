"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, ClipboardList, FileText, MailQuestion, Scale, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SolutionPage } from "@/components/narvo/solution-page";
import { Pane, Workbench } from "@/components/narvo/pane";
import { AgentTrace } from "@/components/narvo/agent-trace";
import { MetricTile } from "@/components/narvo/metric";
import { StatusPill } from "@/components/narvo/status";
import { useNarvoRun, type NarvoRun } from "@/hooks/use-narvo-run";
import { useFormat, useL, usePrefs } from "@/lib/i18n";
import { computeScores, fmtDate } from "../_lib/scoring";
import type { PriceSchedule, ProcState, Rfq, SupplierEval, Tender } from "../_lib/types";
import { EvaluationView } from "./evaluation-view";
import { ScoringView } from "./scoring-view";
import { ClarificationsView, type ReceivedResponse } from "./clarifications-view";
import { ReportView } from "./report-view";
import { RegisterView } from "./register-view";
import { SourcingView } from "./sourcing-view";
import { DocDialog } from "./doc-dialog";
import { SCENARIO } from "./scenario";

const API = "/api/solutions/15-procurement-intelligence";
type RunKey = "evaluate" | "clarify" | "response" | "report" | "sourcing";
const RUN_LABEL: Record<RunKey, { en: string; ar: string }> = {
  evaluate: { en: "Submission comparison", ar: "مقارنة العروض" },
  clarify: { en: "Clarification drafting", ar: "صياغة الاستيضاح" },
  response: { en: "Clarification response", ar: "رد الاستيضاح" },
  report: { en: "Evaluation report", ar: "تقرير التقييم" },
  sourcing: { en: "RFQ drafting", ar: "صياغة طلب العروض" },
};

export function ProcurementWorkspace({
  tender,
  initial,
  prices,
  responses,
}: {
  tender: Tender;
  initial: ProcState;
  prices: PriceSchedule[];
  responses: ReceivedResponse[];
}) {
  const L = useL();
  const f = useFormat();
  const { lang } = usePrefs();
  const [state, setState] = useState<ProcState>(initial);
  const [tab, setTab] = useState("evaluation");
  const [doc, setDoc] = useState<string | null>(null);
  const [active, setActive] = useState<RunKey>("evaluate");
  const [busySupplier, setBusySupplier] = useState<string | null>(null);
  const [awarding, setAwarding] = useState(false);

  const runs: Record<RunKey, NarvoRun> = {
    evaluate: useNarvoRun(),
    clarify: useNarvoRun(),
    response: useNarvoRun(),
    report: useNarvoRun(),
    sourcing: useNarvoRun(),
  };
  const start = (k: RunKey, path: string, body: Record<string, unknown> = {}) => {
    setActive(k);
    runs[k].start(`${API}/${path}`, body);
  };
  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`${API}/state`, { cache: "no-store" });
      if (r.ok) setState(await r.json());
    } catch {}
  }, []);

  // streamed evaluations → state
  const evalEntries = Object.entries(runs.evaluate.data).filter(([k]) => k.startsWith("eval:"));
  const respEntries = Object.entries(runs.response.data).filter(([k]) => k.startsWith("eval:"));
  const evalSig = evalEntries.map(([k, v]) => `${k}${(v as SupplierEval).at}`).join("|") + respEntries.map(([k, v]) => `${k}${(v as SupplierEval).history?.length}`).join("|");
  useEffect(() => {
    if (!evalEntries.length && !respEntries.length) return;
    setState((s) => {
      const evaluations = { ...s.evaluations };
      for (const [k, v] of [...evalEntries, ...respEntries]) evaluations[k.slice(5)] = v as SupplierEval;
      return { ...s, evaluations };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evalSig]);

  useEffect(() => {
    if (["done", "error"].includes(runs.clarify.status) || ["done", "error"].includes(runs.response.status) || runs.report.status === "done" || runs.evaluate.status === "done") refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs.clarify.status, runs.response.status, runs.report.status, runs.evaluate.status]);

  useEffect(() => {
    for (const k of Object.keys(runs) as RunKey[]) if (runs[k].status === "error" && runs[k].error) toast.error(`${L(RUN_LABEL[k])}: ${runs[k].error}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs.evaluate.status, runs.clarify.status, runs.response.status, runs.report.status, runs.sourcing.status]);

  const rows = useMemo(() => computeScores(tender, state.suppliers, prices, state.evaluations, state.overrides), [tender, state, prices]);
  const ready = state.suppliers.every((s) => state.evaluations[s.id]);
  const ranked = rows.filter((r) => r.rank != null).sort((a, b) => a.rank! - b.rank!);
  const leader = ranked[0];
  const lowest = ranked.length ? Math.min(...ranked.map((r) => r.normPrice)) : null;
  const cells = Object.values(state.evaluations).flatMap((e) => e.criteria);
  const evidenced = cells.length ? Math.round((cells.filter((c) => c.status === "met").length / cells.length) * 100) : null;
  const openClar = state.clarifications.filter((c) => c.status === "issued").length + state.approvals.filter((a) => a.status === "pending" && a.title.includes("CLR")).length;
  const overrideCount = Object.values(state.overrides).reduce((a, m) => a + Object.keys(m).length, 0);
  const short = (id?: string) => state.suppliers.find((s) => s.id === id)?.short ?? "—";

  async function override(supplierId: string, criterionId: string, score: number | null, reason: string, by: string) {
    const res = await fetch(`${API}/override`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ supplierId, criterionId, score, reason, by }) });
    if (!res.ok) throw new Error(await res.text());
    const d = await res.json();
    setState((s) => ({ ...s, overrides: d.overrides }));
  }

  async function award() {
    setAwarding(true);
    try {
      const res = await fetch(`${API}/award`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lang }) });
      if (!res.ok) throw new Error(await res.text());
      await refresh();
      toast.success(L({ en: "Recommendation routed to the committee chair", ar: "أُحيلت التوصية إلى رئيس اللجنة" }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAwarding(false);
    }
  }

  async function saveRfq(rfq: Rfq) {
    const res = await fetch(`${API}/rfq`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rfq }) });
    if (!res.ok) return void toast.error(await res.text());
    const d = await res.json();
    setState((s) => ({ ...s, rfqs: d.rfqs }));
    toast.success(`${d.id} ${L({ en: "saved", ar: "حُفظ" })}`);
  }

  function exportReport() {
    if (!state.report) return;
    const blob = new Blob([`# Evaluation report — ${tender.ref}\n\n${state.report.text}\n\n---\nSources:\n${state.report.citations.map((c) => `[${c.n}] ${c.title} — § ${c.section}`).join("\n")}\n`], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tender.ref.replace(/\//g, "-")}-evaluation-report.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <SolutionPage slug="15-procurement-intelligence" scenario={SCENARIO}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border border-border bg-card px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="label-caps flex items-center gap-2">
            <span className="font-mono normal-case tracking-normal">{tender.ref}</span>
            <span className="h-px w-4 bg-border-strong" />
            {L(tender.method)}
          </div>
          <div className="mt-1 truncate text-[14px] font-medium">{L(tender.title)}</div>
        </div>
        <div className="flex flex-wrap items-center gap-5 text-[12px]">
          <div>
            <div className="text-muted-foreground">{L({ en: "Estimate", ar: "القيمة التقديرية" })}</div>
            <div className="num font-medium">{f.aed(tender.estimate)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">{L({ en: "Closed", ar: "أُغلقت" })}</div>
            <div className="num font-medium">{fmtDate(tender.closing)} · {tender.closingTime}</div>
          </div>
          <div>
            <div className="text-muted-foreground">{L({ en: "Weighting", ar: "الترجيح" })}</div>
            <div className="num font-medium">
              {tender.weights.technical}/{tender.weights.commercial} · {L({ en: "pass", ar: "النجاح" })} {tender.passMark}
            </div>
          </div>
          <StatusPill tone={state.tender.status === "award_recommended" ? "success" : "info"}>
            {state.tender.status === "award_recommended" ? L({ en: "Award recommended", ar: "موصى بالترسية" }) : L({ en: "Technical evaluation", ar: "التقييم الفني" })}
          </StatusPill>
        </div>
      </div>

      <div className="grid grid-cols-6 gap-3 max-xl:grid-cols-3 max-md:grid-cols-2">
        <MetricTile label={L({ en: "Bids received", ar: "العروض المستلمة" })} value={state.suppliers.length} sub={L({ en: "no late bids", ar: "لا عروض متأخرة" })} />
        <MetricTile label={L({ en: "Lowest compliant", ar: "أدنى سعر مطابق" })} value={lowest ? `${(lowest / 1e6).toFixed(2)}M` : "—"} sub={lowest ? `AED · ${short(ranked.find((r) => r.normPrice === lowest)?.supplierId)}` : L({ en: "after evaluation", ar: "بعد التقييم" })} />
        <MetricTile label={L({ en: "Criteria evidenced", ar: "المعايير المثبتة" })} value={evidenced != null ? `${evidenced}%` : "—"} tone="ai" sub={`${cells.filter((c) => c.status === "met").length}/${cells.length || 24}`} />
        <MetricTile label={L({ en: "Open clarifications", ar: "استيضاحات مفتوحة" })} value={openClar} tone={openClar ? "warning" : "default"} sub={`${state.clarifications.filter((c) => c.status === "answered").length} ${L({ en: "answered", ar: "أُجيبت" })}`} />
        <MetricTile label={L({ en: "Leading bid", ar: "العرض المتصدر" })} value={leader ? short(leader.supplierId) : "—"} sub={leader ? `${leader.total?.toFixed(2)} / 100` : undefined} />
        <MetricTile label={L({ en: "Overrides logged", ar: "تعديلات مسجلة" })} value={overrideCount} sub={L({ en: "Art. 30", ar: "المادة 30" })} />
      </div>

      <Workbench cols="minmax(0,1fr) 320px">
        <Pane flush className="min-h-[640px]">
          <Tabs value={tab} onValueChange={setTab} className="gap-0">
            <div className="border-b border-border px-3 pt-2">
              <TabsList variant="line" className="h-9">
                <TabsTrigger value="evaluation" className="px-2.5 text-[12.5px]">
                  <Scale /> {L({ en: "Evaluation matrix", ar: "مصفوفة التقييم" })}
                </TabsTrigger>
                <TabsTrigger value="scoring" className="px-2.5 text-[12.5px]">
                  <SlidersHorizontal /> {L({ en: "Scoring & sensitivity", ar: "الدرجات والحساسية" })}
                </TabsTrigger>
                <TabsTrigger value="clar" className="px-2.5 text-[12.5px]">
                  <MailQuestion /> {L({ en: "Clarifications", ar: "الاستيضاحات" })}
                  {openClar > 0 && <span className="num ms-1 text-[11px] text-warning">{openClar}</span>}
                </TabsTrigger>
                <TabsTrigger value="report" className="px-2.5 text-[12.5px]">
                  <FileText /> {L({ en: "Report & award", ar: "التقرير والترسية" })}
                </TabsTrigger>
                <TabsTrigger value="register" className="px-2.5 text-[12.5px]">
                  <Building2 /> {L({ en: "Supplier register", ar: "سجل الموردين" })}
                </TabsTrigger>
                <TabsTrigger value="sourcing" className="px-2.5 text-[12.5px]">
                  <ClipboardList /> {L({ en: "Sourcing", ar: "التوريد" })}
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="evaluation" className="p-4">
              <EvaluationView tender={tender} state={state} prices={prices} rows={rows} run={runs.evaluate} onRun={() => start("evaluate", "evaluate")} onOpenDoc={setDoc} />
            </TabsContent>
            <TabsContent value="scoring" className="p-4">
              <ScoringView tender={tender} state={state} prices={prices} onOverride={override} />
            </TabsContent>
            <TabsContent value="clar" className="p-4">
              <ClarificationsView
                tender={tender}
                state={state}
                responses={responses}
                clarRun={runs.clarify}
                respRun={runs.response}
                busySupplier={busySupplier}
                onDraft={(id) => {
                  setBusySupplier(id);
                  start("clarify", "clarify", { supplierId: id });
                }}
                onResponse={(id, text) => {
                  setBusySupplier(id);
                  start("response", "response", { supplierId: id, text });
                }}
                onDecided={refresh}
              />
            </TabsContent>
            <TabsContent value="report" className="p-4">
              <ReportView state={state} run={runs.report} ready={ready} onRun={() => start("report", "report")} onAward={award} awarding={awarding} onDecided={refresh} onExport={exportReport} />
            </TabsContent>
            <TabsContent value="register" className="p-4">
              <RegisterView tender={tender} state={state} onOpenDoc={setDoc} />
            </TabsContent>
            <TabsContent value="sourcing" className="p-4">
              <SourcingView run={runs.sourcing} rfqs={state.rfqs} onRun={(need, estimate) => start("sourcing", "sourcing", { need, estimate })} onSave={saveRfq} />
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
          <Pane title={L({ en: "Tender committee", ar: "لجنة المناقصات" })}>
            <ul className="space-y-2">
              {tender.committee.map((m) => (
                <li key={m.name} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground text-[9px] font-medium text-background">
                    {m.name
                      .replace(/^Eng\.\s*/, "")
                      .split(" ")
                      .filter((p) => !/^al$/i.test(p))
                      .slice(0, 2)
                      .map((p) => p[0])
                      .join("")}
                  </span>
                  <div className="min-w-0 text-[12px] leading-tight">
                    <div className="font-medium">{L({ en: m.name, ar: m.name_ar })}</div>
                    <div className="text-muted-foreground">{L(m.role)}</div>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
              {L({ en: "Conflict-of-interest declarations recorded 1 Oct 2026 (Art. 34). AI suggests; the committee decides.", ar: "سُجّلت إقرارات عدم تضارب المصالح في 1 أكتوبر 2026 (المادة 34). الذكاء الاصطناعي يقترح واللجنة تقرر." })}
            </p>
          </Pane>
          <Pane title={L({ en: "Procurement Manual v3.2", ar: "دليل المشتريات 3.2" })} flush>
            <ul className="divide-y divide-border">
              {[
                ["MNDA-PRC-MAN-3.2-A", { en: "Methods, thresholds & approvals", ar: "الطرق والحدود والاعتمادات" }],
                ["MNDA-PRC-MAN-3.2-B", { en: "Evaluation, clarifications & award", ar: "التقييم والاستيضاح والترسية" }],
                ["MNDA-PRC-MAN-3.2-C", { en: "Integrity, performance & records", ar: "النزاهة والأداء والسجلات" }],
              ].map(([id, t]) => (
                <li key={id as string}>
                  <button type="button" onClick={() => setDoc(id as string)} className="flex w-full items-center gap-2 px-4 py-2 text-start text-[12.5px] hover:bg-muted/50">
                    <FileText className="size-3.5 text-muted-foreground" />
                    {L(t as { en: string; ar: string })}
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
