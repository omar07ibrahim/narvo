"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { ArrowUp, MessageSquarePlus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Pane, SectionLabel } from "@/components/narvo/pane";
import { AgentTrace } from "@/components/narvo/agent-trace";
import { Markdown } from "@/components/narvo/markdown";
import { SourceList } from "@/components/narvo/sources";
import { ApprovalCard } from "@/components/narvo/approval-card";
import { ThinkingLines } from "@/components/narvo/empty";
import { VoiceButton } from "@/components/narvo/voice";
import { useNarvoRun } from "@/hooks/use-narvo-run";
import { useL, usePrefs } from "@/lib/i18n";
import type { ApprovalSummary, Citation } from "@/lib/ai/events";
import type { Draft, Employee, ServiceRequest } from "../_lib/shared";
import { RequestForm } from "./request-form";

interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  error?: string;
}

const STARTERS: Record<string, Array<{ en: string; ar: string }>> = {
  "EMP-10482": [
    { en: "I need a salary certificate for my housing application — in Arabic please.", ar: "السلام عليكم، أبا شهادة راتب حق طلب الإسكان مالي، بالعربي لو سمحت" },
    { en: "My laptop is really old and slow — can I get a new one?", ar: "لابتوبي قديم وايد وبطيء، أقدر آخذ واحد جديد؟" },
    { en: "Can I work from home on Wednesday?", ar: "أقدر أشتغل من البيت يوم الأربعاء؟" },
  ],
  "EMP-08817": [
    { en: "I'd like to work remotely on Thursday 15 October as well.", ar: "أبغي أشتغل عن بُعد يوم الخميس 15 أكتوبر بعد." },
    { en: "Can I get a second monitor for my desk?", ar: "أحتاج شاشة ثانية للمكتب، كيف أطلبها؟" },
    { en: "How many annual leave days do I have left?", ar: "كم باقي لي من الإجازة السنوية؟" },
  ],
  "EMP-11930": [
    { en: "My laptop is just over four years old — can I get it replaced?", ar: "جهازي عمره أكثر من أربع سنوات، أقدر أستبدله؟" },
    { en: "Can I also work remotely on Monday next week?", ar: "أقدر أشتغل عن بُعد يوم الاثنين الجاي بعد؟" },
    { en: "What's the status of my Tamkeen access request?", ar: "شو صار على طلب صلاحية تمكين؟" },
  ],
  "EMP-12207": [
    { en: "I want annual leave from 26 to 30 October.", ar: "أبا إجازة سنوية من 26 إلى 30 أكتوبر" },
    { en: "What happened to my salary certificate request?", ar: "شو صار على طلب شهادة الراتب حقي؟ صار له يومين" },
    { en: "How many days of sick leave can I take without a certificate?", ar: "كم يوم إجازة مرضية أقدر آخذ بدون شهادة طبية؟" },
  ],
  "EMP-07791": [
    { en: "Can I carry unused leave over to next year?", ar: "أقدر أرحّل الإجازات اللي ما أخذتها للسنة الياية؟" },
    { en: "I need read access to Marsa Atlas GIS to check plot boundaries on housing cases.", ar: "أحتاج صلاحية قراءة على نظام أطلس مرسى عشان أتأكد من حدود القطع في ملفات الإسكان" },
    { en: "What are the rules for using public AI chatbots at work?", ar: "هل مسموح أستخدم شات بوت عام في الشغل؟" },
  ],
};

