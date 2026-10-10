import { kvGet } from "@/lib/store/db";
import { kvUploadKey } from "@/app/solutions/14-finance-operations/_lib/data";

/** Serves an invoice image uploaded through "bring your own" (kept in the module's runtime store). */
export async function GET(_req: Request, ctx: RouteContext<"/api/solutions/14-finance-operations/upload/[id]">) {
  const { id } = await ctx.params;
  const dataUrl = kvGet<string>(kvUploadKey(id));
  const m = dataUrl?.match(/^data:([^;]+);base64,(.*)$/);
  if (!m) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(m[2], "base64"), { headers: { "Content-Type": m[1], "Cache-Control": "private, max-age=3600" } });
}
