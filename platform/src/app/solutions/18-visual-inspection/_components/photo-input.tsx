"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, RefreshCw, Upload } from "lucide-react";
import { FileDrop } from "@/components/narvo/file-drop";
import { Button } from "@/components/ui/button";
import { useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { captureFrame, downscale } from "./image-utils";
import { Segmented } from "./ui";

/** Live camera capture (getUserMedia) or upload → downscaled JPEG data URL. */
export function PhotoInput({
  value,
  onChange,
  className,
  defaultMode = "camera",
}: {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  className?: string;
  defaultMode?: "camera" | "upload";
}) {
  const L = useL();
  const [mode, setMode] = useState<"camera" | "upload">(defaultMode);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (mode !== "camera" || value) return;
    let cancelled = false;
    setError(null);
    setReady(false);
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera not available in this browser");
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } }, audio: false });
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = s;
        if (video.current) {
          video.current.srcObject = s;
          await video.current.play().catch(() => {});
          setReady(true);
        }
      } catch (e) {
        setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
  }, [mode, value]);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <Segmented
          value={mode}
          onChange={(m) => {
            onChange(null);
            setMode(m);
          }}
          options={[
            { value: "camera", label: <span className="inline-flex items-center gap-1"><Camera className="size-3" />{L({ en: "Camera", ar: "الكاميرا" })}</span> },
            { value: "upload", label: <span className="inline-flex items-center gap-1"><Upload className="size-3" />{L({ en: "Upload", ar: "تحميل" })}</span> },
          ]}
        />
        {value && (
          <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={() => onChange(null)}>
            <RefreshCw /> {L({ en: "Retake", ar: "إعادة" })}
          </Button>
        )}
      </div>
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="" className="max-h-[320px] w-full rounded-md border border-border object-contain bg-muted" />
      ) : mode === "camera" ? (
        <div className="relative overflow-hidden rounded-md border border-border bg-foreground/90">
          <video ref={video} playsInline muted className="aspect-[4/3] w-full object-cover" />
          {error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-[12px] text-background/80">
              <CameraOff className="size-5" />
              {L({ en: "Camera unavailable — use Upload instead.", ar: "الكاميرا غير متاحة — استخدم التحميل." })}
              <span className="text-[11px] opacity-70">{error}</span>
            </div>
          ) : (
            <div className="absolute inset-x-0 bottom-3 flex justify-center">
              <button
                type="button"
                disabled={!ready}
                onClick={() => video.current && onChange(captureFrame(video.current))}
                className="flex size-12 items-center justify-center rounded-full border-4 border-background/80 bg-background/30 backdrop-blur transition hover:bg-background/50 disabled:opacity-40"
                aria-label="Capture"
              >
                <span className="size-6 rounded-full bg-background" />
              </button>
            </div>
          )}
        </div>
      ) : (
        <FileDrop
          accept="image/*"
          label={L({ en: "Drop a site photo", ar: "أسقط صورة الموقع" })}
          hint={L({ en: "JPG or PNG — resized to 1,280 px on this machine", ar: "JPG أو PNG — يُصغَّر إلى 1,280 بكسل على هذا الجهاز" })}
          onFiles={async (files) => {
            const f = files[0];
            if (f?.dataUrl) onChange(await downscale(f.dataUrl));
          }}
        />
      )}
    </div>
  );
}
