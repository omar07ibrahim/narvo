/* eslint-disable react-hooks/set-state-in-effect, react-hooks/purity -- effects follow the polled handoff and the streamed suggestion run; Date.now() renders waiting times. */
"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, CheckCheck, ClipboardList, Hand, Inbox, LoaderCircle, Sparkles, UserRoundCheck, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { useNarvoRun } from "@/hooks/use-narvo-run";
import { useFormat, useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Citation } from "@/lib/ai/events";
import { Workbench, Pane, SectionLabel } from "@/components/narvo/pane";
import { AgentTrace } from "@/components/narvo/agent-trace";
import { Markdown } from "@/components/narvo/markdown";
import { SourceList } from "@/components/narvo/sources";
import { EmptyState, ThinkingLines } from "@/components/narvo/empty";
import { StatusPill } from "@/components/narvo/status";
import { RunButton } from "@/components/narvo/run-button";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ConsoleData, Handoff } from "../_lib/types";
import { CustomerCard } from "./customer-card";
import { ChannelIcon, channelLabel, fmtDuration } from "./bits";

const AGENT_NAME = "Aisha Salem Al Rumaithi";

/** Measured score (per-turn classifier) wins over the label written in the handoff. */
const sentimentOf = (h: Handoff) =>
  h.sentimentScore == null ? h.sentiment : h.sentimentScore <= -0.25 ? "negative" : h.sentimentScore >= 0.3 ? "positive" : "neutral";

