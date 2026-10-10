import { readBody } from "@/lib/ai/stream";
import { createApproval } from "@/lib/store/db";
import { COL, SOL, getContracts, getExtractions, putExtraction } from "@/app/solutions/13-contract-intelligence/_lib/server";
import { obligationFromExtract } from "@/app/solutions/13-contract-intelligence/_lib/ai";
import { fmtDate } from "@/app/solutions/13-contract-intelligence/_lib/dates";

/** "Confirm obligations" — the senior contracts officer approves before they enter the register. */
export async function POST(req: Request) {
  const body = await readBody<{ contractId: string; keys: string[]; lang?: "en" | "ar" }>(req);
  const ar = body.lang === "ar";
  const ex = getExtractions()[body.contractId];
  if (!ex) return new Response("Extraction not found", { status: 404 });
  const chosen = ex.items.filter((i) => body.keys.includes(i.key));
  if (!chosen.length) return new Response(ar ? "اختر التزاماً واحداً على الأقل" : "Select at least one obligation", { status: 400 });
  const inRegister = getContracts().some((c) => c.id === body.contractId);
  const obligations = chosen.map((x) => {
    const o = obligationFromExtract(x, body.contractId, ar ? "ar" : "en");
    // Bring-your-own contracts are not in the register: freeze the computed date.
    if (!inRegister && x.due) o.trigger = { kind: "date", date: x.due };
    o.contractName = ex.name;
    return o;
  });
  const approval = createApproval({
    solution: SOL,
    title: ar ? `تأكيد الالتزامات — ${ex.name}` : `Confirm obligations — ${ex.name}`,
    summary: chosen.map((x) => `${x.title} — ${x.due ? fmtDate(x.due) : "—"} (${x.owner}, cl. ${x.sourceClause})`).join(" · ").slice(0, 900),
    actionLabel: ar ? "تأكيد وإضافة إلى السجل" : "Confirm & add to register",
    approver: { name: "Shamma Khalid Al Mansoori", title: ar ? "مسؤولة عقود أولى" : "Senior Contracts Officer" },
    effects: [
      ...obligations.map((o) => ({ type: "append" as const, collection: COL.obligations, item: o })),
      { type: "audit", action: "Obligations added to register", subject: ex.name, detail: `${obligations.length} obligations with owners and computed due dates` },
    ],
  });
  putExtraction({ ...ex, approvalId: approval.id });
  return Response.json({ approvalId: approval.id });
}
