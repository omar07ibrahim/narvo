export const dynamic = "force-dynamic";

import { loadCustomerDocs, loadSnapshot } from "./_lib/data";
import { Workspace } from "./_components/workspace";

export default function Page() {
  return <Workspace initial={loadSnapshot()} docs={loadCustomerDocs()} />;
}
