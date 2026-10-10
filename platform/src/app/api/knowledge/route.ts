import { getIndex, getDoc, search, listDocs } from "@/lib/retrieval";

const CORPORA = ["mnda/knowledge", "raseen/knowledge"];

/**
 * Knowledge sources browser.
 *  GET ?                         → corpora with stats + document list
 *  GET ?corpus=…&q=…             → BM25 search hits
 *  GET ?corpus=…&id=…            → one document (front-matter + body)
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const corpus = url.searchParams.get("corpus");
  const q = url.searchParams.get("q");
  const id = url.searchParams.get("id");

  if (corpus && id) {
    if (!CORPORA.includes(corpus)) return new Response("Unknown corpus", { status: 400 });
    const d = getDoc(corpus, id);
    if (!d) return new Response("Not found", { status: 404 });
    return Response.json(d);
  }
  if (q) {
    const list = corpus ? [corpus] : CORPORA;
    const t0 = Date.now();
    const hits = list.flatMap((c) => search(c, q, 12).map((h) => ({ ...h, corpus: c })));
    hits.sort((a, b) => b.score - a.score);
    return Response.json({ hits: hits.slice(0, 15), ms: Date.now() - t0 });
  }
  return Response.json({
    corpora: CORPORA.map((c) => {
      const idx = getIndex(c);
      return { id: c, documents: idx.docs.length, passages: idx.chunks.length, terms: idx.df.size, docs: listDocs(c) };
    }),
  });
}
