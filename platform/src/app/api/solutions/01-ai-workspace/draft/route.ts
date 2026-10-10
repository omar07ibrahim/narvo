import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { chatStream } from "@/lib/ai/client";
import { getIndex } from "@/lib/retrieval";
import { tokenize } from "@/lib/retrieval/arabic";
import { personaSystem, planQueries } from "@/app/solutions/01-ai-workspace/_lib/ask";
import {
  attachmentPassages,
  canRead,
  CORPUS,
  resolveRole,
  searchFiltered,
  SOLUTION,
  toCitations,
} from "@/app/solutions/01-ai-workspace/_lib/server";
import { DRAFT_KINDS, ROLES, SCOPES, type Attachment, type ScopeKey } from "@/app/solutions/01-ai-workspace/_lib/shared";

type Kind = (typeof DRAFT_KINDS)[number]["key"];

interface Body {
  kind?: Kind;
  instructions?: string;
  audience?: string;
  docIds?: string[];
  role?: string;
  scope?: ScopeKey;
  attachment?: Attachment | null;
}

const FORMAT: Record<Kind, string> = {
  briefing:
    "Write a BRIEFING NOTE in markdown: a '# ' title; a line with To / From / Date (11 October 2026) / Classification; then '## ' sections: Purpose; Background; Key facts (bullets, each cited); Issues and risks; Recommendations (numbered, each with a suggested owner from the sources where possible); Next steps with dates. 300–480 words.",
  reply_letter:
    "Write a FORMAL REPLY LETTER in markdown from MNDA: date line (11 October 2026), addressee block, 'Subject:' line, salutation, 3–5 short paragraphs that apply the relevant rules (cite them), clear next steps for the recipient with service levels and channels, courteous close, sender name and title. Do not invent an outgoing reference number. 220–380 words.",
  faq:
    "Write an FAQ in markdown for Customer Happiness Centre agents: a '# ' title, a one-line scope note, then 6–8 questions as '### ' headings, each answered in 1–3 sentences with citations. Use the language customers actually use.",
  email:
    "Write a short INTERNAL EMAIL in markdown: 'Subject:' line, greeting, 2–4 short paragraphs or bullets with clear asks, owners and dates, sign-off with sender name and title. 120–220 words.",
};

