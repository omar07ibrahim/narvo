"use client";

import { CalendarClock, CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusPill } from "@/components/narvo/status";
import { useFormat, useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { DEMO_TODAY } from "@/lib/world/orgs";
import {
  certificateChecks,
  daysBetween,
  emiratisationCheck,
  formChecks,
  pageChecks,
  turnoverCheck,
  validityEnd,
  type CheckStatus,
} from "../_lib/compliance";
import type { BidSeed, BidState, FormRecord } from "../_lib/types";

const TONE: Record<CheckStatus | "empty", "success" | "warning" | "danger" | "neutral"> = { ok: "success", warning: "warning", critical: "danger", empty: "neutral" };
const ICON = {
  ok: <CircleCheck className="size-3.5 text-success" />,
  warning: <TriangleAlert className="size-3.5 text-warning" />,
  critical: <CircleAlert className="size-3.5 text-danger" />,
};
const FORM_STATUS: Record<FormRecord["status"], { en: string; ar: string }> = {
  not_started: { en: "Not started", ar: "لم يبدأ" },
  in_progress: { en: "In progress", ar: "قيد الإعداد" },
  pending_signature: { en: "Awaiting signature", ar: "بانتظار التوقيع" },
  requested: { en: "Requested", ar: "مطلوب" },
  complete: { en: "Complete", ar: "مكتمل" },
};

export function ComplianceView({ seed, state, onFormStatus, onOpenDoc }: { seed: BidSeed; state: BidState; onFormStatus: (id: string, status: string) => void; onOpenDoc: (id: string) => void }) {
  const L = useL();
  const f = useFormat();
  const certs = certificateChecks(seed, state.certificates);
  const pages = pageChecks(seed, state.sections);
  const forms = formChecks(state.forms);
  const emi = emiratisationCheck(seed);
  const turn = turnoverCheck(seed);
  const vEnd = validityEnd(seed);
  const icv = state.certificates.find((c) => c.id === "icv");

  const dates = [
    { k: L({ en: "Today", ar: "اليوم" }), d: DEMO_TODAY },
    { k: L({ en: "Internal review", ar: "المراجعة الداخلية" }), d: seed.internalReview },
    { k: L({ en: "Closing", ar: "الإغلاق" }), d: seed.tender.closing },
    { k: L({ en: "Bid validity ends", ar: "انتهاء صلاحية العطاء" }), d: vEnd },
    { k: L({ en: "Contract start", ar: "بدء العقد" }), d: seed.tender.contractStart },
  ];
  const span = daysBetween(DEMO_TODAY, vEnd);

  return (
    <div className="flex flex-col gap-5">
      {/* timeline */}
      <section>
        <div className="label-caps mb-3 flex items-center gap-1.5">
          <CalendarClock className="size-3.5" /> {L({ en: "Key dates — all checks are computed against these", ar: "التواريخ الرئيسية — تُحسب كل الفحوص على أساسها" })}
        </div>
        <div className="relative mx-2 h-14">
          <div className="absolute inset-x-0 top-3 h-px bg-border-strong" />
          {dates.map((x) => {
            const pos = Math.min(100, Math.max(0, (daysBetween(DEMO_TODAY, x.d) / span) * 100));
            return (
              <div key={x.k} className="absolute top-0 -translate-x-1/2 rtl:translate-x-1/2" style={{ insetInlineStart: `${pos}%` }}>
                <div className={cn("mx-auto mt-[9px] size-2 rounded-full border-2 border-card", x.d === seed.tender.closing ? "bg-ai" : "bg-foreground/60")} />
                <div className="mt-1.5 whitespace-nowrap text-center text-[10.5px] leading-tight">
                  <div className="font-medium">{x.k}</div>
                  <div className="num text-muted-foreground">{f.date(x.d, { day: "numeric", month: "short" })}</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* certificates */}
      <section>
        <div className="label-caps mb-2">{L({ en: "Certificates & policies vs closing date and bid validity", ar: "الشهادات والوثائق مقابل تاريخ الإغلاق وصلاحية العطاء" })}</div>
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-border-strong bg-surface text-start">
                <th className="label-caps !text-[9.5px] px-3 py-2 text-start font-medium">{L({ en: "Document", ar: "المستند" })}</th>
                <th className="label-caps !text-[9.5px] px-3 py-2 text-start font-medium">{L({ en: "Req.", ar: "المتطلب" })}</th>
                <th className="label-caps !text-[9.5px] px-3 py-2 text-start font-medium">{L({ en: "Expiry", ar: "الانتهاء" })}</th>
                <th className="label-caps !text-[9.5px] px-3 py-2 text-end font-medium">{L({ en: "Days after closing", ar: "أيام بعد الإغلاق" })}</th>
                <th className="label-caps !text-[9.5px] px-3 py-2 text-start font-medium">{L({ en: "Check", ar: "الفحص" })}</th>
              </tr>
            </thead>
            <tbody>
              {certs.map((c) => (
                <tr key={c.cert.id} className={cn("border-b border-border last:border-0 align-top", c.status === "critical" && "bg-danger-soft/40")}>
                  <td className="px-3 py-2">
                    <button type="button" onClick={() => onOpenDoc(c.cert.docId)} className="text-start font-medium hover:underline">
                      {L({ en: c.cert.name, ar: c.cert.name_ar })}
                    </button>
                    <div className="font-mono text-[10.5px] text-muted-foreground">
                      {c.cert.number}
                      {c.cert.updatedBy && <span className="ms-1.5 text-ai">· {L({ en: "updated by", ar: "حدّثه" })} {c.cert.updatedBy}</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px]">{c.cert.requirement}</td>
                  <td className="num px-3 py-2">{f.date(c.cert.expiry)}</td>
                  <td className={cn("num px-3 py-2 text-end", c.marginDays < 0 ? "text-danger" : "text-muted-foreground")}>{c.marginDays}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-start gap-1.5">
                      <span className="mt-0.5">{ICON[c.status]}</span>
                      <span className="text-[12px] leading-snug text-muted-foreground">{L(c.note)}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-5 max-lg:grid-cols-1">
        {/* page limits */}
        <section>
          <div className="label-caps mb-2">{L({ en: "Page limits (Arial 11 · ~500 words per page)", ar: "حدود الصفحات (Arial 11 · نحو 500 كلمة للصفحة)" })}</div>
          <ul className="divide-y divide-border rounded-md border border-border">
            {pages.map((p) => {
              const s = seed.sections.find((x) => x.id === p.sectionId)!;
              return (
                <li key={p.sectionId} className="flex items-center gap-3 px-3 py-2">
                  <span className="num w-5 text-[11px] text-faint">{s.no}</span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px]">{L(s.title)}</span>
                  <span className="relative h-1 w-20 overflow-hidden rounded-full bg-muted">
                    <span
                      className={cn("absolute inset-y-0 start-0 rounded-full", p.status === "critical" ? "bg-danger" : p.status === "warning" ? "bg-warning" : "bg-foreground/50")}
                      style={{ width: `${Math.min(100, (p.pages / p.limit) * 100)}%` }}
                    />
                  </span>
                  <span className={cn("num w-16 text-end text-[11.5px]", p.status === "critical" ? "text-danger" : "text-muted-foreground")}>
                    {p.status === "empty" ? "—" : `${p.pages} / ${p.limit}`}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        {/* forms */}
        <section>
          <div className="label-caps mb-2">{L({ en: "Mandatory forms (RFP §8)", ar: "النماذج الإلزامية (البند 8)" })}</div>
          <ul className="divide-y divide-border rounded-md border border-border">
            {forms.map(({ form, status }) => (
              <li key={form.id} className="flex items-center gap-3 px-3 py-2">
                <span className="mt-px">{ICON[status]}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-medium">
                    <span className="font-mono text-[11px] text-muted-foreground">{form.id}</span> {L(form.name)}
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {form.owner} · {L(form.note)}
                  </div>
                </div>
                <Select value={form.status} onValueChange={(v) => onFormStatus(form.id, v)}>
                  <SelectTrigger size="sm" className="h-7 w-[150px] text-[11.5px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(FORM_STATUS) as FormRecord["status"][]).map((k) => (
                      <SelectItem key={k} value={k} className="text-[12px]">
                        {L(FORM_STATUS[k])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* thresholds */}
      <section>
        <div className="label-caps mb-2">{L({ en: "Thresholds", ar: "الحدود الدنيا" })}</div>
        <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
          <Threshold
            title={L({ en: "In-Country Value (M-06)", ar: "القيمة الوطنية المضافة (M-06)" })}
            value={`${icv?.score ?? "—"}%`}
            target={`≥ ${icv?.minScore ?? 25}%`}
            status={(icv?.score ?? 0) >= (icv?.minScore ?? 25) ? "ok" : "critical"}
            note={L({ en: `Certificate ${icv?.number}, valid to ${icv ? f.date(icv.expiry) : "—"}`, ar: `الشهادة ${icv?.number}، سارية حتى ${icv ? f.date(icv.expiry) : "—"}` })}
          />
          <Threshold
            title={L({ en: "Emiratisation by month 12 (E-02)", ar: "التوطين بحلول الشهر 12 (E-02)" })}
            value={`${emi.pct}%`}
            target={`≥ ${emi.targetPct}%`}
            status={emi.status}
            note={L({
              en: `${emi.plannedNationals} of ${emi.plannedTeam} planned staff are UAE nationals — ${emi.required} needed, ${emi.gap} more to recruit.`,
              ar: `${emi.plannedNationals} من ${emi.plannedTeam} موظفاً مخططاً مواطنون — المطلوب ${emi.required}، أي توظيف ${emi.gap} إضافيين.`,
            })}
          />
          <Threshold
            title={L({ en: "Annual turnover (C-02)", ar: "الإيرادات السنوية (C-02)" })}
            value={f.aed(turn.turnover2025)}
            target={`≥ ${f.aed(turn.minTurnover)}`}
            status={turn.status}
            note={L({ en: `${turn.ratio.toFixed(1)}× the minimum (audited 2025)`, ar: `${turn.ratio.toFixed(1)} ضعف الحد الأدنى (مدققة 2025)` })}
          />
        </div>
      </section>
    </div>
  );
}

function Threshold({ title, value, target, status, note }: { title: string; value: string; target: string; status: CheckStatus; note: string }) {
  const L = useL();
  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] text-muted-foreground">{title}</span>
        <StatusPill tone={TONE[status]}>{status === "ok" ? L({ en: "Meets", ar: "مستوفى" }) : status === "warning" ? L({ en: "Gap", ar: "فجوة" }) : L({ en: "Fails", ar: "غير مستوفى" })}</StatusPill>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="num text-[22px] font-light tracking-tight">{value}</span>
        <span className="num text-[11.5px] text-muted-foreground">{target}</span>
      </div>
      <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">{note}</p>
    </div>
  );
}
