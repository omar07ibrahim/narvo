"use client";

import { useState } from "react";
import { CheckCircle2, ClipboardList, HardHat, ShieldCheck, Wrench, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApprovalCard } from "@/components/narvo/approval-card";
import { Markdown } from "@/components/narvo/markdown";
import { RunButton } from "@/components/narvo/run-button";
import { StatusPill } from "@/components/narvo/status";
import { ThinkingLines } from "@/components/narvo/empty";
import { SectionLabel } from "@/components/narvo/pane";
import type { NarvoRun } from "@/hooks/use-narvo-run";
import { useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Job, Verification } from "../_lib/signals";

export interface WO {
  id: string;
  title: string;
  site: string;
  asset: string;
  zones: string[];
  priority: string;
  priorityReason: string;
  responseHours: number | null;
  rectifyHours: number | null;
  contractor: string;
  scope: string[];
  safety: string[];
  verification: Array<{ metric: string; threshold: number; description: string }>;
  linkedComplaints: string[];
  linkedJobs: string[];
  schedule: string;
  estimatedHours: number | null;
  status: string;
  issuedAt: string;
  completedAt?: string | null;
  completionNote?: string;
  verificationResult?: Verification;
  verificationNote?: string;
  verificationCitations?: never;
  notes?: string;
}

export interface Feed {
  job: string;
  reportedAt: string;
  workStart: string;
  workEnd: string;
  technician: string;
  supervisor: string;
  summary: string;
  photos: number;
}

const tone = (status: string) => (/verified/i.test(status) && !/fail/i.test(status) ? "success" : /fail/i.test(status) ? "danger" : /completed/i.test(status) ? "info" : "warning");

