import { complete } from "@/lib/ai/client";
import { getPrefs } from "@/lib/ai/request";

/** Reviewer aid: translate a drafted message so the approver can read it in the UI language. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { text?: string; to?: "en" | "ar" };
  const { modelKey } = getPrefs(req, body);
  if (!body.text) return new Response("text required", { status: 400 });
  const to = body.to === "ar" ? "formal Arabic" : "English";
  const text = await complete(
    `Translate the message into ${to}. Keep case numbers, dates, phone numbers and line breaks. Output only the translation.`,
    body.text,
    { modelKey, maxTokens: 900, solution: "05-case-operations", task: "translate" },
  );
  return Response.json({ text });
}
