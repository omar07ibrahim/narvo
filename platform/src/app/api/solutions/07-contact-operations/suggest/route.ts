import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { chatStream } from "@/lib/ai/client";
import type { Citation } from "@/lib/ai/events";
import { search } from "@/lib/retrieval";
import {
  DESK_AGENT,
  SLUG,
  customerReferences,
  loadCaseMessages,
  loadCustomers,
  loadHandoffs,
  workingDaysBetween,
} from "@/app/solutions/07-contact-operations/_lib/data";
import { statusMeta } from "@/app/solutions/07-contact-operations/_lib/types";

export const maxDuration = 90;

/**
 * Agent assist: drafts the next reply for the human agent who took over a handoff.
 * Grounded in the customer's live records (cases, permits, tickets) and cited knowledge passages.
 */
export async function POST(req: Request) {
  const body = await readBody<{ handoffId: string }>(req);
  const { modelKey, lang } = getPrefs(req, body as Record<string, unknown>);
  const h = loadHandoffs().find((x) => x.id === body.handoffId);
  if (!h) return new Response("Handoff not found", { status: 404 });

  return eventStream(
    req,
    async (emit) => {
      const s1 = emit.step("records", lang === "ar" ? "قراءة سجلات المتعامل" : "Reading the customer's records");
      const c = h.customerId ? loadCustomers().find((x) => x.id === h.customerId) : undefined;
      const refs = c ? customerReferences(c) : { cases: [], permits: [], tickets: [], appointments: [] };
      const records = [
        ...refs.cases.map((k) => ({
          ref: k.id,
          kind: "Housing application",
          status: statusMeta(k.status).en,
          track: k.track,
          officer: k.officer,
          submitted: k.submittedAt.slice(0, 10),
          workingDaysSinceSubmission: workingDaysBetween(k.submittedAt),
          missing: k.missing ?? [],
          note: k.summary,
          latestOfficerMessage: loadCaseMessages(k.id)[0]?.body ?? null,
        })),
        ...refs.permits.map((p) => ({
          ref: p.id,
          kind: p.serviceName,
          status: statusMeta(p.status).en,
          district: p.district,
          masterDeveloper: p.masterDeveloper,
          nocRequested: p.nocRequestedAt?.slice(0, 10) ?? null,
          workingDaysWaitingForNoc: p.nocRequestedAt ? workingDaysBetween(p.nocRequestedAt) : null,
          returnReason: p.returnReason,
          feeAed: p.feeAed,
          nextStep: p.nextStep,
          history: p.history.slice(-4),
        })),
        ...refs.tickets.map((t) => ({ ref: t.id, kind: `${t.type} ticket`, status: statusMeta(t.status).en, subject: t.subject, due: t.slaDue.slice(0, 10) })),
        ...refs.appointments.filter((a) => a.status === "booked").map((a) => ({ ref: a.id, kind: "Appointment", centre: a.centre, start: a.start })),
      ];
      s1.done(`${records.length} ${lang === "ar" ? "سجلات" : "records"}`);

      const s2 = emit.step("knowledge", lang === "ar" ? "البحث في السياسات المنشورة" : "Searching published policy");
      const hits = search("mnda/knowledge", [h.intent, h.reason, h.suggestedNextStep, h.summary], 5);
      const citations: Citation[] = hits.map((x, i) => ({
        n: i + 1,
        docId: x.docId,
        title: x.title,
        ref: x.ref,
        section: x.section,
        quote: x.text.length > 420 ? x.text.slice(0, 420) + "…" : x.text,
      }));
      emit.data("citations", citations);
      s2.done(`${hits.length} ${lang === "ar" ? "مقاطع" : "passages"}`);

      const s3 = emit.step("draft", lang === "ar" ? "صياغة الرد المقترح" : "Drafting the suggested reply");
      const customerLang = h.language === "en" ? "English" : "Arabic (clear Modern Standard Arabic with a warm Gulf courtesy tone)";
      const gen = chatStream({
        messages: [
          {
            role: "system",
            content: [
              `You assist ${DESK_AGENT.name}, a human Customer Happiness agent at MNDA (Marsa Al Noor Development Authority, UAE), who has just taken over a conversation from the AI assistant.`,
              `Draft the agent's next message to the customer in ${customerLang}. It is sent on ${h.channel === "phone" ? "a phone call (it will be read out — keep it to 3 sentences)" : "WhatsApp"}.`,
              "The customer must not have to repeat anything: acknowledge their situation specifically, say what you (the agent) are doing now, and give a concrete next step with dates/references. Be warm and precise, ≤ 110 words.",
              "Use only the facts in the records and policy passages. Cite policy facts with [n]. Do not promise approvals the agent cannot give; refunds/waivers need the CHC Manager's approval; escalations to master developers go through Planning & Building Permits.",
              "Output only the message text — no preface, no signature block other than the agent's first name.",
            ].join("\n"),
          },
          {
            role: "user",
            content: [
              `HANDOFF ${h.id} — priority ${h.priority}, sentiment ${h.sentiment}`,
              `Customer: ${h.customerName} (${h.verified ? "verified" : "not verified"}: ${h.verification})`,
              `Intent: ${h.intent}\nReason for handoff: ${h.reason}\nAI summary: ${h.summary}`,
              `Already tried: ${h.whatTried.join("; ")}\nAI suggested next step: ${h.suggestedNextStep}`,
              `Records:\n${JSON.stringify(records, null, 1)}`,
              `Policy passages:\n${hits.map((x, i) => `[${i + 1}] ${x.title} — ${x.section}\n${x.text.slice(0, 700)}`).join("\n\n")}`,
              `Conversation so far:\n${h.transcript
                .slice(-10)
                .map((t) => `${t.role}${t.author ? ` (${t.author})` : ""}: ${t.text}`)
                .join("\n")}`,
            ].join("\n\n"),
          },
        ],
        modelKey,
        temperature: 0.3,
        maxTokens: 600,
        solution: SLUG,
        task: "agent-assist",
        signal: emit.signal,
      });
      for (let n = await gen.next(); !n.done; n = await gen.next()) if (n.value.content) emit.text(n.value.content, "suggest");
      s3.done();
    },
    { modelKey },
  );
}
