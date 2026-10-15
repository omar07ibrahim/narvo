"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Scatter, ScatterChart, ZAxis } from "recharts";
import { Activity, CheckCircle2Icon, Download, Gauge, Play, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SolutionPage, type ScenarioStep } from "@/components/narvo/solution-page";
import { Pane } from "@/components/narvo/pane";
import { MetricTile } from "@/components/narvo/metric";
import { AgentTrace } from "@/components/narvo/agent-trace";
import { RunButton } from "@/components/narvo/run-button";
import { StatusPill } from "@/components/narvo/status";
import { EmptyState } from "@/components/narvo/empty";
import { CHART, axisProps, gridProps, ChartTooltip } from "@/components/narvo/chart";
import { formatBytes } from "@/components/shell/privacy-status";
import { useNarvoRun } from "@/hooks/use-narvo-run";
import { useFormat, useL, usePrefs } from "@/lib/i18n";
import { SOLUTIONS, pad2 } from "@/lib/solutions/registry";
import { cn } from "@/lib/utils";

const SLUG = "04-private-ai-platform";

const SCENARIO: ScenarioStep[] = [
  {
    title: { en: "Everything is metered", ar: "كل شيء مقاس" },
    body: {
      en: "Every model call made by any solution appears here with latency, tokens and the bytes that left the machine. In private mode egress stays at 0 B.",
      ar: "كل استدعاء لأي نموذج من أي حل يظهر هنا مع الزمن والرموز والبيانات التي غادرت الجهاز. في الوضع الخاص تبقى البيانات الخارجة 0 بايت.",
    },
  },
  {
    title: { en: "The model, measured", ar: "النموذج تحت القياس" },
    body: {
      en: "Open Models: Qwen3.8 27B is served from this machine. Run the Arabic benchmark — time to first token, tokens per second and the actual text.",
      ar: "افتح النماذج: يعمل Qwen3.8 27B على هذا الجهاز. شغّل الاختبار العربي — زمن أول رمز وسرعة التوليد والنص الفعلي.",
    },
  },
  {
    title: { en: "Quality is measured, not claimed", ar: "الجودة تُقاس لا تُدّعى" },
    body: {
      en: "Run the evaluation suite: ten everyday questions answered from MNDA policy, scored automatically against the expected facts and citations.",
      ar: "شغّل مجموعة التقييم: عشرة أسئلة يومية يُجاب عنها من سياسات الهيئة، وتُقيَّم آلياً مقابل الحقائق المتوقعة والاستشهادات.",
    },
  },
  {
    title: { en: "Access follows your rules", ar: "الوصول يتبع قواعدك" },
    body: {
      en: "Toggle which document classifications each role may retrieve through AI. Changes are audited and enforced at retrieval time.",
      ar: "حدّد تصنيفات المستندات التي يحق لكل دور استرجاعها عبر الذكاء الاصطناعي. التغييرات مسجلة ومطبقة عند الاسترجاع.",
    },
  },
  {
    title: { en: "Recover in minutes", ar: "استعادة خلال دقائق" },
    body: {
      en: "Export a full state snapshot — approvals, audit trail, records — for backup or migration to another server.",
      ar: "صدّر لقطة كاملة للحالة — الاعتمادات وسجل التدقيق والسجلات — للنسخ الاحتياطي أو النقل إلى خادم آخر.",
    },
  },
];

interface Call {
  id: string;
  ts: number;
  solution: string;
  task: string;
  model: string;
  provider: string;
  promptTokens: number;
  completionTokens: number;
  ms: number;
  egressBytes: number;
  ok: boolean;
  error?: string;
}
interface Telemetry {
  provider: string;
  host: string;
  startedAt: number;
  egressBytes: number;
  totals: { calls: number; promptTokens: number; completionTokens: number; ms: number; errors: number };
  recent: Call[];
}
interface ModelRow {
  key: string;
  label: string;
  publisher: string;
  params: string;
  licence: string;
  note?: string;
  servedId: string | null;
  available: boolean;
  capabilities: string[];
}
interface Bench {
  modelKey: string;
  label: string;
  ttftMs?: number;
  totalMs?: number;
  tokensPerSecond?: number | null;
  completionTokens?: number;
  output?: string;
  error?: string;
}

const pct = (arr: number[], p: number) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

