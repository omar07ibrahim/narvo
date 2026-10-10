import { addAudit, patchRecord } from "@/lib/store/db";
import { COL, SLUG, getSession, loadConversations, loadCustomers } from "@/app/solutions/07-contact-operations/_lib/data";

/** Close a live contact: final handle time and outcome are written to the contact log (feeds the KPIs). */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { sessionId?: string };
  const s = body.sessionId ? getSession(body.sessionId) : undefined;
  if (!s?.conversationId) return new Response("Unknown session", { status: 404 });
  const conv = loadConversations().find((c) => c.id === s.conversationId);
  if (!conv) return new Response("Conversation not found", { status: 404 });
  const durationSec = Math.max(conv.durationSec, Math.round((Date.now() - Date.parse(conv.startedAt)) / 1000));
  const outcome = conv.outcome === "in_progress" ? "resolved" : conv.outcome;
  patchRecord(COL.conversations, conv.id, { outcome, durationSec, endedAt: new Date().toISOString() });
  const who = s.customerId ? loadCustomers().find((c) => c.id === s.customerId)?.name : undefined;
  addAudit({
    solution: SLUG,
    actor: { name: "NARVO Contact Assistant", role: "AI agent", kind: "agent" },
    action: outcome === "resolved" ? "Contact resolved by AI assistant" : "Contact closed",
    subject: `${conv.id} · ${who ?? "Unidentified customer"}`,
    detail: `${conv.channel} · ${Math.floor(durationSec / 60)}m ${durationSec % 60}s · ${conv.actions.length} action(s) · verification: ${s.level}`,
  });
  return Response.json({ ok: true, outcome, durationSec });
}
