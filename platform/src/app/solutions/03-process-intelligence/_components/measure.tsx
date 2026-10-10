"use client";

import { useMemo } from "react";
import { FlaskConical, GitCommitHorizontal } from "lucide-react";
import { SectionLabel } from "@/components/narvo/pane";
import { StatusPill } from "@/components/narvo/status";
import { Markdown } from "@/components/narvo/markdown";
import { useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { applyFilters, cohortRead, fmt0, fmt1, type PLog } from "../_lib/mining";
import { INTERVENTION_LABELS } from "../_lib/labels";
import type { Interventions } from "../_lib/mining";

export interface ChangeRow {
  id: string;
  title: string;
  interventions: string[];
  status: string;
  approvedBy?: string;
  approvedAt?: string;
  memo?: string;
  measurement?: string;
  expected?: Record<string, number | null>;
}

const DATA_END = Date.parse("2026-10-09T23:59:00+04:00") / 60000;

export function Measure({ log, changes }: { log: PLog; changes: ChangeRow[] }) {
  const L = useL();
  const pilot = useMemo(() => cohortRead(log, applyFilters(log, { cohort: "Pilot (Oct 2026)" }), DATA_END), [log]);
  const base = useMemo(() => cohortRead(log, applyFilters(log, { cohort: "Q3 2026" }), DATA_END), [log]);
  const rows: Array<{ k: string; label: { en: string; ar: string }; b: string; p: string; better: boolean | null; note?: { en: string; ar: string } }> = [
    {
      k: "ret",
      label: { en: "Returned to applicant", ar: "الطلبات المعادة للمتعامل" },
      b: `${fmt1(base.returnedPct)}%`,
      p: `${fmt1(pilot.returnedPct)}%`,
      better: pilot.returnedPct != null && base.returnedPct != null ? pilot.returnedPct < base.returnedPct : null,
    },
    {
      k: "noc",
      label: { en: "Returned for a missing or expired NOC", ar: "معادة بسبب شهادة غير مرفقة أو منتهية" },
      b: `${fmt1(base.nocReturnPct)}%`,
      p: `${fmt1(pilot.nocReturnPct)}%`,
      better: pilot.nocReturnPct != null && base.nocReturnPct != null ? pilot.nocReturnPct < base.nocReturnPct : null,
    },
    {
      k: "fp",
      label: { en: "Days to an accepted file (median)", ar: "أيام حتى قبول الملف (الوسيط)" },
      b: fmt1(base.firstPassDays),
      p: fmt1(pilot.firstPassDays),
      better: pilot.firstPassDays != null && base.firstPassDays != null ? pilot.firstPassDays < base.firstPassDays : null,
    },
    {
      k: "noct",
      label: { en: "NOC turnaround (mean days)", ar: "مدة إصدار الشهادة (متوسط الأيام)" },
      b: fmt1(base.nocWaitDays),
      p: fmt1(pilot.nocWaitDays),
      better: null,
      note: { en: `provisional — only ${pilot.nocWaitN} NOCs received`, ar: `مؤقت — ${pilot.nocWaitN} شهادات فقط` },
    },
    {
      k: "touch",
      label: { en: "Officer touches per application (so far)", ar: "مرات المعالجة لكل طلب (حتى الآن)" },
      b: fmt1(base.touchesPerCase, 2),
      p: fmt1(pilot.touchesPerCase, 2),
      better: null,
      note: { en: "pilot cases are still in progress", ar: "طلبات التجربة ما زالت قيد المعالجة" },
    },
    {
      k: "cyc",
      label: { en: "Cycle time (median, issued)", ar: "زمن الدورة (الوسيط، الصادرة)" },
      b: `${fmt1(base.medianCycle)} d`,
      p: pilot.completed >= 20 ? `${fmt1(pilot.medianCycle)} d` : "—",
      better: null,
      note: { en: `too early: ${pilot.completed} of ${pilot.cases} pilot permits issued`, ar: `مبكر جداً: صدرت ${pilot.completed} من ${pilot.cases} رخصة` },
    },
  ];
  return (
    <div className="space-y-6">
      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <SectionLabel className="mb-1">{L({ en: "Measure the change — intake pilot vs Q3 baseline", ar: "قياس التغيير — تجربة الاستلام مقابل خط أساس الربع الثالث" })}</SectionLabel>
            <p className="text-[12px] text-muted-foreground">
              {L({
                en: `CHG-2026-014 · applications submitted 1–9 Oct 2026 (n = ${pilot.cases}) compared with Q3 2026 submissions (n = ${fmt0(base.cases)}). Computed from the event log.`,
                ar: `CHG-2026-014 · الطلبات المقدمة 1–9 أكتوبر 2026 (العدد ${pilot.cases}) مقارنة بطلبات الربع الثالث 2026 (العدد ${fmt0(base.cases)}). محسوبة من سجل الأحداث.`,
              })}
            </p>
          </div>
          <StatusPill tone="ai">
            <FlaskConical className="size-3" />
            {L({ en: "Early read", ar: "قراءة أولية" })}
          </StatusPill>
        </div>
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="label-caps !text-[9.5px] px-3 py-2 text-start font-medium">{L({ en: "Measure", ar: "المقياس" })}</th>
                <th className="label-caps !text-[9.5px] w-32 px-3 py-2 text-end font-medium">{L({ en: "Baseline Q3", ar: "خط الأساس" })}</th>
                <th className="label-caps !text-[9.5px] w-32 px-3 py-2 text-end font-medium">{L({ en: "Pilot", ar: "التجربة" })}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.k}>
                  <td className="px-3 py-2.5">
                    <div>{L(r.label)}</div>
                    {r.note && <div className="mt-0.5 text-[11px] text-faint">{L(r.note)}</div>}
                  </td>
                  <td className="num px-3 py-2.5 text-end text-muted-foreground" dir="ltr">
                    {r.b}
                  </td>
                  <td className={cn("num px-3 py-2.5 text-end font-medium", r.better === true && "text-ai", r.better === false && "text-danger")} dir="ltr">
                    {r.p}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <SectionLabel>{L({ en: "Change log", ar: "سجل التغييرات" })}</SectionLabel>
        <ol className="relative space-y-4 before:absolute before:start-[9px] before:top-2 before:bottom-2 before:w-px before:bg-border">
          {changes.map((c) => (
            <li key={c.id} className="relative ps-7">
              <span className="absolute start-0 top-0.5 flex size-[19px] items-center justify-center rounded-full border border-border bg-card">
                <GitCommitHorizontal className={cn("size-3", c.status === "approved" ? "text-ai" : "text-muted-foreground")} />
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] text-muted-foreground">{c.id}</span>
                <StatusPill tone={c.status === "approved" ? "ai" : c.status === "pilot" ? "info" : "neutral"}>
                  {c.status === "approved" ? L({ en: "Approved", ar: "معتمد" }) : c.status === "pilot" ? L({ en: "Pilot running", ar: "تجربة جارية" }) : L({ en: "Standard", ar: "إجراء معتمد" })}
                </StatusPill>
                {c.approvedAt && (
                  <span className="text-[11px] text-faint">
                    {c.approvedBy} · {c.approvedAt}
                  </span>
                )}
              </div>
              <div className="mt-1 text-[13px] leading-snug font-medium" dir="auto">
                {c.title}
              </div>
              {c.interventions.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {c.interventions.map((k) => (
                    <span key={k} className="rounded border border-border bg-surface px-1.5 py-0.5 text-[10.5px] text-muted-foreground">
                      {L(INTERVENTION_LABELS[k as keyof Interventions] ?? { en: k, ar: k })}
                    </span>
                  ))}
                </div>
              )}
              {c.expected && Object.keys(c.expected).length > 0 && (
                <p className="mt-1.5 text-[11.5px] text-muted-foreground" dir="ltr">
                  median {fmt1(c.expected.medianBefore)} → {fmt1(c.expected.medianAfter)} d · rework {fmt1(c.expected.reworkBefore)}% → {fmt1(c.expected.reworkAfter)}% (simulated)
                </p>
              )}
              {c.measurement && <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">{c.measurement}</p>}
              {c.memo && (
                <details className="mt-1.5">
                  <summary className="cursor-pointer text-[11.5px] text-muted-foreground">{L({ en: "Approved memo", ar: "المذكرة المعتمدة" })}</summary>
                  <div className="mt-2 rounded-md border border-border bg-surface p-3">
                    <Markdown className="text-[12px]">{c.memo.replace(/\s*\[\d+\]/g, "")}</Markdown>
                  </div>
                </details>
              )}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