/** Draft a sourced document (briefing, reply letter, FAQ, email) from selected knowledge documents or retrieval. */
export async function POST(req: Request) {
  const body = await readBody<Body>(req);
  const { modelKey, lang } = getPrefs(req, body as Record<string, unknown>);
  const instructions = (body.instructions ?? "").trim();
  if (!instructions) return new Response("instructions are required", { status: 400 });
  const kind: Kind = DRAFT_KINDS.some((k) => k.key === body.kind) ? (body.kind as Kind) : "briefing";
  const role = resolveRole(body.role);
  const scope: ScopeKey = SCOPES.some((s) => s.key === body.scope) ? (body.scope as ScopeKey) : "all";
  const docIds = Array.isArray(body.docIds) ? body.docIds.filter((d) => typeof d === "string").slice(0, 8) : [];
  const attachment =
    body.attachment && typeof body.attachment.text === "string" && body.attachment.text.trim()
      ? { name: String(body.attachment.name || "document"), text: body.attachment.text.slice(0, 60000), kind: body.attachment.kind ?? "text" }
      : null;
  const ar = lang === "ar";
  const kindMeta = DRAFT_KINDS.find((k) => k.key === kind)!;

  return eventStream(
    req,
    async (emit) => {
      const s1 = emit.step(
        "sources",
        docIds.length
          ? ar
            ? `قراءة ${docIds.length} مستندات مختارة`
            : `Reading ${docIds.length} selected document${docIds.length > 1 ? "s" : ""}`
          : ar
            ? "اختيار المصادر من قاعدة المعرفة"
            : "Selecting sources from the knowledge base",
      );
      let passages: Array<{ docId: string; title: string; ref?: string; section: string; text: string }> = [];
      let blocked = 0;
      const queryText = `${instructions} ${body.audience ?? ""}`;
      if (docIds.length) {
        const idx = getIndex(CORPUS);
        const q = new Set(tokenize(queryText));
        for (const id of docIds) {
          const doc = idx.docs.find((d) => d.id === id);
          if (!doc) continue;
          if (!canRead(role, doc)) {
            blocked++;
            continue;
          }
          const chunks = idx.chunks
            .filter((c) => c.docId === id)
            .map((c, i) => ({ c, i, score: c.tokens.filter((t) => q.has(t)).length / Math.sqrt(c.tokens.length + 1) }));
          const keep = Math.max(2, Math.floor(12 / docIds.length));
          chunks
            .sort((a, b) => b.score - a.score)
            .slice(0, keep)
            .sort((a, b) => a.i - b.i)
            .forEach(({ c }) => passages.push({ docId: c.docId, title: c.title, ref: c.ref, section: c.section, text: c.text }));
        }
      } else {
        const plan = await planQueries(instructions, [], modelKey);
        const { hits } = searchFiltered([instructions, ...plan.queries], role, scope, 9);
        passages = hits.map((h) => ({ docId: h.docId, title: h.title, ref: h.ref, section: h.section, text: h.text }));
      }
      if (attachment) {
        const att = attachmentPassages(attachment, [queryText]).map((p) => ({
          docId: "upload",
          title: attachment.name,
          ref: ar ? "مستندك" : "Your document",
          section: p.section,
          text: p.text,
        }));
        passages = [...att, ...passages];
      }
      passages = passages.slice(0, 14);
      const citations = toCitations(passages);
      emit.data("citations", citations);
      s1.done(
        (ar
          ? `${passages.length} مقاطع من ${new Set(passages.map((p) => p.docId)).size} مستندات`
          : `${passages.length} passages from ${new Set(passages.map((p) => p.docId)).size} documents`) +
          (blocked ? (ar ? ` · ${blocked} مستند محجوب لعدم الصلاحية` : ` · ${blocked} blocked by access level`) : ""),
      );
      if (!passages.length) {
        throw new Error(ar ? "لا توجد مصادر متاحة لهذا الطلب ضمن صلاحيتك." : "No accessible sources were found for this request at your access level.");
      }

      const s2 = emit.step("draft", ar ? `صياغة ${kindMeta.label.ar}` : `Drafting the ${kindMeta.label.en.toLowerCase()}`);
      const persona = ROLES[role].persona;
      const context = passages
        .map((p, i) => `[${i + 1}] ${p.title}${p.ref ? ` (${p.ref})` : ""} — section "${p.section}"\n${p.text}`)
        .join("\n\n---\n\n");
      const system = [
        personaSystem(role, lang),
        `You draft documents for MNDA staff. The author/sender is ${persona.name}, ${persona.title.en}.`,
        FORMAT[kind],
        "Use ONLY facts from the numbered sources. Put the marker [n] right after every factual claim (numbers, dates, fees, rules, names). Never invent facts, figures, people or reference numbers. If something the user asks for is not in the sources, write a short '> Note:' line saying it needs confirmation.",
        `Write in ${ar ? "formal Modern Standard Arabic (UAE government register)" : "clear, formal British English"}. Output only the document.`,
      ].join("\n");
      const gen = chatStream({
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: `Sources:\n\n${context}\n\n---\n\nDocument requested: ${kindMeta.label.en}\n${body.audience ? `Audience / recipient: ${body.audience}\n` : ""}Instructions: ${instructions}`,
          },
        ],
        modelKey,
        temperature: 0.3,
        maxTokens: 1500,
        solution: SOLUTION,
        task: `draft.${kind}`,
        signal: emit.signal,
      });
      let text = "";
      while (true) {
        const n = await gen.next();
        if (n.done) break;
        if (n.value.content) {
          text += n.value.content;
          emit.text(n.value.content, "draft");
        }
      }
      s2.done(ar ? `${text.split(/\s+/).filter(Boolean).length} كلمة` : `${text.split(/\s+/).filter(Boolean).length} words`);

      // Deterministic citation check — every marker must resolve, every paragraph should carry evidence.
      const s3 = emit.step("check", ar ? "التحقق من الإسناد" : "Checking citations");
      const markers = Array.from(text.matchAll(/\[(\d+)\]/g)).map((m) => Number(m[1]));
      const unique = new Set(markers);
      const invalid = [...unique].filter((n) => n < 1 || n > citations.length);
      const paras = text
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter((p) => p.length > 120 && !p.startsWith("#") && !/^(subject|to|from|dear|الموضوع|إلى|من)/i.test(p));
      const uncited = paras.filter((p) => !/\[\d+\]/.test(p)).length;
      const check = {
        markers: markers.length,
        sourcesUsed: [...unique].filter((n) => n >= 1 && n <= citations.length).length,
        sourcesAvailable: citations.length,
        invalid,
        uncitedParagraphs: uncited,
      };
      emit.data("check", check);
      const detail = ar
        ? `${check.markers} إشارة · ${check.sourcesUsed}/${check.sourcesAvailable} مصادر مستخدمة${invalid.length ? ` · ${invalid.length} غير صالحة` : ""}${uncited ? ` · ${uncited} فقرات دون إسناد` : ""}`
        : `${check.markers} citations · ${check.sourcesUsed}/${check.sourcesAvailable} sources used${invalid.length ? ` · ${invalid.length} invalid` : ""}${uncited ? ` · ${uncited} uncited paragraph${uncited > 1 ? "s" : ""}` : ""}`;
      if (invalid.length) s3.error(detail);
      else s3.done(detail);
    },
    { modelKey },
  );
}
