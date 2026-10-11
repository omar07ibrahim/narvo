"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, MessageSquareText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Markdown } from "@/components/narvo/markdown";
import { SourceList } from "@/components/narvo/sources";
import { VoiceButton } from "@/components/narvo/voice";
import { EmptyState, ThinkingLines } from "@/components/narvo/empty";
import type { NarvoRun } from "@/hooks/use-narvo-run";
import type { Citation } from "@/lib/ai/events";
import { useL } from "@/lib/i18n";
import type { ContractState } from "../_lib/types";

interface Turn {
  q: string;
  a: string;
  citations: Citation[];
}

const SUGGEST: Record<string, Array<{ en: string; ar: string }>> = {
  "MNDA-CON-2023-019": [
    { en: "What happens if we miss the renewal notice deadline?", ar: "ماذا يحدث إذا فاتنا موعد إشعار التجديد؟" },
    { en: "How are service credits calculated for PPM compliance?", ar: "كيف تُحسب خصومات الخدمة لامتثال الصيانة الوقائية؟" },
    { en: "Can we require an improvement plan as a condition of renewal?", ar: "هل يمكننا اشتراط خطة تحسين للتجديد؟" },
  ],
  "DRAFT-2026-CHC-OMNI": [
    { en: "Where will our customer data be stored?", ar: "أين ستُخزَّن بيانات المتعاملين؟" },
    { en: "Can we terminate early, and at what cost?", ar: "هل يمكننا الإنهاء المبكر وبأي تكلفة؟" },
  ],
};

export function AskView({ state, contractId, onContract, run, onAsk }: { state: ContractState; contractId: string; onContract: (id: string) => void; run: NarvoRun; onAsk: (q: string, history: Array<{ role: "user" | "assistant"; content: string }>) => void }) {
  const L = useL();
  const [q, setQ] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const withText = state.contracts.filter((c) => c.file);

  useEffect(() => {
    setTurns([]);
  }, [contractId]);
  useEffect(() => {
    if (run.status === "done" && pending && run.text.answer) {
      setTurns((t) => [...t, { q: pending, a: run.text.answer, citations: (run.data.citations as Citation[]) ?? [] }]);
      setPending(null);
    }
    if (run.status === "error") setPending(null);
  }, [run.status]); // eslint-disable-line react-hooks/exhaustive-deps
  // Braces matter: newer Chrome returns a Promise from scrollIntoView, which React would treat as a cleanup.
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [turns, run.text.answer]);

  const ask = (question: string) => {
    if (!question.trim() || run.running) return;
    const history = turns.flatMap((t) => [
      { role: "user" as const, content: t.q },
      { role: "assistant" as const, content: t.a },
    ]);
    setPending(question);
    setQ("");
    onAsk(question, history);
  };
  const last = turns.at(-1);
  const liveCitations = (run.data.citations as Citation[] | undefined) ?? [];

  return (
    <div className="@container">
    <div className="grid grid-cols-1 gap-5 @3xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex min-h-[520px] min-w-0 flex-col rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <Select value={contractId} onValueChange={onContract}>
            <SelectTrigger size="sm" className="h-8 w-[380px] max-w-full text-[12.5px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {withText.map((c) => (
                <SelectItem key={c.id} value={c.id} className="text-[12.5px]">
                  {c.ref} — {c.counterparty}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="scrollbar-thin flex-1 space-y-5 overflow-auto px-5 py-4">
          {!turns.length && !pending && (
            <EmptyState icon={<MessageSquareText className="size-4" />} title={L({ en: "Ask this contract anything", ar: "اسأل هذا العقد أي سؤال" })}>
              <span className="mt-3 flex flex-wrap justify-center gap-1.5">
                {(SUGGEST[contractId] ?? SUGGEST["MNDA-CON-2023-019"]).map((s, i) => (
                  <button key={i} type="button" onClick={() => ask(L(s))} className="rounded-full border border-border px-2.5 py-1 text-[11.5px] text-muted-foreground hover:border-border-strong hover:text-foreground" dir="auto">
                    {L(s)}
                  </button>
                ))}
              </span>
            </EmptyState>
          )}
          {turns.map((t, i) => (
            <div key={i} className="space-y-2">
              <div className="ms-auto w-fit max-w-[80%] rounded-lg bg-muted px-3 py-2 text-[13px]" dir="auto">
                {t.q}
              </div>
              <Markdown citations={t.citations}>{t.a}</Markdown>
            </div>
          ))}
          {pending && (
            <div className="space-y-2">
              <div className="ms-auto w-fit max-w-[80%] rounded-lg bg-muted px-3 py-2 text-[13px]" dir="auto">
                {pending}
              </div>
              {run.text.answer ? (
                <Markdown citations={liveCitations} streaming>
                  {run.text.answer}
                </Markdown>
              ) : (
                <ThinkingLines lines={3} />
              )}
            </div>
          )}
          <div ref={end} />
        </div>
        <div className="flex items-end gap-2 border-t border-border p-3">
          <Textarea
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask(q);
              }
            }}
            placeholder={L({ en: "Ask about notice periods, liability, data, KPIs…", ar: "اسأل عن مهل الإشعار والمسؤولية والبيانات ومؤشرات الأداء…" })}
            className="min-h-10 flex-1 resize-none text-[13px]"
            rows={1}
            dir="auto"
          />
          <VoiceButton size="md" onTranscript={(t) => ask(t.text)} onError={(m) => toast.error(m)} />
          <Button size="icon" onClick={() => ask(q)} disabled={!q.trim() || run.running}>
            <ArrowUp />
          </Button>
        </div>
      </div>
      <div>
        <div className="label-caps mb-2">{L({ en: "Clauses used", ar: "البنود المستخدمة" })}</div>
        <SourceList citations={pending ? liveCitations : (last?.citations ?? [])} usedOnly={!pending && !!last} text={pending ? undefined : last?.a} />
      </div>
    </div>
    </div>
  );
}
