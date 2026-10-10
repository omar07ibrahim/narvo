"use client";

import { FileText, Scale, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ComparisonMatrix, type MatrixCell, type MatrixRow } from "@/components/narvo/matrix";
import { RunButton } from "@/components/narvo/run-button";
import { StatusPill } from "@/components/narvo/status";
import { EmptyState } from "@/components/narvo/empty";
import type { NarvoRun } from "@/hooks/use-narvo-run";
import { useFormat, useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { effectiveScore, gateResults, type ScoreRow } from "../_lib/scoring";
import type { PriceSchedule, ProcState, Supplier, Tender } from "../_lib/types";

export function EvaluationView({
  tender,
  state,
  prices,
  rows,
  run,
  onRun,
  onOpenDoc,
}: {
  tender: Tender;
  state: ProcState;
  prices: PriceSchedule[];
  rows: ScoreRow[];
  run: NarvoRun;
  onRun: () => void;
  onOpenDoc: (id: string) => void;
}) {
  const L = useL();
  const f = useFormat();
  const evaluated = state.suppliers.filter((s) => state.evaluations[s.id]);
  const labels = {
    met: L({ en: "Evidenced", ar: "مُثبت" }),
    partial: L({ en: "Partial", ar: "جزئي" }),
    missing: L({ en: "Missing", ar: "مفقود" }),
    clarify: L({ en: "Clarify", ar: "استيضاح" }),
    na: L({ en: "Pending", ar: "قيد التقييم" }),
  };

  const columns = state.suppliers.map((s) => {
    const r = rows.find((x) => x.supplierId === s.id)!;
    return {
      id: s.id,
      label: (
        <button type="button" onClick={() => onOpenDoc(s.id)} className="inline-flex items-center gap-1.5 text-start hover:underline">
          {s.short}
          <FileText className="size-3 text-faint" />
        </button>
      ),
      sub: (
        <span className="flex flex-col gap-0.5">
          <span className="num">{f.aed(r.price)}</span>
          {r.adjustments.length > 0 && (
            <span className="num text-warning">
              {L({ en: "normalised", ar: "بعد التسوية" })} {f.aed(r.normPrice)}
            </span>
          )}
        </span>
      ),
    };
  });

  const cellFor = (s: Supplier, fn: () => MatrixCell | undefined): MatrixCell => (state.evaluations[s.id] ? (fn() ?? { status: "na" }) : { status: "na", value: run.running ? "…" : undefined });

  const gateRows: MatrixRow[] = tender.gates.map((g) => ({
    id: g.id,
    label: `${g.id} · ${L(g.label)}`,
    group: L({ en: "Mandatory gates (pass / fail)", ar: "الشروط الإلزامية (اجتياز / إخفاق)" }),
    cells: Object.fromEntries(
      state.suppliers.map((s) => {
        const gr = gateResults(tender, s, state.evaluations[s.id])[g.id];
        if (gr.computed)
          return [s.id, { status: gr.status === "pending" ? "na" : gr.status, value: gr.value, evidence: gr.note, source: L({ en: "Computed from supplier register", ar: "محسوب من سجل الموردين" }) } as MatrixCell];
        return [
          s.id,
          cellFor(s, () => {
            const ge = state.evaluations[s.id]?.gates.find((x) => x.id === g.id);
            return ge ? { status: ge.status, value: ge.note ?? undefined, evidence: ge.evidence?.quote ?? ge.note ?? undefined, source: ge.evidence ? `§ ${ge.evidence.section}` : undefined } : undefined;
          }),
        ];
      }),
    ),
  }));

  const critRows: MatrixRow[] = tender.criteria.map((c) => ({
    id: c.id,
    label: `${c.id} · ${L(c.label)}`,
    group: L({ en: `Technical criteria — ${tender.weights.technical}%`, ar: `المعايير الفنية — ${tender.weights.technical}%` }),
    weight: c.weight,
    cells: Object.fromEntries(
      state.suppliers.map((s) => [
        s.id,
        cellFor(s, () => {
          const ce = state.evaluations[s.id]?.criteria.find((x) => x.id === c.id);
          if (!ce) return undefined;
          const eff = effectiveScore(state.evaluations[s.id], state.overrides[s.id], c.id);
          const over = state.overrides[s.id]?.[c.id];
          return {
            status: ce.status,
            score: eff ?? undefined,
            value: over ? `${L({ en: "override", ar: "تعديل" })} · AI ${ce.score}` : (ce.gap ?? ce.strength ?? undefined),
            evidence: [ce.evidence ? `“${ce.evidence.quote}”` : "", ce.gap ? `${L({ en: "Gap", ar: "الفجوة" })}: ${ce.gap}` : "", over ? `${L({ en: "Override", ar: "تعديل المقيّم" })} (${over.by}): ${over.reason}` : ""].filter(Boolean).join("\n\n"),
            source: ce.evidence ? `${ce.evidence.source === "clarification" ? "↺ " : ""}§ ${ce.evidence.section}` : undefined,
          };
        }),
      ]),
    ),
  }));

  const scopeRows: MatrixRow[] = tender.scope.map((sc) => ({
    id: sc.id,
    label: L(sc.label),
    group: L({ en: "Scope coverage", ar: "تغطية النطاق" }),
    cells: Object.fromEntries(
      state.suppliers.map((s) => [
        s.id,
        cellFor(s, () => {
          const se = state.evaluations[s.id]?.scope.find((x) => x.id === sc.id);
          if (!se) return undefined;
          const status = se.status === "included" ? "met" : se.status === "excluded" ? "missing" : "clarify";
          const val = se.status === "included" ? L({ en: "Included", ar: "مشمول" }) : se.status === "excluded" ? L({ en: "Excluded", ar: "مستثنى" }) : L({ en: "Unclear", ar: "غير واضح" });
          return { status, value: val, evidence: se.evidence?.quote, source: se.evidence ? `${se.evidence.source === "clarification" ? "↺ " : ""}§ ${se.evidence.section}` : undefined } as MatrixCell;
        }),
      ]),
    ),
  }));

  if (!evaluated.length && !run.running)
    return (
      <EmptyState
        icon={<Scale className="size-4" />}
        title={L({ en: "Three sealed bids are ready for evaluation", ar: "ثلاثة عروض جاهزة للتقييم" })}
        action={
          <RunButton running={run.running} onRun={onRun}>
            {L({ en: "Compare submissions against criteria", ar: "قارن العروض بالمعايير" })}
          </RunButton>
        }
      >
        {L({
          en: "NARVO reads each technical proposal against the eight published criteria, the mandatory gates and the full scope list — with a verbatim quote for every judgement. Certificates and ICV are checked in code against the closing date.",
          ar: "يقرأ نارفو كل عرض فني مقابل المعايير الثمانية المعلنة والشروط الإلزامية وقائمة النطاق — مع اقتباس حرفي لكل حكم. وتُفحص الشهادات والقيمة الوطنية برمجياً مقابل تاريخ الإغلاق.",
        })}
      </EmptyState>
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12.5px] text-muted-foreground">
          {L({ en: "Hover a cell to see the exact passage. ↺ marks evidence from a clarification response.", ar: "مرّر المؤشر على أي خلية لرؤية المقطع الدقيق. ↺ تعني دليلاً من رد استيضاح." })}
        </p>
        <RunButton size="sm" variant="outline" running={run.running} onRun={onRun}>
          {L({ en: "Re-run comparison", ar: "إعادة المقارنة" })}
        </RunButton>
      </div>

      <ComparisonMatrix
        columns={columns}
        rows={[...gateRows, ...critRows, ...scopeRows]}
        statusLabels={labels}
        footer={
          <>
            <td className="px-3 py-2.5 align-top">
              <div className="text-[12px] font-medium">{L({ en: "Technical score", ar: "الدرجة الفنية" })}</div>
              <div className="text-[10.5px] text-muted-foreground">
                {L({ en: `AI-suggested, after overrides · pass mark ${tender.passMark}`, ar: `مقترحة بالذكاء الاصطناعي بعد التعديلات · حد النجاح ${tender.passMark}` })}
              </div>
            </td>
            {state.suppliers.map((s) => {
              const r = rows.find((x) => x.supplierId === s.id)!;
              return (
                <td key={s.id} className="px-3 py-2.5 align-top">
                  {r.evaluated ? (
                    <>
                      <div className={cn("num text-[17px] font-light", r.belowPass && "text-danger")}>
                        {r.tech100.toFixed(1)}
                        <span className="text-[11px] text-muted-foreground"> / 100</span>
                      </div>
                      <div className="num text-[10.5px] text-muted-foreground">
                        {r.techPts.toFixed(2)} / {tender.weights.technical} {L({ en: "pts", ar: "نقطة" })}
                      </div>
                    </>
                  ) : (
                    <span className="text-faint">—</span>
                  )}
                </td>
              );
            })}
          </>
        }
      />

      <div className="grid grid-cols-3 gap-3 max-lg:grid-cols-1">
        {state.suppliers.map((s) => {
          const ev = state.evaluations[s.id];
          const r = rows.find((x) => x.supplierId === s.id)!;
          if (!ev) return <div key={s.id} className="h-40 animate-pulse rounded-lg border border-border bg-muted/40" />;
          const excl = ev.scope.filter((x) => x.status !== "included");
          return (
            <div key={s.id} className="rounded-lg border border-border bg-card p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[13px] font-medium">{s.short}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {s.submission.teamSize} {L({ en: "staff", ar: "موظفاً" })} · {L({ en: "mobilisation", ar: "التعبئة" })} {s.submission.mobilisationDays} {L({ en: "days", ar: "يوماً" })}
                  </div>
                </div>
                {!r.compliant ? (
                  <StatusPill tone="danger">{r.belowPass ? L({ en: "Below pass mark", ar: "دون حد النجاح" }) : L({ en: `Fails ${r.failed.join(", ")}`, ar: `لم يستوفِ ${r.failed.join("، ")}` })}</StatusPill>
                ) : r.conditional ? (
                  <StatusPill tone="info">{L({ en: `Pending ${r.pending.join(", ")}`, ar: `معلّق ${r.pending.join("، ")}` })}</StatusPill>
                ) : (
                  <StatusPill tone="success">{L({ en: "Compliant", ar: "مطابق" })}</StatusPill>
                )}
              </div>
              <p className="mt-2 line-clamp-4 text-[12px] leading-relaxed text-muted-foreground" dir="auto">
                {ev.summary}
              </p>
              {excl.length > 0 && (
                <div className="mt-2.5 rounded-md border border-warning/25 bg-warning-soft/50 px-2.5 py-2 text-[11.5px]">
                  <div className="flex items-center gap-1.5 font-medium text-warning">
                    <TriangleAlert className="size-3" /> {L({ en: "Scope not fully covered", ar: "النطاق غير مكتمل" })}
                  </div>
                  <ul className="mt-1 space-y-0.5 text-foreground/80">
                    {excl.map((x) => (
                      <li key={x.id} dir="auto">
                        {L(tender.scope.find((t) => t.id === x.id)!.label)} — {x.status === "excluded" ? L({ en: "excluded", ar: "مستثنى" }) : L({ en: "unclear", ar: "غير واضح" })}
                      </li>
                    ))}
                  </ul>
                  {r.adjustments.length > 0 && (
                    <div className="num mt-1 text-[11px] text-muted-foreground">
                      {L({ en: "Price normalised for comparison (Art. 27):", ar: "تسوية السعر للمقارنة (المادة 27):" })} +{f.aed(r.adjustments.reduce((a, x) => a + x.amount, 0))}
                    </div>
                  )}
                </div>
              )}
              {ev.missing.length > 0 && (
                <div className="mt-2.5">
                  <div className="label-caps !text-[9.5px] mb-1">{L({ en: "Missing details", ar: "تفاصيل ناقصة" })}</div>
                  <ul className="list-disc space-y-0.5 ps-4 text-[11.5px] leading-snug text-muted-foreground">
                    {ev.missing.slice(0, 4).map((m, i) => (
                      <li key={i} dir="auto">
                        {m}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {ev.history.length > 0 && (
                <div className="mt-2.5 rounded-md bg-ai-soft/60 px-2.5 py-2 text-[11.5px]">
                  <div className="label-caps !text-[9.5px] mb-1 text-ai">{L({ en: "Updated after clarification", ar: "حُدّث بعد الاستيضاح" })}</div>
                  {ev.history.slice(-4).map((h, i) => (
                    <div key={i} className="num text-foreground/80">
                      {h.id}: {h.from} → <span className="font-medium">{h.to}</span>
                    </div>
                  ))}
                </div>
              )}
              <Button variant="ghost" size="xs" className="mt-2 -ms-2 text-muted-foreground" onClick={() => onOpenDoc(s.id)}>
                <FileText /> {L({ en: "Open technical proposal", ar: "افتح العرض الفني" })}
              </Button>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-faint">
        {L({ en: "Prices shown from the commercial envelope; technical judgements were made without amounts.", ar: "الأسعار من المظروف المالي؛ أُجري التقييم الفني دون الاطلاع على المبالغ." })}{" "}
        {prices.length} {L({ en: "price schedules loaded.", ar: "جداول أسعار محمّلة." })}
      </p>
    </div>
  );
}
