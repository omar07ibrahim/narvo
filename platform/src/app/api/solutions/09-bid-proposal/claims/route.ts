import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { addAudit } from "@/lib/store/db";
import { SOL, getSections, getTasks, loadSeed, saveSections } from "@/app/solutions/09-bid-proposal/_lib/server";
import { checkClaims } from "@/app/solutions/09-bid-proposal/_lib/ai";

export const maxDuration = 300;

/** Check every sentence of the latest section version against the evidence library. */
export async function POST(req: Request) {
  const body = await readBody<{ sectionId: string }>(req);
  const { modelKey, lang } = getPrefs(req, body);

  return eventStream(
    req,
    async (emit) => {
      const seed = loadSeed();
      const section = seed.sections.find((s) => s.id === body.sectionId);
      if (!section) throw new Error("Unknown section");
      const sections = getSections(seed);
      const latest = sections[section.id]?.versions.at(-1);
      if (!latest) throw new Error(lang === "ar" ? "لا توجد مسودة لهذا القسم" : "This section has no draft yet");

      const answered = getTasks().filter((t) => t.status === "answered" && t.answer && section.requirements.includes(t.reqId));
      const extra = answered.map((t) => ({ docId: `ANSWER-${t.id}`, title: `Contributor answer — ${t.owner}`, section: t.reqId, text: t.answer! }));
      const claims = await checkClaims({ emit, lang, modelKey }, { text: latest.text, extra });
      const check = { at: Date.now(), version: latest.v, claims };
      sections[section.id] = { ...sections[section.id], check };
      saveSections(sections);

      const bad = claims.filter((c) => c.verdict === "unsupported" || c.verdict === "contradicted");
      addAudit({
        solution: SOL,
        actor: { name: "NARVO Agent", role: "AI agent", kind: "agent" },
        action: "Checked claims against evidence",
        subject: `§${section.no} ${section.title.en} — ${latest.label}`,
        detail: `${claims.length} sentences · ${bad.length} unsupported or contradicted · ${claims.filter((c) => c.verdict === "partial").length} partial`,
      });
      emit.data("check", { id: section.id, check });
    },
    { modelKey },
  );
}
