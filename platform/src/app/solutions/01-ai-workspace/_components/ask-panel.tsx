"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { ArrowUp, Check, Copy, Lock, MessageSquarePlus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Workbench, Pane, SectionLabel } from "@/components/narvo/pane";
import { AgentTrace } from "@/components/narvo/agent-trace";
import { Markdown } from "@/components/narvo/markdown";
import { SourceList } from "@/components/narvo/sources";
import { ThinkingLines } from "@/components/narvo/empty";
import { useNarvoRun } from "@/hooks/use-narvo-run";
import { useL, usePrefs } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Citation } from "@/lib/ai/events";
import { ROLES, SCOPES, type RoleKey, type ScopeKey } from "../_lib/shared";
import { AttachmentSlot, useAttachment } from "./attachment";

interface AskTurn {
  id: string;
  q: string;
  role: RoleKey;
  scope: ScopeKey;
  answer: string;
  citations: Citation[];
  withheld: Array<{ docId: string; title: string; classification: string }>;
  followups: string[];
  ms?: number;
  model?: string;
  error?: string;
  attachmentName?: string;
}

const STARTERS: Array<{ en: string; ar: string; tag: { en: string; ar: string } }> = [
  {
    en: "Which plots need a master-developer NOC, and how long is an NOC valid?",
    ar: "ما قطع الأراضي التي تحتاج إلى شهادة عدم ممانعة من المطور الرئيسي، وما مدة صلاحيتها؟",
    tag: { en: "Circular 14/2026", ar: "تعميم 14/2026" },
  },
  {
    en: "How is Circular 14/2026 affecting permit cycle times in gated communities?",
    ar: "كيف يؤثر التعميم 14/2026 على مدة إصدار الرخص في المجتمعات المسوّرة؟",
    tag: { en: "Performance", ar: "الأداء" },
  },
  {
    en: "What changed for housing applications under Circular 9/2026?",
    ar: "ما الذي تغيّر في طلبات الإسكان بموجب التعميم 9/2026؟",
    tag: { en: "Housing", ar: "الإسكان" },
  },
  {
    en: "What are the roof equipment screening rules for villas in Al Sidr Residential?",
    ar: "ما اشتراطات حجب معدات السطح للفلل في السدر السكنية؟",
    tag: { en: "Building code", ar: "كود البناء" },
  },
  {
    en: "Can I work remotely two days a week, and who approves it?",
    ar: "هل يمكنني العمل عن بُعد يومين في الأسبوع، ومن يعتمد ذلك؟",
    tag: { en: "HR policy", ar: "سياسة الموارد البشرية" },
  },
  {
    en: "What is AI allowed to decide on its own under our Responsible AI policy?",
    ar: "ما الذي يُسمح للذكاء الاصطناعي بأن يقرره وحده وفق سياسة الذكاء الاصطناعي المسؤول؟",
    tag: { en: "AI-POL-01", ar: "AI-POL-01" },
  },
];

