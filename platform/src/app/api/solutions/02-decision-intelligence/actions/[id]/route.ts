import { addAudit, patchRecord } from "@/lib/store/db";
import { ACTIONS, loadActions, SLUG } from "@/app/solutions/02-decision-intelligence/_lib/data";
import { REVIEW } from "@/app/solutions/02-decision-intelligence/_lib/catalogue";
import { actionStats } from "@/app/solutions/02-decision-intelligence/_lib/engine";

/** Update an action in the register: close it, reopen it or mark it in progress (audited). */
export async function POST(req: Request, ctx: RouteContext<"/api/solutions/02-decision-intelligence/actions/[id]">) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { status?: string; note?: string; by?: string };
  const status = body.status;
  if (status !== "done" && status !== "open" && status !== "in_progress") return new Response("status must be done | open | in_progress", { status: 400 });
  const current = loadActions().find((a) => a.id === id);
  if (!current) return new Response("Action not found", { status: 404 });
  const patch: Record<string, unknown> = { status, closedAt: status === "done" ? REVIEW.today : null };
  if (body.note) patch.note = body.note.slice(0, 600);
  patchRecord(ACTIONS, id, patch);
  addAudit({
    solution: SLUG,
    actor: { name: body.by || "Dr. Amna Rashid Al Ketbi", role: "Executive Director, Strategy & Performance", kind: "human" },
    action: status === "done" ? (REVIEW.today > current.due ? "Closed action (late)" : "Closed action") : status === "open" ? "Reopened action" : "Marked action in progress",
    subject: `${id} — ${current.title}`,
    detail: body.note || `Owner ${current.owner}, due ${current.due}`,
  });
  const actions = loadActions();
  return Response.json({ action: actions.find((a) => a.id === id), stats: actionStats(actions, REVIEW.today) });
}
