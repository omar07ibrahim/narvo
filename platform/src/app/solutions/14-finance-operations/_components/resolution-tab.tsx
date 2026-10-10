"use client";

import { CheckCircle2, CircleAlert, Mail, Sparkles, Wand2 } from "lucide-react";
import { motion } from "motion/react";
import { ApprovalCard } from "@/components/narvo/approval-card";
import { EmptyState, ThinkingLines } from "@/components/narvo/empty";
import { Markdown } from "@/components/narvo/markdown";
import { RunButton } from "@/components/narvo/run-button";
import { StatusPill } from "@/components/narvo/status";
import { Button } from "@/components/ui/button";
import { useFormat, useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { NarvoRun } from "@/hooks/use-narvo-run";
import type { Citation, ApprovalSummary } from "@/lib/ai/events";
import { fmt2 } from "../_lib/three-way";
import { TREATMENT_LABELS } from "../_lib/treatments";
import type { CaseAi, Invoice, JournalEntry, MatchResult, OutboxEmail, StoredCase, Treatment } from "../_lib/types";
import { JournalTable } from "./journal-table";
import { errorText, STATUS_LABEL } from "./labels";

function Amount({ label, value, tone, sub }: { label: string; value: number; tone?: "ai" | "danger" | "warning" | "success"; sub?: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-surface px-3 py-2.5">
      <div className="label-caps !text-[9px] truncate">{label}</div>
      <div
        className={cn(
          "num mt-1 text-[17px] leading-none font-light tracking-tight",
          tone === "ai" && "text-ai",
          tone === "danger" && "text-danger",
          tone === "warning" && "text-warning",
          tone === "success" && "text-success",
        )}
      >
        {fmt2(value)}
      </div>
      {sub && <div className="mt-1 truncate text-[10.5px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function TreatmentBlock({ t, posted }: { t: Treatment; posted?: boolean }) {
  const L = useL();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="label-caps">{L({ en: "Computed treatment", ar: "المعالجة المحتسبة" })}</span>
        {t.kinds.map((k) => (
          <StatusPill key={k} tone={k === "approve" ? "success" : k === "reject_duplicate" ? "danger" : "warning"} dot={false}>
            {L(TREATMENT_LABELS[k])}
          </StatusPill>
        ))}
        <span className="ms-auto text-[10.5px] text-muted-foreground">{L({ en: "deterministic · RG-FIN-POL-09", ar: "محتسب آلياً · RG-FIN-POL-09" })}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 @xl:grid-cols-4">
        <Amount label={L({ en: "Invoice total", ar: "إجمالي الفاتورة" })} value={t.invoiceTotal} />
        {t.kind === "reject_duplicate" ? (
          <Amount label={L({ en: "Payment avoided", ar: "دفعة مُتجنَّبة" })} value={t.paymentAvoided} tone="success" />
        ) : (
          <Amount label={L({ en: "Pay now", ar: "يُدفع الآن" })} value={t.payableNow} tone="ai" sub={t.newStatus === "on_hold" ? L({ en: "held until resolved", ar: "معلّق حتى المعالجة" }) : undefined} />
        )}
        <Amount label={L({ en: "To AP suspense 2190", ar: "إلى الحساب المعلّق 2190" })} value={t.toSuspense} tone={t.toSuspense ? "warning" : undefined} />
        <Amount
          label={t.correctedVat ? L({ en: "VAT over-charged", ar: "ضريبة زائدة" }) : L({ en: "To recover", ar: "للاسترداد" })}
          value={t.recover}
          tone={t.recover ? "danger" : undefined}
          sub={t.creditBalance ? L({ en: `${t.creditBalance.qty} units still uncredited`, ar: `${t.creditBalance.qty} وحدة دون إشعار` }) : t.correctedVat ? `${fmt2(t.correctedVat.charged)} → ${fmt2(t.correctedVat.expected)}` : undefined}
        />
      </div>
      <div className="flex items-start gap-2.5 rounded-md border border-border px-3 py-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-[10px] font-medium text-background">
          {t.approver.name
            .split(" ")
            .map((p) => p[0])
            .join("")}
        </span>
        <div className="min-w-0 text-[12px]">
          <div className="font-medium">
            {t.approver.name} <span className="font-normal text-muted-foreground">· {t.approver.title}</span>
          </div>
          <div className="text-[11.5px] text-muted-foreground">{L({ en: t.approver.rule, ar: t.approver.ruleAr })}</div>
        </div>
        <StatusPill tone={t.approver.amount > (t.approver.threshold ?? Infinity) ? "info" : "neutral"} className="ms-auto">
          {t.approver.amount > (t.approver.threshold ?? Infinity) ? L({ en: "Escalated", ar: "مُصعَّد" }) : L({ en: "Within AP limit", ar: "ضمن صلاحية الحسابات" })}
        </StatusPill>
      </div>
      <JournalTable lines={t.journal.lines} memo={t.journal.memo} posted={posted} />
    </div>
  );
}

function EmailCard({ to, cc, subject, body, streaming, sent }: { to: string; cc?: string; subject: string; body: string; streaming?: boolean; sent?: boolean }) {
  const L = useL();
  return (
    <div className={cn("overflow-hidden rounded-md border", sent ? "border-success/30" : "border-border")}>
      <div className={cn("flex items-center gap-2 border-b px-3 py-2", sent ? "border-success/25 bg-success-soft/50" : "border-border bg-muted/50")}>
        <Mail className="size-3.5 text-muted-foreground" />
        <span className="label-caps !text-[9.5px]">{sent ? L({ en: "Sent to supplier", ar: "أُرسلت إلى المورد" }) : L({ en: "Supplier email — draft", ar: "رسالة المورد — مسودة" })}</span>
        {streaming && <span className="ms-auto text-[10.5px] text-ai">{L({ en: "writing…", ar: "قيد الكتابة…" })}</span>}
      </div>
      <div className="space-y-1 border-b border-border px-3 py-2 text-[12px]">
        <div className="flex gap-2">
          <span className="w-14 shrink-0 text-muted-foreground">{L({ en: "To", ar: "إلى" })}</span>
          <span className="font-mono text-[11.5px]">{to}</span>
        </div>
        {cc && (
          <div className="flex gap-2">
            <span className="w-14 shrink-0 text-muted-foreground">Cc</span>
            <span className="font-mono text-[11.5px]">{cc}</span>
          </div>
        )}
        <div className="flex gap-2">
          <span className="w-14 shrink-0 text-muted-foreground">{L({ en: "Subject", ar: "الموضوع" })}</span>
          <span className="font-medium">{subject}</span>
        </div>
      </div>
      <div className="space-y-1.5 px-3 py-3 text-[12.5px] leading-relaxed">
        {body.split(/\n/).map((line, i) => (
          <p key={i} dir="auto" className={cn(!line.trim() && "h-2")}>
            {line}
          </p>
        ))}
        {streaming && <span className="inline-block h-3.5 w-1.5 animate-pulse bg-ai align-middle" />}
      </div>
    </div>
  );
}

function evidenceLine(e: { text: string; cites: number[] }) {
  const inline = Array.from(e.text.matchAll(/\[(\d+)\]/g)).map((m) => Number(m[1]));
  const all = Array.from(new Set([...inline, ...e.cites])).sort((a, b) => a - b);
  return `${e.text.replace(/\s*\[\d+\]/g, "").trim()} ${all.map((n) => `[${n}]`).join("")}`;
}

function CaseBody({ ai, citations }: { ai: CaseAi; citations: Citation[] }) {
  const L = useL();
  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
      <div>
        <div className="label-caps mb-1.5 flex items-center gap-1.5 text-ai">
          <Sparkles className="size-3" />
          {L({ en: "Resolution case", ar: "ملف المعالجة" })}
        </div>
        <h3 className="text-[18px] leading-snug font-light tracking-tight" dir="auto">
          {ai.headline}
        </h3>
        <Markdown citations={citations} className="mt-2">
          {ai.explanation}
        </Markdown>
      </div>
      <div>
        <div className="label-caps mb-1.5">{L({ en: "Evidence", ar: "الأدلة" })}</div>
        <ul className="divide-y divide-border rounded-md border border-border">
          {ai.evidence.map((e, i) => (
            <li key={i} className="px-3 py-2">
              <Markdown citations={citations} className="!text-[12.5px] [&_p]:my-0">
                {evidenceLine(e)}
              </Markdown>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-md border border-ai/25 bg-ai-soft/50 px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="label-caps !text-[9.5px]">{L({ en: "Recommended treatment", ar: "المعالجة الموصى بها" })}</span>
          <span className="text-[12.5px] font-medium">{L(TREATMENT_LABELS[ai.recommendation.treatment])}</span>
          <span className={cn("ms-auto flex items-center gap-1 text-[11px]", ai.recommendation.agrees ? "text-success" : "text-warning")}>
            {ai.recommendation.agrees ? <CheckCircle2 className="size-3.5" /> : <CircleAlert className="size-3.5" />}
            {ai.recommendation.agrees
              ? L({ en: "agrees with the computed treatment", ar: "يتفق مع المعالجة المحتسبة" })
              : L({ en: "differs from the computed treatment — review", ar: "يختلف عن المعالجة المحتسبة — للمراجعة" })}
          </span>
        </div>
        <Markdown citations={citations} className="mt-1 !text-[12.5px] [&_p]:my-0.5">
          {ai.recommendation.rationale}
        </Markdown>
      </div>
      {ai.nextSteps.length > 0 && (
        <div>
          <div className="label-caps mb-1.5">{L({ en: "Next steps", ar: "الخطوات التالية" })}</div>
          <ol className="list-decimal space-y-0.5 ps-5 text-[12.5px] text-muted-foreground" dir="auto">
            {ai.nextSteps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </div>
      )}
    </motion.div>
  );
}

export function ResolutionTab({
  inv,
  match,
  preview,
  run,
  live,
  stored,
  approvalStatus,
  journal,
  email,
  onBuild,
  onDecided,
  supplierEmail,
}: {
  supplierEmail: string;
  inv: Invoice;
  match: MatchResult;
  preview: Treatment;
  run: NarvoRun;
  live: boolean;
  stored?: StoredCase;
  approvalStatus?: "pending" | "approved" | "rejected";
  journal?: JournalEntry;
  email?: OutboxEmail;
  onBuild: () => void;
  onDecided: () => void;
}) {
  const L = useL();
  const f = useFormat();
  const running = live && run.running;
  const t: Treatment = (live && run.data.treatment) || stored?.treatment || preview;
  const ai: CaseAi | undefined = (live && run.data.case) || stored?.ai;
  const citations: Citation[] = (live && run.data.citations) || stored?.citations || [];
  const liveEmail = live ? run.text.email : undefined;
  const approval: ApprovalSummary | undefined = (live && run.approvals[0]) || (stored?.approval ? { ...stored.approval, status: approvalStatus ?? stored.approval.status } : undefined);

  /* Resolved */
  if (inv.status !== "received") {
    const s = STATUS_LABEL[inv.status];
    return (
      <div className="@container space-y-5">
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-success/30 bg-success-soft/50 px-3.5 py-3">
          <CheckCircle2 className="size-4 text-success" />
          <div className="text-[12.5px]">
            <span className="font-medium">
              {inv.status === "on_hold" ? L({ en: "Treatment applied", ar: "تم تطبيق المعالجة" }) : L({ en: "Resolved", ar: "تمت المعالجة" })}
            </span>{" "}
            <StatusPill tone={s.tone} className="ms-1">
              {L(s)}
            </StatusPill>
            <span className="ms-2 text-muted-foreground">
              {journal?.approvedBy ? `${L({ en: "approved by", ar: "اعتمدها" })} ${journal.approvedBy}` : ""} {inv.resolvedAt ? `· ${f.date(inv.resolvedAt)} ${f.time(inv.resolvedAt)}` : ""}
            </span>
          </div>
          <span className="num ms-auto text-[12.5px]">
            {L({ en: "Payable", ar: "المستحق" })} <span className="font-medium">AED {fmt2(inv.payableAmount ?? 0)}</span>
          </span>
        </div>
        {inv.poRefCorrected && (
          <p className="text-[12px] text-muted-foreground">
            {L({ en: "PO reference corrected", ar: "تم تصحيح مرجع أمر الشراء" })}: <span className="font-mono line-through">{inv.poRef}</span> →{" "}
            <span className="font-mono text-foreground">{inv.poRefCorrected}</span>
          </p>
        )}
        {journal && <JournalTable lines={journal.lines} memo={journal.memo} id={journal.id} posted />}
        {email && <EmailCard to={email.to} cc={email.cc} subject={email.subject} body={email.body} sent />}
        {stored?.ai && <CaseBody ai={stored.ai} citations={stored.citations} />}
      </div>
    );
  }

  /* Auto-matched */
  if (!match.exception) {
    return (
      <div className="@container space-y-4">
        <div className="flex items-center gap-3 rounded-md border border-success/30 bg-success-soft/50 px-3.5 py-3 text-[12.5px]">
          <CheckCircle2 className="size-4 text-success" />
          <span>
            {L({
              en: `Auto-matched — released to the payment proposal for its due date ${f.date(inv.dueDate)}. No human touch needed.`,
              ar: `مطابقة آلية — أُدرجت في مقترح السداد بتاريخ استحقاقها ${f.date(inv.dueDate)}. لا تحتاج تدخلاً بشرياً.`,
            })}
          </span>
        </div>
        <TreatmentBlock t={preview} />
      </div>
    );
  }

  /* Open exception */
  return (
    <div className="@container space-y-5">
      <TreatmentBlock t={t} />

      {!ai && !running && (
        <div className="flex flex-wrap items-center gap-4 rounded-md border border-dashed border-border-strong bg-surface px-4 py-4">
          <Wand2 className="size-5 shrink-0 text-ai" strokeWidth={1.6} />
          <div className="min-w-0 flex-1 text-[12.5px]">
            <div className="font-medium">{L({ en: "Build the resolution case", ar: "ابنِ ملف المعالجة" })}</div>
            <p className="text-muted-foreground">
              {L({
                en: "The agent cites the PO, GRN, invoice and policy, confirms the treatment above and drafts the supplier email — then routes it for approval.",
                ar: "يستشهد الوكيل بأمر الشراء والاستلام والفاتورة والسياسة، ويؤكد المعالجة أعلاه، ويصوغ رسالة المورد — ثم يوجّهها للاعتماد.",
              })}
            </p>
          </div>
          <RunButton running={false} onRun={onBuild} icon={<Sparkles />}>
            {L({ en: "Build case", ar: "بناء الملف" })}
          </RunButton>
        </div>
      )}

      {live && run.status === "error" && (
        <div className="rounded-md border border-danger/25 bg-danger-soft p-3 text-[12px] text-danger">
          {errorText(run.error)}
          <Button size="sm" variant="outline" className="ms-3" onClick={onBuild}>
            {L({ en: "Retry", ar: "إعادة المحاولة" })}
          </Button>
        </div>
      )}

      {running && !ai && (
        <div className="rounded-md border border-border p-4">
          <p className="mb-3 text-[12px] text-muted-foreground">{L({ en: "Assembling evidence and writing the case…", ar: "جمع الأدلة وصياغة الملف…" })}</p>
          <ThinkingLines lines={5} />
        </div>
      )}

      {ai && <CaseBody ai={ai} citations={citations} />}

      {(liveEmail || stored?.email) && (
        <EmailCard
          to={stored?.email.to ?? supplierEmail}
          cc={stored?.email.cc}
          subject={liveEmail ? (liveEmail.match(/^\s*Subject:\s*(.+)$/im)?.[1] ?? "…") : stored!.email.subject}
          body={liveEmail ? liveEmail.replace(/^\s*Subject:.*\n*/i, "") : stored!.email.body}
          streaming={running}
        />
      )}
      {running && ai && !liveEmail && <ThinkingLines lines={3} />}

      {approval && (
        <div className="space-y-2">
          <ApprovalCard key={`${approval.id}-${approval.status}`} approval={approval} onDecided={onDecided} />
          {approval.status === "pending" && !running && (
            <button type="button" onClick={onBuild} className="text-[11.5px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
              {L({ en: "Rebuild the case (supersedes the pending approval)", ar: "إعادة بناء الملف (يلغي طلب الاعتماد المعلّق)" })}
            </button>
          )}
          {approval.status === "rejected" && !running && (
            <RunButton running={false} onRun={onBuild} variant="outline" size="sm">
              {L({ en: "Build a new case", ar: "بناء ملف جديد" })}
            </RunButton>
          )}
        </div>
      )}
      {!approval && !running && ai && (
        <EmptyState title={L({ en: "Case built without an approval request", ar: "تم بناء الملف دون طلب اعتماد" })} className="py-6" />
      )}
    </div>
  );
}
