import { loadState } from "@/app/solutions/15-procurement-intelligence/_lib/server";

export const dynamic = "force-dynamic";

/** Evaluation state: AI evaluations, overrides, clarifications, report, tender and supplier records. */
export async function GET() {
  return Response.json(loadState());
}
