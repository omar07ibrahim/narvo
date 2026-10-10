import { readBody } from "@/lib/ai/stream";
import { addAudit, patchRecord } from "@/lib/store/db";
import { COL, SOL, getCertificates, getCoverage, getForms, loadSeed, putCoverage } from "@/app/solutions/09-bid-proposal/_lib/server";
import { mergeStatus, requirementCheck } from "@/app/solutions/09-bid-proposal/_lib/compliance";

/** Update the status of a mandatory tender form; coverage of the linked requirements is recomputed. */
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
    detail: `${form.status.replace(/_/g, " ")} → ${body.status.replace(/_/g, " ")}`,
  });
  const forms = getForms(seed);
  const certs = getCertificates(seed);
  const cov = getCoverage();
  const updated = (form.requirements ?? [form.requirement])
    .filter((id) => cov[id])
    .map((id) => {
      const check = requirementCheck(seed, id, certs, forms);
      return { ...cov[id], check, status: mergeStatus(cov[id].aiStatus, check), updatedAt: Date.now() };
    });
  if (updated.length) putCoverage(updated);
  return Response.json({ forms, coverage: Object.fromEntries(updated.map((u) => [u.reqId, u])) });
}
