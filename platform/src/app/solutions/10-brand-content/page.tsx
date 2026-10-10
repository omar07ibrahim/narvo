export const dynamic = "force-dynamic";

import { loadState } from "./_lib/data";
import { BrandWorkspace } from "./_components/brand-workspace";

const TABS = ["variant", "facts", "byo", "assets", "release"] as const;

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const v = typeof sp.v === "string" && /^V-(web|linkedin|instagram|whatsapp|brochure|email)-(en|ar)$/.test(sp.v) ? sp.v : undefined;
  const tab = typeof sp.tab === "string" && (TABS as readonly string[]).includes(sp.tab) ? (sp.tab as (typeof TABS)[number]) : undefined;
  return <BrandWorkspace initial={loadState()} initialSelected={v} initialTab={tab} />;
}
