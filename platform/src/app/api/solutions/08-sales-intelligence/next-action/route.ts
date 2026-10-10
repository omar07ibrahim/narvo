import { z } from "zod";
import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { generateObject } from "@/lib/ai/json";
import { findOpp, loadSalesData, SLUG } from "@/app/solutions/08-sales-intelligence/_lib/records";
import { buildSourcePack, computedFacts, POLICY_QUERIES } from "@/app/solutions/08-sales-intelligence/_lib/evidence";
import { addDays, checkDraft, oppHealth } from "@/app/solutions/08-sales-intelligence/_lib/calc";
import { ALL_STAGES, type NextAction } from "@/app/solutions/08-sales-intelligence/_lib/types";

export const dynamic = "force-dynamic";

const schema = z.object({
  action: z.object({
    title: z.string().describe("The single next best action, imperative, ≤ 12 words"),
    rationale: z.string().describe("Why this action now, 2–3 sentences with [n] citations"),
    urgency: z.enum(["today", "this_week", "later"]),
  }),
  crmUpdate: z.object({
    stage: z.enum(["Qualification", "Proposal", "Negotiation", "Closed Won", "Closed Lost"]),
    nextStep: z.string().describe("Next step text for the CRM record, ≤ 14 words"),
    nextStepDate: z.string().describe("YYYY-MM-DD, a working day on or after today"),
    probability: z.number().int().min(0).max(100),
    note: z.string().describe("One-line CRM note explaining the update"),
  }),
  draft: z.object({
    to: z.string().describe("Recipient name and company"),
    subject: z.string().nullable().describe("Email subject (null for WhatsApp)"),
    body: z.string(),
  }),
  commitmentsInDraft: z.array(z.string()).describe("Every commitment the draft makes on behalf of RBM (prices, terms, dates, deliveries)"),
  sources: z.array(z.number()),
});

