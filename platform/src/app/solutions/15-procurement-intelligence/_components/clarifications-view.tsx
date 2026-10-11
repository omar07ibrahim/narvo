"use client";

import { useState } from "react";
import { Inbox, MailQuestion, Send } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { RunButton } from "@/components/narvo/run-button";
import { StatusPill } from "@/components/narvo/status";
import { ApprovalCard } from "@/components/narvo/approval-card";
import { ThinkingLines } from "@/components/narvo/empty";
import type { NarvoRun } from "@/hooks/use-narvo-run";
import { useFormat, useL } from "@/lib/i18n";
import type { ProcState, Supplier, Tender } from "../_lib/types";

export interface ReceivedResponse {
  supplierId: string;
  id: string;
  title: string;
  date: string;
  body: string;
}

export function ClarificationsView({
  tender,
  state,
  responses,
  clarRun,
  respRun,
  busySupplier,
  onDraft,
  onResponse,
  onDecided,
}: {
  tender: Tender;
  state: ProcState;
  responses: ReceivedResponse[];
  clarRun: NarvoRun;
  respRun: NarvoRun;
  busySupplier: string | null;
  onDraft: (supplierId: string) => void;
  onResponse: (supplierId: string, text: string) => void;
  onDecided: () => void;
}) {
  const L = useL();
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[12.5px] leading-relaxed text-muted-foreground">
        {L({
          en: "Questions are drafted from the evaluation gaps, exclusions and failed gates. Under Manual Art. 29 a clarification may confirm or evidence the bid — it can never change price or substance. Every request is approved by the committee chair before it is issued.",
          ar: "تُصاغ الأسئلة من فجوات التقييم والاستثناءات والشروط غير المستوفاة. وفق المادة 29 يجوز للاستيضاح تأكيد العرض أو إثباته — ولا يجوز أبداً تغيير السعر أو الجوهر. يعتمد رئيس اللجنة كل طلب قبل إصداره.",
        })}
      </p>
      {state.suppliers.map((s) => (
        <SupplierClar
          key={s.id}
          s={s}
          tender={tender}
          state={state}
          received={responses.find((r) => r.supplierId === s.id)}
          clarRun={clarRun}
          respRun={respRun}
          busy={busySupplier === s.id}
          onDraft={() => onDraft(s.id)}
          onResponse={(t) => onResponse(s.id, t)}
          onDecided={onDecided}
        />
      ))}
    </div>
  );
}

