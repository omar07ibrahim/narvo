"use client";

import { useRef, useState } from "react";
import { ArrowUp, ChevronDown, Code2, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/narvo/markdown";
import { ThinkingLines } from "@/components/narvo/empty";
import { VoiceButton } from "@/components/narvo/voice";
import { StatusPill } from "@/components/narvo/status";
import type { NarvoRun } from "@/hooks/use-narvo-run";
import type { Citation } from "@/lib/ai/events";
import { useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { metricById } from "../_lib/catalogue";
import type { QueryResult, QuerySpec } from "../_lib/query";
import { MetricChart } from "./metric-chart";
import { RagDot, normCites } from "./bits";
import { CHART } from "@/components/narvo/chart";

export interface AskEntry {
  q: string;
  spec?: QuerySpec;
  result?: QueryResult;
  answer: string;
  citations: Citation[];
  error?: string;
}

const SUGGESTIONS = [
  { en: "How has the housing backlog developed since July, and how does it compare with decisions issued?", ar: "كيف تطور تراكم طلبات الإسكان منذ يوليو مقارنة بالقرارات الصادرة؟" },
  { en: "Phone wait time and abandonment by week since August against target", ar: "زمن الانتظار الهاتفي ونسبة المكالمات المتروكة أسبوعياً منذ أغسطس مقابل المستهدف" },
  { en: "Median permit cycle time by month this year", ar: "الوسيط الشهري لزمن إصدار رخص البناء هذا العام" },
  { en: "بكم ارتفعت طلبات الإسكان في سبتمبر مقارنة بأغسطس؟", ar: "بكم ارتفعت طلبات الإسكان في سبتمبر مقارنة بأغسطس؟" },
];

function SpecChips({ spec, result }: { spec: QuerySpec; result?: QueryResult }) {
  const L = useL();
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        {spec.metrics.map((m) => (
          <span key={m} className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-muted-foreground">
            {m}
          </span>
        ))}
        <span className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-muted-foreground">
          {result?.from ?? spec.from} → {result?.to ?? spec.to}
        </span>
        <span className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-muted-foreground">{result?.granularity ?? spec.granularity}</span>
        {spec.compare !== "none" && <span className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-muted-foreground">{spec.compare}</span>}
        <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1 text-faint hover:text-muted-foreground">
          <Code2 className="size-3" />
          {L({ en: "validated query", ar: "الاستعلام المعتمد" })}
          <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
        </button>
      </div>
      {result?.adjusted?.length ? <p className="mt-1 text-[11px] text-warning">{result.adjusted.join(" · ")}</p> : null}
      {open && (
        <pre className="scrollbar-thin mt-2 max-h-48 overflow-auto rounded-md bg-muted/70 p-2 font-mono text-[11px] text-muted-foreground" dir="ltr">
          {JSON.stringify(spec, null, 2)}
        </pre>
      )}
    </div>
  );
}

function ResultView({ entry, live, onCite }: { entry: AskEntry; live?: boolean; onCite?: (n: number) => void }) {
  const L = useL();
  const colors = [CHART.ink, CHART.ai, CHART.warning];
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-start gap-2.5 border-b border-border px-4 py-3">
        <MessageSquareText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-medium" dir="auto">
            {entry.q}
          </p>
          {entry.spec && (
            <div className="mt-1.5">
              <p className="mb-1.5 text-[12px] text-muted-foreground" dir="auto">
                {entry.spec.restatement}
              </p>
              <SpecChips spec={entry.spec} result={entry.result} />
            </div>
          )}
        </div>
      </div>
      <div className="space-y-4 p-4">
        {entry.result?.metrics.map((m, i) => {
          const def = metricById(m.id)!;
          return (
            <div key={m.id}>
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[12.5px] font-medium">{L(m.name)}</span>
                <span className="flex items-center gap-2 text-[12px] text-muted-foreground">
                  <RagDot rag={m.total.rag as never} />
                  <bdi dir="ltr" className="num font-medium text-foreground">{m.total.text}</bdi>
                  {m.total.targetText && <span className="num">· {L({ en: "target", ar: "المستهدف" })} {m.total.targetText}</span>}
                  {m.previous && (
                    <span className="num">
                      · {L({ en: "previous", ar: "السابق" })} {m.previous.text} ({m.previous.deltaText})
                    </span>
                  )}
                </span>
              </div>
              {m.series.length > 1 && <MetricChart def={def} points={m.series} height={170} color={colors[i % 3]} showTarget={entry.spec?.compare === "target" || def.better !== "none"} />}
            </div>
          );
        })}
        {live && !entry.answer && <ThinkingLines lines={3} />}
        {entry.answer && (
          <div className="rounded-md bg-ai-soft/50 px-3.5 py-2.5">
            <Markdown citations={entry.citations} onCite={onCite} streaming={live}>
              {normCites(entry.answer)}
            </Markdown>
          </div>
        )}
        {entry.error && <div className="rounded-md border border-danger/25 bg-danger-soft p-2.5 text-[12px] text-danger">{entry.error}</div>}
      </div>
    </div>
  );
}

export function AskTab({ run, onAsk, history, onCite, currentQ }: { run: NarvoRun; onAsk: (q: string) => void; history: AskEntry[]; onCite: (n: number) => void; currentQ: string | null }) {
  const L = useL();
  const [q, setQ] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const submit = (text: string) => {
    const t = text.trim();
    if (!t || run.running) return;
    onAsk(t);
    setQ("");
  };
  const liveEntry: AskEntry | null =
    currentQ && run.status !== "idle"
      ? { q: currentQ, spec: run.data.spec, result: run.data.result, answer: run.text.answer ?? "", citations: run.data.citations ?? [], error: run.status === "error" ? run.error : undefined }
      : null;
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-surface p-3">
        <div className="flex items-end gap-2">
          <Textarea
            ref={ref}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(q);
              }
            }}
            dir="auto"
            placeholder={L({ en: "Ask a question about performance — e.g. “Which CHC KPIs worsened most since August?”", ar: "اطرح سؤالاً عن الأداء — مثل: «ما مؤشرات مركز إسعاد المتعاملين الأكثر تراجعاً منذ أغسطس؟»" })}
            className="min-h-11 flex-1 resize-none bg-card text-[13px]"
            rows={2}
          />
          <VoiceButton size="md" onTranscript={(t) => submit(t.text)} disabled={run.running} className="[&>span]:hidden" />
          <Button size="icon" onClick={() => submit(q)} disabled={!q.trim() || run.running} aria-label="Ask">
            <ArrowUp />
          </Button>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              type="button"
              disabled={run.running}
              onClick={() => submit(L(s))}
              className="rounded-full border border-border bg-card px-2.5 py-1 text-[11.5px] text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
              dir="auto"
            >
              {L(s)}
            </button>
          ))}
        </div>
        <p className="mt-2.5 text-[11px] text-faint">
          {L({
            en: "The model only writes a query specification; it is validated and computed in code from the scorecard data. Answers cite the computed values.",
            ar: "يكتب النموذج مواصفات الاستعلام فقط، ويتم التحقق منها واحتسابها برمجياً من بيانات بطاقة الأداء. وتستشهد الإجابات بالقيم المحسوبة.",
          })}
        </p>
      </div>
      {liveEntry && <ResultView entry={liveEntry} live={run.running} onCite={onCite} />}
      {history.map((h, i) => (
        <ResultView key={history.length - i} entry={h} />
      ))}
      {!liveEntry && history.length === 0 && (
        <div className="flex items-center gap-2 px-1 text-[12px] text-muted-foreground">
          <StatusPill tone="neutral" dot={false}>
            27 KPIs
          </StatusPill>
          {L({ en: "Daily data 1 Jan – 9 Oct 2026 · 3,123 permit records", ar: "بيانات يومية من 1 يناير إلى 9 أكتوبر 2026 · 3,123 سجل رخصة" })}
        </div>
      )}
    </div>
  );
}
