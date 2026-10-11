/* eslint-disable react-hooks/set-state-in-effect, react-hooks/purity -- effects mirror the streamed agent run (an external SSE source); Date.now() drives live wait/handle-time clocks re-rendered by useTick. */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUp,
  CalendarCheck,
  Check,
  Hand,
  Headset,
  Mic,
  PhoneOff,
  Plus,
  Sparkles,
  Ticket as TicketIcon,
  Volume2,
  VolumeX,
  ShieldCheck,
  UserRoundCheck,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { useNarvoRun } from "@/hooks/use-narvo-run";
import { useFormat, useL, usePrefs } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { ApprovalSummary, Citation } from "@/lib/ai/events";
import { Workbench, Pane } from "@/components/narvo/pane";
import { AgentTrace } from "@/components/narvo/agent-trace";
import { Markdown } from "@/components/narvo/markdown";
import { SourceList } from "@/components/narvo/sources";
import { ApprovalCard } from "@/components/narvo/approval-card";
import { EmptyState, ThinkingLines } from "@/components/narvo/empty";
import { StatusPill } from "@/components/narvo/status";
import { VoiceButton, speak, stopSpeaking } from "@/components/narvo/voice";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ConsoleData, Handoff, InboundContact, SessionAction, SessionState, Signals, TranscriptTurn } from "../_lib/types";
import { CustomerCard } from "./customer-card";
import { ChannelIcon, fmtDuration, langLabel } from "./bits";

interface Msg {
  id: string;
  role: "customer" | "assistant" | "agent" | "system";
  text: string;
  at: number;
  channel: "voice" | "chat";
  via?: "voice" | "text";
  lang?: string;
  dialect?: string | null;
  citations?: Citation[];
  actions?: SessionAction[];
  approvals?: ApprovalSummary[];
  author?: string;
  error?: boolean;
}

interface Contact {
  sessionId: string;
  channel: "voice" | "chat";
  ani: string | null;
  inboundId?: string;
  startedAt: number;
}

const uid = () => Math.random().toString(36).slice(2, 10);

function useTick(ms = 1000) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

