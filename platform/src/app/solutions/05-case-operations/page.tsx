export const dynamic = "force-dynamic";

import { loadCases } from "./_lib/data";
import { CaseWorkspace } from "./_components/case-workspace";

export default function Page() {
  return <CaseWorkspace initialCases={loadCases()} />;
}
