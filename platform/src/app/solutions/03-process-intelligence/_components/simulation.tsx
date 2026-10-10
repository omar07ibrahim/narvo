"use client";

import { useMemo, useState } from "react";
import { ArrowRight, FileSignature, LoaderCircle, Send } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { CHART, ChartTooltip, axisProps, gridProps } from "@/components/narvo/chart";
import { SectionLabel } from "@/components/narvo/pane";
import { Markdown } from "@/components/narvo/markdown";
import { RunButton } from "@/components/narvo/run-button";
import { ApprovalCard } from "@/components/narvo/approval-card";
import { ThinkingLines } from "@/components/narvo/empty";
import type { NarvoRun } from "@/hooks/use-narvo-run";
import type { ApprovalSummary } from "@/lib/ai/events";
import { useL, usePrefs } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { DEFAULT_INTERVENTIONS, fmt0, fmt1, simulate, type Interventions, type PCase, type PLog } from "../_lib/mining";
import { INTERVENTION_LABELS } from "../_lib/labels";

const KEYS = Object.keys(DEFAULT_INTERVENTIONS) as Array<keyof Interventions>;

function Assumption({ label, value, min, max, step, fmt, onChange }: { label: string; value: number; min: number; max: number; step: number; fmt: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <label className="mt-2 flex items-center gap-3 text-[11.5px] text-muted-foreground">
      <span className="w-40 shrink-0">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-1 flex-1 cursor-pointer accent-[var(--ai)]" />
      <span className="num w-12 text-end font-medium text-foreground">{fmt(value)}</span>
    </label>
  );
}

function Delta({ label, before, after, unit, better = "down", digits = 1 }: { label: string; before: number | null; after: number | null; unit: string; better?: "down" | "up"; digits?: number }) {
  const d = before != null && after != null ? after - before : null;
  const good = d == null ? null : better === "down" ? d < -1e-9 : d > 1e-9;
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="label-caps truncate !text-[9.5px]">{label}</div>
      <div className="mt-2 flex items-baseline gap-2" dir="ltr">
        <span className="num text-[13px] text-muted-foreground line-through decoration-faint/60">{digits ? fmt1(before, digits) : fmt0(before)}</span>
        <ArrowRight className="size-3 self-center text-faint" />
        <span className={cn("num text-[22px] leading-none font-light tracking-tight", good ? "text-ai" : good === false ? "text-danger" : "")}>{digits ? fmt1(after, digits) : fmt0(after)}</span>
        <span className="text-[11px] text-muted-foreground">{unit}</span>
      </div>
    </div>
  );
}

