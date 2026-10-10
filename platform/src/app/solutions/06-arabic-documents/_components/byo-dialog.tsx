"use client";

import { useState } from "react";
import { FilePlus2, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FileDrop, type DroppedFile } from "@/components/narvo/file-drop";
import { useL, usePrefs } from "@/lib/i18n";
import type { QueueDoc } from "../_lib/shared";

/** Bring your own: paste text, upload .md/.txt, or photograph a page (vision OCR). */
export function ByoDialog({ open, onOpenChange, onAdded }: { open: boolean; onOpenChange: (v: boolean) => void; onAdded: (d: QueueDoc) => void }) {
  const L = useL();
  const { modelKey, lang } = usePrefs();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [dir, setDir] = useState<"auto" | "ar" | "en">("auto");
  const [ocr, setOcr] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFiles(files: DroppedFile[]) {
    const f = files[0];
    if (!f) return;
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
    if (f.text != null) {
      setText(f.text);
      return;
    }
    if (f.dataUrl && f.type.startsWith("image/")) {
      setOcr(f.name);
      setPreview(f.dataUrl);
      try {
        const res = await fetch("/api/solutions/06-arabic-documents/ocr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl: f.dataUrl, name: f.name, modelKey, lang }),
        });
        if (!res.ok) throw new Error(await res.text());
        const j = (await res.json()) as { text: string; lang: "ar" | "en"; ms: number };
        setText(j.text);
        setDir(j.lang);
        toast.success(L({ en: "Page read with the vision model", ar: "قُرئت الصفحة بنموذج الرؤية" }), { description: `${j.text.length.toLocaleString()} chars · ${(j.ms / 1000).toFixed(1)} s` });
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setOcr(null);
      }
      return;
    }
    toast.error(L({ en: "Use .md, .txt or an image of a page", ar: "استخدم ملف .md أو .txt أو صورة صفحة" }));
  }

  async function add() {
    setBusy(true);
    try {
      const res = await fetch("/api/solutions/06-arabic-documents/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, text, source: dir === "auto" ? undefined : dir }),
      });
      if (!res.ok) throw new Error(await res.text());
      const j = (await res.json()) as { doc: QueueDoc };
      onAdded(j.doc);
      onOpenChange(false);
      setTitle("");
      setText("");
      setPreview(null);
      setDir("auto");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const arShare = (text.match(/[؀-ۿ]/g)?.length ?? 0) / Math.max(1, text.match(/\p{L}/gu)?.length ?? 1);
  const detected = dir === "auto" ? (arShare > 0.5 ? "ar" : "en") : dir;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[720px] sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle className="font-light tracking-tight">{L({ en: "Bring your own document", ar: "أضف مستندك" })}</DialogTitle>
          <DialogDescription className="text-[12.5px]">
            {L({
              en: "Paste text, upload a .md / .txt file, or a photo of a printed page. It goes through the same glossary-constrained pipeline.",
              ar: "الصق النص أو ارفع ملف .md / .txt أو صورة لصفحة مطبوعة. يمر بنفس مسار الترجمة المقيد بالمسرد.",
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} dir="auto" placeholder={L({ en: "Title", ar: "العنوان" })} className="h-8 text-[13px]" />
            <div className="inline-flex items-center rounded-lg border border-border bg-surface p-0.5">
              {(["auto", "ar", "en"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDir(d)}
                  className={`h-7 rounded-md px-2.5 text-[12px] font-medium ${dir === d ? "bg-foreground text-background" : "text-muted-foreground"}`}
                >
                  {d === "auto" ? L({ en: "Auto", ar: "تلقائي" }) : d === "ar" ? "AR → EN" : "EN → AR"}
                </button>
              ))}
            </div>
          </div>
          <FileDrop compact accept="image/*,.md,.txt" onFiles={onFiles} label={L({ en: "Upload a file or a photo of a page", ar: "ارفع ملفاً أو صورة صفحة" })} />
          {ocr && (
            <div className="flex items-center gap-2 rounded-md border border-ai/30 bg-ai-soft/60 px-3 py-2 text-[12px]">
              <LoaderCircle className="size-3.5 animate-spin text-ai" />
              {L({ en: `Reading ${ocr} — headings, lists and tables are kept`, ar: `جارٍ قراءة ${ocr} — مع الحفاظ على العناوين والقوائم والجداول` })}
            </div>
          )}
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <Textarea value={text} onChange={(e) => setText(e.target.value)} dir="auto" rows={12} className="font-mono text-[12px] leading-relaxed" placeholder={L({ en: "…or paste the text here (markdown tables are preserved)", ar: "…أو الصق النص هنا (تُحفظ جداول markdown)" })} />
            {preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" className="h-[250px] w-[170px] rounded border border-border object-cover object-top" />
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11.5px] text-muted-foreground">
              {text.trim()
                ? `${detected === "ar" ? "العربية → English" : "English → العربية"} · ${text.length.toLocaleString()} ${L({ en: "chars", ar: "حرف" })}`
                : ""}
            </span>
            <Button onClick={add} disabled={busy || text.trim().length < 20 || !!ocr}>
              {busy ? <LoaderCircle className="animate-spin" /> : <FilePlus2 />}
              {L({ en: "Add to queue", ar: "إضافة إلى القائمة" })}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
