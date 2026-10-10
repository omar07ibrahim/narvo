"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useL, usePrefs } from "@/lib/i18n";

/* ───────────── Recording → 16 kHz mono WAV (universal for Whisper & omni models) ───────────── */

async function blobToWav(blob: Blob): Promise<string> {
  const arrayBuf = await blob.arrayBuffer();
  const ctx = new AudioContext();
  const decoded = await ctx.decodeAudioData(arrayBuf);
  const targetRate = 16000;
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * targetRate), targetRate);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  await ctx.close();
  const pcm = rendered.getChannelData(0);
  const buffer = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(buffer);
  const write = (o: number, s: string) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  write(0, "RIFF");
  view.setUint32(4, 36 + pcm.length * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, targetRate, true);
  view.setUint32(28, targetRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, pcm.length * 2, true);
  let o = 44;
  for (let i = 0; i < pcm.length; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export interface Transcript {
  text: string;
  language?: string;
  ms?: number;
}

/** Transcribe base64 WAV via the platform speech endpoint (Whisper on-device, omni model in dev). */
export async function transcribe(wavBase64: string, langHint?: "en" | "ar"): Promise<Transcript> {
  const res = await fetch("/api/voice/transcribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audio: wavBase64, format: "wav", lang: langHint }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** Push-to-talk button with live level meter. Calls onTranscript with the recognised text. */
export function VoiceButton({
  onTranscript,
  onError,
  className,
  size = "lg",
  disabled,
}: {
  onTranscript: (t: Transcript) => void;
  onError?: (msg: string) => void;
  className?: string;
  size?: "md" | "lg";
  disabled?: boolean;
}) {
  const L = useL();
  const { lang } = usePrefs();
  const [state, setState] = useState<"idle" | "recording" | "transcribing">("idle");
  const [level, setLevel] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const raf = useRef<number>(0);
  const stream = useRef<MediaStream | null>(null);

  const stopMeter = () => {
    cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    setLevel(0);
  };

  useEffect(() => () => stopMeter(), []);

  const start = useCallback(async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      stream.current = s;
      const ac = new AudioContext();
      const analyser = ac.createAnalyser();
      analyser.fftSize = 512;
      ac.createMediaStreamSource(s).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
        setLevel(Math.min(1, peak / 60));
        raf.current = requestAnimationFrame(tick);
      };
      tick();
      const r = new MediaRecorder(s);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = async () => {
        stopMeter();
        ac.close();
        setState("transcribing");
        try {
          const blob = new Blob(chunks.current, { type: r.mimeType });
          const wav = await blobToWav(blob);
          const t = await transcribe(wav, lang);
          onTranscript(t);
        } catch (e) {
          onError?.((e as Error).message);
        } finally {
          setState("idle");
        }
      };
      r.start();
      rec.current = r;
      setState("recording");
    } catch (e) {
      onError?.((e as Error).message);
      setState("idle");
    }
  }, [lang, onError, onTranscript]);

  const stop = useCallback(() => rec.current?.state === "recording" && rec.current.stop(), []);

  const dim = size === "lg" ? "size-16" : "size-11";
  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <button
        type="button"
        disabled={disabled || state === "transcribing"}
        onClick={state === "recording" ? stop : start}
        className={cn(
          "relative flex items-center justify-center rounded-full transition-all disabled:opacity-50",
          dim,
          state === "recording" ? "bg-danger text-white" : "bg-foreground text-background hover:scale-[1.03]",
        )}
        aria-label={state === "recording" ? "Stop recording" : "Start recording"}
      >
        {state === "recording" && (
          <span
            className="absolute inset-0 rounded-full bg-danger/30"
            style={{ transform: `scale(${1 + level * 0.65})`, transition: "transform 80ms linear" }}
          />
        )}
        <span className="relative">
          {state === "recording" ? (
            <Square className="size-5 fill-current" />
          ) : state === "transcribing" ? (
            <LoaderCircle className="size-5 animate-spin" />
          ) : (
            <Mic className={size === "lg" ? "size-6" : "size-4.5"} />
          )}
        </span>
      </button>
      <span className="text-[11px] text-muted-foreground">
        {state === "recording"
          ? L({ en: "Listening… tap to send", ar: "جارٍ الاستماع… اضغط للإرسال" })
          : state === "transcribing"
            ? L({ en: "Transcribing on-device…", ar: "جارٍ التفريغ على الجهاز…" })
            : L({ en: "Tap to speak", ar: "اضغط للتحدث" })}
      </span>
    </div>
  );
}

/* ───────────── Speech output (local system voices, works offline on macOS) ───────────── */

export function speak(text: string, lang: "en" | "ar" = /[؀-ۿ]/.test(text) ? "ar" : "en", onEnd?: () => void) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const clean = text.replace(/\[\d+\]/g, "").replace(/[*_#>`]/g, "");
  const u = new SpeechSynthesisUtterance(clean);
  const voices = window.speechSynthesis.getVoices();
  const preferred =
    lang === "ar"
      ? voices.find((v) => /^ar/i.test(v.lang) && /majed|maged|tarik|laila|hoda|naayf/i.test(v.name)) ?? voices.find((v) => /^ar/i.test(v.lang))
      : voices.find((v) => /^en-(GB|US)/i.test(v.lang) && /samantha|daniel|serena|google|natural/i.test(v.name)) ??
        voices.find((v) => /^en/i.test(v.lang));
  if (preferred) u.voice = preferred;
  u.lang = preferred?.lang ?? (lang === "ar" ? "ar-SA" : "en-GB");
  u.rate = lang === "ar" ? 0.98 : 1.02;
  if (onEnd) u.onend = onEnd;
  window.speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if (typeof window !== "undefined") window.speechSynthesis?.cancel();
}
