import { readBody } from "@/lib/ai/stream";
import { addAudit, appendRecord, patchRecord } from "@/lib/store/db";
import { COL, getInspection, loadState, loadTaxonomy } from "@/app/solutions/18-visual-inspection/_lib/data";
import { REJECT_REASONS, type Finding } from "@/app/solutions/18-visual-inspection/_lib/types";

/**
 * Inspector decisions on findings (all audited):
 *  - review: accept / reject (with reason code R1–R6)
 *  - recode: change the defect code of an AI flag (counts as accepted, original code kept)
 *  - add: add a defect the AI missed (box drawn by the reviewer)
 */
export async function POST(req: Request) {
  const body = await readBody<{
    action?: "review" | "recode" | "add" | "reopen";
    id?: string;
    decision?: "accepted" | "rejected";
    reason?: string;
    code?: string;
    inspectionId?: string;
    photo?: number;
    title?: string;
    description?: string;
    bbox?: [number, number, number, number] | null;
    reviewer?: string;
  }>(req);
  const tax = loadTaxonomy();
  const state = loadState();
  const reviewer = body.reviewer ?? "";

  if (body.action === "add") {
    const { insp } = getInspection(body.inspectionId ?? "");
    if (!insp) return new Response("Inspection not found", { status: 404 });
    const d = tax.defects.find((x) => x.code === body.code);
    if (!d) return new Response("Unknown defect code", { status: 400 });
    const f: Finding = {
      id: `F-R${Date.now().toString(36).toUpperCase()}`,
      inspectionId: insp.id,
      photo: body.photo ?? 0,
      code: d.code,
      title: (body.title || d.name).slice(0, 120),
      description: (body.description || "").slice(0, 600),
      bbox: body.bbox ?? null,
      confidence: null,
      source: "reviewer",
      status: "accepted",
      reviewer: reviewer || insp.inspector.name,
      reviewedAt: Date.now(),
      createdAt: Date.now(),
    };
    appendRecord(COL.findings, f as unknown as Record<string, unknown> & { id: string });
    if (insp.status === "awaiting_review") patchRecord(COL.inspections, insp.id, { status: "in_review" });
    addAudit({
      solution: "18-visual-inspection",
      actor: { name: f.reviewer!, role: "Authorised Site Inspector", kind: "human" },
      action: "Added missed defect",
      subject: `${insp.id} · ${d.code} ${d.name}`,
      detail: `${f.description || f.title} — fed back for model monitoring`,
    });
    return Response.json({ finding: f, state: loadState() });
  }

  const f = state.findings.find((x) => x.id === body.id);
  if (!f) return new Response("Finding not found", { status: 404 });
  const insp = state.inspections.find((i) => i.id === f.inspectionId)!;
  if (insp.status === "notice_issued" || insp.status === "closed") return new Response("A notice has already been issued for this inspection", { status: 409 });
  const who = reviewer || insp.inspector.name;

  if (body.action === "review") {
    if (body.decision !== "accepted" && body.decision !== "rejected") return new Response("decision must be accepted or rejected", { status: 400 });
    const reason = body.decision === "rejected" ? REJECT_REASONS.find((r) => r.code === body.reason) : undefined;
    if (body.decision === "rejected" && !reason) return new Response("A reject reason (R1–R6) is required", { status: 400 });
    patchRecord(COL.findings, f.id, { status: body.decision, rejectReason: reason?.code, reviewer: who, reviewedAt: Date.now() });
    addAudit({
      solution: "18-visual-inspection",
      actor: { name: who, role: "Authorised Site Inspector", kind: "human" },
      action: body.decision === "accepted" ? "Accepted AI finding" : "Rejected AI finding (false flag)",
      subject: `${insp.id} · ${f.code} ${f.title}`,
      detail: reason ? `${reason.code} — ${reason.en}` : `Confidence ${f.confidence != null ? Math.round(f.confidence * 100) + "%" : "—"}`,
    });
  } else if (body.action === "recode") {
    const d = tax.defects.find((x) => x.code === body.code);
    if (!d) return new Response("Unknown defect code", { status: 400 });
    patchRecord(COL.findings, f.id, { code: d.code, originalCode: f.originalCode ?? f.code, status: "accepted", reviewer: who, reviewedAt: Date.now() });
    addAudit({
      solution: "18-visual-inspection",
      actor: { name: who, role: "Authorised Site Inspector", kind: "human" },
      action: "Re-classified AI finding",
      subject: `${insp.id} · ${f.code} → ${d.code}`,
      detail: `${f.title} — accepted as ${d.name} (${d.article})`,
    });
  } else if (body.action === "reopen") {
    patchRecord(COL.findings, f.id, { status: "proposed", rejectReason: undefined, reviewer: undefined, reviewedAt: undefined });
  } else {
    return new Response("Unknown action", { status: 400 });
  }
  return Response.json({ state: loadState() });
}
