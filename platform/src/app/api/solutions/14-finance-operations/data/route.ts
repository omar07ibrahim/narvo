import { loadDataset } from "@/app/solutions/14-finance-operations/_lib/data";

export const dynamic = "force-dynamic";

/** September AP batch with runtime overlay (approved treatments, journals, outbox, stored AI cases). */
export async function GET() {
  return Response.json(loadDataset());
}
