"use client";

import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART, ChartTooltip, axisProps, gridProps } from "@/components/narvo/chart";
import { useL, usePrefs } from "@/lib/i18n";
import { fmtDay } from "../_lib/calendar";
import type { SupplyPoint } from "../_lib/detect";

/** Available-to-this-order vs required, day by day (step lines). */
export function StockChart({ data, unit, maintenanceEnd, showTransfer }: { data: SupplyPoint[]; unit: string; maintenanceEnd: string; showTransfer: boolean }) {
  const L = useL();
  const { lang } = usePrefs();
  if (!data.length) return null;
  const first = data[0].date;
  const last = data[data.length - 1].date;
  const required = data[0].required;
  const labels = {
    planned: L({ en: "Stock now + inbound", ar: "المخزون الحالي + الوارد" }),
    withTransfer: L({ en: "With transfer from JA", ar: "مع التحويل من جبل علي" }),
    required: L({ en: "Required", ar: "المطلوب" }),
  };
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full" style={{ background: CHART.ai }} />
          {labels.planned}
        </span>
        {showTransfer && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: CHART.ink }} />
            {labels.withTransfer}
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0 w-4 border-t border-dashed" style={{ borderColor: CHART.warning }} />
          {labels.required} <span className="num">{required} {unit}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-3 rounded-[2px] bg-muted" />
          {L({ en: "Sahara mill maintenance", ar: "صيانة مصانع صحارى" })}
        </span>
      </div>
      <div className="h-[168px]" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 22, bottom: 0, left: -12 }}>
            <CartesianGrid {...gridProps} />
            <ReferenceArea x1={first} x2={maintenanceEnd < last ? maintenanceEnd : last} fill="var(--muted)" fillOpacity={0.7} strokeOpacity={0} />
            <XAxis dataKey="date" {...axisProps} tickFormatter={(d: string) => fmtDay(d, lang).split(" ").slice(1).join(" ")} interval={2} />
            <YAxis {...axisProps} width={44} domain={[0, Math.ceil((required * 1.15) / 10) * 10]} />
            <ReferenceLine y={required} stroke={CHART.warning} strokeDasharray="4 4" strokeWidth={1} />
            <Tooltip
              content={(p) => (
                <ChartTooltip
                  active={p.active}
                  payload={p.payload as never}
                  label={p.label ? fmtDay(String(p.label), lang) : undefined}
                  format={(v) => `${v} ${unit}`}
                />
              )}
            />
            {showTransfer && <Line type="stepAfter" dataKey="withTransfer" name={labels.withTransfer} stroke={CHART.ink} strokeWidth={1.5} strokeDasharray="5 4" dot={false} isAnimationActive={false} />}
            <Line type="stepAfter" dataKey="planned" name={labels.planned} stroke={CHART.ai} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
