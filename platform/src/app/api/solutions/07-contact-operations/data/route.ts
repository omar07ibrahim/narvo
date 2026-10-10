import { loadConsoleData } from "@/app/solutions/07-contact-operations/_lib/data";

export const dynamic = "force-dynamic";

/** Everything the contact console needs: customers, live housing cases (from 05), permits, tickets, appointments,
 *  contact log, handoff queue, knowledge drafts, exceptions and this module's approvals. */
export async function GET() {
  try {
    return Response.json(loadConsoleData());
  } catch (e) {
    return new Response((e as Error).message, { status: 500 });
  }
}