export function Assistant({
  employee,
  onRequestsChanged,
}: {
  employee: Employee;
  onRequestsChanged: () => void;
}) {
  const L = useL();
  const { lang } = usePrefs();
  const run = useNarvoRun();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [approvals, setApprovals] = useState<ApprovalSummary[]>([]);
  const [highlight, setHighlight] = useState<number | null>(null);
  const [citations, setCitations] = useState<Citation[]>([]);
  const pending = useRef(false);
  const scroller = useRef<HTMLDivElement>(null);

  // Fresh conversation per employee.
  useEffect(() => {
    run.reset();
    setMsgs([]);
    setDraft(null);
    setApprovals([]);
    setCitations([]);
    pending.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee.id]);

  useEffect(() => {
    if (run.data.draft) setDraft(run.data.draft as Draft);
  }, [run.data.draft]);
  useEffect(() => {
    if (run.data.citations) setCitations(run.data.citations as Citation[]);
  }, [run.data.citations]);
  useEffect(() => {
    if (run.approvals.length) {
      setApprovals((a) => [...a.filter((x) => !run.approvals.some((y) => y.id === x.id)), ...run.approvals]);
      onRequestsChanged();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.approvals.length]);
  useEffect(() => {
    if (run.data.submitted) {
      setDraft((d) => (d ? { ...d, submittedRequestId: (run.data.submitted as ServiceRequest).id } : d));
    }
  }, [run.data.submitted]);

  useEffect(() => {
    if (!pending.current || run.running || run.status === "idle") return;
    pending.current = false;
    setMsgs((m) => [
      ...m,
      {
        id: `A${Date.now()}`,
        role: "assistant",
        content: run.text.main ?? "",
        citations: (run.data.citations as Citation[]) ?? [],
        error: run.status === "error" ? run.error : undefined,
      },
    ]);
  }, [run.running, run.status, run.text.main, run.data.citations, run.error]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs.length, run.text.main]);

  function send(text: string) {
    const message = text.trim();
    if (!message || run.running) return;
    const history = msgs.filter((m) => !m.error && m.content).map((m) => ({ role: m.role, content: m.content }));
    setMsgs((m) => [...m, { id: `U${Date.now()}`, role: "user", content: message }]);
    setInput("");
    setHighlight(null);
    pending.current = true;
    run.start("/api/solutions/11-employee-services/chat", { employeeId: employee.id, message, history, draftId: draft?.employeeId === employee.id ? draft.id : undefined });
  }

  const starters = STARTERS[employee.id] ?? [];
  const firstName = lang === "ar" ? employee.nameAr.split(" ")[0] : employee.name.split(" ")[0];

  return (
    <>
      <Pane
        title={L({ en: "Ask HR & IT", ar: "اسأل الموارد البشرية وتقنية المعلومات" })}
        subtitle={L({ en: "Everyday language, Arabic or English — answers from policy, requests with live status", ar: "بلغتك اليومية، بالعربية أو الإنجليزية — إجابات من السياسات وطلبات بحالة مباشرة" })}
        actions={
          msgs.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => {
                run.reset();
                setMsgs([]);
                setDraft(null);
                setCitations([]);
              }}
            >
              <MessageSquarePlus /> {L({ en: "New", ar: "جديدة" })}
            </Button>
          )
        }
        flush
        bodyClassName="flex flex-col"
      >
        <div ref={scroller} className="scrollbar-thin h-[560px] space-y-4 overflow-y-auto px-5 py-4">
          {msgs.length === 0 && !run.running && (
            <div className="pt-4">
              <div className="flex items-center gap-2 text-ai">
                <Sparkles className="size-4" strokeWidth={1.75} />
                <span className="label-caps !text-ai">{L({ en: "Employee services assistant", ar: "مساعد خدمات الموظفين" })}</span>
              </div>
              <h2 className="display-title mt-2 text-[24px] leading-tight">
                {L({ en: `Hello ${firstName} — what do you need today?`, ar: `مرحباً ${firstName} — كيف أقدر أساعدك اليوم؟` })}
              </h2>
              <p className="mt-1.5 max-w-lg text-[12.5px] leading-relaxed text-muted-foreground">
                {L({
                  en: "Ask about leave, remote work, certificates, devices or system access. I check your eligibility, prepare the form, and route it to the right approver.",
                  ar: "اسأل عن الإجازات أو العمل عن بُعد أو الشهادات أو الأجهزة أو صلاحيات الأنظمة. أتحقق من أهليتك وأجهّز النموذج وأحيله إلى المعتمِد المناسب.",
                })}
              </p>
              <div className="mt-5 space-y-1.5">
                {starters.map((s) => (
                  <button
                    key={s.en}
                    type="button"
                    onClick={() => send(lang === "ar" ? s.ar : s.en)}
                    dir="auto"
                    className="block w-full rounded-md border border-border bg-surface px-3 py-2 text-start text-[12.5px] transition-colors hover:border-ai/40 hover:bg-ai-soft/40"
                  >
                    {lang === "ar" ? s.ar : s.en}
                  </button>
                ))}
              </div>
            </div>
          )}
          {msgs.map((m) => (
            <Bubble key={m.id} m={m} onCite={setHighlight} />
          ))}
          {run.running && (
            <Bubble
              m={{ id: "live", role: "assistant", content: run.text.main ?? "", citations: (run.data.citations as Citation[]) ?? [] }}
              streaming
              onCite={setHighlight}
            />
          )}
        </div>
        <div className="flex items-end gap-3 border-t border-border p-3">
          <VoiceButton
            size="md"
            disabled={run.running}
            onTranscript={(t) => {
              if (t.text.trim()) send(t.text);
            }}
            onError={(msg) => toast.error(L({ en: "Voice input failed", ar: "تعذّر الإدخال الصوتي" }), { description: msg })}
          />
          <div className="flex flex-1 items-end gap-2 rounded-lg border border-border-strong bg-card p-1.5 focus-within:border-ai/50">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              dir="auto"
              rows={2}
              placeholder={L({ en: "e.g. “أبا شهادة راتب” or “Can I work from home Thursday?”", ar: "مثال: «أبا شهادة راتب» أو «أقدر أشتغل من البيت الخميس؟»" })}
              className="min-h-[52px] resize-none border-0 bg-transparent text-[13.5px] shadow-none focus-visible:ring-0"
            />
            <Button size="icon" disabled={!input.trim() || run.running} onClick={() => send(input)} aria-label="Send">
              <ArrowUp />
            </Button>
          </div>
        </div>
      </Pane>

      <Pane title={L({ en: "Request & trace", ar: "الطلب والمسار" })} bodyClassName="scrollbar-thin max-h-[700px] space-y-4 overflow-y-auto">
        {draft ? (
          <RequestForm
            key={draft.id}
            draft={draft}
            onDraft={setDraft}
            onSubmitted={(_r, a) => {
              setApprovals((x) => [...x.filter((y) => y.id !== a.id), a]);
              onRequestsChanged();
            }}
          />
        ) : (
          <div className="rounded-md border border-dashed border-border-strong p-4 text-[12px] leading-relaxed text-muted-foreground">
            {L({
              en: "When you ask for something, the assistant prepares the request form here — pre-filled, eligibility-checked and editable. You submit; the approver decides.",
              ar: "عندما تطلب شيئاً، يجهّز المساعد نموذج الطلب هنا — معبأً مسبقاً ومتحققاً من الأهلية وقابلاً للتعديل. أنت تقدّم والمعتمِد يقرر.",
            })}
          </div>
        )}
        {approvals.length > 0 && (
          <div>
            <SectionLabel>{L({ en: "With the approver", ar: "لدى المعتمِد" })}</SectionLabel>
            <div className="space-y-2">
              {approvals.map((a) => (
                <ApprovalCard
                  key={a.id}
                  approval={a}
                  compact
                  onDecided={(s) => {
                    setApprovals((x) => x.map((y) => (y.id === a.id ? { ...y, status: s } : y)));
                    run.markApproval(a.id, s);
                    onRequestsChanged();
                  }}
                />
              ))}
            </div>
          </div>
        )}
        <AgentTrace
          run={run}
          emptyHint={L({
            en: "Every step the assistant takes — profile lookups, policy searches, form preparation — appears here.",
            ar: "تظهر هنا كل خطوة يتخذها المساعد — قراءة الملف والبحث في السياسات وتجهيز النموذج.",
          })}
        />
        <div>
          <SectionLabel>{L({ en: "Policy sources", ar: "مصادر السياسات" })}</SectionLabel>
          <SourceList citations={citations} highlight={highlight} />
        </div>
      </Pane>
    </>
  );
}

