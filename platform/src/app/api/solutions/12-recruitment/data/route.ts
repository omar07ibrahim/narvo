import { loadState } from "@/app/solutions/12-recruitment/_lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(loadState());
  } catch (e) {
    return new Response((e as Error).message, { status: 500 });
  }
}
