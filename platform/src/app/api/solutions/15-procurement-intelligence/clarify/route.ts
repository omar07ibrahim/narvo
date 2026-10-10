import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { createApproval, listApprovals } from "@/lib/store/db";
import { COL, SOL, clarRef, getEvals, getSuppliers, loadTender, putDraft } from "@/app/solutions/15-procurement-intelligence/_lib/server";
import { draftClarifications } from "@/app/solutions/15-procurement-intelligence/_lib/ai";
import { gateResults } from "@/app/solutions/15-procurement-intelligence/_lib/scoring";

export const maxDuration = 120;

/** Draft clarification questions for one supplier and route them to the committee chair for approval. */
export async function POST(req: Request) {
  const body = await readBody<{ supplierId: string }>(req);
  const { modelKey, lang } = getPrefs(req, body);

  return eventStream(
    req,
    async (emit) => {
      const tender = loadTender();
      const supplier = getSuppliers().find((s) => s.id === body.supplierId);
      if (!supplier) throw new Error("Unknown supplier");
      const ev = getEvals()[supplier.id];
      if (!ev) throw new Error(lang === "ar" ? "قيّم العرض أولاً" : "Evaluate the submission first");
      const ref = clarRef(supplier.id);
      const pending = listApprovals({ solution: SOL, status: "pending" }).find((a) => a.title.includes(ref));
      if (pending) throw new Error(lang === "ar" ? `يوجد طلب استيضاح بانتظار الاعتماد (${ref})` : `A clarification request is already awaiting approval (${ref})`);

      const s1 = emit.step("findings", lang === "ar" ? "جمع الفجوات والاستثناءات وحالات عدم الاتساق" : "Collecting gaps, exclusions and inconsistencies");
      const gateNotes = Object.entries(gateResults(tender, supplier, ev))
        .filter(([, g]) => g.computed && g.status !== "met")
        .map(([id, g]) => `Mandatory gate ${id} "${tender.gates.find((x) => x.id === id)?.label.en}" failed (computed from the supplier register): ${g.value}. ${g.note}`);
      const nFind = ev.criteria.filter((c) => c.status !== "met").length + ev.scope.filter((s) => s.status !== "included").length + ev.gates.filter((g) => g.status !== "met").length + gateNotes.length;
      s1.done(lang === "ar" ? `${nFind} ملاحظة` : `${nFind} findings`);

      const s2 = emit.step("draft", lang === "ar" ? `صياغة طلب الاستيضاح ${ref}` : `Drafting clarification request ${ref}`);
      const { letter, questions } = await draftClarifications({ emit, lang, modelKey }, { tender, supplier, ev, gateNotes });
      s2.done(lang === "ar" ? `${questions.length} أسئلة — دون أي دعوة لتعديل السعر (المادة 29)` : `${questions.length} questions — no invitation to change price (Art. 29)`);

      const s3 = emit.step("approval", lang === "ar" ? "إحالة للاعتماد — رئيس لجنة المناقصات" : "Routing to the committee chair for approval");
      const approval = createApproval({
        solution: SOL,
        title: lang === "ar" ? `إصدار طلب استيضاح ${ref} — ${supplier.name_ar}` : `Issue clarification ${ref} — ${supplier.name}`,
        summary: questions.map((q, i) => `${i + 1}. ${q.question}`).join(" ").slice(0, 900),
        actionLabel: lang === "ar" ? "اعتماد وإصدار" : "Approve & issue",
        approver: { name: "Rashed Ali Al Dhaheri", title: lang === "ar" ? "رئيس لجنة المناقصات — مدير المشتريات والعقود" : "Chair, Tender Committee — Director, Procurement & Contracts" },
        effects: [
          { type: "append", collection: COL.clar, item: { id: ref, ref, supplierId: supplier.id, letter, questions, status: "issued", issuedAt: Date.now() } },
          { type: "audit", action: "Clarification request issued via Supplier Portal", subject: `${ref} — ${supplier.name}`, detail: `${questions.length} questions; response due within 5 working days` },
        ],
        payload: { supplierId: supplier.id, ref, letter, questions },
      });
      putDraft({ supplierId: supplier.id, ref, letter, questions, at: Date.now(), approvalId: approval.id });
      s3.waiting(approval.id);
      emit.data("draft", { supplierId: supplier.id, ref, letter, questions, at: Date.now(), approvalId: approval.id });
      emit.send({
        type: "approval",
        approval: {
          id: approval.id,
          title: approval.title,
          summary: approval.summary,
          solution: SOL,
          actionLabel: approval.actionLabel,
          approver: approval.approver,
          status: "pending",
          createdAt: approval.createdAt,
        },
      });
    },
    { modelKey },
  );
}
