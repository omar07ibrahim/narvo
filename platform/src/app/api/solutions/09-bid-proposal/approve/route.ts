import { readBody } from "@/lib/ai/stream";
import { createApproval, listApprovals } from "@/lib/store/db";
import { COL, SOL, loadSeed, loadState } from "@/app/solutions/09-bid-proposal/_lib/server";
import { readiness, fmt } from "@/app/solutions/09-bid-proposal/_lib/compliance";

/** Route the response pack to the bid manager for submission approval. */
export async function POST(req: Request) {
  const body = await readBody<{ lang?: "en" | "ar" }>(req);
  const seed = loadSeed();
  const state = loadState();
  const pending = listApprovals({ solution: SOL, status: "pending" });
  if (pending.length) return Response.json({ approval: pending[0], existing: true });
  if (state.bid.status === "approved_for_submission") return new Response("Already approved for submission", { status: 409 });

  const r = readiness(seed, state);
  const ar = body.lang === "ar";
  const criticalCerts = r.certs.filter((c) => c.status === "critical").map((c) => c.cert.number);
  const openForms = r.forms.filter((f) => f.status !== "ok").map((f) => f.form.id);
  const summary = ar
    ? `التغطية ${r.cov.pct}% (${r.cov.met}/${r.cov.total} مستوفى، ${r.cov.partial} جزئي، ${r.cov.missing} مفقود). الأقسام المصاغة ${r.drafted}/${seed.sections.length}. ادعاءات غير مدعومة: ${r.claims.flagged}. ملاحظات حرجة: ${r.critical}${criticalCerts.length ? ` (${criticalCerts.join("، ")})` : ""}. نماذج غير مكتملة: ${openForms.join("، ") || "لا يوجد"}. مهام مفتوحة: ${r.openTasks}. الإغلاق ${fmt(seed.tender.closing)}.`
    : `Coverage ${r.cov.pct}% (${r.cov.met}/${r.cov.total} evidenced, ${r.cov.partial} partial, ${r.cov.missing} missing). Sections drafted ${r.drafted}/${seed.sections.length}. Unsupported claims: ${r.claims.flagged}. Critical flags: ${r.critical}${criticalCerts.length ? ` (${criticalCerts.join(", ")})` : ""}. Forms not complete: ${openForms.join(", ") || "none"}. Open tasks: ${r.openTasks}. Closing ${fmt(seed.tender.closing)} ${seed.tender.closingTime}.`;

  const approval = createApproval({
    solution: SOL,
    title: ar ? `اعتماد تقديم العرض — ${seed.tender.ref}` : `Approve submission — ${seed.tender.ref}`,
    summary,
    actionLabel: ar ? "اعتماد للتقديم" : "Approve for submission",
    approver: { name: "Leena Mattar", title: ar ? "مديرة العطاءات، رصين لإدارة المرافق" : "Bid Manager, Raseen FM" },
    requestedBy: "NARVO Agent",
    effects: [
      { type: "patch", collection: COL.bids, id: seed.id, patch: { status: "approved_for_submission", approvedBy: "Leena Mattar", coverageAtApproval: r.cov.pct } },
      { type: "patch", collection: COL.forms, id: "F-2", patch: { status: "complete" } },
      { type: "audit", action: "Response pack approved for submission", subject: seed.tender.ref, detail: summary.slice(0, 280) },
    ],
    payload: { readiness: { coverage: r.cov, critical: r.critical, flagged: r.claims.flagged } },
  });
  return Response.json({
    approval: {
      id: approval.id,
      title: approval.title,
      summary: approval.summary,
      solution: approval.solution,
      actionLabel: approval.actionLabel,
      approver: approval.approver,
      status: approval.status,
      createdAt: approval.createdAt,
    },
  });
}
