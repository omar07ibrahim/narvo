"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpenCheck, CalendarClock, FileCheck2, Layers, RefreshCw, Send, ShieldCheck, Sparkles, Timer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SolutionPage, type ScenarioStep } from "@/components/narvo/solution-page";
import { Pane, Workbench } from "@/components/narvo/pane";
import { MetricTile } from "@/components/narvo/metric";
import { AgentTrace } from "@/components/narvo/agent-trace";
import { ApprovalCard } from "@/components/narvo/approval-card";
import { Markdown } from "@/components/narvo/markdown";
import { SourceList } from "@/components/narvo/sources";
import { RunButton } from "@/components/narvo/run-button";
import { StatusPill } from "@/components/narvo/status";
import { useNarvoRun } from "@/hooks/use-narvo-run";
import { useFormat, useL, usePrefs } from "@/lib/i18n";
import { DEMO_TODAY } from "@/lib/world/orgs";
import type { ApprovalSummary, Citation } from "@/lib/ai/events";
import { cn } from "@/lib/utils";
import { computeKpis, fmtDuration, usedFactIds, type FixOp } from "../_lib/checks";
import { CHANNEL_ORDER, LANGS, cellId, type BrandState, type ChannelId, type Flag, type Lang, type Variant } from "../_lib/types";
import { VariantMatrix } from "./variant-matrix";
import { VariantDetail } from "./variant-detail";
import { FactSheetPanel } from "./fact-sheet";
import { ByoCheckPanel } from "./byo-check";
import { AssetsPanel } from "./assets-panel";
import { ReleasePanel } from "./release-panel";
import { Bidi, FactChip } from "./highlighted-copy";
import { STATUS_LABEL, STATUS_TONE } from "./labels";

const API = "/api/solutions/10-brand-content";

type Tab = "variant" | "facts" | "byo" | "assets" | "release";

