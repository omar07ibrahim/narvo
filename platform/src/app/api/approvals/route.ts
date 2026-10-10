import { listApprovals } from "@/lib/store/db";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status") as "pending" | "approved" | "rejected" | null;
  const solution = url.searchParams.get("solution");
  return Response.json({ approvals: listApprovals({ status: status ?? undefined, solution: solution ?? undefined }) });
}
