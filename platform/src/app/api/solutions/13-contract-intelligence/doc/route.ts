import { getDoc } from "@/lib/retrieval";
import { CORPUS, contractText } from "@/app/solutions/13-contract-intelligence/_lib/server";

/** Markdown of a contract (register or uploaded) or of an evidence document, for the viewer. */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const src = contractText(id);
  if (src) return Response.json({ id, title: src.name, ref: src.contract?.ref, body: src.body });
  const doc = getDoc(CORPUS.evidence, id);
  if (!doc) return new Response("Not found", { status: 404 });
  return Response.json({ id: doc.id, title: doc.title, ref: doc.ref, body: doc.body });
}
