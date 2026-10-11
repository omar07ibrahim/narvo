"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { CircleCheck, Compass, LoaderCircle, Send, ShieldAlert, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useFormat, useL } from "@/lib/i18n";
import type { NarvoRun } from "@/hooks/use-narvo-run";
import type { ApprovalSummary, Citation } from "@/lib/ai/events";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/narvo/markdown";
import { RunButton } from "@/components/narvo/run-button";
import { StatusPill } from "@/components/narvo/status";
import { EmptyState, ThinkingLines } from "@/components/narvo/empty";
import { ApprovalCard } from "@/components/narvo/approval-card";
import { Block, ErrorBox, normCites, STAGE_LABEL } from "./bits";
import { checkDraft, type ConflictReport } from "../_lib/calc";
import { ALL_STAGES, type GuardrailFlag, type NextAction, type Opportunity, type Stage } from "../_lib/types";

function Seg<T extends string>({ value, options, onChange }: { value: T; options: Array<{ v: T; label: string }>; onChange: (v: T) => void }) {
  return (
    <div className="flex items-center rounded-md border border-border bg-card p-0.5">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={cn("h-6 rounded-[5px] px-2.5 text-[11.5px] transition-colors", value === o.v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function GuardrailList({ flags }: { flags: GuardrailFlag[] }) {
  const L = useL();
  if (!flags.length)
    return (
      <div className="flex items-center gap-2 rounded-md border border-success/25 bg-success-soft/60 px-3 py-2 text-[12px] text-success">
        <CircleCheck className="size-3.5" />
        {L({ en: "Within authority — no prices below frame, no extended terms, no out-of-window deliveries.", ar: "ضمن الصلاحيات — لا أسعار أقل من الاتفاقية ولا شروط سداد ممتدة ولا تسليم خارج النافذة." })}
      </div>
    );
  return (
    <ul className="space-y-1.5">
      {flags.map((g) => (
        <li
          key={g.id}
          className={cn(
            "flex items-start gap-2 rounded-md border px-3 py-2 text-[12px]",
            g.severity === "high" ? "border-danger/25 bg-danger-soft/60 text-danger" : "border-warning/25 bg-warning-soft/60 text-warning",
          )}
        >
          {g.severity === "high" ? <ShieldAlert className="mt-0.5 size-3.5 shrink-0" /> : <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />}
          <span>
            <span className="font-mono text-[11px] opacity-80">“{g.match}”</span> — {L(g.message)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ActionTab({
  opp,
  today,
  report,
  run,
  onRun,
  onCite,
  approval,
  onApprovalCreated,
  onDecided,
}: {
  opp: Opportunity;
  today: string;
  report: ConflictReport;
  run: NarvoRun;
  onRun: (opts: { channel: "email" | "whatsapp"; draftLang: "en" | "ar"; instruction: string }) => void;
  onCite: (n: number) => void;
  approval: ApprovalSummary | null;
  onApprovalCreated: (a: ApprovalSummary) => void;
  onDecided: (id: string, status: "approved" | "rejected") => void;
}) {
  const L = useL();
  const f = useFormat();
  const [channel, setChannel] = useState<"email" | "whatsapp">("email");
  const [draftLang, setDraftLang] = useState<"en" | "ar">("en");
  const [instruction, setInstruction] = useState("");
  const action = run.data.action as NextAction | undefined;
  const citations = run.data.citations as Citation[] | undefined;
  const [edit, setEdit] = useState<NextAction | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (action) setEdit(structuredClone(action));
  }, [action]);

  const flags = useMemo(() => (edit ? checkDraft(`${edit.draft.subject ?? ""}\n${edit.draft.body}`, report, report.tierMaxTerms) : []), [edit, report]);

  async function submit() {
    if (!edit) return;
    setBusy(true);
    try {
      const res = await fetch("/api/solutions/08-sales-intelligence/crm-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opportunityId: opp.id,
          kind: "follow_up",
          actionTitle: edit.action.title,
          crmUpdate: edit.crmUpdate,
          draft: edit.draft,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? res.statusText);
      onApprovalCreated(j.approval);
      toast.success(L({ en: "Sent to Fadi Khoury for approval", ar: "أُرسل إلى فادي خوري للاعتماد" }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const set = (fn: (d: NextAction) => void) =>
    setEdit((cur) => {
      if (!cur) return cur;
      const next = structuredClone(cur);
      fn(next);
      return next;
    });

  const locked = !!approval;

  return (
    <div className="space-y-4">
      <Block label={L({ en: "Next best action", ar: "الخطوة التالية الأفضل" })}>
        <div className="flex flex-wrap items-center gap-2">
          <Seg
            value={channel}
            onChange={setChannel}
            options={[
              { v: "email", label: L({ en: "Email", ar: "بريد" }) },
              { v: "whatsapp", label: L({ en: "WhatsApp", ar: "واتساب" }) },
            ]}
          />
          <Seg
            value={draftLang}
            onChange={setDraftLang}
            options={[
              { v: "en", label: "English" },
              { v: "ar", label: "العربية" },
            ]}
          />
          <Input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder={L({ en: "Optional instruction — e.g. propose a call on Monday", ar: "تعليمات اختيارية — مثلاً اقترح اتصالاً يوم الاثنين" })}
            className="h-7 min-w-[220px] flex-1 text-[12px]"
          />
          <RunButton running={run.running} onRun={() => onRun({ channel, draftLang, instruction })} onStop={run.abort} size="sm" icon={<Compass className="size-3.5" />}>
            {L({ en: "Propose next action", ar: "اقترح الخطوة التالية" })}
          </RunButton>
        </div>
      </Block>

      {run.status === "error" && <ErrorBox message={run.error} onRetry={() => onRun({ channel, draftLang, instruction })} />}
      {run.running && !action && (
        <Block>
          <ThinkingLines lines={6} />
        </Block>
      )}
      {!edit && !run.running && run.status !== "error" && (
        <EmptyState icon={<Compass className="size-4" />} title={L({ en: "Move this deal forward", ar: "حرّك هذه الصفقة إلى الأمام" })}>
          {L({
            en: "NARVO proposes the single next action, the CRM update and a follow-up in English or Arabic. Code checks the draft against the frame agreement and credit policy; the Sales Director approves before anything is sent.",
            ar: "يقترح نارفو الخطوة التالية وتحديث السجل ورسالة متابعة بالعربية أو الإنجليزية. يفحص النظام المسودة مقابل الاتفاقية وسياسة الائتمان، ويعتمد مدير المبيعات قبل الإرسال.",
          })}
        </EmptyState>
      )}

      {edit && (
        <motion.div initial={{ opacity: 1, y: 4 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="rounded-lg border border-ai/25 bg-ai-soft/40 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="label-caps text-ai">{L({ en: "Recommended", ar: "المقترح" })}</span>
              <StatusPill tone={edit.action.urgency === "today" ? "danger" : edit.action.urgency === "this_week" ? "warning" : "neutral"}>
                {edit.action.urgency === "today" ? L({ en: "Today", ar: "اليوم" }) : edit.action.urgency === "this_week" ? L({ en: "This week", ar: "هذا الأسبوع" }) : L({ en: "Later", ar: "لاحقاً" })}
              </StatusPill>
            </div>
            <div className="mt-1.5 text-[16px] font-light leading-snug" dir="auto">
              {edit.action.title}
            </div>
            <Markdown citations={citations} onCite={onCite} className="mt-1.5 text-[12.5px]">
              {normCites(edit.action.rationale)}
            </Markdown>
          </div>

          <Block label={L({ en: "CRM update", ar: "تحديث السجل" })}>
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="label-caps !text-[9.5px] w-[110px] pb-1.5 text-start font-medium">{L({ en: "Field", ar: "الحقل" })}</th>
                  <th className="label-caps !text-[9.5px] pb-1.5 text-start font-medium">{L({ en: "Current", ar: "الحالي" })}</th>
                  <th className="label-caps !text-[9.5px] pb-1.5 text-start font-medium">{L({ en: "Proposed", ar: "المقترح" })}</th>
                </tr>
              </thead>
              <tbody className="align-top">
                <tr className="border-t border-border">
                  <td className="py-1.5 text-muted-foreground">{L({ en: "Stage", ar: "المرحلة" })}</td>
                  <td className="py-1.5">{L(STAGE_LABEL[opp.stage])}</td>
                  <td className="py-1.5">
                    <select
                      disabled={locked}
                      value={edit.crmUpdate.stage}
                      onChange={(e) => set((d) => void (d.crmUpdate.stage = e.target.value as Stage))}
                      className={cn("h-7 rounded-md border border-input bg-card px-1.5 text-[12px]", edit.crmUpdate.stage !== opp.stage && "border-ai/50 text-ai")}
                    >
                      {ALL_STAGES.map((s) => (
                        <option key={s} value={s}>
                          {L(STAGE_LABEL[s])}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
                <tr className="border-t border-border">
                  <td className="py-1.5 text-muted-foreground">{L({ en: "Next step", ar: "الخطوة التالية" })}</td>
                  <td className="py-1.5 pe-3 text-muted-foreground line-through decoration-faint" dir="auto">
                    {L({ en: opp.nextStep, ar: opp.nextStepAr || opp.nextStep })}
                  </td>
                  <td className="py-1.5">
                    <Input disabled={locked} value={edit.crmUpdate.nextStep} onChange={(e) => set((d) => void (d.crmUpdate.nextStep = e.target.value))} className="h-7 text-[12px]" dir="auto" />
                  </td>
                </tr>
                <tr className="border-t border-border">
                  <td className="py-1.5 text-muted-foreground">{L({ en: "Due", ar: "الموعد" })}</td>
                  <td className={cn("num py-1.5", opp.nextStepDate && opp.nextStepDate < today ? "text-danger" : "text-muted-foreground")}>
                    {opp.nextStepDate ? f.date(opp.nextStepDate, { day: "numeric", month: "short", year: "numeric" }) : "—"}
                  </td>
                  <td className="py-1.5">
                    <Input disabled={locked} type="date" value={edit.crmUpdate.nextStepDate} onChange={(e) => set((d) => void (d.crmUpdate.nextStepDate = e.target.value))} className="num h-7 w-40 text-[12px]" />
                  </td>
                </tr>
                <tr className="border-t border-border">
                  <td className="py-1.5 text-muted-foreground">{L({ en: "Probability", ar: "الاحتمال" })}</td>
                  <td className="num py-1.5">{opp.probability}%</td>
                  <td className="py-1.5">
                    <Input
                      disabled={locked}
                      type="number"
                      min={0}
                      max={100}
                      value={edit.crmUpdate.probability}
                      onChange={(e) => set((d) => void (d.crmUpdate.probability = Math.max(0, Math.min(100, Number(e.target.value) || 0))))}
                      className="num h-7 w-24 text-[12px]"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
            {edit.crmUpdate.note && (
              <p className="mt-2 text-[11.5px] text-muted-foreground" dir="auto">
                {edit.crmUpdate.note}
              </p>
            )}
          </Block>

          <Block
            label={edit.draft.channel === "whatsapp" ? L({ en: "WhatsApp draft", ar: "مسودة واتساب" }) : L({ en: "Email draft", ar: "مسودة البريد" })}
            actions={<span className="text-[11px] text-muted-foreground">{edit.draft.language === "ar" ? "العربية" : "English"}</span>}
          >
            <div className="space-y-2">
              <div className="grid grid-cols-[70px_minmax(0,1fr)] items-center gap-2 text-[12px]">
                <span className="text-muted-foreground">{L({ en: "To", ar: "إلى" })}</span>
                <Input disabled={locked} value={edit.draft.to} onChange={(e) => set((d) => void (d.draft.to = e.target.value))} className="h-7 text-[12px]" dir="auto" />
                {edit.draft.channel === "email" && (
                  <>
                    <span className="text-muted-foreground">{L({ en: "Subject", ar: "الموضوع" })}</span>
                    <Input disabled={locked} value={edit.draft.subject ?? ""} onChange={(e) => set((d) => void (d.draft.subject = e.target.value))} className="h-7 text-[12px]" dir="auto" />
                  </>
                )}
              </div>
              <Textarea
                disabled={locked}
                value={edit.draft.body}
                onChange={(e) => set((d) => void (d.draft.body = e.target.value))}
                dir={edit.draft.language === "ar" ? "rtl" : "ltr"}
                className="min-h-[220px] bg-card text-[13px] leading-relaxed"
              />
            </div>
            {edit.commitmentsInDraft.length > 0 && (
              <div className="mt-3">
                <div className="label-caps mb-1 !text-[9.5px]">{L({ en: "What this draft commits RBM to", ar: "ما تلتزم به رصين في هذه المسودة" })}</div>
                <ul className="space-y-0.5 text-[12px]">
                  {edit.commitmentsInDraft.map((c, i) => (
                    <li key={i} className="flex gap-1.5" dir="auto">
                      <span className="mt-1.5 size-1 shrink-0 rounded-full bg-foreground/50" />
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-3">
              <div className="label-caps mb-1.5 !text-[9.5px]">{L({ en: "Guardrails (computed)", ar: "الضوابط (محسوبة)" })}</div>
              <GuardrailList flags={flags} />
            </div>
            {!approval && (
              <div className="mt-3 flex items-center justify-end gap-2 border-t border-border pt-3">
                <span className="text-[11.5px] text-muted-foreground">{L({ en: "Approver: Fadi Khoury, Sales Director", ar: "المعتمِد: فادي خوري، مدير المبيعات" })}</span>
                <Button size="sm" onClick={submit} disabled={busy || edit.draft.body.trim().length < 10}>
                  {busy ? <LoaderCircle className="animate-spin" /> : <Send />}
                  {L({ en: "Submit for approval", ar: "إرسال للاعتماد" })}
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
