import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { addAudit } from "@/lib/store/db";
import { SOL, getRequirements, getSections, getTasks, loadSeed, saveSections } from "@/app/solutions/09-bid-proposal/_lib/server";
import { draftSection, gatherSources } from "@/app/solutions/09-bid-proposal/_lib/ai";
import type { DraftVersion } from "@/app/solutions/09-bid-proposal/_lib/types";

export const maxDuration = 300;

/** Draft one response section, streamed, with [n] citations to the evidence library. */
export async function POST(req: Request) {
  const body = await readBody<{ sectionId: string; draftLang?: "en" | "ar" }>(req);
  const { modelKey, lang } = getPrefs(req, body);
  const draftLang = body.draftLang === "ar" || body.draftLang === "en" ? body.draftLang : lang;

  return eventStream(
    req,
    async (emit) => {
      const seed = loadSeed();
      const section = seed.sections.find((s) => s.id === body.sectionId);
      if (!section) throw new Error("Unknown section");
      const all = getRequirements()?.items ?? [];
      if (!all.length) throw new Error(lang === "ar" ? "استخرج المتطلبات أولاً" : "Extract the requirements first");
      const reqs = all.filter((r) => section.requirements.includes(r.id));

      const s1 = emit.step("retrieve", lang === "ar" ? "جمع الأدلة المعتمدة للقسم" : "Gathering approved evidence for the section");
      const answered = getTasks().filter((t) => t.status === "answered" && t.answer && section.requirements.includes(t.reqId));
      const extra = answered.map((t) => ({
        docId: `ANSWER-${t.id}`,
        title: `${lang === "ar" ? "إجابة مساهم" : "Contributor answer"} — ${t.owner}`,
        section: `${t.reqId} · ${t.evidenceType}`,
        text: t.answer!,
      }));
      const citations = gatherSources(reqs, extra);
      emit.data("citations", citations);
      s1.done(
        lang === "ar"
          ? `${citations.length} مصدراً من ${new Set(citations.map((c) => c.docId)).size} مستندات${extra.length ? ` (+${extra.length} إجابات مساهمين)` : ""}`
          : `${citations.length} sources from ${new Set(citations.map((c) => c.docId)).size} documents${extra.length ? ` (incl. ${extra.length} contributor answers)` : ""}`,
      );

      const sections = getSections(seed);
      const prev = sections[section.id]?.versions.at(-1);
      const s2 = emit.step("draft", lang === "ar" ? `صياغة القسم ${section.no} — ${section.title.ar}` : `Drafting section ${section.no} — ${section.title.en}`);
      const gen = draftSection(
        { emit, lang, modelKey },
        {
          seed,
          sectionTitle: draftLang === "ar" ? section.title.ar : section.title.en,
          sectionNo: section.no,
          pageLimit: section.pageLimit,
          requirements: reqs,
          citations,
          draftLang,
          previous: prev?.kind === "human" ? prev.text : undefined,
        },
      );
      let text = "";
      while (true) {
        const n = await gen.next();
        if (n.done) break;
        text += n.value;
        emit.text(n.value, "draft");
      }
      text = text.trim();
      if (!text) throw new Error("The model returned an empty draft");
      const used = new Set(Array.from(text.matchAll(/\[(\d+)\]/g)).map((m) => Number(m[1])));
      const gaps = (text.match(/\[(?:Evidence needed|يلزم دليل)[^\]]*\]/gi) ?? []).length;
      s2.done(lang === "ar" ? `${used.size} مصادر مستشهد بها · ${gaps} فجوات أدلة` : `${used.size} sources cited · ${gaps} evidence gaps marked`);

      const versions = sections[section.id]?.versions ?? [];
      const v = (versions.at(-1)?.v ?? 0) + 1;
      const version: DraftVersion = { v, label: `v${v}`, author: "NARVO · Qwen", kind: "ai", at: Date.now(), text, lang: draftLang, citations };
      sections[section.id] = { versions: [...versions, version], check: sections[section.id]?.check };
      saveSections(sections);
      addAudit({
        solution: SOL,
        actor: { name: "NARVO Agent", role: "AI agent", kind: "agent" },
        action: "Drafted response section",
        subject: `${seed.tender.ref} — §${section.no} ${section.title.en}`,
        detail: `v${v} · ${used.size} sources cited · ${gaps} evidence gaps`,
      });
      emit.data("section", { id: section.id, state: sections[section.id] });
    },
    { modelKey },
  );
}
