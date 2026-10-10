"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, MessageSquareText, Sparkles } from "lucide-react";
import { useNarvoRun } from "@/hooks/use-narvo-run";
import { AgentTrace } from "@/components/narvo/agent-trace";
import { Markdown } from "@/components/narvo/markdown";
import { SourceList } from "@/components/narvo/sources";
import { RunButton } from "@/components/narvo/run-button";
import { ApprovalCard } from "@/components/narvo/approval-card";
import { EmptyState, ThinkingLines } from "@/components/narvo/empty";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useL } from "@/lib/i18n";
import type { ApprovalSummary, Citation } from "@/lib/ai/events";
import type { WhatIf } from "../_lib/types";

interface Turn {
  q: string;
  a: string;
  citations: Citation[];
}

export function AnalystPane({
  whatIf,
  approvals,
  onDecided,
}: {
  whatIf: WhatIf;
  approvals: ApprovalSummary[];
  onDecided: (id: string, status: "approved" | "rejected") => void;
}) {
  const L = useL();
  const explain = useNarvoRun();
  const ask = useNarvoRun();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [pendingQ, setPendingQ] = useState<string | null>(null);
  const [explainedFor, setExplainedFor] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const key = JSON.stringify(whatIf);
  const stale = explain.status === "done" && explainedFor !== key;

  useEffect(() => {
    if (ask.status === "done" && pendingQ) {
      setTurns((t) => [...t, { q: pendingQ, a: ask.text.main ?? "", citations: (ask.data.citations as Citation[]) ?? [] }]);
      setPendingQ(null);
    }
  }, [ask.status, ask.text.main, ask.data.citations, pendingQ]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [turns.length, ask.text.main]);

  function runExplain() {
    setExplainedFor(key);
    setTurns([]);
    explain.start("/api/solutions/17-demand-planning/explain", { whatIf });
  }
  function send(q?: string) {
    const text = (q ?? question).trim();
    if (!text || ask.running) return;
    setPendingQ(text);
    setQuestion("");
    const history = [
      ...(explain.text.main ? [{ role: "assistant" as const, content: explain.text.main }] : []),
      ...turns.flatMap((t) => [
        { role: "user" as const, content: t.q },
        { role: "assistant" as const, content: t.a },
      ]),
    ];
    ask.start("/api/solutions/17-demand-planning/ask", { question: text, history, whatIf });
  }

  const citations = (explain.data.citations as Citation[]) ?? [];
  const suggestions = [
    L({ en: "Why not plan B if its service is the same?", ar: "لماذا لا نختار الخطة (ب) إذا كانت الخدمة متساوية؟" }),
    L({ en: "Which SKUs are most at risk and what should we do this week?", ar: "ما الأصناف الأكثر عرضة للخطر، وما الذي يجب فعله هذا الأسبوع؟" }),
    L({ en: "How much of the shortfall is caused by the Sahara maintenance?", ar: "ما حجم النقص الناتج عن صيانة مصنع صحارى؟" }),
  ];

  return (
    <div className="flex flex-col gap-4">
      {approvals.map((a) => (
        <ApprovalCard key={a.id} approval={a} onDecided={(s) => onDecided(a.id, s)} />
      ))}
      <section className="rounded-lg border border-border bg-card">
        <header className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-4 py-2">
          <h3 className="label-caps flex items-center gap-1.5">
            <Sparkles className="size-3 text-ai" /> {L({ en: "Planning analyst", ar: "محلل التخطيط" })}
          </h3>
          <RunButton running={explain.running} onRun={runExplain} onStop={explain.abort} size="sm" icon={<Sparkles />}>
            {explain.status === "idle" ? L({ en: "Explain trade-offs", ar: "اشرح المفاضلات" }) : L({ en: "Re-explain", ar: "أعد الشرح" })}
          </RunButton>
        </header>
        <div className="space-y-4 p-4">
          {stale && (
            <div className="rounded-md border border-warning/30 bg-warning-soft/60 px-3 py-2 text-[11.5px] text-warning">
              {L({ en: "Assumptions changed since this explanation — re-run to explain the new numbers.", ar: "تغيرت الافتراضات منذ هذا الشرح — أعد التشغيل لشرح الأرقام الجديدة." })}
            </div>
          )}
          {explain.status === "idle" ? (
            <EmptyState icon={<MessageSquareText className="size-4" />} title={L({ en: "Ask for a recommendation", ar: "اطلب توصية" })} className="py-8">
              {L({
                en: "The analyst recomputes all three plans for the current what-if and explains service, cost and capacity trade-offs — every number cited to the engine's output.",
                ar: "يعيد المحلل احتساب الخطط الثلاث للافتراضات الحالية ويشرح مفاضلات الخدمة والتكلفة والسعة — مع توثيق كل رقم من مخرجات المحرك.",
              })}
            </EmptyState>
          ) : (
            <>
              <AgentTrace run={explain} showReasoning={false} />
              {explain.text.main ? (
                <Markdown citations={citations} streaming={explain.running} className="text-[13px]">
                  {explain.text.main}
                </Markdown>
              ) : (
                explain.running && <ThinkingLines lines={5} />
              )}
              {citations.length > 0 && (
                <Collapsible>
                  <CollapsibleTrigger className="label-caps text-start hover:text-foreground">
                    {L({ en: `Evidence — ${citations.length} computed blocks`, ar: `الأدلة — ${citations.length} كتل محسوبة` })}
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2">
                    <SourceList citations={citations} text={explain.text.main} />
                  </CollapsibleContent>
                </Collapsible>
              )}
            </>
          )}

          {turns.map((t, i) => (
            <div key={i} className="space-y-2 border-t border-border pt-3">
              <div className="ms-auto w-fit max-w-[90%] rounded-lg bg-muted px-3 py-2 text-[12.5px]" dir="auto">
                {t.q}
              </div>
              <Markdown citations={t.citations} className="text-[13px]">
                {t.a}
              </Markdown>
            </div>
          ))}
          {pendingQ && (
            <div className="space-y-2 border-t border-border pt-3">
              <div className="ms-auto w-fit max-w-[90%] rounded-lg bg-muted px-3 py-2 text-[12.5px]" dir="auto">
                {pendingQ}
              </div>
              {ask.text.main ? (
                <Markdown citations={(ask.data.citations as Citation[]) ?? []} streaming={ask.running} className="text-[13px]">
                  {ask.text.main}
                </Markdown>
              ) : ask.status === "error" ? (
                <div className="rounded-md border border-danger/25 bg-danger-soft p-2.5 text-[12px] text-danger">{ask.error}</div>
              ) : (
                <ThinkingLines lines={3} />
              )}
            </div>
          )}
          <div ref={bottom} />

          {explain.status === "done" && (
            <div className="space-y-2 border-t border-border pt-3">
              {turns.length === 0 && !pendingQ && (
                <div className="flex flex-wrap gap-1.5">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      className="rounded-full border border-border px-2.5 py-1 text-start text-[11.5px] text-muted-foreground transition-colors hover:border-ai/40 hover:text-foreground"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
              >
                <Input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder={L({ en: "Ask a follow-up…", ar: "اطرح سؤالاً متابعاً…" })}
                  className="h-8 text-[12.5px]"
                />
                <Button type="submit" size="icon-sm" disabled={!question.trim() || ask.running}>
                  <ArrowUp />
                </Button>
              </form>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
