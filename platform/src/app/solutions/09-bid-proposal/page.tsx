export const dynamic = "force-dynamic";

import { readJsonSafe } from "@/lib/world/data";
import { BidWorkspace } from "./_components/bid-workspace";
import type { Reply } from "./_components/tasks-view";
import { libraryDocs, loadSeed, loadState } from "./_lib/server";

export default function Page() {
  const replies = readJsonSafe<Reply[]>("raseen/09-bid-proposal/contributor-replies.json", []);
  return <BidWorkspace seed={loadSeed()} initial={loadState()} library={libraryDocs()} replies={replies} />;
}
