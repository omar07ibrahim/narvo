import { addAudit, appendRecord } from "@/lib/store/db";
import { DOCS, getQueueDoc, getRun, loadQueue, runSummaries, SOLUTION, sourceText } from "@/app/solutions/06-arabic-documents/_lib/server";
import type { QueueDoc } from "@/app/solutions/06-arabic-documents/_lib/shared";

/**
 *   GET            → translation queue + last-run summaries
 *   GET ?id=…      → one document: metadata, source text, last run (segments, flags, metrics)
 *   POST           → bring your own document { title, text, source, target }
 */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (id) {
    const doc = getQueueDoc(id);
    if (!doc) return new Response("Document not found", { status: 404 });
    return Response.json({ doc, text: sourceText(doc), run: getRun(id) ?? null });
  }
  return Response.json({ docs: loadQueue(), summaries: runSummaries() });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { title?: string; text?: string; source?: string; target?: string; requestedBy?: string };
  const text = (body.text ?? "").trim();
  if (text.length < 20) return new Response("Please provide at least a paragraph of text", { status: 400 });
  if (text.length > 30000) return new Response("Document is too long for the demo (max 30,000 characters)", { status: 413 });
  const arabicShare = (text.match(/[؀-ۿ]/g)?.length ?? 0) / Math.max(1, (text.match(/\p{L}/gu)?.length ?? 1));
  const source = body.source === "ar" || body.source === "en" ? body.source : arabicShare > 0.5 ? "ar" : "en";
  const target = source === "ar" ? "en" : "ar";
  const n = loadQueue().filter((d) => d.custom).length + 1;
  const title = (body.title ?? "").trim() || text.split("\n").find((l) => l.trim())?.replace(/^#+\s*/, "").slice(0, 90) || "Uploaded document";
  const today = new Date().toISOString().slice(0, 10);
  const doc: QueueDoc = {
    id: `DOC-U${String(n).padStart(2, "0")}`,
    title,
    title_ar: title,
    type: "Uploaded document",
    source,
    target,
    text,
    requestedBy: body.requestedBy?.trim() || "Hessa Abdulla Al Suwaidi",
    requestedByTitle: "Director, Digital Transformation Office",
    purpose: "Ad-hoc translation request",
    purpose_ar: "طلب ترجمة مباشر",
    received: today,
    due: today,
    priority: "normal",
    status: "queued",
    confidentiality: "Internal",
    custom: true,
  };
  appendRecord(DOCS, doc as unknown as Record<string, unknown> & { id: string });
  addAudit({
    solution: SOLUTION,
    actor: { name: doc.requestedBy, role: doc.requestedByTitle ?? "", kind: "human" },
    action: "Document added to queue",
    subject: `${doc.id} · ${doc.title}`,
    detail: `${source.toUpperCase()} → ${target.toUpperCase()} · ${text.length.toLocaleString()} characters`,
  });
  return Response.json({ doc });
}
