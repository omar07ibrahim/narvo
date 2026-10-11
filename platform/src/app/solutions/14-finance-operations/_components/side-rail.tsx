"use client";

import { useState } from "react";
import { ArrowRight, BookOpenCheck, Image as ImageIcon, Send } from "lucide-react";
import { AgentTrace } from "@/components/narvo/agent-trace";
import { ApprovalCard } from "@/components/narvo/approval-card";
import { FileDrop, type DroppedFile } from "@/components/narvo/file-drop";
import { Markdown } from "@/components/narvo/markdown";
import { SourceList } from "@/components/narvo/sources";
import { StatusPill } from "@/components/narvo/status";
import { ThinkingLines } from "@/components/narvo/empty";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { NarvoRun } from "@/hooks/use-narvo-run";
import type { ApprovalSummary, Citation } from "@/lib/ai/events";
import { fmt2 } from "../_lib/three-way";
import { errorText, PRIMARY_LABEL } from "./labels";
import type { CheckId } from "../_lib/types";

const SAMPLE = "/demo/14-finance-operations/byo-sample-act-inv-0791.png";

export type RunKey = "case" | "extract" | "byo" | "ask";

const TRACE_TITLE: Record<RunKey, { en: string; ar: string }> = {
  case: { en: "resolution case", ar: "ملف المعالجة" },
  extract: { en: "invoice reading", ar: "قراءة الفاتورة" },
  byo: { en: "your invoice", ar: "فاتورتك" },
  ask: { en: "AP policy", ar: "سياسة الحسابات الدائنة" },
};

const SUGGESTED = [
  { en: "Can we pay a surcharge that is not on the PO?", ar: "هل يمكن سداد رسوم إضافية غير واردة في أمر الشراء؟" },
  { en: "Who approves an AED 74,995 adjustment?", ar: "من يعتمد تسوية بقيمة 74,995 درهم؟" },
  { en: "What do we do when a supplier invoice has no TRN?", ar: "ما الإجراء عندما لا تحمل فاتورة المورد رقماً ضريبياً؟" },
];

