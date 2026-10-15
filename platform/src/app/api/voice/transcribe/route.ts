import { chat } from "@/lib/ai/client";
import { getProvider, resolveModelId } from "@/lib/ai/config";
import { recordCall } from "@/lib/ai/telemetry";

/**
 * Speech-to-text.
 *  - Private mode: OpenAI-compatible Whisper server on your own servers
 *    (LOCAL_STT_BASE_URL, e.g. mlx-whisper / speaches / whisper.cpp server).
 *  - Development: Qwen omni model with audio input via OpenRouter.
 */
export async function POST(req: Request) {
  const body = (await req.json()) as { audio: string; format?: string; lang?: "en" | "ar" };
  if (!body.audio) return new Response("audio (base64) required", { status: 400 });
  const started = Date.now();

  if (getProvider() === "local") {
    const base = (process.env.LOCAL_STT_BASE_URL || "http://127.0.0.1:8090/v1").replace(/\/$/, "");
    const form = new FormData();
    form.append("file", new Blob([Buffer.from(body.audio, "base64")], { type: "audio/wav" }), "speech.wav");
    form.append("model", resolveModelId("audio"));
    if (body.lang) form.append("language", body.lang);
    form.append("response_format", "json");
    const key = process.env.LOCAL_STT_API_KEY;
    const res = await fetch(`${base}/audio/transcriptions`, { method: "POST", body: form, headers: key ? { Authorization: `Bearer ${key}` } : undefined });
    if (!res.ok) return new Response(`Local speech server error: ${await res.text()}`, { status: 502 });
    const data = await res.json();
    recordCall({
      solution: "voice",
      task: "transcribe",
      model: resolveModelId("audio"),
      provider: "local",
      promptTokens: 0,
      completionTokens: 0,
      ms: Date.now() - started,
      egressBytes: 0,
      ok: true,
    });
    return Response.json({ text: (data.text ?? "").trim(), language: data.language, ms: Date.now() - started });
  }

  const r = await chat({
    role: "audio",
    temperature: 0,
    maxTokens: 600,
    solution: "voice",
    task: "transcribe",
    messages: [
      {
        role: "system",
        content:
          "You are a speech-to-text engine. Transcribe the audio verbatim in the language spoken (Arabic in Arabic script, English in Latin script, keep code-switching as spoken). Output only the transcript text — no quotes, no commentary.",
      },
      {
        role: "user",
        content: [
          { type: "input_audio", input_audio: { data: body.audio, format: "wav" } },
          { type: "text", text: "Transcribe this recording." },
        ],
      },
    ],
  });
  const text = r.content.replace(/^["“]|["”]$/g, "").trim();
  return Response.json({ text, language: /[؀-ۿ]/.test(text) ? "ar" : "en", ms: Date.now() - started });
}
