import { createApproval } from "@/lib/store/db";
import {
  advanceRequest,
  buildDraft,
  getDraft,
  getEmployee,
  getStats,
  HR_SERVICES,
  IT_DESK,
  loadRequests,
  saveDraft,
  SOLUTION,
  submitDraft,
} from "@/app/solutions/11-employee-services/_lib/server";

/** Requests (all employees — the desk view filters), plus live KPI inputs. */
export async function GET() {
  return Response.json({ requests: loadRequests(), stats: getStats() });
}

/**
 * Actions:
 *   { action: "revalidate", draftId, fields }      → re-run checks on an edited form
 *   { action: "submit", draftId, fields }          → create request + approval for the responsible approver
 *   { action: "advance", id, to, note }            → service desk: move to fulfilment / complete
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    draftId?: string;
    fields?: Record<string, string | boolean | string[] | number | null>;
    id?: string;
    to?: "in_fulfilment" | "completed";
    note?: string;
  };
  try {
    if (body.action === "revalidate" || body.action === "submit") {
      const draft = body.draftId ? getDraft(body.draftId) : undefined;
      if (!draft) return new Response("Form not found — ask the assistant to prepare it again", { status: 404 });
      const employee = getEmployee(draft.employeeId)!;
      if (body.action === "revalidate") {
        const next = saveDraft({ ...buildDraft(employee, draft.type, { ...draft.fields, ...(body.fields ?? {}) }, draft.id), submittedRequestId: draft.submittedRequestId });
        return Response.json({ draft: next });
      }
      const { request, spec } = submitDraft(draft, body.fields);
      const approval = createApproval({
        solution: SOLUTION,
        title: spec.title,
        summary: spec.summary,
        actionLabel: spec.actionLabel,
        approver: spec.approver,
        effects: spec.effects,
        payload: spec.payload,
        requestedBy: employee.name,
      });
      return Response.json({
        request,
        draft: getDraft(draft.id),
        approval: {
          id: approval.id,
          title: approval.title,
          summary: approval.summary,
          solution: SOLUTION,
          actionLabel: approval.actionLabel,
          approver: approval.approver,
          status: approval.status,
          createdAt: approval.createdAt,
        },
      });
    }
    if (body.action === "advance") {
      if (!body.id || (body.to !== "in_fulfilment" && body.to !== "completed")) return new Response("id and to are required", { status: 400 });
      const current = loadRequests().find((r) => r.id === body.id);
      if (!current) return new Response("Request not found", { status: 404 });
      const agent = current.queue === "HR" ? HR_SERVICES.name : IT_DESK.name;
      const request = advanceRequest(body.id, body.to, agent, body.note?.trim() || undefined);
      return Response.json({ request, requests: loadRequests(), stats: getStats() });
    }
    return new Response("Unknown action", { status: 400 });
  } catch (e) {
    return new Response((e as Error).message, { status: 422 });
  }
}
