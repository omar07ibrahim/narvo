"use client";

import { useMemo } from "react";
import { CartesianGrid, ComposedChart, Legend, Line, ReferenceArea, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART, axisProps, gridProps } from "@/components/narvo/chart";
import { useL } from "@/lib/i18n";
import { COMFORT, HP_TRIP, zoneCol, type Complaint, type Series, type Trip } from "../_lib/signals";

const fmtTick = (ms: number) => {
  const d = new Date(ms + 4 * 3600000);
  return `${d.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]}`;
};
const fmtFull = (ms: number) => {
  const d = new Date(ms + 4 * 3600000);
  return `${fmtTick(ms)} ${String(d.getUTCHours()).padStart(2, "0")}:00`;
};

function Tip({ active, payload, label, units }: { active?: boolean; payload?: Array<{ name?: string; value?: number; color?: string; dataKey?: string }>; label?: number; units: Record<string, string> }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-[11.5px] shadow-lg">
      <div className="mb-1 font-medium">{label != null ? fmtFull(label) : ""}</div>
      {payload
        .filter((p) => p.value != null)
        .map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="size-2 rounded-full" style={{ background: p.color }} />
            <span className="text-muted-foreground">{p.name}</span>
            <span className="num ms-auto font-medium">
              {Number(p.value).toLocaleString("en-US", { maximumFractionDigits: 1 })} {units[p.dataKey ?? ""] ?? ""}
            </span>
          </div>
        ))}
    </div>
  );
}

export function useWindow(s: Series, range: [number, number]) {
  return useMemo(() => {
    const out: Array<Record<string, number>> = [];
    for (let i = 0; i < s.t.length; i++) {
      if (s.t[i] < range[0] || s.t[i] > range[1]) continue;
      const row: Record<string, number> = { t: s.t[i] };
      for (const [k, v] of Object.entries(s.cols)) row[k] = v[i];
      out.push(row);
    }
    return out;
  }, [s, range]);
}

