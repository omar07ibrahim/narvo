"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileSearch, Gauge, ListChecks, Scale, ScanText, Timer, Wand2 } from "lucide-react";
import { SolutionPage } from "@/components/narvo/solution-page";
import { Workbench, Pane } from "@/components/narvo/pane";
import { MetricTile } from "@/components/narvo/metric";
import { StatusPill } from "@/components/narvo/status";
import { EmptyState } from "@/components/narvo/empty";
import type { DroppedFile } from "@/components/narvo/file-drop";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNarvoRun } from "@/hooks/use-narvo-run";
import { useL } from "@/lib/i18n";
import type { ApprovalSummary, Citation } from "@/lib/ai/events";
import { fmt2, matchAll, type MatchContext } from "../_lib/three-way";
import { computeTreatment } from "../_lib/treatments";
import { computeKpis } from "../_lib/kpis";
import { compareExtraction } from "../_lib/compare";
import type { Dataset } from "../_lib/types";
import { API, SCENARIO, SLUG, statusOf, SUPPLIER_SHORT } from "./labels";
import { BatchTable } from "./batch-table";
import { MatchView } from "./match-view";
import { DocumentTab } from "./document-tab";
import { ResolutionTab } from "./resolution-tab";
import { SideRail, type RunKey } from "./side-rail";

const PANE_H = "h-[calc(100vh-112px)] min-h-[660px] max-h-[1040px]";
const compact = (n: number) => (Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : Math.abs(n) >= 1e4 ? `${Math.round(n / 1e3).toLocaleString("en-US")}K` : fmt2(n));

