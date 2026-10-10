"use client";

import { useEffect, useState } from "react";
import { CircleCheck, CircleDashed, CircleX, ScanSearch } from "lucide-react";
import { toast } from "sonner";
import { useNarvoRun } from "@/hooks/use-narvo-run";
import { AgentTrace } from "@/components/narvo/agent-trace";
import { RunButton } from "@/components/narvo/run-button";
import { SourceList } from "@/components/narvo/sources";
import { Confidence, StatusPill } from "@/components/narvo/status";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useFormat, useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Citation } from "@/lib/ai/events";
import type { CorrectiveTask, InspectionState, Taxonomy } from "../_lib/types";
import { PhotoInput } from "./photo-input";
import { PhotoViewer } from "./photo-viewer";
import { SeverityPill } from "./ui";
import { downscale } from "./image-utils";

interface Verdict {
  sameLocation: "likely" | "unlikely" | "uncertain";
  verdict: "resolved" | "not_resolved" | "inconclusive";
  confidence: number;
  observations: string[];
  remaining: string[];
  recommendation: "close" | "keep_open";
  reason: string;
}

export function ClosureDialog({
  task,
  state,
  tax,
  open,
  onOpenChange,
  onState,
}: {
  task: CorrectiveTask | null;
  state: InspectionState;
  tax: Taxonomy;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onState: (s: InspectionState) => void;
}) {
  const L = useL();
  const f = useFormat();
  const run = useNarvoRun();
  const [after, setAfter] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const verdict = run.data.verdict as Verdict | undefined;

  useEffect(() => {
    if (!open) return;
    setAfter(null);
    setReason("");
    run.reset();
  }, [open, task?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (verdict?.reason) setReason(verdict.reason);
  }, [verdict?.reason]);

  if (!task) return null;
  const insp = state.inspections.find((i) => i.id === task.inspectionId);
  const finding = state.findings.find((x) => x.id === task.findingId);
  const before = insp?.photos[finding?.photo ?? 0]?.src;
  const overdue = task.status === "open" && Date.parse(task.dueAt) < Date.now();

  async function decide(decision: "closed" | "kept_open") {
    setBusy(true);
    try {
      const thumb = after ? await downscale(after, 640, 0.75) : undefined;
      const res = await fetch("/api/solutions/18-visual-inspection/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task!.id, decision, reason, verdict, afterThumb: thumb }),
      });
      if (!res.ok) throw new Error(await res.text());
      onState((await res.json()).state);
      toast.success(decision === "closed" ? L({ en: "Corrective task closed and audited", ar: "أُغلقت المهمة التصحيحية وسُجّلت" }) : L({ en: "Task kept open — reason recorded", ar: "أُبقيت المهمة مفتوحة — سُجّل السبب" }));
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const VIcon = verdict?.verdict === "resolved" ? CircleCheck : verdict?.verdict === "not_resolved" ? CircleX : CircleDashed;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-auto sm:max-w-[980px]">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 text-[15px] font-medium">
            <span className="font-mono">{task.id}</span>
            <span className="text-muted-foreground">·</span>
            {task.code} {task.title}
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2 text-[12px]">
            <SeverityPill severity={task.severity} escalated={task.escalated} />
            <span>
              {task.owner} · {task.plot} · {L({ en: "due", ar: "الموعد" })} {f.date(task.dueAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </span>
            {overdue && <StatusPill tone="danger">{L({ en: "Overdue", ar: "متأخرة" })}</StatusPill>}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="label-caps mb-2">{L({ en: "Before — inspection photo", ar: "قبل — صورة التفتيش" })}</div>
            {before && finding && (
              <PhotoViewer src={before} alt="before" findings={[finding]} tax={tax} showBoxes activeId={finding.id} onHover={() => {}} />
            )}
            <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground" dir="auto">
              {finding?.description}
            </p>
          </div>
          <div>
            <div className="label-caps mb-2">{L({ en: "After — closure evidence", ar: "بعد — دليل الإغلاق" })}</div>
            {task.status === "closed" && task.closure ? (
              <div className="space-y-2">
                {task.closure.afterThumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={task.closure.afterThumb} alt="after" className="w-full rounded-md border border-border" />
                ) : (
                  <div className="rounded-md border border-dashed border-border p-6 text-center text-[12px] text-muted-foreground">
                    {L({ en: "Verified by re-inspection on site", ar: "تم التحقق بإعادة التفتيش في الموقع" })}
                  </div>
                )}
                <p className="text-[12px]" dir="auto">
                  <b className="font-medium">{task.closure.decidedBy}</b> · {f.date(task.closure.decidedAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} — {task.closure.reason}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {task.submission && !after && (
                  <div className="flex items-center gap-3 rounded-md border border-info/25 bg-info-soft/50 p-2.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={task.submission.src} alt="" className="size-14 shrink-0 rounded object-cover" />
                    <div className="min-w-0 flex-1 text-[11.5px]">
                      <div className="font-medium">{L({ en: "Submitted via MNDA e-services", ar: "مقدّم عبر الخدمات الإلكترونية للهيئة" })}</div>
                      <div className="text-muted-foreground" dir="auto">
                        {task.submission.by} · {f.date(task.submission.submittedAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} — {task.submission.note}
                      </div>
                    </div>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={async () => {
                        const blob = await (await fetch(task.submission!.src)).blob();
                        const url = await new Promise<string>((r) => {
                          const fr = new FileReader();
                          fr.onload = () => r(fr.result as string);
                          fr.readAsDataURL(blob);
                        });
                        setAfter(await downscale(url));
                      }}
                    >
                      {L({ en: "Use", ar: "استخدام" })}
                    </Button>
                  </div>
                )}
                <PhotoInput value={after} onChange={setAfter} defaultMode="upload" />
              </div>
            )}
          </div>
        </div>

        {task.status === "open" && (
          <div className="mt-2 grid gap-4 md:grid-cols-[minmax(0,1fr)_300px]">
            <div className="space-y-3">
              <RunButton
                running={run.running}
                disabled={!after}
                onRun={() => run.start("/api/solutions/18-visual-inspection/closure", { taskId: task.id, afterPhoto: after })}
                onStop={run.abort}
                icon={<ScanSearch />}
              >
                {L({ en: "Compare before / after", ar: "قارن قبل / بعد" })}
              </RunButton>
              {verdict && (
                <div
                  className={cn(
                    "rounded-md border p-3",
                    verdict.verdict === "resolved" ? "border-success/30 bg-success-soft/50" : verdict.verdict === "not_resolved" ? "border-danger/25 bg-danger-soft/50" : "border-warning/30 bg-warning-soft/50",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-[13px] font-medium">
                      <VIcon className="size-4" />
                      {verdict.verdict === "resolved" ? L({ en: "Corrected", ar: "تم التصحيح" }) : verdict.verdict === "not_resolved" ? L({ en: "Not corrected", ar: "لم يُصحح" }) : L({ en: "Inconclusive", ar: "غير حاسم" })}
                    </span>
                    <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      {L({ en: "same place", ar: "المكان نفسه" })}: {verdict.sameLocation}
                      <Confidence value={verdict.confidence} />
                    </span>
                  </div>
                  <ul className="mt-2 list-disc space-y-0.5 ps-5 text-[12px]" dir="auto">
                    {verdict.observations.map((o, i) => (
                      <li key={i}>{o}</li>
                    ))}
                  </ul>
                  {verdict.remaining.length > 0 && (
                    <>
                      <div className="label-caps mt-2 !text-[9.5px]">{L({ en: "Still open", ar: "ما زال قائماً" })}</div>
                      <ul className="mt-1 list-disc space-y-0.5 ps-5 text-[12px] text-danger" dir="auto">
                        {verdict.remaining.map((o, i) => (
                          <li key={i}>{o}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}
              {(verdict || run.status === "error") && (
                <div className="space-y-2">
                  <div className="label-caps">{L({ en: "Inspector decision", ar: "قرار المفتش" })}</div>
                  <Textarea value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-16 text-[12.5px]" dir="auto" />
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => decide("closed")} disabled={busy || reason.trim().length < 4}>
                      <CircleCheck /> {L({ en: "Verify & close task", ar: "تحقق وأغلق المهمة" })}
                    </Button>
                    <Button variant="outline" onClick={() => decide("kept_open")} disabled={busy || reason.trim().length < 4}>
                      {L({ en: "Keep open", ar: "إبقاء مفتوحة" })}
                    </Button>
                  </div>
                  <p className="text-[11px] text-faint">
                    {L({ en: "The AI comparison is advisory (CSSR-2025 Art. 30.5) — the inspector's decision is recorded in the audit trail.", ar: "المقارنة الآلية استشارية (المادة 30.5) — يُسجّل قرار المفتش في سجل التدقيق." })}
                  </p>
                </div>
              )}
            </div>
            <div className="space-y-3">
              <AgentTrace run={run} showReasoning={false} emptyHint={L({ en: "Add an after photo, then compare.", ar: "أضف صورة ما بعد ثم قارن." })} />
              {(run.data.citations as Citation[])?.length > 0 && <SourceList citations={(run.data.citations as Citation[]).slice(0, 2)} />}
            </div>
          </div>
        )}
        {(task.attempts?.length ?? 0) > 0 && (
          <div className="mt-2 border-t border-border pt-3">
            <div className="label-caps mb-1">{L({ en: "History", ar: "السجل" })}</div>
            {task.attempts!.map((a, i) => (
              <div key={i} className="text-[11.5px] text-muted-foreground" dir="auto">
                {f.date(a.at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {a.verdict} · {a.reason}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