export function AgentDesk({ data, refresh }: { data: ConsoleData; refresh: () => void }) {
  const L = useL();
  const f = useFormat();
  const suggest = useNarvoRun();
  const [selected, setSelected] = useState<string | null>(null);
  const [live, setLive] = useState<Handoff | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [outcome, setOutcome] = useState("resolved");
  const [note, setNote] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  const list = data.handoffs;
  const order = { waiting: 0, in_progress: 1, resolved: 2 } as const;
  const sorted = [...list].sort((a, b) => order[a.status] - order[b.status] || Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const current = selected ? (live?.id === selected ? live : list.find((h) => h.id === selected)) : undefined;

  useEffect(() => {
    if (!selected && sorted[0]) setSelected(sorted[0].id);
  }, [selected, sorted]);

  useEffect(() => {
    setLive(null);
    setDraft("");
    suggest.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // Keep the open conversation live (customer messages typed in the Live console appear here).
  useEffect(() => {
    if (!selected || current?.status === "resolved") return;
    const t = setInterval(async () => {
      const res = await fetch(`/api/solutions/07-contact-operations/handoffs/${selected}`, { cache: "no-store" });
      if (res.ok) setLive(await res.json());
    }, 3000);
    return () => clearInterval(t);
  }, [selected, current?.status]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [current?.transcript.length]);

  useEffect(() => {
    // Citation markers stay in the agent's view (with sources); the customer receives clean text.
    if (suggest.status === "done" && suggest.text.suggest) setDraft(suggest.text.suggest.replace(/\s*\[\d+\]/g, "").trim());
  }, [suggest.status, suggest.text.suggest]);

  async function act(action: "take" | "reply" | "resolve", extra: Record<string, unknown> = {}) {
    if (!current) return;
    setBusy(action);
    try {
      const res = await fetch(`/api/solutions/07-contact-operations/handoffs/${current.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      if (!res.ok) throw new Error(await res.text());
      setLive(await res.json());
      if (action === "reply") setDraft("");
      if (action === "resolve") {
        setResolveOpen(false);
        toast.success(L({ en: "Handoff resolved and recorded in the audit trail", ar: "تم حل الإحالة وتسجيلها في سجل التدقيق" }), { description: current.id });
      }
      if (action === "take") toast.success(L({ en: "You are now handling this customer", ar: "أنت الآن تتولى هذا المتعامل" }));
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const waiting = list.filter((h) => h.status === "waiting").length;

  return (
    <Workbench cols="300px minmax(0,1fr) 340px">
      <Pane
        title={L({ en: "Handoff queue", ar: "قائمة الإحالات" })}
        subtitle={`${waiting} ${L({ en: "waiting", ar: "بالانتظار" })} · ${list.filter((h) => h.status === "in_progress").length} ${L({ en: "in progress", ar: "قيد المعالجة" })}`}
        flush
      >
        {!sorted.length ? (
          <EmptyState icon={<Inbox className="size-4" />} title={L({ en: "No handoffs", ar: "لا توجد إحالات" })} />
        ) : (
          <ul className="scrollbar-thin max-h-[720px] divide-y divide-border overflow-y-auto">
            {sorted.map((h) => {
              const mins = Math.round((Date.now() - Date.parse(h.createdAt)) / 60000);
              return (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(h.id)}
                    className={cn("w-full px-4 py-3 text-start transition-colors hover:bg-muted/50", selected === h.id && "bg-muted/70 hover:bg-muted/70")}
                  >
                    <div className="flex items-center gap-2">
                      <ChannelIcon channel={h.channel} className="text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{h.customerName}</span>
                      {h.priority === "high" && h.status !== "resolved" && <StatusPill tone="danger" dot={false}>{L({ en: "High", ar: "عالية" })}</StatusPill>}
                    </div>
                    <div className="mt-1 line-clamp-1 text-[12px] text-foreground/80" dir="auto">{h.intent}</div>
                    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <StatusPill tone={h.status === "waiting" ? "warning" : h.status === "in_progress" ? "info" : "success"}>
                        {L(h.status === "waiting" ? { en: "Waiting", ar: "بالانتظار" } : h.status === "in_progress" ? { en: "In progress", ar: "قيد المعالجة" } : { en: "Resolved", ar: "تم الحل" })}
                      </StatusPill>
                      <span className="font-mono text-[10.5px]">{h.id}</span>
                      <span className="ms-auto num">
                        {h.status === "resolved"
                          ? f.date(h.resolution?.at ?? h.createdAt, { day: "numeric", month: "short" })
                          : mins < 90
                            ? `${mins} min`
                            : f.relative(Date.parse(h.createdAt))}
                      </span>
                    </div>
                    {h.live && <div className="mt-1 text-[10.5px] text-ai">{L({ en: "From this session's live conversation", ar: "من محادثة مباشرة في هذه الجلسة" })}</div>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Pane>

      <Pane
        title={current ? `${current.id} · ${current.customerName}` : L({ en: "Handoff", ar: "الإحالة" })}
        subtitle={
          current
            ? `${channelLabel(current.channel, L)} · ${current.language.toUpperCase()} · ${L({ en: "handed over", ar: "أحيلت" })} ${f.relative(Date.parse(current.createdAt))}`
            : undefined
        }
        bodyClassName="flex flex-col p-0"
        actions={
          current && current.status !== "resolved" ? (
            <>
              {current.status === "waiting" && (
                <Button size="sm" onClick={() => act("take")} disabled={!!busy}>
                  {busy === "take" ? <LoaderCircle className="animate-spin" /> : <Hand />}
                  {L({ en: "Take over", ar: "تولي المحادثة" })}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setResolveOpen(true)} disabled={!!busy}>
                <CheckCheck />
                {L({ en: "Resolve", ar: "حل" })}
              </Button>
            </>
          ) : undefined
        }
      >
        {!current ? (
          <EmptyState icon={<UserRoundCheck className="size-4" />} title={L({ en: "Select a handoff", ar: "اختر إحالة" })} />
        ) : (
          <>
            <div className="border-b border-border bg-surface px-4 py-3.5">
              <div className="flex items-center gap-2">
                <Sparkles className="size-3.5 text-ai" />
                <span className="label-caps !text-ai">{L({ en: "Context from the AI assistant", ar: "السياق من المساعد الذكي" })}</span>
                <StatusPill tone={sentimentOf(current) === "negative" ? "danger" : sentimentOf(current) === "positive" ? "success" : "neutral"} className="ms-auto">
                  {sentimentOf(current)}
                  {current.sentimentScore != null && <span className="num opacity-70">{current.sentimentScore.toFixed(2)}</span>}
                </StatusPill>
              </div>
              <div className="mt-2 text-[14px] font-medium" dir="auto">{current.intent}</div>
              <p className="mt-1 text-[13px] leading-relaxed text-foreground/85" dir="auto">{current.summary}</p>
              <div className="mt-3 grid grid-cols-2 gap-4 text-[12px] max-md:grid-cols-1">
                <div>
                  <SectionLabel className="!mb-1">{L({ en: "Why handed over", ar: "سبب الإحالة" })}</SectionLabel>
                  <p className="leading-snug" dir="auto">{current.reason}</p>
                  <SectionLabel className="!mb-1 mt-2.5">{L({ en: "Identity", ar: "الهوية" })}</SectionLabel>
                  <p className={cn("leading-snug", current.verified ? "text-success" : "text-warning")}>
                    {current.verified ? L({ en: "Verified", ar: "تم التحقق" }) : L({ en: "Not verified", ar: "لم يتم التحقق" })} — {current.verification}
                  </p>
                </div>
                <div>
                  <SectionLabel className="!mb-1">{L({ en: "Already tried", ar: "ما تمت تجربته" })}</SectionLabel>
                  <ul className="space-y-0.5">
                    {current.whatTried.map((w) => (
                      <li key={w} className="leading-snug text-muted-foreground" dir="auto">— {w}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="mt-3 rounded-md border border-ai/20 bg-ai-soft/60 px-3 py-2 text-[12.5px]">
                <span className="font-medium text-ai">{L({ en: "Suggested next step", ar: "الخطوة التالية المقترحة" })}: </span>
                <span dir="auto">{current.suggestedNextStep}</span>
              </div>
              {!!current.references.length && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {current.references.map((r) => (
                    <span key={r} className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10.5px]">{r}</span>
                  ))}
                </div>
              )}
            </div>

            <div ref={scroller} className="scrollbar-thin h-[330px] space-y-2.5 overflow-y-auto px-4 py-4">
              {current.transcript.map((t, i) =>
                t.role === "system" ? (
                  <div key={i} className="text-center text-[11px] text-muted-foreground">{t.text}</div>
                ) : (
                  <div key={i} className={cn("flex", t.role === "customer" ? "justify-start" : "justify-end")}>
                    <div
                      className={cn(
                        "max-w-[78%] rounded-lg px-3 py-2 text-[13px] leading-relaxed",
                        t.role === "customer" ? "bg-muted" : t.role === "agent" ? "border border-info/20 bg-info-soft" : "border border-border bg-card",
                      )}
                    >
                      <div className={cn("mb-0.5 text-[10.5px]", t.role === "assistant" ? "text-ai" : t.role === "agent" ? "text-info" : "text-muted-foreground")}>
                        {t.role === "customer" ? current.customerName.split(" ")[0] : t.role === "assistant" ? L({ en: "AI assistant", ar: "المساعد الذكي" }) : t.author}
                        {t.at && <span className="num ms-1.5 text-faint">{f.time(t.at)}</span>}
                      </div>
                      {t.role === "customer" ? <p className="whitespace-pre-wrap" dir="auto">{t.text}</p> : <Markdown>{t.text}</Markdown>}
                    </div>
                  </div>
                ),
              )}
            </div>

            {current.status !== "resolved" ? (
              <div className="border-t border-border p-3">
                {(suggest.running || suggest.text.suggest) && (
                  <div className="mb-2.5 rounded-md border border-ai/25 bg-ai-soft/40 p-2.5">
                    <div className="mb-1 flex items-center gap-1.5 text-[10.5px] text-ai">
                      <Wand2 className="size-3" />
                      {L({ en: "Suggested reply — grounded in records and policy", ar: "رد مقترح — مستند إلى السجلات والسياسات" })}
                    </div>
                    {suggest.text.suggest ? (
                      <Markdown citations={suggest.data.citations as Citation[] | undefined} streaming={suggest.running}>
                        {suggest.text.suggest}
                      </Markdown>
                    ) : (
                      <ThinkingLines lines={2} />
                    )}
                  </div>
                )}
                <div className="relative">
                  <Textarea
                    value={draft}
                    dir="auto"
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={L({ en: `Reply as ${AGENT_NAME.split(" ")[0]}…`, ar: `الرد باسم ${AGENT_NAME.split(" ")[0]}…` })}
                    className="min-h-16 resize-none bg-surface pe-11 text-[13px]"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && draft.trim()) act("reply", { text: draft });
                    }}
                  />
                  <Button size="icon-sm" className="absolute end-1.5 bottom-1.5" disabled={!draft.trim() || !!busy} onClick={() => act("reply", { text: draft })}>
                    {busy === "reply" ? <LoaderCircle className="animate-spin" /> : <ArrowUp />}
                  </Button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <RunButton
                    size="sm"
                    variant="outline"
                    running={suggest.running}
                    onRun={() => suggest.start("/api/solutions/07-contact-operations/suggest", { handoffId: current.id })}
                    onStop={suggest.abort}
                    icon={<Wand2 className="text-ai" />}
                  >
                    {L({ en: "Suggest reply", ar: "اقترح رداً" })}
                  </RunButton>
                  <span className="text-[11px] text-muted-foreground">
                    {L({ en: "The agent edits and sends — the AI never sends on the agent's behalf.", ar: "الموظف يعدّل ويرسل — الذكاء الاصطناعي لا يرسل نيابة عنه." })}
                  </span>
                </div>
              </div>
            ) : (
              <div className="border-t border-border bg-success-soft/50 px-4 py-3 text-[12.5px]">
                <div className="flex items-center gap-1.5 font-medium text-success">
                  <CheckCheck className="size-4" />
                  {L({ en: "Resolved", ar: "تم الحل" })} · {current.resolution?.outcome.replace(/_/g, " ")}
                </div>
                {current.resolution?.note && <p className="mt-1 text-muted-foreground" dir="auto">{current.resolution.note}</p>}
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {current.resolution?.by} · {current.resolution?.at && f.date(current.resolution.at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  {current.takenAt && ` · ${L({ en: "wait", ar: "الانتظار" })} ${fmtDuration(Math.max(0, (Date.parse(current.takenAt) - Date.parse(current.createdAt)) / 1000))}`}
                </div>
              </div>
            )}
          </>
        )}
      </Pane>

      <div className="flex min-w-0 flex-col gap-4">
        <Pane title={L({ en: "Customer", ar: "المتعامل" })}>
          {current ? (
            <CustomerCard
              data={data}
              customerId={current.customerId}
              session={{ sessionId: "", channel: "chat", ani: null, customerId: current.customerId, factors: current.verified ? ["registered_mobile", "emirates_id"] : [], level: current.verified ? "verified" : "none", startedAt: "" }}
              compact
            />
          ) : (
            <p className="text-[12px] text-muted-foreground">—</p>
          )}
        </Pane>
        <Pane>
          <AgentTrace
            run={suggest}
            title={L({ en: "Agent assist", ar: "مساعدة الموظف" })}
            emptyHint={L({ en: "Ask for a suggested reply: the assistant reads the customer's live records and policy, then drafts a reply you can edit.", ar: "اطلب رداً مقترحاً: يقرأ المساعد سجلات المتعامل والسياسات ثم يصوغ رداً قابلاً للتعديل." })}
          />
          {!!(suggest.data.citations as Citation[] | undefined)?.length && (
            <div className="mt-4">
              <div className="label-caps mb-2 flex items-center gap-1.5">
                <ClipboardList className="size-3" />
                {L({ en: "Policy used", ar: "السياسات المستخدمة" })}
              </div>
              <SourceList citations={suggest.data.citations as Citation[]} usedOnly text={suggest.text.suggest} />
            </div>
          )}
        </Pane>
      </div>

      <Dialog open={resolveOpen} onOpenChange={setResolveOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle className="text-base font-medium">{L({ en: "Resolve handoff", ar: "حل الإحالة" })} · {current?.id}</DialogTitle>
          <div className="space-y-3">
            <Select value={outcome} onValueChange={setOutcome}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="resolved">{L({ en: "Resolved with the customer", ar: "تم الحل مع المتعامل" })}</SelectItem>
                <SelectItem value="escalated">{L({ en: "Escalated to the service department", ar: "رُفعت إلى الإدارة المختصة" })}</SelectItem>
                <SelectItem value="callback_scheduled">{L({ en: "Call-back scheduled", ar: "جُدول اتصال لاحق" })}</SelectItem>
              </SelectContent>
            </Select>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={L({ en: "Resolution note for the record…", ar: "ملاحظة الحل للسجل…" })} className="min-h-20" dir="auto" />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setResolveOpen(false)}>
                {L({ en: "Cancel", ar: "إلغاء" })}
              </Button>
              <Button onClick={() => act("resolve", { outcome, note })} disabled={!!busy}>
                {busy === "resolve" ? <LoaderCircle className="animate-spin" /> : <CheckCheck />}
                {L({ en: "Resolve & record", ar: "حل وتسجيل" })}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Workbench>
  );
}
