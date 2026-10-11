"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PencilLine, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusPill } from "@/components/narvo/status";
import { CHART, axisProps, gridProps, ChartTooltip } from "@/components/narvo/chart";
import { EmptyState } from "@/components/narvo/empty";
import { useFormat, useL, usePrefs } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { computeScores, flipAnalysis, sensitivity, type ScoreRow } from "../_lib/scoring";
import type { PriceSchedule, ProcState, Tender } from "../_lib/types";

export function ScoringView({
  tender,
  state,
  prices,
  onOverride,
}: {
  tender: Tender;
  state: ProcState;
  prices: PriceSchedule[];
  onOverride: (supplierId: string, criterionId: string, score: number | null, reason: string, by: string) => Promise<void>;
}) {
  const L = useL();
  const { lang } = usePrefs();
  const f = useFormat();
  const [tw, setTw] = useState(tender.weights.technical);
  const weights = { technical: tw, commercial: 100 - tw };
  const rows = useMemo(() => computeScores(tender, state.suppliers, prices, state.evaluations, state.overrides, weights), [tender, state, prices, tw]); // eslint-disable-line react-hooks/exhaustive-deps
  const sens = useMemo(() => sensitivity(tender, state.suppliers, prices, state.evaluations, state.overrides), [tender, state, prices]);
  const flip = flipAnalysis(rows, weights);
  const sname = (s: { short: string; short_ar?: string }) => (lang === "ar" && s.short_ar ? s.short_ar : s.short);
  const short = (id: string) => {
    const s = state.suppliers.find((x) => x.id === id);
    return s ? sname(s) : id;
  };
  const ready = state.suppliers.every((s) => state.evaluations[s.id]);
  const overrideCount = Object.values(state.overrides).reduce((a, m) => a + Object.keys(m).length, 0);

  if (!ready)
    return (
      <EmptyState title={L({ en: "Scores appear after the comparison", ar: "تظهر الدرجات بعد المقارنة" })}>
        {L({ en: "Run the comparison first — every number here is then computed in code from the evidence judgements.", ar: "شغّل المقارنة أولاً — ثم تُحسب كل الأرقام هنا برمجياً من أحكام الأدلة." })}
      </EmptyState>
    );

  return (
    <div className="flex flex-col gap-5">
      {/* combined table */}
      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="label-caps">
            {L({ en: "Combined evaluation", ar: "التقييم المجمّع" })} · {tw}/{100 - tw}
            {tw !== tender.weights.technical && <span className="ms-2 normal-case tracking-normal text-warning">{L({ en: "what-if — tender weighting is", ar: "افتراضي — ترجيح المناقصة" })} {tender.weights.technical}/{tender.weights.commercial}</span>}
          </div>
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <span>{L({ en: "Technical weight", ar: "الوزن الفني" })}</span>
            <input type="range" min={50} max={90} step={5} value={tw} onChange={(e) => setTw(Number(e.target.value))} className="w-36 accent-[var(--ai)]" />
            <span className="num w-10">{tw}%</span>
            {tw !== tender.weights.technical && (
              <Button size="icon-xs" variant="ghost" onClick={() => setTw(tender.weights.technical)}>
                <RotateCcw />
              </Button>
            )}
          </div>
        </div>
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-border-strong bg-surface">
                {[
                  L({ en: "Bidder", ar: "المورد" }),
                  L({ en: "Technical /100", ar: "فني /100" }),
                  `${L({ en: "Tech pts", ar: "نقاط فنية" })} /${tw}`,
                  L({ en: "Bid price", ar: "سعر العطاء" }),
                  L({ en: "Normalised", ar: "بعد التسوية" }),
                  `${L({ en: "Comm. pts", ar: "نقاط مالية" })} /${100 - tw}`,
                  L({ en: "Total", ar: "المجموع" }),
                  L({ en: "Rank", ar: "الترتيب" }),
                ].map((h, i) => (
                  <th key={i} className={cn("label-caps !text-[9.5px] px-3 py-2 font-medium", i === 0 ? "text-start" : "text-end")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...rows].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)).map((r) => (
                <tr key={r.supplierId} className={cn("border-b border-border last:border-0", r.rank === 1 && "bg-ai-soft/40")}>
                  <td className="px-3 py-2">
                    <div className="font-medium">{short(r.supplierId)}</div>
                    <StatusLine r={r} />
                  </td>
                  <td className={cn("num px-3 py-2 text-end", r.belowPass && "text-danger")}>{r.tech100.toFixed(2)}</td>
                  <td className="num px-3 py-2 text-end">{r.techPts.toFixed(2)}</td>
                  <td className="num px-3 py-2 text-end">{f.aed(r.price)}</td>
                  <td className={cn("num px-3 py-2 text-end", r.adjustments.length > 0 && "text-warning")} title={r.adjustments.map((a) => `${a.scope} +${a.amount.toLocaleString("en")}`).join("; ")}>
                    {f.aed(r.normPrice)}
                  </td>
                  <td className="num px-3 py-2 text-end">{r.comPts?.toFixed(2) ?? "—"}</td>
                  <td className="num px-3 py-2 text-end text-[14px] font-medium">{r.total?.toFixed(2) ?? "—"}</td>
                  <td className="num px-3 py-2 text-end">{r.rank ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
          {L({
            en: `Commercial points = lowest compliant normalised price ÷ bidder's normalised price × ${100 - tw} (Manual Art. 26). Omitted scope is priced at the highest equivalent line of the other bids for comparison only (Art. 27). Bids failing a gate or below the pass mark (${tender.passMark}) are not ranked.`,
            ar: `النقاط المالية = أدنى سعر مطابق بعد التسوية ÷ سعر المورد بعد التسوية × ${100 - tw} (المادة 26). يُسعَّر النطاق المستثنى بأعلى بند مكافئ لدى العروض الأخرى لأغراض المقارنة فقط (المادة 27). لا تُرتَّب العروض التي لم تستوفِ شرطاً أو دون حد النجاح (${tender.passMark}).`,
          })}
        </p>
      </section>

      <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-5 max-lg:grid-cols-1">
        {/* sensitivity */}
        <section>
          <div className="label-caps mb-2">{L({ en: "Sensitivity — total score by technical weight", ar: "الحساسية — المجموع حسب الوزن الفني" })}</div>
          <div className="h-56 rounded-md border border-border p-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sens} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="tw" {...axisProps} tickFormatter={(v) => `${v}/${100 - v}`} />
                <YAxis {...axisProps} domain={["auto", "auto"]} width={44} />
                <Tooltip content={<ChartTooltip format={(v) => (typeof v === "number" ? v.toFixed(2) : String(v))} />} />
                <ReferenceLine x={tender.weights.technical} stroke="var(--border-strong)" strokeDasharray="3 3" />
                {state.suppliers.map((s, i) => (
                  <Line key={s.id} type="monotone" dataKey={s.id} name={sname(s)} stroke={CHART.series[i]} strokeWidth={1.75} dot={{ r: 2 }} connectNulls={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-[11.5px] text-muted-foreground">
            {state.suppliers.map((s, i) => (
              <span key={s.id} className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-3 rounded" style={{ background: CHART.series[i] }} /> {sname(s)}
              </span>
            ))}
          </div>
          {flip && (
            <p className="mt-2 rounded-md bg-surface px-3 py-2 text-[12px] leading-relaxed">
              {L({
                en: `${short(flip.leader)} leads ${short(flip.runnerUp)} by ${flip.gap.toFixed(2)} points at ${tw}/${100 - tw}. ${flip.priceNeeded ? `${short(flip.runnerUp)} would need to price at ${f.aed(flip.priceNeeded)} or lower to overtake` : `${short(flip.runnerUp)} cannot overtake on price alone`}; ${short(flip.leader)}'s technical score would have to fall ${flip.techDropNeeded.toFixed(1)} points.`,
                ar: `يتقدم ${short(flip.leader)} على ${short(flip.runnerUp)} بفارق ${flip.gap.toFixed(2)} نقطة عند ${tw}/${100 - tw}. ${flip.priceNeeded ? `يحتاج ${short(flip.runnerUp)} إلى سعر ${f.aed(flip.priceNeeded)} أو أقل ليتقدم` : `لا يستطيع ${short(flip.runnerUp)} التقدم بالسعر وحده`}؛ ويجب أن تنخفض الدرجة الفنية لـ ${short(flip.leader)} بمقدار ${flip.techDropNeeded.toFixed(1)} نقطة.`,
              })}
            </p>
          )}
        </section>

        {/* overrides */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <span className="label-caps">{L({ en: "Technical scores — evaluator review", ar: "الدرجات الفنية — مراجعة المقيّمين" })}</span>
            <span className="text-[11px] text-muted-foreground">
              {overrideCount} {L({ en: "overrides logged", ar: "تعديلات مسجلة" })}
            </span>
          </div>
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border-strong bg-surface">
                  <th className="label-caps !text-[9.5px] px-2.5 py-2 text-start font-medium">{L({ en: "Criterion", ar: "المعيار" })}</th>
                  {state.suppliers.map((s) => (
                    <th key={s.id} className="px-1.5 py-2 text-center text-[11px] font-medium leading-tight text-muted-foreground">
                      {sname(s)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tender.criteria.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0">
                    <td className="px-2.5 py-1.5">
                      <span className="font-mono text-[10.5px] text-muted-foreground">{c.id}</span> <span className="num text-[10.5px] text-faint">{c.weight}%</span>
                      <div className="truncate text-[11.5px]" title={L(c.label)}>
                        {L(c.label)}
                      </div>
                    </td>
                    {state.suppliers.map((s) => (
                      <td key={s.id} className="px-1.5 py-1.5 text-center">
                        <ScoreCell
                          ai={state.evaluations[s.id]?.criteria.find((x) => x.id === c.id)?.score ?? 0}
                          override={state.overrides[s.id]?.[c.id]}
                          committee={tender.committee.map((m) => m.name)}
                          onSave={(score, reason, by) => onOverride(s.id, c.id, score, reason, by)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function StatusLine({ r }: { r: ScoreRow }) {
  const L = useL();
  if (!r.evaluated) return null;
  if (r.belowPass) return <StatusPill tone="danger" className="mt-1">{L({ en: "Below technical pass mark", ar: "دون حد النجاح الفني" })}</StatusPill>;
  if (r.failed.length) return <StatusPill tone="danger" className="mt-1">{L({ en: `Fails gate ${r.failed.join(", ")}`, ar: `لم يستوفِ ${r.failed.join("، ")}` })}</StatusPill>;
  if (r.conditional) return <StatusPill tone="info" className="mt-1">{L({ en: `Pending ${r.pending.join(", ")}`, ar: `معلّق ${r.pending.join("، ")}` })}</StatusPill>;
  return <StatusPill tone="success" className="mt-1">{L({ en: "Compliant", ar: "مطابق" })}</StatusPill>;
}

function ScoreCell({
  ai,
  override,
  committee,
  onSave,
}: {
  ai: number;
  override?: { score: number; reason: string; by: string };
  committee: string[];
  onSave: (score: number | null, reason: string, by: string) => Promise<void>;
}) {
  const L = useL();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(override?.score ?? ai);
  const [reason, setReason] = useState("");
  const [by, setBy] = useState(committee[0]);
  const [busy, setBusy] = useState(false);
  const eff = override?.score ?? ai;
  async function save(score: number | null) {
    setBusy(true);
    try {
      await onSave(score, reason, by);
      setOpen(false);
      setReason("");
      toast.success(score == null ? L({ en: "Override removed — logged", ar: "أُلغي التعديل — مسجل" }) : L({ en: "Override logged in the audit trail", ar: "سُجّل التعديل في سجل التدقيق" }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setV(eff);
      }}
    >
      <PopoverTrigger asChild>
        <button type="button" className={cn("group inline-flex min-w-12 items-center justify-center gap-1 rounded px-1.5 py-0.5 hover:bg-muted", override && "bg-warning-soft text-warning")}>
          <span className="num text-[13px]">{eff}</span>
          {override ? <span className="num text-[10px] text-muted-foreground line-through">{ai}</span> : <PencilLine className="size-3 text-faint opacity-0 group-hover:opacity-100" />}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3">
        <div className="label-caps mb-2">{L({ en: "Evaluator override (Art. 30)", ar: "تعديل المقيّم (المادة 30)" })}</div>
        <div className="flex items-center gap-2">
          <input type="range" min={0} max={10} step={0.5} value={v} onChange={(e) => setV(Number(e.target.value))} className="flex-1 accent-[var(--ai)]" />
          <span className="num w-8 text-end text-[15px]">{v}</span>
        </div>
        <div className="num mt-1 text-[11px] text-muted-foreground">
          {L({ en: "AI suggested", ar: "اقتراح الذكاء الاصطناعي" })}: {ai}/10
        </div>
        <Select value={by} onValueChange={setBy}>
          <SelectTrigger size="sm" className="mt-2 h-7 w-full text-[11.5px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {committee.map((m) => (
              <SelectItem key={m} value={m} className="text-[12px]">
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={L({ en: "Written justification (required)…", ar: "مبرر مكتوب (إلزامي)…" })} className="mt-2 min-h-16 text-[12px]" />
        <div className="mt-2 flex items-center justify-between gap-2">
          {override ? (
            <Button size="xs" variant="ghost" disabled={busy} onClick={() => save(null)}>
              {L({ en: "Remove override", ar: "إلغاء التعديل" })}
            </Button>
          ) : (
            <span />
          )}
          <Button size="xs" disabled={busy || reason.trim().length < 8 || v === eff} onClick={() => save(v)}>
            {L({ en: "Log override", ar: "تسجيل التعديل" })}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
