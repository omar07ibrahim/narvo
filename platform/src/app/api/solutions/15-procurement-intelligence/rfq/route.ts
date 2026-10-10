import { readBody } from "@/lib/ai/stream";
import { addAudit, appendRecord } from "@/lib/store/db";
import { COL, SOL, getRfqs } from "@/app/solutions/15-procurement-intelligence/_lib/server";
import type { Rfq } from "@/app/solutions/15-procurement-intelligence/_lib/types";

/** Save a drafted RFQ to the sourcing register. */
export async function POST(req: Request) {
  const body = await readBody<{ rfq: Rfq }>(req);
  if (!body.rfq?.title) return new Response("Missing RFQ", { status: 400 });
  const n = getRfqs().length + 1;
  const id = `MNDA/RFQ/2026/${String(180 + n).padStart(3, "0")}`;
  appendRecord(COL.rfqs, { ...body.rfq, id, status: "draft" });
  addAudit({
    solution: SOL,
    actor: { name: "Shamma Khalid Al Mansoori", role: "Senior Contracts Officer", kind: "human" },
    action: "Saved RFQ draft",
    subject: `${id} — ${body.rfq.title}`,
    detail: body.rfq.method ? `${body.rfq.method.label.en}${body.rfq.estimate ? ` · estimate AED ${body.rfq.estimate.toLocaleString("en-US")}` : ""}` : "method not determined",
  });
  return Response.json({ id, rfqs: getRfqs() });
}
