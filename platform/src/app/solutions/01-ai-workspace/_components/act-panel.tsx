"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Bot, ListChecks, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Workbench, Pane, SectionLabel } from "@/components/narvo/pane";
import { AgentTrace } from "@/components/narvo/agent-trace";
import { Markdown } from "@/components/narvo/markdown";
import { SourceList } from "@/components/narvo/sources";
import { ApprovalCard } from "@/components/narvo/approval-card";
import { ThinkingLines } from "@/components/narvo/empty";
import { useNarvoRun } from "@/hooks/use-narvo-run";
import { useL, usePrefs } from "@/lib/i18n";
import type { Citation } from "@/lib/ai/events";
import { ROLES, type RoleKey, type ScopeKey } from "../_lib/shared";

const MISSIONS: Array<{ en: string; ar: string; tag: { en: string; ar: string } }> = [
  {
    en: "Brief me on how Circular 14/2026 affects Marina Quarter permits and create review tasks for the permit team.",
    ar: "أعطني إحاطة حول أثر التعميم 14/2026 على رخص حي المارينا، وأنشئ مهام مراجعة لفريق الرخص.",
    tag: { en: "Briefing + tasks", ar: "إحاطة + مهام" },
  },
  {
    en: "Prepare me for the 15 October meeting with the master developers: NOC rules, Q3 turnaround by developer, and preparation tasks with owners.",
    ar: "جهّزني لاجتماع 15 أكتوبر مع المطورين الرئيسيين: قواعد شهادة عدم الممانعة، ومتوسط مدة الإصدار لكل مطور في الربع الثالث، ومهام تحضيرية مع المسؤولين عنها.",
    tag: { en: "Meeting prep", ar: "تحضير اجتماع" },
  },
  {
    en: "Many staff are housing applicants. Check the salary-certificate rules in HR and Circular 9/2026, then email Maryam Hassan Al Shamsi a short note proposing a reminder to staff.",
    ar: "كثير من الموظفين متقدمون بطلبات سكنية. راجع قواعد شهادة الراتب في الموارد البشرية والتعميم 9/2026، ثم أرسل إلى مريم حسن الشامسي رسالة قصيرة تقترح تذكير الموظفين.",
    tag: { en: "Research + email", ar: "بحث + بريد" },
  },
];

