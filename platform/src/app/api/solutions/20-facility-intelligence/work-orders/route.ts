import { loadFeed, loadJobs, loadWorkOrders } from "@/app/solutions/20-facility-intelligence/_lib/data";

/** MNDA work orders (created through approvals) plus the contractor's job history and completion feed. */
export async function GET() {
  return Response.json({ workOrders: loadWorkOrders(), jobs: loadJobs(), feed: loadFeed() });
}
