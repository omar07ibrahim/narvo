import { readBody } from "@/lib/ai/stream";
import { addAudit, patchRecord } from "@/lib/store/db";
import { COL, SOL, getObligations } from "@/app/solutions/13-contract-intelligence/_lib/server";
import { TODAY } from "@/app/solutions/13-contract-intelligence/_lib/dates";

/** The obligation owner records the agreed action (and closes the obligation). */
export async function POST(req: Request) {
  const body = await readBody<{ obligationId: string; action: string; close?: boolean }>(req);
  const o = getObligations().find((x) => x.id === body.obligationId);
  if (!o) return new Response("Obligation not found", { status: 404 });
  if (!body.action || body.action.trim().length < 6) return new Response("Describe the action taken", { status: 400 });
  patchRecord(COL.obligations, o.id, { action: body.action.trim(), ...(body.close ? { status: "done", doneAt: TODAY } : {}) });
  addAudit({
    solution: SOL,
    actor: { name: o.owner, role: o.ownerRole, kind: "human" },
    action: body.close ? "Completed obligation" : "Recorded agreed action",
    subject: `${o.id} — ${o.title.en}`,
    detail: body.action.trim().slice(0, 300),
  });
  return Response.json({ obligations: getObligations() });
}
