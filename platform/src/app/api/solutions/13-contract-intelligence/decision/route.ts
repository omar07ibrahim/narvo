import { readBody } from "@/lib/ai/stream";
import { addAudit } from "@/lib/store/db";
import { SOL, getReviews, loadPlaybook, putReview } from "@/app/solutions/13-contract-intelligence/_lib/server";

/** A qualified reviewer accepts or rejects one flagged clause / proposed redline. */
export async function POST(req: Request) {
  const body = await readBody<{ contractId: string; positionId: string; decision: "accepted" | "rejected" | null; note?: string; by?: string }>(req);
  const review = getReviews()[body.contractId];
  if (!review) return new Response("Review not found", { status: 404 });
  const f = review.findings.find((x) => x.positionId === body.positionId);
  if (!f) return new Response("Finding not found", { status: 404 });
  const by = body.by || "Adv. Noura Khalifa Al Qubaisi";
  if (body.decision) {
    f.decision = body.decision;
    f.decidedBy = by;
    f.note = body.note;
  } else {
    delete f.decision;
    delete f.decidedBy;
    delete f.note;
  }
  putReview(review);
  const pos = loadPlaybook().positions.find((p) => p.id === f.positionId);
  addAudit({
    solution: SOL,
    actor: { name: by, role: "Contract reviewer", kind: "human" },
    action: body.decision === "accepted" ? "Accepted proposed redline" : body.decision === "rejected" ? "Rejected flag" : "Reopened flag",
    subject: `${review.name} — ${f.positionId} ${pos?.topic.en ?? ""} (clause ${f.clauseRef})`,
    detail: body.note,
  });
  return Response.json({ review });
}
