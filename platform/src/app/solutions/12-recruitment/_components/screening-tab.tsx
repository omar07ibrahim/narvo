"use client";

import { useMemo, useState } from "react";
import { CircleCheck, CircleX, Search } from "lucide-react";
import { useFormat, useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Pane } from "@/components/narvo/pane";
import { StatusPill } from "@/components/narvo/status";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MIN_DETAIL, type Requisition, type ScreenedApplication } from "../_lib/types";

export function ScreeningTab({ applications, requisition }: { applications: ScreenedApplication[]; requisition: Requisition }) {
  const L = useL();
  const f = useFormat();
  const [filter, setFilter] = useState<"all" | "pass" | "fail">("all");
  const [reason, setReason] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const byReason = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of applications) for (const r of a.reasons) m[r.id] = (m[r.id] ?? 0) + 1;
    return m;
  }, [applications]);
  const failing = applications.filter((a) => !a.pass);
  const multi = failing.filter((a) => a.reasons.length > 1).length;

  const rows = applications.filter(
    (a) =>
      (filter === "all" || (filter === "pass" ? a.pass : !a.pass)) &&
      (!reason || a.reasons.some((r) => r.id === reason)) &&
      (!q || `${a.id} ${a.candidate.name} ${a.headline} ${a.profile.degree} ${a.profile.currentEmployer}`.toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-6 gap-3 max-xl:grid-cols-3 max-md:grid-cols-2">
        {requisition.minimums.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => {
              setReason(reason === m.id ? null : m.id);
              setFilter("fail");
            }}
            className={cn(
              "rounded-lg border bg-card p-3 text-start transition-colors hover:border-border-strong",
              reason === m.id ? "border-ai/50 bg-ai-soft/40" : "border-border",
            )}
          >
            <div className="label-caps truncate">{m.id} · {L(MIN_DETAIL[m.id as keyof typeof MIN_DETAIL] ?? { en: m.label, ar: m.label })}</div>
            <div className="num mt-1.5 text-[22px] font-light leading-none">{byReason[m.id] ?? 0}</div>
            <div className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{L({ en: m.label, ar: m.labelAr ?? m.label })}</div>
          </button>
        ))}
        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="label-caps">{L({ en: "Multiple gaps", ar: "أكثر من نقص" })}</div>
          <div className="num mt-1.5 text-[22px] font-light leading-none">{multi}</div>
          <div className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
            {L({ en: `of ${failing.length} screened out fail two or more`, ar: `من ${failing.length} مستبعداً لا يستوفون شرطين أو أكثر` })}
          </div>
        </div>
      </div>

      <Pane
        title={L({ en: "All applications", ar: "جميع الطلبات" })}
        subtitle={L({
          en: `${applications.length} received · ${applications.length - failing.length} meet minimums · ${failing.length} screened out by rules (no AI) — reasons shown`,
          ar: `${applications.length} طلباً · ${applications.length - failing.length} مستوفٍ للحد الأدنى · ${failing.length} مستبعد بالقواعد (دون ذكاء اصطناعي) — مع الأسباب`,
        })}
        flush
        actions={
          <div className="flex items-center gap-1.5">
            <div className="relative">
              <Search className="absolute start-2 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L({ en: "Search", ar: "بحث" })} className="h-7 w-40 ps-7 text-[12px]" />
            </div>
            <ToggleGroup type="single" size="sm" variant="outline" value={filter} onValueChange={(v) => { if (v) { setFilter(v as typeof filter); if (v !== "fail") setReason(null); } }}>
              <ToggleGroupItem value="all" className="px-2.5 text-[12px]">{L({ en: "All", ar: "الكل" })}</ToggleGroupItem>
              <ToggleGroupItem value="pass" className="px-2.5 text-[12px]">{L({ en: "Meet minimums", ar: "مستوفون" })}</ToggleGroupItem>
              <ToggleGroupItem value="fail" className="px-2.5 text-[12px]">{L({ en: "Screened out", ar: "مستبعدون" })}</ToggleGroupItem>
            </ToggleGroup>
          </div>
        }
      >
        <div className="scrollbar-thin max-h-[620px] overflow-auto">
          <table className="w-full text-[12.5px]">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border">
                {[
                  L({ en: "Application", ar: "الطلب" }),
                  L({ en: "Applicant", ar: "المتقدم" }),
                  L({ en: "Degree", ar: "المؤهل" }),
                  L({ en: "Exp.", ar: "الخبرة" }),
                  L({ en: "Permit review", ar: "مراجعة الرخص" }),
                  L({ en: "Registration", ar: "التسجيل" }),
                  L({ en: "Result", ar: "النتيجة" }),
                ].map((h) => (
                  <th key={h} className="label-caps !text-[9.5px] px-3 py-2 text-start font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2 align-top">
                    <div className="font-mono text-[11px]">{a.id}</div>
                    <div className="num text-[10.5px] text-faint">{f.date(a.submittedAt, { day: "numeric", month: "short" })} · {a.source}</div>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="font-medium">{a.candidate.name}</div>
                    <div className="line-clamp-1 max-w-[260px] text-[11.5px] text-muted-foreground">{a.headline}</div>
                  </td>
                  <td className="max-w-[220px] px-3 py-2 align-top">
                    <div className="line-clamp-1">{a.profile.degree}</div>
                    <div className="line-clamp-1 text-[11px] text-muted-foreground">{a.profile.university}</div>
                  </td>
                  <td className="num px-3 py-2 align-top">{a.profile.yearsExperience}</td>
                  <td className="num px-3 py-2 align-top">{a.profile.yearsPermitReview}</td>
                  <td className="max-w-[180px] px-3 py-2 align-top">
                    <span className={cn("line-clamp-1 text-[11.5px]", !a.profile.registration && "text-faint")}>{a.profile.registration ?? "—"}</span>
                  </td>
                  <td className="px-3 py-2 align-top">
                    {a.pass ? (
                      <StatusPill tone="success">
                        <CircleCheck className="size-3" />
                        {L({ en: "Meets minimums", ar: "مستوفٍ" })}
                      </StatusPill>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {a.reasons.map((r) => (
                          <Tooltip key={r.id}>
                            <TooltipTrigger asChild>
                              <span>
                                <StatusPill tone="danger" dot={false}>
                                  <CircleX className="size-3" />
                                  {r.id}
                                </StatusPill>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs text-[11.5px]">{r.detail}</TooltipContent>
                          </Tooltip>
                        ))}
                        <span className="w-full text-[11px] leading-snug text-muted-foreground">{a.reasons[0].detail}</span>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Pane>
    </div>
  );
}
