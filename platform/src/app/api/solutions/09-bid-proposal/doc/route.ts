import { getDoc } from "@/lib/retrieval";
import { LIB, loadRfp } from "@/app/solutions/09-bid-proposal/_lib/server";

/** Return the markdown of an evidence-library document (or the RFP) for the viewer. */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (id === "rfp") {
    const { meta, body } = loadRfp();
    return Response.json({ id, title: meta.title ?? "RFP", ref: meta.ref, body });
  }
  const doc = getDoc(LIB, id);
  if (!doc) return new Response("Not found", { status: 404 });
  return Response.json({ id: doc.id, title: doc.title, ref: doc.ref, type: doc.type, date: doc.date, body: doc.body });
}
