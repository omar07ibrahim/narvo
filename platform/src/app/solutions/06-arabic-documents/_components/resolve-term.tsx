"use client";

import { useState } from "react";
import { LoaderCircle, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApprovalCard } from "@/components/narvo/approval-card";
import { useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { ApprovalSummary } from "@/lib/ai/events";
import { TERMINOLOGIST, type Term } from "../_lib/shared";

/** Pick the right rendering of a disputed term and route it to the terminology specialist. */
export function ResolveTerm({
  term,
  docId,
  onApproved,
  className,
}: {
  term: Term;
  docId?: string;
  onApproved: (from: { en: string; ar: string }, to: { en: string; ar: string }) => void;
  className?: string;
}) {
  const L = useL();
  const options = [{ en: term.en, ar: term.ar, label: L({ en: "Provisional", ar: "المؤقت" }), rationale: term.note }, ...(term.alternatives ?? []).map((a) => ({ en: a.en, ar: a.ar, label: a.proposedBy ?? L({ en: "Alternative", ar: "بديل" }), rationale: a.rationale }))];
  const [pick, setPick] = useState(0);
  const [custom, setCustom] = useState<{ en: string; ar: string } | null>(null);
  const [rationale, setRationale] = useState("");
  const [busy, setBusy] = useState(false);
  const [approval, setApproval] = useState<ApprovalSummary | null>(null);
  const [route, setRoute] = useState<{ from: { en: string; ar: string }; to: { en: string; ar: string } } | null>(null);
  const choice = custom ?? options[pick];

  async function send() {
    setBusy(true);
    try {
      const res = await fetch("/api/solutions/06-arabic-documents/glossary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve", id: term.id, choice: { en: choice.en, ar: choice.ar }, rationale, docId }),
      });
      if (!res.ok) throw new Error(await res.text());
      const j = (await res.json()) as { approval: ApprovalSummary; from: { en: string; ar: string }; to: { en: string; ar: string } };
      setApproval(j.approval);
      setRoute({ from: j.from, to: j.to });
      toast.success(L({ en: "Sent to the terminology specialist", ar: "أُرسل إلى أخصائية المصطلحات" }), { description: TERMINOLOGIST.name });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (approval && route)
    return (
      <ApprovalCard
        className={className}
        approval={approval}
        onDecided={(s) => {
          if (s === "approved") onApproved(route.from, route.to);
        }}
      />
    );

  return (
    <div className={cn("space-y-2", className)}>
      <div className="space-y-1.5">
        {options.map((o, i) => (
          <label
            key={i}
            className={cn(
              "flex cursor-pointer items-start gap-2 rounded-md border p-2 text-[12px] transition-colors",
              !custom && pick === i ? "border-ai/50 bg-ai-soft/40" : "border-border hover:border-border-strong",
            )}
          >
            <input
              type="radio"
              className="mt-0.5 accent-[var(--ai)]"
              checked={!custom && pick === i}
              onChange={() => {
                setCustom(null);
                setPick(i);
              }}
            />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span className="font-medium">{o.en}</span>
                <span className="font-medium" dir="rtl">
                  {o.ar}
                </span>
              </span>
              <span className="label-caps !text-[9px]">{o.label}</span>
              {o.rationale && <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-muted-foreground">{o.rationale}</span>}
            </span>
          </label>
        ))}
        <div className={cn("rounded-md border p-2", custom ? "border-ai/50 bg-ai-soft/40" : "border-dashed border-border-strong")}>
          <label className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
            <input type="radio" className="accent-[var(--ai)]" checked={!!custom} onChange={() => setCustom({ en: term.en, ar: term.ar })} />
            {L({ en: "Other rendering", ar: "صيغة أخرى" })}
          </label>
          {custom && (
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              <Input value={custom.en} onChange={(e) => setCustom({ ...custom, en: e.target.value })} className="h-7 text-[12px]" />
              <Input value={custom.ar} onChange={(e) => setCustom({ ...custom, ar: e.target.value })} dir="rtl" className="h-7 text-[12px]" />
            </div>
          )}
        </div>
      </div>
      <Textarea
        value={rationale}
        onChange={(e) => setRationale(e.target.value)}
        rows={2}
        dir="auto"
        className="text-[12px]"
        placeholder={L({ en: "Why this rendering? (context, usage, legal meaning)", ar: "لماذا هذه الصيغة؟ (السياق، الاستخدام، المعنى القانوني)" })}
      />
      <Button size="sm" className="w-full" onClick={send} disabled={busy || !choice.en.trim() || !choice.ar.trim()}>
        {busy ? <LoaderCircle className="animate-spin" /> : <Send className="rtl:-scale-x-100" />}
        {L({ en: "Send to terminology specialist", ar: "إرسال إلى أخصائية المصطلحات" })}
      </Button>
    </div>
  );
}
