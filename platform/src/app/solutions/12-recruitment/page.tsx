export const dynamic = "force-dynamic";

import { RecruitmentWorkspace } from "./_components/workspace";
import { loadState } from "./_lib/data";

export default function Page() {
  return <RecruitmentWorkspace initial={loadState()} />;
}
