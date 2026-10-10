import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { getQueueDoc } from "@/app/solutions/06-arabic-documents/_lib/server";
import { runPipeline } from "@/app/solutions/06-arabic-documents/_lib/pipeline";

/** Segment → terminology → glossary-constrained translation → automated + model QA (SSE). */
export async function POST(req: Request) {
  const body = await readBody<{ docId?: string }>(req);
  const { modelKey, lang } = getPrefs(req, body as Record<string, unknown>);
  const doc = body.docId ? getQueueDoc(body.docId) : undefined;
  if (!doc) return new Response("Document not found", { status: 404 });
  return eventStream(
    req,
    async (emit) => {
      await runPipeline(emit, doc, lang, modelKey);
    },
    { modelKey },
  );
}
