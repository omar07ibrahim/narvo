"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { CornerDownRight, Inbox, Mail, Send, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RunButton } from "@/components/narvo/run-button";
import { StatusPill } from "@/components/narvo/status";
import { EmptyState } from "@/components/narvo/empty";
import type { NarvoRun } from "@/hooks/use-narvo-run";
import { useFormat, useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { DEMO_TODAY } from "@/lib/world/orgs";
import { daysBetween } from "../_lib/compliance";
import type { BidTask, Coverage, TeamMember } from "../_lib/types";
import { STATUS_LABEL, STATUS_TONE } from "./coverage-view";

export interface Reply {
  reqId: string;
  from: string;
  subject: string;
  text: string;
}

const PRIORITY = {
  critical: { tone: "danger" as const, en: "Critical", ar: "حرج" },
  high: { tone: "warning" as const, en: "High", ar: "مرتفع" },
  normal: { tone: "neutral" as const, en: "Normal", ar: "عادي" },
};

export function TasksView({
  tasks,
  team,
  coverage,
  openGaps,
  replies,
  taskRun,
  answerRun,
  answering,
  onPlan,
  onAnswer,
}: {
  tasks: BidTask[];
  team: TeamMember[];
  coverage: Record<string, Coverage>;
  openGaps: number;
  replies: Reply[];
  taskRun: NarvoRun;
  answerRun: NarvoRun;
  answering: string | null;
  onPlan: () => void;
  onAnswer: (taskId: string, text: string) => void;
}) {
  const L = useL();
  const owners = Array.from(new Set(tasks.map((t) => t.owner)));
  const answered = tasks.filter((t) => t.status === "answered").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface px-4 py-3">
        <div className="text-[12.5px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">
            {openGaps} {L({ en: "open gaps without a task", ar: "فجوة مفتوحة بلا مهمة" })}
          </span>
          {" · "}
          {tasks.length} {L({ en: "tasks", ar: "مهمة" })} · {answered} {L({ en: "answered", ar: "أُجيبت" })}
        </div>
        <RunButton running={taskRun.running} onRun={onPlan} size="sm" icon={<Users />} disabled={openGaps === 0}>
          {L({ en: "Assign gaps to contributors", ar: "إسناد الفجوات إلى المساهمين" })}
        </RunButton>
      </div>

      {!tasks.length ? (
        <EmptyState icon={<Inbox className="size-4" />} title={L({ en: "No contributor tasks yet", ar: "لا توجد مهام بعد" })}>
          {L({
            en: "After evidence mapping, NARVO turns each partial or missing requirement into a precise ask for the right person in the Raseen FM bid team, with a computed due date before the internal review.",
            ar: "بعد ربط الأدلة، يحوّل نارفو كل متطلب جزئي أو مفقود إلى طلب محدد للشخص المناسب في فريق العطاءات، مع تاريخ استحقاق محسوب قبل المراجعة الداخلية.",
          })}
        </EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-4 max-xl:grid-cols-1">
          {owners.map((o) => {
            const m = team.find((t) => t.name === o);
            const mine = tasks.filter((t) => t.owner === o).sort((a, b) => a.due.localeCompare(b.due));
            return (
              <section key={o} className="rounded-lg border border-border bg-card">
                <header className="flex items-center gap-2.5 border-b border-border px-4 py-2.5">
                  <span className="flex size-7 items-center justify-center rounded-full bg-foreground text-[10px] font-medium text-background">
                    {o
                      .split(" ")
                      .filter((p) => !/^al$/i.test(p))
                      .slice(0, 2)
                      .map((p) => p[0])
                      .join("")}
                  </span>
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className="text-[13px] font-medium">{o}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{m ? L({ en: m.role, ar: m.role_ar }) : ""}</div>
                  </div>
                  <span className="num text-[11px] text-muted-foreground">
                    {mine.filter((t) => t.status === "answered").length}/{mine.length}
                  </span>
                </header>
                <ul className="divide-y divide-border">
                  {mine.map((t) => (
                    <TaskItem
                      key={t.id}
                      t={t}
                      cov={coverage[t.reqId]}
                      reply={replies.find((r) => r.reqId === t.reqId && r.from === t.owner) ?? replies.find((r) => r.reqId === t.reqId)}
                      running={answerRun.running && answering === t.id}
                      disabled={answerRun.running}
                      onAnswer={(text) => onAnswer(t.id, text)}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TaskItem({
  t,
  cov,
  reply,
  running,
  disabled,
  onAnswer,
}: {
  t: BidTask;
  cov?: Coverage;
  reply?: Reply;
  running: boolean;
  disabled: boolean;
  onAnswer: (text: string) => void;
}) {
  const L = useL();
  const f = useFormat();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const days = daysBetween(DEMO_TODAY, t.due);
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded border border-border px-1.5 py-px font-mono text-[10.5px]">{t.reqId}</span>
        <span className="text-[12.5px] font-medium" dir="auto">
          {t.reqTitle}
        </span>
        <span className="ms-auto flex items-center gap-1.5">
          <StatusPill tone={PRIORITY[t.priority].tone} dot={false}>
            {L(PRIORITY[t.priority])}
          </StatusPill>
        </span>
      </div>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground" dir="auto">
        {t.ask}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span>{t.evidenceType}</span>
        <span className={cn("num", t.status === "open" && days <= 2 && "text-warning")}>
          {L({ en: "Due", ar: "الاستحقاق" })} {f.date(t.due, { day: "numeric", month: "short" })} · {days} {L({ en: "days", ar: "أيام" })}
        </span>
        {t.status === "answered" ? (
          <span className="flex items-center gap-1.5">
            {L({ en: "Answered →", ar: "أُجيبت ←" })}
            {t.resultStatus && <StatusPill tone={STATUS_TONE[t.resultStatus]}>{L(STATUS_LABEL[t.resultStatus])}</StatusPill>}
          </span>
        ) : (
          cov && <span>{L({ en: "Currently", ar: "حالياً" })}: {L(STATUS_LABEL[cov.status])}</span>
        )}
      </div>

      {t.status === "answered" && t.answer && (
        <div className="mt-2 flex gap-2 rounded-md bg-surface p-2.5 text-[12px] leading-relaxed text-muted-foreground">
          <CornerDownRight className="mt-0.5 size-3.5 shrink-0 text-faint" />
          <span className="line-clamp-3" dir="auto">
            {t.answer}
          </span>
        </div>
      )}

      {t.status === "open" && !open && (
        <Button size="xs" variant="outline" className="mt-2" onClick={() => setOpen(true)}>
          <Send /> {L({ en: "Add contributor answer", ar: "إضافة إجابة المساهم" })}
        </Button>
      )}
      {t.status === "open" && open && (
        <motion.div initial={{ opacity: 1, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-2 space-y-2">
          {reply && !text && (
            <button
              type="button"
              onClick={() => setText(reply.text)}
              className="flex w-full items-center gap-2 rounded-md border border-dashed border-border-strong px-2.5 py-2 text-start text-[11.5px] text-muted-foreground hover:border-ai/50 hover:text-foreground"
            >
              <Mail className="size-3.5 shrink-0" />
              <span className="min-w-0 truncate">
                {L({ en: "Insert reply received from", ar: "إدراج الرد الوارد من" })} {reply.from}: “{reply.subject}”
              </span>
            </button>
          )}
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={L({ en: "Paste the contributor's answer, CV summary or certificate details…", ar: "الصق إجابة المساهم أو ملخص السيرة الذاتية أو بيانات الشهادة…" })}
            className="min-h-24 text-[12.5px]"
            dir="auto"
          />
          <div className="flex items-center justify-end gap-2">
            <Button size="xs" variant="ghost" onClick={() => setOpen(false)}>
              {L({ en: "Cancel", ar: "إلغاء" })}
            </Button>
            <RunButton size="sm" running={running} disabled={disabled || text.trim().length < 20} onRun={() => onAnswer(text)}>
              {L({ en: "Evaluate & update matrix", ar: "تقييم وتحديث المصفوفة" })}
            </RunButton>
          </div>
        </motion.div>
      )}
    </li>
  );
}
