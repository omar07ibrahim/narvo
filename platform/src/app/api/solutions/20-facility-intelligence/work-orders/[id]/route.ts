import { addAudit, patchRecord } from "@/lib/store/db";
import { loadWorkOrders, SLUG, WOS } from "@/app/solutions/20-facility-intelligence/_lib/data";

/** Record the contractor's completion of a work order (time and report); verification runs next. */
export async function POST(req: Request, ctx: RouteContext<"/api/solutions/20-facility-intelligence/work-orders/[id]">) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { completedAt?: string; note?: string };
  const wo = loadWorkOrders().find((w) => w.id === id);
  if (!wo) return new Response("Work order not found", { status: 404 });
  const t = body.completedAt ? Date.parse(body.completedAt) : NaN;
  if (Number.isNaN(t)) return new Response("completedAt must be a valid date-time", { status: 400 });
  const completedAt = new Date(t + 4 * 3600000).toISOString().slice(0, 16) + ":00+04:00";
  patchRecord(WOS, id, { status: "Completed — verification pending", completedAt, completionNote: (body.note ?? "").slice(0, 2000) });
  addAudit({
    solution: SLUG,
    actor: { name: "Eng. Tariq Mahmoud Saleh", role: "Director, Facilities & Assets", kind: "human" },
    action: "Recorded contractor completion",
    subject: `${id} — ${wo.title}`.slice(0, 200),
    detail: `Completed ${completedAt.slice(0, 16).replace("T", " ")} GST`,
  });
  return Response.json({ workOrder: loadWorkOrders().find((w) => w.id === id) });
}
