"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Inbox, LoaderCircle, ScanText, Send } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useFormat, useL } from "@/lib/i18n";
import type { NarvoRun } from "@/hooks/use-narvo-run";
import type { ApprovalSummary } from "@/lib/ai/events";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RunButton } from "@/components/narvo/run-button";
import { StatusPill, type Tone } from "@/components/narvo/status";
import { EmptyState, ThinkingLines } from "@/components/narvo/empty";
import { ApprovalCard } from "@/components/narvo/approval-card";
import { FileDrop } from "@/components/narvo/file-drop";
import { VoiceButton } from "@/components/narvo/voice";
import { Block, ErrorBox, STAGE_LABEL, useMoney } from "./bits";
import type { IngestResult, Opportunity, Sample } from "../_lib/types";

interface Check {
  index: number;
  status: "ok" | "needs_approval" | "not_allowed" | "info";
  message: { en: string; ar: string };
  approver?: string;
  valueImpact?: number;
}

const CHECK_TONE: Record<Check["status"], Tone> = { ok: "success", needs_approval: "warning", not_allowed: "danger", info: "neutral" };
const CHECK_LABEL: Record<Check["status"], { en: string; ar: string }> = {
  ok: { en: "Within policy", ar: "ضمن السياسة" },
  needs_approval: { en: "Needs approval", ar: "يحتاج اعتماداً" },
  not_allowed: { en: "Not allowed", ar: "غير مسموح" },
  info: { en: "Noted", ar: "للعلم" },
};
const SENTIMENT_TONE: Record<string, Tone> = { positive: "success", neutral: "neutral", negative: "danger", urgent: "warning" };
const TOPIC_LABEL: Record<string, { en: string; ar: string }> = {
  price: { en: "Price", ar: "السعر" },
  payment_terms: { en: "Payment terms", ar: "شروط السداد" },
  delivery: { en: "Delivery", ar: "التسليم" },
  quantity: { en: "Quantity", ar: "الكمية" },
  validity: { en: "Validity / fixed price", ar: "الصلاحية / تثبيت السعر" },
  retention: { en: "Retention", ar: "المحتجزات" },
  other: { en: "Other", ar: "أخرى" },
};

