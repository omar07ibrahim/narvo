import { loadState } from "@/app/solutions/18-visual-inspection/_lib/data";

/** Inspections, findings, corrective tasks and notices (seed + runtime overlay). */
export async function GET() {
  return Response.json(loadState());
}
