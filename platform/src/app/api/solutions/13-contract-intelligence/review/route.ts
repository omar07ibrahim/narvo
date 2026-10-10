import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { addAudit } from "@/lib/store/db";
import { SOL, contractText, loadPlaybook, putByo, putReview } from "@/app/solutions/13-contract-intelligence/_lib/server";
import { reviewAgainstPlaybook } from "@/app/solutions/13-contract-intelligence/_lib/ai";

export const maxDuration = 300;

/** Review a register contract, the incoming draft or a pasted contract against the MNDA playbook. */
export async function POST(req: Request) {
  const body = await readBody<{ contractId?: string; text?: string; name?: string }>(req);
  const { modelKey, lang } = getPrefs(req, body);
  if (!body.contractId && (!body.text || body.text.trim().length < 400)) {
    return new Response(lang === "ar" ? "الصق نص العقد كاملاً" : "Paste the full contract text", { status: 400 });
  }

  return eventStream(
    req,
    async (emit) => {
      let id = body.contractId;
      if (!id) {
        id = `BYO-${Date.now().toString(36).toUpperCase()}`;
        putByo(id, { name: body.name?.trim() || (lang === "ar" ? "عقد مرفوع" : "Uploaded contract"), text: body.text!.slice(0, 80000), at: Date.now() });
        emit.data("byoId", id);
      }
      const src = contractText(id);
      if (!src) throw new Error(lang === "ar" ? "لا يتوفر نص لهذا العقد" : "No text is available for this contract");
      const playbook = loadPlaybook();
      const s0 = emit.step("read", lang === "ar" ? "قراءة العقد ودليل المواقف" : "Reading the contract and the playbook");
      s0.done(`${src.body.split(/\s+/).length.toLocaleString("en")} ${lang === "ar" ? "كلمة" : "words"} · ${playbook.ref} (${playbook.positions.length} ${lang === "ar" ? "موقفاً" : "positions"})`);

      const { findings, summary } = await reviewAgainstPlaybook({ emit, lang, modelKey }, { name: src.name, body: src.body, playbook });
      const s2 = emit.step("link", lang === "ar" ? "ربط كل ملاحظة ببندها في النص" : "Linking each flag to its source clause");
      s2.done(`${findings.filter((f) => f.quote).length}/${findings.filter((f) => f.status !== "missing").length} ${lang === "ar" ? "اقتباسات موثقة" : "quotes verified in the text"}`);
      const review = { contractId: id, name: src.name, at: Date.now(), summary, findings };
      putReview(review);
      addAudit({
        solution: SOL,
        actor: { name: "NARVO Agent", role: "AI agent", kind: "agent" },
        action: "Reviewed contract against playbook",
        subject: src.name,
        detail: summary,
      });
      emit.data("review", review);
    },
    { modelKey },
  );
}