export function SideRail({
  runs,
  active,
  setActive,
  pendingQueue,
  citations,
  onOpen,
  onDecided,
  onUpload,
  onAsk,
}: {
  runs: Record<RunKey, NarvoRun>;
  active: RunKey;
  setActive: (k: RunKey) => void;
  pendingQueue: Array<{ invoiceId: string; label: string; approval: ApprovalSummary }>;
  citations: Citation[];
  onOpen: (id: string) => void;
  onDecided: () => void;
  onUpload: (f: DroppedFile) => void;
  onAsk: (q: string) => void;
}) {
  const L = useL();
  const [q, setQ] = useState("");
  const byo = runs.byo;
  const ask = runs.ask;
  const reg = byo.data.registered as { id: string; exception: boolean; primary: CheckId | null; variance: number; invoiceNo: string; supplier: string; total: number } | undefined;
  const used = Object.entries(runs).filter(([, r]) => r.status !== "idle").map(([k]) => k as RunKey);

  return (
    <div className="space-y-6">
      {/* Trace */}
      <section>
        {used.length > 1 && (
          <div className="mb-3 flex flex-wrap gap-1">
            {used.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setActive(k)}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10.5px] transition-colors",
                  active === k ? "border-ai/40 bg-ai-soft text-ai" : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {L(TRACE_TITLE[k])}
              </button>
            ))}
          </div>
        )}
        <AgentTrace
          run={runs[active]}
          title={L(TRACE_TITLE[active])}
          emptyHint={L({
            en: "Read an invoice, build a resolution case or drop your own invoice — every step, check and tool appears here as it runs.",
            ar: "اقرأ فاتورة أو ابنِ ملف معالجة أو أضف فاتورتك — تظهر هنا كل خطوة وفحص وأداة أثناء التنفيذ.",
          })}
        />
      </section>

      {/* Approval queue */}
      {pendingQueue.length > 0 && (
        <section>
          <div className="label-caps mb-2">
            {L({ en: "Awaiting approval", ar: "بانتظار الاعتماد" })} <span className="num text-faint">{pendingQueue.length}</span>
          </div>
          <div className="space-y-2">
            {pendingQueue.map((p) => (
              <div key={p.approval.id} className="space-y-1">
                <button type="button" onClick={() => onOpen(p.invoiceId)} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                  {p.label}
                  <ArrowRight className="size-3 rtl:rotate-180" />
                </button>
                <ApprovalCard key={`${p.approval.id}-${p.approval.status}`} approval={p.approval} onDecided={onDecided} compact />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Evidence */}
      {citations.length > 0 && (
        <section>
          <div className="label-caps mb-2">{L({ en: "Evidence & sources", ar: "الأدلة والمصادر" })}</div>
          <SourceList citations={citations} />
        </section>
      )}

      {/* Bring your own */}
      <section>
        <div className="label-caps mb-2">{L({ en: "Bring your own invoice", ar: "أحضر فاتورتك" })}</div>
        <FileDrop
          accept="image/png,image/jpeg,image/webp"
          onFiles={(fs) => fs[0]?.dataUrl && onUpload(fs[0])}
          label={L({ en: "Drop a supplier invoice photo or scan", ar: "اسحب صورة أو مسحاً لفاتورة مورد" })}
          hint={L({ en: "Read, matched to PO & GRN, registered — on this machine", ar: "تُقرأ وتُطابق مع أمر الشراء والاستلام وتُسجّل — على هذا الجهاز" })}
        />
        {!byo.running && !reg && (
          <button
            type="button"
            onClick={async () => {
              try {
                const blob = await (await fetch(SAMPLE)).blob();
                const dataUrl = await new Promise<string>((resolve, reject) => {
                  const r = new FileReader();
                  r.onload = () => resolve(r.result as string);
                  r.onerror = reject;
                  r.readAsDataURL(blob);
                });
                onUpload({ name: "ACT-INV-26-0791.png", type: blob.type, size: blob.size, dataUrl });
              } catch {}
            }}
            className="mt-2 flex items-start gap-1.5 text-start text-[11.5px] leading-snug text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            <ImageIcon className="mt-px size-3.5 shrink-0" />
            {L({ en: "No file at hand? Try an October Andalus invoice (not in the batch)", ar: "لا يوجد ملف؟ جرّب فاتورة الأندلس لشهر أكتوبر (خارج الدفعة)" })}
          </button>
        )}
        {byo.running && !reg && <ThinkingLines lines={3} className="mt-3" />}
        {byo.status === "error" && <div className="mt-2 rounded-md border border-danger/25 bg-danger-soft p-2.5 text-[12px] text-danger">{errorText(byo.error)}</div>}
        {reg && (
          <div className="mt-3 rounded-md border border-border bg-surface p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[11px] text-muted-foreground">{reg.id}</span>
              <StatusPill tone={reg.exception ? "warning" : "success"}>
                {reg.exception ? L(PRIMARY_LABEL[reg.primary ?? "total"]) : L({ en: "Clean match", ar: "مطابقة سليمة" })}
              </StatusPill>
            </div>
            <div className="mt-1.5 text-[12.5px] font-medium">{reg.supplier}</div>
            <div className="text-[11.5px] text-muted-foreground">
              {reg.invoiceNo} · AED {fmt2(reg.total)}
              {reg.exception ? ` · ${L({ en: "variance", ar: "الفرق" })} ${fmt2(reg.variance)}` : ""}
            </div>
            <Button size="sm" variant="outline" className="mt-2.5 w-full" onClick={() => onOpen(reg.id)}>
              {reg.exception ? L({ en: "Open & build a resolution case", ar: "افتح وابنِ ملف معالجة" }) : L({ en: "Open in the batch", ar: "افتح في الدفعة" })}
              <ArrowRight className="rtl:rotate-180" />
            </Button>
          </div>
        )}
      </section>

      {/* Ask AP policy */}
      <section>
        <div className="label-caps mb-2 flex items-center gap-1.5">
          <BookOpenCheck className="size-3.5" />
          {L({ en: "Ask AP policy", ar: "اسأل عن سياسة الحسابات الدائنة" })}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) onAsk(q.trim());
          }}
          className="space-y-2"
        >
          <Textarea
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={L({ en: "e.g. What is the price tolerance?", ar: "مثال: ما هو التفاوت المسموح في السعر؟" })}
            className="min-h-16 bg-surface text-[12.5px]"
            dir="auto"
          />
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap gap-1">
              {SUGGESTED.slice(0, 2).map((s) => (
                <button
                  key={s.en}
                  type="button"
                  onClick={() => {
                    setQ(L(s));
                    onAsk(L(s));
                  }}
                  className="truncate rounded-full border border-border px-2 py-0.5 text-[10.5px] text-muted-foreground hover:text-foreground"
                >
                  {L(s)}
                </button>
              ))}
            </div>
            <Button size="sm" type="submit" disabled={!q.trim() || ask.running}>
              <Send />
              {L({ en: "Ask", ar: "اسأل" })}
            </Button>
          </div>
        </form>
        {(ask.text.main || ask.running) && (
          <div className="mt-3 rounded-md border border-border p-3">
            {!ask.text.main ? <ThinkingLines lines={3} /> : <Markdown citations={ask.data.citations} streaming={ask.running}>{ask.text.main}</Markdown>}
          </div>
        )}
        {ask.status === "error" && <div className="mt-2 rounded-md border border-danger/25 bg-danger-soft p-2.5 text-[12px] text-danger">{errorText(ask.error)}</div>}
        {ask.data.citations && !ask.running && <SourceList className="mt-3" citations={ask.data.citations} usedOnly text={ask.text.main} />}
      </section>
    </div>
  );
}
