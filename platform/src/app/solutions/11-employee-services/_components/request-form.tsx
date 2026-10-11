"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { CircleAlert, CircleCheck, LoaderCircle, Send, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useL, usePrefs } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { ApprovalSummary } from "@/lib/ai/events";
import { FIELD_LABELS, OPTIONS, TYPE_META, type Draft, type ServiceRequest } from "../_lib/shared";

type Fields = Draft["fields"];

const READONLY = new Set(["workingDays", "assetTag"]);
const LONG = new Set(["justification", "purpose"]);

/** The structured request the assistant prepared — editable, re-validated on the server, then submitted. */
export function RequestForm({
  draft,
  onDraft,
  onSubmitted,
}: {
  draft: Draft;
  onDraft: (d: Draft) => void;
  onSubmitted: (r: ServiceRequest, a: ApprovalSummary) => void;
}) {
  const L = useL();
  const { lang } = usePrefs();
  const [fields, setFields] = useState<Fields>(draft.fields);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submitted = !!draft.submittedRequestId;

  // Re-sync only when a new form arrives — revalidation must not overwrite what the user is typing.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setFields(draft.fields), [draft.id]);

  function update(key: string, value: Fields[string]) {
    const next = { ...fields, [key]: value };
    setFields(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setChecking(true);
      try {
        const res = await fetch("/api/solutions/11-employee-services/requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "revalidate", draftId: draft.id, fields: next }),
        });
        if (res.ok) onDraft((await res.json()).draft);
      } finally {
        setChecking(false);
      }
    }, 450);
  }

  async function submit() {
    setBusy(true);
    try {
      const res = await fetch("/api/solutions/11-employee-services/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit", draftId: draft.id, fields }),
      });
      if (!res.ok) throw new Error(await res.text());
      const j = (await res.json()) as { request: ServiceRequest; approval: ApprovalSummary; draft: Draft };
      onDraft(j.draft);
      onSubmitted(j.request, j.approval);
      toast.success(L({ en: `Submitted as ${j.request.id}`, ar: `قُدّم الطلب برقم ${j.request.id}` }), {
        description: L({ en: `Routed to ${j.request.approver.name}`, ar: `أُحيل إلى ${j.request.approver.name}` }),
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const blocking = draft.checks.filter((c) => c.blocking);
  return (
    <motion.div
      initial={{ opacity: 1, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("rounded-lg border bg-card", submitted ? "border-success/30" : draft.eligible ? "border-ai/35" : "border-danger/30")}
    >
      <div className="flex items-start justify-between gap-2 border-b border-border px-3.5 py-2.5">
        <div className="min-w-0">
          <div className="label-caps !text-[9.5px]">
            {L({ en: "Request form", ar: "نموذج الطلب" })} · {L(TYPE_META[draft.type].label)} · {draft.queue}
          </div>
          <div className="mt-0.5 text-[13px] leading-snug font-medium" dir="auto">
            {L(draft.title)}
          </div>
        </div>
        <span className="shrink-0 font-mono text-[10px] text-faint">{draft.submittedRequestId ?? draft.id}</span>
      </div>

      <div className="space-y-2.5 px-3.5 py-3">
        {Object.entries(fields).map(([key, value]) => {
          const label = FIELD_LABELS[key] ? L(FIELD_LABELS[key]) : key;
          const opts = OPTIONS[key];
          const disabled = submitted || READONLY.has(key);
          let control;
          if (typeof value === "boolean") {
            control = (
              <label className="flex items-center gap-2 text-[12.5px]">
                <input type="checkbox" checked={value} disabled={disabled} onChange={(e) => update(key, e.target.checked)} className="accent-[var(--ai)]" />
                {value ? L({ en: "Yes", ar: "نعم" }) : L({ en: "No", ar: "لا" })}
              </label>
            );
          } else if (opts) {
            control = (
              <Select value={String(value ?? "")} onValueChange={(v) => update(key, v)} disabled={disabled}>
                <SelectTrigger size="sm" className="w-full text-[12.5px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {opts.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-[12.5px]">
                      {o.label[lang]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            );
          } else if (key === "startDate" || key === "endDate") {
            control = <Input type="date" value={String(value ?? "")} disabled={disabled} onChange={(e) => update(key, e.target.value)} className="h-7 text-[12.5px]" />;
          } else if (key === "dates") {
            control = (
              <Input
                value={Array.isArray(value) ? value.join(", ") : String(value ?? "")}
                disabled={disabled}
                onChange={(e) => update(key, e.target.value)}
                className="h-7 font-mono text-[12px]"
                placeholder="2026-10-15, 2026-10-16"
              />
            );
          } else if (LONG.has(key)) {
            control = <Textarea value={String(value ?? "")} disabled={disabled} dir="auto" rows={2} onChange={(e) => update(key, e.target.value)} className="min-h-12 text-[12.5px]" />;
          } else {
            control = <Input value={String(value ?? "")} disabled={disabled} dir="auto" onChange={(e) => update(key, e.target.value)} className="h-7 text-[12.5px]" />;
          }
          return (
            <div key={key} className="grid grid-cols-[110px_minmax(0,1fr)] items-start gap-2">
              <span className="pt-1 text-[11.5px] text-muted-foreground">{label}</span>
              {control}
            </div>
          );
        })}
      </div>

      <div className="border-t border-border px-3.5 py-2.5">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="label-caps !text-[9.5px]">{L({ en: "Eligibility & checks", ar: "الأهلية والتحقق" })}</span>
          {checking && <LoaderCircle className="size-3 animate-spin text-muted-foreground" />}
        </div>
        <ul className="space-y-1.5">
          {draft.checks.map((c) => (
            <li key={c.key} className="flex items-start gap-2 text-[12px]">
              {c.ok ? (
                <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-success" />
              ) : c.blocking ? (
                <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-danger" />
              ) : (
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
              )}
              <span className="min-w-0">
                <span className="font-medium">{L(c.label)}</span>
                <span className="text-muted-foreground" dir="auto">
                  {" "}
                  — {L(c.detail)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface px-3.5 py-2.5">
        <div className="text-[11.5px] leading-tight">
          <div className="text-muted-foreground">{L({ en: "Approver", ar: "المعتمِد" })}</div>
          <div className="font-medium">{draft.approver.name}</div>
          <div className="text-[10.5px] text-muted-foreground">
            {draft.approver.title} · SLA {draft.slaDays} {L({ en: draft.slaDays > 1 ? "working days" : "working day", ar: "يوم عمل" })}
          </div>
        </div>
        {submitted ? (
          <span className="text-[12px] font-medium text-success">{L({ en: "Submitted", ar: "تم التقديم" })} · {draft.submittedRequestId}</span>
        ) : (
          <Button size="sm" onClick={submit} disabled={!draft.eligible || busy || checking}>
            {busy ? <LoaderCircle className="animate-spin" /> : <Send className="rtl:-scale-x-100" />}
            {draft.eligible ? L({ en: "Submit for approval", ar: "تقديم للاعتماد" }) : L({ en: `Not eligible (${blocking.length})`, ar: `غير مؤهل (${blocking.length})` })}
          </Button>
        )}
      </div>
    </motion.div>
  );
}
