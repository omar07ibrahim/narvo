export const dynamic = "force-dynamic";

import { SalesWorkspace } from "./_components/sales-workspace";
import { loadSalesData } from "./_lib/records";

export default function Page() {
  return <SalesWorkspace initial={loadSalesData()} />;
}
