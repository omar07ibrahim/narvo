export const dynamic = "force-dynamic";

import { listApprovals } from "@/lib/store/db";
import { InspectionWorkspace } from "./_components/workspace";
import { loadRegistry, loadState, loadTaxonomy } from "./_lib/data";

export default function Page() {
  const approvals = listApprovals({ solution: "18-visual-inspection", status: "pending" }).map((a) => ({
    id: a.id,
    title: a.title,
    summary: a.summary,
    solution: a.solution,
    actionLabel: a.actionLabel,
    approver: a.approver,
    status: a.status,
    createdAt: a.createdAt,
    inspectionId: (a.payload as { inspectionId?: string } | undefined)?.inspectionId,
  }));
  return <InspectionWorkspace initialState={loadState()} tax={loadTaxonomy()} contractors={loadRegistry().contractors} initialApprovals={approvals} serverNow={Date.now()} />;
}
