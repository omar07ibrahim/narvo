"use client";

import { useMemo, useState } from "react";
import { FileSearch, FileText, ListChecks, MessageSquareText, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KeyValue } from "@/components/narvo/pane";
import { StatusPill } from "@/components/narvo/status";
import { useFormat, useL, usePrefs } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { obligationView, recurrenceLabel } from "../_lib/dates";
import type { Bi, Contract, ContractState } from "../_lib/types";
import { daysLong, daysShort, flagText, person } from "./fmt";

export const CATEGORY: Record<Contract["category"], Bi> = {
  facilities: { en: "Facilities", ar: "المرافق" },
  it: { en: "IT & digital", ar: "التقنية" },
  field: { en: "Field operations", ar: "العمليات الميدانية" },
  consultancy: { en: "Consultancy", ar: "الاستشارات" },
  customer: { en: "Customer services", ar: "خدمة المتعاملين" },
};

export const STATUS_TONE = { done: "success", overdue: "danger", due_soon: "warning", upcoming: "neutral" } as const;
export const STATUS_TXT = {
  done: { en: "Done", ar: "منجز" },
  overdue: { en: "Overdue", ar: "متأخر" },
  due_soon: { en: "Due ≤ 30 days", ar: "خلال 30 يوماً" },
  upcoming: { en: "Upcoming", ar: "قادم" },
};

