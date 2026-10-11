"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Bot, Check, ChevronRight, Mail, RotateCcw, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Workbench, Pane } from "@/components/narvo/pane";
import { StatusPill } from "@/components/narvo/status";
import { EmptyState } from "@/components/narvo/empty";
import { useFormat, useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { OutboxItem, RoleKey, TaskRecord } from "../_lib/shared";
import { Segmented, initials } from "./ui-bits";

const TODAY = new Date("2026-10-11T12:00:00+04:00");

export function TasksTab({
  tasks,
  outbox,
  role,
  onChange,
}: {
  tasks: TaskRecord[];
  outbox: OutboxItem[];
  role: RoleKey;
  onChange: (tasks: TaskRecord[]) => void;
}) {
  const L = useL();
  const fmt = useFormat();
  const [filter, setFilter] = useState<"open" | "done" | "all">("open");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [mail, setMail] = useState<string | null>(null);

  const list = tasks
    .filter((t) => filter === "all" || t.status === filter)
    .sort((a, b) => (a.status === b.status ? a.due.localeCompare(b.due) : a.status === "open" ? -1 : 1));

  async function setStatus(t: TaskRecord, status: "done" | "open") {
    setBusy(t.id);
    try {
      const res = await fetch("/api/solutions/01-ai-workspace/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: t.id, status, role }),
      });
      if (!res.ok) throw new Error(await res.text());
      const j = (await res.json()) as { tasks: TaskRecord[] };
      onChange(j.tasks);
      toast.success(status === "done" ? L({ en: "Task completed — recorded in the audit trail", ar: "اكتملت المهمة — سُجّلت في سجل التدقيق" }) : L({ en: "Task reopened", ar: "أُعيد فتح المهمة" }), {
        description: t.title,
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const counts = {
    open: tasks.filter((t) => t.status === "open").length,
    done: tasks.filter((t) => t.status === "done").length,
    all: tasks.length,
  };

  return (
    <Workbench cols="minmax(0,1fr) 380px">
      <Pane
        title={L({ en: "Tasks from approved agent actions", ar: "المهام الناتجة عن إجراءات الوكيل المعتمدة" })}
        actions={
          <Segmented
            value={filter}
            onChange={setFilter}
            items={[
              { value: "open", label: `${L({ en: "Open", ar: "مفتوحة" })} ${counts.open}` },
              { value: "done", label: `${L({ en: "Done", ar: "منجزة" })} ${counts.done}` },
              { value: "all", label: `${L({ en: "All", ar: "الكل" })} ${counts.all}` },
            ]}
          />
        }
        flush
      >
        {list.length === 0 ? (
          <EmptyState icon={<Check className="size-4" />} title={L({ en: "Nothing here", ar: "لا شيء هنا" })}>
            {L({ en: "Approve tasks proposed by the agent and they appear here.", ar: "اعتمد المهام التي يقترحها الوكيل لتظهر هنا." })}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            <li className="grid grid-cols-[minmax(0,1fr)_200px_110px_96px] items-center gap-3 bg-muted/40 px-4 py-2 max-md:hidden">
              <span className="label-caps !text-[9.5px]">{L({ en: "Task", ar: "المهمة" })}</span>
              <span className="label-caps !text-[9.5px]">{L({ en: "Owner", ar: "المسؤول" })}</span>
              <span className="label-caps !text-[9.5px]">{L({ en: "Due", ar: "الاستحقاق" })}</span>
              <span className="label-caps !text-[9.5px] text-end">{L({ en: "Status", ar: "الحالة" })}</span>
            </li>
            {list.map((t) => {
              const due = new Date(`${t.due}T12:00:00+04:00`);
              const overdue = t.status === "open" && due < TODAY;
              const soon = t.status === "open" && !overdue && due.getTime() - TODAY.getTime() < 3 * 86400000;
              const fresh = !!t._createdAt;
              const isOpen = open === t.id;
              return (
                <li key={t.id} className={cn(fresh && "bg-ai-soft/30")}>
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : t.id)}
                    className="grid w-full grid-cols-[minmax(0,1fr)_200px_110px_96px] items-center gap-3 px-4 py-3 text-start hover:bg-muted/40 max-md:grid-cols-1"
                  >
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <ChevronRight className={cn("size-3.5 shrink-0 text-faint transition-transform rtl:rotate-180", isOpen && "rotate-90 rtl:rotate-90")} />
                        <span className={cn("truncate text-[13px] font-medium", t.status === "done" && "text-muted-foreground line-through decoration-faint")} dir="auto">
                          {t.title}
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 ps-5 text-[11px] text-muted-foreground">
                        <span className="font-mono">{t.id}</span>
                        <span>·</span>
                        {t.createdVia === "NARVO agent" ? <Bot className="size-3 text-ai" /> : <User className="size-3" />}
                        <span>{t.createdVia === "NARVO agent" ? L({ en: "via agent", ar: "عبر الوكيل" }) : L({ en: "manual", ar: "يدوي" })}</span>
                        {t.priority === "high" && <StatusPill tone="warning" dot={false} className="!h-4 !px-1.5 !text-[9.5px]">{L({ en: "High", ar: "عالية" })}</StatusPill>}
                        {fresh && <StatusPill tone="ai" dot={false} className="!h-4 !px-1.5 !text-[9.5px]">{L({ en: "New", ar: "جديدة" })}</StatusPill>}
                      </span>
                    </span>
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[9.5px] font-medium">{initials(t.owner)}</span>
                      <span className="min-w-0 text-[11.5px] leading-tight">
                        <span className="block truncate font-medium">{t.owner}</span>
                        <span className="block truncate text-muted-foreground">{t.department}</span>
                      </span>
                    </span>
                    <span className={cn("num text-[12px]", overdue ? "text-danger" : soon ? "text-warning" : "text-muted-foreground")}>
                      {fmt.date(due)}
                    </span>
                    <span className="flex justify-end">
                      {t.status === "done" ? (
                        <StatusPill tone="success">{L({ en: "Done", ar: "منجزة" })}</StatusPill>
                      ) : overdue ? (
                        <StatusPill tone="danger">{L({ en: "Overdue", ar: "متأخرة" })}</StatusPill>
                      ) : (
                        <StatusPill tone="info">{L({ en: "Open", ar: "مفتوحة" })}</StatusPill>
                      )}
                    </span>
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div initial={{ height: 0, opacity: 1 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="space-y-3 px-4 pb-4 ps-9">
                          {t.description && (
                            <p className="max-w-3xl text-[12.5px] leading-relaxed text-muted-foreground" dir="auto">
                              {t.description}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11.5px] text-muted-foreground">
                            <span>
                              {L({ en: "Requested by", ar: "طلبها" })}: <span className="text-foreground">{t.createdBy}</span>
                            </span>
                            <span>
                              {L({ en: "Created", ar: "أُنشئت" })}: <span className="num text-foreground">{fmt.date(t.createdAt)}</span>
                            </span>
                            {t.ownerEmail && <span className="font-mono">{t.ownerEmail}</span>}
                            {t.completedAt && (
                              <span>
                                {L({ en: "Completed", ar: "أُنجزت" })}: <span className="num text-foreground">{fmt.date(t.completedAt)}</span>
                              </span>
                            )}
                          </div>
                          {t.sources && t.sources.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="label-caps !text-[9.5px]">{L({ en: "Evidence", ar: "الأدلة" })}</span>
                              {t.sources.map((s) => (
                                <span key={s.docId} className="rounded border border-ai/25 bg-ai-soft px-1.5 py-0.5 font-mono text-[10.5px] text-ai">
                                  {s.ref ?? s.docId}
                                </span>
                              ))}
                            </div>
                          )}
                          <div>
                            {t.status === "open" ? (
                              <Button size="sm" onClick={() => setStatus(t, "done")} disabled={busy === t.id}>
                                <Check /> {L({ en: "Mark done", ar: "تعليم كمنجزة" })}
                              </Button>
                            ) : (
                              <Button size="sm" variant="outline" onClick={() => setStatus(t, "open")} disabled={busy === t.id}>
                                <RotateCcw /> {L({ en: "Reopen", ar: "إعادة فتح" })}
                              </Button>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </li>
              );
            })}
          </ul>
        )}
      </Pane>

      <Pane title={L({ en: "Sent from the workspace", ar: "مرسلة من مساحة العمل" })} subtitle={L({ en: "Emails released after sender approval", ar: "رسائل أُطلقت بعد اعتماد المرسل" })} flush>
        {outbox.length === 0 ? (
          <EmptyState icon={<Mail className="size-4" />} title={L({ en: "No emails yet", ar: "لا رسائل بعد" })} />
        ) : (
          <ul className="divide-y divide-border">
            {outbox.map((m) => (
              <li key={m.id}>
                <button type="button" onClick={() => setMail(mail === m.id ? null : m.id)} className="w-full px-4 py-3 text-start hover:bg-muted/40">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[12.5px] font-medium" dir="auto">
                      {m.subject}
                    </span>
                    <span className="num shrink-0 text-[10.5px] text-faint">{fmt.date(m.sentAt, { day: "numeric", month: "short" })}</span>
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {L({ en: "To", ar: "إلى" })}: {m.to.join(", ")}
                  </div>
                </button>
                {mail === m.id && (
                  <div className="px-4 pb-4">
                    <div className="mb-2 text-[11px] text-muted-foreground">
                      {L({ en: "From", ar: "من" })}: {m.from}
                    </div>
                    <pre className="rounded-md border border-border bg-surface p-3 font-sans text-[12px] leading-relaxed whitespace-pre-wrap" dir="auto">
                      {m.body}
                    </pre>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Pane>
    </Workbench>
  );
}
