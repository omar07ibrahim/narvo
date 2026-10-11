export const dynamic = "force-dynamic";

import { listApprovals } from "@/lib/store/db";
import { Workspace, type InitialData } from "./_components/workspace";
import {
  CLEAN_AT,
  loadComplaints,
  loadEnergy,
  loadFeed,
  loadJobs,
  loadPpm,
  loadSep25,
  loadSeries,
  loadSites,
  loadTrips,
  loadWorkOrders,
} from "./_lib/data";

export default function Page() {
  const { agc, hq } = loadSeries();
  const data = {
    series: { AGC: agc, HQ: hq },
    sites: loadSites(),
    complaints: loadComplaints(),
    trips: loadTrips(),
    jobs: loadJobs(),
    ppm: loadPpm(),
    feed: loadFeed(),
    energy: loadEnergy(),
    sep25: loadSep25(),
    workOrders: loadWorkOrders(),
    cleanAt: CLEAN_AT,
    // Drafted work orders still waiting for approval survive a page reload.
    pending: listApprovals({ solution: "20-facility-intelligence", status: "pending" })
      .filter((a) => (a.payload as { record?: unknown } | undefined)?.record)
      .map((a) => ({
        approval: { id: a.id, title: a.title, summary: a.summary, solution: a.solution, actionLabel: a.actionLabel, approver: a.approver, status: a.status, createdAt: a.createdAt },
        record: (a.payload as { record: unknown }).record,
      })),
  } as unknown as InitialData;
  return <Workspace data={data} />;
}