export function PlantChart({ s, range, trips, cleanAt }: { s: Series; range: [number, number]; trips: Trip[]; cleanAt: number }) {
  const L = useL();
  const data = useWindow(s, range);
  const isAgc = s.site === "AGC";
  const visibleTrips = trips.filter((t) => Date.parse(t.at) >= range[0] && Date.parse(t.at) <= range[1]);
  const units: Record<string, string> = { ch02_dp_kpa: "kPa", ch01_dp_kpa: "kPa", ambient_c: "°C", cht1_kw: "kW", cht2_kw: "kW", cht3_kw: "kW", chws_c: "°C" };
  return (
    <div className="h-[260px]" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 16, right: 4, left: -6, bottom: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={fmtTick} {...axisProps} minTickGap={36} />
          {isAgc ? (
            <>
              <YAxis yAxisId="p" {...axisProps} domain={[800, 1850]} width={46} tickFormatter={(v: number) => `${v}`} />
              <YAxis yAxisId="a" orientation="right" {...axisProps} domain={[20, 50]} width={34} tickFormatter={(v: number) => `${v}°`} />
              <ReferenceLine yAxisId="p" y={HP_TRIP} stroke={CHART.danger} strokeDasharray="3 3" label={{ value: L({ en: "HP cut-out 1,750 kPa", ar: "حد الفصل 1,750 kPa" }), position: "insideTopLeft", fill: "var(--danger)", fontSize: 10 }} />
              {cleanAt >= range[0] && cleanAt <= range[1] && (
                <ReferenceLine yAxisId="p" x={cleanAt} stroke={CHART.ai} strokeDasharray="4 3" label={{ value: L({ en: "CH-02 coil clean", ar: "تنظيف ملفات CH-02" }), position: "insideTopRight", fill: "var(--ai)", fontSize: 10 }} />
              )}
              <Line yAxisId="a" dataKey="ambient_c" name={L({ en: "Ambient", ar: "الحرارة الخارجية" })} stroke={CHART.faint} strokeWidth={1} dot={false} isAnimationActive={false} />
              <Line yAxisId="p" dataKey="ch01_dp_kpa" name={L({ en: "CH-01 discharge", ar: "ضغط CH-01" })} stroke={CHART.ink} strokeWidth={1} dot={false} isAnimationActive={false} opacity={0.55} />
              <Line yAxisId="p" dataKey="ch02_dp_kpa" name={L({ en: "CH-02 discharge", ar: "ضغط CH-02" })} stroke={CHART.warning} strokeWidth={1.3} dot={false} isAnimationActive={false} />
              {visibleTrips.map((t) => (
                <ReferenceDot key={t.at} yAxisId="p" x={Date.parse(t.at)} y={t.dischargeKpa} r={4} fill="var(--danger)" stroke="var(--card)" strokeWidth={1.5} />
              ))}
            </>
          ) : (
            <>
              <YAxis yAxisId="p" {...axisProps} width={46} />
              <YAxis yAxisId="a" orientation="right" {...axisProps} domain={[20, 50]} width={34} tickFormatter={(v: number) => `${v}°`} />
              <Line yAxisId="a" dataKey="ambient_c" name={L({ en: "Ambient", ar: "الحرارة الخارجية" })} stroke={CHART.faint} strokeWidth={1} dot={false} isAnimationActive={false} />
              <Line yAxisId="p" dataKey="cht1_kw" name="CH-T1 kW" stroke={CHART.ink} strokeWidth={1} dot={false} isAnimationActive={false} />
              <Line yAxisId="p" dataKey="cht2_kw" name="CH-T2 kW" stroke={CHART.ai} strokeWidth={1} dot={false} isAnimationActive={false} />
              <Line yAxisId="p" dataKey="cht3_kw" name="CH-T3 kW" stroke={CHART.warning} strokeWidth={1} dot={false} isAnimationActive={false} />
            </>
          )}
          <Tooltip content={<Tip units={units} />} />
          <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} iconType="plainline" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SpaceChart({
  s,
  range,
  zones,
  complaints,
}: {
  s: Series;
  range: [number, number];
  zones: Array<{ id: string; name: string; nameAr: string }>;
  complaints: Complaint[];
}) {
  const L = useL();
  const data = useWindow(s, range);
  const colors = [CHART.warning, CHART.ai, CHART.ink, CHART.info];
  const shown = s.site === "AGC" ? zones.filter((z) => z.id === "Z-MPH" || z.id === "Z-LF") : zones;
  const visible = complaints.filter((c) => c.site === s.site && Date.parse(c.receivedAt) >= range[0] && Date.parse(c.receivedAt) <= range[1]);
  const units: Record<string, string> = { chws_c: "°C", ...Object.fromEntries(shown.map((z) => [zoneCol(z.id), "°C"])) };
  const valueAt = (ms: number, zone: string) => {
    const col = s.cols[zoneCol(zone)];
    if (!col) return null;
    const i = s.t.findIndex((t) => t > ms) - 1;
    return i >= 0 ? Math.max(col[i], col[i + 1] ?? col[i]) : null;
  };
  return (
    <div className="h-[240px]" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 4, left: -6, bottom: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={fmtTick} {...axisProps} minTickGap={36} />
          <YAxis {...axisProps} domain={[s.site === "AGC" ? 5 : 20, s.site === "AGC" ? 31 : 28]} width={46} tickFormatter={(v: number) => `${v}°`} />
          <ReferenceArea y1={COMFORT.low} y2={COMFORT.high} fill="var(--success)" fillOpacity={0.07} stroke="none" />
          {shown.map((z, i) => (
            <Line key={z.id} dataKey={zoneCol(z.id)} name={L({ en: z.name, ar: z.nameAr })} stroke={colors[i % colors.length]} strokeWidth={1.2} dot={false} isAnimationActive={false} />
          ))}
          {s.site === "AGC" && <Line dataKey="chws_c" name={L({ en: "CHW supply", ar: "مياه التبريد" })} stroke={CHART.faint} strokeWidth={1} strokeDasharray="3 2" dot={false} isAnimationActive={false} />}
          {visible.map((c) => {
            const y = valueAt(Date.parse(c.receivedAt), c.zone);
            return y != null ? <ReferenceDot key={c.id} x={Date.parse(c.receivedAt)} y={y} r={3.5} fill="var(--card)" stroke="var(--danger)" strokeWidth={1.6} /> : null;
          })}
          <Tooltip content={<Tip units={units} />} />
          <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} iconType="plainline" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