/** Next best action + follow-up draft (email/WhatsApp, EN/AR) + proposed CRM update — checked by code guardrails. */
export async function POST(req: Request) {
  const body = await readBody<{ opportunityId?: string; channel?: string; draftLang?: string; instruction?: string }>(req);
  const { modelKey, lang } = getPrefs(req, body);
  const data = loadSalesData();
  const opp = findOpp(data, body.opportunityId);
  if (!opp) return Response.json({ error: "Unknown opportunity" }, { status: 404 });
  const channel = body.channel === "whatsapp" ? "whatsapp" : "email";
  const draftLang = body.draftLang === "ar" ? "ar" : "en";
  const instruction = typeof body.instruction === "string" ? body.instruction.slice(0, 500) : "";
  const ar = lang === "ar";
  const owner = data.people.find((p) => p.name === opp.owner);

  return eventStream(
    req,
    async (emit) => {
      const s1 = emit.step("assess", ar ? "تقييم حالة الفرصة والتعارضات والمواعيد" : "Assessing stage, conflicts and deadlines");
      const pack = buildSourcePack(data, opp, { scope: "opportunity", policyQueries: POLICY_QUERIES.action });
      const h = oppHealth(opp, data.interactions, data.today);
      emit.data("citations", pack.citations);
      s1.done(
        ar
          ? `${h.daysInStage} يوماً في ${opp.stage} · ${pack.report.conflicts.length} تعارضات · آخر تواصل قبل ${h.daysSinceTouch ?? "—"} أيام`
          : `${h.daysInStage} days in ${opp.stage} · ${pack.report.conflicts.length} conflicts · last contact ${h.daysSinceTouch ?? "—"} days ago`,
      );

      const s2 = emit.step("decide", ar ? "اختيار الخطوة التالية وصياغة المتابعة" : "Choosing the next best action and drafting the follow-up");
      const draftLangName =
        draftLang === "ar"
          ? channel === "whatsapp"
            ? "Arabic — courteous Gulf business tone suitable for WhatsApp (light Emirati/Gulf phrasing is fine), Latin digits for numbers"
            : "Arabic — formal Modern Standard Arabic business email, Latin digits for numbers and references"
          : "English — professional, warm, concise";
      const { object } = await generateObject({
        schema,
        name: "next_best_action",
        system: [
          "You are NARVO, the private AI assistant of Raseen Building Materials Trading LLC (RBM), a UAE building-materials distributor.",
          `You work for ${opp.owner}, Key Account Manager (${owner?.email ?? ""}${owner?.mobile ? `, ${owner.mobile}` : ""}). Approver for anything sent to customers: Fadi Khoury, Sales Director.`,
          "Decide the single next best action to move this opportunity forward, propose the CRM update, and draft the customer follow-up.",
          "Hard rules for the draft: it may only commit to what RBM's authority allows — frame-agreement rates and terms, site delivery windows, re-issuing a valid offer, proposing a meeting/call. It must NOT offer prices below the frame rate, payment terms beyond the credit tier, retention, prices fixed beyond 31 Dec 2026, or deliveries outside the site window, unless the user's instruction explicitly asks — and then state it as 'subject to approval'.",
          "Do not repeat internal information to the customer (internal notes, the Sales Director's instructions, credit-hold details, cost prices). Be factual, short, respectful; acknowledge the change of KAM where relevant; propose a concrete time.",
          "Stage discipline: never move the stage backwards for a revised offer inside an ongoing negotiation — keep the current stage unless the deal is won, lost or genuinely re-scoped.",
          "In the draft, respond to the customer's open points: acknowledge what can be done, state clearly and courteously what RBM cannot accept, and offer the compliant alternative. If the KAM changed recently, introduce the new owner in one line.",
          `nextStepDate must be a working day (Mon–Fri) on or after today (${data.today}). Use the calendar in the computed facts for weekdays.`,
          `Write action.title, action.rationale and crmUpdate in ${ar ? "Arabic (professional MSA)" : "English"}. Write the draft (channel: ${channel}) in ${draftLangName}. ${channel === "whatsapp" ? "WhatsApp: 50–110 words, no subject (null), no emoji." : "Email: 120–220 words with a clear subject line and sign-off with name, title, company and mobile."}`,
          "Cite sources with [n] only inside action.rationale (never inside the draft).",
        ].join("\n"),
        user: `COMPUTED FACTS:\n${computedFacts(data, opp, pack.report)}\n\n${instruction ? `USER INSTRUCTION: ${instruction}\n\n` : ""}SOURCES:\n\n${pack.context}`,
        modelKey,
        maxTokens: 2200,
        temperature: 0.3,
        solution: SLUG,
        task: "next-action",
      });

      // Code-side validation of the proposal.
      const result: NextAction = {
        ...object,
        crmUpdate: {
          ...object.crmUpdate,
          stage: ALL_STAGES.includes(object.crmUpdate.stage) ? object.crmUpdate.stage : opp.stage,
          probability: Math.max(0, Math.min(100, Math.round(object.crmUpdate.probability))),
          nextStepDate: /^\d{4}-\d{2}-\d{2}$/.test(object.crmUpdate.nextStepDate) && object.crmUpdate.nextStepDate >= data.today ? object.crmUpdate.nextStepDate : addDays(data.today, 1),
        },
        draft: { ...object.draft, channel, language: draftLang, subject: channel === "whatsapp" ? null : object.draft.subject },
      };
      emit.data("action", result);
      s2.done(result.action.title);

      const s3 = emit.step("guardrails", ar ? "فحص المسودة مقابل الاتفاقية وسياسة الائتمان" : "Checking the draft against frame agreement and credit policy");
      const flags = checkDraft(`${result.draft.subject ?? ""}\n${result.draft.body}`, pack.report, pack.report.tierMaxTerms);
      emit.data("guardrails", flags);
      s3.done(
        flags.length
          ? ar
            ? `${flags.filter((f) => f.severity === "high").length} مخالفات · ${flags.filter((f) => f.severity === "check").length} للتحقق`
            : `${flags.filter((f) => f.severity === "high").length} breaches · ${flags.filter((f) => f.severity === "check").length} to check`
          : ar
            ? "لا مخالفات — ضمن الصلاحيات"
            : "No breaches — within authority",
      );
    },
    { modelKey },
  );
}