export function Simulation({
  log,
  cases,
  throughput,
  memoRun,
  onDraft,
  onChangeLogged,
}: {
  log: PLog;
  cases: PCase[];
  throughput: number;
  memoRun: NarvoRun;
  onDraft: (iv: Interventions) => void;
  onChangeLogged: () => void;
}) {
  const L = useL();
  const { lang, modelKey } = usePrefs();
  const [iv, setIv] = useState<Interventions>(DEFAULT_INTERVENTIONS);
  const [busy, setBusy] = useState(false);
  const [approval, setApproval] = useState<ApprovalSummary | null>(null);
  const sim = useMemo(() => simulate(log, cases, iv, throughput), [log, cases, iv, throughput]);
  const contributions = useMemo(
    () =>
      KEYS.filter((k) => iv[k].on).map((k) => {
        const only = Object.fromEntries(KEYS.map((x) => [x, { ...iv[x], on: x === k }])) as unknown as Interventions;
        const r = simulate(log, cases, only, throughput);
        return { k, median: r.after.median, gated: r.after.gated, rework: r.after.reworkPct };
      }),
    [log, cases, iv, throughput],
  );
  const hist = useMemo(() => {
    const bins = Array.from({ length: 31 }, (_, i) => ({ label: i === 30 ? "60+" : String(i * 2), before: 0, after: 0 }));
    for (const c of sim.cases) {
      if (Number.isNaN(c.before)) continue;
      bins[Math.min(30, Math.floor(c.before / 2))].before++;
      bins[Math.min(30, Math.floor(c.after / 2))].after++;
    }
    return bins;
  }, [sim]);
  const set = <K extends keyof Interventions>(k: K, patch: Partial<Interventions[K]>) => setIv((s) => ({ ...s, [k]: { ...s[k], ...patch } }));
  const anyOn = KEYS.some((k) => iv[k].on);
  const memo = memoRun.text.memo ?? "";

  async function submit() {
    setBusy(true);
    try {
      const res = await fetch("/api/solutions/03-process-intelligence/changes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memo, interventions: KEYS.filter((k) => iv[k].on), expected: memoRun.data.expected, lang, modelKey }),
      });
      if (!res.ok) throw new Error(await res.text());
      const j = await res.json();
      setApproval(j.approval);
      toast.success(L({ en: "Sent to Eng. Omar Al Hammadi for approval", ar: "أُرسلت إلى م. عمر الحمادي للاعتماد" }), { description: j.changeId });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section>
        <SectionLabel>{L({ en: "Interventions and assumptions", ar: "التدخلات والافتراضات" })}</SectionLabel>
        <div className="divide-y divide-border rounded-md border border-border">
          {KEYS.map((k) => {
            const x = iv[k];
            const lab = INTERVENTION_LABELS[k];
            return (
              <div key={k} className={cn("p-3.5 transition-colors", x.on ? "bg-card" : "bg-surface")}>
                <div className="flex items-start gap-3">
                  <Switch checked={x.on} onCheckedChange={(v) => set(k, { on: v } as never)} className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className={cn("text-[13px] font-medium", !x.on && "text-muted-foreground")}>{L(lab)}</div>
                    <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">{L(lab.detail)}</p>
                    {x.on && "catchRate" in x && (
                      <Assumption label={L({ en: "Share of these returns caught", ar: "نسبة الإعادات التي يتم اكتشافها" })} value={x.catchRate} min={0.3} max={1} step={0.05} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set(k, { catchRate: v } as never)} />
                    )}
                    {x.on && "share" in x && (
                      <Assumption label={L({ en: "NOC requests sent in parallel", ar: "الطلبات المرسلة بالتوازي" })} value={x.share} min={0.3} max={1} step={0.05} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set(k, { share: v } as never)} />
                    )}
                    {x.on && "compliance" in x && (
                      <>
                        <Assumption label={L({ en: "NOCs meeting the service level", ar: "الشهادات الملتزمة بالمستوى" })} value={x.compliance} min={0.3} max={1} step={0.05} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set(k, { compliance: v } as never)} />
                        <Assumption label={L({ en: "Cap (calendar days)", ar: "السقف (أيام تقويمية)" })} value={x.capDays} min={5} max={14} step={1} fmt={(v) => `${v} d`} onChange={(v) => set(k, { capDays: v } as never)} />
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <SectionLabel>
          {L({ en: `Replay of ${fmt0(sim.completed)} issued applications — before → after`, ar: `إعادة محاكاة ${fmt0(sim.completed)} طلباً صادراً — قبل ← بعد` })}
        </SectionLabel>
        <div className="grid grid-cols-3 gap-3 max-md:grid-cols-2">
          <Delta label={L({ en: "Median cycle time", ar: "وسيط زمن الدورة" })} before={sim.before.median} after={sim.after.median} unit={L({ en: "days", ar: "يوم" })} />
          <Delta label={L({ en: "Gated communities", ar: "المجتمعات المسوّرة" })} before={sim.before.gated} after={sim.after.gated} unit={L({ en: "days", ar: "يوم" })} />
          <Delta label={L({ en: "90th percentile", ar: "المئين 90" })} before={sim.before.p90} after={sim.after.p90} unit={L({ en: "days", ar: "يوم" })} />
          <Delta label={L({ en: "Rework (returned)", ar: "إعادة العمل" })} before={sim.before.reworkPct} after={sim.after.reworkPct} unit="%" />
          <Delta label={L({ en: "Officer touches / case", ar: "مرات المعالجة لكل طلب" })} before={sim.before.touches} after={sim.after.touches} unit="" digits={2} />
          <Delta label={L({ en: "Issue capacity / month", ar: "طاقة الإصدار الشهرية" })} before={sim.throughputBefore} after={sim.throughputAfter} unit="" better="up" digits={0} />
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-faint">
          {L({
            en: `Each issued case is replayed with its own recorded waits: prevented return loops are removed (${sim.loopsPrevented.noc} NOC, ${sim.loopsPrevented.struct} structural, ${sim.loopsPrevented.site} site-plan), intake-caught NOC problems become tracked holds at the developer's median turnaround, and parallel requests overlap the hold with the reviews. Capacity uses Little's law at constant work-in-progress.`,
            ar: `يُعاد تشغيل كل طلب صادر بأزمنة الانتظار المسجلة له: تُحذف دورات الإعادة التي يمكن تفاديها (${sim.loopsPrevented.noc} شهادة، ${sim.loopsPrevented.struct} إنشائي، ${sim.loopsPrevented.site} مخطط)، وتتحول مشكلات الشهادة المكتشفة عند الاستلام إلى انتظار متابَع بوسيط مدة المطور، ويتداخل الطلب المتوازي مع التدقيق. وتُحتسب الطاقة بقانون ليتل مع ثبات العمل الجاري.`,
          })}
        </p>
      </section>

      <section className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-6 max-xl:grid-cols-1">
        <div>
          <SectionLabel>{L({ en: "Cycle-time distribution — before vs after", ar: "توزيع زمن الدورة — قبل وبعد" })}</SectionLabel>
          <div className="h-[200px]" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hist} margin={{ top: 8, right: 4, left: -16, bottom: 0 }} barGap={0} barCategoryGap={2}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" {...axisProps} interval={3} />
                <YAxis {...axisProps} allowDecimals={false} />
                <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.4 }} content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} iconType="circle" />
                <Bar dataKey="before" name={L({ en: "Before", ar: "قبل" })} fill={CHART.faint} opacity={0.6} />
                <Bar dataKey="after" name={L({ en: "After (simulated)", ar: "بعد (محاكاة)" })} fill={CHART.ai} opacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <SectionLabel>{L({ en: "Each intervention alone", ar: "أثر كل تدخل منفرداً" })}</SectionLabel>
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="py-1.5 text-start font-normal" />
                <th className="py-1.5 ps-3 text-end font-normal">{L({ en: "Median", ar: "الوسيط" })}</th>
                <th className="py-1.5 ps-3 text-end font-normal">{L({ en: "Gated", ar: "مسوّرة" })}</th>
                <th className="py-1.5 ps-3 text-end font-normal">{L({ en: "Rework", ar: "إعادة" })}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {contributions.map((c) => (
                <tr key={c.k}>
                  <td className="py-1.5 pe-2">{L(INTERVENTION_LABELS[c.k])}</td>
                  <td className="num py-1.5 text-end">{fmt1(c.median)}</td>
                  <td className="num py-1.5 text-end">{fmt1(c.gated)}</td>
                  <td className="num py-1.5 text-end">{fmt1(c.rework)}%</td>
                </tr>
              ))}
              <tr className="font-medium">
                <td className="py-1.5 pe-2">{L({ en: "Combined", ar: "مجتمعة" })}</td>
                <td className="num py-1.5 text-end text-ai">{fmt1(sim.after.median)}</td>
                <td className="num py-1.5 text-end text-ai">{fmt1(sim.after.gated)}</td>
                <td className="num py-1.5 text-end text-ai">{fmt1(sim.after.reworkPct)}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="label-caps">{L({ en: "Change proposal", ar: "مقترح التغيير" })}</div>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {L({
                en: "The model drafts a change memo from the computed baseline, this simulation and the pilot's early read. Eng. Omar Yousef Al Hammadi approves it into the change log.",
                ar: "يصوغ النموذج مذكرة تغيير من خط الأساس المحسوب وهذه المحاكاة والقراءة الأولية للتجربة، ويعتمدها م. عمر يوسف الحمادي في سجل التغييرات.",
              })}
            </p>
          </div>
          <RunButton running={memoRun.running} onRun={() => onDraft(iv)} disabled={!anyOn} icon={<FileSignature />} variant={memo ? "outline" : "default"}>
            {memo ? L({ en: "Redraft memo", ar: "إعادة الصياغة" }) : L({ en: "Draft change memo", ar: "صياغة مذكرة التغيير" })}
          </RunButton>
        </div>
        {memoRun.running && !memo && <ThinkingLines lines={6} className="mt-4" />}
        {memoRun.status === "error" && <div className="mt-3 rounded-md border border-danger/25 bg-danger-soft p-3 text-[12.5px] text-danger">{memoRun.error}</div>}
        {memo && (
          <div className="mt-4 rounded-md border border-border bg-card p-5">
            <Markdown citations={memoRun.data.citations} streaming={memoRun.running} className="[&_h2]:mt-5 [&_h2]:text-[10.5px] [&_h2]:font-medium [&_h2]:tracking-[0.16em] [&_h2]:text-muted-foreground [&_h2]:uppercase">
              {memo.replace(/\[(\d+(?:\s*,\s*\d+)+)\]/g, (_, g: string) => g.split(/\s*,\s*/).map((n) => `[${n}]`).join(""))}
            </Markdown>
            {!memoRun.running && (
              <div className="mt-4 border-t border-border pt-4">
                {!approval ? (
                  <Button onClick={submit} disabled={busy}>
                    {busy ? <LoaderCircle className="animate-spin" /> : <Send />}
                    {L({ en: "Submit to Eng. Omar Al Hammadi", ar: "رفع إلى م. عمر الحمادي" })}
                  </Button>
                ) : (
                  <ApprovalCard
                    approval={approval}
                    onDecided={(s) => {
                      setApproval({ ...approval, status: s });
                      if (s === "approved") onChangeLogged();
                    }}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
