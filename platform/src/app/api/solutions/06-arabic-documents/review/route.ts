import { addAudit, patchRecord } from "@/lib/store/db";
import { checkSegment, ENGINE_VERSION, metricsOf, recheck } from "@/app/solutions/06-arabic-documents/_lib/engine";
import { DOCS, getQueueDoc, getRun, loadGlossary, saveRun, SOLUTION } from "@/app/solutions/06-arabic-documents/_lib/server";
import { TERMINOLOGIST, type RunResult } from "@/app/solutions/06-arabic-documents/_lib/shared";

type Body =
  | { action: "segment"; docId: string; segmentId: string; target?: string; status?: "accepted" | "pending" }
  | { action: "accept_clean"; docId: string }
  | { action: "recheck"; docId: string }
  | { action: "apply_term"; docId: string; from: string; to: string }
  | { action: "complete"; docId: string };

function totals(run: RunResult) {
  const terms = loadGlossary();
  const byId = new Map(terms.map((t) => [t.id, t]));
  let occ = 0;
  let ok = 0;
  for (const s of run.segments) {
    const r = checkSegment(s, run.source, run.target, byId);
    occ += r.occ;
    ok += r.ok;
  }
  return metricsOf(run.segments, run.source, occ, ok, run.metrics.ms);
}

/** Human review: edit/accept segments, re-check after glossary changes, apply an approved term, complete the review. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const run = body?.docId ? getRun(body.docId) : undefined;
  if (!run) return new Response("No translation run for this document", { status: 404 });
  const doc = getQueueDoc(run.docId);

  if (body.action === "segment") {
    const seg = run.segments.find((s) => s.id === body.segmentId);
    if (!seg) return new Response("Segment not found", { status: 404 });
    if (typeof body.target === "string" && body.target.trim() !== seg.target.trim()) {
      seg.target = body.target.trim();
      seg.status = "edited";
      // A human edit supersedes the model's review notes for this segment; code checks re-run.
      const byId = new Map(loadGlossary().map((t) => [t.id, t]));
      seg.flags = checkSegment(seg, run.source, run.target, byId).flags;
    } else if (body.status) {
      seg.status = body.status === "accepted" ? (seg.status === "edited" ? "edited" : "accepted") : "pending";
    }
    run.metrics = totals(run);
    saveRun(run);
    return Response.json({ run });
  }

  if (body.action === "accept_clean") {
    let n = 0;
    for (const s of run.segments) {
      if (s.kind === "table-sep" || s.status !== "pending") continue;
      if (s.flags.some((f) => f.severity === "high" || f.severity === "medium")) continue;
      s.status = "accepted";
      n++;
    }
    saveRun(run);
    return Response.json({ run, accepted: n });
  }

  if (body.action === "recheck" || body.action === "apply_term") {
    let changed = 0;
    if (body.action === "apply_term") {
      if (!body.from || !body.to) return new Response("from and to are required", { status: 400 });
      for (const s of run.segments) {
        if (s.kind === "table-sep" || !s.target.includes(body.from)) continue;
        s.target = s.target.split(body.from).join(body.to);
        s.status = "edited";
        changed++;
      }
    }
    const r = recheck(run.segments, run.source, run.target, loadGlossary(), run.metrics.ms);
    run.segments = r.segments;
    run.metrics = r.metrics;
    saveRun(run);
    if (body.action === "apply_term" && changed)
      addAudit({
        solution: SOLUTION,
        actor: { name: TERMINOLOGIST.name, role: TERMINOLOGIST.title, kind: "human" },
        action: "Approved term applied",
        subject: `${run.docId} · “${body.from}” → “${body.to}”`,
        detail: `${changed} segment${changed === 1 ? "" : "s"} updated`,
      });
    return Response.json({ run, changed, engine: ENGINE_VERSION });
  }

  if (body.action === "complete") {
    const trans = run.segments.filter((s) => s.kind !== "table-sep");
    const pending = trans.filter((s) => s.status === "pending").length;
    if (pending) return new Response(`${pending} segment(s) still pending review`, { status: 422 });
    const now = new Date().toISOString();
    patchRecord(DOCS, run.docId, { status: "reviewed", reviewedAt: now });
    const edited = trans.filter((s) => s.status === "edited").length;
    addAudit({
      solution: SOLUTION,
      actor: { name: TERMINOLOGIST.name, role: TERMINOLOGIST.title, kind: "human" },
      action: "Translation review completed",
      subject: `${run.docId} · ${doc?.title ?? ""}`,
      detail: `${trans.length} segments · ${edited} edited by reviewer · compliance ${run.metrics.compliancePct ?? 100}%`,
    });
    return Response.json({ run, status: "reviewed", reviewedAt: now });
  }

  return new Response("Unknown action", { status: 400 });
}
