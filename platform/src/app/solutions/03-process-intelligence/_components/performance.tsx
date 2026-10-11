"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART, ChartTooltip, axisProps, gridProps } from "@/components/narvo/chart";
import { SectionLabel } from "@/components/narvo/pane";
import { useL } from "@/lib/i18n";
import { computeStats, computeVariants, fmt0, fmt1, histogram, reasonFamily, weekly, type PCase, type PLog } from "../_lib/mining";
import { REASON_AR, activityShort, developerLabel } from "./labels";

const legendStyle = { fontSize: 11, color: "var(--muted-foreground)" };

export function Performance({ log, cases, lang }: { log: PLog; cases: PCase[]; lang: "en" | "ar" }) {
  const L = useL();
  const st = useMemo(() => computeStats(log, cases), [log, cases]);
  const hist = useMemo(() => histogram(log, cases), [log, cases]);
  const wk = useMemo(() => weekly(log, cases).map((w) => ({ ...w, label: w.week.slice(5), rework: w.submitted ? (w.returned / w.submitted) * 100 : null })), [log, cases]);
  const fam = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of st.reasons) {
      const k = log.kind === "mnda" ? reasonFamily(r.label) : r.label;
      m.set(k, (m.get(k) ?? 0) + r.count);
    }
    const tot = [...m.values()].reduce((a, b) => a + b, 0);
    return [...m.entries()].map(([k, v]) => ({ name: lang === "ar" ? (REASON_AR[k] ?? k) : k, count: v, pct: tot ? (v / tot) * 100 : 0 })).sort((a, b) => b.count - a.count);
  }, [st, log.kind, lang]);
  const hasGated = log.attrKeys.includes("gated");
  return (
    <div className="space-y-7">
      <section>
        <SectionLabel>{L({ en: "Cycle time distribution — issued applications (days)", ar: "توزيع زمن الدورة — الطلبات الصادرة (بالأيام)" })}</SectionLabel>
        <div className="h-[230px]" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hist} margin={{ top: 22, right: 8, left: -14, bottom: 0 }} barCategoryGap={1}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="label" {...axisProps} interval={2} />
              <YAxis {...axisProps} allowDecimals={false} />
              <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.4 }} content={<ChartTooltip />} />
              <Legend wrapperStyle={legendStyle} iconSize={8} iconType="circle" />
              {hasGated ? (
                <>
                  <Bar dataKey="nonGated" stackId="a" name={L({ en: "Non-gated", ar: "غير مسوّرة" })} fill={CHART.ai} opacity={0.85} />
                  <Bar dataKey="gated" stackId="a" name={L({ en: "Gated (NOC required)", ar: "مسوّرة (تتطلب شهادة)" })} fill={CHART.ink} opacity={0.75} />
                </>
              ) : (
                <Bar dataKey="all" name={L({ en: "Cases", ar: "الحالات" })} fill={CHART.ink} opacity={0.8} />
              )}
              {st.cycleMedian != null && <ReferenceLine x={hist[Math.min(hist.length - 1, Math.floor(st.cycleMedian / 2))]?.label} stroke={CHART.warning} strokeDasharray="3 3" label={{ value: `median ${fmt1(st.cycleMedian)} d`, position: "top", fill: "var(--warning)", fontSize: 10 }} />}
              {log.kind === "mnda" && <ReferenceLine x="14" stroke={CHART.success} strokeDasharray="2 4" label={{ value: "target 15 d", position: "insideTopLeft", fill: "var(--success)", fontSize: 10 }} />}
            </BarChart>
          </ResponsiveContainer>
        </div>
        {hasGated && (
          <p className="mt-1 text-[11.5px] text-muted-foreground">
            {L({ en: "Median — gated", ar: "الوسيط — مسوّرة" })} <span className="num font-medium text-foreground">{fmt1(st.gatedMedian)} {lang === "ar" ? "يوم" : "d"}</span> (n = {fmt0(st.gatedN)}) ·{" "}
            {L({ en: "non-gated", ar: "غير مسوّرة" })} <span className="num font-medium text-foreground">{fmt1(st.nonGatedMedian)} {lang === "ar" ? "يوم" : "d"}</span> (n = {fmt0(st.nonGatedN)}) · P90{" "}
            <span className="num font-medium text-foreground">{fmt1(st.cycleP90)} {lang === "ar" ? "يوم" : "d"}</span>
          </p>
        )}
      </section>

      <section className="grid grid-cols-2 gap-6 max-xl:grid-cols-1">
        <div>
          <SectionLabel>{L({ en: "Weekly flow — submitted vs issued", ar: "التدفق الأسبوعي — المقدّمة مقابل الصادرة" })}</SectionLabel>
          <div className="h-[210px]" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={wk} margin={{ top: 10, right: 8, left: -14, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={18} />
                <YAxis {...axisProps} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={legendStyle} iconSize={8} iconType="circle" />
                <Line dataKey="submitted" name={L({ en: "Submitted", ar: "مقدّمة" })} stroke={CHART.faint} strokeWidth={1.4} dot={false} />
                <Line dataKey="issued" name={L({ en: "Issued", ar: "صادرة" })} stroke={CHART.ink} strokeWidth={1.8} dot={false} />
                {log.kind === "mnda" && <ReferenceLine x="07-13" stroke={CHART.warning} strokeDasharray="3 3" label={{ value: "Circular 14", position: "insideTopRight", fill: "var(--warning)", fontSize: 10 }} />}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <SectionLabel>{L({ en: "Rework — share of applications returned, by submission week", ar: "إعادة العمل — نسبة الطلبات المعادة حسب أسبوع التقديم" })}</SectionLabel>
          <div className="h-[210px]" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={wk} margin={{ top: 10, right: 8, left: -14, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={18} />
                <YAxis {...axisProps} unit="%" />
                <Tooltip content={<ChartTooltip format={(v) => `${Number(v).toFixed(1)}%`} />} />
                <Line dataKey="rework" name={L({ en: "Returned", ar: "معادة" })} stroke={CHART.warning} strokeWidth={1.6} dot={{ r: 1.6 }} connectNulls />
                {log.kind === "mnda" && <ReferenceLine x="09-28" stroke={CHART.ai} strokeDasharray="3 3" label={{ value: "pilot", position: "insideTopRight", fill: "var(--ai)", fontSize: 10 }} />}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-6 max-xl:grid-cols-1">
        <div>
          <SectionLabel>{L({ en: "Return reasons", ar: "أسباب الإعادة" })}</SectionLabel>
          <ul className="space-y-2.5">
            {fam.map((r) => (
              <li key={r.name}>
                <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
                  <span>{r.name}</span>
                  <span className="num text-muted-foreground">
                    <span className="font-medium text-foreground">{fmt1(r.pct, 0)}%</span> · {fmt0(r.count)}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-foreground/70" style={{ width: `${r.pct}%` }} />
                </div>
              </li>
            ))}
            {!fam.length && <li className="text-[12px] text-muted-foreground">{L({ en: "No returns in this selection.", ar: "لا توجد إعادات في هذا الاختيار." })}</li>}
          </ul>
        </div>
        {st.byDeveloper.length > 0 && (
          <div>
            <SectionLabel>{L({ en: "NOC hold by master developer (mean days)", ar: "مدة انتظار الشهادة حسب المطور (متوسط الأيام)" })}</SectionLabel>
            <ul className="space-y-2.5">
              {st.byDeveloper.map((d) => (
                <li key={d.name}>
                  <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
                    <span className="truncate">{developerLabel(d.name, lang)}</span>
                    <span className="num shrink-0 text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {fmt1(d.mean)} {L({ en: "d", ar: "يوم" })}
                      </span>{" "}
                      · n = {d.n}
                    </span>
                  </div>
                  <div className="relative mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full rounded-full ${d.mean > 9.2 ? "bg-warning" : "bg-foreground/60"}`} style={{ width: `${Math.min(100, (d.mean / 15) * 100)}%` }} />
                    <div className="absolute inset-y-0 w-px bg-ai" style={{ insetInlineStart: `${(9 / 15) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-faint">{L({ en: "Teal mark: 7 working days ≈ 9 calendar days (Circular 14/2026 §4.4).", ar: "العلامة: 7 أيام عمل ≈ 9 أيام تقويمية (البند 4.4 من التعميم 14/2026)." })}</p>
          </div>
        )}
      </section>
    </div>
  );
}

export function VariantsTable({ log, cases, lang }: { log: PLog; cases: PCase[]; lang: "en" | "ar" }) {
  const L = useL();
  const variants = useMemo(() => computeVariants(log, cases), [log, cases]);
  const returnIdx = log.activities.findIndex((a) => /return/i.test(a));
  const holdIdx = log.activities.indexOf("Awaiting master-developer NOC");
  return (
    <div>
      <p className="mb-3 text-[12px] text-muted-foreground">
        {L({ en: `${variants.length} distinct paths through the process. The top 10 cover`, ar: `${variants.length} مساراً مختلفاً عبر العملية. تغطي أكثر 10 مسارات` })}{" "}
        <span className="num font-medium text-foreground">{fmt1(variants.slice(0, 10).reduce((a, v) => a + v.share, 0))}%</span> {L({ en: "of cases.", ar: "من الحالات." })}
      </p>
      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="label-caps !text-[9.5px] w-8 px-3 py-2 text-start font-medium">#</th>
              <th className="label-caps !text-[9.5px] px-3 py-2 text-start font-medium">{L({ en: "Path", ar: "المسار" })}</th>
              <th className="label-caps !text-[9.5px] w-28 px-3 py-2 text-end font-medium">{L({ en: "Cases", ar: "الحالات" })}</th>
              <th className="label-caps !text-[9.5px] w-24 px-3 py-2 text-end font-medium">{L({ en: "Median", ar: "الوسيط" })}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {variants.slice(0, 15).map((v, i) => (
              <tr key={v.key} className="align-top">
                <td className="num px-3 py-2 text-muted-foreground">{i + 1}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap items-center gap-1">
                    {v.steps.map((s, k) => (
                      <span key={k} className="inline-flex items-center gap-1">
                        <span
                          className={`rounded border px-1.5 py-0.5 text-[10.5px] ${s === returnIdx ? "border-warning/40 bg-warning-soft text-warning" : s === holdIdx ? "border-info/30 bg-info-soft text-info" : "border-border bg-surface text-muted-foreground"}`}
                        >
                          {activityShort(log.activities[s], lang)}
                        </span>
                        {k < v.steps.length - 1 && <span className="text-faint rtl:rotate-180">›</span>}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2 text-end">
                  <div className="num font-medium">{fmt0(v.count)}</div>
                  <div className="mt-1 ms-auto h-1 w-20 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-foreground/60" style={{ width: `${Math.min(100, v.share * 2)}%` }} />
                  </div>
                  <div className="num mt-0.5 text-[10.5px] text-muted-foreground">{fmt1(v.share)}%</div>
                </td>
                <td className="num px-3 py-2 text-end">{v.medianDays != null ? `${fmt1(v.medianDays)} ${lang === "ar" ? "يوم" : "d"}` : <span className="text-faint">{L({ en: "open", ar: "مفتوحة" })}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
