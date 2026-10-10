"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ComposedChart, Area, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { motion } from "motion/react";
import { CircleCheck, Send, TriangleAlert, RotateCcw } from "lucide-react";
import { Pane } from "@/components/narvo/pane";
import { StatusPill } from "@/components/narvo/status";
import { CHART, ChartTooltip, axisProps, gridProps } from "@/components/narvo/chart";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFormat, useL, usePrefs } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { PlanRun, PlanningConfig, WhatIf } from "../_lib/types";
import { DEFAULT_WHATIF } from "../_lib/types";
import { Range, Segmented, UseBar, fmtK, fmtPct } from "./bits";

const RES = [
  { id: "JA-pallets", en: "Jebel Ali · pallet positions", ar: "جبل علي · مواقع المنصات" },
  { id: "JA-yard", en: "Jebel Ali · rebar yard (t)", ar: "جبل علي · ساحة الحديد (طن)" },
  { id: "MN-pallets", en: "MN-05 · pallet positions", ar: "MN-05 · مواقع المنصات" },
  { id: "MN-yard", en: "MN-05 · rebar bay (t)", ar: "MN-05 · مخزن الحديد (طن)" },
];
const PLAN_COLOR: Record<string, string> = { A: CHART.muted, B: CHART.warning, C: CHART.ai };

export function WhatIfBar({ whatIf, onChange, computing, ms }: { whatIf: WhatIf; onChange: (w: WhatIf) => void; computing: boolean; ms: number }) {
  const L = useL();
  const f = useFormat();
  const set = (p: Partial<WhatIf>) => onChange({ ...whatIf, ...p });
  const presets: Array<{ label: { en: string; ar: string }; w: Partial<WhatIf> }> = [
    { label: { en: "Marina Quarter +15%", ar: "حي المارينا +15%" }, w: { upliftPct: 15, upliftScope: "mq" } },
    { label: { en: "Lose 1,000 pallet positions", ar: "فقدان 1,000 موقع منصة" }, w: { palletLossJA: 1000 } },
    { label: { en: "Sahara restart +1 week", ar: "تأخر تشغيل صحارى أسبوعاً" }, w: { millDelayWeeks: 1 } },
  ];
  const changed = JSON.stringify(whatIf) !== JSON.stringify(DEFAULT_WHATIF);
  return (
    <Pane
      title={L({ en: "What-if — demand and constraints", ar: "ماذا لو — الطلب والقيود" })}
      subtitle={L({
        en: `3 plans × 100 demand paths × 13 weeks, re-simulated on every change${ms ? ` · ${ms} ms` : ""}`,
        ar: `3 خطط × 100 مسار طلب × 13 أسبوعاً تُعاد محاكاتها مع كل تغيير${ms ? ` · ${ms} مللي ثانية` : ""}`,
      })}
      actions={
        <div className="flex flex-wrap items-center gap-1.5">
          {presets.map((p) => (
            <Button key={p.label.en} size="xs" variant="outline" onClick={() => set(p.w)}>
              {L(p.label)}
            </Button>
          ))}
          {changed && (
            <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={() => onChange(DEFAULT_WHATIF)}>
              <RotateCcw /> {L({ en: "Base case", ar: "الحالة الأساسية" })}
            </Button>
          )}
        </div>
      }
    >
      <div className={cn("grid gap-x-8 gap-y-5 transition-opacity sm:grid-cols-2 xl:grid-cols-3", computing && "opacity-60")}>
        <div>
          <Range
            label={L({ en: "Demand shift", ar: "تغير الطلب" })}
            value={whatIf.upliftPct}
            min={-20}
            max={30}
            step={5}
            onChange={(v) => set({ upliftPct: v })}
            display={`${whatIf.upliftPct > 0 ? "+" : ""}${whatIf.upliftPct}%`}
          />
          <Select value={whatIf.upliftScope} onValueChange={(v) => set({ upliftScope: v as WhatIf["upliftScope"] })}>
            <SelectTrigger size="sm" className="mt-2 h-7 w-full text-[11.5px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mq">{L({ en: "Marina Quarter projects (MN-05 structural)", ar: "مشاريع حي المارينا (المواد الإنشائية MN-05)" })}</SelectItem>
              <SelectItem value="structural">{L({ en: "All structural SKUs", ar: "جميع المواد الإنشائية" })}</SelectItem>
              <SelectItem value="all">{L({ en: "All SKUs", ar: "جميع الأصناف" })}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Range
          label={L({ en: "JA pallet positions lost", ar: "مواقع منصات مفقودة (جبل علي)" })}
          value={whatIf.palletLossJA}
          min={0}
          max={3000}
          step={250}
          onChange={(v) => set({ palletLossJA: v })}
          display={whatIf.palletLossJA ? `−${f.number(whatIf.palletLossJA)}` : "0"}
        />
        <Range
          label={L({ en: "JA rebar yard lost", ar: "سعة ساحة الحديد المفقودة" })}
          value={whatIf.yardLossJA}
          min={0}
          max={1500}
          step={100}
          onChange={(v) => set({ yardLossJA: v })}
          display={whatIf.yardLossJA ? `−${f.number(whatIf.yardLossJA)} t` : "0"}
        />
        <div>
          <div className="label-caps !text-[9.5px]">{L({ en: "Sahara restart delay", ar: "تأخر إعادة تشغيل صحارى" })}</div>
          <Segmented
            className="mt-2"
            value={whatIf.millDelayWeeks}
            onChange={(v) => set({ millDelayWeeks: v })}
            options={[0, 1, 2, 3].map((n) => ({ value: n, label: n === 0 ? L({ en: "On time", ar: "في الموعد" }) : `+${n} ${L({ en: "wk", ar: "أسبوع" })}` }))}
          />
        </div>
        <div>
          <div className="label-caps !text-[9.5px]">{L({ en: "Service target (B, C)", ar: "مستوى الخدمة المستهدف (ب، ج)" })}</div>
          <Segmented
            className="mt-2"
            value={whatIf.serviceTarget}
            onChange={(v) => set({ serviceTarget: v })}
            options={[0.95, 0.975, 0.99].map((v) => ({ value: v, label: `${(v * 100).toFixed(1).replace(".0", "")}%` }))}
          />
        </div>
      </div>
    </Pane>
  );
}

