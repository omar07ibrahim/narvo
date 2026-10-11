"use client";

import { useEffect, useMemo, useState } from "react";
import { FileWarning, Maximize2, Stamp } from "lucide-react";
import { useNarvoRun } from "@/hooks/use-narvo-run";
import { AgentTrace } from "@/components/narvo/agent-trace";
import { ApprovalCard } from "@/components/narvo/approval-card";
import { Markdown } from "@/components/narvo/markdown";
import { RunButton } from "@/components/narvo/run-button";
import { SourceList } from "@/components/narvo/sources";
import { ThinkingLines } from "@/components/narvo/empty";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useFormat, useL, usePrefs } from "@/lib/i18n";
import type { ApprovalSummary, Citation } from "@/lib/ai/events";
import { assess } from "../_lib/rules";
import type { Inspection, InspectionState, Taxonomy } from "../_lib/types";
import { Segmented, SeverityPill } from "./ui";
import { useTr } from "./names";

export function NoticePanel({
  insp,
  state,
  tax,
  onRefresh,
  pendingApproval,
  now,
}: {
  now: number;
  insp: Inspection;
  state: InspectionState;
  tax: Taxonomy;
  onRefresh: (decision?: "approved" | "rejected") => void;
  pendingApproval?: ApprovalSummary;
}) {
  const L = useL();
  const tr = useTr();
  const f = useFormat();
  const { lang } = usePrefs();
  const run = useNarvoRun();
  const [tab, setTab] = useState<"en" | "ar">(lang);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    setTab(lang);
  }, [lang]);
  useEffect(() => {
    run.reset();
  }, [insp.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const accepted = state.findings.filter((x) => x.inspectionId === insp.id && x.status === "accepted");
  const proposed = state.findings.filter((x) => x.inspectionId === insp.id && x.status === "proposed").length;
  const issued = insp.noticeId ? state.notices.find((n) => n.id === insp.noticeId) : undefined;
  const preview = useMemo(() => accepted.map((x) => assess(x, insp, state, tax, now)), [accepted, insp, state, tax, now]);
  const total = preview.reduce((a, x) => a + x.penaltyAed, 0);
  const citations = (run.data.citations as Citation[]) ?? [];

  if (issued) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[12.5px]">
            <Stamp className="size-4 text-success" />
            <span className="font-mono font-medium">{issued.id}</span>
          </div>
          <div className="flex items-center gap-1">
            <Segmented value={tab} onChange={setTab} options={[{ value: "en", label: "EN" }, { value: "ar", label: "عربي" }]} />
            <Button size="icon-xs" variant="ghost" className="text-muted-foreground" onClick={() => setExpanded(true)} aria-label={L({ en: "Open full notice", ar: "فتح الإشعار كاملاً" })}>
              <Maximize2 />
            </Button>
          </div>
        </div>
        <NoticeDialog open={expanded} onOpenChange={setExpanded} id={issued.id} tab={tab} setTab={setTab} text={tab === "ar" ? issued.textAr : issued.textEn} />
        <div className="text-[11.5px] text-muted-foreground">
          {L({ en: "Served", ar: "أُبلغ" })} {f.date(issued.issuedAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {L({ en: "approved by", ar: "اعتمده" })} {tr(issued.approvedBy)} · AED {issued.penaltyTotal.toLocaleString("en-US")}
        </div>
        <div className="max-h-[520px] overflow-auto rounded-md border border-border bg-surface p-3 scrollbar-thin" dir={tab === "ar" ? "rtl" : "ltr"}>
          <Markdown className="text-[12.5px]">{tab === "ar" ? issued.textAr : issued.textEn}</Markdown>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {accepted.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">
          {L({ en: "Accept at least one finding to prepare the Notice of Violation and corrective tasks.", ar: "اقبل ملاحظة واحدة على الأقل لإعداد إشعار المخالفة والمهام التصحيحية." })}
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-[11.5px]">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="label-caps px-2.5 py-1.5 text-start !text-[9px] font-medium">{L({ en: "Code", ar: "الرمز" })}</th>
                <th className="label-caps px-2.5 py-1.5 text-start !text-[9px] font-medium">{L({ en: "Class", ar: "الدرجة" })}</th>
                <th className="label-caps px-2.5 py-1.5 text-start !text-[9px] font-medium">{L({ en: "Due", ar: "الموعد" })}</th>
                <th className="label-caps px-2.5 py-1.5 text-end !text-[9px] font-medium">AED</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {preview.map((x) => (
                <tr key={x.finding.id}>
                  <td className="px-2.5 py-1.5 font-mono">{x.finding.code}</td>
                  <td className="px-2.5 py-1">
                    <SeverityPill severity={x.severity} escalated={x.repeat.escalated} />
                  </td>
                  <td className="num px-2.5 py-1.5 whitespace-nowrap">{f.date(x.dueAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="num px-2.5 py-1.5 text-end">
                    {x.penaltyAed.toLocaleString("en-US")}
                    {x.repeat.doubled && <span className="ms-1 text-[10px] text-danger">×2</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border-strong bg-muted/40">
                <td colSpan={3} className="px-2.5 py-1.5 text-muted-foreground">
                  {L({ en: "Computed from CSSR-2025 Art. 31 and Annex B", ar: "محسوبة وفق المادة 31 والملحق ب" })}
                </td>
                <td className="num px-2.5 py-1.5 text-end font-medium">{total.toLocaleString("en-US")}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {preview.some((x) => x.repeat.prior) && (
        <div className="flex items-start gap-2 rounded-md border border-danger/25 bg-danger-soft/60 p-2.5 text-[11.5px] text-danger">
          <FileWarning className="mt-0.5 size-3.5 shrink-0" />
          {L({
            en: `Repeat on this plot by the same contractor (${preview.filter((x) => x.repeat.prior).map((x) => `${x.finding.code}: ${x.repeat.prior!.noticeId}, ${x.repeat.prior!.days} days ago`).join("; ")}) — Art. 31.6 / Annex B.2 applied.`,
            ar: `تكرار على القطعة نفسها من المقاول نفسه (${preview.filter((x) => x.repeat.prior).map((x) => `${x.finding.code}: ${x.repeat.prior!.noticeId} قبل ${x.repeat.prior!.days} يوماً`).join("؛ ")}) — طُبقت المادة 31.6 والملحق ب.2.`,
          })}
        </div>
      )}
      {proposed > 0 && accepted.length > 0 && (
        <p className="text-[11.5px] text-warning">
          {L({ en: `${proposed} AI flag${proposed === 1 ? "" : "s"} not yet reviewed will be excluded.`, ar: `${proposed} ملاحظة آلية لم تُراجع بعد ستُستبعد.` })}
        </p>
      )}
      <RunButton
        running={run.running}
        onRun={() => run.start("/api/solutions/18-visual-inspection/notice", { inspectionId: insp.id })}
        onStop={run.abort}
        disabled={accepted.length === 0 || run.approvals.length > 0 || insp.status === "notice_pending"}
        className="w-full"
        icon={<Stamp />}
      >
        {insp.status === "notice_pending" && run.status === "idle"
          ? L({ en: "Notice awaiting approval (see Inbox)", ar: "الإشعار بانتظار الاعتماد (صندوق الوارد)" })
          : L({ en: "Draft Notice of Violation & tasks", ar: "صياغة إشعار المخالفة والمهام" })}
      </RunButton>

      {run.status === "idle" && pendingApproval && <ApprovalCard approval={pendingApproval} onDecided={(s) => onRefresh(s)} />}
      {run.status !== "idle" && (
        <>
          <AgentTrace run={run} showReasoning={false} />
          <div className="flex items-center justify-between">
            <span className="label-caps">{L({ en: "Draft notice", ar: "مسودة الإشعار" })}</span>
            <div className="flex items-center gap-1">
              <Segmented value={tab} onChange={setTab} options={[{ value: "en", label: "EN" }, { value: "ar", label: "عربي" }]} />
              <Button size="icon-xs" variant="ghost" className="text-muted-foreground" disabled={run.running} onClick={() => setExpanded(true)} aria-label={L({ en: "Open full notice", ar: "فتح الإشعار كاملاً" })}>
                <Maximize2 />
              </Button>
            </div>
          </div>
          <NoticeDialog open={expanded} onOpenChange={setExpanded} id={L({ en: "Draft notice", ar: "مسودة الإشعار" })} tab={tab} setTab={setTab} text={run.text[tab] ?? ""} />
          <div className="max-h-[520px] overflow-auto rounded-md border border-border bg-surface p-3 scrollbar-thin" dir={tab === "ar" ? "rtl" : "ltr"}>
            {run.text[tab] ? <Markdown className="text-[12.5px]" streaming={run.running}>{run.text[tab]}</Markdown> : <ThinkingLines lines={6} />}
          </div>
          {citations.length > 0 && (
            <Collapsible>
              <CollapsibleTrigger className="label-caps hover:text-foreground">
                {L({ en: `Regulation passages used — ${citations.length}`, ar: `نصوص اللائحة المستخدمة — ${citations.length}` })}
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <SourceList citations={citations} />
              </CollapsibleContent>
            </Collapsible>
          )}
          {run.approvals.map((a) => (
            <ApprovalCard
              key={a.id}
              approval={a}
              onDecided={(s) => {
                run.markApproval(a.id, s);
                onRefresh(s);
              }}
            />
          ))}
        </>
      )}
    </div>
  );
}

/** The notice as a readable document (the rail is too narrow for its table). */
function NoticeDialog({
  open,
  onOpenChange,
  id,
  tab,
  setTab,
  text,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  id: string;
  tab: "en" | "ar";
  setTab: (t: "en" | "ar") => void;
  text: string;
}) {
  const L = useL();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-[860px]">
        <DialogHeader className="flex-row items-center justify-between gap-3 space-y-0 pe-8">
          <div>
            <DialogTitle className="font-mono text-[14px] font-medium">{id}</DialogTitle>
            <DialogDescription className="text-[12px]">{L({ en: "Notice of Violation — bilingual, Arabic text prevails", ar: "إشعار مخالفة — ثنائي اللغة، ويُعتد بالنص العربي" })}</DialogDescription>
          </div>
          <Segmented value={tab} onChange={setTab} options={[{ value: "en", label: "EN" }, { value: "ar", label: "عربي" }]} />
        </DialogHeader>
        <div className="rounded-md border border-border bg-surface px-8 py-6" dir={tab === "ar" ? "rtl" : "ltr"}>
          <Markdown className="text-[13px]">{text}</Markdown>
        </div>
      </DialogContent>
    </Dialog>
  );
}
