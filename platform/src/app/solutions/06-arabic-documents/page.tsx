export const dynamic = "force-dynamic";

import { DocOps } from "./_components/doc-ops";
import { loadGlossary, loadQueue, runSummaries } from "./_lib/server";

export default function Page() {
  // Strip inline source text from the queue payload; the document route serves it on demand.
  const docs = loadQueue().map((d) => ({ ...d, text: undefined }));
  return <DocOps initialDocs={docs} initialSummaries={runSummaries()} initialTerms={loadGlossary()} />;
}
