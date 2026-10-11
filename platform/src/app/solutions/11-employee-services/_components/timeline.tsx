"use client";

import { Check, Clock, X } from "lucide-react";
import { useFormat, useL, usePrefs } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { NAMES_AR, durationAr, type ServiceRequest } from "../_lib/shared";

/** Submitted → Approved → In fulfilment → Completed (or Rejected), with real timestamps. */
export function RequestTimeline({ r, compact }: { r: ServiceRequest; compact?: boolean }) {
  const L = useL();
  const fmt = useFormat();
  const { lang } = usePrefs();
  const approverName = lang === "ar" ? (NAMES_AR[r.approver.name] ?? r.approver.name) : r.approver.name;
  const steps: Array<{ key: string; label: string; at?: string; who?: string; tone?: "danger" }> = [
    { key: "submitted", label: L({ en: "Submitted", ar: "قُدّم" }), at: r.submittedAt, who: r.channel === "NARVO assistant" ? L({ en: "via assistant", ar: "عبر المساعد" }) : r.channel },
  ];
  if (r.status === "rejected") {
    steps.push({ key: "rejected", label: L({ en: "Rejected", ar: "رُفض" }), at: r.rejectedAt, who: approverName, tone: "danger" });
  } else {
    steps.push({ key: "approved", label: L({ en: "Approved", ar: "اعتُمد" }), at: r.approvedAt, who: approverName });
    steps.push({ key: "in_fulfilment", label: L({ en: "In fulfilment", ar: "قيد التنفيذ" }), at: r.fulfilmentAt, who: r.assignee });
    steps.push({ key: "completed", label: L({ en: "Completed", ar: "اكتمل" }), at: r.completedAt, who: r.outputRef });
  }
  const currentIdx = steps.findIndex((s) => !s.at);
  return (
    <ol className={cn("flex", compact ? "gap-1" : "gap-0")}>
      {steps.map((s, i) => {
        const done = !!s.at;
        const current = i === currentIdx;
        return (
          <li key={s.key} className="relative flex min-w-0 flex-1 flex-col">
            <div className="flex items-center">
              <span
                className={cn(
                  "z-[1] flex size-4 shrink-0 items-center justify-center rounded-full border",
                  done && s.tone !== "danger" && "border-success bg-success text-white",
                  done && s.tone === "danger" && "border-danger bg-danger text-white",
                  !done && current && "border-warning bg-warning-soft text-warning",
                  !done && !current && "border-border-strong bg-card",
                )}
              >
                {done ? s.tone === "danger" ? <X className="size-2.5" strokeWidth={3} /> : <Check className="size-2.5" strokeWidth={3} /> : current ? <Clock className="size-2.5" /> : null}
              </span>
              {i < steps.length - 1 && <span className={cn("h-px flex-1", steps[i + 1].at ? "bg-success" : "bg-border-strong")} />}
            </div>
            {!compact && (
              <div className="mt-1.5 pe-2">
                <div className={cn("text-[11px] font-medium", !done && !current && "text-muted-foreground", s.tone === "danger" && "text-danger")}>{s.label}</div>
                {s.at ? (
                  <div className="num text-[10.5px] text-muted-foreground">
                    {fmt.date(s.at, { day: "numeric", month: "short" })} {fmt.time(s.at)}
                  </div>
                ) : current ? (
                  <div className="text-[10.5px] text-warning">{L({ en: "pending", ar: "قيد الانتظار" })}</div>
                ) : null}
                {s.who && s.at && <div className="truncate text-[10px] text-faint">{s.who}</div>}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** SLA countdown against the due time (end of the working day). */
export function slaState(r: ServiceRequest, now = Date.now(), lang: "en" | "ar" = "en") {
  const end = r.completedAt ? Date.parse(r.completedAt) : r.rejectedAt ? Date.parse(r.rejectedAt) : now;
  const diff = Date.parse(r.dueAt) - end;
  const closed = r.status === "completed" || r.status === "rejected";
  const abs = Math.abs(diff);
  const h = Math.floor(abs / 3600000);
  const d = Math.floor(h / 24);
  const m = Math.floor((abs % 3600000) / 60000);
  const text =
    lang === "ar" ? durationAr(d, d >= 1 ? h % 24 : h, d >= 1 ? 0 : m) : d >= 1 ? `${d}d ${h % 24}h` : `${h}h ${m}m`;
  return { met: diff >= 0, closed, text, diff };
}
