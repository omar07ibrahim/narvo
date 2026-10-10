import { kvGet } from "@/lib/store/db";
import { briefKey, draftKey, loadHistory, loadJobs, loadReports } from "@/app/solutions/19-field-service/_lib/data";

/** Live field-service state: jobs (with follow-ups), history, approved reports, briefs and drafts. */
export async function GET() {
  const jobs = loadJobs();
  const briefs: Record<string, unknown> = {};
  const drafts: Record<string, unknown> = {};
  for (const j of jobs) {
    const b = kvGet(briefKey(j.id));
    if (b) briefs[j.id] = b;
    const d = kvGet(draftKey(j.id));
    if (d) drafts[j.id] = d;
  }
  return Response.json({ jobs, history: loadHistory(), reports: loadReports(), briefs, drafts });
}
