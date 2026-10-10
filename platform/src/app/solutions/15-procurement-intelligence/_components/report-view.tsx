"use client";

import { Award, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/narvo/markdown";
import { SourceList } from "@/components/narvo/sources";
import { RunButton } from "@/components/narvo/run-button";
import { ApprovalCard } from "@/components/narvo/approval-card";
import { EmptyState, ThinkingLines } from "@/components/narvo/empty";
import { StatusPill } from "@/components/narvo/status";
import type { NarvoRun } from "@/hooks/use-narvo-run";
import type { Citation } from "@/lib/ai/events";
import { useFormat, useL } from "@/lib/i18n";
import type { ProcState } from "../_lib/types";

export function ReportView({
  state,
  run,
  ready,
  onRun,
  onAward,
  awarding,
  onDecided,
  onExport,
}: {
  state: ProcState;
  run: NarvoRun;
  ready: boolean;
  onRun: () => void;
  onAward: () => void;
  awarding: boolean;
  onDecided: () => void;
  onExport: () => void;
}) {
  const L = useL();
  const f = useFormat();
  const live = run.running || (run.status === "done" && run.text.report);
  const text = live ? (run.text.report ?? "") : (state.report?.text ?? "");
  const citations = (live ? (run.data.citations as Citation[] | undefined) : state.report?.citations) ?? [];
  const award = state.approvals.find((a) => a.title.toLowerCase().includes("award") || a.title.includes("الترسية"));
  const recommended = state.suppliers.find((s) => s.id === state.tender.recommended);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_300px] gap-5 max-xl:grid-cols-1">
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-[12px] text-muted-foreground">
            {state.report && !run.running ? (
              <>
                {L({ en: "Drafted", ar: "صيغ" })} {f.relative(state.report.at)} · {L({ en: "figures computed in code, narrative by the model", ar: "الأرقام محسوبة برمجياً والسرد من النموذج" })}
              </>
            ) : (
              L({ en: "The report uses the computed scores verbatim and cites bids and the Procurement Manual.", ar: "يستخدم التقرير الدرجات المحسوبة كما هي ويستشهد بالعروض ودليل المشتريات." })
            )}
          </div>
          <div className="flex gap-2">
            {state.report && !run.running && (
              <Button size="sm" variant="ghost" onClick={onExport}>
                <FileText /> {L({ en: "Export .md", ar: "تصدير .md" })}
              </Button>
            )}
            <RunButton size="sm" variant={state.report ? "outline" : "default"} running={run.running} onRun={onRun} onStop={run.abort} disabled={!ready}>
              {state.report ? L({ en: "Redraft report", ar: "إعادة صياغة التقرير" }) : L({ en: "Draft evaluation report", ar: "صياغة تقرير التقييم" })}
            </RunButton>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card px-6 py-5">
          {text ? (
            <Markdown citations={citations} streaming={run.running}>
              {text}
            </Markdown>
          ) : run.running ? (
            <ThinkingLines lines={10} />
          ) : (
            <EmptyState icon={<FileText className="size-4" />} title={L({ en: "No report yet", ar: "لا يوجد تقرير بعد" })}>
              {ready
                ? L({ en: "Draft the committee's evaluation report from the current evaluation record.", ar: "صُغ تقرير تقييم اللجنة من سجل التقييم الحالي." })
                : L({ en: "Evaluate all three submissions first.", ar: "قيّم العروض الثلاثة أولاً." })}
            </EmptyState>
          )}
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <div className="rounded-lg border border-border bg-card p-3.5">
          <div className="label-caps mb-2">{L({ en: "Award recommendation", ar: "توصية الترسية" })}</div>
          {state.tender.status === "award_recommended" && recommended ? (
            <div className="space-y-2">
              <StatusPill tone="success">{L({ en: "Recommended — recorded", ar: "موصى به — مسجل" })}</StatusPill>
              <div className="text-[13px] font-medium">{recommended.name}</div>
              <p className="text-[11.5px] text-muted-foreground">
                {L({ en: "Recorded in the supplier register; final award by the Director General (Art. 17).", ar: "سُجّلت في سجل الموردين؛ الترسية النهائية من المدير العام (المادة 17)." })}
              </p>
            </div>
          ) : award?.status === "pending" ? null : (
            <Button className="w-full" onClick={onAward} disabled={!state.report || awarding || run.running}>
              <Award /> {L({ en: "Submit recommendation to committee", ar: "رفع التوصية إلى اللجنة" })}
            </Button>
          )}
          {award && <ApprovalCard key={award.id} approval={award} className="mt-3" compact={award.status !== "pending"} onDecided={onDecided} />}
        </div>
        <div>
          <div className="label-caps mb-2">{L({ en: "Sources", ar: "المصادر" })}</div>
          <SourceList citations={citations} usedOnly={!!text} text={text} />
        </div>
      </div>
    </div>
  );
}
