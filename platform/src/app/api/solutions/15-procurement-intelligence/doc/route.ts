import { getDoc } from "@/lib/retrieval";
import { CORPUS, getSuppliers, loadSubmission } from "@/app/solutions/15-procurement-intelligence/_lib/server";

/** Markdown of a submission (by supplier id) or of a manual / clarification document (by doc id). */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const s = getSuppliers().find((x) => x.id === id);
  if (s) {
    const { meta, body } = loadSubmission(s);
    return Response.json({ id, title: meta.title ?? s.name, ref: meta.ref, body });
  }
  const doc = getDoc(CORPUS.all, id) ?? getDoc(CORPUS.manual, id);
  if (!doc) return new Response("Not found", { status: 404 });
  return Response.json({ id: doc.id, title: doc.title, ref: doc.ref, body: doc.body });
}