export function ActPanel({
  role,
  scope,
  onActed,
  onApproved,
}: {
  role: RoleKey;
  scope: ScopeKey;
  onActed: (ms: number) => void;
  onApproved: () => void;
}) {
  const L = useL();
  const { lang } = usePrefs();
  const run = useNarvoRun();
  const [input, setInput] = useState("");
  const [mission, setMission] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [highlight, setHighlight] = useState<number | null>(null);
  const counted = useRef(false);
  const r = ROLES[role];

  useEffect(() => {
    if (run.status === "done" && mission && !counted.current) {
      counted.current = true;
      setHistory((h) => [...h, { role: "user" as const, content: mission }, { role: "assistant" as const, content: run.text.main ?? "" }].slice(-4));
      onActed(run.ms ?? 0);
    }
  }, [run.status, mission, run.text.main, run.ms, onActed]);

  function go(p: string) {
    const prompt = p.trim();
    if (!prompt || run.running) return;
    counted.current = false;
    setMission(prompt);
    setInput("");
    setHighlight(null);
    run.start("/api/solutions/01-ai-workspace/agent", { prompt, role, scope, history });
  }

  const citations: Citation[] = (run.data.citations as Citation[]) ?? [];
  const pendingCount = run.approvals.filter((a) => a.status === "pending").length;

  return (
    <Workbench cols="minmax(0,1fr) 400px">
      <Pane
        title={L({ en: "Agent — research, brief, act", ar: "الوكيل — بحث وإحاطة وتنفيذ" })}
        subtitle={L({
          en: "Read-only tools run immediately; anything that creates or sends waits for a named approver.",
          ar: "أدوات القراءة تعمل فوراً؛ وكل ما يُنشئ أو يُرسل ينتظر اعتماد شخص مسؤول.",
        })}
        flush
        bodyClassName="flex flex-col"
      >
        <div className="scrollbar-thin h-[640px] overflow-y-auto px-5 py-4">
          {!mission && (
            <div className="mx-auto max-w-2xl pt-4">
              <div className="flex items-center gap-2 text-ai">
                <Bot className="size-4" strokeWidth={1.75} />
                <span className="label-caps !text-ai">{L({ en: "Completed work, not just answers", ar: "عمل منجز لا مجرد إجابات" })}</span>
              </div>
              <h2 className="display-title mt-2 text-[26px] leading-tight">
                {L({ en: "Give the agent a goal.", ar: "أعطِ الوكيل هدفاً." })}
              </h2>
              <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
                {L({
                  en: "It searches the knowledge base within your access, writes a sourced briefing, and proposes tasks and emails. Nothing is created or sent until the responsible person approves.",
                  ar: "يبحث في قاعدة المعرفة ضمن صلاحيتك، ويكتب إحاطة موثقة، ويقترح مهاماً ورسائل. لا يُنشأ أو يُرسل شيء قبل اعتماد الشخص المسؤول.",
                })}
              </p>
              {!r.canAct && (
                <div className="mt-4 flex gap-2 rounded-md border border-warning/30 bg-warning-soft/60 p-2.5 text-[12px]">
                  <Lock className="mt-0.5 size-3.5 shrink-0 text-warning" />
                  {L({
                    en: "External role: the agent can research public documents but cannot create internal tasks or send emails.",
                    ar: "دور خارجي: يمكن للوكيل البحث في المستندات العامة لكنه لا يستطيع إنشاء مهام داخلية أو إرسال رسائل.",
                  })}
                </div>
              )}
              <div className="mt-6 space-y-2">
                {MISSIONS.map((m) => (
                  <button
                    key={m.en}
                    type="button"
                    onClick={() => go(lang === "ar" ? m.ar : m.en)}
                    className="flex w-full items-start gap-3 rounded-md border border-border bg-surface p-3 text-start transition-colors hover:border-ai/40 hover:bg-ai-soft/40"
                  >
                    <span className="label-caps mt-0.5 w-24 shrink-0 !text-[9.5px]">{L(m.tag)}</span>
                    <span className="text-[13px] leading-snug" dir="auto">
                      {lang === "ar" ? m.ar : m.en}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {mission && (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground text-[9.5px] font-medium text-background">
                  {lang === "ar" ? r.persona.nameAr.slice(0, 1) : r.persona.name[0]}
                </span>
                <div className="min-w-0">
                  <div className="text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground">{lang === "ar" ? r.persona.nameAr : r.persona.name}</span> · {L(r.label)}
                  </div>
                  <p className="mt-1 text-[14px] leading-snug font-medium" dir="auto">
                    {mission}
                  </p>
                </div>
              </div>
              <div className="ms-9 rounded-lg border border-border bg-card px-4 py-3">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <span className={`size-1.5 rounded-full bg-ai ${run.running ? "animate-pulse-soft" : ""}`} />
                  <span className="label-caps !text-[9.5px] !text-ai">{L({ en: "NARVO agent", ar: "وكيل NARVO" })}</span>
                </div>
                {run.text.main ? (
                  <Markdown citations={citations} streaming={run.running} onCite={setHighlight}>
                    {run.text.main}
                  </Markdown>
                ) : run.status === "error" ? (
                  <p className="text-[12.5px] text-danger">{run.error}</p>
                ) : (
                  <div>
                    <p className="mb-2 text-[12px] text-muted-foreground">
                      {L({ en: "Researching the knowledge base — see the trace on the right.", ar: "جارٍ البحث في قاعدة المعرفة — راجع المسار على اليمين." })}
                    </p>
                    <ThinkingLines lines={4} />
                  </div>
                )}
              </div>
              {run.approvals.length > 0 && (
                <div className="ms-9">
                  <SectionLabel className="flex items-center gap-1.5">
                    <ListChecks className="size-3.5" />
                    {L({ en: "Awaiting your decision", ar: "بانتظار قرارك" })}
                    {pendingCount > 0 && <span className="num text-warning">· {pendingCount}</span>}
                  </SectionLabel>
                  <div className="space-y-2">
                    {run.approvals.map((a) => (
                      <ApprovalCard
                        key={a.id}
                        approval={a}
                        onDecided={(s) => {
                          run.markApproval(a.id, s);
                          if (s === "approved") onApproved();
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="border-t border-border p-3">
          <div className="flex items-end gap-2 rounded-lg border border-border-strong bg-card p-1.5 focus-within:border-ai/50">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  go(input);
                }
              }}
              dir="auto"
              rows={2}
              placeholder={
                mission
                  ? L({ en: "Follow up — e.g. “also email Layla the briefing”", ar: "متابعة — مثال: «أرسل الإحاطة إلى ليلى أيضاً»" })
                  : L({ en: "Describe the outcome you need…", ar: "صف النتيجة التي تحتاجها…" })
              }
              className="min-h-[52px] resize-none border-0 bg-transparent text-[13.5px] shadow-none focus-visible:ring-0"
            />
            <Button size="icon" disabled={!input.trim() || run.running} onClick={() => go(input)} aria-label="Run">
              <ArrowUp />
            </Button>
          </div>
        </div>
      </Pane>

      <Pane title={L({ en: "Trace & sources", ar: "المسار والمصادر" })} bodyClassName="scrollbar-thin max-h-[800px] overflow-y-auto">
        <AgentTrace run={run} />
        <div className="mt-5">
          <SectionLabel>
            {L({ en: "Sources", ar: "المصادر" })}
            {citations.length > 0 && <span className="num ms-1.5 text-faint">{citations.length}</span>}
          </SectionLabel>
          <SourceList citations={citations} highlight={highlight} text={run.text.main} />
        </div>
      </Pane>
    </Workbench>
  );
}
