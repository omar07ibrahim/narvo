import { readBody } from "@/lib/ai/stream";
import { addAudit, patchRecord } from "@/lib/store/db";
import { COL, SOL, getForms, loadSeed } from "@/app/solutions/09-bid-proposal/_lib/server";

/** Update the status of a mandatory tender form (e.g. signed declaration received). */
export async function POST(req: Request) {
  const body = await readBody<{ formId: string; status: string }>(req);
  const allowed = ["not_started", "in_progress", "pending_signature", "requested", "complete"];
  if (!allowed.includes(body.status)) return new Response("Invalid status", { status: 400 });
  const seed = loadSeed();
  const form = getForms(seed).find((f) => f.id === body.formId);
  if (!form) return new Response("Unknown form", { status: 404 });
  patchRecord(COL.forms, form.id, { status: body.status });
  addAudit({
    solution: SOL,
    actor: { name: "Leena Mattar", role: "Bid Manager, Raseen FM", kind: "human" },
    action: body.status === "complete" ? "Marked form complete" : "Updated form status",
    subject: `${form.id} ${form.name.en}`,
    detail: `${form.status} → ${body.status}`,
  });
  return Response.json({ forms: getForms(seed) });
}
