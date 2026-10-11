"use client";

import { useState } from "react";
import { CalendarDays, House, Laptop, Link2, Mail } from "lucide-react";
import { Pane, SectionLabel } from "@/components/narvo/pane";
import { StatusPill } from "@/components/narvo/status";
import { useFormat, useL, usePrefs } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { DEMO_TODAY, STATUS_META, TYPE_META, type Employee, type ServiceRequest } from "../_lib/shared";
import { RequestTimeline } from "./timeline";

const TODAY = new Date(`${DEMO_TODAY}T09:00:00+04:00`);

export function ProfilePanel({ employee: e, requests }: { employee: Employee; requests: ServiceRequest[] }) {
  const L = useL();
  const fmt = useFormat();
  const { lang } = usePrefs();
  const [open, setOpen] = useState<string | null>(null);
  const remaining = e.leave.entitlement - e.leave.taken - e.leave.pending;
  const ageYears = (TODAY.getTime() - new Date(e.laptop.purchased).getTime()) / (365.25 * 86400000);
  const laptopOk = ageYears >= 4;
  const weekUsed = e.remote.approvedDates.length;
  const mine = requests.filter((r) => r.employeeId === e.id);

  return (
    <Pane title={L({ en: "My profile", ar: "ملفي" })} bodyClassName="scrollbar-thin max-h-[700px] space-y-4 overflow-y-auto">
      <div>
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-foreground text-[13px] font-medium text-background">
            {e.name
              .split(" ")
              .filter((p) => !/^(al|bin)$/i.test(p))
              .slice(0, 2)
              .map((p) => p[0])
              .join("")}
          </span>
          <div className="min-w-0">
            <div className="truncate text-[14px] font-medium">{lang === "ar" ? e.nameAr : e.name}</div>
            <div className="truncate text-[12px] text-muted-foreground">{lang === "ar" ? e.titleAr : e.title}</div>
          </div>
        </div>
        <div className="mt-3 space-y-0.5 text-[11.5px] text-muted-foreground">
          <div>{lang === "ar" ? e.departmentAr : e.department}</div>
          <div>
            {lang === "ar" ? e.grade.replace(/^Grade\s*/i, "الدرجة ") : e.grade} · {L({ en: "since", ar: "منذ" })} <span className="num">{fmt.date(e.joined, { month: "short", year: "numeric" })}</span> · <span className="font-mono">{e.id}</span>
          </div>
          <div className="flex min-w-0 items-center gap-1">
            <Mail className="size-3 shrink-0" /> <span className="truncate font-mono">{e.email}</span> · <span className="whitespace-nowrap">{L({ en: "ext.", ar: "تحويلة" })} <span className="num">{e.extension}</span></span>
          </div>
          <div>
            {L({ en: "Manager", ar: "المدير المباشر" })}: <span className="text-foreground">{lang === "ar" ? (e.manager.nameAr ?? e.manager.name) : e.manager.name}</span>
          </div>
        </div>
      </div>

      {e.housingCase && (
        <div className="rounded-md border border-warning/30 bg-warning-soft/50 p-2.5">
          <div className="flex items-center justify-between gap-2 text-[11.5px] font-medium">
            <span className="flex items-center gap-1.5">
              <Link2 className="size-3.5 text-warning" /> {L({ en: "Linked housing case", ar: "طلب سكني مرتبط" })}
            </span>
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-foreground">{e.housingCase.id}</div>
          <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground" dir="auto">
            {lang === "ar" ? e.housingCase.noteAr : e.housingCase.note}
          </p>
        </div>
      )}

      <div className="space-y-2">
        <SectionLabel className="!mb-1">{L({ en: "Entitlements", ar: "الاستحقاقات" })}</SectionLabel>
        <div className="rounded-md border border-border p-2.5">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[12px]">
            <span className="flex items-center gap-1.5 font-medium">
              <CalendarDays className="size-3.5 text-muted-foreground" /> {L({ en: "Annual leave 2026", ar: "الإجازة السنوية 2026" })}
            </span>
            <span className="num">
              <span className="text-[15px] font-light">{remaining}</span> <span className="text-muted-foreground">/ {e.leave.entitlement}</span>
            </span>
          </div>
          <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-muted">
            <span className="bg-foreground/70" style={{ width: `${(e.leave.taken / e.leave.entitlement) * 100}%` }} />
            <span className="bg-warning" style={{ width: `${(e.leave.pending / e.leave.entitlement) * 100}%` }} />
          </div>
          <div className="mt-1.5 flex gap-3 text-[10.5px] text-muted-foreground">
            <span className="num">
              {L({ en: "Taken", ar: "مأخوذة" })} {e.leave.taken}
            </span>
            {e.leave.pending > 0 && (
              <span className="num text-warning">
                {L({ en: "Pending", ar: "قيد الاعتماد" })} {e.leave.pending}
              </span>
            )}
            <span className="num">
              {L({ en: "Sick", ar: "مرضية" })} {e.leave.sickTaken}
            </span>
          </div>
        </div>
        <div className="rounded-md border border-border p-2.5">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[12px]">
            <span className="flex min-w-0 items-center gap-1.5 font-medium">
              <House className="size-3.5 shrink-0 text-muted-foreground" /> <span className="truncate">{L({ en: "Remote work", ar: "العمل عن بُعد" })}</span>
            </span>
            {e.remoteEligible ? (
              <StatusPill tone={weekUsed >= 2 ? "warning" : "success"} className="shrink-0">
                {L({ en: `${2 - weekUsed} of 2 left`, ar: `متبقٍ ${2 - weekUsed} من 2` })}
              </StatusPill>
            ) : (
              <StatusPill tone="neutral" className="shrink-0">{L({ en: "Not eligible", ar: "غير مؤهل" })}</StatusPill>
            )}
          </div>
          <div className="mt-1 text-[10.5px] text-muted-foreground">
            <span className="font-mono">HC-POL-07</span> ·{" "}
            {e.remoteEligible
              ? `${L({ en: "Week of 12 Oct", ar: "أسبوع 12 أكتوبر" })}: ${e.remote.approvedDates.length ? e.remote.approvedDates.map((d) => fmt.date(d, { weekday: "short", day: "numeric" })).join(", ") : L({ en: "none approved", ar: "لا أيام معتمدة" })}`
              : e.workPattern === "field"
                ? L({ en: "Field inspection role", ar: "وظيفة تفتيش ميداني" })
                : L({ en: "Front-line rostered shifts", ar: "مناوبات أمامية" })}
          </div>
        </div>
        <div className="rounded-md border border-border p-2.5">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[12px]">
            <span className="flex min-w-0 items-center gap-1.5 font-medium">
              <Laptop className="size-3.5 shrink-0 text-muted-foreground" /> <span>{e.laptop.model}</span>
            </span>
            <StatusPill tone={laptopOk ? "success" : "neutral"} className="shrink-0">{laptopOk ? L({ en: "Replacement due", ar: "مستحق الاستبدال" }) : L({ en: "In lifecycle", ar: "ضمن دورة الحياة" })}</StatusPill>
          </div>
          <div className="mt-1 text-[10.5px] text-muted-foreground">
            <span className="font-mono">{e.laptop.assetTag}</span> · {L({ en: "bought", ar: "شُري" })} <span className="num">{fmt.date(e.laptop.purchased)}</span> ·{" "}
            <span className="whitespace-nowrap">
              <span className="num">{ageYears.toFixed(1)}</span> {L({ en: "years", ar: "سنوات" })}
            </span>
          </div>
        </div>
      </div>

      <div>
        <SectionLabel className="!mb-1">
          {L({ en: "My requests", ar: "طلباتي" })} <span className="num text-faint">· {mine.length}</span>
        </SectionLabel>
        {mine.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">{L({ en: "No requests yet.", ar: "لا توجد طلبات بعد." })}</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {mine.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)} className={cn("w-full px-2.5 py-2 text-start hover:bg-muted/40", r._createdAt && "bg-ai-soft/30")}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[12px] font-medium">{L(TYPE_META[r.type].label)}</span>
                    <StatusPill tone={STATUS_META[r.status].tone} className="!h-[18px] !text-[10px]">
                      {L(STATUS_META[r.status].label)}
                    </StatusPill>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2 text-[10.5px] text-muted-foreground">
                    <span className="font-mono">{r.id}</span>
                    <span className="num">{fmt.date(r.submittedAt, { day: "numeric", month: "short" })}</span>
                  </div>
                  <div className="mt-1.5">
                    <RequestTimeline r={r} compact />
                  </div>
                </button>
                {open === r.id && (
                  <div className="px-2.5 pb-2.5">
                    <p className="mb-2 text-[11.5px] text-muted-foreground" dir="auto">
                      {L(r.title)}
                    </p>
                    <RequestTimeline r={r} />
                    {r.rejectionNote && <p className="mt-2 text-[11.5px] text-danger" dir="auto">{r.rejectionNote}</p>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Pane>
  );
}
