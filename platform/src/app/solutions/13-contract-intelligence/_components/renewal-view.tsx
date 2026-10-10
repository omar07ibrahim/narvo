"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FileSignature } from "lucide-react";
import { Markdown } from "@/components/narvo/markdown";
import { RunButton } from "@/components/narvo/run-button";
import { StatusPill } from "@/components/narvo/status";
import { ApprovalCard } from "@/components/narvo/approval-card";
import { ThinkingLines } from "@/components/narvo/empty";
import { CHART, axisProps, gridProps, ChartTooltip } from "@/components/narvo/chart";
import { KeyValue } from "@/components/narvo/pane";
import type { NarvoRun } from "@/hooks/use-narvo-run";
import type { Citation } from "@/lib/ai/events";
import { useFormat, useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { obligationView, serviceCredits } from "../_lib/dates";
import type { ContractState, KpiFile, RenewalBrief } from "../_lib/types";

const REC = {
  renew_with_conditions: { en: "Renew 12 months with conditions", ar: "التجديد 12 شهراً بشروط", tone: "warning" as const },
  short_extension: { en: "Short extension", ar: "تمديد قصير", tone: "info" as const },
  not_renew: { en: "Do not renew", ar: "عدم التجديد", tone: "danger" as const },
};

export function RenewalView({ state, kpi, run, onRun, onDecided }: { state: ContractState; kpi: KpiFile; run: NarvoRun; onRun: () => void; onDecided: () => void }) {
  const L = useL();
  const f = useFormat();
  const c = state.contracts.find((x) => x.id === "MNDA-CON-2023-019")!;
  const ob = state.obligations.find((o) => o.id === "OBL-019-01");
  const v = ob ? obligationView(ob, state.contracts) : null;
  const sc = serviceCredits(kpi);
  const live = run.running || run.status === "done";
  const saved: RenewalBrief | null = state.renewal;
  const decision = (live ? (run.data.decision as { recommendation: keyof typeof REC; headline: string; conditions: string[] } | undefined) : undefined) ?? saved ?? undefined;
  const brief = live ? (run.text.brief ?? "") : (saved?.brief ?? "");
  const en = live ? (run.text.letter_en ?? "") : (saved?.letterEn ?? "");
  const ar = live ? (run.text.letter_ar ?? "") : (saved?.letterAr ?? "");
  const citations = (live ? (run.data.citations as Citation[] | undefined) : saved?.citations) ?? [];
  const approvalId = (live ? (run.data.renewal as RenewalBrief | undefined)?.approvalId : undefined) ?? saved?.approvalId;
  const approval = approvalId ? state.approvals.find((a) => a.id === approvalId) ?? run.approvals.find((a) => a.id === approvalId) : undefined;
  const chart = kpi.months.map((m) => ({ m: f.date(`${m.month}-01`, { month: "short" }), ppm: m.ppm, complaints: m.complaintsAlGhaf }));

  return (
    <div className="grid grid-cols-[360px_minmax(0,1fr)] gap-5 max-xl:grid-cols-1">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="label-caps">{c.ref}</div>
          <div className="mt-1 text-[14px] font-medium">{c.counterparty}</div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className={cn("num text-[34px] font-light leading-none", v?.status === "done" ? "text-success" : "text-warning")}>{v?.status === "done" ? "✓" : v?.days}</span>
            <span className="text-[12px] text-muted-foreground">
              {v?.status === "done" ? L({ en: "notice issued", ar: "صدر الإشعار" }) : L({ en: `days to notice deadline · ${v?.due ? f.date(v.due) : ""}`, ar: `يوماً حتى موعد الإشعار · ${v?.due ? f.date(v.due) : ""}` })}
            </span>
          </div>
          <div className="mt-3">
            <KeyValue k={L({ en: "Expiry", ar: "الانتهاء" })} v={f.date(c.end)} />
            <KeyValue k={L({ en: "Option", ar: "الخيار" })} v={L({ en: "1 × 12 months (cl. 3.2)", ar: "مرة واحدة × 12 شهراً (البند 3.2)" })} />
            <KeyValue k={L({ en: "Notice", ar: "الإشعار" })} v={L({ en: "≥ 60 days (cl. 3.3.1)", ar: "60 يوماً على الأقل (البند 3.3.1)" })} />
            <KeyValue k={L({ en: "Annual value", ar: "القيمة السنوية" })} v={f.aed(c.annualValue ?? 0)} />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="label-caps mb-2">{L({ en: "PPM compliance 2026 vs 95% KPI", ar: "امتثال الصيانة الوقائية 2026 مقابل 95%" })}</div>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart} margin={{ top: 6, right: 6, bottom: 0, left: -18 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="m" {...axisProps} />
                <YAxis {...axisProps} domain={[86, 100]} width={40} />
                <Tooltip content={<ChartTooltip format={(x) => `${x}%`} />} />
                <ReferenceLine y={95} stroke={CHART.warning} strokeDasharray="3 3" />
                <Line type="monotone" dataKey="ppm" name="PPM %" stroke={CHART.ai} strokeWidth={1.75} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <Stat v={`${sc.ppmAvg}%`} k={L({ en: "YTD avg", ar: "متوسط السنة" })} warn={sc.ppmAvg < 95} />
            <Stat v={`${sc.below95}/9`} k={L({ en: "months < 95%", ar: "أشهر < 95%" })} warn />
            <Stat v={sc.materialBreach ? L({ en: "Yes", ar: "نعم" }) : L({ en: "No", ar: "لا" })} k={L({ en: "material breach (6.3)", ar: "إخلال جوهري (6.3)" })} />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="label-caps mb-2">{L({ en: "Service credits — computed (cl. 6, Sch. 2)", ar: "خصومات الخدمة — محسوبة (البند 6، الجدول 2)" })}</div>
          <table className="w-full text-[12px]">
            <tbody>
              {sc.rows
                .filter((r) => r.aed > 0)
                .map((r) => (
                  <tr key={r.month} className="border-b border-border last:border-0">
                    <td className="py-1.5">{f.date(`${r.month}-01`, { month: "short", year: "numeric" })}</td>
                    <td className="py-1.5 text-[11px] text-muted-foreground">{r.parts.map((p) => `${p.kpi.split(" ")[0]} ${p.pct}%`).join(" + ")}</td>
                    <td className="num py-1.5 text-end">{f.aed(r.aed)}</td>
                  </tr>
                ))}
              <tr>
                <td className="pt-2 font-medium" colSpan={2}>
                  {L({ en: "Total 2026", ar: "إجمالي 2026" })}
                </td>
                <td className="num pt-2 text-end font-medium">{f.aed(sc.total)}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
            {L({
              en: `Al Ghaf: ${sc.complaints} comfort complaints Aug–Sep · ${kpi.alGhaf.ch02TripsSeptember} CH-02 trips in September · coil cleaning overdue since ${f.date(kpi.alGhaf.coilCleaningOverdueSince)} · energy +${kpi.alGhaf.energySeptemberVsLastYearPct}% y/y.`,
              ar: `الغاف: ${sc.complaints} شكوى راحة حرارية في أغسطس وسبتمبر · ${kpi.alGhaf.ch02TripsSeptember} توقفاً للمبرد CH-02 في سبتمبر · تنظيف الملفات متأخر منذ ${f.date(kpi.alGhaf.coilCleaningOverdueSince)} · الطاقة +${kpi.alGhaf.energySeptemberVsLastYearPct}% سنوياً.`,
            })}
          </p>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
          <div className="min-w-0">
            <div className="label-caps">{L({ en: "Renewal decision brief", ar: "مذكرة قرار التجديد" })}</div>
            {decision ? (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <StatusPill tone={REC[decision.recommendation].tone}>{L(REC[decision.recommendation])}</StatusPill>
                <span className="text-[12.5px]" dir="auto">
                  {decision.headline}
                </span>
              </div>
            ) : (
              <p className="mt-1 text-[12.5px] text-muted-foreground">
                {L({
                  en: "Combines the contract terms with computed performance evidence and the memo from Facilities & Assets; drafts the notice in English and Arabic for signature.",
                  ar: "يجمع شروط العقد مع أدلة الأداء المحسوبة ومذكرة إدارة المرافق والأصول، ويصوغ الإشعار بالعربية والإنجليزية للتوقيع.",
                })}
              </p>
            )}
          </div>
          {(!approval || approval.status === "rejected") && v?.status !== "done" && (
            <RunButton running={run.running} onRun={onRun} icon={<FileSignature />}>
              {saved ? L({ en: "Re-prepare", ar: "إعادة الإعداد" }) : L({ en: "Prepare renewal brief", ar: "إعداد مذكرة التجديد" })}
            </RunButton>
          )}
        </div>

        {approval && <ApprovalCard key={approval.id} approval={approval} onDecided={onDecided} />}

        {(brief || run.running) && (
          <div className="rounded-lg border border-border bg-card px-5 py-4">
            {brief ? (
              <Markdown citations={citations} streaming={run.running && !en}>
                {brief}
              </Markdown>
            ) : (
              <ThinkingLines lines={6} />
            )}
          </div>
        )}

        {(en || ar) && (
          <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
            <Letter title={L({ en: "Notice — English", ar: "الإشعار — بالإنجليزية" })} text={en} dir="ltr" />
            <Letter title={L({ en: "Notice — Arabic", ar: "الإشعار — بالعربية" })} text={ar} dir="rtl" />
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ v, k, warn }: { v: string; k: string; warn?: boolean }) {
  return (
    <div className="rounded-md bg-surface px-2 py-1.5">
      <div className={cn("num text-[15px] font-light", warn && "text-warning")}>{v}</div>
      <div className="text-[10.5px] text-muted-foreground">{k}</div>
    </div>
  );
}

function Letter({ title, text, dir }: { title: string; text: string; dir: "ltr" | "rtl" }) {
  return (
    <div className="rounded-lg border border-border bg-[color-mix(in_oklab,var(--card)_92%,white)] dark:bg-card">
      <div className="label-caps border-b border-border px-4 py-2">{title}</div>
      <pre className={cn("whitespace-pre-wrap px-5 py-4 font-sans text-[12.5px] leading-[1.75]", dir === "rtl" && "font-arabic")} dir={dir}>
        {text}
      </pre>
    </div>
  );
}