export function PlanCards({
  cfg,
  run,
  selected,
  onSelect,
}: {
  cfg: PlanningConfig;
  run: PlanRun;
  selected: string;
  onSelect: (id: "A" | "B" | "C") => void;
}) {
  const L = useL();
  const f = useFormat();
  const { lang } = usePrefs();
  const best = [...run.plans].filter((p) => p.violations.length === 0).sort((a, b) => b.fillRate - a.fillRate || a.cost.total - b.cost.total)[0];
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {run.plans.map((p) => {
        const spec = cfg.plans.find((x) => x.id === p.id)!;
        const active = selected === p.id;
        const feasible = p.violations.length === 0;
        return (
          <motion.button
            layout
            key={p.id}
            type="button"
            onClick={() => onSelect(p.id)}
            className={cn(
              "flex flex-col rounded-lg border bg-card p-4 text-start transition-colors",
              active ? "border-foreground/60 shadow-[0_0_0_1px_var(--foreground)]" : "border-border hover:border-border-strong",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className={cn("flex size-6 items-center justify-center rounded-full border text-[11px] font-semibold", active ? "border-foreground bg-foreground text-background" : "border-border-strong")}>
                  {p.id}
                </span>
                <span className="text-[13.5px] font-medium">{lang === "ar" ? spec.name_ar : spec.name}</span>
              </div>
              {feasible ? (
                <StatusPill tone="success">{L({ en: "Within limits", ar: "ضمن الحدود" })}</StatusPill>
              ) : (
                <StatusPill tone="danger">
                  {p.violations.length} {L({ en: "over limit", ar: "تجاوز" })}
                </StatusPill>
              )}
            </div>
            <p className="mt-2 line-clamp-3 min-h-[3.6em] text-[11.5px] leading-relaxed text-muted-foreground">{lang === "ar" ? spec.summary_ar : spec.summary}</p>
            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3">
              <div>
                <div className="label-caps !text-[9px]">{L({ en: "Fill rate", ar: "نسبة التلبية" })}</div>
                <div className="num mt-1 text-[24px] leading-none font-light tracking-tight">{fmtPct(p.fillRate)}</div>
                <div className="num mt-1 text-[10.5px] text-muted-foreground">P10 {fmtPct(p.fillRateP10)}</div>
              </div>
              <div>
                <div className="label-caps !text-[9px]">{L({ en: "13-week cost", ar: "تكلفة 13 أسبوعاً" })}</div>
                <div className="num mt-1 text-[24px] leading-none font-light tracking-tight">{fmtK(p.cost.total)}</div>
                <div className="num mt-1 text-[10.5px] text-muted-foreground">
                  AED {fmtK(p.cost.totalP10)}–{fmtK(p.cost.totalP90)}
                </div>
              </div>
            </div>
            <div className="mt-3 space-y-1.5">
              {p.resources.map((r) => {
                const meta = RES.find((x) => x.id === r.id)!;
                return (
                  <div key={r.id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5">
                    <span className="truncate text-[10.5px] text-muted-foreground">{L(meta)}</span>
                    <span className={cn("num text-[10.5px]", r.peakP50 > r.capacity ? "text-danger" : r.peakP50 > r.capacity * 0.95 ? "text-warning" : "text-muted-foreground")}>
                      {f.number(r.peakP50)} / {f.number(r.capacity)}
                    </span>
                    <UseBar value={r.peakP50} capacity={r.capacity} className="col-span-2" />
                  </div>
                );
              })}
            </div>
            {best?.id === p.id && (
              <div className="mt-3 flex items-center gap-1.5 text-[11px] text-ai">
                <CircleCheck className="size-3.5" />
                {L({ en: "Highest service among feasible plans", ar: "أعلى مستوى خدمة بين الخطط القابلة للتنفيذ" })}
              </div>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}

export function StorageChart({ run, selected }: { run: PlanRun; selected: string }) {
  const L = useL();
  const f = useFormat();
  const [res, setRes] = useState("JA-pallets");
  const data = useMemo(
    () =>
      run.weeks.map((w, t) => {
        const row: Record<string, unknown> = { w };
        for (const p of run.plans) {
          const r = p.resources.find((x) => x.id === res)!;
          row[p.id] = r.p50[t];
          if (p.id === selected) row.band = [r.p10[t], r.p90[t]];
        }
        return row;
      }),
    [run, res, selected],
  );
  const cap = run.plans[0].resources.find((x) => x.id === res)!.capacity;
  return (
    <Pane
      title={L({ en: "Storage use vs limit", ar: "استخدام التخزين مقابل الحد" })}
      subtitle={L({ en: "Median path per plan; band = P10–P90 for the selected plan", ar: "المسار الوسيط لكل خطة؛ النطاق = P10–P90 للخطة المختارة" })}
      actions={
        <Select value={res} onValueChange={setRes}>
          <SelectTrigger size="sm" className="h-7 w-[210px] text-[11.5px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RES.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {L(r)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      <div className="h-[230px]" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="w" {...axisProps} tickFormatter={(w) => f.date(w, { day: "numeric", month: "short" })} interval={1} />
            <YAxis {...axisProps} width={50} tickFormatter={(v) => (v >= 10000 ? `${(v / 1000).toFixed(0)}k` : String(v))} domain={[(min: number) => Math.max(0, Math.floor((Math.min(min, cap) * 0.82) / 100) * 100), (max: number) => Math.ceil((Math.max(max, cap) * 1.04) / 100) * 100]} />
            <Tooltip
              content={({ active, payload, label }) => (
                <ChartTooltip
                  active={active}
                  label={label ? f.date(String(label), { day: "numeric", month: "short" }) : undefined}
                  payload={(payload ?? []).filter((p) => !Array.isArray(p.value)).map((p) => ({ name: `${L({ en: "Plan", ar: "خطة" })} ${p.name}`, value: p.value as number, color: p.color as string }))}
                  format={(v) => f.number(Number(v))}
                />
              )}
            />
            <Area dataKey="band" stroke="none" fill={PLAN_COLOR[selected]} fillOpacity={0.12} isAnimationActive={false} />
            <ReferenceLine y={cap} stroke={CHART.danger} strokeDasharray="4 3" label={{ value: `${L({ en: "Limit", ar: "الحد" })} ${f.number(cap)}`, position: "insideTopRight", fontSize: 10, fill: "var(--danger)" }} />
            {run.plans.map((p) => (
              <Line
                key={p.id}
                dataKey={p.id}
                name={p.id}
                stroke={PLAN_COLOR[p.id]}
                strokeWidth={p.id === selected ? 2 : 1.2}
                strokeOpacity={p.id === selected ? 1 : 0.7}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex gap-4 text-[11px] text-muted-foreground">
        {run.plans.map((p) => (
          <span key={p.id} className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4" style={{ background: PLAN_COLOR[p.id] }} />
            {L({ en: "Plan", ar: "الخطة" })} {p.id}
          </span>
        ))}
      </div>
    </Pane>
  );
}

export function CostChart({ run }: { run: PlanRun }) {
  const L = useL();
  const f = useFormat();
  const data = run.plans.map((p) => ({
    plan: `${L({ en: "Plan", ar: "الخطة" })} ${p.id}`,
    holding: Math.round(p.cost.holding),
    stockout: Math.round(p.cost.stockout),
    transfer: Math.round(p.cost.transfer),
    overflow: Math.round(p.cost.overflow),
  }));
  const keys = [
    { k: "holding", c: CHART.ink, l: L({ en: "Holding", ar: "الاحتفاظ بالمخزون" }) },
    { k: "stockout", c: CHART.warning, l: L({ en: "Lost sales", ar: "مبيعات ضائعة" }) },
    { k: "transfer", c: CHART.ai, l: L({ en: "Transfers", ar: "التحويلات" }) },
    { k: "overflow", c: CHART.danger, l: L({ en: "Overflow storage", ar: "تخزين خارجي" }) },
  ];
  return (
    <Pane title={L({ en: "Cost of each plan (13 weeks, mean of 100 paths)", ar: "تكلفة كل خطة (13 أسبوعاً، متوسط 100 مسار)" })}>
      <div className="h-[180px]" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }} barSize={16}>
            <CartesianGrid {...gridProps} horizontal={false} vertical />
            <XAxis type="number" {...axisProps} tickFormatter={(v) => fmtK(v)} />
            <YAxis type="category" dataKey="plan" {...axisProps} width={56} />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.4 }}
              content={({ active, payload, label }) => (
                <ChartTooltip
                  active={active}
                  label={label}
                  payload={(payload ?? []).map((p) => ({ name: keys.find((k) => k.k === p.dataKey)?.l, value: p.value as number, color: p.color as string }))}
                  format={(v) => f.aed(Number(v))}
                />
              )}
            />
            {keys.map((k) => (
              <Bar key={k.k} dataKey={k.k} stackId="c" fill={k.c} fillOpacity={k.k === "holding" ? 0.75 : 0.85} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {keys.map((k) => (
          <span key={k.k} className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-[2px]" style={{ background: k.c }} />
            {k.l}
          </span>
        ))}
      </div>
    </Pane>
  );
}

export function SkuRiskTable({ cfg, run, onPick }: { cfg: PlanningConfig; run: PlanRun; onPick: (key: string) => void }) {
  const L = useL();
  const f = useFormat();
  const [all, setAll] = useState(false);
  const rows = run.plans[0].bySku
    .map((s) => ({
      key: s.key,
      sku: s.sku,
      wh: s.wh,
      fills: run.plans.map((p) => p.bySku.find((b) => b.key === s.key)!),
    }))
    .sort((a, b) => Math.min(...a.fills.map((x) => x.fill)) - Math.min(...b.fills.map((x) => x.fill)));
  const shown = all ? rows : rows.slice(0, 8);
  const tone = (v: number) => (v < 0.93 ? "bg-danger-soft text-danger" : v < 0.97 ? "bg-warning-soft text-warning" : "text-foreground");
  return (
    <Pane
      title={L({ en: "Fill rate by SKU", ar: "نسبة التلبية حسب الصنف" })}
      subtitle={L({ en: "Most exposed first · stock-out weeks in brackets", ar: "الأكثر عرضة أولاً · أسابيع النفاد بين قوسين" })}
      flush
      actions={
        <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={() => setAll((v) => !v)}>
          {all ? L({ en: "Show fewer", ar: "عرض أقل" }) : L({ en: `Show all ${rows.length}`, ar: `عرض الكل (${rows.length})` })}
        </Button>
      }
    >
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-border">
            <th className="label-caps px-4 py-2 text-start !text-[9.5px] font-medium">SKU</th>
            {run.plans.map((p) => (
              <th key={p.id} className="label-caps px-3 py-2 text-end !text-[9.5px] font-medium">
                {L({ en: "Plan", ar: "الخطة" })} {p.id}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {shown.map((r) => (
            <tr key={r.key} className="cursor-pointer hover:bg-muted/40" onClick={() => onPick(r.key)}>
              <td className="px-4 py-1.5">
                <span className="font-mono text-[11.5px]">{r.sku}</span>
                <span className="ms-1.5 text-[10.5px] text-muted-foreground">{r.wh === "JA" ? "JA" : "MN-05"}</span>
                {cfg.skus.find((k) => k.sku === r.sku)?.newProduct && <span className="ms-1.5 text-[10px] text-ai">{L({ en: "launch", ar: "إطلاق" })}</span>}
              </td>
              {r.fills.map((x, i) => (
                <td key={i} className="px-3 py-1 text-end">
                  <span className={cn("num inline-block rounded px-1.5 py-0.5", tone(x.fill))}>
                    {fmtPct(x.fill)} <span className="text-[10px] opacity-70">({f.number(x.stockoutWeeks, { maximumFractionDigits: 1 })})</span>
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Pane>
  );
}

export function ViolationList({ run }: { run: PlanRun }) {
  const L = useL();
  const f = useFormat();
  const all = run.plans.flatMap((p) => p.violations.map((v) => ({ ...v, plan: p.id })));
  return (
    <Pane title={L({ en: "Constraint check", ar: "فحص القيود" })} subtitle={L({ en: "Resource-weeks where the median path exceeds a limit", ar: "الأسابيع التي يتجاوز فيها المسار الوسيط حداً تشغيلياً" })} flush>
      {all.length === 0 ? (
        <div className="flex items-center gap-2 px-4 py-6 text-[12.5px] text-success">
          <CircleCheck className="size-4" /> {L({ en: "All plans fit within storage limits.", ar: "جميع الخطط ضمن حدود التخزين." })}
        </div>
      ) : (
        <ul className="max-h-[260px] divide-y divide-border overflow-auto scrollbar-thin">
          {all.map((v, i) => (
            <li key={i} className="flex items-center gap-3 px-4 py-2 text-[12px]">
              <TriangleAlert className="size-3.5 shrink-0 text-danger" />
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border text-[10.5px] font-semibold">{v.plan}</span>
              <span className="min-w-0 flex-1 truncate">
                {L(RES.find((r) => r.id === v.resource)!)} · {L({ en: "w/c", ar: "أسبوع" })} {f.date(v.week, { day: "numeric", month: "short" })}
              </span>
              <span className="num text-danger">+{f.number(v.excess)}</span>
              <span className="num w-10 text-end text-[11px] text-muted-foreground">{Math.round(v.probability * 100)}%</span>
            </li>
          ))}
        </ul>
      )}
    </Pane>
  );
}

export function SubmitBar({
  cfg,
  run,
  selected,
  onSubmit,
  busy,
  pending,
}: {
  cfg: PlanningConfig;
  run: PlanRun;
  selected: "A" | "B" | "C";
  onSubmit: () => void;
  busy: boolean;
  pending: boolean;
}) {
  const L = useL();
  const { lang } = usePrefs();
  const p = run.plans.find((x) => x.id === selected)!;
  const spec = cfg.plans.find((x) => x.id === selected)!;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <div className="min-w-0 text-[12.5px]">
        <span className="font-medium">
          {L({ en: "Selected:", ar: "المختارة:" })} {L({ en: "Plan", ar: "الخطة" })} {selected} — {lang === "ar" ? spec.name_ar : spec.name}
        </span>
        <span className="ms-2 text-muted-foreground">
          {fmtPct(p.fillRate)} · AED {fmtK(p.cost.total)} · {p.violations.length ? `${p.violations.length} ${L({ en: "violations", ar: "مخالفات" })}` : L({ en: "within limits", ar: "ضمن الحدود" })}
        </span>
      </div>
      <Button onClick={onSubmit} disabled={busy || pending}>
        <Send />
        {pending
          ? L({ en: "Awaiting approval", ar: "بانتظار الاعتماد" })
          : L({ en: `Submit to ${cfg.planner.name} for approval`, ar: `إرسال إلى ${cfg.planner.name} للاعتماد` })}
      </Button>
    </div>
  );
}
