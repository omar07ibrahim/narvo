import { readBody } from "@/lib/ai/stream";
import { addAudit, patchRecord } from "@/lib/store/db";
import { COL, loadState } from "@/app/solutions/18-visual-inspection/_lib/data";
import type { Closure } from "@/app/solutions/18-visual-inspection/_lib/types";

/** Inspector's closure decision on a corrective task (close / keep open, with reason) — audited. */
export async function POST(req: Request) {
  const body = await readBody<{
    taskId?: string;
    decision?: "closed" | "kept_open";
    reason?: string;
    verdict?: { verdict: Closure["verdict"]; confidence: number; observations?: string[]; remaining?: string[] };
    afterThumb?: string;
    by?: string;
  }>(req);
  const state = loadState();
  const task = state.tasks.find((t) => t.id === body.taskId);
  if (!task) return new Response("Task not found", { status: 404 });
  if (task.status === "closed") return new Response("Task already closed", { status: 409 });
  if (body.decision !== "closed" && body.decision !== "kept_open") return new Response("decision must be closed or kept_open", { status: 400 });
  const reason = (body.reason ?? "").trim();
  if (reason.length < 4) return new Response("A reason is required", { status: 400 });
  const insp = state.inspections.find((i) => i.id === task.inspectionId)!;
  const by = body.by ?? insp.inspector.name;
  const now = Date.now();
  const attempts = [...(task.attempts ?? []), { at: now, verdict: body.verdict?.verdict ?? "manual", reason }];
  if (body.decision === "closed") {
    const closure: Closure = {
      verdict: body.verdict?.verdict ?? "resolved",
      confidence: body.verdict?.confidence ?? 1,
      summary: (body.verdict?.observations ?? []).join(" "),
      remaining: body.verdict?.remaining ?? [],
      afterThumb: body.afterThumb && body.afterThumb.length < 400_000 ? body.afterThumb : undefined,
      decision: "closed",
      reason,
      decidedBy: by,
      decidedAt: now,
    };
    patchRecord(COL.tasks, task.id, { status: "closed", closure, attempts });
    // Close the inspection when every task of its notice is closed
    const siblings = state.tasks.filter((t) => t.inspectionId === task.inspectionId && t.id !== task.id);
    if (siblings.every((t) => t.status === "closed")) patchRecord(COL.inspections, task.inspectionId, { status: "closed" });
  } else {
    patchRecord(COL.tasks, task.id, { attempts });
  }
  addAudit({
    solution: "18-visual-inspection",
    actor: { name: by, role: "Authorised Site Inspector", kind: "human" },
    action: body.decision === "closed" ? "Verified closure of corrective task" : "Kept corrective task open",
    subject: `${task.id} · ${task.code} · ${task.owner}`,
    detail: `${reason}${body.verdict ? ` (AI verdict: ${body.verdict.verdict}, ${Math.round(body.verdict.confidence * 100)}%)` : ""}`,
  });
  return Response.json({ state: loadState() });
}
