import { addAudit, patchRecord } from "@/lib/store/db";
import { COL, DESK_AGENT, SLUG, loadConversations, loadHandoffs } from "@/app/solutions/07-contact-operations/_lib/data";
import type { Handoff, TranscriptTurn } from "@/app/solutions/07-contact-operations/_lib/types";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/solutions/07-contact-operations/handoffs/[id]">) {
  const { id } = await ctx.params;
  const h = loadHandoffs().find((x) => x.id === id);
  if (!h) return new Response("Handoff not found", { status: 404 });
  return Response.json(h);
}

interface Body {
  action: "take" | "reply" | "customer" | "resolve";
  text?: string;
  outcome?: "resolved" | "escalated" | "callback_scheduled";
  note?: string;
}

/** Human agent desk: take over, reply, relay customer messages, resolve. Every state change is persisted and audited. */
export async function POST(req: Request, ctx: RouteContext<"/api/solutions/07-contact-operations/handoffs/[id]">) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Body;
  const h = loadHandoffs().find((x) => x.id === id);
  if (!h) return new Response("Handoff not found", { status: 404 });
  const now = new Date().toISOString();
  const actor = { name: DESK_AGENT.name, role: DESK_AGENT.title, kind: "human" as const };

  /** Keep the live conversation record (supervisor log) in step with the human part of the contact. */
  const syncConversation = (patch: Partial<Handoff>, newTurns: TranscriptTurn[]) => {
    if (!h.sessionId) return;
    const conv = loadConversations().find((c) => c.handoffId === h.id);
    if (!conv) return;
    patchRecord(COL.conversations, conv.id, {
      transcript: [...conv.transcript, ...newTurns],
      ...(patch.status === "resolved"
        ? { outcome: "handoff_resolved", durationSec: Math.round((Date.now() - Date.parse(conv.startedAt)) / 1000) }
        : {}),
    });
  };

  switch (body.action) {
    case "take": {
      if (h.status === "resolved") return new Response("Already resolved", { status: 409 });
      const transcript: TranscriptTurn[] = [
        ...h.transcript,
        { role: "system", text: `${DESK_AGENT.name} joined the conversation with the full context.`, at: now, author: DESK_AGENT.name },
      ];
      patchRecord(COL.handoffs, id, { status: "in_progress", assignedTo: DESK_AGENT.name, takenAt: now, transcript });
      syncConversation({}, transcript.slice(-1));
      addAudit({
        solution: SLUG,
        actor,
        action: "Took over handoff",
        subject: `${id} · ${h.customerName}`,
        detail: `Waited ${Math.max(1, Math.round((Date.now() - Date.parse(h.createdAt)) / 60000))} min · context summary received from AI assistant`,
      });
      break;
    }
    case "reply":
    case "customer": {
      const text = (body.text ?? "").trim();
      if (!text) return new Response("text required", { status: 400 });
      const turn: TranscriptTurn =
        body.action === "reply"
          ? { role: "agent", text, at: now, author: DESK_AGENT.name }
          : { role: "customer", text, at: now };
      const transcript = [...h.transcript, turn];
      patchRecord(COL.handoffs, id, {
        transcript,
        ...(body.action === "reply" && h.status === "waiting" ? { status: "in_progress", assignedTo: DESK_AGENT.name, takenAt: now } : {}),
      });
      syncConversation({}, [turn]);
      break;
    }
    case "resolve": {
      const resolution = { outcome: body.outcome ?? "resolved", note: (body.note ?? "").trim(), at: now, by: DESK_AGENT.name };
      const transcript: TranscriptTurn[] = [
        ...h.transcript,
        { role: "system", text: `Resolved by ${DESK_AGENT.name}${resolution.note ? ` — ${resolution.note}` : ""}`, at: now },
      ];
      patchRecord(COL.handoffs, id, { status: "resolved", resolution, transcript, assignedTo: h.assignedTo ?? DESK_AGENT.name });
      syncConversation({ status: "resolved" }, transcript.slice(-1));
      addAudit({
        solution: SLUG,
        actor,
        action: resolution.outcome === "escalated" ? "Escalated handoff" : "Resolved handoff",
        subject: `${id} · ${h.customerName}`,
        detail: resolution.note || h.intent,
      });
      break;
    }
    default:
      return new Response("Unknown action", { status: 400 });
  }
  return Response.json(loadHandoffs().find((x) => x.id === id));
}