const SCENARIO: ScenarioStep[] = [
  {
    title: { en: "Open the variant matrix", ar: "افتح مصفوفة النسخ" },
    body: {
      en: "Six channels × English/Arabic for the Raseen ThermaShield launch on 1 November. Three legacy drafts from the agency and the MN-05 counter are already flagged by deterministic checks: \"without AC\", 20 °C, municipality approval, a 15-year warranty, AED 380.",
      ar: "ست قنوات × العربية/الإنجليزية لإطلاق رصين ثيرماشيلد في 1 نوفمبر. ثلاث مسودات قديمة من الوكالة ونقطة بيع MN-05 عليها ملاحظات من الفحوص الحتمية: \"بدون مكيف\" و20 درجة واعتماد البلدية وضمان 15 سنة و380 درهم.",
    },
  },
  {
    title: { en: "Generate the missing variants from approved facts", ar: "أنتج النسخ الناقصة من الحقائق المعتمدة" },
    body: {
      en: "Click \"Generate missing\". The agent writes each cell only from fact sheet FS-PNT-TS-20, revises once if a deterministic check fails, then verifies every sentence. Watch the trace on the right.",
      ar: "اضغط \"إنتاج الناقص\". يكتب الوكيل كل خلية من ورقة الحقائق FS-PNT-TS-20 فقط، ويراجعها مرة إن فشل فحص حتمي، ثم يتحقق من كل جملة. تابع المسار على اليمين.",
    },
  },
  {
    title: { en: "Open the Arabic Instagram variant", ar: "افتح نسخة إنستغرام العربية" },
    body: {
      en: "Hover any sentence: verdict, reason and the source fact with its document (RBM-LAB-26-112, TDS rev. B). The product's first mention reads \"رصين ثيرماشيلد (Raseen ThermaShield)\" and every number uses Latin digits.",
      ar: "مرّر المؤشر على أي جملة: الحكم والسبب والحقيقة المصدر مع مستندها (RBM-LAB-26-112، النشرة الفنية الإصدار B). أول ذكر للمنتج \"رصين ثيرماشيلد (Raseen ThermaShield)\" وكل الأرقام لاتينية.",
    },
  },
  {
    title: { en: "Fix a legacy draft", ar: "أصلح مسودة قديمة" },
    body: {
      en: "Open the legacy WhatsApp (AR) draft, run the full verification, then \"Apply all fixes\". Each fix replaces one sentence and is re-verified; \"Flags resolved\" counts only flags that really disappeared.",
      ar: "افتح مسودة واتساب العربية القديمة، شغّل التحقق الكامل، ثم \"تطبيق كل الإصلاحات\". كل إصلاح يستبدل جملة واحدة ويُعاد التحقق منها؛ ولا يُحتسب في \"الملاحظات المعالجة\" إلا ما اختفى فعلاً.",
    },
  },
  {
    title: { en: "Technical Services changes the warranty", ar: "الخدمات الفنية تغيّر الضمان" },
    body: {
      en: "In Fact sheet, click \"Warranty 10 → 12 years\" and save. Every variant that uses TS-F09 or still says \"10-year\" is marked stale. \"Regenerate affected\" updates only those, with a word-level diff.",
      ar: "في ورقة الحقائق اضغط \"الضمان 10 ← 12 سنة\" واحفظ. تصبح كل نسخة تستخدم TS-F09 أو تذكر \"10 سنوات\" متقادمة. \"إعادة إنتاج المتأثرة\" تحدّثها وحدها مع عرض الفروق كلمةً كلمة.",
    },
  },
  {
    title: { en: "Check your own copy", ar: "افحص نصك الخاص" },
    body: {
      en: "In \"Check your copy\", load the distributor's Arabic LinkedIn post (or paste any text). The same engine flags the room-temperature claim, the 35% bill saving, the government approval and the 12-year warranty — then \"Rewrite compliantly\".",
      ar: "في \"افحص نصك\" حمّل منشور الموزّع العربي على لينكدإن (أو الصق أي نص). يرصد المحرك نفسه ادعاء حرارة الغرف وتوفير 35% من الفاتورة والاعتماد الحكومي وضمان 12 سنة — ثم \"أعد الصياغة بشكل مطابق\".",
    },
  },
  {
    title: { en: "Release with Hana Yousef's approval", ar: "الإصدار باعتماد هناء يوسف" },
    body: {
      en: "In Release, request release for every verified variant. Hana Yousef, Marketing & Brand Manager, approves in the right rail; the variants turn Released, the release-time KPI stops, and the handoff pack downloads with text, facts, sources and approval.",
      ar: "في الإصدار اطلب إصدار كل النسخ المتحقق منها. تعتمد هناء يوسف، مديرة التسويق والعلامة التجارية، من اللوحة اليمنى؛ فتصبح النسخ صادرة ويتوقف مؤشر زمن الإصدار وتُنزّل حزمة التسليم بالنصوص والحقائق والمصادر والاعتماد.",
    },
  },
];

