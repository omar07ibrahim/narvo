"use client";

import { useMemo, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PencilLine, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Pane } from "@/components/narvo/pane";
import { StatusPill } from "@/components/narvo/status";
import { CHART, ChartTooltip, axisProps, gridProps } from "@/components/narvo/chart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { useFormat, useL, usePrefs } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { CalendarDef, ForecastBundle, Override, PlanResult, PlanningConfig, SeriesForecast, WhId } from "../_lib/types";
import { Segmented, Sparkline, fmtPct } from "./bits";

const DAY = 86400000;
const parse = (s: string) => Date.parse(s + "T00:00:00Z");

export function ForecastView({
  cfg,
  bundle,
  calendar,
  selectedKey,
  onSelect,
  overrides,
  onOverridesChange,
  plan,
}: {
  cfg: PlanningConfig;
  bundle: ForecastBundle;
  calendar: CalendarDef;
  selectedKey: string;
  onSelect: (k: string) => void;
  overrides: Override[];
  onOverridesChange: (o: Override[]) => void;
  plan?: PlanResult;
}) {
  const L = useL();
  const f = useFormat();
  const { lang } = usePrefs();
  const [wh, setWh] = useState<"all" | WhId>("all");
  const [showBacktest, setShowBacktest] = useState(true);
  const series = bundle.series.find((s) => s.key === selectedKey) ?? bundle.series[0];
  const meta = cfg.skus.find((s) => s.sku === series.sku)!;
  const unit = lang === "ar" ? meta.unit_ar : meta.unit;
  const fillOf = (key: string) => plan?.bySku.find((b) => b.key === key)?.fill;

  const families = Object.keys(cfg.families);
  const list = bundle.series.filter((s) => wh === "all" || s.wh === wh);

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <Pane
        title={L({ en: "SKU × warehouse", ar: "الصنف × المستودع" })}
        flush
        actions={
          <Segmented
            value={wh}
            onChange={setWh}
            options={[
              { value: "all", label: L({ en: "All", ar: "الكل" }) },
              { value: "JA", label: "JA" },
              { value: "MN", label: "MN-05" },
            ]}
          />
        }
        bodyClassName="max-h-[760px] overflow-auto scrollbar-thin"
      >
        {families.map((fam) => {
          const rows = list.filter((s) => cfg.skus.find((k) => k.sku === s.sku)?.family === fam);
          if (!rows.length) return null;
          return (
            <div key={fam}>
              <div className="label-caps sticky top-0 z-10 border-b border-border bg-card/95 px-4 py-1.5 !text-[9.5px] backdrop-blur">{L(cfg.families[fam])}</div>
              <ul className="divide-y divide-border">
                {rows.map((s) => {
                  const fill = fillOf(s.key);
                  const active = s.key === series.key;
                  return (
                    <li key={s.key}>
                      <button
                        type="button"
                        onClick={() => onSelect(s.key)}
                        className={cn("flex w-full items-center gap-3 px-4 py-2 text-start transition-colors", active ? "bg-ai-soft/70" : "hover:bg-muted/50")}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[11.5px] font-medium">{s.sku}</span>
                            <span className="rounded border border-border px-1 text-[9.5px] text-muted-foreground">{s.wh === "JA" ? "JA" : "MN-05"}</span>
                            {overrides.some((o) => o.key === s.key) && <PencilLine className="size-3 text-warning" />}
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 text-[10.5px] text-muted-foreground">
                            {s.backtest ? (
                              <span className="num">MAPE {fmtPct(s.backtest.mape)}</span>
                            ) : (
                              <span>{L({ en: "New product", ar: "منتج جديد" })}</span>
                            )}
                            {fill != null && (
                              <span className={cn("num", fill < 0.95 ? "text-danger" : fill < 0.98 ? "text-warning" : "")}>
                                · {L({ en: "fill", ar: "تلبية" })} {fmtPct(fill)}
                              </span>
                            )}
                          </div>
                        </div>
                        <Sparkline history={s.history.values.slice(-26)} forecast={s.forecast.p50.slice(0, 13)} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </Pane>

      <div className="flex min-w-0 flex-col gap-4">
        <Pane
          title={
            <span className="flex items-center gap-2">
              <span className="font-mono normal-case tracking-normal text-foreground">{series.sku}</span>
              <span>·</span>
              <span>{L({ en: series.wh === "JA" ? "Jebel Ali" : "Ras Al Marsa MN-05", ar: series.wh === "JA" ? "جبل علي" : "رأس المرسى MN-05" })}</span>
            </span>
          }
          subtitle={`${lang === "ar" ? meta.name_ar : meta.name} · ${L({ en: "weekly demand", ar: "الطلب الأسبوعي" })} (${unit})`}
          actions={
            series.backtest && (
              <label className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
                <Switch checked={showBacktest} onCheckedChange={setShowBacktest} />
                {L({ en: "Backtest", ar: "الاختبار الرجعي" })}
              </label>
            )
          }
        >
          <ForecastChart series={series} calendar={calendar} showBacktest={showBacktest} overrides={overrides.filter((o) => o.key === series.key)} unit={unit} />
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px] text-muted-foreground">
            <Legend swatch="bg-foreground/80" label={L({ en: "Actual sales", ar: "المبيعات الفعلية" })} />
            <Legend swatch="bg-ai" label={L({ en: "Forecast P50", ar: "التوقع (الوسيط)" })} />
            <Legend swatch="bg-ai/20" label={L({ en: "P10–P90 range", ar: "نطاق P10–P90" })} tall />
            {showBacktest && series.backtest && <Legend swatch="border-t border-dashed border-ai bg-transparent" label={L({ en: "Backtest (fitted without last 12 weeks)", ar: "اختبار رجعي (دون آخر 12 أسبوعاً)" })} />}
            <Legend swatch="bg-warning/15" label={L({ en: "Ramadan", ar: "رمضان" })} tall />
            <Legend swatch="bg-muted-foreground/10" label={L({ en: "Summer midday ban", ar: "حظر العمل وقت الظهيرة" })} tall />
          </div>
        </Pane>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <ForecastTable series={series} unit={unit} overrides={overrides} onOverridesChange={onOverridesChange} />
          <ModelCard series={series} cfg={cfg} />
        </div>
      </div>
    </div>
  );

  function Legend({ swatch, label, tall }: { swatch: string; label: string; tall?: boolean }) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className={cn("inline-block w-4", tall ? "h-2.5 rounded-[2px]" : "h-0.5", swatch)} />
        {label}
      </span>
    );
  }
  void f;
}

function ForecastChart({
  series,
  calendar,
  showBacktest,
  overrides,
  unit,
}: {
  series: SeriesForecast;
  calendar: CalendarDef;
  showBacktest: boolean;
  overrides: Override[];
  unit: string;
}) {
  const f = useFormat();
  const L = useL();
  const data = useMemo(() => {
    const hist = series.history.weeks.slice(-78).map((w, i, arr) => {
      const idx = series.history.weeks.length - arr.length + i;
      const bi = series.backtest ? series.backtest.weeks.indexOf(w) : -1;
      return {
        w,
        actual: series.history.values[idx],
        bt: bi >= 0 ? series.backtest!.model[bi] : undefined,
        btBand: bi >= 0 ? ([series.backtest!.p10[bi], series.backtest!.p90[bi]] as [number, number]) : undefined,
      };
    });
    const last = hist[hist.length - 1];
    const fc = series.forecast.weeks.map((w, h) => {
      const o = overrides.find((x) => x.week === w);
      return {
        w,
        p50: o ? o.value : series.forecast.p50[h],
        stat: o ? series.forecast.p50[h] : undefined,
        band: [series.forecast.p10[h], series.forecast.p90[h]] as [number, number],
        ovr: o ? o.value : undefined,
      };
    });
    const bridge = last ? [{ ...last, p50: last.actual, band: [last.actual, last.actual] as [number, number] }] : [];
    return [...hist.slice(0, -1), ...bridge, ...fc];
  }, [series, overrides]);

  const weeks = data.map((d) => d.w);
  const areas = useMemo(() => {
    const out: Array<{ x1: string; x2: string; kind: "ramadan" | "summer" }> = [];
    const inRange = (from: string, to: string) => weeks.filter((w) => parse(w) + 5 * DAY >= parse(from) && parse(w) <= parse(to));
    for (const r of calendar.ramadan) {
      const ws = inRange(r.from, r.to);
      if (ws.length) out.push({ x1: ws[0], x2: ws[ws.length - 1], kind: "ramadan" });
    }
    for (const y of [2024, 2025, 2026]) {
      const ws = inRange(`${y}-${calendar.summerBan.fromMonthDay}`, `${y}-${calendar.summerBan.toMonthDay}`);
      if (ws.length) out.push({ x1: ws[0], x2: ws[ws.length - 1], kind: "summer" });
    }
    return out;
  }, [weeks, calendar]);
  const today = series.forecast.weeks[0];
  const fmtW = (w: string) => f.date(w, { day: "numeric", month: "short", year: "numeric" });
  const fmtTick = (w: string) => f.date(w, { month: "short", year: "2-digit" });
  const fmtV = (v: number | string) => (typeof v === "number" ? f.number(v, { maximumFractionDigits: series.key.startsWith("RB-") ? 1 : 0 }) : String(v));

  return (
    <div className="h-[300px] w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
          <CartesianGrid {...gridProps} />
          {areas.map((a, i) => (
            <ReferenceArea
              key={i}
              x1={a.x1}
              x2={a.x2}
              fill={a.kind === "ramadan" ? "var(--warning)" : "var(--muted-foreground)"}
              fillOpacity={a.kind === "ramadan" ? 0.1 : 0.06}
              strokeOpacity={0}
              ifOverflow="hidden"
            />
          ))}
          <XAxis dataKey="w" {...axisProps} tickFormatter={fmtTick} interval={12} minTickGap={24} />
          <YAxis {...axisProps} width={56} tickFormatter={(v) => (v >= 10000 ? `${Math.round(v / 1000)}k` : String(v))} />
          <Tooltip
            content={({ active, payload, label }) => (
              <ChartTooltip
                active={active}
                label={label ? `${L({ en: "w/c", ar: "أسبوع" })} ${fmtW(String(label))} · ${unit}` : undefined}
                payload={(payload ?? [])
                  .filter((p) => !Array.isArray(p.value))
                  .map((p) => ({ name: String(p.name), value: p.value as number, color: p.color as string }))}
                format={fmtV}
              />
            )}
          />
          <Area dataKey="band" name="P10–P90" stroke="none" fill={CHART.ai} fillOpacity={0.14} isAnimationActive={false} />
          {showBacktest && <Area dataKey="btBand" name="Backtest P10–P90" stroke="none" fill={CHART.ai} fillOpacity={0.07} isAnimationActive={false} />}
          <Line dataKey="actual" name={L({ en: "Actual", ar: "فعلي" })} stroke={CHART.ink} strokeWidth={1.2} dot={false} isAnimationActive={false} />
          {showBacktest && (
            <Line dataKey="bt" name={L({ en: "Backtest", ar: "اختبار رجعي" })} stroke={CHART.ai} strokeWidth={1.3} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
          )}
          <Line dataKey="stat" name={L({ en: "Statistical", ar: "إحصائي" })} stroke={CHART.muted} strokeWidth={1} strokeDasharray="2 3" dot={false} isAnimationActive={false} connectNulls={false} />
          <Line dataKey="p50" name="P50" stroke={CHART.ai} strokeWidth={1.8} dot={false} isAnimationActive={false} />
          <Line dataKey="ovr" name={L({ en: "Override", ar: "تعديل" })} stroke="none" dot={{ r: 3.5, fill: CHART.warning, stroke: "var(--card)", strokeWidth: 1.5 }} isAnimationActive={false} />
          <ReferenceLine x={today} stroke="var(--border-strong)" strokeDasharray="3 3" label={{ value: L({ en: "Plan start", ar: "بداية الخطة" }), position: "insideTopLeft", fontSize: 10, fill: "var(--muted-foreground)" }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function ForecastTable({
  series,
  unit,
  overrides,
  onOverridesChange,
}: {
  series: SeriesForecast;
  unit: string;
  overrides: Override[];
  onOverridesChange: (o: Override[]) => void;
}) {
  const L = useL();
  const f = useFormat();
  const dec = series.sku.startsWith("RB-") ? 1 : 0;
  const rows = series.forecast.weeks.slice(0, 13).map((w, h) => ({
    w,
    p10: series.forecast.p10[h],
    p50: series.forecast.p50[h],
    p90: series.forecast.p90[h],
    note: series.forecast.notes[h],
    o: overrides.find((x) => x.key === series.key && x.week === w),
  }));
  return (
    <Pane title={L({ en: "Forecast — next 13 weeks", ar: "التوقعات — الأسابيع الـ13 القادمة" })} subtitle={L({ en: "Click a P50 value to override it (reason required — tracked in the override KPI)", ar: "انقر على قيمة الوسيط لتعديلها (يلزم ذكر السبب — تُحتسب في مؤشر التعديلات)" })} flush>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="label-caps px-4 py-2 text-start !text-[9.5px] font-medium">{L({ en: "Week of", ar: "أسبوع" })}</th>
              <th className="label-caps px-3 py-2 text-end !text-[9.5px] font-medium">P10</th>
              <th className="label-caps px-3 py-2 text-end !text-[9.5px] font-medium">P50</th>
              <th className="label-caps px-3 py-2 text-end !text-[9.5px] font-medium">P90</th>
              <th className="label-caps px-4 py-2 text-start !text-[9.5px] font-medium">{L({ en: "Calendar", ar: "التقويم" })}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.w} className={cn(r.o && "bg-warning-soft/40")}>
                <td className="num px-4 py-1.5 whitespace-nowrap">{f.date(r.w, { day: "numeric", month: "short", year: "2-digit" })}</td>
                <td className="num px-3 py-1.5 text-end text-muted-foreground">{f.number(r.p10, { maximumFractionDigits: dec })}</td>
                <td className="px-3 py-1 text-end">
                  <OverrideCell series={series} week={r.w} p50={r.p50} unit={unit} existing={r.o} onChange={onOverridesChange} />
                </td>
                <td className="num px-3 py-1.5 text-end text-muted-foreground">{f.number(r.p90, { maximumFractionDigits: dec })}</td>
                <td className="px-4 py-1.5 text-[11px] text-muted-foreground">
                  {r.o ? (
                    <span className="text-warning" dir="auto">
                      {L({ en: "Override", ar: "تعديل" })}: {r.o.reason}
                    </span>
                  ) : (
                    r.note
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Pane>
  );
}

function OverrideCell({
  series,
  week,
  p50,
  unit,
  existing,
  onChange,
}: {
  series: SeriesForecast;
  week: string;
  p50: number;
  unit: string;
  existing?: Override;
  onChange: (o: Override[]) => void;
}) {
  const L = useL();
  const f = useFormat();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(existing?.value ?? p50));
  const [reason, setReason] = useState(existing?.reason ?? "");
  const [busy, setBusy] = useState(false);
  const dec = series.sku.startsWith("RB-") ? 1 : 0;

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/solutions/17-demand-planning/overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: series.key, week, value: Number(value), reason }),
      });
      if (!res.ok) throw new Error(await res.text());
      const j = await res.json();
      onChange(j.overrides);
      setOpen(false);
      toast.success(L({ en: "Override saved and audited — plans recomputed", ar: "حُفظ التعديل وسُجّل — أُعيد احتساب الخطط" }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function withdraw() {
    if (!existing) return;
    setBusy(true);
    try {
      const res = await fetch("/api/solutions/17-demand-planning/overrides", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: existing.id }),
      });
      if (!res.ok) throw new Error(await res.text());
      onChange((await res.json()).overrides);
      setOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const delta = Number(value) && p50 ? ((Number(value) - p50) / p50) * 100 : 0;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "num rounded px-1.5 py-0.5 font-medium transition-colors hover:bg-ai-soft",
            existing ? "text-warning underline decoration-dotted underline-offset-2" : "text-ai",
          )}
        >
          {f.number(existing ? existing.value : p50, { maximumFractionDigits: dec })}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="end">
        <div className="label-caps mb-2">
          {L({ en: "Override forecast", ar: "تعديل التوقع" })} · {f.date(week, { day: "numeric", month: "short" })}
        </div>
        <div className="text-[11.5px] text-muted-foreground">
          {L({ en: "Statistical P50", ar: "الوسيط الإحصائي" })}: <span className="num font-medium text-foreground">{f.number(existing?.original ?? p50, { maximumFractionDigits: dec })}</span> {unit}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Input type="number" value={value} onChange={(e) => setValue(e.target.value)} className="h-8 text-[12.5px]" />
          <span className={cn("num w-16 text-end text-[11.5px]", Math.abs(delta) > 0.05 ? "text-warning" : "text-muted-foreground")}>
            {delta >= 0 ? "+" : ""}
            {delta.toFixed(1)}%
          </span>
        </div>
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={L({ en: "Reason (e.g. APCC pour schedule confirmed)", ar: "السبب (مثال: تأكيد جدول صب الخرسانة)" })}
          className="mt-2 h-8 text-[12px]"
        />
        <div className="mt-3 flex items-center justify-between gap-2">
          {existing ? (
            <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={withdraw} disabled={busy}>
              <RotateCcw /> {L({ en: "Withdraw", ar: "سحب" })}
            </Button>
          ) : (
            <span />
          )}
          <Button size="sm" onClick={save} disabled={busy || reason.trim().length < 4 || !(Number(value) >= 0)}>
            {L({ en: "Save override", ar: "حفظ التعديل" })}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ModelCard({ series, cfg }: { series: SeriesForecast; cfg: PlanningConfig }) {
  const L = useL();
  if (series.method === "analogue") {
    const l = cfg.launch;
    return (
      <Pane title={L({ en: "Model", ar: "النموذج" })}>
        <div className="flex items-center gap-2">
          <Sparkles className="size-3.5 text-ai" />
          <span className="text-[13px] font-medium">{L({ en: "Analogue launch curve", ar: "منحنى إطلاق قائم على منتج مماثل" })}</span>
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
          {L({
            en: `No sales history — ThermaShield launches on 2 Nov 2026. Seasonality borrowed from ${l.analogue} (roofing), run-rate ${l.runRate[series.wh]} pails/week after an ${l.rampWeeks}-week ramp, plus ${l.preOrders[series.wh]} pre-ordered pails (${l.preOrderAccounts} trade accounts in total) in launch week. Wide range: ±${Math.round(l.levelCv * 100)}% level uncertainty.`,
            ar: `لا يوجد سجل مبيعات — يُطلق ثيرماشيلد في 2 نوفمبر 2026. الموسمية مستعارة من ${l.analogue} (العزل)، ومعدل ${l.runRate[series.wh]} دلواً أسبوعياً بعد فترة تصاعد ${l.rampWeeks} أسابيع، إضافة إلى ${l.preOrders[series.wh]} دلواً محجوزاً مسبقاً في أسبوع الإطلاق. نطاق واسع: ±${Math.round(l.levelCv * 100)}% عدم يقين في المستوى.`,
          })}
        </p>
      </Pane>
    );
  }
  const p = series.params!;
  const e = series.effects!;
  const b = series.backtest!;
  const better = b.mape < b.naiveMape;
  const eff = (label: string, v: number) => (
    <div className="flex items-baseline justify-between py-1 text-[12px]">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("num font-medium", v < -0.005 ? "text-warning" : v > 0.005 ? "text-ai" : "text-muted-foreground")}>
        {v > 0 ? "+" : ""}
        {(v * 100).toFixed(1)}%
      </span>
    </div>
  );
  return (
    <Pane title={L({ en: "Model & backtest", ar: "النموذج والاختبار الرجعي" })}>
      <div className="text-[12.5px] font-medium">{L({ en: "Holt-Winters · 52-week seasonality · damped trend", ar: "هولت-وينترز · موسمية 52 أسبوعاً · اتجاه مخمَّد" })}</div>
      <div className="num mt-1 font-mono text-[11px] text-muted-foreground">
        α {p.alpha} · β {p.beta} · γ {p.gamma} · φ {p.phi} · σ {(series.residualCv * 100).toFixed(1)}%
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 rounded-md border border-border bg-surface p-2.5 text-center">
        <div>
          <div className="label-caps !text-[9px]">NARVO</div>
          <div className={cn("num mt-1 text-[18px] font-light", better ? "text-ai" : "")}>{fmtPct(b.mape)}</div>
        </div>
        <div>
          <div className="label-caps !text-[9px]">{L({ en: "Naive", ar: "بسيط" })}</div>
          <div className="num mt-1 text-[18px] font-light text-muted-foreground">{fmtPct(b.naiveMape)}</div>
        </div>
        <div>
          <div className="label-caps !text-[9px]">{L({ en: "Coverage", ar: "التغطية" })}</div>
          <div className="num mt-1 text-[18px] font-light">{fmtPct(b.coverage, 0)}</div>
        </div>
      </div>
      <p className="mt-1.5 text-[10.5px] leading-snug text-faint">
        {L({
          en: "MAPE over the last 12 weeks, model refitted without them; naive = same week last year; coverage = actuals inside P10–P90.",
          ar: "متوسط الخطأ المطلق النسبي لآخر 12 أسبوعاً بعد إعادة الملاءمة دونها؛ البسيط = نفس الأسبوع من العام الماضي؛ التغطية = القيم الفعلية ضمن P10–P90.",
        })}
      </p>
      <div className="label-caps mt-3 mb-1 !text-[9.5px]">{L({ en: "Calendar effects (estimated)", ar: "آثار التقويم (مقدّرة)" })}</div>
      <div className="divide-y divide-border">
        {eff(L({ en: "Ramadan week", ar: "أسبوع رمضان" }), e.ramadan)}
        {eff(L({ en: "Eid holidays", ar: "عطلة العيد" }), e.eid)}
        {eff(L({ en: "Summer midday ban", ar: "حظر العمل وقت الظهيرة" }), e.summer)}
        {eff(L({ en: "Public holidays", ar: "العطل الرسمية" }), e.holiday)}
        {eff(L({ en: "Promotion week", ar: "أسبوع العروض" }), e.promo)}
      </div>
      {!better && (
        <div className="mt-2">
          <StatusPill tone="warning">{L({ en: "Naive wins on this series — review", ar: "النموذج البسيط أفضل هنا — للمراجعة" })}</StatusPill>
        </div>
      )}
    </Pane>
  );
}
