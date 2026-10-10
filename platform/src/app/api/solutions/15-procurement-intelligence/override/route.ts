import { readBody } from "@/lib/ai/stream";
import { addAudit } from "@/lib/store/db";
import { SOL, getEvals, getOverrides, getSuppliers, loadTender, setOverride } from "@/app/solutions/15-procurement-intelligence/_lib/server";

/** Evaluator override of an AI-suggested technical score — justified and logged (Manual Art. 30). */
export async function POST(req: Request) {
  const body = await readBody<{ supplierId: string; criterionId: string; score: number | null; reason?: string; by?: string }>(req);
  const tender = loadTender();
  const supplier = getSuppliers().find((s) => s.id === body.supplierId);
  const crit = tender.criteria.find((c) => c.id === body.criterionId);
  if (!supplier || !crit) return new Response("Unknown supplier or criterion", { status: 400 });
  const ai = getEvals()[supplier.id]?.criteria.find((c) => c.id === crit.id)?.score;
  const by = body.by || "Rashed Ali Al Dhaheri";
  if (body.score == null) {
    setOverride(supplier.id, crit.id, null);
    addAudit({ solution: SOL, actor: { name: by, role: "Tender committee evaluator", kind: "human" }, action: "Removed score override", subject: `${supplier.short} — ${crit.id} ${crit.label.en}`, detail: `Back to AI-suggested ${ai ?? "—"}/10` });
  } else {
    const score = Math.max(0, Math.min(10, Math.round(body.score * 2) / 2));
    if (!body.reason || body.reason.trim().length < 8) return new Response("A written justification is required (Art. 30)", { status: 400 });
    setOverride(supplier.id, crit.id, { score, reason: body.reason.trim(), by, at: Date.now() });
    addAudit({
      solution: SOL,
      actor: { name: by, role: "Tender committee evaluator", kind: "human" },
      action: "Overrode technical score",
      subject: `${supplier.short} — ${crit.id} ${crit.label.en}`,
      detail: `AI ${ai ?? "—"}/10 → ${score}/10. Justification: ${body.reason.trim()}`.slice(0, 400),
    });
  }
  return Response.json({ overrides: getOverrides() });
}
