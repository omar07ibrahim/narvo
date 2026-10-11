import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { addAudit } from "@/lib/store/db";
import { SOL, contractText, getObligations, putExtraction } from "@/app/solutions/13-contract-intelligence/_lib/server";
import { extractObligations } from "@/app/solutions/13-contract-intelligence/_lib/ai";

export const maxDuration = 300;

/** Extract dated commitments from a contract; due dates are computed from the contract rules. */
export async function POST(req: Request) {
  const body = await readBody<{ contractId: string }>(req);
  const { modelKey, lang } = getPrefs(req, body);

  return eventStream(
    req,
    async (emit) => {
      const src = contractText(body.contractId);
      if (!src) throw new Error(lang === "ar" ? "لا يتوفر نص لهذا العقد" : "No text is available for this contract");
      const { items, start, end } = await extractObligations({ emit, lang, modelKey }, { name: src.name, body: src.body, contract: src.contract });
      const s = emit.step("dates", lang === "ar" ? "احتساب تواريخ الاستحقاق والمسؤولين" : "Computing due dates and owners");
      s.done(items.filter((i) => i.due).length + (lang === "ar" ? " تاريخاً محسوباً" : " dates computed") + (start && end ? ` · ${start} → ${end}` : ""));

      // Compare with the register so a commitment that is already tracked is not added twice.
      const s3 = emit.step("dedupe", lang === "ar" ? "مقارنة بالالتزامات المسجلة" : "Comparing with obligations already in the register");
      const clauses = (x: string): string[] => x.match(/\d+(?:\.\d+)+/g) ?? [];
      const known = getObligations().filter((o) => o.contractId === body.contractId);
      for (const it of items) {
        const mine = clauses(it.sourceClause);
        const hit = known.find((o) => o.type === it.type && clauses(o.sourceClause).some((c) => mine.includes(c)));
        it.existing = hit ? { id: hit.id, title: hit.title } : null;
      }
      const dup = items.filter((i) => i.existing).length;
      s3.done(lang === "ar" ? `${dup} مسجلة مسبقاً · ${items.length - dup} جديدة` : `${dup} already tracked · ${items.length - dup} new`);
      const extraction = { contractId: body.contractId, name: src.name, at: Date.now(), start, end, items };
      putExtraction(extraction);
      addAudit({ solution: SOL, actor: { name: "NARVO Agent", role: "AI agent", kind: "agent" }, action: "Extracted obligations", subject: src.name, detail: `${items.length} obligations proposed — awaiting confirmation` });
      emit.data("extraction", extraction);
    },
    { modelKey },
  );
}
