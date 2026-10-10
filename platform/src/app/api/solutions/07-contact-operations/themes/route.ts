import { z } from "zod";
import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { generateObject } from "@/lib/ai/json";
import type { Citation } from "@/lib/ai/events";
import { search } from "@/lib/retrieval";
import { normalizeArabic } from "@/lib/retrieval/arabic";
import { createApproval, kvGet, kvSet } from "@/lib/store/db";
import { CHC_MANAGER, COL, SLUG, loadConversations } from "@/app/solutions/07-contact-operations/_lib/data";

export const maxDuration = 180;
const KV = `${SLUG}:themes`;

const themeSchema = z.object({
  headline: z.string().describe("One sentence summarising what customers are struggling with"),
  themes: z
    .array(
      z.object({
        title: z.string().describe("Short English theme name"),
        titleAr: z.string().describe("Arabic theme name"),
        description: z.string().describe("1-2 English sentences"),
        descriptionAr: z.string().describe("1-2 Arabic sentences"),
        conversationIds: z.array(z.string()).describe("IDs of ALL conversations that show this theme"),
        quotes: z
          .array(z.object({ conversationId: z.string(), quote: z.string().describe("EXACT customer words copied verbatim from that transcript") }))
          .max(3),
        rootCause: z.string(),
        impact: z.enum(["high", "medium", "low"]),
        recommendation: z.string(),
        knowledgeGap: z.boolean().describe("true if clearer published guidance (FAQ / quick reply) would prevent these contacts"),
      }),
    )
    .min(3)
    .max(7),
});

const articleSchema = z.object({
  title: z.string(),
  titleAr: z.string(),
  question: z.string(),
  questionAr: z.string(),
  answerEn: z.string().describe("Markdown, 90-160 words, cite sources as [n]"),
  answerAr: z.string().describe("Arabic Markdown, same content, cite sources as [n]"),
  rationale: z.string().describe("Why this update, referencing the evidence (counts, repeat contacts)"),
  placement: z.string().describe("Where to publish: FAQ section, WhatsApp quick reply, app screen…"),
});

const norm = (s: string) =>
  normalizeArabic(s.toLowerCase())
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

export async function GET() {
  return Response.json(kvGet(KV) ?? null);
}

