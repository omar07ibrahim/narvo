"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, CircleCheck, CircleDashed, CircleX, Plus, Send, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Pane } from "@/components/narvo/pane";
import { StatusPill } from "@/components/narvo/status";
import { EmptyState } from "@/components/narvo/empty";
import { ApprovalCard } from "@/components/narvo/approval-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useFormat, useL, usePrefs } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { ApprovalSummary } from "@/lib/ai/events";
import { addWorkingDays, partAvailability, scoreReport } from "../_lib/rules";
import type { Asset, Completeness, FollowUp, Inventory, Job, ServiceReport, Site, Technician } from "../_lib/types";

export interface Draft {
  report: ServiceReport;
  followUps: Array<FollowUp & { partStatus: string; targetDate: string }>;
  completeness: Completeness;
  stockMismatch?: string[];
  generatedAt: number;
  photos: Array<{ thumb: string; caption: string; phase: string }>;
  notes?: string;
}

function Block({ title, children, tone, extra }: { title: ReactNode; children: ReactNode; tone?: "warning"; extra?: ReactNode }) {
  return (
    <section className={cn("rounded-md border p-3", tone === "warning" ? "border-warning/35 bg-warning-soft/40" : "border-border bg-card")}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="label-caps !text-[9.5px]">{title}</h4>
        {extra}
      </div>
      {children}
    </section>
  );
}

