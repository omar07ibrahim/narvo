import { chat } from "@/lib/ai/client";
import { getPrefs } from "@/lib/ai/request";
import { SOLUTION } from "@/app/solutions/06-arabic-documents/_lib/server";

/** Read a photographed / scanned page with the vision model, keeping headings, lists and tables as markdown. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { dataUrl?: string; name?: string; modelKey?: string };
  const { modelKey } = getPrefs(req, body as Record<string, unknown>);
  if (!body.dataUrl || !/^data:image\/(png|jpe?g|webp|gif);base64,/.test(body.dataUrl)) return new Response("An image is required", { status: 400 });
  if (body.dataUrl.length > 14_000_000) return new Response("Image too large (max ~10 MB)", { status: 413 });
  try {
    const r = await chat({
      messages: [
        {
          role: "system",
          content:
            "You are an OCR engine for Arabic and English official documents. Transcribe the page exactly, in its original language, as markdown: " +
            "headings with '#', numbered and bulleted lists preserved, tables as markdown tables with the same columns, numbers, dates and reference numbers verbatim (Western digits as printed). " +
            "No translation, no summary, no commentary. Mark unreadable words as [illegible].",
        },
        {
          role: "user",
          content: [
            { type: "text", text: `Transcribe this page${body.name ? ` (${body.name})` : ""}.` },
            { type: "image_url", image_url: { url: body.dataUrl } },
          ],
        },
      ],
      modelKey,
      temperature: 0,
      maxTokens: 3000,
      solution: SOLUTION,
      task: "ocr",
    });
    const text = r.content.replace(/^```(?:markdown|md)?\s*/i, "").replace(/```\s*$/i, "").trim();
    if (!text) return new Response("No text could be read from the image", { status: 422 });
    const ar = (text.match(/[؀-ۿ]/g)?.length ?? 0) / Math.max(1, text.match(/\p{L}/gu)?.length ?? 1);
    return Response.json({ text, lang: ar > 0.5 ? "ar" : "en", ms: r.ms });
  } catch (e) {
    return new Response((e as Error).message, { status: 502 });
  }
}