export async function POST(req: Request) {
  const body = await readBody<Record<string, unknown>>(req);
  const { modelKey, lang } = getPrefs(req, body);

  return eventStream(
    req,
    async (emit) => {
      const convs = loadConversations().slice(0, 70);
      const s1 = emit.step("read", lang === "ar" ? `قراءة ${convs.length} محادثة` : `Reading ${convs.length} transcripts`);
      const corpus = convs
        .map((c) => {
          const lines = c.transcript
            .filter((t) => t.role !== "system")
            .map((t) => `${t.role === "customer" ? "C" : t.role === "agent" ? "H" : "A"}: ${t.text.replace(/\s+/g, " ").slice(0, t.role === "customer" ? 260 : 140)}`)
            .join("\n");
          return `### ${c.id} | ${c.channel} | ${c.language} | intent=${c.intent} | outcome=${c.outcome} | sentiment=${c.sentiment}\n${lines.slice(0, 1100)}`;
        })
        .join("\n\n");
      s1.done(`${Math.round(corpus.length / 1000)}k ${lang === "ar" ? "حرف" : "characters"}`);

      const s2 = emit.step("cluster", lang === "ar" ? "تجميع المحادثات في محاور ناشئة" : "Clustering into emerging themes");
      const { object: found } = await generateObject({
        schema: themeSchema,
        name: "contact_themes",
        system: [
          "You are a contact-centre quality analyst for MNDA (Marsa Al Noor Development Authority, UAE) Customer Happiness Centre, reporting to the CHC Manager.",
          "Cluster the transcripts (C = customer, A = AI assistant, H = human agent) into 4-6 EMERGING themes — recurring confusions, frictions or failure points that drive contacts or repeat contacts. Prefer specific, actionable themes (e.g. a rule customers misunderstand) over generic intents.",
          "For each theme list ALL conversation IDs that show it, and up to 3 quotes copied EXACTLY (verbatim, original language) from customer lines. Do not invent IDs or quotes.",
          "Write titles/descriptions in English and Arabic (MSA).",
        ].join("\n"),
        user: corpus,
        modelKey,
        solution: SLUG,
        task: "themes",
        maxTokens: 3200,
      });

      // Verify: counts are computed from real conversation IDs; quotes must exist verbatim in the cited transcript.
      const byId = new Map(convs.map((c) => [c.id, c]));
      const themes = found.themes
        .map((t) => {
          const ids = Array.from(new Set(t.conversationIds.filter((id) => byId.has(id))));
          const quotes = t.quotes
            .filter((q) => {
              const c = byId.get(q.conversationId);
              if (!c) return false;
              const hay = norm(c.transcript.map((x) => x.text).join(" "));
              const needle = norm(q.quote);
              return needle.length > 6 && hay.includes(needle.slice(0, Math.min(needle.length, 80)));
            })
            .map((q) => ({ ...q, verified: true }));
          const repeat = ids.filter((id) => (byId.get(id)?.outcome ?? "").startsWith("handoff")).length;
          const negative = ids.filter((id) => byId.get(id)?.sentiment === "negative").length;
          return { ...t, conversationIds: ids, count: ids.length, quotes, handoffs: repeat, negative };
        })
        .filter((t) => t.count > 0)
        .sort((a, b) => b.count - a.count);
      const verifiedQuotes = themes.reduce((n, t) => n + t.quotes.length, 0);
      const proposedQuotes = found.themes.reduce((n, t) => n + t.quotes.length, 0);
      emit.data("themes", { headline: found.headline, themes, analysed: convs.length });
      s2.done(
        lang === "ar"
          ? `${themes.length} محاور · ${verifiedQuotes}/${proposedQuotes} اقتباسات موثّقة حرفياً`
          : `${themes.length} themes · ${verifiedQuotes}/${proposedQuotes} quotes verified verbatim`,
      );

      const target = themes.find((t) => t.knowledgeGap) ?? themes[0];
      if (!target) throw new Error("No themes found");

      const s3 = emit.step("ground", lang === "ar" ? "البحث عن السياسة المرجعية" : "Finding the governing policy");
      const hits = search("mnda/knowledge", [target.title, target.description, target.rootCause, target.titleAr], 6);
      const citations: Citation[] = hits.map((h, i) => ({
        n: i + 1,
        docId: h.docId,
        title: h.title,
        ref: h.ref,
        section: h.section,
        quote: h.text.length > 420 ? h.text.slice(0, 420) + "…" : h.text,
      }));
      emit.data("citations", citations);
      s3.done(`${hits.length} ${lang === "ar" ? "مقاطع" : "passages"} · ${new Set(hits.map((h) => h.ref ?? h.docId)).size} ${lang === "ar" ? "مستندات" : "documents"}`);

      const s4 = emit.step("draft", lang === "ar" ? "صياغة تحديث الأسئلة الشائعة" : "Drafting a knowledge / FAQ update");
      const { object: article } = await generateObject({
        schema: articleSchema,
        name: "faq_update",
        system: [
          "You write customer-facing knowledge for MNDA's Customer Happiness Centre (UAE government authority). Plain, precise, friendly; Arabic in formal but simple MSA (UAE government register).",
          "Write ONE new FAQ entry that would have prevented the contacts in the theme. Use ONLY facts from the numbered policy passages and cite them [n]. Include concrete numbers, dates, document names and how to act (MNDA Smart path, centres, hotline).",
        ].join("\n"),
        user: [
          `THEME: ${target.title} — ${target.description}\nRoot cause: ${target.rootCause}\nEvidence: ${target.count} of ${convs.length} recent conversations (${target.handoffs} needed a human agent, ${target.negative} negative). Example quotes: ${target.quotes.map((q) => `"${q.quote}"`).join(" | ")}`,
          `POLICY PASSAGES:\n${hits.map((h, i) => `[${i + 1}] ${h.title}${h.ref ? ` (${h.ref})` : ""} — ${h.section}\n${h.text.slice(0, 900)}`).join("\n\n")}`,
        ].join("\n\n"),
        modelKey,
        solution: SLUG,
        task: "faq-draft",
        maxTokens: 2000,
      });
      emit.data("article", { ...article, theme: target.title });
      s4.done();

      const s5 = emit.step("approval", lang === "ar" ? "طلب اعتماد مديرة المركز" : "Routing to the CHC Manager for approval");
      const draftId = `KB-DRAFT-${String(Date.now()).slice(-5)}`;
      const approval = createApproval({
        solution: SLUG,
        title: `Publish FAQ update — ${article.title}`,
        summary: `${article.question} · Evidence: ${target.count} of ${convs.length} recent contacts. ${article.rationale}`.slice(0, 420),
        actionLabel: "Approve & add to knowledge drafts",
        approver: CHC_MANAGER,
        effects: [
          {
            type: "append",
            collection: COL.kbDrafts,
            item: {
              id: draftId,
              title: article.title,
              titleAr: article.titleAr,
              question: article.question,
              questionAr: article.questionAr,
              answerEn: article.answerEn,
              answerAr: article.answerAr,
              rationale: article.rationale,
              placement: article.placement,
              themes: [target.title],
              sources: citations.map((c) => `${c.ref ?? c.docId} § ${c.section}`),
              status: "Approved — queued for publication",
              createdAt: new Date().toISOString(),
            },
          },
          { type: "audit", action: "Knowledge draft approved", subject: `${draftId} · ${article.title}`, detail: article.placement },
        ],
        payload: { article, theme: target.title, citations },
      });
      emit.send({
        type: "approval",
        approval: {
          id: approval.id,
          title: approval.title,
          summary: approval.summary,
          solution: SLUG,
          actionLabel: approval.actionLabel,
          approver: approval.approver,
          status: "pending",
          createdAt: approval.createdAt,
        },
      });
      s5.waiting(CHC_MANAGER.name);

      kvSet(KV, {
        at: new Date().toISOString(),
        headline: found.headline,
        themes,
        analysed: convs.length,
        article: { ...article, theme: target.title },
        citations,
        approvalId: approval.id,
      });
    },
    { modelKey },
  );
}
