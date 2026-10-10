export const dynamic = "force-dynamic";

import { ContractWorkspace } from "./_components/contract-workspace";
import { loadKpi, loadPlaybook, loadState } from "./_lib/server";

export default function Page() {
  return <ContractWorkspace initial={loadState()} playbook={loadPlaybook()} kpi={loadKpi()} />;
}
