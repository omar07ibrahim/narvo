import { decideApproval, getApproval } from "@/lib/store/db";

export async function GET(_req: Request, ctx: RouteContext<"/api/approvals/[id]">) {
  const { id } = await ctx.params;
  const a = getApproval(id);
  if (!a) return new Response("Not found", { status: 404 });
  return Response.json(a);
}

export async function POST(req: Request, ctx: RouteContext<"/api/approvals/[id]">) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { decision?: string; comment?: string };
  if (body.decision !== "approved" && body.decision !== "rejected") {
    return new Response("decision must be 'approved' or 'rejected'", { status: 400 });
  }
  try {
    return Response.json(decideApproval(id, body.decision, body.comment));
  } catch (e) {
    return new Response((e as Error).message, { status: 404 });
  }
}