export function ReviewView({
  job,
  asset,
  site,
  tech,
  draft,
  inventory,
  approvals,
  onApproval,
  onDecided,
  onReturned,
}: {
  job: Job;
  asset: Asset;
  site: Site;
  tech: Technician;
  draft?: Draft;
  inventory: Inventory;
  approvals: ApprovalSummary[];
  onApproval: (a: ApprovalSummary) => void;
  onDecided: (id: string, s: "approved" | "rejected") => void;
  onReturned: () => void;
}) {
  const L = useL();
  const { lang } = usePrefs();
  const f = useFormat();
  const [r, setR] = useState<ServiceReport | null>(draft?.report ?? null);
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState("");
  useEffect(() => {
    setR(draft?.report ?? null);
  }, [draft?.generatedAt, job.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const score = useMemo(() => (r ? scoreReport(r, job, { followUpJobs: r.unresolved.length }) : null), [r, job]);
  const pending = approvals.find((a) => a.status === "pending");
  const decided = approvals.find((a) => a.status !== "pending");

  if (!draft || !r || !score) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <EmptyState title={L({ en: "No report submitted for this job yet", ar: "لم يُقدَّم تقرير لهذه المهمة بعد" })}>
          {L({ en: "The technician records the visit on the phone (Visit tab). The draft report appears here for the supervisor to check, edit and approve.", ar: "يسجل الفني الزيارة على الهاتف (تبويب الزيارة)، ويظهر مسودة التقرير هنا ليراجعها المشرف ويعدّلها ويعتمدها." })}
        </EmptyState>
      </div>
    );
  }
  const set = (patch: Partial<ServiceReport>) => setR((x) => (x ? { ...x, ...patch } : x));
  const locked = !!pending || decided?.status === "approved" || job.status === "completed";

  async function submit() {
    setBusy(true);
    try {
      const res = await fetch("/api/solutions/19-field-service/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id, action: "submit", report: r }),
      });
      if (!res.ok) throw new Error(await res.text());
      const j = await res.json();
      onApproval(j.approval);
      toast.success(L({ en: "Report submitted — awaiting Mohammed Rafiq", ar: "أُرسل التقرير — بانتظار محمد رفيق" }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function giveBack() {
    setBusy(true);
    try {
      const res = await fetch("/api/solutions/19-field-service/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id, action: "return", comments: comment }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.message(L({ en: "Returned to technician with comments", ar: "أُعيد إلى الفني مع الملاحظات" }));
      onReturned();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const today = new Date(Date.now() + 4 * 3600000).toISOString().slice(0, 10);
  const followInfo = (u: FollowUp) => {
    const a = u.partNo ? partAvailability([{ partNo: u.partNo, qty: u.qty ?? 1, purpose: u.description }], inventory, tech.van, site.id)[0] : null;
    const lead = a ? (a.status === "order" ? a.leadDays : a.status === "central_store" ? 1 : 0) : 1;
    return { a, target: addWorkingDays(today, lead + 1) };
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-4 py-3">
          <div>
            <div className="text-[13.5px] font-medium">
              {L({ en: "Draft service report", ar: "مسودة تقرير الخدمة" })} · <span className="font-mono">{job.id}</span>
            </div>
            <div className="text-[11.5px] text-muted-foreground">
              {(lang === "ar" && tech.name_ar) || tech.name} · {asset.id} · {L({ en: "drafted", ar: "صيغت" })} {f.date(draft.generatedAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} {L({ en: "from voice notes and photos", ar: "من الملاحظات الصوتية والصور" })}
            </div>
          </div>
          {locked ? <StatusPill tone={job.status === "completed" ? "success" : "warning"}>{job.status === "completed" ? L({ en: "Approved", ar: "معتمد" }) : L({ en: "Awaiting approval", ar: "بانتظار الاعتماد" })}</StatusPill> : <StatusPill tone="ai">{L({ en: "Editable", ar: "قابل للتعديل" })}</StatusPill>}
        </div>

        <fieldset disabled={locked} className="flex flex-col gap-3">
          <Block title={L({ en: "Visit", ar: "الزيارة" })}>
            <div className="grid gap-2 sm:grid-cols-[110px_110px_minmax(0,1fr)]">
              <label className="space-y-1">
                <span className="text-[11px] text-muted-foreground">{L({ en: "Arrival", ar: "الوصول" })}</span>
                <Input value={r.arrival ?? ""} onChange={(e) => set({ arrival: e.target.value || null })} className="h-8 text-[12px]" />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] text-muted-foreground">{L({ en: "Departure", ar: "المغادرة" })}</span>
                <Input value={r.departure ?? ""} onChange={(e) => set({ departure: e.target.value || null })} className="h-8 text-[12px]" />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] text-muted-foreground">{L({ en: "Alarms", ar: "الإنذارات" })}</span>
                <Input value={r.alarms.join("; ")} onChange={(e) => set({ alarms: e.target.value.split(";").map((x) => x.trim()).filter(Boolean) })} className="h-8 text-[12px]" />
              </label>
            </div>
            <Textarea value={r.symptomOnArrival} onChange={(e) => set({ symptomOnArrival: e.target.value })} className="mt-2 min-h-14 text-[12.5px]" dir="auto" />
          </Block>

          <Block
            title={L({ en: "Readings", ar: "القراءات" })}
            extra={
              <Button size="xs" variant="ghost" onClick={() => set({ readings: [...r.readings, { name: "", value: "", unit: "", circuit: null, phase: "single", flag: null }] })}>
                <Plus /> {L({ en: "Row", ar: "سطر" })}
              </Button>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-[12px]">
                <thead>
                  <tr className="text-muted-foreground">
                    {["Reading", "Value", "Unit", "Circuit", "Phase", ""].map((h) => (
                      <th key={h} className="pb-1 text-start text-[10.5px] font-normal">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {r.readings.map((x, i) => {
                    const upd = (p: Partial<typeof x>) => set({ readings: r.readings.map((y, k) => (k === i ? { ...y, ...p } : y)) });
                    return (
                      <tr key={i} className={cn(x.flag === "high" || x.flag === "low" ? "bg-warning-soft/50" : "")}>
                        <td className="py-0.5 pe-1"><Input value={x.name} onChange={(e) => upd({ name: e.target.value })} className="h-7 text-[12px]" /></td>
                        <td className="w-20 py-0.5 pe-1"><Input value={x.value} onChange={(e) => upd({ value: e.target.value })} className="num h-7 text-[12px]" /></td>
                        <td className="w-16 py-0.5 pe-1"><Input value={x.unit} onChange={(e) => upd({ unit: e.target.value })} className="h-7 text-[12px]" /></td>
                        <td className="w-14 py-0.5 pe-1"><Input value={x.circuit ?? ""} onChange={(e) => upd({ circuit: e.target.value || null })} className="h-7 text-[12px]" /></td>
                        <td className="w-24 py-0.5 pe-1">
                          <select value={x.phase ?? "single"} onChange={(e) => upd({ phase: e.target.value as "before" | "after" | "single" })} className="h-7 w-full rounded-md border border-input bg-transparent px-1.5 text-[12px]">
                            <option value="before">before</option>
                            <option value="after">after</option>
                            <option value="single">single</option>
                          </select>
                        </td>
                        <td className="w-14 py-0.5 text-end">
                          {x.flag && x.flag !== "normal" ? <StatusPill tone="warning" dot={false}>{x.flag}</StatusPill> : x.flag === "normal" ? <span className="text-[10.5px] text-success">ok</span> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Block>

          <Block title={L({ en: "Work performed", ar: "الأعمال المنفذة" })}>
            <ol className="space-y-1">
              {r.workPerformed.map((w, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="num mt-1.5 w-4 text-[11px] text-muted-foreground">{i + 1}</span>
                  <Textarea value={w} onChange={(e) => set({ workPerformed: r.workPerformed.map((y, k) => (k === i ? e.target.value : y)) })} className="min-h-9 py-1.5 text-[12.5px]" dir="auto" />
                </li>
              ))}
            </ol>
          </Block>

          <Block title={L({ en: "Parts used (stock issues)", ar: "القطع المستخدمة (صرف المخزون)" })}>
            {r.partsUsed.length === 0 && <p className="text-[12px] text-muted-foreground">{L({ en: "No parts used.", ar: "لم تُستخدم قطع." })}</p>}
            {r.partsUsed.map((p, i) => {
              const part = inventory.parts.find((x) => x.partNo === p.partNo);
              const okStock = part && p.source ? (part.stock[p.source] ?? 0) >= p.qty : false;
              return (
                <div key={i} className="flex flex-wrap items-center gap-2 border-b border-border py-1.5 text-[12px] last:border-0">
                  <span className="font-mono font-medium">{p.partNo}</span>
                  <span className="num">× {p.qty}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{part?.desc ?? "—"}</span>
                  <span className="font-mono text-[11px]">{p.source ?? "—"}</span>
                  {okStock ? <StatusPill tone="success">{L({ en: "matches stock", ar: "يطابق المخزون" })}</StatusPill> : <StatusPill tone="danger">{L({ en: "check stock issue", ar: "راجع الصرف" })}</StatusPill>}
                </div>
              );
            })}
          </Block>

          <Block title={L({ en: "Root cause", ar: "السبب الجذري" })}>
            <Textarea value={r.rootCause} onChange={(e) => set({ rootCause: e.target.value })} className="min-h-12 text-[12.5px]" dir="auto" />
            <div className="mt-2 text-[11px] text-muted-foreground">{L({ en: "Evidence", ar: "الدليل" })}</div>
            <Textarea value={r.rootCauseEvidence} onChange={(e) => set({ rootCauseEvidence: e.target.value })} className="mt-1 min-h-12 text-[12.5px]" dir="auto" />
          </Block>

          <Block
            tone={r.unresolved.length ? "warning" : undefined}
            title={
              <span className="flex items-center gap-1.5">
                {r.unresolved.length > 0 && <AlertTriangle className="size-3.5 text-warning" />}
                {L({ en: "Unresolved issues → follow-up jobs", ar: "قضايا معلقة ← مهام متابعة" })}
              </span>
            }
          >
            {r.unresolved.length === 0 && <p className="text-[12px] text-muted-foreground">{L({ en: "Nothing left open.", ar: "لا شيء معلق." })}</p>}
            <div className="space-y-2">
              {r.unresolved.map((u, i) => {
                const info = followInfo(u);
                const upd = (p: Partial<FollowUp>) => set({ unresolved: r.unresolved.map((y, k) => (k === i ? { ...y, ...p } : y)) });
                return (
                  <div key={i} className="rounded-md border border-warning/30 bg-card p-2.5">
                    <div className="flex items-start gap-2">
                      <Textarea value={u.description} onChange={(e) => upd({ description: e.target.value })} className="min-h-10 flex-1 text-[12.5px] font-medium" dir="auto" />
                      <Button size="icon-xs" variant="ghost" onClick={() => set({ unresolved: r.unresolved.filter((_, k) => k !== i) })} aria-label="remove">
                        <Trash2 />
                      </Button>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-4">
                      <Input value={u.partNo ?? ""} onChange={(e) => upd({ partNo: e.target.value || null })} placeholder="Part no." className="h-7 font-mono text-[11.5px]" />
                      <Input value={u.qty ?? ""} onChange={(e) => upd({ qty: Number(e.target.value) || null })} placeholder="Qty" className="h-7 text-[11.5px]" />
                      <Input value={u.owner} onChange={(e) => upd({ owner: e.target.value })} placeholder="Owner" className="h-7 text-[11.5px]" />
                      <Input value={u.priority} onChange={(e) => upd({ priority: e.target.value })} placeholder="P2" className="h-7 text-[11.5px]" />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11.5px]">
                      {info.a ? (
                        <StatusPill tone={info.a.status === "order" ? "danger" : "info"}>{info.a.status === "order" ? L({ en: `Order — ${info.a.leadDays} working days`, ar: `طلب شراء — ${info.a.leadDays} أيام عمل` }) : info.a.action}</StatusPill>
                      ) : (
                        <StatusPill>{L({ en: "No part", ar: "بدون قطعة" })}</StatusPill>
                      )}
                      <span className="text-muted-foreground">
                        {L({ en: "Follow-up job target", ar: "موعد مهمة المتابعة" })}: <span className="num font-medium text-foreground">{f.date(info.target)}</span>
                      </span>
                    </div>
                    <p className="mt-1 text-[11.5px] text-muted-foreground" dir="auto">
                      {u.reason}
                    </p>
                  </div>
                );
              })}
            </div>
          </Block>

          <Block title={L({ en: "Safety", ar: "السلامة" })}>
            <div className="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] sm:items-center">
              <label className="flex items-center gap-2 text-[12px]">
                <Switch checked={r.safety.loto} onCheckedChange={(v) => set({ safety: { ...r.safety, loto: v } })} /> LOTO
              </label>
              <Input value={r.safety.isolationPoints} onChange={(e) => set({ safety: { ...r.safety, isolationPoints: e.target.value } })} placeholder={L({ en: "Isolation points", ar: "نقاط العزل" })} className="h-8 text-[12px]" />
              <Input value={r.safety.permit ?? ""} onChange={(e) => set({ safety: { ...r.safety, permit: e.target.value || null } })} placeholder={L({ en: "Permit no.", ar: "رقم التصريح" })} className="h-8 font-mono text-[12px]" />
            </div>
          </Block>

          <div className="grid gap-3 md:grid-cols-2">
            <Block title={L({ en: "Photos", ar: "الصور" })}>
              {draft.photos.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">{L({ en: "No photos attached.", ar: "لا توجد صور." })}</p>
              ) : (
                <div className="grid grid-cols-3 gap-1.5">
                  {draft.photos.map((p, i) => (
                    <figure key={i}>
                      {p.thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.thumb} alt="" className="aspect-square w-full rounded object-cover" />
                      ) : (
                        <div className="aspect-square w-full rounded bg-muted" />
                      )}
                      <figcaption className="mt-0.5 truncate text-[10px] text-muted-foreground">
                        {p.phase} · {p.caption}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )}
              {r.photoObservations.length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 ps-4 text-[11.5px] text-muted-foreground" dir="auto">
                  {r.photoObservations.map((o, i) => (
                    <li key={i}>{o}</li>
                  ))}
                </ul>
              )}
            </Block>
            <Block title={L({ en: "Customer sign-off", ar: "توقيع العميل" })}>
              <div className="grid grid-cols-2 gap-2">
                <Input value={r.customerSignOff.name ?? ""} onChange={(e) => set({ customerSignOff: { ...r.customerSignOff, name: e.target.value || null } })} placeholder="Name" className="h-8 text-[12px]" />
                <Input value={r.customerSignOff.role ?? ""} onChange={(e) => set({ customerSignOff: { ...r.customerSignOff, role: e.target.value || null } })} placeholder="Role" className="h-8 text-[12px]" />
                <Input value={r.customerSignOff.time ?? ""} onChange={(e) => set({ customerSignOff: { ...r.customerSignOff, time: e.target.value || null } })} placeholder="hh:mm" className="h-8 text-[12px]" />
              </div>
              <div className="mt-2 text-[11.5px] text-muted-foreground">
                {L({ en: "Technician declaration", ar: "إقرار الفني" })}: {r.technicianDeclaration.name} ({r.technicianDeclaration.staffId}){r.technicianDeclaration.cert ? ` · ${r.technicianDeclaration.cert}` : ""}
              </div>
            </Block>
          </div>
        </fieldset>
      </div>

      {/* Completeness & approval */}
      <div className="flex flex-col gap-4 xl:sticky xl:top-4 xl:self-start">
        <Pane title={L({ en: "Completeness · RFM-QA-STD-004", ar: "الاكتمال · RFM-QA-STD-004" })}>
          <div className="flex items-baseline justify-between">
            <span className={cn("num text-[34px] leading-none font-light", score.pass ? "text-success" : "text-warning")}>{score.total}%</span>
            <span className="text-[11px] text-muted-foreground">{L({ en: "min. 80% to approve", ar: "الحد الأدنى 80% للاعتماد" })}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full rounded-full", score.pass ? "bg-success" : "bg-warning")} style={{ width: `${score.total}%` }} />
          </div>
          <ul className="mt-3 space-y-1">
            {score.items.map((i) => (
              <li key={i.key} className="flex items-start gap-2 text-[11.5px]">
                {i.score === "full" ? <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-success" /> : i.score === "partial" ? <CircleDashed className="mt-0.5 size-3.5 shrink-0 text-warning" /> : <CircleX className="mt-0.5 size-3.5 shrink-0 text-danger" />}
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{L(i)}</span>
                  <span className="block truncate text-[10.5px] text-muted-foreground" title={i.note}>
                    {i.note}
                  </span>
                </span>
                <span className="num text-muted-foreground">
                  {i.points}/{i.weight}
                </span>
              </li>
            ))}
          </ul>
          {score.gates.length > 0 && (
            <div className="mt-3 space-y-1 rounded-md bg-warning-soft p-2 text-[11.5px] text-warning">
              {score.gates.map((g) => (
                <div key={g.en}>{L(g)}</div>
              ))}
            </div>
          )}
        </Pane>
        {pending || decided ? (
          (pending ?? decided) && <ApprovalCard approval={(pending ?? decided)!} onDecided={(s) => onDecided((pending ?? decided)!.id, s)} />
        ) : (
          <Pane title={L({ en: "Supervisor decision", ar: "قرار المشرف" })}>
            <Button className="w-full" onClick={submit} disabled={busy || !score.pass}>
              <Send /> {L({ en: "Submit for approval", ar: "إرسال للاعتماد" })}
            </Button>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {L({ en: `Approval by Mohammed Rafiq closes ${job.id}, files the report, raises ${r.unresolved.length} follow-up job(s) and updates the asset history.`, ar: `اعتماد محمد رفيق يغلق ${job.id}، ويحفظ التقرير، وينشئ ${r.unresolved.length} مهمة متابعة، ويحدّث سجل الأصل.` })}
            </p>
            <div className="mt-3 border-t border-border pt-3">
              <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder={L({ en: "Comments for the technician…", ar: "ملاحظات للفني…" })} className="min-h-14 text-[12px]" />
              <Button variant="outline" size="sm" className="mt-2 w-full" onClick={giveBack} disabled={busy || comment.trim().length < 4}>
                <Undo2 /> {L({ en: "Return to technician", ar: "إعادة إلى الفني" })}
              </Button>
            </div>
          </Pane>
        )}
      </div>
    </div>
  );
}
