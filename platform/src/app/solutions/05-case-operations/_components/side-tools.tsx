"use client";

import { useState } from "react";
import { CalendarClock, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AgentTrace } from "@/components/narvo/agent-trace";
import { ApprovalCard } from "@/components/narvo/approval-card";
import { FileDrop, type DroppedFile } from "@/components/narvo/file-drop";
import { FieldTable } from "@/components/narvo/field-table";
import { Markdown } from "@/components/narvo/markdown";
import { RunButton } from "@/components/narvo/run-button";
import { StatusPill } from "@/components/narvo/status";
import { EmptyState } from "@/components/narvo/empty";
import { useNarvoRun } from "@/hooks/use-narvo-run";
import { useFormat, useL, usePrefs } from "@/lib/i18n";
import { FIELD_LABELS, FIELD_ORDER } from "./labels";

/** Bring-your-own document: drop any photo/scan and NARVO identifies, extracts and checks it. */
export function InspectDialog() {
  const L = useL();
  const f = useFormat();
  const run = useNarvoRun();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<DroppedFile | null>(null);

  const x = run.data.extraction as Record<string, unknown> | undefined;
  const findings = (run.data.findings as string[] | undefined) ?? [];
  const fields = x
    ? FIELD_ORDER.filter((k) => x[k] != null && x[k] !== "").map((k) => {
        const v = x[k];
        return {
          key: k,
          label: L(FIELD_LABELS[k]),
          value: typeof v === "number" && /salary|income|amount/i.test(k) ? f.aed(v) : typeof v === "boolean" ? (v ? "✓" : "✗") : String(v),
          confidence: x.confidence as number,
        };
      })
    : [];

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <ScanLine />
        {L({ en: "Inspect a document", ar: "فحص مستند" })}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-hidden p-0 sm:max-w-[1080px]">
          <DialogTitle className="border-b border-border px-5 py-3.5 text-[15px] font-medium">
            {L({ en: "Inspect any document", ar: "فحص أي مستند" })}
            <span className="ms-2 text-[12px] font-normal text-muted-foreground">
              {L({ en: "Photo or scan → identified, extracted and checked against Circular 9/2026", ar: "صورة أو مسح ← التعرّف والاستخراج والتحقق وفق التعميم 9/2026" })}
            </span>
          </DialogTitle>
          <div className="grid max-h-[78vh] grid-cols-[380px_minmax(0,1fr)] overflow-hidden max-md:grid-cols-1">
            <div className="scrollbar-thin space-y-3 overflow-y-auto border-e border-border p-4">
              <FileDrop
                accept="image/*"
                onFiles={(fs) => {
                  setFile(fs[0]);
                  run.reset();
                }}
                label={L({ en: "Drop a document photo", ar: "أسقط صورة المستند" })}
              />
              {file?.dataUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={file.dataUrl} alt={file.name} className="w-full rounded-md border border-border" />
              )}
              <RunButton
                className="w-full"
                running={run.running}
                disabled={!file?.dataUrl}
                onRun={() => run.start("/api/solutions/05-case-operations/inspect", { dataUrl: file!.dataUrl, name: file!.name })}
              >
                {L({ en: "Read & check", ar: "قراءة وتحقق" })}
              </RunButton>
              <AgentTrace run={run} title={L({ en: "Steps", ar: "الخطوات" })} emptyHint=" " showReasoning={false} />
            </div>
            <div className="scrollbar-thin space-y-4 overflow-y-auto p-4">
              {!x && !run.running && (
                <EmptyState icon={<ScanLine className="size-4" />} title={L({ en: "Bring any document", ar: "أحضر أي مستند" })}>
                  {L({
                    en: "Salary certificates, IDs, title deeds, bank letters — in Arabic or English, printed or handwritten. Nothing is pre-computed.",
                    ar: "شهادات الراتب والهويات وسندات الملكية وخطابات البنوك — بالعربية أو الإنجليزية، مطبوعة أو بخط اليد. لا شيء محسوب مسبقاً.",
                  })}
                </EmptyState>
              )}
              {x && (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-medium" dir="auto">
                      {String(x.title)}
                    </span>
                    <StatusPill tone="ai">{String(x.docType).replaceAll("_", " ")}</StatusPill>
                  </div>
                  <FieldTable fields={fields} dense />
                  {findings.length > 0 && (
                    <ul className="space-y-1.5">
                      {findings.map((t) => (
                        <li key={t} className="rounded-md border border-border bg-surface px-3 py-2 text-[12.5px]">
                          {t}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
              {run.text.note && (
                <div className="rounded-md border border-ai/20 bg-ai-soft/40 p-3.5">
                  <div className="label-caps mb-1.5">{L({ en: "Note for the officer", ar: "ملاحظة للموظف" })}</div>
                  <Markdown streaming={run.running}>{run.text.note}</Markdown>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface QueueRow {
  id: string;
  name: string;
  nameAr: string;
  due: string;
  left: number;
  missing: string[];
  reminders: number;
}

/** Follow-up sweep across all cases awaiting the applicant. */
export function SweepSheet({ onChanged }: { onChanged: () => void }) {
  const L = useL();
  const f = useFormat();
  const { lang } = usePrefs();
  const run = useNarvoRun();
  const [open, setOpen] = useState(false);
  const queue = (run.data.queue as QueueRow[] | undefined) ?? [];
  return (
    <>
      <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={() => setOpen(true)}>
        <CalendarClock />
        {L({ en: "Follow-up sweep", ar: "متابعة المهل" })}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-[640px] sm:max-w-[640px]">
          <SheetHeader className="border-b border-border">
            <div className="label-caps">{L({ en: "Circular 9/2026 §5 — 15 working days", ar: "التعميم 9/2026 §5 — 15 يوم عمل" })}</div>
            <SheetTitle className="text-lg font-light tracking-tight">{L({ en: "Follow-up sweep", ar: "متابعة المهل" })}</SheetTitle>
            <p className="text-[12.5px] text-muted-foreground">
              {L({
                en: "Deadlines are computed in UAE working days; reminders are drafted for cases close to closure and wait for approval.",
                ar: "تُحتسب المهل بأيام العمل، وتُصاغ تذكيرات للحالات القريبة من الإغلاق وتنتظر الاعتماد.",
              })}
            </p>
            <RunButton running={run.running} onRun={() => run.start("/api/solutions/05-case-operations/sweep", {})} className="mt-2 w-fit">
              {L({ en: "Run sweep", ar: "تشغيل المتابعة" })}
            </RunButton>
          </SheetHeader>
          <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-4">
            {queue.length > 0 && (
              <div className="overflow-hidden rounded-md border border-border">
                <table className="w-full text-[12px]">
                  <thead className="bg-muted/50">
                    <tr className="text-start">
                      <th className="label-caps !text-[9.5px] px-3 py-2 text-start">{L({ en: "Case", ar: "الحالة" })}</th>
                      <th className="label-caps !text-[9.5px] px-3 py-2 text-start">{L({ en: "Outstanding", ar: "النواقص" })}</th>
                      <th className="label-caps !text-[9.5px] px-3 py-2 text-end">{L({ en: "Deadline", ar: "المهلة" })}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {queue.map((r) => (
                      <tr key={r.id}>
                        <td className="px-3 py-2 align-top">
                          <div className="font-medium">{lang === "ar" ? r.nameAr : r.name}</div>
                          <div className="font-mono text-[10.5px] text-muted-foreground">{r.id}</div>
                        </td>
                        <td className="px-3 py-2 align-top text-muted-foreground">{r.missing.join(" · ")}</td>
                        <td className="px-3 py-2 text-end align-top">
                          <div className="num">{f.date(r.due, { day: "numeric", month: "short" })}</div>
                          <StatusPill tone={r.left <= 3 ? "danger" : r.left <= 7 ? "warning" : "neutral"} className="mt-1">
                            {r.left} {L({ en: "wd left", ar: "يوم عمل" })}
                          </StatusPill>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {run.trace.length > 0 && <AgentTrace run={run} showReasoning={false} />}
            {run.approvals.map((a) => (
              <ApprovalCard key={a.id} approval={a} onDecided={(s) => (run.markApproval(a.id, s), onChanged())} />
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
