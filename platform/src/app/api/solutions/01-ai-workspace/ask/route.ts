import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { runAsk, type Turn } from "@/app/solutions/01-ai-workspace/_lib/ask";
import { resolveRole } from "@/app/solutions/01-ai-workspace/_lib/server";
import { SCOPES, type Attachment, type ScopeKey } from "@/app/solutions/01-ai-workspace/_lib/shared";

interface Body {
  question?: string;
  history?: Turn[];
  role?: string;
  scope?: ScopeKey;
  attachment?: Attachment | null;
}

/** Cited question answering over the MNDA knowledge base, filtered by scope and the user's access level. */
export async function POST(req: Request) {
  const body = await readBody<Body>(req);
  const { modelKey, lang } = getPrefs(req, body as Record<string, unknown>);
  const question = (body.question ?? "").trim();
  if (!question) return new Response("question is required", { status: 400 });
  const history = Array.isArray(body.history)
    ? body.history.filter((h) => h && (h.role === "user" || h.role === "assistant") && typeof h.content === "string").slice(-6)
    : [];
  const attachment =
    body.attachment && typeof body.attachment.text === "string" && body.attachment.text.trim()
      ? { name: String(body.attachment.name || "document"), text: body.attachment.text.slice(0, 60000), kind: body.attachment.kind ?? "text" }
      : null;
  return eventStream(
    req,
    async (emit) => {
      await runAsk(emit, {
        question,
        history,
        role: resolveRole(body.role),
        scope: SCOPES.some((s) => s.key === body.scope) ? (body.scope as ScopeKey) : "all",
        attachment,
        lang,
        modelKey,
      });
    },
    { modelKey },
  );
}
