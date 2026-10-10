"use client";

import { useMemo, useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { KeyValue } from "@/components/narvo/pane";
import { useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { DEPTS, REVIEW, type MetricDef } from "../_lib/catalogue";
import { compute, fmtValue, series, weekLabel, weekRange, addDays, isoWeek, type Dataset } from "../_lib/engine";
import { MetricChart } from "./metric-chart";
import { RagDot, ragLabel } from "./bits";

export function TrendsTab({ ds, def }: { ds: Dataset; def: MetricDef }) {
  const L = useL();
  const [gran, setGran] = useState<"week" | "month">("week");
  const points = useMemo(() => series(ds, def, gran, gran === "week" ? "2026-03-30" : "2026-01-01", REVIEW.dataTo), [ds, def, gran]);
  const ytd = useMemo(() => compute(ds, def, "2026-01-01", REVIEW.dataTo), [ds, def]);
  const q3 = useMemo(() => compute(ds, def, "2026-07-01", "2026-09-30"), [ds, def]);
  const h1 = useMemo(() => compute(ds, def, "2026-01-01", "2026-06-30"), [ds, def]);
  const weeks = useMemo(() => {
    const out = [];
    const [w0] = weekRange(REVIEW.week);
    for (let k = 7; k >= 0; k--) {
      const id = isoWeek(addDays(w0, -7 * k));
      const [a, b] = weekRange(id);
      out.push({ id, ...compute(ds, def, a, b > REVIEW.dataTo ? REVIEW.dataTo : b) });
    }
    return out.reverse();
  }, [ds, def]);
  const dept = DEPTS[def.dept];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="label-caps">{L(dept.name)}</div>
          <h2 className="mt-1 text-[20px] leading-tight font-light tracking-tight">{L(def.name)}</h2>
          <p className="mt-1 max-w-xl text-[12.5px] leading-relaxed text-muted-foreground">{L(def.definition)}</p>
        </div>
        <ToggleGroup type="single" size="sm" variant="outline" value={gran} onValueChange={(v) => v && setGran(v as "week" | "month")}>
          <ToggleGroupItem value="week" className="px-2.5 text-[12px]">
            {L({ en: "Weekly", ar: "أسبوعي" })}
          </ToggleGroupItem>
          <ToggleGroupItem value="month" className="px-2.5 text-[12px]">
            {L({ en: "Monthly", ar: "شهري" })}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <MetricChart def={def} points={points} height={260} kind={def.unit === "count" && gran === "month" ? "bar" : "line"} />
      {gran === "week" && <p className="-mt-3 text-[11px] text-faint">{L({ en: "Week 41 holds data Monday–Friday only.", ar: "يتضمن الأسبوع 41 بيانات الاثنين إلى الجمعة فقط." })}</p>}
      <div className="grid grid-cols-[minmax(0,1fr)_280px] gap-6 max-xl:grid-cols-1">
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="label-caps !text-[9.5px] px-3 py-2 text-start font-medium">{L({ en: "Week", ar: "الأسبوع" })}</th>
                <th className="label-caps !text-[9.5px] px-3 py-2 text-end font-medium">{L({ en: "Value", ar: "القيمة" })}</th>
                <th className="label-caps !text-[9.5px] px-3 py-2 text-end font-medium">{L({ en: "Target", ar: "المستهدف" })}</th>
                <th className="label-caps !text-[9.5px] px-3 py-2 text-start font-medium">{L({ en: "Status", ar: "الحالة" })}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {weeks.map((w, i) => (
                <tr key={w.id} className={cn(i === 0 && "bg-surface")}>
                  <td className="px-3 py-2 text-muted-foreground">{L({ en: weekLabel(w.id), ar: weekLabel(w.id, "ar") })}</td>
                  <td className="num px-3 py-2 text-end font-medium" dir="ltr">{fmtValue(def, w.value)}</td>
                  <td className="num px-3 py-2 text-end text-muted-foreground" dir="ltr">{w.target != null ? `${def.better === "down" ? "≤" : "≥"} ${fmtValue(def, w.target)}` : "—"}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                      <RagDot rag={w.rag} />
                      {ragLabel(w.rag, L)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3.5">
          <KeyValue k={L({ en: "2026 to date", ar: "منذ بداية 2026" })} v={<span className="num" dir="ltr">{fmtValue(def, ytd.value)}</span>} />
          <KeyValue k={L({ en: "H1 2026", ar: "النصف الأول 2026" })} v={<span className="num" dir="ltr">{fmtValue(def, h1.value)}</span>} />
          <KeyValue k={L({ en: "Q3 2026", ar: "الربع الثالث 2026" })} v={<span className="num" dir="ltr">{fmtValue(def, q3.value)}</span>} />
          <div className="my-2 h-px bg-border" />
          <KeyValue k={L({ en: "Owner", ar: "المسؤول" })} v={def.owner} />
          <KeyValue k={L({ en: "Better when", ar: "الأفضل عندما" })} v={def.better === "down" ? L({ en: "lower", ar: "أقل" }) : def.better === "up" ? L({ en: "higher", ar: "أعلى" }) : "—"} />
          <p className="mt-2 font-mono text-[10.5px] leading-snug text-faint">{def.source}</p>
        </div>
      </div>
    </div>
  );
}
