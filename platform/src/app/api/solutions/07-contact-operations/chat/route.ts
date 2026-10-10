import { z } from "zod";
import { eventStream, readBody, type Emitter } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { runAgent } from "@/lib/ai/agent";
import { generateObject } from "@/lib/ai/json";
import type { ChatMessage } from "@/lib/ai/client";
import type { Citation } from "@/lib/ai/events";
import { appendRecord, patchRecord } from "@/lib/store/db";
import { buildTools, publishSession, systemPrompt, type AgentCtx } from "@/app/solutions/07-contact-operations/_lib/agent";
import { COL, SLUG, findByMobile, findByReference, getSession, levelFor, loadConversations } from "@/app/solutions/07-contact-operations/_lib/data";
import type { Conversation, Intent, SessionState, Signals, TranscriptTurn } from "@/app/solutions/07-contact-operations/_lib/types";

export const maxDuration = 120;

interface Body {
  sessionId: string;
  channel: "voice" | "chat";
  ani?: string | null;
  transcript: TranscriptTurn[];
}

const signalSchema = z.object({
  language: z.enum(["ar", "en", "mixed"]),
  dialect: z.string().nullable().describe("e.g. Emirati Arabic, Gulf Arabic, Modern Standard Arabic, Egyptian Arabic, Levantine Arabic, English — or null"),
  sentiment: z.number().min(-1).max(1),
  sentimentLabel: z.string().describe("one or two words, e.g. calm, frustrated, anxious, satisfied"),
  intent: z.enum(["housing_status", "permit_status", "documents", "appointment", "complaint", "maintenance", "other"]),
});

