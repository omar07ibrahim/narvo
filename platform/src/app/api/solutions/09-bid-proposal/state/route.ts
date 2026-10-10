import { loadState } from "@/app/solutions/09-bid-proposal/_lib/server";

export const dynamic = "force-dynamic";

/** Current bid workspace state: requirements, coverage, drafts, tasks, forms, approvals. */
export async function GET() {
  return Response.json(loadState());
}