function Bubble({ m, streaming, onCite }: { m: Msg; streaming?: boolean; onCite: (n: number) => void }) {
  const L = useL();
  if (m.role === "user")
    return (
      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
        <div className="max-w-[80%] rounded-lg rounded-ee-sm bg-foreground px-3.5 py-2 text-[13.5px] leading-relaxed text-background" dir="auto">
          {m.content}
        </div>
      </motion.div>
    );
  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex justify-start">
      <div className="max-w-[88%] rounded-lg rounded-es-sm border border-border bg-surface px-3.5 py-2.5">
        <div className="mb-1 flex items-center gap-1.5">
          <span className={`size-1.5 rounded-full bg-ai ${streaming ? "animate-pulse-soft" : ""}`} />
          <span className="label-caps !text-[9px] !text-ai">{L({ en: "Employee services", ar: "خدمات الموظفين" })}</span>
        </div>
        {m.error ? (
          <p className="text-[12.5px] text-danger">{m.error}</p>
        ) : m.content.trim() ? (
          <Markdown citations={m.citations} onCite={onCite} streaming={streaming}>
            {m.content.trim()}
          </Markdown>
        ) : (
          <ThinkingLines lines={2} className="w-56 py-1" />
        )}
      </div>
    </motion.div>
  );
}