export async function POST(req: Request) {
  const body = await readBody<Body>(req);
  const { modelKey, lang } = getPrefs(req, body as unknown as Record<string, unknown>);
  if (!body.sessionId || !Array.isArray(body.transcript) || !body.transcript.length) {
    return new Response("sessionId and transcript are required", { status: 400 });
  }
  const channel = body.channel === "voice" ? "voice" : "chat";

  return eventStream(
    req,
    async (emit) => {
      // ── Session: verification state is kept server-side, never trusted from the client.
      let session: SessionState | undefined = getSession(body.sessionId);
      if (!session) {
        const byAni = body.ani ? findByMobile(body.ani) : undefined;
        const factors = byAni ? ["registered_mobile"] : [];
        session = {
          sessionId: body.sessionId,
          channel,
          ani: body.ani ?? null,
          customerId: byAni?.id ?? null,
          factors,
          level: levelFor(factors),
          startedAt: new Date().toISOString(),
          conversationId: `CNV-2611-${String(Math.floor(1000 + Math.random() * 8999))}`,
          actions: [],
          sentiments: [],
          handoffId: null,
        };
      }
      session.channel = channel;

      // Capture exactly what the customer sees (preambles + final answer) for the transcript.
      let streamed = "";
      let retried = "";
      const out: Emitter = {
        ...emit,
        text: (delta: string, ch?: string) => {
          if ((ch ?? "main") === "main") streamed += delta;
          if (ch === "retry") retried += delta;
          emit.text(delta, ch);
        },
      };
      const lastText = [...body.transcript].reverse().find((t) => t.role === "customer")?.text ?? "";
      const ctx: AgentCtx = {
        session,
        emit: out,
        citations: [...(session.citations ?? [])],
        actions: [],
        transcript: body.transcript,
        channel,
        prefAr: /[؀-ۿ]/.test(lastText),
      };
      publishSession(ctx);
      const s0 = emit.step(
        "channel",
        lang === "ar" ? "التعرف على القناة والمتعامل" : "Channel & caller identification",
        session.level === "none"
          ? lang === "ar"
            ? "رقم غير مسجل — يلزم التحقق"
            : "Number not registered — verification needed"
          : `${session.factors.length} ${lang === "ar" ? "عامل تحقق مطابق" : "verification factor(s) matched"}`,
      );
      s0.done();

      // ── Signals (language/dialect, sentiment, intent) run in parallel with the agent.
      const lastCustomer = [...body.transcript].reverse().find((t) => t.role === "customer")?.text ?? "";
      const signalsP = generateObject({
        schema: signalSchema,
        name: "contact_signals",
        system:
          "Classify the customer's latest message in a government contact-centre conversation (MNDA, UAE). Return language (ar/en/mixed), the dialect or variety, sentiment from -1 (very upset) to 1 (very satisfied) considering the whole conversation so far, a short sentiment label, and the main intent.",
        user: body.transcript
          .slice(-6)
          .map((t) => `${t.role}: ${t.text}`)
          .join("\n"),
        modelKey,
        solution: SLUG,
        task: "signals",
        maxTokens: 200,
      })
        .then((r) => {
          const sig = r.object as Signals;
          emit.data("signals", sig);
          return sig;
        })
        .catch(() => null);

      // ── Agent
      const turns = body.transcript.filter((t) => t.role !== "system");
      const messages: ChatMessage[] = turns.map((t, i) =>
        t.role === "customer"
          ? {
              role: "user" as const,
              // Register reminder for Arabic turns (the customer may write dialect; replies stay in simple MSA).
              content: i === turns.length - 1 && ctx.prefAr ? `${t.text}\n\n[للمساعد: أجب بالعربية الفصحى المبسّطة، دون لهجة.]` : t.text,
            }
          : { role: "assistant" as const, content: t.role === "agent" ? `[Human agent ${t.author ?? ""}] ${t.text}` : t.text },
      );

      let result = await runAgent({
        system: systemPrompt(ctx),
        messages,
        tools: buildTools(ctx),
        emit: out,
        solution: SLUG,
        modelKey,
        maxSteps: 7,
        temperature: 0.25,
      });

      // ── Integrity guard: any reference number in the reply must exist (created by a tool or on record).
      const draft = streamed.trim() || result.final.trim();
      const mentioned = Array.from(new Set(draft.match(/(APT-26-\d{4,7}|CHC-2026-\d{5,7}|HO-\d{4}-\d{3,5}|EXC-26-\d{3,6})/g) ?? []));
      const real = new Set([...(session.actions ?? []).map((a) => a.id), ...ctx.actions.map((a) => a.id)]);
      const invented = mentioned.filter((id) => !real.has(id) && !findByReference(id).id && !id.startsWith("HO-") && !id.startsWith("EXC-"));
      if (invented.length) {
        const g = emit.step("integrity", lang === "ar" ? "فحص النزاهة: رقم مرجعي غير موجود" : "Integrity check: unknown reference in reply", invented.join(", "));
        // Remove the discarded draft from the screen before the corrected reply streams in.
        emit.resetText("main");
        result = await runAgent({
          system:
            systemPrompt(ctx) +
            `\n\nINTEGRITY CHECK: your previous draft mentioned ${invented.join(", ")}, which no tool created and which does not exist. That draft was discarded — the customer never saw it, so do not apologise or mention it. If the customer asked for a booking, call book_appointment now with the offered slot and confirm using the number the tool returns; otherwise answer without inventing references.`,
          messages,
          tools: buildTools(ctx),
          emit: out,
          solution: SLUG,
          modelKey,
          maxSteps: 5,
          temperature: 0.1,
          channel: "retry",
        });
        g.done(lang === "ar" ? "أعيدت صياغة الرد بعد تنفيذ الأداة" : "Reply regenerated with real tool results");
      }
      session.citations = ctx.citations;

      const signals = await signalsP;
      if (signals) session.sentiments = [...(session.sentiments ?? []), signals.sentiment].slice(-12);
      publishSession(ctx);

      // ── Persist the conversation record (Supervisor log + KPIs)
      // Models sometimes repeat a short preamble before each tool step — keep each paragraph once.
      const seen = new Set<string>();
      const final = (invented.length ? retried.trim() || result.final.trim() : streamed.trim() || result.final.trim())
        .split(/\n{2,}/)
        .filter((p) => {
          const k = p.trim();
          if (!k || seen.has(k)) return false;
          seen.add(k);
          return true;
        })
        .join("\n\n");
      const full: TranscriptTurn[] = [
        ...body.transcript,
        { role: "assistant", text: final, at: new Date().toISOString(), channel },
      ];
      const usedTools = result.toolResults.map((t) => t.name);
      const derived: Intent = usedTools.includes("book_appointment") || usedTools.includes("list_available_slots")
        ? "appointment"
        : usedTools.includes("create_ticket")
          ? ((result.toolResults.find((t) => t.name === "create_ticket")?.args as { type?: string })?.type === "maintenance" ? "maintenance" : "complaint")
          : (signals?.intent ?? "other");
      const existing = loadConversations().find((c) => c.id === session!.conversationId);
      const allActions = (session.actions ?? []).filter((a) => a.kind !== "verification");
      const sentimentAvg = session.sentiments?.length ? session.sentiments[session.sentiments.length - 1] : 0;
      const record: Conversation = {
        id: session.conversationId!,
        startedAt: existing?.startedAt ?? session.startedAt,
        channel: channel === "voice" ? "phone" : "whatsapp",
        language: signals?.language ?? (/[؀-ۿ]/.test(lastCustomer) ? "ar" : "en"),
        customerId: session.customerId,
        intent: existing && existing.intent !== "other" && derived === "other" ? existing.intent : derived,
        handledBy: session.handoffId ? "ai_agent" : "ai",
        outcome: session.handoffId ? "handoff_open" : "in_progress",
        durationSec: Math.max(5, Math.round((Date.now() - Date.parse(existing?.startedAt ?? session.startedAt)) / 1000)),
        csat: null,
        sentiment: sentimentAvg <= -0.25 ? "negative" : sentimentAvg >= 0.3 ? "positive" : "neutral",
        summary: (body.transcript.find((t) => t.role === "customer")?.text ?? lastCustomer).slice(0, 160),
        actions: allActions.map((a) => `${a.kind === "appointment" ? "Booked" : a.kind === "ticket" ? "Logged" : a.kind === "handoff" ? "Handoff" : "Requested"} ${a.id} — ${a.label}`),
        transcript: full,
        live: true,
        handoffId: session.handoffId ?? null,
      };
      if (existing) patchRecord(COL.conversations, record.id, record as unknown as Record<string, unknown>);
      else appendRecord(COL.conversations, record as unknown as Record<string, unknown> & { id: string });

      emit.data("turn", {
        conversationId: record.id,
        final,
        citations: ctx.citations as Citation[],
        actions: ctx.actions,
        signals,
        toolsUsed: usedTools,
      });
    },
    { modelKey },
  );
}
