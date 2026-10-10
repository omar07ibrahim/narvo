import { addAudit, createApproval, kvSet } from "@/lib/store/db";
import {
  HIRING_MANAGER,
  HR_DIRECTOR,
  KV,
  REQ_COL,
  SLUG,
  getEvaluations,
  getInterviews,
  loadApplications,
  loadRequisition,
} from "@/app/solutions/12-recruitment/_lib/data";
import { candidateCode, effectiveRatings, weightedScore } from "@/app/solutions/12-recruitment/_lib/types";

/**
 * HR's shortlist selection (a human decision) and the hiring manager's approval request.
 *   { action: "save", shortlist: [...] }
 *   { action: "request_approval" }
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { action?: string; shortlist?: string[] };
  const evals = getEvaluations();

  if (body.action === "save") {
    const valid = (body.shortlist ?? []).filter((id) => evals[id]).slice(0, 8);
    kvSet(KV.shortlist, valid);
    return Response.json({ shortlist: valid });
  }

  if (body.action === "request_approval") {
    const req0 = loadRequisition();
    const shortlist = (body.shortlist ?? []).filter((id) => evals[id]);
    if (shortlist.length < 2) return new Response("Select at least two finalists.", { status: 400 });
    kvSet(KV.shortlist, shortlist);
    const interviews = getInterviews();
    const apps = loadApplications();
    const passing = apps.filter((a) => a.pass).length;
    const lines = shortlist
      .map((id) => ({ id, score: weightedScore(effectiveRatings(evals[id], interviews[id]), req0.criteria) }))
      .sort((a, b) => b.score - a.score)
      .map((x) => `${candidateCode(x.id)} (${x.score})`);
    const names = shortlist.map((id) => apps.find((a) => a.id === id)?.candidate.name ?? evals[id].label ?? id);
    addAudit({
      solution: SLUG,
      actor: { name: HR_DIRECTOR.name, role: HR_DIRECTOR.title, kind: "human" },
      action: "Selected shortlist",
      subject: `MNDA-HR-REQ-2026-077 · ${shortlist.length} finalists`,
      detail: lines.join(", "),
    });
    const approval = createApproval({
      solution: SLUG,
      title: `Approve shortlist — ${req0.title} (${shortlist.length} finalists)`,
      summary: `HR selected ${shortlist.length} of ${passing} applications that met the minimum requirements (86 received). Weighted scores: ${lines.join(", ")}. Evaluation used job-related criteria only; protected attributes were redacted before AI review.`,
      actionLabel: "Approve shortlist",
      approver: HIRING_MANAGER,
      requestedBy: HR_DIRECTOR.name,
      effects: [
        { type: "patch", collection: REQ_COL, id: req0.id, patch: { stage: "shortlist_approved", shortlist, shortlistApprovedAt: new Date().toISOString() } },
        { type: "audit", action: "Shortlist approved by hiring manager", subject: req0.id, detail: names.join(", ") },
      ],
      payload: { shortlist },
    });
    return Response.json({
      approval: {
        id: approval.id,
        title: approval.title,
        summary: approval.summary,
        solution: SLUG,
        actionLabel: approval.actionLabel,
        approver: approval.approver,
        status: approval.status,
        createdAt: approval.createdAt,
      },
    });
  }

  return new Response("Unknown action", { status: 400 });
}
