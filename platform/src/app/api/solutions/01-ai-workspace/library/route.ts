import { getDoc } from "@/lib/retrieval";
import {
  canRead,
  classOf,
  CORPUS,
  corpusStats,
  libraryDocs,
  resolveRole,
  searchFiltered,
} from "@/app/solutions/01-ai-workspace/_lib/server";
import { ROLES, SCOPES, type ScopeKey } from "@/app/solutions/01-ai-workspace/_lib/shared";

/**
 * Knowledge library:
 *   GET ?role=…                → document list (metadata, classification, passages)
 *   GET ?id=…&role=…           → one document (refused above the role's access level)
 *   GET ?q=…&role=…&scope=…    → passage search (BM25, access-filtered)
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const role = resolveRole(url.searchParams.get("role"));
  const id = url.searchParams.get("id");
  const q = url.searchParams.get("q");

  if (id) {
    const doc = getDoc(CORPUS, id);
    if (!doc) return new Response("Document not found", { status: 404 });
    if (!canRead(role, doc)) {
      return Response.json(
        { error: "restricted", classification: classOf(doc), access: ROLES[role].access },
        { status: 403 },
      );
    }
    const { body, ...meta } = doc;
    return Response.json({ meta: { ...meta, classification: classOf(doc) }, body });
  }

  if (q) {
    const scopeParam = url.searchParams.get("scope") as ScopeKey | null;
    const scope: ScopeKey = SCOPES.some((s) => s.key === scopeParam) ? (scopeParam as ScopeKey) : "all";
    const { hits, withheld } = searchFiltered([q], role, scope, 12);
    return Response.json({ hits, withheld: withheld.length });
  }

  return Response.json({ docs: libraryDocs(), stats: corpusStats() });
}