function SupplierClar({
  s,
  tender,
  state,
  received,
  clarRun,
  respRun,
  busy,
  onDraft,
  onResponse,
  onDecided,
}: {
  s: Supplier;
  tender: Tender;
  state: ProcState;
  received?: ReceivedResponse;
  clarRun: NarvoRun;
  respRun: NarvoRun;
  busy: boolean;
  onDraft: () => void;
  onResponse: (text: string) => void;
  onDecided: () => void;
}) {
  const L = useL();
  const f = useFormat();
  const [text, setText] = useState("");
  const ev = state.evaluations[s.id];
  const draft = state.drafts[s.id];
  const issued = state.clarifications.find((c) => c.supplierId === s.id);
  const approval = draft ? state.approvals.find((a) => a.id === draft.approvalId) : undefined;
  const drafting = clarRun.running && busy;
  const answering = respRun.running && busy;
  const changes = ev?.history ?? [];

  const status = issued?.status === "answered"
    ? { tone: "success" as const, t: L({ en: "Answered", ar: "أُجيب" }) }
    : issued
      ? { tone: "info" as const, t: L({ en: "Issued — awaiting response", ar: "صادر — بانتظار الرد" }) }
      : approval?.status === "pending"
        ? { tone: "warning" as const, t: L({ en: "Awaiting chair approval", ar: "بانتظار اعتماد الرئيس" }) }
        : approval?.status === "rejected"
          ? { tone: "neutral" as const, t: L({ en: "Rejected by chair", ar: "رفضه الرئيس" }) }
          : { tone: "neutral" as const, t: L({ en: "No clarification", ar: "لا يوجد استيضاح" }) };

  const questions = issued?.questions ?? draft?.questions ?? [];

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="text-[13px] font-medium">{s.name}</span>
          <StatusPill tone={status.tone}>{status.t}</StatusPill>
          {(issued?.ref ?? draft?.ref) && <span className="font-mono text-[10.5px] text-muted-foreground">{issued?.ref ?? draft?.ref}</span>}
        </div>
        {!issued && approval?.status !== "pending" && (
          <RunButton size="sm" variant="outline" running={drafting} onRun={onDraft} disabled={!ev || clarRun.running} icon={<MailQuestion />}>
            {L({ en: "Draft clarification questions", ar: "صياغة أسئلة الاستيضاح" })}
          </RunButton>
        )}
      </header>
      <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-4 p-4 max-lg:grid-cols-1">
        <div className="min-w-0">
          {drafting ? (
            <ThinkingLines lines={5} />
          ) : questions.length ? (
            <>
              {(issued?.letter ?? draft?.letter) && (
                <p className="mb-2 text-[12px] leading-relaxed text-muted-foreground" dir="auto">
                  {issued?.letter ?? draft?.letter}
                </p>
              )}
              <ol className="space-y-2">
                {questions.map((q, i) => (
                  <li key={i} className="rounded-md border border-border bg-surface px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="num text-[11px] text-faint">{i + 1}</span>
                      <span className="text-[12px] font-medium" dir="auto">
                        {q.topic}
                      </span>
                      <span className="ms-auto rounded border border-border px-1 font-mono text-[10px] text-muted-foreground">{q.ref}</span>
                    </div>
                    <p className="mt-1 text-[12.5px] leading-relaxed" dir="auto">
                      {q.question}
                    </p>
                    <p className="mt-1 text-[11px] text-faint" dir="auto">
                      {L({ en: "Committee note:", ar: "ملاحظة اللجنة:" })} {q.reason}
                    </p>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="text-[12.5px] text-muted-foreground">
              {ev
                ? L({ en: `${ev.criteria.filter((c) => c.status !== "met").length} criteria not fully evidenced · ${ev.scope.filter((x) => x.status !== "included").length} scope exclusions or unclear items.`, ar: `${ev.criteria.filter((c) => c.status !== "met").length} معايير غير مثبتة بالكامل · ${ev.scope.filter((x) => x.status !== "included").length} استثناءات أو بنود غير واضحة.` })
                : L({ en: "Evaluate the submission first.", ar: "قيّم العرض أولاً." })}
            </p>
          )}
          {approval && !issued && <ApprovalCard key={approval.id} approval={approval} className="mt-3" compact onDecided={onDecided} />}
        </div>

        <div className="min-w-0">
          {issued?.status === "issued" && (
            <div className="space-y-2">
              <div className="label-caps">{L({ en: "Supplier response", ar: "رد المورد" })}</div>
              {received && !text && (
                <button
                  type="button"
                  onClick={() => setText(received.body)}
                  className="flex w-full items-center gap-2 rounded-md border border-dashed border-border-strong px-2.5 py-2 text-start text-[11.5px] text-muted-foreground hover:border-ai/50 hover:text-foreground"
                >
                  <Inbox className="size-3.5 shrink-0" />
                  <span className="min-w-0 truncate">
                    {L({ en: "Load response received via Supplier Portal", ar: "تحميل الرد الوارد عبر بوابة الموردين" })} · {f.date(received.date)}
                  </span>
                </button>
              )}
              <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={L({ en: "Paste the supplier's clarification response…", ar: "الصق رد المورد على طلب الاستيضاح…" })} className="min-h-28 max-h-[280px] overflow-y-auto text-[12px]" dir="auto" />
              <div className="flex justify-end">
                <RunButton size="sm" running={answering} disabled={text.trim().length < 40 || respRun.running} onRun={() => onResponse(text)} icon={<Send />}>
                  {L({ en: "Evaluate response & update matrix", ar: "تقييم الرد وتحديث المصفوفة" })}
                </RunButton>
              </div>
            </div>
          )}
          {issued?.status === "answered" && (
            <div className="space-y-2">
              <div className="label-caps">{L({ en: "Effect on the evaluation", ar: "الأثر على التقييم" })}</div>
              {issued.priceChangeAttempt && <StatusPill tone="danger">{L({ en: "Price change attempted — not credited", ar: "محاولة تعديل السعر — لم يُعتدّ بها" })}</StatusPill>}
              <ul className="space-y-1.5">
                {changes.map((c, i) => (
                  <li key={i} className="rounded-md bg-ai-soft/60 px-2.5 py-1.5 text-[12px]">
                    <div className="num">
                      <span className="font-mono text-[11px] text-muted-foreground">{c.id}</span> {c.from} → <span className="font-medium">{c.to}</span>
                    </div>
                    <div className="text-[11.5px] leading-snug text-muted-foreground" dir="auto">
                      {c.note}
                    </div>
                  </li>
                ))}
              </ul>
              {issued.responseExcerpt && (
                <p className="line-clamp-4 border-s-2 border-border-strong ps-2 text-[11.5px] text-muted-foreground" dir="auto">
                  {issued.responseExcerpt.replace(/[#*_`>]+/g, "").replace(/\s+/g, " ").trim()}
                </p>
              )}
            </div>
          )}
          {!issued && (
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              {L({
                en: `Responses are due within 5 working days of issue via the ${tender.ref} clarification module.`,
                ar: `تُستحق الردود خلال 5 أيام عمل من الإصدار عبر وحدة الاستيضاح للمناقصة ${tender.ref}.`,
              })}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
