import { readBody } from "@/lib/ai/stream";
import { addAudit, appendRecord, patchRecord } from "@/lib/store/db";
import { COL, loadRegistry, loadState } from "@/app/solutions/18-visual-inspection/_lib/data";
import { toUae } from "@/app/solutions/18-visual-inspection/_lib/rules";
import type { Inspection } from "@/app/solutions/18-visual-inspection/_lib/types";

/** Create an ad-hoc inspection from a camera capture or uploaded photo (bring-your-own input). */
export async function POST(req: Request) {
  const body = await readBody<{ photo?: string; plot?: string; contractor?: string; project?: string; note?: string; caption?: string }>(req);
  if (!body.photo?.startsWith("data:image/")) return new Response("photo (image data URL) required", { status: 400 });
  if (body.photo.length > 2_500_000) return new Response("Photo too large — please resize to ≤ 1600 px", { status: 413 });
  const reg = loadRegistry();
  const state = loadState();
  const plot = (body.plot || "").trim().toUpperCase();
  if (plot && !/^MN-\d{2}-\d{3}-\d{4}$/.test(plot)) return new Response("Plot must look like MN-DD-SSS-PPPP", { status: 400 });
  const contractor = reg.contractors.find((c) => c.name === body.contractor)?.name ?? body.contractor ?? "Unregistered contractor";
  const prior = state.inspections.find((i) => i.plot === plot);
  const seq = 7200 + state.inspections.filter((i) => i.adhoc).length + 1;
  const insp: Inspection = {
    id: `MNDA-INS-2026-0${seq}`,
    date: toUae(Date.now()),
    plot: plot || "MN-00-000-0000",
    district: plot ? plot.slice(0, 5) : "—",
    project: body.project || prior?.project || "Ad-hoc field capture",
    project_ar: body.project || prior?.project_ar || "التقاط ميداني",
    permit: prior?.permit ?? "—",
    contractor,
    consultant: prior?.consultant ?? "—",
    inspector: reg.inspectors[0],
    type: "Ad-hoc capture",
    photos: [{ src: body.photo, caption: body.caption || "Field capture" }],
    status: "awaiting_review",
    note: body.note || "",
    adhoc: true,
  };
  appendRecord(COL.inspections, insp as unknown as Record<string, unknown> & { id: string });
  addAudit({
    solution: "18-visual-inspection",
    actor: { name: insp.inspector.name, role: "Authorised Site Inspector", kind: "human" },
    action: "Captured ad-hoc inspection photo",
    subject: `${insp.id} · ${insp.plot}`,
    detail: `${contractor}${insp.note ? ` — ${insp.note}` : ""}`,
  });
  return Response.json({ inspection: insp, state: loadState() });
}

/** Return an inspection to review after its notice approval was rejected. */
export async function PATCH(req: Request) {
  const body = await readBody<{ id?: string; status?: string }>(req);
  const state = loadState();
  const insp = state.inspections.find((i) => i.id === body.id);
  if (!insp) return new Response("Inspection not found", { status: 404 });
  if (body.status !== "in_review" || insp.status !== "notice_pending") return new Response("Only a pending notice can be returned to review", { status: 409 });
  patchRecord(COL.inspections, insp.id, { status: "in_review" });
  addAudit({
    solution: "18-visual-inspection",
    actor: { name: insp.inspector.name, role: "Authorised Site Inspector", kind: "human" },
    action: "Returned inspection to review",
    subject: insp.id,
    detail: "Notice of Violation not approved — findings to be revised",
  });
  return Response.json({ state: loadState() });
}
