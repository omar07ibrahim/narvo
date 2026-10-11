"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronRight, Hand, LoaderCircle, X, Wrench, Brain } from "lucide-react";
import { cn } from "@/lib/utils";
import { useL } from "@/lib/i18n";
import type { NarvoRun, TraceItem } from "@/hooks/use-narvo-run";

function StatusIcon({ status }: { status: TraceItem["status"] }) {
  if (status === "running")
    return <LoaderCircle className="size-3.5 animate-spin text-ai" strokeWidth={2} />;
  if (status === "done") return <Check className="size-3.5 text-success" strokeWidth={2.4} />;
  if (status === "awaiting_approval" || status === "waiting")
    return <Hand className="size-3.5 text-warning" strokeWidth={2} />;
  if (status === "error") return <X className="size-3.5 text-danger" strokeWidth={2.4} />;
  return <span className="size-1.5 rounded-full bg-faint" />;
}

function fmtMs(ms?: number) {
  if (ms == null) return "";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function Json({ value }: { value: unknown }) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return (
    <pre className="scrollbar-thin max-h-48 overflow-auto rounded-md bg-muted/70 p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
      {text?.length > 2400 ? text.slice(0, 2400) + "\n…" : text}
    </pre>
  );
}

function Row({ item }: { item: TraceItem }) {
  const [open, setOpen] = useState(false);
  const L = useL();
  const isTool = item.kind === "tool";
  const expandable = isTool && (item.input !== undefined || item.output !== undefined);
  return (
    <motion.li
      layout
      initial={{ opacity: 1, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="relative ps-7"
    >
      <span className="absolute start-0 top-[3px] flex size-5 items-center justify-center rounded-full border border-border bg-card">
        <StatusIcon status={item.status} />
      </span>
      <button
        type="button"
        disabled={!expandable}
        onClick={() => setOpen((o) => !o)}
        className={cn("group flex w-full items-start gap-2 text-start", !expandable && "cursor-default")}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {isTool && (
              <span className="inline-flex items-center gap-1 rounded border border-border bg-muted px-1 py-px font-mono text-[10px] text-muted-foreground">
                <Wrench className="size-2.5" />
                {item.name}
              </span>
            )}
            <span
              className={cn(
                "text-[12.5px] leading-snug",
                item.status === "running" ? "shimmer-text font-medium" : "text-foreground",
              )}
            >
              {item.label}
            </span>
          </div>
          {item.kind === "step" && item.detail && (
            <p className="mt-0.5 text-[11.5px] leading-snug break-words text-muted-foreground">{item.detail}</p>
          )}
          {item.kind === "tool" && item.status === "awaiting_approval" && (
            <p className="mt-0.5 text-[11.5px] text-warning">
              {L({ en: "Queued for human approval", ar: "بانتظار اعتماد بشري" })}
            </p>
          )}
        </div>
        <span dir="ltr" className="num shrink-0 pt-px text-[10.5px] text-faint">{fmtMs(item.ms)}</span>
        {expandable && (
          <ChevronRight
            className={cn("mt-0.5 size-3.5 shrink-0 text-faint transition-transform rtl:rotate-180", open && "rotate-90 rtl:rotate-90")}
          />
        )}
      </button>
      <AnimatePresence initial={false}>
        {open && expandable && (
          <motion.div
            initial={{ height: 0, opacity: 1 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 space-y-1.5 pb-1">
              {item.input !== undefined && (
                <>
                  <div className="label-caps !text-[9.5px]">{L({ en: "Input", ar: "المدخلات" })}</div>
                  <Json value={item.input} />
                </>
              )}
              {item.output !== undefined && (
                <>
                  <div className="label-caps !text-[9.5px]">{L({ en: "Result", ar: "النتيجة" })}</div>
                  <Json value={item.output} />
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

function Elapsed({ startedAt, running, ms }: { startedAt?: number; running: boolean; ms?: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => tick((x) => x + 1), 100);
    return () => clearInterval(t);
  }, [running]);
  const value = running && startedAt ? Date.now() - startedAt : ms;
  if (value == null) return null;
  return <span dir="ltr" className="num">{(value / 1000).toFixed(1)} s</span>;
}

export function AgentTrace({
  run,
  className,
  title,
  emptyHint,
  showReasoning = true,
}: {
  run: NarvoRun;
  className?: string;
  title?: string;
  emptyHint?: string;
  showReasoning?: boolean;
}) {
  const L = useL();
  const items = [...run.trace].sort((a, b) => a.order - b.order);
  const [showThought, setShowThought] = useState(false);
  return (
    <div className={cn("flex flex-col", className)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="label-caps">{title ?? L({ en: "Agent trace", ar: "مسار عمل الوكيل" })}</span>
        <span className="flex min-w-0 items-center gap-2 text-[10.5px] text-muted-foreground">
          {run.model && <span dir="ltr" className="font-mono">{run.model.split("/").pop()}</span>}
          <Elapsed startedAt={run.startedAt} running={run.running} ms={run.ms} />
        </span>
      </div>
      {items.length === 0 && !run.running && (
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          {emptyHint ?? L({ en: "Run the agent to see every step it takes — retrieval, tools, checks and approvals.", ar: "شغّل الوكيل لرؤية كل خطوة يتخذها — البحث والأدوات والتحقق والاعتماد." })}
        </p>
      )}
      <ol className="relative space-y-3 before:absolute before:start-[9.5px] before:top-2 before:bottom-2 before:w-px before:bg-border">
        {items.map((it) => (
          <Row key={`${it.kind}-${it.id}`} item={it} />
        ))}
      </ol>
      {showReasoning && run.reasoning && (
        <div className="mt-3 rounded-md border border-dashed border-border p-2">
          <button
            type="button"
            className="flex w-full items-center gap-1.5 text-[11px] text-muted-foreground"
            onClick={() => setShowThought((v) => !v)}
          >
            <Brain className="size-3" /> {L({ en: "Model reasoning", ar: "استدلال النموذج" })}
            <ChevronRight className={cn("ms-auto size-3 transition-transform", showThought && "rotate-90")} />
          </button>
          {showThought && (
            <p className="scrollbar-thin mt-2 max-h-40 overflow-auto text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
              {run.reasoning}
            </p>
          )}
        </div>
      )}
      {run.status === "error" && (
        <div className="mt-3 rounded-md border border-danger/25 bg-danger-soft p-2.5 text-[12px] text-danger">{run.error}</div>
      )}
    </div>
  );
}
