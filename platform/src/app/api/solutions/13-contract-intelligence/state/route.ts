import { loadState } from "@/app/solutions/13-contract-intelligence/_lib/server";

export const dynamic = "force-dynamic";

/** Contract register, obligations, reviews, extractions, renewal brief and approvals. */
export async function GET() {
  return Response.json(loadState());
}
