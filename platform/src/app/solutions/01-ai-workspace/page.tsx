export const dynamic = "force-dynamic";

import { Workspace } from "./_components/workspace";
import { libraryDocs, loadOutbox, loadTasks } from "./_lib/server";

export default function Page() {
  return <Workspace docs={libraryDocs()} initialTasks={loadTasks()} initialOutbox={loadOutbox()} />;
}