export function ByoTab({
  opp,
  samples,
  run,
  onRun,
  approval,
  onApprovalCreated,
  onDecided,
}: {
  opp: Opportunity;
  samples: Sample[];
  run: NarvoRun;
  onRun: (text: string) => void;
  approval: ApprovalSummary | null;
  onApprovalCreated: (a: ApprovalSummary) => void;
  onDecided: (id: string, status: "approved" | "rejected") => void;
}) {
  const L = useL();
  const f = useFormat();
  const m = useMoney();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const result = run.data.ingest as IngestResult | undefined;
  const checks = (run.data.checks as Check[] | undefined) ?? [];

  async function log() {
    if (!result) return;
    setBusy(true);
    try {
      const res = await fetch("/api/solutions/08-sales-intelligence/crm-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opportunityId: opp.id,
          kind: "inbound_log",
          actionTitle: result.intent.slice(0, 180),
          crmUpdate: {
            stage: result.proposedCrm.stage,
            nextStep: result.proposedCrm.nextStep,
            nextStepDate: result.proposedCrm.nextStepDate,
            probability: result.proposedCrm.probability,
            note: result.proposedCrm.note,
          },
          inbound: { from: result.sender, subject: null, body: text, summary: result.summary, language: result.language },
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? res.statusText);
      onApprovalCreated(j.approval);
      toast.success(L({ en: "CRM update sent for approval", ar: "أُرسل تحديث السجل للاعتماد" }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const oppSamples = samples.filter((s) => s.opportunityId === opp.id);
  const otherSamples = samples.filter((s) => s.opportunityId !== opp.id);

  return (
    <div className="space-y-4">
      <Block label={L({ en: "Bring your own customer message", ar: "أضف رسالة متعامل من عندك" })}>
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11.5px] text-muted-foreground">{L({ en: "Samples:", ar: "أمثلة:" })}</span>
          {[...oppSamples, ...otherSamples].map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setText(s.text)}
              disabled={s.opportunityId !== opp.id}
              title={s.opportunityId !== opp.id ? s.opportunityId : undefined}
              className="rounded-md border border-border bg-card px-2 py-1 text-[11.5px] text-muted-foreground transition-colors hover:border-ai/40 hover:text-foreground disabled:opacity-40"
            >
              {L(s.label)}
            </button>
          ))}
        </div>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          dir="auto"
          placeholder={L({
            en: "Paste a customer email, WhatsApp thread or call note — English, Arabic or mixed…",
            ar: "الصق بريد متعامل أو محادثة واتساب أو ملاحظة مكالمة — بالعربية أو الإنجليزية أو مختلطة…",
          })}
          className="min-h-[150px] bg-card text-[12.5px] leading-relaxed"
        />
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <FileDrop
            compact
            accept=".txt,.eml,.md"
            className="min-w-[220px] flex-1"
            label={L({ en: "Or drop an .eml / .txt", ar: "أو أسقط ملف ‎.eml / .txt" })}
            hint={L({ en: "Read on this machine", ar: "يُقرأ على هذا الجهاز" })}
            onFiles={(files) => files[0]?.text && setText(files[0].text)}
          />
          <VoiceButton size="md" onTranscript={(t) => setText((cur) => (cur ? `${cur}\n${t.text}` : t.text))} onError={(e) => toast.error(e)} />
          <RunButton running={run.running} onRun={() => onRun(text)} onStop={run.abort} disabled={text.trim().length < 15} icon={<ScanText className="size-4" />}>
            {L({ en: "Analyse message", ar: "حلّل الرسالة" })}
          </RunButton>
        </div>
      </Block>

      {run.status === "error" && <ErrorBox message={run.error} onRetry={() => onRun(text)} />}
      {run.running && !result && (
        <Block>
          <ThinkingLines lines={5} />
        </Block>
      )}
      {!result && !run.running && run.status !== "error" && (
        <EmptyState icon={<Inbox className="size-4" />} title={L({ en: "Turn a message into a CRM update", ar: "حوّل الرسالة إلى تحديث في السجل" })}>
          {L({
            en: `NARVO extracts intent, requested changes and claims, checks each request against ${opp.id}'s frame agreement and credit policy, and proposes the CRM update for approval.`,
            ar: `يستخرج نارفو الغرض والتغييرات المطلوبة والادعاءات، ويفحص كل طلب مقابل اتفاقية الإطار وسياسة الائتمان للفرصة ${opp.id}، ويقترح تحديث السجل للاعتماد.`,
          })}
        </EmptyState>
      )}

      {result && (
        <motion.div initial={{ opacity: 1, y: 4 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <Block
            label={L({ en: "What the customer wants", ar: "ما يريده المتعامل" })}
            actions={
              <span className="flex items-center gap-1.5">
                <StatusPill tone={SENTIMENT_TONE[result.sentiment] ?? "neutral"}>{result.sentiment}</StatusPill>
                <StatusPill tone="neutral" dot={false}>
                  {result.language === "ar" ? "العربية" : result.language === "mixed" ? L({ en: "Mixed AR/EN", ar: "مختلطة" }) : "English"}
                </StatusPill>
              </span>
            }
          >
            <div className="text-[11.5px] text-muted-foreground" dir="auto">
              {result.sender}
            </div>
            <p className="mt-1 text-[15px] font-light leading-snug" dir="auto">
              {result.intent}
            </p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground" dir="auto">
              {result.summary}
            </p>
          </Block>

          <Block label={L({ en: `Requested changes · ${result.requestedChanges.length}`, ar: `التغييرات المطلوبة · ${result.requestedChanges.length}` })}>
            <ul className="-mx-3.5 -my-3.5 divide-y divide-border">
              {result.requestedChanges.map((c, i) => {
                const chk = checks.find((x) => x.index === i);
                return (
                  <li key={i} className="grid grid-cols-[110px_minmax(0,1fr)_auto] gap-3 px-3.5 py-2.5 max-md:grid-cols-1">
                    <div>
                      <div className="text-[12px] font-medium">{L(TOPIC_LABEL[c.topic] ?? TOPIC_LABEL.other)}</div>
                      {c.sku && <div className="font-mono text-[10.5px] text-muted-foreground">{c.sku}</div>}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[12.5px]" dir="auto">
                        {c.requested}
                      </div>
                      <div className="mt-0.5 border-s-2 border-border-strong ps-2 text-[11.5px] text-muted-foreground italic" dir="auto">
                        “{c.quote}”
                      </div>
                      {chk && (
                        <div className={cn("mt-1 text-[11.5px]", chk.status === "not_allowed" ? "text-danger" : chk.status === "needs_approval" ? "text-warning" : "text-muted-foreground")} dir="auto">
                          {L(chk.message)}
                          {chk.approver && <span className="text-muted-foreground"> · {chk.approver}</span>}
                          {chk.valueImpact != null && <span className="num text-foreground"> · {m.aed(chk.valueImpact)}</span>}
                        </div>
                      )}
                    </div>
                    <div>{chk && <StatusPill tone={CHECK_TONE[chk.status]}>{L(CHECK_LABEL[chk.status])}</StatusPill>}</div>
                  </li>
                );
              })}
            </ul>
          </Block>

          {(result.deadlines.length > 0 || result.claims.length > 0) && (
            <div className="grid grid-cols-2 gap-3 max-lg:grid-cols-1">
              {result.deadlines.length > 0 && (
                <Block label={L({ en: "Deadlines", ar: "المواعيد" })}>
                  <ul className="space-y-1 text-[12.5px]">
                    {result.deadlines.map((d, i) => (
                      <li key={i} className="flex gap-2" dir="auto">
                        <span className="num w-16 shrink-0 font-medium">{d.date ? f.date(d.date, { day: "numeric", month: "short" }) : "—"}</span>
                        <span className="text-muted-foreground">{d.what}</span>
                      </li>
                    ))}
                  </ul>
                </Block>
              )}
              {result.claims.length > 0 && (
                <Block label={L({ en: "Claims to verify", ar: "ادعاءات للتحقق" })}>
                  <ul className="space-y-1 text-[12.5px]">
                    {result.claims.map((c, i) => (
                      <li key={i} className="flex gap-1.5" dir="auto">
                        <span className="mt-1.5 size-1 shrink-0 rounded-full bg-warning" />
                        {c}
                      </li>
                    ))}
                  </ul>
                </Block>
              )}
            </div>
          )}

          <Block label={L({ en: "Proposed CRM update", ar: "تحديث السجل المقترح" })}>
            <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-y-1.5 text-[12.5px]">
              <span className="text-muted-foreground">{L({ en: "Next step", ar: "الخطوة التالية" })}</span>
              <span dir="auto">{result.proposedCrm.nextStep}</span>
              <span className="text-muted-foreground">{L({ en: "Due", ar: "الموعد" })}</span>
              <span className="num">{result.proposedCrm.nextStepDate}</span>
              {result.proposedCrm.stage && (
                <>
                  <span className="text-muted-foreground">{L({ en: "Stage", ar: "المرحلة" })}</span>
                  <span>{L(STAGE_LABEL[result.proposedCrm.stage])}</span>
                </>
              )}
              {result.proposedCrm.probability != null && (
                <>
                  <span className="text-muted-foreground">{L({ en: "Probability", ar: "الاحتمال" })}</span>
                  <span className="num">{result.proposedCrm.probability}%</span>
                </>
              )}
              <span className="text-muted-foreground">{L({ en: "Note", ar: "ملاحظة" })}</span>
              <span className="text-muted-foreground" dir="auto">
                {result.proposedCrm.note}
              </span>
            </div>
            {!approval && (
              <div className="mt-3 flex items-center justify-end gap-2 border-t border-border pt-3">
                <span className="text-[11.5px] text-muted-foreground">{L({ en: "Logs the message and updates the opportunity after approval", ar: "يسجّل الرسالة ويحدّث الفرصة بعد الاعتماد" })}</span>
                <Button size="sm" onClick={log} disabled={busy}>
                  {busy ? <LoaderCircle className="animate-spin" /> : <Send />}
                  {L({ en: "Log to CRM", ar: "سجّل في النظام" })}
                </Button>
              </div>
            )}
          </Block>
          {approval && <ApprovalCard key={`${approval.id}-${approval.status}`} approval={approval} onDecided={(s) => onDecided(approval.id, s)} />}
        </motion.div>
      )}
    </div>
  );
}
