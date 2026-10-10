import { readBody } from "@/lib/ai/stream";
import { addAudit, patchRecord } from "@/lib/store/db";
import { COL, jobContext, loadJobs } from "@/app/solutions/19-field-service/_lib/data";

/** Technician actions on a job: mark the brief reviewed (records preparation time) and check in on site. */
export async function POST(req: Request) {
  const body = await readBody<{ action?: "brief_reviewed" | "check_in"; jobId?: string; minutes?: number }>(req);
  const ctx = jobContext(body.jobId ?? "");
  if (!ctx) return new Response("Job not found", { status: 404 });
  const { job, tech } = ctx;
  if (body.action === "brief_reviewed") {
    const minutes = Math.max(1, Math.min(120, Math.round(Number(body.minutes) || 0)));
    patchRecord(COL.jobs, job.id, { prepMode: "ai", prepMinutes: minutes });
    addAudit({
      solution: "19-field-service",
      actor: { name: tech.name, role: tech.role, kind: "human" },
      action: "Reviewed job brief",
      subject: job.id,
      detail: `Preparation time ${minutes} min (brief generation + review), vs ~35 min manual baseline`,
    });
  } else if (body.action === "check_in") {
    patchRecord(COL.jobs, job.id, { status: "in_progress", checkInAt: new Date().toISOString() });
    addAudit({ solution: "19-field-service", actor: { name: tech.name, role: tech.role, kind: "human" }, action: "Checked in on site", subject: job.id, detail: ctx.site.name });
  } else return new Response("Unknown action", { status: 400 });
  return Response.json({ jobs: loadJobs() });
}
