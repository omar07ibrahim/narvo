"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronDown, Scale, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFormat, useL } from "@/lib/i18n";
import type { NarvoRun } from "@/hooks/use-narvo-run";
import type { Citation } from "@/lib/ai/events";
import { Markdown } from "@/components/narvo/markdown";
import { RunButton } from "@/components/narvo/run-button";
import { EmptyState, ThinkingLines } from "@/components/narvo/empty";
import { CHART, ChartTooltip, axisProps } from "@/components/narvo/chart";
import { Block, ErrorBox, normCites, SeverityPill, SourceChips, useMoney } from "./bits";
import type { ConflictReport } from "../_lib/calc";
import type { CachedResult, ConflictExplanation } from "../_lib/types";

function DocCard({ label, title, sub, total, tone }: { label: string; title: string; sub: string; total: number | null; tone?: "danger" | "neutral" }) {
  const m = useMoney();
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card p-3">
      <div className="label-caps !text-[9.5px]">{label}</div>
      <div className="mt-1 truncate font-mono text-[12px]" title={title}>
        {title}
      </div>
      <div className={cn("mt-0.5 truncate text-[11px]", tone === "danger" ? "text-danger" : "text-muted-foreground")}>{sub}</div>
      <div className="num mt-2 text-[17px] font-light tracking-tight">{total != null ? m.aed(total) : "—"}</div>
    </div>
  );
}

