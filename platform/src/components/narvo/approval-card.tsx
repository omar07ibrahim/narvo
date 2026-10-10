"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Check, Hand, LoaderCircle, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useL } from "@/lib/i18n";
import type { ApprovalSummary } from "@/lib/ai/events";
import { cn } from "@/lib/utils";

function initials(name: string) {
  return name
    .split(" ")
    .filter((p) => !/^(al|bin|el)$/i.test(p))
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export function ApprovalCard({
  approval,
  onDecided,
  className,
  compact,
}: {
  approval: ApprovalSummary;
  onDecided?: (status: "approved" | "rejected", result: any) => void;
  className?: string;
  compact?: boolean;
}) {
  const L = useL();
  const [busy, setBusy] = useState<null | "approved" | "rejected">(null);
  const [status, setStatus] = useState(approval.status);
  const [comment, setComment] = useState("");
  const [showComment, setShowComment] = useState(false);

  async function decide(decision: "approved" | "rejected") {
    setBusy(decision);
    try {
      const res = await fetch(`/api/approvals/${approval.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, comment: comment || undefined }),
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      setStatus(decision);
      onDecided?.(decision, result);
      toast.success(
        decision === "approved"
          ? L({ en: "Approved — action executed and recorded", ar: "تم الاعتماد — نُفّذ الإجراء وسُجّل" })
          : L({ en: "Rejected — nothing was executed", ar: "تم الرفض — لم يُنفّذ أي إجراء" }),
        { description: approval.title },
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const decided = status !== "pending";
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-lg border p-3.5",
        status === "pending" && "border-warning/35 bg-warning-soft/60",
        status === "approved" && "border-success/30 bg-success-soft/60",
        status === "rejected" && "border-border bg-muted/60",
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
            status === "pending" && "bg-warning/15 text-warning",
            status === "approved" && "bg-success/15 text-success",
            status === "rejected" && "bg-foreground/10 text-muted-foreground",
          )}
        >
          {status === "pending" ? <Hand className="size-3.5" /> : status === "approved" ? <Check className="size-3.5" /> : <X className="size-3.5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="label-caps !text-[9.5px]">
              {status === "pending"
                ? L({ en: "Human approval required", ar: "مطلوب اعتماد بشري" })
                : status === "approved"
                  ? L({ en: "Approved & executed", ar: "معتمد ومنفّذ" })
                  : L({ en: "Rejected", ar: "مرفوض" })}
            </span>
            <span className="font-mono text-[10px] text-faint">{approval.id}</span>
          </div>
          <div className="mt-1 text-[13px] font-medium leading-snug">{approval.title}</div>
          {!compact && <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground" dir="auto">{approval.summary}</p>}
          <div className="mt-2.5 flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-full bg-foreground text-[9.5px] font-medium text-background">
              {initials(approval.approver.name)}
            </span>
            <div className="min-w-0 text-[11.5px] leading-tight">
              <div className="font-medium">{approval.approver.name}</div>
              <div className="text-muted-foreground">{approval.approver.title}</div>
            </div>
          </div>
          {!decided && showComment && (
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={L({ en: "Optional note for the record…", ar: "ملاحظة اختيارية للسجل…" })}
              className="mt-2.5 min-h-14 bg-card text-[12px]"
            />
          )}
          {!decided && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Button size="sm" onClick={() => decide("approved")} disabled={!!busy}>
                {busy === "approved" ? <LoaderCircle className="animate-spin" /> : <ShieldCheck />}
                {approval.actionLabel}
              </Button>
              <Button size="sm" variant="outline" onClick={() => decide("rejected")} disabled={!!busy}>
                {busy === "rejected" ? <LoaderCircle className="animate-spin" /> : <X />}
                {L({ en: "Reject", ar: "رفض" })}
              </Button>
              {!showComment && (
                <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setShowComment(true)}>
                  {L({ en: "Add note", ar: "إضافة ملاحظة" })}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
