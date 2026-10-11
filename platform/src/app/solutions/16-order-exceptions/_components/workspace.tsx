"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertOctagon, CircleDollarSign, Gauge, Timer } from "lucide-react";
import { toast } from "sonner";
import { SolutionPage, type ScenarioStep } from "@/components/narvo/solution-page";
import { Pane, Workbench } from "@/components/narvo/pane";
import { MetricTile } from "@/components/narvo/metric";
import { EmptyState } from "@/components/narvo/empty";
import { useNarvoRun } from "@/hooks/use-narvo-run";
import type { ApprovalSummary, Citation } from "@/lib/ai/events";
import { useFormat, useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { analyzeWorld, computeKpis } from "../_lib/detect";
import { SLUG, fmtNum } from "../_lib/rules";
import type { Snapshot } from "../_lib/types";
import { ExceptionQueue } from "./queue";
import { OrderDetail } from "./order-detail";
import { InterpretPanel, type CustomerDocView } from "./interpret-panel";
import { OptionsPanel, type StoredOptionsView } from "./options-panel";
import { Rail } from "./rail";

const SCENARIO: ScenarioStep[] = [
  {
    title: { en: "The exception queue", ar: "قائمة الاستثناءات" },
    body: {
      en: "40 open sales orders are checked in code against stock (allocated by promise date during the Sahara mill shutdown), frame-agreement prices, site windows and credit exposure. The KPI row shows the open exceptions, the value at risk and the 79% promise-accuracy baseline.",
      ar: "يتم فحص 40 أمر بيع مفتوحاً برمجياً مقابل المخزون (المخصص حسب الموعد خلال صيانة مصانع صحارى) وأسعار اتفاقيات الإطار ونوافذ المواقع والتعرض الائتماني. يعرض صف المؤشرات الاستثناءات المفتوحة والقيمة المعرضة للخطر ودقة الوعود الحالية 79%.",
    },
  },
  {
    title: { en: "Open SO-26-11842 — four issues", ar: "فتح الطلب SO-26-11842 — أربع مشكلات" },
    body: {
      en: "Gulf Crest Builders, Marina Quarter Tower A: 120 t of 16 mm rebar but only 64 t available at MN-05; entered at the PO price AED 2,690/t vs the FA-GCB-2026 Q4 rate AED 2,745/t; 07:00 requested vs the 09:00–16:00 Marina Quarter window; exposure AED 2.1M vs a 2.0M limit. Show the credit gauge and the available-vs-required chart.",
      ar: "جلف كريست للبناء، برج A في حي المارينا: 120 طناً من حديد 16 مم والمتاح 64 طناً فقط في MN-05؛ السعر المُدخل 2,690 درهم/طن مقابل سعر الربع الرابع 2,745؛ موعد 07:00 مطلوب بينما النافذة 09:00–16:00؛ والتعرض 2.1 مليون مقابل حد 2.0 مليون. اعرض مقياس الائتمان ومخطط المتاح مقابل المطلوب.",
    },
  },
  {
    title: { en: "Paste the project director's WhatsApp", ar: "لصق رسالة واتساب من مدير المشاريع" },
    body: {
      en: "On the Customer message tab pick the Gulf Arabic WhatsApp (or paste your own). NARVO extracts each request with its exact quote — Sunday 07:00 or Monday 09:30, at least 60 t first, balance by 22 Oct, +6 t of 12 mm, PO price claim — applies it as a proposal and re-runs detection: the window conflict clears, credit exposure rises.",
      ar: "في تبويب رسالة المتعامل اختر رسالة الواتساب باللهجة الخليجية (أو الصق رسالتك). يستخرج نارفو كل طلب مع اقتباسه الحرفي — الأحد 07:00 أو الاثنين 09:30، و60 طناً على الأقل أولاً، والباقي قبل 22 أكتوبر، و6 أطنان إضافية من 12 مم، ومطالبة بسعر أمر الشراء — ثم يطبّقها كمقترح ويعيد الفحص: يزول تعارض النافذة ويرتفع التعرض الائتماني.",
    },
  },
  {
    title: { en: "Generate resolution options", ar: "توليد خيارات المعالجة" },
    body: {
      en: "The model proposes typed actions — split 64 t now + 56 t from RBM-PO-26-04625, transfer 38 t from Jebel Ali, or Al Dhafra at +AED 165/t. The engine computes each option's promise per line, extra cost, margin vs standard cost, exposure after and approvals: only the split keeps Gulf Crest under its limit without a CFO release.",
      ar: "يقترح النموذج إجراءات محددة — تجزئة 64 طناً الآن و56 طناً من أمر الشراء RBM-PO-26-04625، أو تحويل 38 طناً من جبل علي، أو الشراء من الظفرة بعلاوة 165 درهم/طن. يحسب المحرك لكل خيار الموعد لكل بند والتكلفة والهامش والتعرض والموافقات: وحدها التجزئة تبقي جلف كريست ضمن الحد دون إفراج من المدير المالي.",
    },
  },
  {
    title: { en: "Approve the split — handover & bilingual notice", ar: "اعتماد التجزئة — المذكرة والإشعار ثنائي اللغة" },
    body: {
      en: "Choose the split: NARVO streams the billing handover for Group Finance and the customer notice in English and Arabic, then routes the package to Joseph Abraham (or to the Group CFO if a credit release is included). Approve it in the card.",
      ar: "اختر التجزئة: يكتب نارفو مذكرة التسليم لقسم الفوترة وإشعار المتعامل بالإنجليزية والعربية، ثم يوجّه الحزمة إلى جوزيف أبراهام (أو إلى المدير المالي للمجموعة إن تضمنت إفراجاً ائتمانياً). اعتمدها من البطاقة.",
    },
  },
  {
    title: { en: "KPIs and audit trail move", ar: "تحديث المؤشرات وسجل التدقيق" },
    body: {
      en: "The order is patched — split lines with their own promise dates, contract price, balance held for payment — the queue recomputes and the exception clears; value at risk falls, projected promise accuracy rises and the measured effort (minutes from case open to approval) joins the 52-minute manual baseline.",
      ar: "يتم تحديث الطلب — بنود مجزأة بمواعيدها وسعر العقد ورصيد موقوف حتى السداد — وتُعاد حسابات القائمة ويزول الاستثناء؛ تنخفض القيمة المعرضة للخطر وترتفع دقة الوعود المتوقعة ويُضاف الجهد المقاس (الدقائق من فتح الحالة حتى الاعتماد) إلى خط الأساس اليدوي البالغ 52 دقيقة.",
    },
  },
];

type Tab = "order" | "message" | "resolve";

export function Workspace({ initial, docs }: { initial: Snapshot; docs: CustomerDocView[] }) {
  const L = useL();
  const f = useFormat();
  const [snapshot, setSnapshot] = useState(initial);
  const world = useMemo(() => analyzeWorld(snapshot), [snapshot]);
  const kpis = useMemo(() => computeKpis(snapshot, world), [snapshot, world]);
  const [selected, setSelected] = useState<string | null>(world.orders[0]?.order.id ?? null);
  const [tab, setTab] = useState<Tab>("order");
  const interpretRun = useNarvoRun();
  const optionsRun = useNarvoRun();
  const approveRun = useNarvoRun();
  const [active, setActive] = useState<"interpret" | "options" | "approve">("options");
  const [runFor, setRunFor] = useState<{ interpret?: string; options?: string; approve?: string }>({});
  const [stored, setStored] = useState<StoredOptionsView | null>(null);
  const [useProposal, setUseProposal] = useState(true);
  const [pending, setPending] = useState<ApprovalSummary[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const oa = selected ? world.byId[selected] : undefined;
  const customerNames = useMemo(() => Object.fromEntries(snapshot.master.customers.map((c) => [c.id, { en: c.name, ar: c.nameAr }])), [snapshot.master.customers]);

  const loadPending = useCallback(async () => {
    try {
      const j = await fetch(`/api/approvals?solution=${SLUG}&status=pending`).then((r) => r.json());
      setPending(
        (j.approvals ?? []).map((a: ApprovalSummary) => ({
          id: a.id,
          title: a.title,
          summary: a.summary,
          solution: a.solution,
          actionLabel: a.actionLabel,
          approver: a.approver,
          status: a.status,
          createdAt: a.createdAt,
        })),
      );
    } catch {}
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/solutions/${SLUG}/data`, { cache: "no-store" });
      if (res.ok) setSnapshot(await res.json());
    } catch (e) {
      toast.error((e as Error).message);
    }
    await loadPending();
    setRefreshKey((k) => k + 1);
  }, [loadPending]);

  useEffect(() => {
    loadPending();
  }, [loadPending]);

  // Stored options for the selected order (persisted across reloads).
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setStored(null);
    fetch(`/api/solutions/${SLUG}/options?orderId=${encodeURIComponent(selected)}`)
      .then((r) => r.json())
      .then((j) => !cancelled && setStored(j.stored ?? null))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selected, refreshKey]);

  // A pasted message may belong to another order — follow it.
  const matched = interpretRun.data.orderId as string | undefined;
  useEffect(() => {
    if (matched && matched !== runFor.interpret) {
      setRunFor((r) => ({ ...r, interpret: matched }));
      setSelected(matched);
    }
  }, [matched, runFor.interpret]);

  // Refresh the snapshot when a run finishes (proposals, audit, approvals).
  useEffect(() => {
    if (interpretRun.status === "done") refresh();
  }, [interpretRun.status, refresh]);
  useEffect(() => {
    if (optionsRun.status === "done") setRefreshKey((k) => k + 1);
  }, [optionsRun.status]);
  useEffect(() => {
    if (approveRun.status === "done") loadPending().then(() => setRefreshKey((k) => k + 1));
  }, [approveRun.status, loadPending]);

  const activeRun = active === "interpret" ? interpretRun : active === "approve" ? approveRun : optionsRun;
  const runTitle =
    active === "interpret"
      ? L({ en: "Customer message", ar: "رسالة المتعامل" })
      : active === "approve"
        ? L({ en: "Approval package", ar: "حزمة الاعتماد" })
        : L({ en: "Resolution options", ar: "خيارات المعالجة" });
  const citations = ((runFor.options === selected && optionsRun.data.citations) || stored?.citations || []) as Citation[];
  const inlineIds = new Set(approveRun.approvals.map((a) => a.id));
  const railPending = pending.filter((p) => !(runFor.approve === selected && inlineIds.has(p.id)));

  function select(id: string) {
    setSelected(id);
    setTab("order");
  }

  async function discard() {
    if (!selected) return;
    await fetch(`/api/solutions/${SLUG}/proposal?orderId=${encodeURIComponent(selected)}`, { method: "DELETE" });
    if (runFor.interpret === selected) interpretRun.reset();
    toast.success(L({ en: "Proposed change discarded", ar: "تم تجاهل التعديل المقترح" }));
    refresh();
  }

  function generate() {
    if (!selected) return;
    setTab("resolve");
    setActive("options");
    setRunFor((r) => ({ ...r, options: selected }));
    optionsRun.start(`/api/solutions/${SLUG}/options`, { orderId: selected, useProposal });
  }

  function approve(optionId: string) {
    if (!selected) return;
    setActive("approve");
    setRunFor((r) => ({ ...r, approve: selected }));
    approveRun.start(`/api/solutions/${SLUG}/approve`, { orderId: selected, optionId });
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "order", label: L({ en: "Order & checks", ar: "الطلب والفحوصات" }) },
    { id: "message", label: L({ en: "Customer message", ar: "رسالة المتعامل" }) },
    { id: "resolve", label: L({ en: "Resolution", ar: "المعالجة" }) },
  ];
  const proposal = selected ? snapshot.proposals[selected] ?? null : null;

  return (
    <SolutionPage slug={SLUG} scenario={SCENARIO}>
      <div className="grid grid-cols-4 gap-4 max-lg:grid-cols-2">
        <MetricTile
          label={L({ en: "Open exceptions", ar: "الاستثناءات المفتوحة" })}
          value={kpis.openExceptionOrders}
          tone={kpis.openExceptionOrders ? "warning" : "success"}
          icon={<AlertOctagon className="size-4" strokeWidth={1.5} />}
          sub={L({ en: `${kpis.openIssues} issues · ${kpis.openOrders} open orders checked`, ar: `${kpis.openIssues} مشكلة · ${kpis.openOrders} طلباً مفتوحاً مفحوصاً` })}
        />
        <MetricTile
          label={L({ en: "Value at risk", ar: "القيمة المعرضة للخطر" })}
          value={f.aed(kpis.valueAtRisk)}
          icon={<CircleDollarSign className="size-4" strokeWidth={1.5} />}
          sub={L({ en: `stock ${kpis.byType.stock} · credit ${kpis.byType.credit} · window ${kpis.byType.window} · price ${kpis.byType.price}`, ar: `مخزون ${kpis.byType.stock} · ائتمان ${kpis.byType.credit} · نافذة ${kpis.byType.window} · سعر ${kpis.byType.price}` })}
        />
        <MetricTile
          label={L({ en: "Promise accuracy", ar: "دقة الوعود" })}
          value={`${fmtNum(kpis.promiseAccuracy * 100, 1)}%`}
          icon={<Gauge className="size-4" strokeWidth={1.5} />}
          sub={L({
            en: `${kpis.historyOnTime}/${kpis.historyLines} lines Aug–Sep · projected ${fmtNum(kpis.projectedAccuracy * 100, 1)}% incl. ${kpis.openLines} open`,
            ar: `${kpis.historyOnTime}/${kpis.historyLines} بنداً أغسطس–سبتمبر · المتوقع ${fmtNum(kpis.projectedAccuracy * 100, 1)}% مع ${kpis.openLines} مفتوحاً`,
          })}
        />
        <MetricTile
          label={L({ en: "Avg exception effort", ar: "متوسط جهد الاستثناء" })}
          value={`${fmtNum(kpis.effortAll, 1)} ${L({ en: "min", ar: "دقيقة" })}`}
          tone={kpis.effortLive != null ? "ai" : "default"}
          icon={<Timer className="size-4" strokeWidth={1.5} />}
          sub={
            kpis.effortLive != null
              ? L({ en: `with NARVO ${fmtNum(kpis.effortLive, 0)} min (${kpis.liveResolved}) · manual ${fmtNum(kpis.effortBaseline, 1)}`, ar: `مع نارفو ${fmtNum(kpis.effortLive, 0)} دقيقة (${kpis.liveResolved}) · يدوياً ${fmtNum(kpis.effortBaseline, 1)}` })
              : L({ en: `manual baseline · ${snapshot.exceptionHistory.length} resolved cases`, ar: `خط الأساس اليدوي · ${snapshot.exceptionHistory.length} حالة` })
          }
        />
      </div>

      <Workbench cols="minmax(290px,0.82fr) minmax(0,1.9fr) minmax(300px,0.95fr)">
        <Pane title={L({ en: "Exception queue", ar: "قائمة الاستثناءات" })} flush className="h-[calc(100vh-235px)] min-h-[720px]">
          <ExceptionQueue orders={world.orders} history={snapshot.exceptionHistory} selected={selected} onSelect={select} customerNames={customerNames} />
        </Pane>

        <Pane
          flush
          className="h-[calc(100vh-235px)] min-h-[720px]"
          title={oa ? oa.order.id : L({ en: "Order", ar: "الطلب" })}
          actions={
            <div className="flex rounded-md bg-muted p-0.5">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "h-7 rounded px-2.5 text-[11.5px] font-medium transition-colors",
                    tab === t.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.label}
                  {t.id === "message" && proposal && <span className="ms-1 inline-block size-1.5 rounded-full bg-ai align-middle" />}
                </button>
              ))}
            </div>
          }
        >
          <div className="scrollbar-thin h-full overflow-y-auto p-4">
            {!oa ? (
              <EmptyState title={L({ en: "Select an order", ar: "اختر طلباً" })}>{L({ en: "Pick an exception from the queue.", ar: "اختر استثناءً من القائمة." })}</EmptyState>
            ) : tab === "order" ? (
              <OrderDetail oa={oa} snapshot={snapshot} world={world} />
            ) : tab === "message" ? (
              <InterpretPanel
                oa={oa}
                docs={docs}
                run={interpretRun}
                runOrderId={runFor.interpret ?? null}
                activeProposal={proposal}
                onRun={(text, docId, title) => {
                  setActive("interpret");
                  setRunFor((r) => ({ ...r, interpret: selected ?? undefined }));
                  interpretRun.start(`/api/solutions/${SLUG}/interpret`, { text, orderId: selected, docId, docTitle: title });
                }}
                onDiscard={discard}
                onGenerate={generate}
              />
            ) : (
              <OptionsPanel
                oa={oa}
                run={optionsRun}
                approveRun={approveRun}
                mine={runFor.options === selected}
                approveMine={runFor.approve === selected}
                stored={stored}
                proposal={proposal}
                useProposal={useProposal}
                setUseProposal={setUseProposal}
                onGenerate={generate}
                onApprove={approve}
                onDecided={() => refresh()}
              />
            )}
          </div>
        </Pane>

        <Pane title={L({ en: "Agent · approvals · sources", ar: "الوكيل · الاعتمادات · المصادر" })} flush className="h-[calc(100vh-235px)] min-h-[720px]">
          <Rail
            run={activeRun}
            runTitle={runTitle}
            pending={railPending}
            citations={citations}
            refreshKey={refreshKey}
            onDecided={(id, s) => {
              approveRun.markApproval(id, s);
              refresh();
            }}
          />
        </Pane>
      </Workbench>
    </SolutionPage>
  );
}