export function ConflictsTab({
  report,
  run,
  cached,
  onRun,
  onCite,
}: {
  report: ConflictReport;
  run: NarvoRun;
  cached?: CachedResult;
  onRun: () => void;
  onCite: (n: number) => void;
}) {
  const L = useL();
  const f = useFormat();
  const m = useMoney();
  const [open, setOpen] = useState<string | null>(null);
  const live = run.status !== "idle";
  const explanation = (live ? run.data.explanation : cached?.data) as ConflictExplanation | null | undefined;
  const citations = (live ? run.data.citations : cached?.citations) as Citation[] | undefined;
  const byId = useMemo(() => new Map((explanation?.perConflict ?? []).map((p) => [p.id, p] as const)), [explanation]);

  if (!report.available)
    return (
      <EmptyState icon={<Scale className="size-4" />} title={L({ en: "Nothing to compare yet", ar: "لا يوجد ما يُقارن بعد" })}>
        {L(report.reason ?? { en: "", ar: "" })}
      </EmptyState>
    );

  const { quote, doc, contract, totals, credit } = report;
  const priceConflicts = report.conflicts.filter((c) => c.dimension === "price");
  const termConflicts = report.conflicts.filter((c) => c.dimension !== "price");
  const chartData = credit
    ? [
        { name: L({ en: "Today", ar: "اليوم" }), v: credit.exposure },
        ...credit.scenarios.map((s) => ({ name: L({ en: `Peak · ${s.termsDays} d`, ar: `الذروة · ${s.termsDays} يوماً` }), v: s.projected })),
      ]
    : [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3 max-xl:grid-cols-1">
        <DocCard
          label={L({ en: "Our quotation", ar: "عرضنا" })}
          title={quote?.id ?? "—"}
          sub={quote ? `${f.date(quote.issuedAt, { day: "numeric", month: "short" })} → ${f.date(quote.validUntil, { day: "numeric", month: "short" })} · ${quote.status}` : L({ en: "No quotation", ar: "لا يوجد عرض" })}
          total={totals.quote}
          tone={quote?.status === "Expired" ? "danger" : "neutral"}
        />
        <DocCard
          label={L({ en: "Customer document", ar: "مستند المتعامل" })}
          title={doc?.ref ?? "—"}
          sub={doc ? `${doc.type} · ${f.date(doc.issuedAt, { day: "numeric", month: "short" })}` : L({ en: "None received", ar: "لم يُستلم" })}
          total={totals.doc}
        />
        <DocCard
          label={L({ en: "Frame agreement (Q4 rates)", ar: "اتفاقية الإطار (أسعار الربع الرابع)" })}
          title={contract?.id ?? L({ en: "No frame agreement", ar: "لا توجد اتفاقية" })}
          sub={contract ? `${contract.paymentTermsDays} d · ${f.date(contract.validFrom, { month: "short", year: "numeric" })} – ${f.date(contract.validTo, { month: "short", year: "numeric" })}` : L({ en: "List prices apply", ar: "تُطبّق أسعار القائمة" })}
          total={totals.contract}
        />
      </div>

      <Block
        label={L({ en: "Line-by-line price comparison", ar: "مقارنة الأسعار بنداً ببند" })}
        actions={
          totals.docVsContract != null ? (
            <span className={cn("num text-[12px]", totals.docVsContract < 0 ? "text-danger" : "text-muted-foreground")}>
              {L({ en: "Customer vs frame", ar: "المتعامل مقابل الاتفاقية" })} {totals.docVsContract < 0 ? "−" : "+"}
              {m.aed(Math.abs(totals.docVsContract))}
            </span>
          ) : null
        }
      >
        <div className="scrollbar-thin -mx-3.5 -my-3.5 overflow-x-auto">
          <table className="w-full min-w-[500px] table-fixed text-[12px]">
            <colgroup>
              <col className="w-[30%]" />
              <col span={6} />
            </colgroup>
            <thead>
              <tr className="border-b border-border bg-muted/50">
                {[
                  L({ en: "Item", ar: "البند" }),
                  L({ en: "Qty", ar: "الكمية" }),
                  L({ en: "Quote", ar: "العرض" }),
                  L({ en: "Customer", ar: "المتعامل" }),
                  L({ en: "Frame", ar: "الاتفاقية" }),
                  L({ en: "Δ vs frame", ar: "الفرق" }),
                  L({ en: "Impact", ar: "الأثر" }),
                ].map((h, i) => (
                  <th key={i} className={cn("label-caps !text-[9.5px] px-2 py-1.5 font-medium", i === 0 ? "text-start" : "text-end")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.lines.map((l) => (
                <tr key={l.sku} className="border-b border-border last:border-0">
                  <td className="min-w-0 px-2 py-1.5">
                    <div className="truncate font-mono text-[11.5px]">{l.sku}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{L({ en: l.name, ar: l.nameAr })}</div>
                  </td>
                  <td className="num px-2 py-1.5 text-end">
                    {m.n(l.qty)} <span className="text-[11px] text-muted-foreground">{l.unit}</span>
                  </td>
                  <td className={cn("num px-2 py-1.5 text-end", (l.quoteVsContract ?? 0) > 0 && "bg-warning-soft/60 text-warning")}>{l.quotePrice != null ? m.unit(l.quotePrice) : "—"}</td>
                  <td className={cn("num px-2 py-1.5 text-end", (l.docVsContract ?? 0) < 0 && "bg-danger-soft/60 text-danger")}>{l.docPrice != null ? m.unit(l.docPrice) : "—"}</td>
                  <td className="num px-2 py-1.5 text-end font-medium">{l.contractPrice != null ? m.unit(l.contractPrice) : "—"}</td>
                  <td className={cn("num px-2 py-1.5 text-end", (l.docVsContract ?? 0) < 0 && "text-danger")}>
                    {l.docVsContract != null ? `${l.docVsContract > 0 ? "+" : ""}${m.unit(l.docVsContract)}` : "—"}

                  </td>
                  <td className={cn("num px-2 py-1.5 text-end", l.impactAed < 0 && "text-danger")}>{l.impactAed ? m.n(l.impactAed) : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border-strong bg-muted/40 text-[12px]">
                <td className="px-2 py-1.5 font-medium">{L({ en: "Total excl. VAT", ar: "الإجمالي دون الضريبة" })}</td>
                <td />
                <td className="num px-2 py-1.5 text-end">{totals.quote != null ? m.n(totals.quote) : "—"}</td>
                <td className="num px-2 py-1.5 text-end">{totals.doc != null ? m.n(totals.doc) : "—"}</td>
                <td className="num px-2 py-1.5 text-end font-medium">{totals.contract != null ? m.n(totals.contract) : "—"}</td>
                <td />
                <td className={cn("num px-2 py-1.5 text-end font-medium", (totals.docVsContract ?? 0) < 0 && "text-danger")}>{totals.docVsContract != null ? m.n(totals.docVsContract) : "—"}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Block>

      <Block
        label={L({ en: `Conflicts detected · ${report.conflicts.length}`, ar: `التعارضات المكتشفة · ${report.conflicts.length}` })}
        actions={
          <RunButton running={run.running} onRun={onRun} onStop={run.abort} size="sm" icon={<Sparkles className="size-3.5" />} variant={explanation ? "outline" : "default"}>
            {explanation ? L({ en: "Re-explain", ar: "إعادة الشرح" }) : L({ en: "Explain & recommend", ar: "اشرح واقترح الحل" })}
          </RunButton>
        }
      >
        {report.conflicts.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground">{L({ en: "Quote, customer document and frame agreement are consistent.", ar: "العرض ومستند المتعامل والاتفاقية متسقة." })}</p>
        ) : (
          <ul className="-mx-3.5 -my-3.5 divide-y divide-border">
            {[...termConflicts, ...priceConflicts].map((c) => {
              const ex = byId.get(c.id);
              const isOpen = open === c.id;
              return (
                <li key={c.id}>
                  <button type="button" onClick={() => setOpen(isOpen ? null : c.id)} className="flex w-full items-start gap-3 px-3.5 py-2.5 text-start hover:bg-muted/40">
                    <span className="mt-0.5 w-[66px] shrink-0">
                      <SeverityPill severity={c.severity} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-[12.5px] font-medium">{L(c.title)}</span>
                        {c.impactAed ? <span className="num text-[11.5px] text-danger">{m.aed(c.impactAed)}</span> : null}
                      </span>
                      <span className="mt-0.5 grid grid-cols-3 gap-2 text-[11.5px] max-md:grid-cols-1">
                        <span className="truncate text-muted-foreground" dir="auto">
                          <span className="text-faint">{L({ en: "Quote", ar: "العرض" })} </span>
                          {c.quote ?? "—"}
                        </span>
                        <span className="truncate text-muted-foreground" dir="auto">
                          <span className="text-faint">{L({ en: "Customer", ar: "المتعامل" })} </span>
                          <span className="text-foreground">{c.customer ?? "—"}</span>
                        </span>
                        <span className="truncate text-muted-foreground" dir="auto">
                          <span className="text-faint">{L(c.referenceLabel)} </span>
                          {c.reference ?? "—"}
                        </span>
                      </span>
                      {ex && !isOpen && (
                        <span className="mt-1 line-clamp-1 text-[11.5px] text-ai" dir="auto">
                          → {ex.recommendation}
                        </span>
                      )}
                    </span>
                    <ChevronDown className={cn("mt-1 size-3.5 shrink-0 text-faint transition-transform", isOpen && "rotate-180")} />
                  </button>
                  {isOpen && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2 px-3.5 pb-3 ps-[94px] text-[12px] leading-relaxed">
                      <p className="text-muted-foreground" dir="auto">
                        {L(c.detail)}
                      </p>
                      {ex && (
                        <div className="rounded-md border border-ai/20 bg-ai-soft/50 p-2.5">
                          <Markdown citations={citations} onCite={onCite} className="text-[12.5px]">
                            {normCites(ex.explanation)}
                          </Markdown>
                          <p className="mt-1.5 text-[12.5px] font-medium" dir="auto">
                            → {ex.recommendation}
                          </p>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                        <span>
                          {L({ en: "Rule", ar: "القاعدة" })}: <span className="text-foreground">{c.rule}</span>
                        </span>
                        <span>
                          {L({ en: "Approver", ar: "المعتمِد" })}: <span className="text-foreground">{c.approver ?? L({ en: "not negotiable", ar: "غير قابل للتفاوض" })}</span>
                        </span>
                      </div>
                    </motion.div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Block>

      {credit && (
        <Block label={L({ en: "Credit exposure if awarded", ar: "التعرض الائتماني عند الترسية" })}>
          <div className="grid grid-cols-[minmax(0,1fr)_220px] gap-4 max-lg:grid-cols-1">
            <div className="h-[150px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
                  <XAxis type="number" {...axisProps} tickFormatter={(v) => `${(Number(v) / 1_000_000).toFixed(1)}M`} domain={[0, (dataMax: number) => Math.max(dataMax, credit.limit) * 1.08]} />
                  <YAxis type="category" dataKey="name" {...axisProps} width={96} />
                  <Tooltip cursor={{ fill: "var(--muted)" }} content={<ChartTooltip format={(v) => m.aed(Number(v))} />} />
                  <ReferenceLine x={credit.limit} stroke={CHART.ink} strokeDasharray="3 3" label={{ value: L({ en: "limit", ar: "الحد" }), position: "top", fill: CHART.muted, fontSize: 10 }} />
                  <Bar dataKey="v" name={L({ en: "Exposure", ar: "التعرض" })} barSize={12} radius={[0, 3, 3, 0]}>
                    {chartData.map((d, i) => (
                      <Cell key={i} fill={d.v > credit.limit ? CHART.danger : CHART.ink} fillOpacity={i === 0 ? 0.9 : 0.55} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1.5 text-[12px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{L({ en: "Limit", ar: "الحد" })}</span>
                <span className="num">{m.aed(credit.limit)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{L({ en: "Exposure now", ar: "التعرض الآن" })}</span>
                <span className={cn("num", credit.exposure > credit.limit && "text-danger")}>{m.aed(credit.exposure)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{L({ en: "Award incl. VAT", ar: "الصفقة شاملة الضريبة" })}</span>
                <span className="num">{m.aed(credit.awardInclVat)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{L({ en: "Monthly billing", ar: "الفوترة الشهرية" })}</span>
                <span className="num">
                  {m.aed(credit.monthlyBilling)} × {credit.months}
                </span>
              </div>
              {credit.requiresLimitReview && (
                <p className="border-t border-border pt-1.5 text-[11.5px] text-warning">
                  {L({ en: `Award = ${credit.awardPctOfLimit}% of limit → limit review before accepting a PO.`, ar: `الصفقة = ${credit.awardPctOfLimit}% من الحد ← مراجعة الحد قبل قبول أمر الشراء.` })}
                </p>
              )}
            </div>
          </div>
        </Block>
      )}

      {(run.running || explanation || run.status === "error") && (
        <Block label={L({ en: "Recommended resolution", ar: "الحل المقترح" })}>
          {run.status === "error" && <ErrorBox message={run.error} onRetry={onRun} />}
          {run.running && !explanation && <ThinkingLines lines={6} />}
          {explanation && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3.5">
              <p className="border-s-2 border-ai ps-3 text-[15px] font-light leading-snug" dir="auto">
                {explanation.headline}
              </p>
              <Markdown citations={citations} onCite={onCite}>
                {normCites(explanation.resolution.summary)}
              </Markdown>
              {explanation.resolution.proposedTerms.length > 0 && (
                <div className="overflow-hidden rounded-md border border-border">
                  <table className="w-full text-[12.5px]">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="label-caps !text-[9.5px] px-3 py-2 text-start font-medium">{L({ en: "Term", ar: "البند" })}</th>
                        <th className="label-caps !text-[9.5px] px-3 py-2 text-start font-medium">{L({ en: "Proposal", ar: "المقترح" })}</th>
                        <th className="label-caps !text-[9.5px] px-3 py-2 text-start font-medium">{L({ en: "Why", ar: "السبب" })}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {explanation.resolution.proposedTerms.map((t, i) => (
                        <tr key={i} className="border-b border-border align-top last:border-0">
                          <td className="px-3 py-2 font-medium" dir="auto">
                            {t.term}
                          </td>
                          <td className="px-3 py-2" dir="auto">
                            {t.proposal}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground" dir="auto">
                            {t.rationale}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 max-lg:grid-cols-1">
                <div className="rounded-md border border-border p-3">
                  <div className="label-caps mb-1.5 !text-[9.5px]">{L({ en: "Room to negotiate", ar: "هامش التفاوض" })}</div>
                  <p className="text-[12.5px] leading-relaxed" dir="auto">
                    {explanation.resolution.negotiationRoom}
                  </p>
                </div>
                <div className="rounded-md border border-border p-3">
                  <div className="label-caps mb-1.5 !text-[9.5px]">{L({ en: "Risks if unresolved", ar: "المخاطر إن لم تُحل" })}</div>
                  <ul className="space-y-1 text-[12.5px]">
                    {explanation.resolution.risksIfUnresolved.map((r, i) => (
                      <li key={i} className="flex gap-1.5" dir="auto">
                        <span className="mt-1.5 size-1 shrink-0 rounded-full bg-danger" />
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              {explanation.additionalFindings.length > 0 && (
                <div>
                  <div className="label-caps mb-1.5 !text-[9.5px]">{L({ en: "Also found in the correspondence", ar: "وُجد أيضاً في المراسلات" })}</div>
                  <ul className="space-y-1.5">
                    {explanation.additionalFindings.map((a, i) => (
                      <li key={i} className="flex items-start gap-2 text-[12.5px]" dir="auto">
                        <span className="mt-1.5 size-1 shrink-0 rounded-full bg-ai" />
                        <span>
                          {a.finding} <SourceChips ids={a.sources} onClick={onCite} />
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </motion.div>
          )}
        </Block>
      )}

    </div>
  );
}
