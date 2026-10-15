"use client";

import { useCallback, useState } from "react";
import { FileText, Image as ImageIcon, LoaderCircle, X } from "lucide-react";
import { toast } from "sonner";
import { FileDrop, type DroppedFile } from "@/components/narvo/file-drop";
import { useL, usePrefs } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Attachment } from "../_lib/shared";

/** "Ask your document": text files are read in the browser; page images are transcribed by the vision model. */
export function useAttachment() {
  const { modelKey, lang } = usePrefs();
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const onFiles = useCallback(
    async (files: DroppedFile[]) => {
      const f = files[0];
      if (!f) return;
      if (f.text != null) {
        setAttachment({ name: f.name, text: f.text, kind: "text" });
        setPreview(null);
        return;
      }
      if (f.dataUrl && f.type.startsWith("image/")) {
        setBusy(f.name);
        setPreview(f.dataUrl);
        try {
          const res = await fetch("/api/solutions/01-ai-workspace/ingest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: f.name, dataUrl: f.dataUrl, modelKey, lang }),
          });
          if (!res.ok) throw new Error((await res.text()) || res.statusText);
          const j = (await res.json()) as { text: string; ms: number };
          setAttachment({ name: f.name, text: j.text, kind: "image" });
          toast.success(lang === "ar" ? "تمت قراءة الصفحة" : "Page read", {
            description: `${j.text.length.toLocaleString()} ${lang === "ar" ? "حرفاً" : "characters"} · ${(j.ms / 1000).toFixed(1)} ${lang === "ar" ? "ث" : "s"}`,
          });
        } catch (e) {
          setPreview(null);
          toast.error(lang === "ar" ? "تعذّرت قراءة الصورة" : "Could not read the image", { description: (e as Error).message });
        } finally {
          setBusy(null);
        }
        return;
      }
      toast.error(lang === "ar" ? "صيغة غير مدعومة" : "Unsupported file", {
        description: lang === "ar" ? "استخدم ملف .md أو .txt أو صورة لصفحة" : "Use a .md or .txt file, or an image of a page",
      });
    },
    [modelKey, lang],
  );

  const clear = useCallback(() => {
    setAttachment(null);
    setPreview(null);
  }, []);

  return { attachment, busy, preview, onFiles, clear };
}

export type AttachmentState = ReturnType<typeof useAttachment>;

export function AttachmentSlot({ state, className, compact = true }: { state: AttachmentState; className?: string; compact?: boolean }) {
  const L = useL();
  if (state.busy)
    return (
      <div className={cn("flex items-center gap-2.5 rounded-md border border-ai/30 bg-ai-soft/60 px-3 py-2", className)}>
        <LoaderCircle className="size-4 animate-spin text-ai" />
        <div className="min-w-0 text-[12px]">
          <div className="truncate font-medium">{state.busy}</div>
          <div className="text-muted-foreground">{L({ en: "Reading the page with the vision model…", ar: "قراءة الصفحة بنموذج الرؤية…" })}</div>
        </div>
      </div>
    );
  if (state.attachment)
    return (
      <div className={cn("flex items-center gap-2.5 rounded-md border border-border bg-surface px-3 py-2", className)}>
        {state.preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={state.preview} alt="" className="size-8 shrink-0 rounded border border-border object-cover" />
        ) : (
          <span className="flex size-8 shrink-0 items-center justify-center rounded border border-border bg-card text-muted-foreground">
            {state.attachment.kind === "image" ? <ImageIcon className="size-3.5" /> : <FileText className="size-3.5" />}
          </span>
        )}
        <div className="min-w-0 flex-1 text-[12px]">
          <div className="truncate font-medium" dir="auto">
            {state.attachment.name}
          </div>
          <div className="text-muted-foreground">
            {L({ en: "Your document · used as a citable source", ar: "مستندك · يُستخدم مصدراً قابلاً للاستشهاد" })} ·{" "}
            <span className="num">{state.attachment.text.length.toLocaleString()}</span> {L({ en: "chars", ar: "حرف" })}
          </div>
        </div>
        <button type="button" onClick={state.clear} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Remove">
          <X className="size-3.5" />
        </button>
      </div>
    );
  return (
    <FileDrop
      compact={compact}
      className={className}
      accept="image/*,.txt,.md"
      onFiles={state.onFiles}
      label={L({ en: "Ask your document", ar: "اسأل مستندك" })}
      hint={L({ en: "Drop a .md / .txt file or a photo of a page — read on your own servers", ar: "أضف ملف .md أو .txt أو صورة صفحة — تتم القراءة على خوادم الجهة" })}
    />
  );
}
