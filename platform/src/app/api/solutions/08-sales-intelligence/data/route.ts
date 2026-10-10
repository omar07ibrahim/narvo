import { loadSalesData } from "@/app/solutions/08-sales-intelligence/_lib/data";

export const dynamic = "force-dynamic";

/** CRM records for 08 with runtime overlay (approved CRM updates, logged interactions) and cached AI results. */
export async function GET() {
  try {
    return Response.json(loadSalesData());
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