function WoDetail({ wo, onComplete, verifyRun }: { wo: WO; onComplete: () => void; verifyRun: NarvoRun | null }) {
  const L = useL();
  const v: Verification | undefined = verifyRun?.data.verification ?? wo.verificationResult;
  const note = verifyRun?.text.note ?? wo.verificationNote;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] text-muted-foreground">{wo.id}</span>
            <StatusPill tone={wo.priority === "P1" ? "danger" : wo.priority === "P2" ? "warning" : "neutral"}>{wo.priority}</StatusPill>
            <StatusPill tone={tone(verifyRun?.data.status ?? wo.status)}>{verifyRun?.data.status ?? wo.status}</StatusPill>
          </div>
          <h3 className="mt-1.5 text-[16px] leading-snug font-medium">{wo.title}</h3>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {wo.contractor} · {wo.asset}
            {wo.zones.length ? ` · ${wo.zones.join(", ")}` : ""} · {L({ en: "issued", ar: "صدر" })} {wo.issuedAt} · {wo.schedule}
          </p>
        </div>
        {!wo.completedAt && (
          <Button size="sm" onClick={onComplete}>
            <CheckCircle2 />
            {L({ en: "Record completion", ar: "تسجيل الإنجاز" })}
          </Button>
        )}
      </div>
      <p className="rounded-md bg-surface px-3 py-2 text-[12px] leading-relaxed text-muted-foreground">
        <span className="label-caps me-1.5 !text-[9.5px]">{L({ en: "Priority", ar: "الأولوية" })}</span>
        {wo.priorityReason}
        {wo.responseHours != null && (
          <span className="num ms-1 font-medium text-foreground">
            · {L({ en: "respond", ar: "استجابة" })} {wo.responseHours} h · {L({ en: "rectify", ar: "معالجة" })} {wo.rectifyHours} h
          </span>
        )}
      </p>
      <div className="grid grid-cols-2 gap-5 max-xl:grid-cols-1">
        <div>
          <SectionLabel>
            <Wrench className="me-1 inline size-3" /> {L({ en: "Scope", ar: "النطاق" })}
          </SectionLabel>
          <ol className="list-decimal space-y-1.5 ps-5 text-[12.5px] leading-relaxed">
            {wo.scope.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ol>
        </div>
        <div>
          <SectionLabel>
            <HardHat className="me-1 inline size-3" /> {L({ en: "Safety", ar: "السلامة" })}
          </SectionLabel>
          <ul className="list-disc space-y-1.5 ps-5 text-[12.5px] leading-relaxed">
            {wo.safety.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </div>
      </div>
      <div>
        <SectionLabel>
          <ShieldCheck className="me-1 inline size-3" /> {L({ en: "Verification criteria", ar: "معايير التحقق" })}
        </SectionLabel>
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-[12px]">
            <tbody className="divide-y divide-border">
              {(v?.results ?? wo.verification.map((c) => ({ ...c, pass: null, value: null, detail: "" }))).map((r, i) => (
                <tr key={i} className="align-top">
                  <td className="w-7 px-3 py-2">
                    {r.pass === true ? <CheckCircle2 className="size-4 text-success" /> : r.pass === false ? <XCircle className="size-4 text-danger" /> : <span className="mt-1 block size-2 rounded-full bg-faint" />}
                  </td>
                  <td className="py-2 pe-3">
                    <div className="font-medium">{r.description}</div>
                    {r.detail && <div className="mt-0.5 text-[11.5px] text-muted-foreground">{r.detail}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {(wo.linkedComplaints.length > 0 || wo.linkedJobs.length > 0) && (
        <div className="flex flex-wrap gap-1">
          {[...wo.linkedJobs, ...wo.linkedComplaints].map((x) => (
            <span key={x} className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground">
              {x}
            </span>
          ))}
        </div>
      )}
      {wo.completedAt && (
        <div className="rounded-md border border-border p-3">
          <div className="label-caps mb-1">{L({ en: "Completion recorded", ar: "الإنجاز المسجل" })}</div>
          <p className="text-[12px] text-muted-foreground">
            <span className="num font-medium text-foreground">{wo.completedAt.slice(0, 16).replace("T", " ")}</span> GST · {wo.completionNote}
          </p>
        </div>
      )}
      {verifyRun?.running && !note && <ThinkingLines lines={4} />}
      {note && (
        <div className={cn("rounded-md border p-4", v?.verdict === "verified" ? "border-success/30 bg-success-soft/40" : v?.verdict === "not_verified" ? "border-danger/30 bg-danger-soft/40" : "border-border bg-surface")}>
          <div className="label-caps mb-2">{L({ en: "Verification note", ar: "مذكرة التحقق" })}</div>
          <Markdown streaming={verifyRun?.running} className="text-[12.5px] [&_p]:my-1">
            {note}
          </Markdown>
        </div>
      )}
      {verifyRun?.status === "error" && <div className="rounded-md border border-danger/25 bg-danger-soft p-3 text-[12.5px] text-danger">{verifyRun.error}</div>}
    </div>
  );
}

export function WorkOrders({
  site,
  workOrders,
  jobs,
  feed,
  draftRun,
  verifyRun,
  verifyingId,
  onDraft,
  onRefresh,
  onVerify,
}: {
  site: "AGC" | "HQ";
  workOrders: WO[];
  jobs: Job[];
  feed: Feed[];
  draftRun: NarvoRun;
  verifyRun: NarvoRun;
  verifyingId: string | null;
  onDraft: () => void;
  onRefresh: () => Promise<WO[]>;
  onVerify: (id: string) => void;
}) {
  const L = useL();
  const [selected, setSelected] = useState<string | null>(null);
  const [completing, setCompleting] = useState<WO | null>(null);
  const [when, setWhen] = useState("2026-10-06T11:40");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const mine = workOrders.filter((w) => w.site === site);
  const current = mine.find((w) => w.id === selected) ?? mine[0];
  const draft = draftRun.data.draft as (WO & { notes?: string }) | undefined;
  const siteJobs = jobs.filter((j) => j.site === site);

  function openComplete(w: WO) {
    const f = feed.find((x) => w.linkedJobs.includes(x.job)) ?? feed[0];
    setWhen(f ? f.workEnd.slice(0, 16) : "2026-10-09T15:00");
    setNote(f ? `${f.job} — ${f.summary}` : "");
    setCompleting(w);
  }
  async function saveComplete() {
    if (!completing) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/solutions/20-facility-intelligence/work-orders/${completing.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completedAt: `${when}:00+04:00`, note }),
      });
      if (!res.ok) throw new Error(await res.text());
      await onRefresh();
      const id = completing.id;
      setCompleting(null);
      onVerify(id);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="label-caps">{L({ en: "Prepare the response", ar: "إعداد الاستجابة" })}</div>
            <p className="mt-1 max-w-2xl text-[12px] text-muted-foreground">
              {site === "AGC"
                ? L({
                    en: "The agent queries the BMS anomalies, asset register, PPM schedule, linked complaints, contractor jobs and contract MNDA/CON/2023/019, then drafts a corrective work order with priority per Schedule 3, safety controls and measurable verification criteria. Eng. Tariq Mahmoud Saleh approves it.",
                    ar: "يستعلم الوكيل عن حالات الشذوذ في نظام المبنى وسجل الأصول وجدول الصيانة والشكاوى المرتبطة وأعمال المقاول والعقد MNDA/CON/2023/019، ثم يصوغ أمر عمل تصحيحياً بأولوية وفق الجدول 3 وضوابط سلامة ومعايير تحقق قابلة للقياس، ويعتمده م. طارق محمود صالح.",
                  })
                : L({ en: "Draft a work order for the selected site from its signals, records and standards.", ar: "صُغ أمر عمل للموقع المختار من إشاراته وسجلاته ومعاييره." })}
            </p>
          </div>
          <RunButton running={draftRun.running} onRun={onDraft} icon={<ClipboardList />}>
            {L({ en: "Draft work order", ar: "صياغة أمر العمل" })}
          </RunButton>
        </div>
        {draftRun.running && !draft && <ThinkingLines lines={5} className="mt-4" />}
        {draftRun.status === "error" && <div className="mt-3 rounded-md border border-danger/25 bg-danger-soft p-3 text-[12.5px] text-danger">{draftRun.error}</div>}
        {draft && (
          <div className="mt-4 rounded-md border border-border bg-card p-4">
            <WoDetail wo={draft} onComplete={() => {}} verifyRun={null} />
            {draft.notes && <p className="mt-3 text-[12px] text-muted-foreground">{draft.notes}</p>}
            {draftRun.approvals.map((a) => (
              <ApprovalCard
                key={a.id}
                approval={a}
                className="mt-4"
                onDecided={async (s) => {
                  draftRun.markApproval(a.id, s);
                  if (s === "approved") {
                    const list = await onRefresh();
                    setSelected(list.find((w) => w.title === draft.title)?.id ?? null);
                  }
                }}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionLabel>{L({ en: "MNDA work orders", ar: "أوامر العمل الصادرة عن الهيئة" })}</SectionLabel>
        {mine.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground">{L({ en: "No MNDA work orders yet for this site — draft one above.", ar: "لا توجد أوامر عمل لهذا الموقع بعد — صُغ واحداً أعلاه." })}</p>
        ) : (
          <div className="grid grid-cols-[240px_minmax(0,1fr)] gap-4 max-xl:grid-cols-1">
            <ul className="divide-y divide-border rounded-md border border-border">
              {mine.map((w) => (
                <li key={w.id}>
                  <button type="button" onClick={() => setSelected(w.id)} className={cn("w-full px-3 py-2.5 text-start hover:bg-muted/50", current?.id === w.id && "bg-muted/70")}>
                    <div className="font-mono text-[10.5px] text-muted-foreground">{w.id}</div>
                    <div className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug">{w.title}</div>
                    <StatusPill className="mt-1.5" tone={tone(w.status)}>
                      {w.status}
                    </StatusPill>
                  </button>
                </li>
              ))}
            </ul>
            {current && (
              <div className="rounded-md border border-border p-4">
                <WoDetail wo={current} onComplete={() => openComplete(current)} verifyRun={verifyingId === current.id ? verifyRun : null} />
              </div>
            )}
          </div>
        )}
      </section>

      <section>
        <SectionLabel>{L({ en: "Contractor job history", ar: "سجل أعمال المقاول" })}</SectionLabel>
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="label-caps !text-[9.5px] px-3 py-2 text-start font-medium">{L({ en: "Job", ar: "العمل" })}</th>
                <th className="label-caps !text-[9.5px] w-14 px-3 py-2 text-start font-medium">{L({ en: "Pri.", ar: "الأولوية" })}</th>
                <th className="label-caps !text-[9.5px] w-28 px-3 py-2 text-start font-medium">{L({ en: "Raised", ar: "تاريخ الفتح" })}</th>
                <th className="label-caps !text-[9.5px] w-24 px-3 py-2 text-end font-medium">{L({ en: "Response", ar: "الاستجابة" })}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[...siteJobs].reverse().map((j) => {
                const resp = j.respondedAt ? (Date.parse(j.respondedAt) - Date.parse(j.raisedAt)) / 3600000 : null;
                const sla = j.priority === "P1" ? 1 : j.priority === "P2" ? 4 : j.priority === "P3" ? 24 : null;
                const tripJob = j.source === "BMS alarm" && j.asset === "CH-02";
                return (
                  <tr key={j.id} className="align-top">
                    <td className="px-3 py-2">
                      <div className="font-mono text-[10.5px] text-muted-foreground">{j.id}</div>
                      <div className="leading-snug">{L({ en: j.title, ar: j.titleAr ?? j.title })}</div>
                      {j.resolution && <div className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{j.resolution}</div>}
                    </td>
                    <td className="px-3 py-2">{j.priority}</td>
                    <td className="num px-3 py-2 text-muted-foreground">{j.raisedAt.slice(5, 16).replace("T", " ")}</td>
                    <td className={cn("num px-3 py-2 text-end", resp != null && sla != null && resp > sla && "text-danger", tripJob && resp != null && resp > 1 && "font-medium")}>
                      {resp != null ? `${resp.toFixed(1)} h` : "—"}
                      {tripJob && <div className="text-[10px] font-normal text-faint">{L({ en: "P1 target 1 h", ar: "هدف P1 ساعة" })}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <Dialog open={!!completing} onOpenChange={(o) => !o && setCompleting(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[16px] font-normal">{L({ en: "Record contractor completion", ar: "تسجيل إنجاز المقاول" })}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-[12px] text-muted-foreground">
              {L({
                en: "Pre-filled from the contractor's completion report in RFM Connect. Verification then runs on the BMS data after this time.",
                ar: "معبأ مسبقاً من تقرير الإنجاز في نظام RFM Connect، ثم يُجرى التحقق على بيانات المبنى بعد هذا الوقت.",
              })}
            </p>
            <label className="block text-[12px]">
              <span className="label-caps mb-1 block">{L({ en: "Completed at (GST)", ar: "وقت الإنجاز" })}</span>
              <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="num" />
            </label>
            <label className="block text-[12px]">
              <span className="label-caps mb-1 block">{L({ en: "Completion report", ar: "تقرير الإنجاز" })}</span>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} className="min-h-28 text-[12px]" />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleting(null)}>
              {L({ en: "Cancel", ar: "إلغاء" })}
            </Button>
            <Button onClick={saveComplete} disabled={busy || !when}>
              <ShieldCheck />
              {L({ en: "Save & verify", ar: "حفظ والتحقق" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
