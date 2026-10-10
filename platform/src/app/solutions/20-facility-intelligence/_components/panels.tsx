"use client";

import { useMemo, useState } from "react";
import { Camera, MessageSquareWarning, Send, Stethoscope } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CHART, ChartTooltip, axisProps, gridProps } from "@/components/narvo/chart";
import { FileDrop, type DroppedFile } from "@/components/narvo/file-drop";
import { RunButton } from "@/components/narvo/run-button";
import { SectionLabel, KeyValue } from "@/components/narvo/pane";
import { StatusPill, Confidence } from "@/components/narvo/status";
import { ThinkingLines } from "@/components/narvo/empty";
import type { NarvoRun } from "@/hooks/use-narvo-run";
import { useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { COMFORT, efficiencyMatched, occupiedAgc, occupiedHq, weatherNormalised, zoneCol, type Complaint, type Series, type Trip } from "../_lib/signals";

/* ───────────── Energy ───────────── */

export function EnergyPanel({
  s,
  energy,
  sep25,
  cleanAt,
}: {
  s: Series;
  energy: { tariffAedPerKwh: number; months: Array<{ month: string; y2025: number; y2026: number | null }>; oct2026PartialKwh: number };
  sep25: Array<{ date: string; ambient_mean_c: number; chiller_kwh: number }>;
  cleanAt: string;
}) {
  const L = useL();
  const wn = useMemo(() => weatherNormalised(s, sep25), [s, sep25]);
  const eff = useMemo(() => efficiencyMatched(s, cleanAt), [s, cleanAt]);
  const data = energy.months.slice(0, 9).map((m) => ({ month: m.month, "2025": m.y2025, "2026": m.y2026 }));
  const saving = wn.excessKwh * energy.tariffAedPerKwh;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2">
        {[
          [L({ en: "September 2026", ar: "سبتمبر 2026" }), `${Math.round(wn.kwh26).toLocaleString("en-US")} kWh`, L({ en: "chillers CH-01 + CH-02", ar: "المبردان CH-01 وCH-02" })],
          [L({ en: "vs September 2025", ar: "مقارنة بسبتمبر 2025" }), `+${(wn.raw * 100).toFixed(0)}%`, `${Math.round(wn.kwh25).toLocaleString("en-US")} kWh`],
          [L({ en: "Weather-normalised", ar: "بعد تطبيع الطقس" }), `+${(wn.normalised * 100).toFixed(1)}%`, L({ en: `cooling degree-days ${wn.cdd26.toFixed(0)} vs ${wn.cdd25.toFixed(0)}`, ar: `أيام التبريد ${wn.cdd26.toFixed(0)} مقابل ${wn.cdd25.toFixed(0)}` })],
          [L({ en: "Excess energy (Sep)", ar: "الطاقة الزائدة (سبتمبر)" }), `${Math.round(wn.excessKwh).toLocaleString("en-US")} kWh`, `≈ AED ${Math.round(saving).toLocaleString("en-US")} @ ${energy.tariffAedPerKwh}/kWh`],
        ].map(([k, v, sub]) => (
          <div key={k} className="rounded-md border border-border bg-card p-3">
            <div className="label-caps !text-[9.5px]">{k}</div>
            <div className="num mt-1.5 text-[20px] font-light tracking-tight" dir="ltr">
              {v}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>
          </div>
        ))}
      </div>
      <div>
        <SectionLabel>{L({ en: "Monthly chiller energy — 2025 vs 2026 (kWh)", ar: "استهلاك المبردات الشهري — 2025 مقابل 2026 (كيلوواط ساعة)" })}</SectionLabel>
        <div className="h-[230px]" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="month" {...axisProps} />
              <YAxis {...axisProps} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
              <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.4 }} content={<ChartTooltip format={(v) => `${Number(v).toLocaleString("en-US")} kWh`} />} />
              <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} iconType="circle" />
              <Bar dataKey="2025" fill={CHART.faint} opacity={0.6} radius={[2, 2, 0, 0]} />
              <Bar dataKey="2026" fill={CHART.ai} opacity={0.85} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div>
        <SectionLabel>{L({ en: "Plant efficiency at matched ambient — before vs after the coil clean (kW per TR)", ar: "كفاءة المحطة عند الحرارة نفسها — قبل التنظيف وبعده (كيلوواط لكل طن)" })}</SectionLabel>
        <table className="w-full max-w-xl text-[12.5px]">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="py-1.5 text-start font-normal">{L({ en: "Ambient band", ar: "نطاق الحرارة" })}</th>
              <th className="py-1.5 text-end font-normal">{L({ en: "Before (21 days)", ar: "قبل (21 يوماً)" })}</th>
              <th className="py-1.5 text-end font-normal">{L({ en: "After", ar: "بعد" })}</th>
              <th className="py-1.5 text-end font-normal">{L({ en: "Change", ar: "التغير" })}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {eff.bins.map((b) => (
              <tr key={b.band}>
                <td className="py-1.5">{b.band}</td>
                <td className="num py-1.5 text-end">{b.pre?.toFixed(3) ?? "—"}</td>
                <td className="num py-1.5 text-end">{b.post?.toFixed(3) ?? "—"}</td>
                <td className={cn("num py-1.5 text-end", b.pre && b.post && b.post < b.pre && "text-ai")} dir="ltr">
                  {b.pre && b.post ? `${(((b.post - b.pre) / b.pre) * 100).toFixed(1)}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 max-w-2xl text-[11.5px] leading-relaxed text-muted-foreground">
          {L({
            en: "The efficiency gain grows with ambient temperature — a clean condenser matters most on the hottest afternoons. Hours above 40 °C after the clean are not yet available (October is cooler), so the September excess is the fairer estimate of what the fouled coil cost.",
            ar: "يزداد التحسن في الكفاءة مع ارتفاع الحرارة الخارجية، إذ تظهر أهمية نظافة المكثف في أشد فترات الظهيرة حرارة. لا تتوفر بعد ساعات فوق 40 درجة بعد التنظيف (أكتوبر أبرد)، لذا فإن الزيادة في سبتمبر هي التقدير الأدق لتكلفة اتساخ الملفات.",
          })}
        </p>
      </div>
    </div>
  );
}

/* ───────────── Complaints ───────────── */

export function ComplaintsPanel({ s, complaints, trips, zones }: { s: Series; complaints: Complaint[]; trips: Trip[]; zones: Array<{ id: string; name: string; nameAr: string }> }) {
  const L = useL();
  const tripMs = trips.map((t) => Date.parse(t.at));
  const list = complaints.filter((c) => c.site === s.site).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  const zoneTemp = (c: Complaint) => {
    const col = s.cols[zoneCol(c.zone)];
    const ms = Date.parse(c.receivedAt);
    const i = s.t.findIndex((t) => t > ms) - 1;
    return col && i >= 0 ? Math.max(col[i], col[i + 1] ?? col[i]) : null;
  };
  return (
    <div className="divide-y divide-border">
      {list.map((c) => {
        const ms = Date.parse(c.receivedAt);
        const after = tripMs.filter((t) => ms >= t && ms - t <= 4 * 3600000).map((t) => (ms - t) / 3600000);
        const temp = zoneTemp(c);
        const z = zones.find((x) => x.id === c.zone);
        return (
          <div key={c.id} className="grid grid-cols-[150px_minmax(0,1fr)_170px] gap-4 py-3 max-lg:grid-cols-1">
            <div className="text-[11.5px] text-muted-foreground">
              <div className="font-mono text-[10.5px]">{c.id}</div>
              <div className="num mt-0.5">{c.receivedAt.slice(0, 16).replace("T", " ")}</div>
              <div>{c.channel}</div>
            </div>
            <div>
              <div className="text-[11.5px] text-muted-foreground">
                {z ? L({ en: z.name, ar: z.nameAr }) : c.zone} · {c.category}
              </div>
              <p className="mt-1 text-[13px] leading-relaxed" dir="auto">
                {c.text}
              </p>
            </div>
            <div className="flex flex-col items-start gap-1.5 text-[11.5px]">
              {temp != null && (
                <StatusPill tone={temp > COMFORT.high ? "danger" : temp < COMFORT.low ? "info" : "neutral"}>
                  <span className="num" dir="ltr">
                    {temp.toFixed(1)} °C
                  </span>
                </StatusPill>
              )}
              {after.length > 0 && (
                <StatusPill tone="warning">{L({ en: `${after[0].toFixed(1)} h after a CH-02 trip`, ar: `بعد ${after[0].toFixed(1)} ساعة من توقف CH-02` })}</StatusPill>
              )}
              {!temp && !after.length && <span className="text-faint">{L({ en: "before BMS window", ar: "قبل فترة بيانات المبنى" })}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ───────────── Spaces & assets ───────────── */

export function SpacesPanel({
  s,
  site,
  ppm,
}: {
  s: Series;
  site: { zones: Array<{ id: string; name: string; nameAr: string; area: number; capacity: number; ahu: string[]; use: string; setpoint: number }>; assets: Array<{ id: string; type: string; name: string; location: string; capacityTR?: number; note?: string }> };
  ppm: Array<{ id: string; site: string; asset: string; task: string; taskAr: string; frequency: string; lastDone: string; due: string; status: string; history: Array<{ date: string; event: string }> }>;
}) {
  const L = useL();
  const occ = s.site === "HQ" ? occupiedHq : occupiedAgc;
  const last7 = s.t[s.t.length - 1] - 7 * 24 * 3600000;
  const sepEnd = Date.parse("2026-10-01T00:00:00+04:00");
  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="label-caps !text-[9.5px] px-3 py-2 text-start font-medium">{L({ en: "Zone", ar: "المساحة" })}</th>
              <th className="label-caps !text-[9.5px] px-3 py-2 text-end font-medium">{L({ en: "Area / capacity", ar: "المساحة / السعة" })}</th>
              <th className="label-caps !text-[9.5px] px-3 py-2 text-start font-medium">{L({ en: "Served by", ar: "التغذية" })}</th>
              <th className="label-caps !text-[9.5px] px-3 py-2 text-end font-medium">{L({ en: "Hours > 24.5 °C — Sep", ar: "ساعات > 24.5 — سبتمبر" })}</th>
              <th className="label-caps !text-[9.5px] px-3 py-2 text-end font-medium">{L({ en: "Last 7 days", ar: "آخر 7 أيام" })}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {site.zones.map((z) => {
              const col = s.cols[zoneCol(z.id)];
              const sep = col ? s.t.filter((t, i) => t < sepEnd && occ(t) && col[i] > COMFORT.high).length : 0;
              const recent = col ? s.t.filter((t, i) => t >= last7 && occ(t) && col[i] > COMFORT.high).length : 0;
              return (
                <tr key={z.id}>
                  <td className="px-3 py-2">
                    <div className="font-medium">{L({ en: z.name, ar: z.nameAr })}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {z.id} · {z.use} · {L({ en: "setpoint", ar: "الضبط" })} {z.setpoint} °C
                    </div>
                  </td>
                  <td className="num px-3 py-2 text-end text-muted-foreground">
                    {z.area.toLocaleString("en-US")} m² · {z.capacity}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{z.ahu.join(", ")}</td>
                  <td className={cn("num px-3 py-2 text-end", sep > 20 && "font-medium text-danger")}>{sep}</td>
                  <td className={cn("num px-3 py-2 text-end", recent > 5 ? "text-warning" : "text-success")}>{recent}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div>
        <SectionLabel>{L({ en: "Planned preventive maintenance", ar: "الصيانة الوقائية المخططة" })}</SectionLabel>
        <div className="divide-y divide-border rounded-md border border-border">
          {ppm
            .filter((p) => p.site === s.site)
            .map((p) => (
              <div key={p.id} className="grid grid-cols-[minmax(0,1fr)_120px_110px] gap-3 px-3 py-2.5 text-[12.5px] max-md:grid-cols-1">
                <div className="min-w-0">
                  <div className="font-medium">{L({ en: p.task, ar: p.taskAr })}</div>
                  <div className="font-mono text-[10.5px] text-muted-foreground">
                    {p.id} · {p.asset} · {p.frequency}
                  </div>
                  {p.history.length > 0 && <div className="mt-1 text-[11.5px] text-muted-foreground">{p.history[p.history.length - 1].event}</div>}
                </div>
                <div className="num text-[11.5px] text-muted-foreground">
                  {L({ en: "due", ar: "الاستحقاق" })} {p.due}
                </div>
                <div>
                  <StatusPill tone={p.status === "Overdue" ? "danger" : p.status === "Due" ? "warning" : "success"}>{p.status}</StatusPill>
                </div>
              </div>
            ))}
        </div>
      </div>
      <div>
        <SectionLabel>{L({ en: "Assets", ar: "الأصول" })}</SectionLabel>
        <div className="grid grid-cols-2 gap-2 max-lg:grid-cols-1">
          {site.assets.map((a) => (
            <div key={a.id} className="rounded-md border border-border p-2.5 text-[12px]">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{a.id}</span>
                <span className="text-[11px] text-muted-foreground">{a.type}</span>
              </div>
              <div className="text-muted-foreground">{a.name}</div>
              <div className="text-[11px] text-faint">{a.location}</div>
              {a.note && <div className="mt-1 text-[11px] text-muted-foreground">{a.note}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ───────────── Bring your own: report triage ───────────── */

export interface TriageResult {
  site: string;
  category: string;
  zone: string;
  asset: string;
  zoneName: string | null;
  assetName: string | null;
  priority: string;
  priorityReason: string;
  observation: string;
  likelyCause: string;
  knownIssue: { match: boolean; reference: string | null; reason: string };
  suggestedAction: string;
  reply: string;
  confidence: number;
}

export function TriageCard({ run, site, onTriage, onWorkOrder }: { run: NarvoRun; site: "AGC" | "HQ"; onTriage: (text: string, image?: string) => void; onWorkOrder: (t: TriageResult, text: string) => void }) {
  const L = useL();
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<DroppedFile | null>(null);
  const t = run.data.triage as TriageResult | undefined;
  const samples = [
    { en: "Library study room 3 is freezing in the morning, students are wearing jackets.", ar: "غرفة الدراسة 3 في المكتبة باردة جداً الصبح، الطلاب لابسين جاكيتات." },
    { en: "السلام عليكم، قاعة الورش رقم ٢ فيها ماي ينقط من فتحة المكيف على الطاولات والأرضية صارت زلقة.", ar: "السلام عليكم، قاعة الورش رقم ٢ فيها ماي ينقط من فتحة المكيف على الطاولات والأرضية صارت زلقة." },
  ];
  return (
    <div className="space-y-3">
      <Textarea value={text} onChange={(e) => setText(e.target.value)} dir="auto" className="min-h-20 text-[12.5px]" placeholder={L({ en: "Paste a complaint or describe the issue…", ar: "الصق شكوى أو صف المشكلة…" })} />
      <div className="flex flex-wrap gap-1.5">
        {samples.map((s, i) => (
          <button key={i} type="button" onClick={() => setText(L(s))} className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:border-border-strong hover:text-foreground" dir="auto">
            {L(s).slice(0, 38)}…
          </button>
        ))}
      </div>
      {photo ? (
        <div className="flex items-center gap-3 rounded-md border border-border p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.dataUrl} alt="" className="size-12 rounded object-cover" />
          <span className="min-w-0 flex-1 truncate text-[12px]">{photo.name}</span>
          <Button size="xs" variant="ghost" onClick={() => setPhoto(null)}>
            {L({ en: "Remove", ar: "إزالة" })}
          </Button>
        </div>
      ) : (
        <FileDrop compact accept="image/*" label={L({ en: "Add a photo of the issue", ar: "أضف صورة للمشكلة" })} hint={L({ en: "Read by the vision model on this machine", ar: "يقرؤها نموذج الرؤية على هذا الجهاز" })} onFiles={(fs) => fs[0]?.dataUrl && setPhoto(fs[0])} />
      )}
      <RunButton running={run.running} onRun={() => onTriage(text, photo?.dataUrl)} disabled={!text.trim() && !photo} size="sm" icon={photo ? <Camera /> : <Stethoscope />}>
        {L({ en: "Triage", ar: "فرز البلاغ" })}
      </RunButton>
      {run.running && !t && <ThinkingLines lines={4} />}
      {run.status === "error" && <div className="rounded-md border border-danger/25 bg-danger-soft p-2.5 text-[12px] text-danger">{run.error}</div>}
      {t && (
        <div className="space-y-2 rounded-md border border-border bg-surface p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusPill tone={t.priority === "P1" ? "danger" : t.priority === "P2" ? "warning" : "neutral"}>{t.priority}</StatusPill>
            <StatusPill tone="neutral" dot={false}>
              {t.category}
            </StatusPill>
            <Confidence value={t.confidence} className="ms-auto" />
          </div>
          <KeyValue k={L({ en: "Zone", ar: "المساحة" })} v={t.zoneName ?? t.zone} />
          <KeyValue k={L({ en: "Asset", ar: "الأصل" })} v={t.assetName ?? t.asset} />
          <p className="text-[12px] leading-relaxed text-muted-foreground">{t.observation}</p>
          <p className="text-[12px] leading-relaxed">
            <span className="label-caps me-1 !text-[9.5px]">{L({ en: "Likely cause", ar: "السبب المرجح" })}</span>
            {t.likelyCause}
          </p>
          <p className="text-[12px] leading-relaxed">
            <span className="label-caps me-1 !text-[9.5px]">{L({ en: "Action", ar: "الإجراء" })}</span>
            {t.suggestedAction}
          </p>
          {t.knownIssue.match && (
            <p className="rounded bg-warning-soft px-2 py-1 text-[11.5px] text-warning">
              {L({ en: "Matches a known issue", ar: "يطابق مشكلة معروفة" })}: {t.knownIssue.reference} — {t.knownIssue.reason}
            </p>
          )}
          <div className="rounded border border-border bg-card p-2 text-[12px] leading-relaxed" dir="auto">
            <div className="label-caps mb-1 flex items-center gap-1 !text-[9.5px]">
              <MessageSquareWarning className="size-3" /> {L({ en: "Reply to reporter", ar: "الرد على صاحب البلاغ" })}
            </div>
            {t.reply}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              onWorkOrder(t, text);
              toast.message(L({ en: "Drafting a work order for this report", ar: "جارٍ صياغة أمر عمل لهذا البلاغ" }));
            }}
          >
            <Send />
            {L({ en: "Create work order", ar: "إنشاء أمر عمل" })}
          </Button>
        </div>
      )}
      <p className="text-[11px] text-faint">{site === "AGC" ? "Al Ghaf Community Centre" : "MNDA Tower"}</p>
    </div>
  );
}
