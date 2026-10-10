import { z } from "zod";
import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { generateObject } from "@/lib/ai/json";
import { chatStream } from "@/lib/ai/client";
import { addAudit, kvSet } from "@/lib/store/db";
import { cacheKey, findOpp, loadSalesData, SLUG } from "@/app/solutions/08-sales-intelligence/_lib/data";
import { buildSourcePack, computedFacts, POLICY_QUERIES } from "@/app/solutions/08-sales-intelligence/_lib/context";

export const dynamic = "force-dynamic";

const schema = z.object({
  commitments: z
    .array(
      z.object({
        commitment: z.string(),
        madeBy: z.string(),
        madeTo: z.string(),
        date: z.string().describe("YYYY-MM-DD"),
        status: z.enum(["open", "fulfilled", "disputed", "expired", "overdue"]),
        risk: z.string().describe("Why it matters for the new owner, one short sentence"),
        sources: z.array(z.number()),
      }),
    )
    .describe("Every promise, offer, hint, deadline accepted or action owed by either side"),
  gaps: z.array(z.object({ gap: z.string(), sources: z.array(z.number()) })).describe("Important facts missing from the outgoing owner's handover note"),
  deadlines: z.array(z.object({ date: z.string(), what: z.string(), sources: z.array(z.number()) })),
});

/** KAM handover pack: commitments extracted from the record, gaps in the handover note, then a streamed pack. */
export async function POST(req: Request) {
  const body = await readBody<{ opportunityId?: string }>(req);
  const { modelKey, lang } = getPrefs(req, body);
  const data = loadSalesData();
  const opp = findOpp(data, body.opportunityId);
  if (!opp) return Response.json({ error: "Unknown opportunity" }, { status: 404 });
  const ar = lang === "ar";
  const account = data.accounts.find((a) => a.id === opp.accountId)!;
  const ho = data.handovers.find((h) => h.accountIds.includes(account.id));
  const from = ho?.from ?? opp.previousOwner ?? opp.owner;
  const to = ho?.to ?? opp.owner;

  return eventStream(
    req,
    async (emit) => {
      const s1 = emit.step("collect", ar ? "جمع سجل الحساب منذ بدء الفرصة" : "Collecting the account record since the enquiry");
      const pack = buildSourcePack(data, opp, { scope: "account", policyQueries: POLICY_QUERIES.handover });
      emit.data("citations", pack.citations);
      const facts = computedFacts(data, opp, pack.report);
      s1.done(ar ? `${pack.citations.length} مصدراً · تسليم ${from} ← ${to}` : `${pack.citations.length} sources · handover ${from} → ${to}`);

      const s2 = emit.step("commitments", ar ? "استخراج الالتزامات المفتوحة وثغرات مذكرة التسليم" : "Extracting open commitments and gaps in the handover note");
      const lang1 = ar ? "Arabic (professional MSA; keep names, codes and amounts in Latin script/digits)" : "English";
      const { object } = await generateObject({
        schema,
        name: "handover_analysis",
        system: [
          "You are NARVO, the private AI assistant of Raseen Building Materials (RBM). A key account is changing owner.",
          `Outgoing KAM: ${from}. Incoming KAM: ${to}. Sales Director: Fadi Khoury.`,
          "From the numbered sources, extract every commitment either side made or claims was made (offers, price hints, promised replies, payments, deliveries, approvals requested), with its status as of today and the source markers.",
          "Mark a commitment 'disputed' when the parties' records disagree (e.g. a customer claims an agreement that internal notes describe as 'no commitment').",
          "Then list the gaps: material facts that the outgoing owner's handover note omits. Then list dated deadlines.",
          `Use only the sources. Dates as YYYY-MM-DD. Write the text fields in ${lang1}.`,
        ].join("\n"),
        user: `COMPUTED FACTS:\n${facts}\n\nSOURCES:\n\n${pack.context}`,
        modelKey,
        maxTokens: 2600,
        temperature: 0.1,
        solution: SLUG,
        task: "handover.extract",
      });
      object.deadlines.sort((a, b) => a.date.localeCompare(b.date));
      emit.data("analysis", object);
      s2.done(
        ar
          ? `${object.commitments.length} التزامات · ${object.commitments.filter((c) => c.status === "disputed").length} متنازع عليها · ${object.gaps.length} ثغرات`
          : `${object.commitments.length} commitments · ${object.commitments.filter((c) => c.status === "disputed").length} disputed · ${object.gaps.length} gaps`,
      );

      const s3 = emit.step("pack", ar ? "كتابة حزمة التسليم للمالك الجديد" : "Writing the handover pack for the new owner");
      const gen = chatStream({
        messages: [
          {
            role: "system",
            content: [
              "You are NARVO, the private AI assistant of Raseen Building Materials (RBM).",
              `Write a handover pack for ${to}, who takes over ${account.name} from ${from}. It must let her act confidently in her first conversation with the customer.`,
              "Use ONLY the sources and the extracted analysis; cite facts with [n] markers. Computed numbers are authoritative.",
              `Write in ${ar ? "Arabic (Modern Standard Arabic, professional; keep codes, references and AED amounts in Latin digits)" : "English"}.`,
              "Markdown, ~300–400 words, ### headings: " +
                (ar
                  ? "«ما يجب أن تعرفيه أولاً»، «الالتزامات المفتوحة»، «المخاطر»، «الأشخاص»، «أول خمس خطوات»"
                  : "'What you need to know first', 'Open commitments', 'Risks', 'People', 'First five actions'") +
                ". In 'First five actions' give dated, owner-assigned actions.",
            ].join("\n"),
          },
          { role: "user", content: `COMPUTED FACTS:\n${facts}\n\nEXTRACTED ANALYSIS:\n${JSON.stringify(object)}\n\nSOURCES:\n\n${pack.context}` },
        ],
        modelKey,
        temperature: 0.25,
        maxTokens: 1400,
        solution: SLUG,
        task: "handover.pack",
        signal: emit.signal,
      });
      let text = "";
      let res;
      while (true) {
        const n = await gen.next();
        if (n.done) {
          res = n.value;
          break;
        }
        if (n.value.content) {
          text += n.value.content;
          emit.text(n.value.content, "pack");
        }
      }
      if (!text.trim()) throw new Error("The model returned an empty handover pack");
      s3.done();
      kvSet(cacheKey("handover", opp.id), { kind: "handover", opportunityId: opp.id, text, data: object, citations: pack.citations, at: Date.now(), ms: res?.ms, lang });
      addAudit({
        solution: SLUG,
        actor: { name: "NARVO Agent", role: "AI agent", kind: "agent" },
        action: "Handover pack prepared",
        subject: `${account.name} — ${from} → ${to}`,
        detail: `${object.commitments.length} commitments, ${object.gaps.length} gaps in handover note`,
        model: res?.model,
      });
    },
    { modelKey },
  );
}
