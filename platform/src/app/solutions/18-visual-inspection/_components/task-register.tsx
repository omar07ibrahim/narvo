"use client";

import { useState } from "react";
import { Inbox } from "lucide-react";
import { Pane } from "@/components/narvo/pane";
import { StatusPill } from "@/components/narvo/status";
import { EmptyState } from "@/components/narvo/empty";
import { Button } from "@/components/ui/button";
import { useFormat, useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { CorrectiveTask, InspectionState } from "../_lib/types";
import { Segmented, SeverityPill } from "./ui";
import { useTr } from "./names";

export function TaskRegister({ state, onOpen, onInspection, now }: { state: InspectionState; onOpen: (t: CorrectiveTask) => void; onInspection: (id: string) => void; now: number }) {
  const L = useL();
  const tr = useTr();
  const f = useFormat();
  const [filter, setFilter] = useState<"open" | "overdue" | "closed" | "all">("open");
  const isOverdue = (t: CorrectiveTask) => t.status === "open" && Date.parse(t.dueAt) < now;
  const rows = state.tasks.filter((t) =>
    filter === "all" ? true : filter === "open" ? t.status === "open" : filter === "overdue" ? isOverdue(t) : t.status === "closed",
  );
  const counts = {
    open: state.tasks.filter((t) => t.status === "open").length,
    overdue: state.tasks.filter(isOverdue).length,
    closed: state.tasks.filter((t) => t.status === "closed").length,
  };
  return (
    <Pane
      title={L({ en: "Corrective task register", ar: "سجل المهام التصحيحية" })}
      subtitle={L({ en: "Owned by the main contractor on each inspection; due dates per CSSR-2025 Art. 31", ar: "يملكها المقاول الرئيسي في كل تفتيش؛ المواعيد وفق المادة 31" })}
      actions={
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "open", label: `${L({ en: "Open", ar: "مفتوحة" })} ${counts.open}` },
            { value: "overdue", label: `${L({ en: "Overdue", ar: "متأخرة" })} ${counts.overdue}` },
            { value: "closed", label: `${L({ en: "Closed", ar: "مغلقة" })} ${counts.closed}` },
            { value: "all", label: L({ en: "All", ar: "الكل" }) },
          ]}
        />
      }
      flush
    >
      {rows.length === 0 ? (
        <EmptyState icon={<Inbox className="size-4" />} title={L({ en: "Nothing here", ar: "لا شيء هنا" })} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-[12px]">
            <thead>
              <tr className="border-b border-border">
                {[
                  { en: "Task", ar: "المهمة" },
                  { en: "Finding", ar: "الملاحظة" },
                  { en: "Owner · plot", ar: "المالك · القطعة" },
                  { en: "Class", ar: "الدرجة" },
                  { en: "Due", ar: "الموعد" },
                  { en: "Status", ar: "الحالة" },
                  { en: "", ar: "" },
                ].map((h, i) => (
                  <th key={i} className="label-caps px-3 py-2 text-start !text-[9.5px] font-medium first:ps-4">
                    {L(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((t) => {
                const od = isOverdue(t);
                return (
                  <tr key={t.id} className={cn("hover:bg-muted/40", od && "bg-danger-soft/30")}>
                    <td className="px-3 py-2 ps-4">
                      <div className="font-mono text-[11.5px]">{t.id}</div>
                      <button type="button" onClick={() => onInspection(t.inspectionId)} className="font-mono text-[10.5px] text-muted-foreground hover:text-ai">
                        {t.noticeId}
                      </button>
                    </td>
                    <td className="max-w-[260px] px-3 py-2">
                      <span className="me-1 font-mono text-[11px] text-muted-foreground">{t.code}</span>
                      <span dir="auto">{tr(t.title, t.title_ar)}</span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="truncate">{tr(t.owner)}</div>
                      <div className="font-mono text-[10.5px] text-muted-foreground">{t.plot}</div>
                    </td>
                    <td className="px-3 py-2">
                      <SeverityPill severity={t.severity} escalated={t.escalated} />
                    </td>
                    <td className="num px-3 py-2 whitespace-nowrap">{f.date(t.dueAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="px-3 py-2">
                      {t.status === "closed" ? (
                        <StatusPill tone="success">{L({ en: "Closed", ar: "مغلقة" })}</StatusPill>
                      ) : t.submission ? (
                        <StatusPill tone="info">{L({ en: "Evidence to verify", ar: "دليل بانتظار التحقق" })}</StatusPill>
                      ) : od ? (
                        <StatusPill tone="danger">{L({ en: "Overdue", ar: "متأخرة" })}</StatusPill>
                      ) : (
                        <StatusPill tone="warning">{L({ en: "Open", ar: "مفتوحة" })}</StatusPill>
                      )}
                    </td>
                    <td className="px-3 py-2 text-end">
                      <Button size="xs" variant={t.status === "open" ? "outline" : "ghost"} onClick={() => onOpen(t)}>
                        {t.status === "open" ? L({ en: "Verify closure", ar: "تحقق من الإغلاق" }) : L({ en: "View", ar: "عرض" })}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Pane>
  );
}
