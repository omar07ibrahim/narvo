export const dynamic = "force-dynamic";

import { Workspace } from "./_components/workspace";
import { loadActions, loadDataset, loadUpdates } from "./_lib/data";
import { buildFacts } from "./_lib/engine";
import { METRICS, REVIEW } from "./_lib/catalogue";

export default function Page() {
  const dataset = loadDataset();
  const facts = buildFacts(dataset, METRICS, { week: REVIEW.week, previousWeek: REVIEW.previousWeek, dataTo: REVIEW.dataTo });
  return <Workspace dataset={dataset} initialActions={loadActions()} counts={{ facts: facts.length, updates: loadUpdates().length }} />;
}
