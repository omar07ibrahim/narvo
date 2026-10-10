import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { addAudit } from "@/lib/store/db";
import { SOL, loadRfp, loadSeed, setByo, setRequirements } from "@/app/solutions/09-bid-proposal/_lib/server";
import { chunkRfp, extractRequirements } from "@/app/solutions/09-bid-proposal/_lib/ai";

export const maxDuration = 300;

/** Turn RFP text into a structured requirement list (057 seed RFP or a bring-your-own RFP). */
export async function POST(req: Request) {
  const body = await readBody<{ source?: "057" | "custom"; text?: string; name?: string }>(req);
  const { modelKey, lang } = getPrefs(req, body);
  const custom = body.source === "custom";
  if (custom && (!body.text || body.text.trim().length < 200)) {
    return new Response(lang === "ar" ? "النص قصير جداً — الصق نص كراسة الشروط كاملاً" : "RFP text is too short — paste the full RFP text", { status: 400 });
  }

  return eventStream(
    req,
    async (emit) => {
      const seed = loadSeed();
      const s0 = emit.step("read", lang === "ar" ? "قراءة كراسة الشروط" : "Reading the RFP");
      const text = custom ? body.text!.slice(0, 60000) : loadRfp().body;
      if (!text) throw new Error("RFP document not found");
      const chunks = chunkRfp(text);
      s0.done(`${text.length.toLocaleString("en")} ${lang === "ar" ? "حرفاً" : "characters"} · ${chunks.length} ${lang === "ar" ? "أجزاء" : "parts"}`);

      const sectionOf = (id: string) => seed.sections.find((s) => s.requirements.includes(id))?.id ?? null;
      const items = await extractRequirements(
        { emit, lang, modelKey },
        {
          chunks,
          custom,
          tenderLine: custom
            ? `Tender: ${body.name || "Uploaded RFP"}`
            : `Tender ${seed.tender.ref} — ${seed.tender.title.en}. Closing ${seed.tender.closing} ${seed.tender.closingTime}. Bid validity ${seed.tender.validityDays} days.`,
          sectionOf: custom ? undefined : sectionOf,
        },
      );
      if (!items.length) throw new Error(lang === "ar" ? "لم يُعثر على متطلبات في النص" : "No requirements found in the text");

      if (custom) {
        setByo({ name: body.name || "Uploaded RFP", at: Date.now(), requirements: items, coverage: {} });
        addAudit({ solution: SOL, actor: { name: "NARVO Agent", role: "AI agent", kind: "agent" }, action: "Extracted requirements", subject: body.name || "Uploaded RFP", detail: `${items.length} requirements` });
      } else {
        setRequirements(items);
        addAudit({ solution: SOL, actor: { name: "NARVO Agent", role: "AI agent", kind: "agent" }, action: "Extracted requirements", subject: seed.tender.ref, detail: `${items.length} requirements, ${items.filter((r) => r.mandatory).length} mandatory` });
      }
      emit.data("requirements", items);
    },
    { modelKey },
  );
}