export function AskPanel({ role, scope, onAnswered }: { role: RoleKey; scope: ScopeKey; onAnswered: (ms: number) => void }) {
  const L = useL();
  const { lang } = usePrefs();
  const run = useNarvoRun();
  const att = useAttachment();
  const [turns, setTurns] = useState<AskTurn[]>([]);
  const [input, setInput] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<number | null>(null);
  const [live, setLive] = useState<Omit<AskTurn, "answer" | "citations" | "withheld" | "followups"> | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  // Commit the streamed turn when the run finishes.
  useEffect(() => {
    if (!live || run.running || run.status === "idle") return;
    const p = live;
    setLive(null);
    const turn: AskTurn = {
      ...p,
      answer: run.text.main ?? "",
      citations: (run.data.citations as Citation[]) ?? [],
      withheld: run.data.withheld ?? [],
      followups: run.data.followups ?? [],
      ms: run.ms ?? (run.startedAt ? Date.now() - run.startedAt : undefined),
      model: run.model,
      error: run.status === "error" ? run.error : undefined,
    };
    setTurns((t) => [...t, turn]);
    setActive(turn.id);
    if (run.status === "done" && turn.answer) onAnswered(turn.ms ?? 0);
  }, [live, run.running, run.status, run.text.main, run.data, run.ms, run.model, run.error, run.startedAt, onAnswered]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 240) el.scrollTop = el.scrollHeight;
  }, [run.text.main, turns.length]);

  function ask(q: string) {
    const question = q.trim();
    if (!question || run.running) return;
    const history = turns
      .filter((t) => !t.error && t.answer)
      .slice(-3)
      .flatMap((t) => [
        { role: "user" as const, content: t.q },
        { role: "assistant" as const, content: t.answer },
      ]);
    setLive({
      id: `T${Date.now()}`,
      q: question,
      role,
      scope,
      attachmentName: att.attachment?.name,
    });
    setActive(null);
    setHighlight(null);
    setInput("");
    run.start("/api/solutions/01-ai-workspace/ask", { question, history, role, scope, attachment: att.attachment });
  }

  const activeTurn = active ? turns.find((t) => t.id === active) : undefined;
  const sideCitations: Citation[] = live ? ((run.data.citations as Citation[]) ?? []) : (activeTurn?.citations ?? []);
  const sideWithheld = live ? (run.data.withheld ?? []) : (activeTurn?.withheld ?? []);
  const sideText = live ? (run.text.main ?? "") : (activeTurn?.answer ?? "");
  const empty = turns.length === 0 && !live;

  return (
    <Workbench cols="minmax(0,1fr) 390px">
      <Pane
        title={L({ en: "Ask the Authority's knowledge", ar: "اسأل معرفة الهيئة" })}
        subtitle={
          turns.length
            ? L({ en: `${turns.length} answer${turns.length > 1 ? "s" : ""} in this conversation`, ar: `${turns.length} إجابات في هذه المحادثة` })
            : undefined
        }
        actions={
          turns.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => {
                run.reset();
                setLive(null);
                setTurns([]);
                setActive(null);
              }}
            >
              <MessageSquarePlus /> {L({ en: "New conversation", ar: "محادثة جديدة" })}
            </Button>
          )
        }
        flush
        bodyClassName="flex flex-col"
      >
        <div ref={scroller} className="scrollbar-thin h-[600px] overflow-y-auto px-5 py-4">
          {empty && (
            <div className="mx-auto max-w-2xl pt-6">
              <div className="flex items-center gap-2 text-ai">
                <Sparkles className="size-4" strokeWidth={1.75} />
                <span className="label-caps !text-ai">{L({ en: "Private copilot", ar: "مساعد خاص" })}</span>
              </div>
              <h2 className="display-title mt-2 text-[26px] leading-tight">
                {L({ en: "Ask anything the Authority has written down.", ar: "اسأل عن أي شيء دوّنته الهيئة." })}
              </h2>
              <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
                {L({
                  en: "Circulars, service guides, the building code, policies, HR and IT procedures and performance reports — every answer is sourced, and only from documents your role may read.",
                  ar: "التعاميم وأدلة الخدمات وكود البناء والسياسات وإجراءات الموارد البشرية وتقنية المعلومات وتقارير الأداء — كل إجابة موثقة بمصادرها، ومن المستندات المسموح لدورك بالاطلاع عليها فقط.",
                })}
              </p>
              <div className="mt-6 grid grid-cols-2 gap-2 max-md:grid-cols-1">
                {STARTERS.map((s) => (
                  <button
                    key={s.en}
                    type="button"
                    onClick={() => ask(lang === "ar" ? s.ar : s.en)}
                    className="group rounded-md border border-border bg-surface p-3 text-start transition-colors hover:border-ai/40 hover:bg-ai-soft/40"
                  >
                    <span className="label-caps !text-[9.5px]">{L(s.tag)}</span>
                    <span className="mt-1 block text-[13px] leading-snug" dir="auto">
                      {lang === "ar" ? s.ar : s.en}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-7">
            {turns.map((t, i) => (
              <TurnView
                key={t.id}
                turn={t}
                active={t.id === active}
                onSelect={() => setActive(t.id)}
                onCite={(n) => {
                  setActive(t.id);
                  setHighlight(n);
                  document.getElementById(`src-${n}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
                }}
                onFollow={i === turns.length - 1 && !live ? ask : undefined}
              />
            ))}
            {live && (
              <TurnView
                turn={{
                  ...live,
                  answer: run.text.main ?? "",
                  citations: (run.data.citations as Citation[]) ?? [],
                  withheld: run.data.withheld ?? [],
                  followups: [],
                  error: run.status === "error" ? run.error : undefined,
                }}
                streaming={run.running}
                active
                onCite={(n) => setHighlight(n)}
              />
            )}
          </div>
        </div>

        <div className="border-t border-border p-3">
          <AttachmentSlot state={att} className="mb-2" />
          <div className="flex items-end gap-2 rounded-lg border border-border-strong bg-card p-1.5 focus-within:border-ai/50">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  ask(input);
                }
              }}
              dir="auto"
              rows={2}
              placeholder={L({
                en: "Ask in English or Arabic — e.g. “What is the fee for a fit-out permit?”",
                ar: "اسأل بالعربية أو الإنجليزية — مثال: «كم رسوم رخصة التشطيبات الداخلية؟»",
              })}
              className="min-h-[52px] resize-none border-0 bg-transparent text-[13.5px] shadow-none focus-visible:ring-0"
            />
            <Button size="icon" disabled={!input.trim() || run.running || !!att.busy} onClick={() => ask(input)} aria-label="Ask">
              <ArrowUp />
            </Button>
          </div>
          <div className="mt-1.5 flex items-center justify-between px-1 text-[10.5px] text-faint">
            <span>
              {L({ en: "Scope", ar: "النطاق" })}: {L(SCOPES.find((s) => s.key === scope)!.label)} · {L(ROLES[role].label)}
            </span>
            <span>{L({ en: "Enter to send · Shift+Enter for a new line", ar: "Enter للإرسال · Shift+Enter لسطر جديد" })}</span>
          </div>
        </div>
      </Pane>

      <Pane title={L({ en: "Trace & sources", ar: "المسار والمصادر" })} bodyClassName="scrollbar-thin max-h-[760px] overflow-y-auto">
        <AgentTrace
          run={run}
          title={L({ en: "Retrieval trace", ar: "مسار الاسترجاع" })}
          emptyHint={L({
            en: "Each question is planned in Arabic and English, searched within your access level, and answered only from the passages shown below.",
            ar: "يُخطَّط لكل سؤال بالعربية والإنجليزية، ويُبحث ضمن صلاحيتك، ويُجاب عنه من المقاطع المعروضة أدناه فقط.",
          })}
        />
        {sideWithheld.length > 0 && (
          <div className="mt-4 flex gap-2 rounded-md border border-warning/30 bg-warning-soft/60 p-2.5 text-[12px]">
            <Lock className="mt-0.5 size-3.5 shrink-0 text-warning" />
            <div>
              <div className="font-medium">
                {L({
                  en: `${sideWithheld.length} relevant document${sideWithheld.length > 1 ? "s" : ""} withheld`,
                  ar: `حُجب ${sideWithheld.length} مستند ذو صلة`,
                })}
              </div>
              <p className="mt-0.5 leading-snug text-muted-foreground">
                {L({
                  en: `Classified above this role's access (${[...new Set(sideWithheld.map((w: { classification: string }) => w.classification))].join(", ")}). Content was never sent to the model.`,
                  ar: `مصنّف بمستوى أعلى من صلاحية هذا الدور (${[...new Set(sideWithheld.map((w: { classification: string }) => w.classification))].join("، ")}). لم يُرسل محتواه إلى النموذج.`,
                })}
              </p>
            </div>
          </div>
        )}
        <div className="mt-5">
          <SectionLabel>
            {L({ en: "Sources", ar: "المصادر" })}
            {sideCitations.length > 0 && <span className="num ms-1.5 text-faint">{sideCitations.length}</span>}
          </SectionLabel>
          <SourceList citations={sideCitations} highlight={highlight} text={sideText} />
        </div>
      </Pane>
    </Workbench>
  );
}

function TurnView({
  turn,
  streaming,
  active,
  onSelect,
  onCite,
  onFollow,
}: {
  turn: AskTurn;
  streaming?: boolean;
  active?: boolean;
  onSelect?: () => void;
  onCite?: (n: number) => void;
  onFollow?: (q: string) => void;
}) {
  const L = useL();
  const { lang } = usePrefs();
  const [copied, setCopied] = useState(false);
  const r = ROLES[turn.role];
  const used = new Set(Array.from(turn.answer.matchAll(/\[(\d+)\]/g)).map((m) => Number(m[1])));
  return (
    <motion.div initial={{ opacity: 1, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} onClick={onSelect}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground text-[9.5px] font-medium text-background">
          {lang === "ar" ? r.persona.nameAr.slice(0, 1) : r.persona.name.split(" ")[0][0]}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground">{lang === "ar" ? r.persona.nameAr : r.persona.name}</span>
            <span>·</span>
            <span>{L(r.label)}</span>
            {turn.scope !== "all" && (
              <span className="rounded border border-border px-1 text-[10px]">{L(SCOPES.find((s) => s.key === turn.scope)!.label)}</span>
            )}
            {turn.attachmentName && (
              <span className="rounded border border-ai/25 bg-ai-soft px-1 text-[10px] text-ai" dir="auto">
                + {turn.attachmentName}
              </span>
            )}
          </div>
          <p className="mt-1 text-[14px] leading-snug font-medium" dir="auto">
            {turn.q}
          </p>
        </div>
      </div>

      <div
        className={cn(
          "mt-3 ms-9 rounded-lg border bg-card px-4 py-3 transition-colors",
          active ? "border-border-strong" : "border-border hover:border-border-strong",
        )}
      >
        <div className="mb-1.5 flex items-center gap-1.5">
          <span className={cn("size-1.5 rounded-full bg-ai", streaming && "animate-pulse-soft")} />
          <span className="label-caps !text-[9.5px] !text-ai">NARVO</span>
        </div>
        {turn.error ? (
          <p className="text-[12.5px] text-danger">{turn.error}</p>
        ) : turn.answer ? (
          <Markdown citations={turn.citations} onCite={onCite} streaming={streaming}>
            {turn.answer}
          </Markdown>
        ) : (
          <ThinkingLines lines={3} className="py-1" />
        )}
        {!streaming && !turn.error && turn.answer && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-[11px] text-muted-foreground">
            <span className="num">
              {L({ en: `${used.size} of ${turn.citations.length} sources cited`, ar: `${used.size} من ${turn.citations.length} مصادر مستشهد بها` })}
              {turn.ms ? ` · ${(turn.ms / 1000).toFixed(1)} ${lang === "ar" ? "ث" : "s"}` : ""}
              {turn.model ? ` · ${turn.model.split("/").pop()}` : ""}
            </span>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-muted hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(turn.answer);
                setCopied(true);
                toast.success(L({ en: "Answer copied", ar: "تم نسخ الإجابة" }));
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
              {L({ en: "Copy", ar: "نسخ" })}
            </button>
          </div>
        )}
      </div>

      {onFollow && turn.followups.length > 0 && (
        <div className="mt-3 ms-9 flex flex-wrap gap-1.5">
          {turn.followups.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => onFollow(f)}
              dir="auto"
              className="rounded-full border border-border bg-surface px-2.5 py-1 text-[12px] text-muted-foreground transition-colors hover:border-ai/40 hover:text-foreground"
            >
              {f}
            </button>
          ))}
        </div>
      )}
    </motion.div>
  );
}