export function LiveConsole({ data, refresh }: { data: ConsoleData; refresh: () => void }) {
  const L = useL();
  const { lang } = usePrefs();
  const run = useNarvoRun();
  const [contact, setContact] = useState<Contact | null>(null);
  const [channel, setChannel] = useState<"voice" | "chat">("chat");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [session, setSession] = useState<SessionState | null>(null);
  const [signals, setSignals] = useState<Signals[]>([]);
  const [actions, setActions] = useState<SessionAction[]>([]);
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [lastCitations, setLastCitations] = useState<Citation[]>([]);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [draft, setDraft] = useState("");
  const [handled, setHandled] = useState<Record<string, string>>({});
  const [mountedAt] = useState(() => Date.now());
  const contactRef = useRef<Contact | null>(null);
  const messagesRef = useRef<Msg[]>([]);
  const scroller = useRef<HTMLDivElement>(null);
  const handledRun = useRef<number | undefined>(undefined);
  const handoffRef = useRef<Handoff | null>(null);
  useTick(1000);

  // Latest-value refs for callbacks fired from timers and streamed events.
  useEffect(() => {
    contactRef.current = contact;
    messagesRef.current = messages;
    handoffRef.current = handoff;
  }, [contact, messages, handoff]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, run.text.main, run.text.retry, handoff?.status]);

  /* ── Streamed data from the agent route ── */
  useEffect(() => {
    if (run.data.session) setSession(run.data.session as SessionState);
  }, [run.data.session]);
  useEffect(() => {
    if (run.data.handoff) setHandoff(run.data.handoff as Handoff);
  }, [run.data.handoff]);
  useEffect(() => {
    const incoming = run.data.actions as SessionAction[] | undefined;
    if (!incoming) return;
    setActions((prev) => {
      const map = new Map(prev.map((a) => [a.id + a.kind, a]));
      for (const a of incoming) map.set(a.id + a.kind, a);
      return Array.from(map.values());
    });
  }, [run.data.actions]);
  useEffect(() => {
    const s = run.data.signals as Signals | undefined;
    if (!s) return;
    setSignals((prev) => [...prev, s]);
    setMessages((ms) => {
      const idx = [...ms].reverse().findIndex((m) => m.role === "customer");
      if (idx < 0) return ms;
      const real = ms.length - 1 - idx;
      return ms.map((m, i) => (i === real ? { ...m, lang: s.language, dialect: s.dialect } : m));
    });
  }, [run.data.signals]);

  /* ── Turn completed ── */
  useEffect(() => {
    if (run.status !== "done" && run.status !== "error") return;
    if (!run.startedAt || handledRun.current === run.startedAt) return;
    handledRun.current = run.startedAt;
    if (run.status === "error") {
      setMessages((ms) => [
        ...ms,
        { id: uid(), role: "system", text: run.error ?? "Error", at: Date.now(), channel: contactRef.current?.channel ?? "chat", error: true },
      ]);
      return;
    }
    const turn = run.data.turn as { final?: string; citations?: Citation[] } | undefined;
    const text = (turn?.final || run.text.retry || run.text.main || "").trim();
    const cites = (run.data.citations as Citation[] | undefined) ?? turn?.citations ?? [];
    setLastCitations(cites);
    if (text) {
      setMessages((ms) => [
        ...ms,
        {
          id: uid(),
          role: "assistant",
          text,
          at: Date.now(),
          channel: contactRef.current?.channel ?? "chat",
          citations: cites,
          actions: (run.data.actions as SessionAction[] | undefined)?.filter((a) => a.kind !== "verification") ?? [],
          approvals: run.approvals,
        },
      ]);
      if (autoSpeak && contactRef.current?.channel === "voice") {
        setSpeaking(true);
        speak(text, /[؀-ۿ]/.test(text) ? "ar" : "en", () => setSpeaking(false));
      }
    }
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.status]);

  /* ── After handoff: the human agent's replies appear in the same conversation ── */
  useEffect(() => {
    if (!handoff || handoff.status === "resolved") return;
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/solutions/07-contact-operations/handoffs/${handoff.id}`, { cache: "no-store" });
        if (!res.ok) return;
        const h = (await res.json()) as Handoff;
        setHandoff(h);
        const fresh = h.transcript.filter((tt) => (tt.role === "agent" || tt.role === "system") && tt.at);
        setMessages((ms) => {
          const ids = new Set(ms.map((m) => m.id));
          const add = fresh
            .filter((tt) => !ids.has(`ho-${tt.at}-${tt.role}`))
            .map<Msg>((tt) => ({
              id: `ho-${tt.at}-${tt.role}`,
              role: tt.role as Msg["role"],
              text: tt.text,
              at: Date.parse(tt.at!),
              channel: contactRef.current?.channel ?? "chat",
              author: tt.author,
            }));
          return add.length ? [...ms, ...add] : ms;
        });
        if (h.status === "resolved") refresh();
      } catch {}
    }, 2500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handoff?.id, handoff?.status, refresh]);

  /* ── Sending ── */
  const send = useCallback(
    async (text: string, via: "voice" | "text", c: Contact | null = contactRef.current) => {
      const body = text.trim();
      if (!body || !c) return;
      stopSpeaking();
      setSpeaking(false);
      const msg: Msg = { id: uid(), role: "customer", text: body, at: Date.now(), channel: c.channel, via };
      const next = [...messagesRef.current, msg];
      messagesRef.current = next;
      setMessages(next);
      setDraft("");

      const ho = handoffRef.current;
      if (ho && ho.status !== "resolved") {
        await fetch(`/api/solutions/07-contact-operations/handoffs/${ho.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "customer", text: body }),
        });
        return;
      }
      const transcript: TranscriptTurn[] = next
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role, text: m.text, at: new Date(m.at).toISOString(), channel: m.channel, author: m.author }));
      run.start("/api/solutions/07-contact-operations/chat", { sessionId: c.sessionId, channel: c.channel, ani: c.ani, transcript });
    },
    [run],
  );

  function begin(opts: { channel: "voice" | "chat"; ani: string | null; inbound?: InboundContact }) {
    stopSpeaking();
    run.reset();
    const c: Contact = { sessionId: `S-${Date.now().toString(36)}-${uid()}`, channel: opts.channel, ani: opts.ani, inboundId: opts.inbound?.id, startedAt: Date.now() };
    contactRef.current = c;
    messagesRef.current = [];
    handoffRef.current = null;
    setContact(c);
    setChannel(opts.channel);
    setMessages([]);
    setSession(null);
    setSignals([]);
    setActions([]);
    setHandoff(null);
    setLastCitations([]);
    handledRun.current = undefined;
    if (opts.inbound) {
      setHandled((h) => ({ ...h, [opts.inbound!.id]: c.sessionId }));
      void send(opts.inbound.firstMessage, opts.inbound.channel === "voice" ? "voice" : "text", c);
    }
  }

  async function endContact() {
    const c = contactRef.current;
    stopSpeaking();
    if (c && session?.conversationId) {
      await fetch("/api/solutions/07-contact-operations/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: c.sessionId }),
      }).catch(() => {});
      toast.success(L({ en: "Contact closed and logged", ar: "أُغلق الاتصال وسُجّل" }), { description: session.conversationId });
    }
    setContact(null);
    setMessages([]);
    setSession(null);
    setHandoff(null);
    setActions([]);
    setSignals([]);
    run.reset();
    refresh();
  }

  function switchChannel(v: "voice" | "chat") {
    if (!v || v === channel) return;
    setChannel(v);
    if (contact) {
      const c = { ...contact, channel: v };
      contactRef.current = c;
      setContact(c);
      setMessages((ms) => [
        ...ms,
        {
          id: uid(),
          role: "system",
          text:
            v === "voice"
              ? L({ en: "Customer moved from WhatsApp to a voice call — context carried over", ar: "انتقل المتعامل من واتساب إلى مكالمة صوتية — مع الاحتفاظ بالسياق" })
              : L({ en: "Customer moved from the call to WhatsApp — context carried over", ar: "انتقل المتعامل من المكالمة إلى واتساب — مع الاحتفاظ بالسياق" }),
          at: Date.now(),
          channel: v,
        },
      ]);
    }
  }

  const customer = session?.customerId ? data.customers.find((x) => x.id === session.customerId) : undefined;
  const ani = contact?.ani ?? null;
  const aniCustomer = ani ? data.customers.find((x) => x.mobile.replace(/\D/g, "").endsWith(ani.replace(/\D/g, "").slice(-9))) : undefined;
  const latestSignals = signals.at(-1) ?? null;
  const elapsed = contact ? Math.round((Date.now() - contact.startedAt) / 1000) : 0;
  const humanActive = handoff && handoff.status !== "resolved";

  /* Presenter hints: what the customer might say next (they play the customer). */
  const hints = useMemo(() => {
    if (!contact) return [] as string[];
    const firstText = messages.find((m) => m.role === "customer")?.text ?? "";
    const convAr = /[؀-ۿ]/.test(firstText);
    // Withheld number: the presenter plays a registered customer (an Al Waha housing applicant in the caller's language).
    const fallback = !contact.ani
      ? data.customers.find((c) => c.housingCaseIds.length && c.district?.startsWith("MN-04") && c.preferredLanguage === (convAr ? "ar" : "en"))
      : undefined;
    const target = customer ?? aniCustomer ?? fallback;
    const arabic = (target?.preferredLanguage ?? (convAr ? "ar" : "en")) === "ar";
    const out: string[] = [];
    if (target && session?.level !== "verified") {
      if (!contact.ani && target.dateOfBirth && session?.level !== "partial") {
        const dob = new Date(`${target.dateOfBirth}T00:00:00Z`).toLocaleDateString(arabic ? "ar-AE-u-nu-latn" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
        const ref = target.housingCaseIds[0] ?? target.permitIds[0] ?? "";
        out.push(
          arabic
            ? `رقم هويتي ${target.emiratesId}، ورقم الطلب ${ref}، وتاريخ ميلادي ${dob}`
            : `My Emirates ID is ${target.emiratesId}, application ${ref}, date of birth ${dob}`,
        );
      } else out.push(arabic ? `رقم هويتي ${target.emiratesId}` : `My Emirates ID is ${target.emiratesId}`);
    }
    if (session?.level === "verified") {
      out.push(arabic ? "أبا أحجز موعد عشان أسلّم الأوراق" : "Can you book me an appointment to hand in the documents?");
      out.push(arabic ? "أبا أكلم موظف لو سمحت" : "I'd like to speak to a person, please");
    }
    if (!messages.length) out.push(lang === "ar" ? "شو صار على طلب الإسكان مالي؟" : "What documents do I need for a housing loan?");
    return out.slice(0, 3);
  }, [contact, customer, aniCustomer, session?.level, messages, lang, data.customers]);

  return (
    <Workbench cols="272px minmax(0,1fr) 352px">
      {/* ── Queue ── */}
      <Pane
        title={L({ en: "Contact queue", ar: "قائمة الانتظار" })}
        subtitle={L({ en: "Waiting on hotline & WhatsApp", ar: "بانتظار الرد عبر الهاتف وواتساب" })}
        flush
        actions={<NewContact customers={data.customers} onStart={(c, a) => begin({ channel: c, ani: a })} />}
      >
        <ul className="divide-y divide-border">
          {data.inbound.map((it) => {
            const done = handled[it.id];
            const active = contact?.inboundId === it.id;
            const wait = it.waitingSec + Math.round((Date.now() - mountedAt) / 1000);
            return (
              <li key={it.id}>
                <button
                  type="button"
                  disabled={!!done && !active}
                  onClick={() => begin({ channel: it.channel, ani: it.ani, inbound: it })}
                  className={cn(
                    "w-full px-4 py-3 text-start transition-colors hover:bg-muted/50 disabled:cursor-default disabled:hover:bg-transparent",
                    active && "bg-ai-soft/60 hover:bg-ai-soft/60",
                    done && !active && "opacity-50",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <ChannelIcon channel={it.channel} className="text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{it.label}</span>
                    {done ? (
                      <Check className="size-3.5 text-success" />
                    ) : (
                      <span className={cn("num text-[11px]", wait > 120 ? "text-warning" : "text-muted-foreground")}>{fmtDuration(wait)}</span>
                    )}
                  </div>
                  <div className="mt-1 ps-5.5 text-[11.5px] text-muted-foreground">{L({ en: it.topic, ar: it.topicAr ?? it.topic })}</div>
                  <p className="mt-1 line-clamp-2 ps-5.5 text-[12px] leading-snug text-foreground/80" dir="auto">
                    “{it.firstMessage}”
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="border-t border-border px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
          {L({
            en: "Select a waiting contact — the assistant answers it live. You play the customer by typing or speaking.",
            ar: "اختر اتصالاً منتظراً — يرد المساعد مباشرة. أنت تؤدي دور المتعامل بالكتابة أو التحدث.",
          })}
        </div>
      </Pane>

      {/* ── Conversation ── */}
      <Pane
        title={L({ en: "Live conversation", ar: "المحادثة المباشرة" })}
        subtitle={
          contact
            ? `${contact.ani ?? L({ en: "Number withheld", ar: "رقم محجوب" })} · ${fmtDuration(elapsed)}${session?.conversationId ? ` · ${session.conversationId}` : ""}`
            : L({ en: "No active contact", ar: "لا يوجد اتصال نشط" })
        }
        bodyClassName="flex flex-col p-0"
        actions={
          <>
            <ToggleGroup
              type="single"
              size="sm"
              variant="outline"
              value={channel}
              onValueChange={(v) => switchChannel(v as "voice" | "chat")}
            >
              <ToggleGroupItem value="voice" className="gap-1.5 px-2.5 text-[12px]">
                <ChannelIcon channel="voice" />
                {L({ en: "Voice", ar: "صوت" })}
              </ToggleGroupItem>
              <ToggleGroupItem value="chat" className="gap-1.5 px-2.5 text-[12px]">
                <ChannelIcon channel="chat" />
                WhatsApp
              </ToggleGroupItem>
            </ToggleGroup>
            {contact && (
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={endContact}>
                <PhoneOff />
                {L({ en: "End", ar: "إنهاء" })}
              </Button>
            )}
          </>
        }
      >
        <div ref={scroller} className="scrollbar-thin h-[560px] overflow-y-auto px-4 py-4 max-lg:h-[440px]">
          {!contact ? (
            <EmptyState
              icon={<Headset className="size-4" />}
              title={L({ en: "Pick a contact from the queue", ar: "اختر اتصالاً من قائمة الانتظار" })}
              action={
                <Button size="sm" variant="outline" onClick={() => begin({ channel, ani: null })}>
                  <Plus />
                  {L({ en: "Start a blank contact", ar: "بدء اتصال جديد" })}
                </Button>
              }
            >
              {L({
                en: "Voice and WhatsApp in Arabic (including Emirati dialect) or English. The assistant verifies identity, checks live records, cites policy, books appointments, logs tickets — and hands over to a person with the full context.",
                ar: "صوت وواتساب بالعربية (بما فيها اللهجة الإماراتية) أو الإنجليزية. يتحقق المساعد من الهوية، ويراجع السجلات الحية، ويستشهد بالسياسات، ويحجز المواعيد، ويسجل البلاغات — ويحيل إلى موظف مع كامل السياق.",
              })}
            </EmptyState>
          ) : (
            <div className="space-y-3.5">
              <AnimatePresence initial={false}>
                {messages.map((m) => (
                  <MessageBubble key={m.id} m={m} onApproval={() => refresh()} />
                ))}
              </AnimatePresence>
              {run.running && (
                <motion.div initial={{ opacity: 1 }} animate={{ opacity: 1 }} className="flex justify-end">
                  <div className="w-full max-w-[80%] rounded-lg border border-ai/25 bg-card px-3.5 py-2.5">
                    <div className="mb-1 flex items-center gap-1.5 text-[10.5px] text-ai">
                      <Sparkles className="size-3" />
                      {L({ en: "AI assistant", ar: "المساعد الذكي" })}
                    </div>
                    {run.text.retry || run.text.main ? (
                      <Markdown citations={run.data.citations as Citation[] | undefined} streaming>
                        {run.text.retry || run.text.main}
                      </Markdown>
                    ) : (
                      <ThinkingLines lines={2} />
                    )}
                    {run.approvals.map((a) => (
                      <ApprovalCard key={a.id} approval={a} className="mt-2.5" onDecided={(st) => { run.markApproval(a.id, st); refresh(); }} />
                    ))}
                  </div>
                </motion.div>
              )}
              {humanActive && (
                <div className="flex items-center justify-center gap-2 py-1 text-[11.5px] text-info">
                  <UserRoundCheck className="size-3.5" />
                  {handoff!.status === "waiting"
                    ? L({ en: `Waiting for a Customer Happiness agent · ${handoff!.id}`, ar: `بانتظار موظف إسعاد المتعاملين · ${handoff!.id}` })
                    : L({ en: `${handoff!.assignedTo} is handling this conversation`, ar: `${handoff!.assignedTo} يتولى هذه المحادثة` })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Composer */}
        {contact && (
          <div className="border-t border-border p-3">
            {channel === "voice" ? (
              <div className="flex items-center gap-4">
                <VoiceButton
                  size="lg"
                  disabled={run.running}
                  onTranscript={(t) => (t.text ? send(t.text, "voice") : toast.error(L({ en: "Nothing was heard", ar: "لم يُسمع شيء" })))}
                  onError={(e) => toast.error(e)}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[12px]">
                    <span className={cn("size-2 rounded-full", run.running ? "animate-pulse-soft bg-ai" : speaking ? "bg-success" : "bg-faint")} />
                    {run.running
                      ? L({ en: "Assistant is working…", ar: "المساعد يعمل…" })
                      : speaking
                        ? L({ en: "Assistant speaking", ar: "المساعد يتحدث" })
                        : humanActive
                          ? L({ en: "Connected to a human agent", ar: "متصل بموظف" })
                          : L({ en: "Line open — tap the microphone and speak", ar: "الخط مفتوح — اضغط الميكروفون وتحدث" })}
                    {speaking && (
                      <button type="button" className="text-muted-foreground underline underline-offset-2" onClick={() => { stopSpeaking(); setSpeaking(false); }}>
                        {L({ en: "stop", ar: "إيقاف" })}
                      </button>
                    )}
                  </div>
                  <Composer draft={draft} setDraft={setDraft} disabled={run.running} onSend={() => send(draft, "text")} compact
                    placeholder={L({ en: "…or type what the caller says", ar: "…أو اكتب ما يقوله المتصل" })} />
                </div>
              </div>
            ) : (
              <div className="flex items-end gap-2">
                <Composer draft={draft} setDraft={setDraft} disabled={run.running} onSend={() => send(draft, "text")}
                  placeholder={L({ en: "Type as the customer — Arabic, dialect or English", ar: "اكتب كمتعامل — بالعربية أو اللهجة أو الإنجليزية" })} />
                <VoiceButton size="md" disabled={run.running} className="shrink-0 [&>span]:hidden" onTranscript={(t) => t.text && send(t.text, "voice")} onError={(e) => toast.error(e)} />
              </div>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {hints.map((h) => (
                <button
                  key={h}
                  type="button"
                  disabled={run.running}
                  onClick={() => send(h, channel === "voice" ? "voice" : "text")}
                  className="max-w-full truncate rounded-full border border-border bg-surface px-2.5 py-1 text-[11.5px] text-muted-foreground transition-colors hover:border-ai/40 hover:text-foreground disabled:opacity-50"
                  dir="auto"
                >
                  {h}
                </button>
              ))}
              <label className="ms-auto flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                {autoSpeak ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
                {L({ en: "Speak replies on calls", ar: "قراءة الردود في المكالمات" })}
                <Switch checked={autoSpeak} onCheckedChange={setAutoSpeak} />
              </label>
            </div>
          </div>
        )}
      </Pane>

      {/* ── Right rail ── */}
      <div className="flex min-w-0 flex-col gap-4">
        <Pane title={L({ en: "Customer context", ar: "سياق المتعامل" })}>
          {contact ? (
            <CustomerCard
              data={data}
              customerId={session?.customerId ?? null}
              session={session ?? { sessionId: "", channel, ani, customerId: null, factors: [], level: "none", startedAt: "" }}
              signals={latestSignals}
              sentimentHistory={signals.map((s) => s.sentiment)}
              ani={ani}
            />
          ) : (
            <p className="text-[12px] text-muted-foreground">
              {L({ en: "Identity, verification, open records, previous contacts and sentiment appear here.", ar: "تظهر هنا الهوية والتحقق والسجلات المفتوحة والاتصالات السابقة والمشاعر." })}
            </p>
          )}
        </Pane>

        <Pane title={L({ en: "Actions this contact", ar: "إجراءات هذا الاتصال" })}>
          <ActionsList actions={actions} handoff={handoff} />
        </Pane>

        <Pane>
          <AgentTrace run={run} emptyHint={L({ en: "Each turn shows the tools the assistant uses — verification, records, knowledge, booking, ticketing, handoff.", ar: "يظهر في كل رد الأدوات التي يستخدمها المساعد — التحقق والسجلات والمعرفة والحجز والبلاغات والإحالة." })} />
          {lastCitations.length > 0 && (
            <div className="mt-4">
              <div className="label-caps mb-2">{L({ en: "Sources cited", ar: "المصادر المستشهد بها" })}</div>
              <SourceList citations={lastCitations} usedOnly text={messages.filter((m) => m.role === "assistant").at(-1)?.text} />
            </div>
          )}
        </Pane>
      </div>
    </Workbench>
  );
}

function Composer({
  draft,
  setDraft,
  onSend,
  disabled,
  placeholder,
  compact,
}: {
  draft: string;
  setDraft: (s: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("relative flex-1", compact && "mt-2")}>
      <Textarea
        value={draft}
        dir="auto"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (!disabled) onSend();
          }
        }}
        placeholder={placeholder}
        className={cn("resize-none bg-surface pe-11 text-[13px]", compact ? "min-h-9 py-2" : "min-h-11")}
        rows={1}
      />
      <Button
        size="icon-sm"
        className="absolute end-1.5 bottom-1.5"
        disabled={disabled || !draft.trim()}
        onClick={onSend}
        aria-label="Send"
      >
        <ArrowUp />
      </Button>
    </div>
  );
}

function MessageBubble({ m, onApproval }: { m: Msg; onApproval: () => void }) {
  const L = useL();
  const f = useFormat();
  const [approvals, setApprovals] = useState(m.approvals ?? []);
  if (m.role === "system")
    return (
      <motion.div initial={{ opacity: 1 }} animate={{ opacity: 1 }} className="flex justify-center">
        <span className={cn("rounded-full px-3 py-1 text-[11px]", m.error ? "bg-danger-soft text-danger" : "bg-muted text-muted-foreground")}>{m.text}</span>
      </motion.div>
    );
  const mine = m.role !== "customer";
  return (
    <motion.div
      initial={{ opacity: 1, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn("flex", mine ? "justify-end" : "justify-start")}
    >
      <div className={cn("max-w-[80%] min-w-0")}>
        <div
          className={cn(
            "rounded-lg px-3.5 py-2.5",
            m.role === "customer" && "bg-muted text-foreground",
            m.role === "assistant" && "border border-border bg-card",
            m.role === "agent" && "border border-info/20 bg-info-soft",
          )}
        >
          {m.role === "assistant" && (
            <div className="mb-1 flex items-center gap-1.5 text-[10.5px] text-ai">
              <Sparkles className="size-3" />
              {L({ en: "AI assistant", ar: "المساعد الذكي" })}
            </div>
          )}
          {m.role === "agent" && (
            <div className="mb-1 flex items-center gap-1.5 text-[10.5px] text-info">
              <UserRoundCheck className="size-3" />
              {m.author}
            </div>
          )}
          {m.role === "customer" ? (
            <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap" dir="auto">
              {m.text}
            </p>
          ) : (
            <Markdown citations={m.citations}>{m.text}</Markdown>
          )}
          {!!m.actions?.length && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {m.actions.map((a) => (
                <StatusPill key={a.kind + a.id} tone={a.status === "done" ? "success" : a.status === "awaiting_approval" ? "warning" : "info"}>
                  <span className="font-mono text-[10px]">{a.id}</span>
                </StatusPill>
              ))}
            </div>
          )}
          {approvals.map((a) => (
            <ApprovalCard
              key={a.id}
              approval={a}
              className="mt-2.5"
              onDecided={(st) => {
                setApprovals((xs) => xs.map((x) => (x.id === a.id ? { ...x, status: st } : x)));
                onApproval();
              }}
            />
          ))}
        </div>
        <div className={cn("mt-1 flex items-center gap-1.5 px-1 text-[10.5px] text-faint", mine && "justify-end")}>
          <ChannelIcon channel={m.channel} className="size-3" />
          <span className="num">{f.time(m.at)}</span>
          {m.via === "voice" && (
            <>
              <span>·</span>
              <Mic className="size-3" />
              {L({ en: "transcribed", ar: "مفرّغ صوتياً" })}
            </>
          )}
          {m.lang && (
            <>
              <span>·</span>
              <span className="text-ai">{langLabel(m.lang, m.dialect)}</span>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function ActionsList({ actions, handoff }: { actions: SessionAction[]; handoff: Handoff | null }) {
  const L = useL();
  const f = useFormat();
  if (!actions.length && !handoff)
    return (
      <p className="text-[12px] text-muted-foreground">
        {L({
          en: "Permitted actions run immediately (appointments, tickets). Refunds and exceptions wait for the CHC Manager.",
          ar: "تُنفذ الإجراءات المسموح بها فوراً (المواعيد والبلاغات). أما المبالغ المستردة والاستثناءات فتنتظر اعتماد مديرة المركز.",
        })}
      </p>
    );
  const icon = (k: SessionAction["kind"]) =>
    k === "appointment" ? <CalendarCheck className="size-3.5" /> : k === "ticket" ? <TicketIcon className="size-3.5" /> : k === "handoff" ? <Hand className="size-3.5" /> : k === "verification" ? <ShieldCheck className="size-3.5" /> : <Undo2 className="size-3.5" />;
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {actions.map((a) => (
          <li key={a.kind + a.id} className="flex items-start gap-2.5">
            <span
              className={cn(
                "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
                a.status === "done" ? "bg-success-soft text-success" : a.status === "awaiting_approval" ? "bg-warning-soft text-warning" : "bg-info-soft text-info",
              )}
            >
              {icon(a.kind)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12.5px] font-medium capitalize">
                  {L(
                    a.kind === "appointment"
                      ? { en: "Appointment booked", ar: "تم حجز موعد" }
                      : a.kind === "ticket"
                        ? { en: "Ticket logged", ar: "تم تسجيل بلاغ" }
                        : a.kind === "handoff"
                          ? { en: "Handed to agent", ar: "أحيل إلى موظف" }
                          : a.kind === "verification"
                            ? { en: "Identity check", ar: "التحقق من الهوية" }
                            : { en: "Exception requested", ar: "طلب استثناء" },
                  )}
                </span>
                <span className="num text-[10.5px] text-faint">{f.time(a.at)}</span>
              </div>
              <div className="text-[11.5px] text-muted-foreground" dir="auto">
                {a.kind !== "verification" && <span className="font-mono text-[10.5px] text-foreground/80">{a.id} · </span>}
                {a.label}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {handoff && (
        <div className="rounded-md border border-info/25 bg-info-soft/50 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="label-caps !text-[9.5px]">{L({ en: "Handoff", ar: "الإحالة" })}</span>
            <StatusPill tone={handoff.status === "resolved" ? "success" : handoff.status === "in_progress" ? "info" : "warning"}>
              {L(
                handoff.status === "waiting"
                  ? { en: "Waiting", ar: "بالانتظار" }
                  : handoff.status === "in_progress"
                    ? { en: "With agent", ar: "مع الموظف" }
                    : { en: "Resolved", ar: "تم الحل" },
              )}
            </StatusPill>
          </div>
          <div className="mt-1.5 text-[12.5px] font-medium">{handoff.intent}</div>
          <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">{handoff.summary}</p>
          <div className="mt-2 text-[11.5px]">
            <span className="text-muted-foreground">{L({ en: "Suggested next step", ar: "الخطوة المقترحة" })}: </span>
            {handoff.suggestedNextStep}
          </div>
          <div className="mt-2 font-mono text-[10.5px] text-faint">
            {handoff.id} · {L({ en: "context passed to the Agent desk", ar: "نُقل السياق إلى مكتب الموظفين" })}
          </div>
        </div>
      )}
    </div>
  );
}

function NewContact({ customers, onStart }: { customers: ConsoleData["customers"]; onStart: (c: "voice" | "chat", ani: string | null) => void }) {
  const L = useL();
  const [open, setOpen] = useState(false);
  const [ch, setCh] = useState<"voice" | "chat">("voice");
  const [who, setWho] = useState<string>("withheld");
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="New contact">
          <Plus />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3 p-3">
        <div className="label-caps">{L({ en: "New inbound contact", ar: "اتصال وارد جديد" })}</div>
        <ToggleGroup type="single" variant="outline" size="sm" value={ch} onValueChange={(v) => v && setCh(v as "voice" | "chat")} className="w-full">
          <ToggleGroupItem value="voice" className="flex-1 gap-1.5 text-[12px]">
            <ChannelIcon channel="voice" />
            {L({ en: "Call", ar: "مكالمة" })}
          </ToggleGroupItem>
          <ToggleGroupItem value="chat" className="flex-1 gap-1.5 text-[12px]">
            <ChannelIcon channel="chat" />
            WhatsApp
          </ToggleGroupItem>
        </ToggleGroup>
        <Select value={who} onValueChange={setWho}>
          <SelectTrigger className="w-full text-[12.5px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="withheld">{L({ en: "Number withheld / unregistered", ar: "رقم محجوب / غير مسجل" })}</SelectItem>
            {customers.map((c) => (
              <SelectItem key={c.id} value={c.mobile}>
                <span className="num">{c.mobile}</span> · {c.name.split(" ")[0]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          className="w-full"
          onClick={() => {
            onStart(ch, who === "withheld" ? null : who);
            setOpen(false);
          }}
        >
          {L({ en: "Answer contact", ar: "الرد على الاتصال" })}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
