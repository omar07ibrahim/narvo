import { chat } from "@/lib/ai/client";
import { getPrefs } from "@/lib/ai/request";
import { SOLUTION } from "@/app/solutions/01-ai-workspace/_lib/server";

/**
 * "Ask your document": read an uploaded page image with the multimodal model and return its text as
 * markdown, so the session can use it as a citable source.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { name?: string; dataUrl?: string; modelKey?: string; lang?: string };
  const { modelKey } = getPrefs(req, body as Record<string, unknown>);
  if (!body.dataUrl || !/^data:image\/(png|jpe?g|webp|gif);base64,/.test(body.dataUrl)) {
    return new Response("An image (PNG, JPG or WEBP) is required", { status: 400 });
  }
  if (body.dataUrl.length > 14_000_000) return new Response("Image is too large (max ~10 MB)", { status: 413 });
  try {
    const r = await chat({
      messages: [
        {
          role: "system",
          content:
            "You transcribe documents. Return the full text of the page exactly as written, in its original language(s), as clean markdown: " +
            "headings as '#'/'##', numbered and bulleted lists preserved, tables as markdown tables, numbers/dates/reference numbers verbatim. " +
            "Do not summarise, translate or add commentary. If something is illegible write [illegible].",
        },
        {
          role: "user",
          content: [
            { type: "text", text: `Transcribe this page (${body.name ?? "uploaded image"}).` },
            { type: "image_url", image_url: { url: body.dataUrl } },
          ],
        },
      ],
      modelKey,
      temperature: 0,
      maxTokens: 2500,
      solution: SOLUTION,
      task: "ingest.ocr",
    });
    const text = r.content.replace(/^```(?:markdown|md)?\s*/i, "").replace(/```\s*$/i, "").trim();
    if (!text) return new Response("The model could not read any text on this image", { status: 422 });
    return Response.json({ text, ms: r.ms, model: r.model, chars: text.length });
  } catch (e) {
    return new Response((e as Error).message, { status: 502 });
  }
}
