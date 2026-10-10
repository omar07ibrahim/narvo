import { listApprovals } from "@/lib/store/db";
import { loadOverrides, loadPublished } from "@/app/solutions/17-demand-planning/_lib/data";

/** Published plan versions, overrides and this module's approvals (for the decision log). */
export async function GET() {
  const approvals = listApprovals({ solution: "17-demand-planning" }).map((a) => ({
    id: a.id,
    title: a.title,
    summary: a.summary,
    solution: a.solution,
    actionLabel: a.actionLabel,
    approver: a.approver,
    status: a.status,
    createdAt: a.createdAt,
    decidedAt: a.decidedAt,
  }));
  return Response.json({ published: loadPublished(), overrides: loadOverrides(), approvals });
}
