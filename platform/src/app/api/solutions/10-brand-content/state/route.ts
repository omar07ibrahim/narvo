import { loadState } from "@/app/solutions/10-brand-content/_lib/data";

export const dynamic = "force-dynamic";

/** Full module state: fact sheet (with runtime versions), channels, brand rules, assets, variants, changes, releases. */
export async function GET() {
  return Response.json(loadState());
}
