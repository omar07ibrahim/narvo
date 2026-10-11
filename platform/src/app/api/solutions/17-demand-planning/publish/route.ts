import { readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { createApproval, listApprovals } from "@/lib/store/db";
import { buildFacts } from "@/app/solutions/17-demand-planning/_lib/facts";
import { COL_PLANS, loadConfig, loadOverrides, loadPublished } from "@/app/solutions/17-demand-planning/_lib/data";
import { DEFAULT_WHATIF, type WhatIf } from "@/app/solutions/17-demand-planning/_lib/types";

/**
 * Submit the chosen plan for approval by Joseph Abraham. Approving publishes it (new plan version
 * with the assumptions and KPIs it was approved on) and writes the audit trail.
 */
export async function POST(req: Request) {
  const body = await readBody<{ planId?: "A" | "B" | "C"; whatIf?: Partial<WhatIf>; note?: string; lang?: string }>(req);
  const cfg = loadConfig();
  const spec = cfg.plans.find((p) => p.id === body.planId);
  if (!spec) return new Response("planId must be A, B or C", { status: 400 });
  const whatIf: WhatIf = { ...DEFAULT_WHATIF, ...(body.whatIf ?? {}) };
  const pending = listApprovals({ solution: "17-demand-planning", status: "pending" });
  if (pending.length) return new Response(`An approval is already pending (${pending[0].id}). Decide it first.`, { status: 409 });

  const facts = buildFacts(whatIf);
  const res = facts.run.plans.find((p) => p.id === spec.id)!;
  const published = loadPublished();
  const version = Math.max(0, ...published.map((p) => p.version)) + 1;
  const id = `RBM-SOP-2026-W42-v${version}`;
  const overrides = loadOverrides().length;
  const peak = (rid: string) => res.resources.find((r) => r.id === rid)?.peakP50 ?? 0;
  const kpis = {
    fillRate: +res.fillRate.toFixed(4),
    fillRateP10: +res.fillRateP10.toFixed(4),
    totalCost: Math.round(res.cost.total),
    constraintFit: +res.constraintFit.toFixed(3),
    violations: res.violations.length,
    peakJaPallets: peak("JA-pallets"),
    peakJaYard: peak("JA-yard"),
  };
  const { lang } = getPrefs(req, body);
  const ar = lang === "ar";
  const n = (v: number) => v.toLocaleString("en-US");
  const scopeEn = { mq: "Marina Quarter projects", structural: "all structural SKUs", all: "all SKUs" }[whatIf.upliftScope];
  const scopeAr = { mq: "مشاريع حي المارينا", structural: "جميع المواد الإنشائية", all: "جميع الأصناف" }[whatIf.upliftScope];
  // Stored with the published plan (English, like the rest of the plan record).
  const assumptions = [
    whatIf.upliftPct ? `demand ${whatIf.upliftPct > 0 ? "+" : ""}${whatIf.upliftPct}% (${scopeEn})` : "base demand",
    whatIf.palletLossJA ? `JA −${n(whatIf.palletLossJA)} pallet positions` : null,
    whatIf.yardLossJA ? `JA yard −${n(whatIf.yardLossJA)} t` : null,
    whatIf.millDelayWeeks ? `Sahara restart +${whatIf.millDelayWeeks} wk` : null,
    `service target ${(whatIf.serviceTarget * 100).toFixed(1)}%`,
  ]
    .filter(Boolean)
    .join(", ");
  const assumptionsAr = [
    whatIf.upliftPct ? `الطلب ${whatIf.upliftPct > 0 ? "+" : ""}${whatIf.upliftPct}% (${scopeAr})` : "الطلب الأساسي",
    whatIf.palletLossJA ? `جبل علي −${n(whatIf.palletLossJA)} موقع منصة` : null,
    whatIf.yardLossJA ? `ساحة الحديد −${n(whatIf.yardLossJA)} طن` : null,
    whatIf.millDelayWeeks ? `تأخر تشغيل صحارى +${whatIf.millDelayWeeks} أسبوع` : null,
    `مستوى الخدمة المستهدف ${(whatIf.serviceTarget * 100).toFixed(1)}%`,
  ]
    .filter(Boolean)
    .join("، ");
  const summaryEn =
    `Plan ${spec.id} — ${spec.name}. Assumptions: ${assumptions}. Expected fill ${(kpis.fillRate * 100).toFixed(1)}% (P10 ${(kpis.fillRateP10 * 100).toFixed(1)}%), ` +
    `13-week cost AED ${n(kpis.totalCost)}, ${kpis.violations} capacity violation${kpis.violations === 1 ? "" : "s"}, JA peak ${n(kpis.peakJaPallets)} pallets / ${n(kpis.peakJaYard)} t rebar. ` +
    `${overrides} planner override${overrides === 1 ? "" : "s"} included.${spec.catchUp ? " Commits the Sahara catch-up allocation (1,950 t/week, confirm by 14 Oct)." : ""}${body.note ? ` Note: ${body.note}` : ""}`;
  const summaryAr =
    `الخطة ${spec.id} — ${spec.name_ar}. الافتراضات: ${assumptionsAr}. نسبة التلبية المتوقعة ${(kpis.fillRate * 100).toFixed(1)}% (P10 ${(kpis.fillRateP10 * 100).toFixed(1)}%)، ` +
    `تكلفة 13 أسبوعاً ${n(kpis.totalCost)} درهم، ${kpis.violations} مخالفة سعة، ذروة جبل علي ${n(kpis.peakJaPallets)} منصة / ${n(kpis.peakJaYard)} طن حديد. ` +
    `تتضمن ${overrides} تعديلاً من المخطِّط.${spec.catchUp ? " تُلزم بحصة التعويض من صحارى (1,950 طن/أسبوع، التأكيد قبل 14 أكتوبر)." : ""}${body.note ? ` ملاحظة: ${body.note}` : ""}`;
  const summary = ar ? summaryAr : summaryEn;

  const approval = createApproval({
    solution: "17-demand-planning",
    title: ar ? `نشر خطة الإمداد ${id} (الخطة ${spec.id})` : `Publish replenishment plan ${id} (Plan ${spec.id})`,
    summary,
    actionLabel: ar ? "اعتماد ونشر" : "Approve & publish",
    approver: { name: cfg.planner.name, title: cfg.planner.title },
    requestedBy: "NARVO planning engine",
    payload: { planId: spec.id, whatIf, kpis },
    effects: [
      {
        type: "append",
        collection: COL_PLANS,
        item: {
          id,
          version,
          planId: spec.id,
          planName: spec.name,
          whatIf: { ...whatIf, assumption: assumptions },
          kpis,
          overrides,
          approvedBy: cfg.planner.name,
          publishedAt: Date.now(),
          note: body.note ?? "",
          status: "published",
        },
      },
      { type: "audit", action: "Published replenishment plan to ERP purchase proposals", subject: id, detail: summaryEn.slice(0, 400) },
      ...(spec.catchUp
        ? [{ type: "audit" as const, action: "Queued Sahara catch-up allocation confirmation", subject: "Sahara Rebar Mills LLC", detail: "Commit 1,950 t/week for arrivals w/c 26 Oct – 23 Nov 2026" }]
        : []),
    ],
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