export function BrandWorkspace({ initial, initialSelected, initialTab }: { initial: BrandState; initialSelected?: string; initialTab?: Tab }) {
  const L = useL();
  const fmt = useFormat();
  const { lang: ui } = usePrefs();
  const [state, setState] = useState<BrandState>(initial);
  const [selected, setSelected] = useState<string>(initialSelected ?? cellId("instagram", "en"));
  const [tab, setTab] = useState<Tab>(initialTab ?? "variant");
  const run = useNarvoRun();
  const byoRun = useNarvoRun();
  const askRun = useNarvoRun();
  const [question, setQuestion] = useState("");

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`${API}/state`, { cache: "no-store" });
      if (r.ok) setState(await r.json());
    } catch {}
  }, []);

  // merge variants streamed by the generate / verify routes
  useEffect(() => {
    const incoming = Object.entries(run.data)
      .filter(([k]) => k === "variant" || k.startsWith("variant:"))
      .map(([, v]) => v as Variant);
    if (!incoming.length) return;
    setState((s) => {
      const map = new Map(s.variants.map((v) => [v.id, v]));
      for (const v of incoming) map.set(v.id, v);
      return { ...s, variants: [...map.values()] };
    });
  }, [run.data]);

  useEffect(() => {
    if (run.status === "done" || run.status === "error") void refresh();
  }, [run.status, refresh]);

  const kpis = useMemo(() => computeKpis(state.variants, state.facts), [state.variants, state.facts]);

  const generating = useMemo(() => {
    const s = new Set<string>();
    if (!run.running) return s;
    for (const t of run.trace) {
      if (t.kind !== "step" || t.status !== "running") continue;
      const m = t.id.match(/^(gen|vfy):(.+)$/);
      if (m) s.add(m[2]);
    }
    return s;
  }, [run.running, run.trace]);
  const queued = useMemo(() => {
    const s = new Set<string>();
    if (!run.running) return s;
    for (const id of (run.data.queue as string[] | undefined) ?? []) {
      if (!generating.has(id) && !run.data[`variant:${id}`] && !run.data[`error:${id}`]) s.add(id);
    }
    return s;
  }, [run.running, run.data, generating]);

  const [selChannel, selLang] = useMemo(() => {
    const m = selected.match(/^V-(\w+)-(en|ar)$/)!;
    return [m[1] as ChannelId, m[2] as Lang];
  }, [selected]);
  const selVariant = state.variants.find((v) => v.id === selected);
  const selChannelObj = state.channels.find((c) => c.id === selChannel)!;
  const liveStep = run.trace.find((t) => t.kind === "step" && (t.id === `gen:${selected}` || t.id === `vfy:${selected}`) && t.status === "running");
  const missing = CHANNEL_ORDER.flatMap((c) => LANGS.map((l) => cellId(c, l))).filter((id) => !state.variants.some((v) => v.id === id)).length;
  const staleCount = state.variants.filter((v) => v.status === "stale").length;
  const daysToLaunch = Math.round((Date.parse(state.meta.launchDate) - Date.parse(DEMO_TODAY)) / 86400000);

  /* actions */
  const generate = (cells: Array<{ channel: ChannelId; lang: Lang }>, instruction?: string) => run.start(`${API}/generate`, { cells, instruction });
  const generateScope = (scope: "missing" | "stale") => run.start(`${API}/generate`, { scope });
  const verify = (variantId: string) => run.start(`${API}/verify`, { variantId });
  const applyOps = (variantId: string, ops: FixOp[]) => run.start(`${API}/verify`, { variantId, ops });
  const saveEdit = (variantId: string, edit: { headline: string | null; body: string; hashtags: string[] }) => run.start(`${API}/verify`, { variantId, edit });
  const requestRelease = (ids: string[]) => run.start(`${API}/release`, { variantIds: ids });

  async function dismiss(variantId: string, flag: Flag, note: string) {
    try {
      const r = await fetch(`${API}/flags`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ variantId, key: flag.key, note }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? r.statusText);
      setState((s) => ({ ...s, variants: s.variants.map((v) => (v.id === variantId ? data : v)) }));
      toast.success(L({ en: "Model flag overruled — note recorded in the audit trail", ar: "تم تجاوز ملاحظة النموذج — وسُجّلت الملاحظة في سجل التدقيق" }));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const openVariant = (id: string) => {
    setSelected(id);
    setTab("variant");
  };

  /* approvals: persisted release requests + any raised in this session */
  const approvals: ApprovalSummary[] = useMemo(() => {
    const fromState: ApprovalSummary[] = state.releases.map((r) => ({
      id: r.id,
      title: r.title,
      summary: r.summary,
      solution: r.solution,
      actionLabel: r.actionLabel,
      approver: r.approver,
      status: r.status,
      createdAt: r.createdAt,
    }));
    const extra = run.approvals.filter((a) => !fromState.some((s) => s.id === a.id));
    return [...extra, ...fromState].sort((a, b) => b.createdAt - a.createdAt).slice(0, 2);
  }, [state.releases, run.approvals]);

  const traceRun = tab === "byo" && (byoRun.trace.length || byoRun.running) ? byoRun : run;
  const valid = useMemo(() => new Set(state.facts.map((f) => f.id)), [state.facts]);
  const railFacts = selVariant ? usedFactIds(selVariant, valid).map((id) => state.facts.find((f) => f.id === id)!).sort((a, b) => a.id.localeCompare(b.id)) : [];
  const citations = (askRun.data.citations as Citation[] | undefined) ?? [];

  const TABS: Array<{ id: Tab; label: { en: string; ar: string }; badge?: number }> = [
    { id: "variant", label: { en: "Variant", ar: "النسخة" } },
    { id: "facts", label: { en: "Fact sheet", ar: "ورقة الحقائق" }, badge: staleCount || undefined },
    { id: "byo", label: { en: "Check your copy", ar: "افحص نصك" } },
    { id: "assets", label: { en: "Assets", ar: "المواد" } },
    { id: "release", label: { en: "Release", ar: "الإصدار" }, badge: kpis.ready - kpis.released || undefined },
  ];

  return (
    <SolutionPage slug="10-brand-content" scenario={SCENARIO}>
      {/* KPIs — computed from the variant set */}
      <div className="grid grid-cols-4 gap-4 max-lg:grid-cols-2">
        <MetricTile
          label={L({ en: "Variants ready", ar: "النسخ الجاهزة" })}
          value={
            <>
              {kpis.ready}
              <span className="text-[15px] text-muted-foreground">/{kpis.total}</span>
            </>
          }
          tone={kpis.ready === kpis.total ? "success" : "default"}
          icon={<Layers className="size-4" strokeWidth={1.5} />}
          sub={L({ en: `${kpis.present} drafted · ${kpis.released} released`, ar: `${kpis.present} مكتوبة · ${kpis.released} صادرة` })}
        />
        <MetricTile
          label={L({ en: "Facts covered", ar: "الحقائق المغطاة" })}
          value={
            <>
              {kpis.factsCovered}
              <span className="text-[15px] text-muted-foreground">/{kpis.factsTotal}</span>
            </>
          }
          tone="ai"
          icon={<BookOpenCheck className="size-4" strokeWidth={1.5} />}
          sub={L({ en: "unique fact IDs used across variants", ar: "معرّفات حقائق فريدة مستخدمة في النسخ" })}
        />
        <MetricTile
          label={L({ en: "Flags resolved", ar: "الملاحظات المعالجة" })}
          value={
            <>
              {kpis.flagsResolved}
              <span className="text-[15px] text-muted-foreground">/{kpis.flagsRaised}</span>
            </>
          }
          tone={kpis.openFlags ? "warning" : kpis.flagsRaised ? "success" : "default"}
          icon={<ShieldCheck className="size-4" strokeWidth={1.5} />}
          sub={L({ en: `${kpis.openFlags} open now`, ar: `${kpis.openFlags} مفتوحة الآن` })}
        />
        <MetricTile
          label={L({ en: "Release time", ar: "زمن الإصدار" })}
          value={kpis.releaseMs != null ? fmtDuration(kpis.releaseMs, ui) : "—"}
          icon={<Timer className="size-4" strokeWidth={1.5} />}
          sub={
            kpis.releaseMs != null
              ? L({ en: "first generation → approved release", ar: "من أول إنتاج حتى الإصدار المعتمد" })
              : kpis.firstGeneratedAt
                ? L({ en: `clock running since ${fmt.time(kpis.firstGeneratedAt)}`, ar: `بدأ العدّ منذ ${fmt.time(kpis.firstGeneratedAt)}` })
                : L({ en: "starts at the first generation", ar: "يبدأ مع أول إنتاج" })
          }
        />
      </div>

      <Workbench cols="364px minmax(0,1fr) 340px">
        {/* matrix */}
        <Pane
          title={L({ en: "Variant matrix", ar: "مصفوفة النسخ" })}
          subtitle={L({ en: "6 channels × EN / AR", ar: "6 قنوات × EN / AR" })}
          flush
          className="h-[calc(100vh-250px)] min-h-[660px]"
          bodyClassName="scrollbar-thin overflow-y-auto"
          actions={
            <RunButton size="sm" running={run.running && !!run.data.queue} onRun={() => generateScope("missing")} disabled={!missing || run.running} icon={<Sparkles />}>
              {L({ en: `Generate missing (${missing})`, ar: `إنتاج الناقص (${missing})` })}
            </RunButton>
          }
        >
          <VariantMatrix
            channels={state.channels}
            variants={state.variants}
            generating={generating}
            queued={queued}
            selected={selected}
            onSelect={openVariant}
            onGenerateRow={(ch) => generate(LANGS.map((l) => ({ channel: ch, lang: l })))}
            busy={run.running}
          />
          <div className="space-y-3 px-4 pb-4">
            {staleCount > 0 && (
              <div className="flex items-center justify-between gap-2 rounded-md border border-warning/35 bg-warning-soft/50 px-3 py-2">
                <span className="text-[12px]">
                  {L({ en: `${staleCount} variant(s) stale after a fact change`, ar: `${staleCount} نسخة متقادمة بعد تغيير حقيقة` })}
                </span>
                <Button size="xs" disabled={run.running} onClick={() => generateScope("stale")}>
                  <RefreshCw />
                  {L({ en: "Regenerate", ar: "إعادة الإنتاج" })}
                </Button>
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              {(["flagged", "draft", "ready", "released", "stale"] as const).map((s) => {
                const n = state.variants.filter((v) => v.status === s).length;
                return (
                  <StatusPill key={s} tone={STATUS_TONE[s]} className={cn(!n && "opacity-50")}>
                    {L(STATUS_LABEL[s])} <span className="num">{n}</span>
                  </StatusPill>
                );
              })}
            </div>
            <div className="rounded-md border border-border p-3">
              <div className="label-caps mb-1.5 flex items-center gap-1.5 !text-[9.5px]">
                <CalendarClock className="size-3" />
                {L({ en: "Launch", ar: "الإطلاق" })}
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px]">{fmt.date(state.meta.launchDate, { day: "numeric", month: "long", year: "numeric" })}</span>
                <span className="num text-[12px] text-muted-foreground">
                  {daysToLaunch} {L({ en: "days to go", ar: "يوماً متبقية" })}
                </span>
              </div>
              <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
                {L({
                  en: "Pipeline per cell: draft from approved facts → deterministic checks (numbers, qualifiers, forbidden claims, channel limits) → model judgement per sentence → release by Hana Yousef.",
                  ar: "مسار كل خلية: مسودة من الحقائق المعتمدة ← فحوص حتمية (الأرقام والشروط والادعاءات المحظورة وحدود القناة) ← حكم النموذج على كل جملة ← إصدار باعتماد هناء يوسف.",
                })}
              </p>
            </div>
          </div>
        </Pane>

        {/* work area */}
        <section className="flex h-[calc(100vh-250px)] min-h-[660px] min-w-0 flex-col rounded-lg border border-border bg-card">
          <header className="flex min-h-11 items-center gap-1 overflow-x-auto border-b border-border px-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "relative flex h-11 shrink-0 items-center gap-1.5 px-3 text-[12.5px] transition-colors",
                  tab === t.id ? "font-medium text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-[2px] after:rounded-full after:bg-ai" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {L(t.label)}
                {t.badge ? <span className="num rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">{t.badge}</span> : null}
              </button>
            ))}
          </header>
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-5">
            {tab === "variant" && (
              <VariantDetail
                id={selected}
                channel={selChannelObj}
                lang={selLang}
                variant={selVariant}
                facts={state.facts}
                rules={state.rules}
                generating={generating.has(selected) || queued.has(selected)}
                liveDetail={liveStep?.kind === "step" ? liveStep.detail ?? liveStep.label : undefined}
                busy={run.running}
                error={run.status === "error" ? (run.data[`error:${selected}`] as string | undefined) ?? run.error ?? null : (run.data[`error:${selected}`] as string | undefined) ?? null}
                onGenerate={(instruction) => generate([{ channel: selChannel, lang: selLang }], instruction)}
                onVerify={() => verify(selected)}
                onSaveEdit={(p) => saveEdit(selected, p)}
                onApplyOps={(ops) => applyOps(selected, ops)}
                onDismiss={(f, note) => dismiss(selected, f, note)}
              />
            )}
            {tab === "facts" && (
              <FactSheetPanel
                meta={state.meta}
                facts={state.facts}
                changes={state.changes}
                variants={state.variants}
                channels={state.channels}
                busy={run.running}
                onChanged={() => void refresh()}
                onRegenerate={() => generateScope("stale")}
                onOpenVariant={openVariant}
              />
            )}
            {tab === "byo" && <ByoCheckPanel channels={state.channels} facts={state.facts} run={byoRun} recent={state.byo} onDone={() => void refresh()} />}
            {tab === "assets" && <AssetsPanel assets={state.assets} facts={state.facts} onOpenVariant={openVariant} />}
            {tab === "release" && <ReleasePanel state={state} running={run.running} onRequest={requestRelease} onOpenVariant={openVariant} />}
          </div>
        </section>

        {/* right rail */}
        <Pane
          title={L({ en: "Agent & evidence", ar: "الوكيل والأدلة" })}
          className="h-[calc(100vh-250px)] min-h-[660px]"
          bodyClassName="scrollbar-thin overflow-y-auto space-y-5"
        >
          <AgentTrace
            run={traceRun}
            emptyHint={L({
              en: "Generate, verify or release to see every step: fact loading, drafting, deterministic checks, model judgement and approval routing.",
              ar: "أنتج أو تحقق أو أصدر لرؤية كل خطوة: تحميل الحقائق والكتابة والفحوص الحتمية وحكم النموذج وتوجيه الاعتماد.",
            })}
          />

          {approvals.length > 0 && (
            <div className="space-y-2">
              <div className="label-caps">{L({ en: "Release approval", ar: "اعتماد الإصدار" })}</div>
              {approvals.map((a) => (
                <ApprovalCard
                  key={`${a.id}-${a.status}`}
                  approval={a}
                  onDecided={(status) => {
                    run.markApproval(a.id, status);
                    void refresh();
                  }}
                />
              ))}
            </div>
          )}

          <div>
            <div className="label-caps mb-2 flex items-center justify-between">
              <span>{L({ en: "Source facts · selected variant", ar: "الحقائق المصدر · النسخة المحددة" })}</span>
              <span className="num text-faint">{railFacts.length}</span>
            </div>
            {railFacts.length ? (
              <ul className="space-y-1.5">
                {railFacts.map((f) => (
                  <li key={f.id} className="rounded-md border border-border bg-surface px-2.5 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <FactChip fact={f} compact />
                      <span className="truncate font-mono text-[10px] text-muted-foreground">
                        {f.source} · v{f.version}
                      </span>
                    </div>
                    <p className="mt-1 text-[11.5px] leading-snug" dir="auto">
                      <Bidi text={L({ en: f.value, ar: f.valueAr })} />
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12px] text-muted-foreground">
                {selVariant?.origin === "legacy"
                  ? L({ en: "Legacy draft — written before the fact sheet; it cites no approved facts.", ar: "مسودة قديمة — كُتبت قبل ورقة الحقائق ولا تستند إلى حقائق معتمدة." })
                  : L({ en: "Fact IDs used by the selected variant appear here with their source documents.", ar: "تظهر هنا معرّفات الحقائق التي تستخدمها النسخة المحددة مع مستنداتها المصدر." })}
              </p>
            )}
          </div>

          <div>
            <div className="label-caps mb-2 flex items-center gap-1.5">
              <FileCheck2 className="size-3" />
              {L({ en: "Ask the brand guide", ar: "اسأل دليل العلامة" })}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (question.trim()) askRun.start(`${API}/ask`, { question });
              }}
              className="flex gap-1.5"
            >
              <Input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={L({ en: "Can we call ThermaShield waterproof?", ar: "هل يمكن وصف ثيرماشيلد بأنه عازل للماء؟" })}
                className="h-8 text-[12px]"
                dir="auto"
              />
              <Button type="submit" size="sm" variant="outline" disabled={!question.trim() || askRun.running}>
                <Send className="rtl:-scale-x-100" />
              </Button>
            </form>
            {!askRun.text.main && !askRun.running && (
              <div className="mt-2 flex flex-wrap gap-1">
                {[
                  { en: "How must the warranty be worded in Arabic?", ar: "كيف يُصاغ الضمان بالعربية؟" },
                  { en: "What are the Instagram caption rules?", ar: "ما قواعد تعليق إنستغرام؟" },
                ].map((q) => (
                  <button
                    key={q.en}
                    type="button"
                    onClick={() => {
                      setQuestion(L(q));
                      askRun.start(`${API}/ask`, { question: L(q) });
                    }}
                    className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
                  >
                    {L(q)}
                  </button>
                ))}
              </div>
            )}
            {askRun.running && !askRun.text.main && (
              <p className="shimmer-text mt-2 text-[12px]">{(askRun.trace.find((t) => t.status === "running")?.label as string) ?? L({ en: "Searching the guidelines…", ar: "البحث في الدليل…" })}</p>
            )}
            {askRun.text.main && (
              <div className="mt-2 rounded-md border border-border p-2.5">
                <Markdown citations={citations} streaming={askRun.running} className="!text-[12.5px]">
                  {askRun.text.main}
                </Markdown>
                {!askRun.running && citations.length > 0 && <SourceList citations={citations} usedOnly text={askRun.text.main} className="mt-2" />}
              </div>
            )}
            {askRun.status === "error" && <p className="mt-2 rounded-md border border-danger/25 bg-danger-soft p-2 text-[12px] text-danger">{askRun.error}</p>}
          </div>
        </Pane>
      </Workbench>
    </SolutionPage>
  );
}
