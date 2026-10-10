export const dynamic = "force-dynamic";

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
  } as unknown as InitialData;
  return <Workspace data={data} />;
}
