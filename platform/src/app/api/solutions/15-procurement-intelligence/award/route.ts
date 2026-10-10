import { readBody } from "@/lib/ai/stream";
import { createApproval, listApprovals } from "@/lib/store/db";
import { COL, SOL, getEvals, getOverrides, getReport, getSuppliers, getTenderRecord, loadPrices, loadTender } from "@/app/solutions/15-procurement-intelligence/_lib/server";
import { computeScores } from "@/app/solutions/15-procurement-intelligence/_lib/scoring";

const aed = (n: number) => `AED ${Math.round(n).toLocaleString("en-US")}`;

/** Committee approval of the award recommendation → recorded in the tender and supplier records. */
export async function POST(req: Request) {
  const body = await readBody<{ lang?: "en" | "ar" }>(req);
  const ar = body.lang === "ar";
  const tender = loadTender();
  if (getTenderRecord(tender).status === "award_recommended") return new Response("Award already recommended", { status: 409 });
  const existing = listApprovals({ solution: SOL, status: "pending" }).find((a) => a.title.includes("award") || a.title.includes("الترسية"));
  if (existing) return Response.json({ approval: existing, existing: true });
  if (!getReport()) return new Response(ar ? "أعدّ تقرير التقييم أولاً" : "Draft the evaluation report first", { status: 400 });

  const suppliers = getSuppliers();
  const rows = computeScores(tender, suppliers, loadPrices(suppliers), getEvals(), getOverrides());
  const ranked = rows.filter((r) => r.rank != null).sort((a, b) => a.rank! - b.rank!);
  if (!ranked.length) return new Response(ar ? "لا توجد عروض مطابقة" : "No compliant bids to recommend", { status: 400 });
  const top = ranked[0];
  const s = suppliers.find((x) => x.id === top.supplierId)!;
  const summary = ar
    ? `توصية بالترسية على ${s.name_ar} — المجموع ${top.total?.toFixed(2)} (فني ${top.techPts.toFixed(2)} + مالي ${top.comPts?.toFixed(2)})، السعر ${aed(top.price)}. الترتيب: ${ranked.map((r) => `${r.rank}. ${suppliers.find((x) => x.id === r.supplierId)?.short} ${r.total?.toFixed(2)}`).join("، ")}. تخضع الترسية النهائية لاعتماد المدير العام (المادة 17).`
    : `Recommend award to ${s.name} — total ${top.total?.toFixed(2)} (technical ${top.techPts.toFixed(2)} + commercial ${top.comPts?.toFixed(2)}), price ${aed(top.price)}. Ranking: ${ranked.map((r) => `${r.rank}. ${suppliers.find((x) => x.id === r.supplierId)?.short} ${r.total?.toFixed(2)}`).join(", ")}. Final award subject to Director General approval (Art. 17).`;
  const now = Date.now();
  const approval = createApproval({
    solution: SOL,
    title: ar ? `اعتماد توصية الترسية — ${tender.ref}` : `Approve award recommendation — ${tender.ref}`,
    summary,
    actionLabel: ar ? "اعتماد التوصية" : "Approve recommendation",
    approver: { name: "Rashed Ali Al Dhaheri", title: ar ? "رئيس لجنة المناقصات" : "Chair, Tender Committee" },
    effects: [
      { type: "patch", collection: COL.tender, id: tender.id, patch: { status: "award_recommended", recommended: s.id } },
      {
        type: "patch",
        collection: COL.suppliers,
        id: s.id,
        patch: { awardRecommendation: { tender: tender.ref, at: now, total: top.total, rank: 1, approvedBy: "Rashed Ali Al Dhaheri" } },
      },
      {
        type: "append",
        collection: COL.awards,
        item: { id: `AWD-${tender.ref}`, tender: tender.ref, supplierId: s.id, total: top.total, price: top.price, ranking: ranked.map((r) => ({ id: r.supplierId, total: r.total, rank: r.rank })) },
      },
      { type: "audit", action: "Award recommendation recorded in supplier record", subject: `${tender.ref} — ${s.name}`, detail: `Total ${top.total?.toFixed(2)}; forwarded to the Director General for approval (Art. 17)` },
    ],
    payload: { rows },
  });
  return Response.json({
    approval: { id: approval.id, title: approval.title, summary: approval.summary, solution: SOL, actionLabel: approval.actionLabel, approver: approval.approver, status: approval.status, createdAt: approval.createdAt },
  });
}