export function RegisterView({
  state,
  sel,
  onSelect,
  onReview,
  onExtract,
  onAsk,
  onOpenDoc,
}: {
  state: ContractState;
  sel: string;
  onSelect: (id: string) => void;
  onReview: (id: string) => void;
  onExtract: (id: string) => void;
  onAsk: (id: string) => void;
  onOpenDoc: (id: string) => void;
}) {
  const L = useL();
  const f = useFormat();
  const { lang } = usePrefs();
  const [cat, setCat] = useState<"all" | Contract["category"]>("all");
  const views = useMemo(() => state.obligations.map((o) => obligationView(o, state.contracts)), [state]);
  const nextFor = (id: string) =>
    views
      .filter((v) => v.o.contractId === id && v.status !== "done" && v.due)
      .sort((a, b) => (a.due! < b.due! ? -1 : 1))[0];
  const rows = state.contracts.filter((c) => cat === "all" || c.category === cat);
  const c = state.contracts.find((x) => x.id === sel) ?? state.contracts[0];
  const obs = views.filter((v) => v.o.contractId === c.id).sort((a, b) => ((a.due ?? "9") < (b.due ?? "9") ? -1 : 1));

  return (
    <div className="@container">
    <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-[minmax(0,1fr)_300px] @4xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
        <div className="mb-3 inline-flex flex-wrap rounded-md border border-border bg-surface p-0.5">
          {(["all", ...Object.keys(CATEGORY)] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setCat(k as typeof cat)}
              className={cn("rounded px-2.5 py-1 text-[12px]", cat === k ? "bg-card font-medium shadow-[0_0_0_1px_var(--border)]" : "text-muted-foreground hover:text-foreground")}
            >
              {k === "all" ? L({ en: "All", ar: "الكل" }) : L(CATEGORY[k as Contract["category"]])}
              <span className="num ms-1.5 text-[11px] text-faint">{k === "all" ? state.contracts.length : state.contracts.filter((x) => x.category === k).length}</span>
            </button>
          ))}
        </div>
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full table-fixed text-[12.5px]">
            <thead>
              <tr className="border-b border-border-strong bg-surface">
                <th className="label-caps !text-[9.5px] px-3 py-2 text-start font-medium">{L({ en: "Contract", ar: "العقد" })}</th>
                <th className="label-caps !text-[9.5px] w-[112px] px-3 py-2 text-end font-medium">{L({ en: "Value / yr", ar: "القيمة السنوية" })}</th>
                <th className="label-caps !text-[9.5px] hidden w-[92px] px-3 py-2 text-start font-medium @4xl:table-cell">{L({ en: "Expiry", ar: "الانتهاء" })}</th>
                <th className="label-caps !text-[9.5px] w-[132px] px-3 py-2 text-start font-medium @4xl:w-[168px]">{L({ en: "Next deadline", ar: "الموعد التالي" })}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => {
                const n = nextFor(x.id);
                return (
                  <tr key={x.id} onClick={() => onSelect(x.id)} className={cn("cursor-pointer border-b border-border align-top last:border-0 hover:bg-muted/40", sel === x.id && "bg-ai-soft/40")}>
                    <td className="px-3 py-2.5">
                      <div className="font-mono text-[10.5px] text-muted-foreground">{x.ref}</div>
                      <div className="mt-0.5 leading-snug font-medium">{L(x.title)}</div>
                      <div className="mt-0.5 text-[11.5px] text-muted-foreground">{x.counterparty}</div>
                      {(x.status === "draft" || x.status === "extended" || x.renewalDecision || x.reviewStatus) && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {x.status === "draft" && <StatusPill tone="info">{L({ en: "Draft — vendor paper", ar: "مسودة — نموذج المورد" })}</StatusPill>}
                          {x.status === "extended" && <StatusPill tone="neutral">{L({ en: "Extended", ar: "ممدد" })}</StatusPill>}
                          {x.renewalDecision && <StatusPill tone="success">{x.renewalDecision.decision}</StatusPill>}
                          {x.reviewStatus && <StatusPill tone="ai">{L({ en: "Redlines sent", ar: "أُرسلت التعديلات" })}</StatusPill>}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-end">
                      {x.annualValue ? (
                        <div className="num">{f.aed(x.annualValue)}</div>
                      ) : (
                        <>
                          <div className="num text-muted-foreground">{f.aed(x.totalValue)}</div>
                          <div className="text-[10.5px] text-faint">{L({ en: "lump sum", ar: "مبلغ مقطوع" })}</div>
                        </>
                      )}
                      <div className="num mt-0.5 text-[11px] text-muted-foreground @4xl:hidden">
                        {L({ en: "to", ar: "حتى" })} {f.date(x.end, { day: "numeric", month: "short", year: "2-digit" })}
                      </div>
                    </td>
                    <td className="num hidden px-3 py-2.5 whitespace-nowrap @4xl:table-cell">{f.date(x.end, { day: "numeric", month: "short", year: "2-digit" })}</td>
                    <td className="px-3 py-2.5">
                      {n ? (
                        <div>
                          <span className={cn("num text-[12px] font-medium", n.status === "overdue" ? "text-danger" : n.status === "due_soon" ? "text-warning" : "")}>
                            {n.days! < 0 ? `${daysLong(-n.days!, lang)} ${L({ en: "overdue", ar: "تأخير" })}` : daysLong(n.days!, lang)}
                          </span>
                          <div className="truncate text-[11px] text-muted-foreground" title={L(n.o.title)}>
                            {L(n.o.title)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <aside className="min-w-0 rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <div className="font-mono text-[10.5px] text-muted-foreground">{c.ref}</div>
          <div className="mt-0.5 text-[14px] font-medium leading-snug">{L(c.title)}</div>
          <div className="text-[12px] text-muted-foreground">{c.counterparty}</div>
        </div>
        <div className="space-y-3 px-4 py-3">
          <div>
            <KeyValue k={L({ en: "Category", ar: "الفئة" })} v={L(CATEGORY[c.category])} />
            <KeyValue k={L({ en: "Term", ar: "المدة" })} v={<span className="num">{f.date(c.start)} – {f.date(c.end)}</span>} />
            <KeyValue k={L({ en: "Value", ar: "القيمة" })} v={<span className="num">{c.annualValue ? `${f.aed(c.annualValue)} / ${L({ en: "yr", ar: "سنة" })}` : f.aed(c.totalValue)}</span>} />
            <KeyValue
              k={L({ en: "Renewal", ar: "التجديد" })}
              v={
                c.renewal.type === "none"
                  ? L({ en: "No renewal option", ar: "لا يوجد خيار تجديد" })
                  : `${c.renewal.type === "auto" ? L({ en: "Automatic", ar: "تلقائي" }) : L({ en: "Option", ar: "خيار" })} ${c.renewal.months} ${L({ en: "mo", ar: "شهراً" })} · ${L({ en: "notice", ar: "إشعار" })} ${c.renewal.noticeDays} ${L({ en: "days", ar: "يوماً" })}`
              }
            />
            <KeyValue k={L({ en: "Contract owner", ar: "مالك العقد" })} v={<span className="text-[12px]">{person(c.owner, lang)}</span>} />
            {c.performanceSecurity && <KeyValue k={L({ en: "Performance security", ar: "ضمان حسن التنفيذ" })} v={<span className="num text-[12px]">{f.aed(c.performanceSecurity.amount)} · {f.date(c.performanceSecurity.expiry)}</span>} />}
          </div>
          {c.flags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {c.flags.map((fl) => (
                <span key={flagText(fl, "en")} className="rounded border border-border bg-surface px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  {flagText(fl, lang)}
                </span>
              ))}
            </div>
          )}
          {(c.reviewStatus || state.reviews[c.id]) && (
            <div className="rounded-md border border-ai/20 bg-ai-soft/40 px-2.5 py-2 text-[11.5px] leading-snug">
              <div className="label-caps !text-[9.5px] mb-0.5 text-ai">{L({ en: "Playbook review", ar: "مراجعة الدليل" })}</div>
              {c.reviewStatus
                ? L({ en: c.reviewStatus, ar: `اعتُمدت التعديلات (${state.reviews[c.id]?.findings.filter((x) => x.decision === "accepted").length ?? ""}) — أُرسلت إلى الطرف الآخر` })
                : `${state.reviews[c.id]!.findings.filter((x) => x.status !== "compliant").length} ${L({ en: "flags", ar: "ملاحظة" })} · ${state.reviews[c.id]!.findings.filter((x) => x.decision).length} ${L({ en: "decided", ar: "محسومة" })}`}
            </div>
          )}
          <div>
            <div className="label-caps mb-1.5">{L({ en: "Obligations", ar: "الالتزامات" })}</div>
            {obs.length ? (
              <ul className="space-y-1.5">
                {obs.map((v) => (
                  <li key={v.o.id} className="flex items-start gap-2 text-[12px]">
                    <StatusPill tone={STATUS_TONE[v.status]} className="mt-0.5 shrink-0">
                      {v.status === "done" ? "✓" : daysShort(v.days, lang)}
                    </StatusPill>
                    <div className="min-w-0">
                      <div className="leading-snug">{L(v.o.title)}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {v.due ? f.date(v.due) : "—"} · {L(recurrenceLabel(v.o.trigger))} · {L({ en: "cl.", ar: "بند" })} {v.o.sourceClause}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12px] text-muted-foreground">{L({ en: "No obligations recorded yet.", ar: "لا توجد التزامات مسجلة بعد." })}</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 border-t border-border px-4 py-3">
          {c.file ? (
            <>
              <Button size="sm" variant="outline" onClick={() => onReview(c.id)}>
                <ScrollText /> {L({ en: "Review vs playbook", ar: "مراجعة مقابل الدليل" })}
              </Button>
              <Button size="sm" variant="outline" onClick={() => onExtract(c.id)}>
                <ListChecks /> {L({ en: "Extract obligations", ar: "استخراج الالتزامات" })}
              </Button>
              <Button size="sm" variant="outline" onClick={() => onAsk(c.id)}>
                <MessageSquareText /> {L({ en: "Ask", ar: "اسأل" })}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onOpenDoc(c.id)}>
                <FileText /> {L({ en: "Open text", ar: "فتح النص" })}
              </Button>
            </>
          ) : (
            <p className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
              <FileSearch className="size-3.5" />
              {L({ en: "Signed copy held in the records system — register data only.", ar: "النسخة الموقعة محفوظة في نظام السجلات — بيانات السجل فقط." })}
            </p>
          )}
        </div>
      </aside>
    </div>
    </div>
  );
}