export function FinanceWorkspace({
  initial,
  initialDoc,
  initialTab,
}: {
  initial: Dataset;
  initialDoc?: string;
  initialTab?: "match" | "document" | "resolution";
}) {
  const L = useL();
  const [data, setData] = useState<Dataset>(initial);
  const [selectedId, setSelectedId] = useState<string>(
    () =>
      initial.invoices.find((i) => i.id === initialDoc || i.supplierInvoiceNo === initialDoc)?.id ??
      initial.invoices.find((i) => i.supplierInvoiceNo === "SRM-26-1187")?.id ??
      initial.invoices[0]?.id,
  );
  const [tab, setTab] = useState<"match" | "document" | "resolution">(initialTab ?? "match");
  const [active, setActive] = useState<RunKey>("case");
  const [caseFor, setCaseFor] = useState<string | null>(null);
  const [extractFor, setExtractFor] = useState<string | null>(null);

  const caseRun = useNarvoRun();
  const extractRun = useNarvoRun();
  const byoRun = useNarvoRun();
  const askRun = useNarvoRun();
  const runs = { case: caseRun, extract: extractRun, byo: byoRun, ask: askRun };

  const ctx: MatchContext = useMemo(
    () => ({ invoices: data.invoices, pos: data.pos, grns: data.grns, suppliers: data.suppliers, policy: data.policy, vatRate: data.vatRate, history: data.history }),
    [data],
  );
  const matches = useMemo(() => matchAll(ctx), [ctx]);
  const kpis = useMemo(() => computeKpis(data.invoices, matches, data.history), [data.invoices, matches, data.history]);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`${API}/data`, { cache: "no-store" });
      if (r.ok) setData(await r.json());
    } catch {}
  }, []);

  useEffect(() => {
    if (caseRun.status === "done") refresh();
  }, [caseRun.status, refresh]);
  useEffect(() => {
    if (extractRun.status === "done") refresh();
  }, [extractRun.status, refresh]);
  useEffect(() => {
    if (byoRun.status === "done") refresh();
  }, [byoRun.status, refresh]);

  const inv = data.invoices.find((i) => i.id === selectedId) ?? data.invoices[0];
  const match = inv ? matches[inv.id] : undefined;
  const supplier = inv ? data.suppliers.find((s) => s.id === inv.supplierId) : undefined;
  const po = match?.poId ? data.pos.find((p) => p.id === match.poId) : undefined;
  const grns = match ? data.grns.filter((g) => match.grnIds.includes(g.id)) : [];
  const stored = inv ? data.cases[inv.id] : undefined;
  const storedX = inv ? data.extractions[inv.id] : undefined;
  const storedFields = useMemo(
    () => (inv && storedX ? compareExtraction(storedX.object, inv, supplier, data.company.trn, match) : undefined),
    [inv, storedX, supplier, data.company.trn, match],
  );
  const preview = useMemo(() => (inv && match ? computeTreatment(inv, match, ctx) : undefined), [inv, match, ctx]);

  const approvalStatus = (id?: string) => (id ? (data.approvals[id] ?? undefined) : undefined);
  const pendingIds = useMemo(() => {
    const s = new Set<string>();
    for (const c of Object.values(data.cases)) if (c.approval && (data.approvals[c.approval.id] ?? c.approval.status) === "pending") s.add(c.invoiceId);
    if (caseFor && caseRun.approvals.some((a) => a.status === "pending")) s.add(caseFor);
    return s;
  }, [data.cases, data.approvals, caseFor, caseRun.approvals]);

  const pendingQueue = useMemo(
    () =>
      Object.values(data.cases)
        .filter((c) => c.approval && c.invoiceId !== inv?.id && (data.approvals[c.approval.id] ?? c.approval.status) === "pending")
        .map((c) => {
          const i = data.invoices.find((x) => x.id === c.invoiceId);
          return {
            invoiceId: c.invoiceId,
            label: `${L(SUPPLIER_SHORT[i?.supplierId ?? ""] ?? { en: i?.supplierName ?? "", ar: i?.supplierName ?? "" })} · ${i?.supplierInvoiceNo ?? c.invoiceId}`,
            approval: { ...c.approval!, status: "pending" as const } satisfies ApprovalSummary,
          };
        }),
    [data.cases, data.approvals, data.invoices, inv?.id, L],
  );

  const citations: Citation[] = (caseFor === inv?.id && caseRun.data.citations) || stored?.citations || [];

  function select(id: string) {
    if (id !== selectedId) setTab("match");
    setSelectedId(id);
  }
  function readImage(force: boolean) {
    if (!inv) return;
    setExtractFor(inv.id);
    setActive("extract");
    extractRun.start(`${API}/extract`, { invoiceId: inv.id, force });
  }
  function buildCase() {
    if (!inv) return;
    setCaseFor(inv.id);
    setActive("case");
    setTab("resolution");
    caseRun.start(`${API}/resolve`, { invoiceId: inv.id });
  }
  function upload(f: DroppedFile) {
    setActive("byo");
    byoRun.start(`${API}/byo`, { dataUrl: f.dataUrl, fileName: f.name });
  }
  function ask(q: string) {
    setActive("ask");
    askRun.start(`${API}/ask`, { question: q });
  }
  async function decided() {
    await refresh();
  }

  const st = inv && match ? statusOf(inv, match, pendingIds.has(inv.id)) : null;

  return (
    <SolutionPage slug={SLUG} scenario={SCENARIO}>
      <div className="grid grid-cols-4 gap-4 max-lg:grid-cols-2">
        <MetricTile
          label={L({ en: "Auto-matched", ar: "مطابقة آلية" })}
          value={`${kpis.autoMatchedPct.toFixed(1)}%`}
          icon={<ListChecks className="size-4" strokeWidth={1.6} />}
          sub={L({
            en: `${kpis.autoMatched} of ${kpis.batchDocs} documents · AED ${compact(kpis.autoMatchedValue)}`,
            ar: `${kpis.autoMatched} من ${kpis.batchDocs} مستنداً · ${compact(kpis.autoMatchedValue)} درهم`,
          })}
        />
        <MetricTile
          label={L({ en: "Exceptions open", ar: "استثناءات مفتوحة" })}
          value={kpis.openExceptions}
          tone={kpis.openExceptions ? "warning" : "success"}
          icon={<Scale className="size-4" strokeWidth={1.6} />}
          sub={L({
            en: `AED ${fmt2(kpis.openVariance)} variance${kpis.openUnmatched ? ` · ${compact(kpis.openUnmatched)} unmatched` : ""}`,
            ar: `فروق ${fmt2(kpis.openVariance)} درهم${kpis.openUnmatched ? ` · ${compact(kpis.openUnmatched)} دون أمر شراء صحيح` : ""}`,
          })}
        />
        <MetricTile
          label={L({ en: "Resolved today", ar: "تمت معالجتها اليوم" })}
          value={kpis.resolvedToday}
          tone={kpis.resolvedToday ? "success" : "default"}
          icon={<Gauge className="size-4" strokeWidth={1.6} />}
          sub={
            kpis.resolvedToday
              ? L({ en: `AED ${fmt2(kpis.releasedToday)} released for payment`, ar: `${fmt2(kpis.releasedToday)} درهم معتمدة للسداد` })
              : L({ en: "Approve a case to close it here", ar: "اعتمد ملفاً لإغلاقه هنا" })
          }
        />
        <MetricTile
          label={L({ en: "Avg resolution effort", ar: "متوسط جهد المعالجة" })}
          value={`${Math.round(kpis.blendedAvgEffort)} ${L({ en: "min", ar: "دقيقة" })}`}
          icon={<Timer className="size-4" strokeWidth={1.6} />}
          sub={
            kpis.liveCount
              ? L({
                  en: `August ${Math.round(kpis.histAvgEffort)} min · NARVO ${kpis.liveAvgEffort!.toFixed(1)} min (${kpis.liveCount})`,
                  ar: `أغسطس ${Math.round(kpis.histAvgEffort)} دقيقة · نارفو ${kpis.liveAvgEffort!.toFixed(1)} دقيقة (${kpis.liveCount})`,
                })
              : L({
                  en: `August: ${kpis.histCount} cases · ${kpis.histAvgDays.toFixed(1)} days to close · ${Math.round(kpis.histReopenedPct)}% reopened`,
                  ar: `أغسطس: ${kpis.histCount} حالة · ${kpis.histAvgDays.toFixed(1)} يوم للإغلاق · ${Math.round(kpis.histReopenedPct)}% أعيد فتحها`,
                })
          }
        />
      </div>

      {/* fr-based tracks: fixed max widths let the side panes grow first and squeeze the match pane on 1440-px screens */}
      <Workbench cols="minmax(360px,1fr) minmax(0,1.15fr) minmax(280px,0.66fr)">
        <Pane
          title={L({ en: "September AP batch", ar: "دفعة الحسابات الدائنة — سبتمبر" })}
          subtitle={L({ en: `${kpis.batchDocs} documents · AED ${fmt2(kpis.batchValue)}`, ar: `${kpis.batchDocs} مستنداً · ${fmt2(kpis.batchValue)} درهم` })}
          flush
          className={PANE_H}
        >
          <BatchTable invoices={data.invoices} matches={matches} pending={pendingIds} selected={inv?.id ?? null} onSelect={select} />
        </Pane>

        <Pane
          title={inv ? L(SUPPLIER_SHORT[inv.supplierId] ?? { en: inv.supplierName, ar: inv.supplierName }) : ""}
          subtitle={inv ? `${inv.id} · ${inv.supplierInvoiceNo} · AED ${fmt2(inv.total)}` : undefined}
          actions={st ? <StatusPill tone={st.tone} pulse={st.pulse}>{L(st.label)}</StatusPill> : undefined}
          flush
          className={PANE_H}
        >
          {!inv || !match || !preview ? (
            <EmptyState icon={<FileSearch className="size-4" />} title={L({ en: "Select a document", ar: "اختر مستنداً" })} />
          ) : (
            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="flex h-full min-h-0 flex-col gap-0">
              <div className="border-b border-border px-4 pt-2">
                <TabsList variant="line" className="h-9">
                  <TabsTrigger value="match" className="gap-1.5 text-[12px]">
                    <Scale className="size-3.5" />
                    {L({ en: "3-way match", ar: "المطابقة الثلاثية" })}
                  </TabsTrigger>
                  <TabsTrigger value="document" className="gap-1.5 text-[12px]">
                    <ScanText className="size-3.5" />
                    {inv.image ? L({ en: "Invoice image", ar: "صورة الفاتورة" }) : L({ en: "Document", ar: "المستند" })}
                  </TabsTrigger>
                  <TabsTrigger value="resolution" className="gap-1.5 text-[12px]">
                    <Wand2 className="size-3.5" />
                    {L({ en: "Resolution", ar: "المعالجة" })}
                    {match.exception && inv.status === "received" && <span className="size-1.5 rounded-full bg-warning" />}
                  </TabsTrigger>
                </TabsList>
              </div>
              <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-4">
                <TabsContent value="match" className="mt-0">
                  <MatchView inv={inv} match={match} po={po} grns={grns} supplier={supplier} onOpen={select} candidateGrns={match.candidatePo ? data.grns.filter((g) => g.poId === match.candidatePo!.id) : []} />
                </TabsContent>
                <TabsContent value="document" className="mt-0">
                  <DocumentTab
                    inv={inv}
                    run={extractRun}
                    live={extractFor === inv.id}
                    stored={storedX}
                    storedFields={storedFields}
                    onRead={readImage}
                  />
                </TabsContent>
                <TabsContent value="resolution" className="mt-0">
                  <ResolutionTab
                    inv={inv}
                    match={match}
                    preview={preview}
                    run={caseRun}
                    live={caseFor === inv.id}
                    stored={stored}
                    approvalStatus={approvalStatus(stored?.approval?.id)}
                    journal={data.journals.find((j) => j.invoiceId === inv.id)}
                    email={data.outbox.find((o) => o.invoiceId === inv.id)}
                    supplierEmail={supplier?.email ?? ""}
                    onBuild={buildCase}
                    onDecided={decided}
                  />
                </TabsContent>
              </div>
            </Tabs>
          )}
        </Pane>

        <Pane title={L({ en: "Agent & evidence", ar: "الوكيل والأدلة" })} className={PANE_H} bodyClassName="scrollbar-thin overflow-y-auto">
          <SideRail
            runs={runs}
            active={active}
            setActive={setActive}
            pendingQueue={pendingQueue}
            citations={citations}
            onOpen={(id) => {
              select(id);
              if (id === byoRun.data.registered?.id) setTab(byoRun.data.registered?.exception ? "match" : "document");
            }}
            onDecided={decided}
            onUpload={upload}
            onAsk={ask}
          />
        </Pane>
      </Workbench>
    </SolutionPage>
  );
}
