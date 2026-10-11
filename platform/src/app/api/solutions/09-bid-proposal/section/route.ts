import { readBody } from "@/lib/ai/stream";
import { addAudit } from "@/lib/store/db";
import { SOL, getSections, loadSeed, saveSections } from "@/app/solutions/09-bid-proposal/_lib/server";
import type { DraftVersion } from "@/app/solutions/09-bid-proposal/_lib/types";

/** Save an edited section as a new revision (revision history is kept with the section). */
export async function POST(req: Request) {
  const body = await readBody<{ sectionId: string; text: string; note?: string; lang?: "en" | "ar" }>(req);
  const seed = loadSeed();
  const section = seed.sections.find((s) => s.id === body.sectionId);
  if (!section) return new Response("Unknown section", { status: 400 });
  if (!body.text?.trim()) return new Response("Empty text", { status: 400 });
  const sections = getSections(seed);
  const versions = sections[section.id]?.versions ?? [];
  const prev = versions.at(-1);
  if (prev && prev.text === body.text) return Response.json({ id: section.id, state: sections[section.id] });
  const v = (prev?.v ?? 0) + 1;
  // Continue the document's own numbering (Marketing's "v0.3" → "v0.4"), not a bare counter.
  const m = prev?.label.match(/^v(\d+)\.(\d+)$/);
  const version: DraftVersion = {
    v,
    label: m ? `v${m[1]}.${Number(m[2]) + 1}` : `v${v}`,
    author: "Leena Mattar · Bid Manager",
    kind: "edit",
    at: Date.now(),
    text: body.text,
    lang: prev?.lang ?? (body.lang === "ar" ? "ar" : "en"),
    citations: prev?.citations,
  };
  sections[section.id] = { versions: [...versions, version], check: sections[section.id]?.check };
  saveSections(sections);
  addAudit({
    solution: SOL,
    actor: { name: "Leena Mattar", role: "Bid Manager, Raseen FM", kind: "human" },
    action: body.note ? "Replaced unsupported claim" : "Edited response section",
    subject: `§${section.no} ${section.title.en} — v${v}`,
    detail: body.note?.slice(0, 280),
  });
  return Response.json({ id: section.id, state: sections[section.id] });
}
