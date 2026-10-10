export const dynamic = "force-dynamic";

import { loadDataset } from "./_lib/data";
import { FinanceWorkspace } from "./_components/finance-workspace";

/** Deep links: /solutions/14-finance-operations?doc=AP-26-09-025&tab=resolution */
export default async function Page({ searchParams }: PageProps<"/solutions/14-finance-operations">) {
  const sp = await searchParams;
  const doc = typeof sp.doc === "string" ? sp.doc : undefined;
  const tab = sp.tab === "document" || sp.tab === "resolution" || sp.tab === "match" ? sp.tab : undefined;
  return <FinanceWorkspace initial={loadDataset()} initialDoc={doc} initialTab={tab} />;
}
