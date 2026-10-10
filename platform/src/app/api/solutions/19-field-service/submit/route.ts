import { readBody } from "@/lib/ai/stream";
import { addAudit, createApproval, kvGet, kvSet, patchRecord } from "@/lib/store/db";
import { COL, SUPERVISOR, draftKey, getBrief, jobContext, loadInventory, loadJobs, loadReports } from "@/app/solutions/19-field-service/_lib/data";
import { addWorkingDays, partAvailability, scoreReport } from "@/app/solutions/19-field-service/_lib/rules";
import type { FollowUp, Job, ServiceReport } from "@/app/solutions/19-field-service/_lib/types";

/**
 * Supervisor review: submit the (edited) report for Mohammed Rafiq's approval, or return it to the technician.
 * Approval completes the job, files the report, creates the follow-up job(s), updates the asset history and
 * writes the audit trail.
 */
export async function POST(req: Request) {
  const body = await readBody<{ jobId?: string; action?: "submit" | "return"; report?: ServiceReport; comments?: string }>(req);
  const ctx = jobContext(body.jobId ?? "");
  if (!ctx) return new Response("Job not found", { status: 404 });
  const { job, asset, site, tech } = ctx;
  const draft = kvGet<{ report: ServiceReport; followUps: Array<FollowUp & { targetDate: string; partStatus: string }> }>(draftKey(job.id));

  if (body.action === "return") {
    const comments = (body.comments ?? "").trim();
    if (comments.length < 4) return new Response("Comments are required when returning a report", { status: 400 });
    patchRecord(COL.jobs, job.id, { status: "in_progress" });
    addAudit({
      solution: "19-field-service",
      actor: { name: SUPERVISOR.name, role: SUPERVISOR.title, kind: "human" },
      action: "Returned service report to technician",
      subject: `${job.id} → ${tech.name}`,
      detail: comments,
    });
    return Response.json({ ok: true, jobs: loadJobs() });
  }

  const report = body.report ?? draft?.report;
  if (!report) return new Response("No draft report for this job", { status: 400 });
  const inv = loadInventory();
  const today = new Date(Date.now() + 4 * 3600000).toISOString().slice(0, 10);
  const jobs = loadJobs();
  let seq = Math.max(...jobs.map((j) => Number(j.id.slice(-5)))) + 1;
  const followJobs: Job[] = report.unresolved.map((u) => {
    const avail = u.partNo ? partAvailability([{ partNo: u.partNo, qty: u.qty ?? 1, purpose: u.description }], inv, tech.van, site.id)[0] : null;
    const lead = avail ? (avail.status === "order" ? avail.leadDays : avail.status === "central_store" ? 1 : 0) : 1;
    const target = addWorkingDays(today, lead + 1);
    return {
      id: `JOB-RFM-26-0${seq++}`,
      title: `Follow-up: ${u.description}`.slice(0, 140),
      title_ar: `متابعة: ${u.description}`.slice(0, 140),
      site: job.site,
      asset: job.asset,
      type: "Follow-up",
      priority: u.priority,
      status: avail?.status === "order" ? "awaiting_parts" : "scheduled",
      raisedAt: new Date().toISOString(),
      raisedBy: `${job.id} (${tech.name}) — approved by ${SUPERVISOR.name}`,
      scheduledFor: `${target}T07:30:00+04:00`,
      technician: job.technician,
      supervisor: job.supervisor,
      sla: avail?.status === "order" ? `Part on order — ${avail.leadDays} working days` : "Planned",
      symptom: `${u.description}. ${u.reason}${avail ? ` Part: ${avail.partNo} × ${avail.qty} — ${avail.status === "order" ? `to be ordered${inv.parts.find((p) => p.partNo === avail.partNo)?.supplier ? ` from ${inv.parts.find((p) => p.partNo === avail.partNo)!.supplier}` : ""}` : avail.action}.` : ""}`,
      symptom_ar: u.description,
      linked: [job.id],
      prepMode: null,
      prepMinutes: null,
      partsNeeded: u.partNo ? [{ partNo: u.partNo, qty: u.qty ?? 1 }] : [],
      followUpOf: job.id,
    } as Job;
  });
  const completeness = scoreReport(report, job, { followUpJobs: followJobs.length });
  if (!completeness.pass) return new Response(`Report cannot be approved: ${completeness.gates.map((g) => g.en).join("; ")}`, { status: 422 });

  const reportId = `RPT-26-${String(7310 + loadReports().length + 1).padStart(5, "0")}`;
  const brief = getBrief(job.id);
  const ordered = followJobs.filter((f) => f.status === "awaiting_parts");
  const summary =
    `${job.id} · ${asset.id} — completeness ${completeness.total}%. Root cause: ${report.rootCause.replace(/[.\s]+$/, "")}. ` +
    (followJobs.length ? `Creates ${followJobs.length} follow-up job(s): ${followJobs.map((f) => `${f.id} (${f.partsNeeded?.map((p) => p.partNo).join(", ") || "no part"}, target ${f.scheduledFor.slice(0, 10)})`).join("; ")}. ` : "No open issues. ") +
    `${asset.criticality === "A" && followJobs.length ? "Criticality A asset with an open issue — client informed the same day." : ""}`;

  const approval = createApproval({
    solution: "19-field-service",
    title: `Approve service report ${reportId} — ${job.id}`,
    summary,
    actionLabel: "Approve & close job",
    approver: SUPERVISOR,
    requestedBy: tech.name,
    payload: { jobId: job.id, reportId },
    effects: [
      {
        type: "append",
        collection: COL.reports,
        item: { id: reportId, jobId: job.id, report, completeness: completeness.total, submittedAt: Date.now(), approvedBy: SUPERVISOR.name, followUps: followJobs.map((f) => f.id) },
      },
      {
        type: "patch",
        collection: COL.jobs,
        id: job.id,
        patch: {
          status: "completed",
          completedAt: new Date().toISOString(),
          reportId,
          reportCompleteness: completeness.total / 100,
          outcome: `${report.rootCause}${followJobs.length ? ` Follow-up: ${followJobs.map((f) => f.id).join(", ")}.` : ""}`,
          firstTimeFix: null,
        },
      },
      ...followJobs.map((f) => ({ type: "append" as const, collection: COL.jobs, item: f as unknown as Record<string, unknown> & { id: string } })),
      {
        type: "append",
        collection: COL.history,
        item: {
          id: job.id,
          date: today,
          site: job.site,
          asset: job.asset,
          type: job.type,
          title: job.title,
          technician: job.technician,
          summary: `${report.rootCause} ${report.workPerformed.slice(0, 3).join("; ")}.${followJobs.length ? ` Open: ${report.unresolved.map((u) => u.description).join("; ")}.` : ""}`,
          prepMode: job.prepMode ?? (brief ? "ai" : "manual"),
          prepMinutes: job.prepMinutes ?? (brief ? Math.max(1, Math.round(brief.ms / 60000) + 4) : 35),
          reportCompleteness: completeness.total / 100,
          firstTimeFix: null,
        },
      },
      { type: "audit", action: "Updated asset history", subject: asset.id, detail: `${reportId} filed against ${asset.name} (${asset.serial})` },
      ...ordered.map((f) => ({
        type: "audit" as const,
        action: "Raised purchase request for follow-up part",
        subject: f.partsNeeded!.map((p) => `${p.partNo} × ${p.qty}`).join(", "),
        detail: `${f.id} — ${inv.parts.find((p) => p.partNo === f.partsNeeded![0].partNo)?.supplier ?? "supplier"}; target visit ${f.scheduledFor.slice(0, 10)}`,
      })),
      { type: "audit", action: "Shared approved service report with client", subject: `${reportId} → ${site.contact.name} (${site.contact.role})`, detail: `Contract ${site.contract}` },
    ],
  });
  kvSet(draftKey(job.id), { ...(draft ?? {}), report, reviewedAt: Date.now() });
  return Response.json({
    approval: {
      id: approval.id,
      title: approval.title,
      summary: approval.summary,
      solution: approval.solution,
      actionLabel: approval.actionLabel,
      approver: approval.approver,
      status: approval.status,
      createdAt: approval.createdAt,
    },
    completeness,
    followUps: followJobs,
  });
}
