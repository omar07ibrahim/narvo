"use client";

import { useState } from "react";
import { ArrowRight, ChevronDown, ClipboardCheck, ScanSearch } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RunButton } from "@/components/narvo/run-button";
import { EmptyState, ThinkingLines } from "@/components/narvo/empty";
import { FileDrop } from "@/components/narvo/file-drop";
import { StatusPill } from "@/components/narvo/status";
import type { NarvoRun } from "@/hooks/use-narvo-run";
import { useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { CheckItem, FigureCheckResult } from "../_lib/check";
import { DEPTS } from "../_lib/catalogue";
import { MiniStat } from "./bits";

function deptName(dept: string, L: (t: { en: string; ar: string }) => string) {
  const d = (DEPTS as Record<string, { name: { en: string; ar: string } }>)[dept];
  if (d) return L(d.name);
  if (dept === "procurement") return L({ en: "Procurement & Contracts", ar: "المشتريات والعقود" });
  if (dept === "pasted") return L({ en: "Pasted text", ar: "نص ملصق" });
  return dept;
}

function Row({ c }: { c: CheckItem }) {
  const L = useL();
  return (
    <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-4 py-3 max-md:grid-cols-1">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span className="font-mono">{c.updateId}</span>
          <span>·</span>
          <span>{deptName(c.dept, L)}</span>
          <span>·</span>
          <span>{c.author}</span>
        </div>
        <blockquote className="mt-1.5 border-s-2 border-border-strong ps-2.5 text-[13px] leading-relaxed" dir="auto">
          “{c.quote}”
        </blockquote>
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-[12px]">
          <span className={cn("num rounded px-1.5 py-0.5 font-medium", c.status === "discrepancy" ? "bg-danger-soft text-danger line-through decoration-danger/50" : "bg-muted")}>
            {c.claimedText}
          </span>
          <ArrowRight className="size-3 text-faint rtl:rotate-180" />
          <span className={cn("num rounded px-1.5 py-0.5 font-medium", c.status === "discrepancy" ? "bg-success-soft text-success" : c.status === "consistent" ? "bg-muted" : "text-faint")}>
            {c.actualText}
          </span>
        </div>
        <div className="mt-1.5 text-[11.5px] leading-snug text-muted-foreground">
          {c.metricName} · {c.periodLabel}
        </div>
        {c.metricId && <div className="mt-0.5 truncate font-mono text-[10.5px] text-faint">{c.source}</div>}
      </div>
    </div>
  );
}

export function FigureTab({ run, saved, onRun }: { run: NarvoRun; saved: FigureCheckResult | null; onRun: (text?: string) => void }) {
  const L = useL();
  const [paste, setPaste] = useState("");
  const [showOk, setShowOk] = useState(false);
  const [showByo, setShowByo] = useState(false);
  const result: FigureCheckResult | null = run.data.result ?? (run.status === "idle" ? saved : null);

  const byo = (
    <div className="rounded-md border border-border bg-surface p-3">
      <div className="label-caps mb-2">{L({ en: "Check your own text", ar: "افحص نصك الخاص" })}</div>
      <Textarea
        value={paste}
        onChange={(e) => setPaste(e.target.value)}
        dir="auto"
        placeholder={L({
          en: "Paste a department update, a draft report paragraph or minutes — every figure is checked against the scorecard…",
          ar: "الصق تحديثاً من إدارة أو فقرة من تقرير أو محضر — يتم فحص كل رقم مقابل بطاقة الأداء…",
        })}
        className="min-h-24 bg-card text-[12.5px]"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <FileDrop
          compact
          accept=".md,.txt"
          className="flex-1"
          label={L({ en: "Or drop a .md / .txt update", ar: "أو أسقط ملف .md / .txt" })}
          hint={L({ en: "Processed on this machine", ar: "تتم المعالجة على هذا الجهاز" })}
          onFiles={(fs) => fs[0]?.text && setPaste(fs[0].text)}
        />
        <RunButton running={run.running} onRun={() => onRun(paste)} disabled={paste.trim().length < 20} size="sm" variant="outline" icon={<ScanSearch />}>
          {L({ en: "Check this text", ar: "افحص النص" })}
        </RunButton>
      </div>
    </div>
  );

  if (!result && !run.running) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon={<ClipboardCheck className="size-4" />}
          title={L({ en: "Figure consistency check", ar: "فحص اتساق الأرقام" })}
          action={
            <RunButton running={run.running} onRun={() => onRun()} icon={<ScanSearch />}>
              {L({ en: "Check figures in department updates", ar: "فحص أرقام تحديثات الإدارات" })}
            </RunButton>
          }
        >
          {L({
            en: "The model reads every figure quoted in the department updates and maps it to a KPI and period; the system then recomputes the value from source data and flags anything that does not match.",
            ar: "يقرأ النموذج كل رقم مذكور في تحديثات الإدارات ويربطه بمؤشر وفترة، ثم يعيد النظام احتساب القيمة من البيانات المصدرية ويشير إلى أي اختلاف.",
          })}
        </EmptyState>
        {run.status === "error" && <div className="rounded-md border border-danger/25 bg-danger-soft p-3 text-[12.5px] text-danger">{run.error}</div>}
        {byo}
      </div>
    );
  }

  if (!result) return <ThinkingLines lines={7} className="mt-2" />;

  const disc = result.checks.filter((c) => c.status === "discrepancy");
  const ok = result.checks.filter((c) => c.status === "consistent");
  const unv = result.checks.filter((c) => c.status === "unverifiable");
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-4 rounded-lg border border-border bg-surface p-4 max-md:grid-cols-2">
        <MiniStat
          label={L({ en: "Figure consistency", ar: "اتساق الأرقام" })}
          value={result.rate != null ? `${result.rate.toFixed(0)}%` : "—"}
          tone={result.rate != null && result.rate >= 95 ? "success" : "warning"}
          sub={L({ en: "target 99%", ar: "المستهدف 99%" })}
        />
        <MiniStat label={L({ en: "Consistent", ar: "متسقة" })} value={result.consistent} />
        <MiniStat label={L({ en: "Discrepancies", ar: "اختلافات" })} value={result.discrepancies} tone={result.discrepancies ? "danger" : undefined} />
        <MiniStat label={L({ en: "Not in scorecard", ar: "غير موجودة في البطاقة" })} value={result.unverifiable} sub={L({ en: "no KPI to check against", ar: "لا يوجد مؤشر للمقارنة" })} />
      </div>

      <section>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="label-caps">{L({ en: "Discrepancies — update vs scorecard", ar: "الاختلافات — التحديث مقابل بطاقة الأداء" })}</h3>
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => onRun()} disabled={run.running}>
            {L({ en: "Re-run check", ar: "إعادة الفحص" })}
          </Button>
        </div>
        {disc.length === 0 ? (
          <p className="py-3 text-[12.5px] text-muted-foreground">{L({ en: "No discrepancies found.", ar: "لم يتم العثور على اختلافات." })}</p>
        ) : (
          <div className="divide-y divide-border">
            {disc.map((c, i) => (
              <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}>
                <Row c={c} />
              </motion.div>
            ))}
          </div>
        )}
      </section>

      <section>
        <button type="button" onClick={() => setShowOk((v) => !v)} className="flex w-full items-center gap-2 text-start">
          <h3 className="label-caps">
            {L({ en: "Consistent figures", ar: "الأرقام المتسقة" })} · <span className="num">{ok.length}</span>
          </h3>
          <ChevronDown className={cn("size-3.5 text-faint transition-transform", showOk && "rotate-180")} />
        </button>
        <AnimatePresence initial={false}>
          {showOk && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="mt-1 divide-y divide-border">
                {ok.map((c, i) => (
                  <Row key={i} c={c} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {unv.length > 0 && (
        <section>
          <h3 className="label-caps mb-2">{L({ en: "Figures with no scorecard KPI", ar: "أرقام لا يقابلها مؤشر في البطاقة" })}</h3>
          <div className="flex flex-wrap gap-1.5">
            {unv.map((c, i) => (
              <span key={i} className="rounded-md border border-border bg-surface px-2 py-1 text-[11.5px] text-muted-foreground" dir="auto" title={`${c.updateId} · ${c.author}`}>
                {c.quote}
              </span>
            ))}
          </div>
        </section>
      )}

      <div>
        <button type="button" onClick={() => setShowByo((v) => !v)} className="text-[12px] text-muted-foreground underline-offset-2 hover:underline">
          {L({ en: "Check your own text…", ar: "افحص نصك الخاص…" })}
        </button>
        {showByo && <div className="mt-2">{byo}</div>}
      </div>
      {result.at && run.status === "idle" && (
        <p className="text-[11px] text-faint">
          <StatusPill tone="neutral" dot={false}>
            {L({ en: "Last check", ar: "آخر فحص" })} {new Date(result.at).toLocaleString()}
          </StatusPill>
        </p>
      )}
    </div>
  );
}
