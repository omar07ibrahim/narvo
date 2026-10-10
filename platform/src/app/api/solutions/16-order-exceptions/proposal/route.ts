import { addAudit } from "@/lib/store/db";
import { clearProposal, getProposal } from "@/app/solutions/16-order-exceptions/_lib/data";
import { SLUG } from "@/app/solutions/16-order-exceptions/_lib/rules";

export const dynamic = "force-dynamic";

/** Current proposed change (from an interpreted customer message) for an order. */
export async function GET(req: Request) {
  const orderId = new URL(req.url).searchParams.get("orderId");
  if (!orderId) return Response.json({ error: "orderId is required" }, { status: 400 });
  return Response.json({ proposal: getProposal(orderId) });
}

/** Discard the proposed change. */
export async function DELETE(req: Request) {
  const orderId = new URL(req.url).searchParams.get("orderId");
  if (!orderId) return Response.json({ error: "orderId is required" }, { status: 400 });
  const p = getProposal(orderId);
  if (!p) return Response.json({ ok: true, cleared: false });
  clearProposal(orderId);
  addAudit({
    solution: SLUG,
    actor: { name: "Order desk", role: "Planner", kind: "human" },
    action: "Discarded proposed change",
    subject: orderId,
    detail: p.docTitle,
  });
  return Response.json({ ok: true, cleared: true });
}
