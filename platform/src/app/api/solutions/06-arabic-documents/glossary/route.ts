import { addAudit, createApproval, patchRecord } from "@/lib/store/db";
import { GLOSSARY, loadGlossary, SOLUTION } from "@/app/solutions/06-arabic-documents/_lib/server";
import { TERMINOLOGIST, type Term } from "@/app/solutions/06-arabic-documents/_lib/shared";

const today = () => new Date().toISOString().slice(0, 10);

function summary(a: ReturnType<typeof createApproval>) {
  return {
    id: a.id,
    title: a.title,
    summary: a.summary,
    solution: SOLUTION,
    actionLabel: a.actionLabel,
    approver: a.approver,
    status: a.status,
    createdAt: a.createdAt,
  };
}

/** MNDA glossary (seed + approved changes). */
export async function GET() {
  return Response.json({ terms: loadGlossary() });
}

/**
 *   { action: "edit", id, patch }                          → direct edit by the terminology team (audited)
 *   { action: "resolve", id, choice: {en, ar}, rationale }  → disputed term to the terminology specialist (approval)
 *   { action: "propose", term: {en, ar, domain, rationale}} → new term to the terminology specialist (approval)
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    id?: string;
    patch?: Partial<Term>;
    choice?: { en?: string; ar?: string };
    rationale?: string;
    docId?: string;
    term?: { en?: string; ar?: string; domain?: string; rationale?: string };
    lang?: string;
  };
  const terms = loadGlossary();

  if (body.action === "edit") {
    const t = terms.find((x) => x.id === body.id);
    if (!t || !body.patch) return new Response("Term not found", { status: 404 });
    const allowed: Partial<Term> = {};
    for (const k of ["en", "ar", "note", "domain", "variants_en", "variants_ar"] as const) {
      if (body.patch[k] !== undefined) (allowed as Record<string, unknown>)[k] = body.patch[k];
    }
    patchRecord(GLOSSARY, t.id, { ...allowed, updated: today() });
    addAudit({
      solution: SOLUTION,
      actor: { name: TERMINOLOGIST.name, role: TERMINOLOGIST.title, kind: "human" },
      action: "Glossary term edited",
      subject: `${t.id} · ${t.en} / ${t.ar}`,
      detail: Object.keys(allowed).join(", "),
    });
    return Response.json({ terms: loadGlossary() });
  }

  if (body.action === "resolve") {
    const t = terms.find((x) => x.id === body.id);
    if (!t) return new Response("Term not found", { status: 404 });
    const en = (body.choice?.en ?? "").trim() || t.en;
    const ar = (body.choice?.ar ?? "").trim() || t.ar;
    const rationale = (body.rationale ?? "").trim();
    const old = { en: t.en, ar: t.ar };
    const a = createApproval({
      solution: SOLUTION,
      title: `Approve term ${t.id}: “${en}” = «${ar}»`,
      summary: `Disputed term (${t.domain}). Provisional: “${old.en}” / «${old.ar}». Proposed: “${en}” / «${ar}».${rationale ? ` Rationale: ${rationale}` : ""}${body.docId ? ` Raised from ${body.docId}.` : ""}`.slice(0, 420),
      actionLabel: "Approve term",
      approver: TERMINOLOGIST,
      requestedBy: "Translation reviewer",
      effects: [
        {
          type: "patch",
          collection: GLOSSARY,
          id: t.id,
          patch: {
            en,
            ar,
            status: "approved",
            alternatives: [],
            variants_ar: [...new Set([...(t.variants_ar ?? []), ...(old.ar !== ar ? [old.ar] : [])])].filter((v) => v !== ar),
            variants_en: [...new Set([...(t.variants_en ?? [])])].filter((v) => v !== en),
            note: `Approved by the terminology specialist on ${today()}${rationale ? ` — ${rationale}` : ""}. Previously provisional: “${old.en}” / «${old.ar}».`,
            updated: today(),
          },
        },
        { type: "audit", action: "Glossary updated", subject: `${t.id} · ${en} = ${ar}`, detail: `Disputed term resolved${body.docId ? ` (raised from ${body.docId})` : ""}` },
      ],
      payload: { termId: t.id, from: old, to: { en, ar }, docId: body.docId },
    });
    return Response.json({ approval: summary(a), from: old, to: { en, ar } });
  }

  if (body.action === "propose") {
    const en = (body.term?.en ?? "").trim();
    const ar = (body.term?.ar ?? "").trim();
    if (!en || !ar) return new Response("Both English and Arabic forms are required", { status: 400 });
    if (terms.some((t) => t.en.toLowerCase() === en.toLowerCase() || t.ar === ar)) return new Response("This term is already in the glossary", { status: 409 });
    const next = terms.reduce((m, t) => Math.max(m, Number(t.id.replace(/\D/g, "")) || 0), 0) + 1;
    const id = `T-${String(next).padStart(3, "0")}`;
    const a = createApproval({
      solution: SOLUTION,
      title: `Add term ${id}: “${en}” = «${ar}»`,
      summary: `New ${body.term?.domain ?? "domain"} term detected during translation${body.docId ? ` of ${body.docId}` : ""}. ${body.term?.rationale ?? ""}`.slice(0, 400),
      actionLabel: "Add to glossary",
      approver: TERMINOLOGIST,
      requestedBy: "NARVO terminology check",
      effects: [
        {
          type: "append",
          collection: GLOSSARY,
          item: {
            id,
            en,
            ar,
            domain: body.term?.domain ?? "Planning & building code",
            status: "approved",
            variants_en: [],
            variants_ar: [],
            note: `Added on ${today()} after detection in ${body.docId ?? "a translation"}. ${body.term?.rationale ?? ""}`.trim(),
            source: body.docId ?? "Translation desk",
            updated: today(),
            alternatives: [],
          },
        },
        { type: "audit", action: "Glossary term added", subject: `${id} · ${en} = ${ar}`, detail: body.docId ? `Detected in ${body.docId}` : undefined },
      ],
      payload: { termId: id, docId: body.docId },
    });
    return Response.json({ approval: summary(a), id });
  }

  return new Response("Unknown action", { status: 400 });
}
