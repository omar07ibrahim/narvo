import { addAudit, patchRecord } from "@/lib/store/db";
import { loadOutbox, loadTasks, resolveRole, SOLUTION, TASKS } from "@/app/solutions/01-ai-workspace/_lib/server";
import { ROLES } from "@/app/solutions/01-ai-workspace/_lib/shared";

/** Tasks created through approved agent actions (plus earlier history) and the sent-email outbox. */
export async function GET() {
  return Response.json({ tasks: loadTasks(), outbox: loadOutbox() });
}

/** Mark a task done / reopen it — persisted and audited. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { id?: string; status?: string; role?: string };
  if (!body.id || (body.status !== "done" && body.status !== "open")) {
    return new Response("id and status ('done' | 'open') are required", { status: 400 });
  }
  const task = loadTasks().find((t) => t.id === body.id);
  if (!task) return new Response("Task not found", { status: 404 });
  const actor = ROLES[resolveRole(body.role)].persona;
  patchRecord(TASKS, task.id, {
    status: body.status,
    completedAt: body.status === "done" ? new Date().toISOString() : null,
  });
  addAudit({
    solution: SOLUTION,
    actor: { name: actor.name, role: actor.title.en, kind: "human" },
    action: body.status === "done" ? "Task completed" : "Task reopened",
    subject: `${task.id} · ${task.title}`,
    detail: `Owner ${task.owner}`,
  });
  return Response.json({ tasks: loadTasks() });
}
