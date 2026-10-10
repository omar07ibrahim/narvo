export const dynamic = "force-dynamic";

import { Workspace } from "./_components/workspace";
import { loadChanges, loadLog } from "./_lib/data";

export default function Page() {
  return <Workspace initialLog={loadLog().compact} initialChanges={loadChanges()} />;
}