export function PlatformConsole() {
  const L = useL();
  const f = useFormat();
  const { lang } = usePrefs();
  const [t, setT] = useState<Telemetry | null>(null);
  const [models, setModels] = useState<{ endpointOk: boolean; host: string; provider: string; totalServed: number; listMs: number; models: ModelRow[] } | null>(null);
  const [bench, setBench] = useState<Record<string, Bench | "running">>({});
  const [policy, setPolicy] = useState<{ roles: string[]; levels: string[]; policy: Record<string, string[]> } | null>(null);
  const [lastEval, setLastEval] = useState<any>(null);
  const evalRun = useNarvoRun();

  const loadT = useCallback(() => fetch("/api/platform/telemetry").then((r) => r.json()).then(setT), []);
  useEffect(() => {
    loadT();
    const i = setInterval(loadT, 3000);
    fetch(`/api/solutions/${SLUG}/models`).then((r) => r.json()).then(setModels);
    fetch(`/api/solutions/${SLUG}/policy`).then((r) => r.json()).then(setPolicy);
    fetch(`/api/solutions/${SLUG}/eval`).then((r) => r.json()).then(setLastEval);
    return () => clearInterval(i);
  }, [loadT]);

  const calls = t?.recent ?? [];
  const lat = calls.filter((c) => c.ok).map((c) => c.ms);
  const bySolution = useMemo(() => {
    const m = new Map<string, { calls: number; tokens: number }>();
    for (const c of calls) {
      const k = c.solution;
      const v = m.get(k) ?? { calls: 0, tokens: 0 };
      v.calls++;
      v.tokens += c.promptTokens + c.completionTokens;
      m.set(k, v);
    }
    return Array.from(m.entries())
      .map(([k, v]) => {
        const s = SOLUTIONS.find((x) => x.slug === k);
        return { name: s ? pad2(s.n) : k, full: s ? L(s.nav) : k, ...v };
      })
      .sort((a, b) => b.calls - a.calls)
      .slice(0, 14);
  }, [calls, L]);

  const tokensIn = t?.totals.promptTokens ?? 0;
  const tokensOut = t?.totals.completionTokens ?? 0;
  const n = Math.max(t?.totals.calls ?? 0, 1);
  // Cost model (stated assumptions): frontier cloud API at USD 3 / 15 per million input/output tokens;
  // on-device: 70 W under inference at AED 0.38 per kWh.
  const cloudAedPerTask = ((tokensIn / n) * 3 + (tokensOut / n) * 15) / 1e6 * 3.6725;
  const localAedPerTask = (70 * ((t?.totals.ms ?? 0) / n / 1000)) / 3.6e6 * 0.38;

  const evalSummary = (evalRun.data.summary as any) ?? lastEval;
  const evalRows = (evalRun.data.results as any[]) ?? evalSummary?.results ?? [];

  async function runBench(key: string) {
    setBench((b) => ({ ...b, [key]: "running" }));
    const r = await fetch(`/api/solutions/${SLUG}/benchmark`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelKey: key }),
    }).then((x) => x.json());
    setBench((b) => ({ ...b, [key]: r }));
  }

  async function togglePolicy(role: string, level: string, allowed: boolean) {
    const r = await fetch(`/api/solutions/${SLUG}/policy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, level, allowed }),
    }).then((x) => x.json());
    setPolicy((p) => (p ? { ...p, policy: r.policy } : p));
  }

  const local = t?.provider === "local";

  return (
    <SolutionPage slug={SLUG} scenario={SCENARIO}>
      <div className="grid grid-cols-5 gap-4 max-xl:grid-cols-3 max-md:grid-cols-2">
        <MetricTile label={L({ en: "Model calls", ar: "استدعاءات النماذج" })} value={f.number(t?.totals.calls ?? 0)} sub={L({ en: "since server start", ar: "منذ تشغيل الخادم" })} icon={<Activity className="size-3.5" />} />
        <MetricTile label={L({ en: "Tokens processed", ar: "الرموز المعالجة" })} value={f.number(tokensIn + tokensOut)} sub={`${f.number(tokensIn)} in · ${f.number(tokensOut)} out`} />
        <MetricTile label={L({ en: "Latency p50 / p95", ar: "الزمن p50 / p95" })} value={`${(pct(lat, 50) / 1000).toFixed(1)} / ${(pct(lat, 95) / 1000).toFixed(1)} s`} sub={L({ en: "per call", ar: "لكل استدعاء" })} icon={<Gauge className="size-3.5" />} />
        <MetricTile
          label={L({ en: "Data egress", ar: "البيانات الخارجة" })}
          value={formatBytes(t?.egressBytes ?? 0)}
          sub={local ? L({ en: "on-device — nothing leaves", ar: "على الجهاز — لا شيء يغادر" }) : L({ en: `development via ${t?.host ?? "…"}`, ar: `تطوير عبر ${t?.host ?? "…"}` })}
          tone={local ? "success" : "default"}
        />
        <MetricTile
          label={L({ en: "Cost per task", ar: "تكلفة المهمة" })}
          value={`AED ${localAedPerTask.toFixed(4)}`}
          sub={L({ en: `vs AED ${cloudAedPerTask.toFixed(3)} on a frontier cloud API`, ar: `مقابل ${cloudAedPerTask.toFixed(3)} درهم عبر واجهة سحابية` })}
          tone="ai"
        />
      </div>

      <Tabs defaultValue="overview" className="gap-4">
        <TabsList variant="line" className="h-10 w-full justify-start rounded-none border-b border-border bg-transparent">
          <TabsTrigger value="overview">{L({ en: "Telemetry", ar: "القياس" })}</TabsTrigger>
          <TabsTrigger value="models">{L({ en: "Models", ar: "النماذج" })}</TabsTrigger>
          <TabsTrigger value="eval">{L({ en: "Evaluation", ar: "التقييم" })}</TabsTrigger>
          <TabsTrigger value="access">{L({ en: "Access & residency", ar: "الوصول ومكان البيانات" })}</TabsTrigger>
          <TabsTrigger value="recovery">{L({ en: "Recovery", ar: "الاستعادة" })}</TabsTrigger>
        </TabsList>

        {/* ── Telemetry ── */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
            <Pane title={L({ en: "Calls by solution", ar: "الاستدعاءات حسب الحل" })}>
              {bySolution.length ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={bySolution} margin={{ left: -18, right: 8, top: 8 }}>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="name" {...axisProps} />
                    <YAxis {...axisProps} allowDecimals={false} />
                    <Tooltip cursor={{ fill: "var(--muted)" }} content={<ChartTooltip />} />
                    <Bar dataKey="calls" name={L({ en: "Calls", ar: "استدعاءات" })} fill={CHART.ai} radius={[3, 3, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState title={L({ en: "No calls yet", ar: "لا استدعاءات بعد" })}>{L({ en: "Use any solution — calls appear here live.", ar: "استخدم أي حل — تظهر الاستدعاءات هنا مباشرة." })}</EmptyState>
              )}
            </Pane>
            <Pane title={L({ en: "Latency vs. output size", ar: "الزمن مقابل حجم المخرجات" })}>
              <ResponsiveContainer width="100%" height={260}>
                <ScatterChart margin={{ left: -10, right: 12, top: 8 }}>
                  <CartesianGrid {...gridProps} vertical />
                  <XAxis type="number" dataKey="completionTokens" name="Output tokens" {...axisProps} />
                  <YAxis type="number" dataKey="s" name="Seconds" {...axisProps} />
                  <ZAxis range={[28, 28]} />
                  <Tooltip content={<ChartTooltip />} />
                  <Scatter data={calls.filter((c) => c.ok).map((c) => ({ ...c, s: +(c.ms / 1000).toFixed(2) }))} fill={CHART.ink} fillOpacity={0.55} />
                </ScatterChart>
              </ResponsiveContainer>
            </Pane>
          </div>
          <Pane title={L({ en: "Recent model calls", ar: "أحدث الاستدعاءات" })} flush>
            <div className="scrollbar-thin max-h-[420px] overflow-y-auto">
              <table className="w-full text-[12px]">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border">
                    {["Time", "Solution", "Task", "Model", "Tokens in/out", "Latency", "Egress", ""].map((h) => (
                      <th key={h} className="label-caps !text-[9.5px] px-4 py-2 text-start font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {calls.slice(0, 120).map((c) => {
                    const s = SOLUTIONS.find((x) => x.slug === c.solution);
                    return (
                      <tr key={c.id}>
                        <td className="num px-4 py-1.5 text-muted-foreground">{f.time(c.ts)}</td>
                        <td className="px-4 py-1.5">{s ? `${pad2(s.n)} ${L(s.nav)}` : c.solution}</td>
                        <td className="px-4 py-1.5 font-mono text-[11px] text-muted-foreground">{c.task}</td>
                        <td className="px-4 py-1.5 font-mono text-[11px]">{c.model.split("/").pop()}</td>
                        <td className="num px-4 py-1.5">
                          {c.promptTokens} / {c.completionTokens}
                        </td>
                        <td className="num px-4 py-1.5">{(c.ms / 1000).toFixed(2)} s</td>
                        <td className="num px-4 py-1.5 text-muted-foreground">{formatBytes(c.egressBytes)}</td>
                        <td className="px-4 py-1.5">{c.ok ? <CheckCircle2Icon className="size-3.5 text-success" /> : <XCircle className="size-3.5 text-danger" />}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Pane>
          <p className="text-[11px] text-muted-foreground">
            {L({
              en: "Cost model: on-device at 70 W during inference and AED 0.38/kWh; cloud comparison at USD 3 / 15 per million input / output tokens (typical frontier API list price), converted at 3.6725.",
              ar: "نموذج التكلفة: على الجهاز بقدرة 70 واط أثناء الاستدلال و0.38 درهم/كيلوواط ساعة؛ المقارنة السحابية بسعر 3 / 15 دولاراً لكل مليون رمز إدخال / إخراج (سعر نموذجي)، بسعر صرف 3.6725.",
            })}
          </p>
        </TabsContent>

        {/* ── Models ── */}
        <TabsContent value="models" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
            <StatusPill tone={models?.endpointOk ? "success" : "danger"}>
              {models?.endpointOk ? L({ en: "Model server healthy", ar: "خادم النماذج سليم" }) : L({ en: "Model server unreachable", ar: "خادم النماذج غير متاح" })}
            </StatusPill>
            <span className="text-muted-foreground">
              {models?.host} · {models?.totalServed ?? 0} {L({ en: "models served", ar: "نموذجاً متاحاً" })} · {models?.listMs ?? 0} ms
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
            {(models?.models ?? []).map((m) => {
              const b = bench[m.key];
              return (
                <div key={m.key} className="rounded-lg border border-border bg-card p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[17px] font-light tracking-tight">{m.label}</div>
                      <div className="mt-0.5 text-[12px] text-muted-foreground">
                        {m.publisher} · {m.params} · {m.licence}
                      </div>
                      {m.note && <div className="mt-1 text-[12px] text-muted-foreground">{m.note}</div>}
                    </div>
                    <StatusPill tone={m.available ? "success" : "neutral"}>
                      {m.available ? L({ en: "Available", ar: "متاح" }) : L({ en: "On-device only", ar: "على الجهاز فقط" })}
                    </StatusPill>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {m.capabilities.map((c) => (
                      <span key={c} className="rounded border border-border bg-surface px-1.5 py-0.5 text-[10.5px] text-muted-foreground">
                        {c}
                      </span>
                    ))}
                    {m.servedId && <span className="rounded px-1.5 py-0.5 font-mono text-[10.5px] text-faint">{m.servedId}</span>}
                  </div>
                  <div className="mt-4 border-t border-border pt-3">
                    <Button size="sm" variant="outline" disabled={!m.available || b === "running"} onClick={() => runBench(m.key)}>
                      {b === "running" ? <RefreshCw className="animate-spin" /> : <Play />}
                      {L({ en: "Run Arabic benchmark", ar: "تشغيل اختبار عربي" })}
                    </Button>
                    {b && b !== "running" && (
                      <div className="mt-3">
                        {b.error ? (
                          <p className="text-[12px] text-danger">{b.error}</p>
                        ) : (
                          <>
                            <div className="grid grid-cols-3 gap-3">
                              {[
                                { k: L({ en: "First token", ar: "أول رمز" }), v: `${((b.ttftMs ?? 0) / 1000).toFixed(2)} s` },
                                { k: L({ en: "Total", ar: "الإجمالي" }), v: `${((b.totalMs ?? 0) / 1000).toFixed(1)} s` },
                                { k: L({ en: "Speed", ar: "السرعة" }), v: b.tokensPerSecond ? `${b.tokensPerSecond} tok/s` : "—" },
                              ].map((x) => (
                                <div key={x.k}>
                                  <div className="label-caps">{x.k}</div>
                                  <div className="num mt-0.5 text-[18px] font-light">{x.v}</div>
                                </div>
                              ))}
                            </div>
                            <p className="mt-3 rounded-md bg-surface p-3 text-[12.5px] leading-relaxed whitespace-pre-wrap" dir="auto">
                              {b.output}
                            </p>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* ── Evaluation ── */}
        <TabsContent value="eval">
          <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-4 max-lg:grid-cols-1">
            <Pane
              title={L({ en: "Grounded-answer evaluation — MNDA knowledge", ar: "تقييم الإجابات الموثقة — معرفة الهيئة" })}
              actions={
                <RunButton size="sm" running={evalRun.running} onRun={() => evalRun.start(`/api/solutions/${SLUG}/eval`, {})}>
                  {L({ en: "Run suite", ar: "تشغيل المجموعة" })}
                </RunButton>
              }
              flush
            >
              {evalSummary && (
                <div className="flex items-center gap-8 border-b border-border px-4 py-3">
                  <div>
                    <div className="label-caps">{L({ en: "Score", ar: "النتيجة" })}</div>
                    <div className={cn("num text-[30px] font-light", evalSummary.score >= 90 ? "text-success" : evalSummary.score >= 70 ? "text-warning" : "text-danger")}>{evalSummary.score}%</div>
                  </div>
                  <div className="text-[12px] text-muted-foreground">
                    {evalSummary.passed}/{evalSummary.total} {L({ en: "passed", ar: "ناجحة" })} · {evalSummary.model} · {L({ en: "avg", ar: "متوسط" })} {(evalSummary.avgMs / 1000).toFixed(1)} s · {f.relative(evalSummary.at)}
                  </div>
                </div>
              )}
              <ul className="divide-y divide-border">
                {evalRows.map((r: any) => (
                  <li key={r.id} className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      {r.pass ? <CheckCircle2Icon className="mt-0.5 size-4 text-success" /> : <XCircle className="mt-0.5 size-4 text-danger" />}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[11px] text-muted-foreground">{r.id}</span>
                          <span className="text-[13px] font-medium" dir="auto">
                            {r.q}
                          </span>
                          <StatusPill tone="neutral" dot={false}>
                            {r.topic}
                          </StatusPill>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {r.found.map((x: string) => (
                            <span key={x} className="rounded bg-success-soft px-1.5 py-0.5 text-[10.5px] text-success">
                              ✓ {x}
                            </span>
                          ))}
                          {r.missing.map((x: string) => (
                            <span key={x} className="rounded bg-danger-soft px-1.5 py-0.5 text-[10.5px] text-danger">
                              ✗ {x}
                            </span>
                          ))}
                          {!r.cited && <span className="rounded bg-danger-soft px-1.5 py-0.5 text-[10.5px] text-danger">✗ citation</span>}
                        </div>
                        <p className="mt-1.5 line-clamp-2 text-[11.5px] text-muted-foreground" dir="auto">
                          {r.answer}
                        </p>
                      </div>
                      <span className="num text-[10.5px] text-faint">{(r.ms / 1000).toFixed(1)} s</span>
                    </div>
                  </li>
                ))}
                {!evalRows.length && (
                  <li>
                    <EmptyState icon={<Gauge className="size-4" />} title={L({ en: "Run the suite to measure quality", ar: "شغّل المجموعة لقياس الجودة" })}>
                      {L({ en: "Answers are scored in code against expected facts — the model does not grade itself.", ar: "تُقيَّم الإجابات برمجياً مقابل الحقائق المتوقعة — النموذج لا يقيّم نفسه." })}
                    </EmptyState>
                  </li>
                )}
              </ul>
            </Pane>
            <Pane>
              <AgentTrace run={evalRun} title={L({ en: "Evaluation run", ar: "تشغيل التقييم" })} showReasoning={false} />
            </Pane>
          </div>
        </TabsContent>

        {/* ── Access & residency ── */}
        <TabsContent value="access" className="space-y-4">
          <Pane title={L({ en: "Which classifications each role may retrieve through AI", ar: "التصنيفات التي يحق لكل دور استرجاعها عبر الذكاء الاصطناعي" })} flush>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="label-caps !text-[9.5px] px-4 py-2.5 text-start">{L({ en: "Role", ar: "الدور" })}</th>
                  {policy?.levels.map((l) => (
                    <th key={l} className="label-caps !text-[9.5px] px-4 py-2.5 text-center">
                      {l}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {policy?.roles.map((r) => (
                  <tr key={r}>
                    <td className="px-4 py-2.5 font-medium">{r}</td>
                    {policy.levels.map((l) => (
                      <td key={l} className="px-4 py-2.5 text-center">
                        <Switch checked={policy.policy[r]?.includes(l) ?? false} onCheckedChange={(v) => togglePolicy(r, l, v)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Pane>
          <Pane title={L({ en: "Where every component and every byte lives", ar: "أين يوجد كل مكوّن وكل بايت" })} flush>
            <table className="w-full text-[12.5px]">
              <tbody className="divide-y divide-border">
                {[
                  ["Model weights", local ? "This machine · model folder" : "This machine (private mode) · served remotely in development", "Weights only — no client data"],
                  ["Model server", local ? "localhost — MLX / LM Studio" : `${t?.host ?? ""} (development only)`, "Prompts in memory during a call"],
                  ["NARVO Core", "localhost:3000 — this machine", "Orchestration, rules, agents"],
                  ["Knowledge index", "data/*/knowledge — local disk", "Policies, circulars, manuals"],
                  ["Runtime state", "data/runtime/db.json — local disk", "Approvals, audit trail, records"],
                  ["Speech", local ? "localhost — Whisper" : "omni model (development)", "Audio in memory only"],
                ].map(([c, w, d]) => (
                  <tr key={c}>
                    <td className="px-4 py-2.5 font-medium">{c}</td>
                    <td className="px-4 py-2.5 font-mono text-[11.5px]">{w}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Pane>
        </TabsContent>

        {/* ── Recovery ── */}
        <TabsContent value="recovery">
          <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
            <Pane title={L({ en: "State snapshot", ar: "لقطة الحالة" })}>
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                {L({
                  en: "Every approval, audit event and record change is kept in a single local state file. Export it for backup, inspection or migration to another server.",
                  ar: "تُحفظ كل الاعتمادات وأحداث التدقيق وتغييرات السجلات في ملف حالة محلي واحد. صدّره للنسخ الاحتياطي أو الفحص أو النقل إلى خادم آخر.",
                })}
              </p>
              <Button className="mt-4" variant="outline" asChild>
                <a href={`/api/solutions/${SLUG}/backup`}>
                  <Download />
                  {L({ en: "Download snapshot", ar: "تنزيل اللقطة" })}
                </a>
              </Button>
            </Pane>
            <Pane title={L({ en: "Runbook", ar: "دليل التشغيل" })}>
              <ol className="list-decimal space-y-2 ps-5 text-[13px] leading-relaxed text-muted-foreground">
                <li>{L({ en: "Model server down → restart LM Studio / vLLM service; NARVO retries on the next request.", ar: "توقف خادم النماذج ← أعد تشغيل الخدمة؛ يعيد نارفو المحاولة في الطلب التالي." })}</li>
                <li>{L({ en: "Corrupted state → restore the last snapshot to data/runtime/db.json.", ar: "تلف الحالة ← استعد آخر لقطة إلى data/runtime/db.json." })}</li>
                <li>{L({ en: "Model swap → change the model in the top bar; solutions are model-agnostic.", ar: "تبديل النموذج ← غيّر النموذج من الشريط العلوي؛ الحلول مستقلة عن النموذج." })}</li>
                <li>{L({ en: "Quality regression → re-run the evaluation suite before and after any change.", ar: "تراجع الجودة ← أعد تشغيل مجموعة التقييم قبل أي تغيير وبعده." })}</li>
              </ol>
              <div className="mt-4 flex items-center gap-2 text-[12px] text-muted-foreground">
                <ShieldCheck className="size-3.5 text-success" />
                {L({ en: `Platform up since ${t ? f.time(t.startedAt) : "—"} · ${lang === "ar" ? "مستوى الخدمة يُراقب" : "service level monitored"}`, ar: `المنصة تعمل منذ ${t ? f.time(t.startedAt) : "—"}` })}
              </div>
            </Pane>
          </div>
        </TabsContent>
      </Tabs>
    </SolutionPage>
  );
}
