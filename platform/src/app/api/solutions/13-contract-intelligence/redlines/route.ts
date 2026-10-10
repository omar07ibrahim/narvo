import { readBody } from "@/lib/ai/stream";
import { createApproval } from "@/lib/store/db";
import { COL, SOL, getContracts, getReviews, loadPlaybook, putReview } from "@/app/solutions/13-contract-intelligence/_lib/server";

/** Route the accepted redlines to the Head of Legal Affairs for sign-off. */
export async function POST(req: Request) {
  const body = await readBody<{ contractId: string; lang?: "en" | "ar" }>(req);
  const ar = body.lang === "ar";
  const review = getReviews()[body.contractId];
  if (!review) return new Response("Review not found", { status: 404 });
  const accepted = review.findings.filter((f) => f.decision === "accepted" && f.redline);
  if (!accepted.length) return new Response(ar ? "اقبل تعديلاً واحداً على الأقل" : "Accept at least one redline first", { status: 400 });
  const pb = loadPlaybook();
  const isRegister = getContracts().some((c) => c.id === review.contractId);
  const summary = accepted
    .map((f) => `${f.positionId} ${pb.positions.find((p) => p.id === f.positionId)?.topic.en} (cl. ${f.clauseRef}, ${f.risk})`)
    .join(" · ");
  const approval = createApproval({
    solution: SOL,
    title: ar ? `اعتماد التعديلات المقترحة — ${review.name}` : `Approve redline pack — ${review.name}`,
    summary: `${accepted.length} ${ar ? "تعديلات مقبولة" : "accepted redlines"}: ${summary}`.slice(0, 900),
    actionLabel: ar ? "اعتماد وإرسال للطرف الآخر" : "Approve & send to counterparty",
    approver: { name: "Adv. Noura Khalifa Al Qubaisi", title: ar ? "رئيسة الشؤون القانونية" : "Head of Legal Affairs" },
    effects: [
      ...(isRegister ? [{ type: "patch" as const, collection: COL.contracts, id: review.contractId, patch: { reviewStatus: `Redlines approved (${accepted.length}) — sent to counterparty` } }] : []),
      { type: "audit", action: "Redline pack issued to counterparty", subject: review.name, detail: summary.slice(0, 280) },
    ],
    payload: { redlines: accepted.map((f) => ({ positionId: f.positionId, clause: f.clauseRef, redline: f.redline })) },
  });
  review.approvalId = approval.id;
  putReview(review);
  return Response.json({ approvalId: approval.id });
}
