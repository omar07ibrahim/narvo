export const dynamic = "force-dynamic";

import { ProcurementWorkspace } from "./_components/procurement-workspace";
import { getSuppliers, loadPrices, loadResponses, loadState, loadTender } from "./_lib/server";

export default function Page() {
  return <ProcurementWorkspace tender={loadTender()} initial={loadState()} prices={loadPrices(getSuppliers())} responses={loadResponses()} />;
}
