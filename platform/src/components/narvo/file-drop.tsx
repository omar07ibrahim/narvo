"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { useL } from "@/lib/i18n";

export interface DroppedFile {
  name: string;
  type: string;
  size: number;
  /** data: URL for images/PDF/audio */
  dataUrl?: string;
  /** text content for .txt/.md/.csv/.json */
  text?: string;
}

const TEXT_EXT = /\.(txt|md|csv|json|eml)$/i;

async function read(file: File): Promise<DroppedFile> {
  const base = { name: file.name, type: file.type, size: file.size };
  if (TEXT_EXT.test(file.name) || file.type.startsWith("text/")) {
    return { ...base, text: await file.text() };
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  return { ...base, dataUrl };
}

/** Drag-and-drop / click to add your own document, photo or file. */
export function FileDrop({
  onFiles,
  accept = "image/*,.pdf,.txt,.md,.csv,.json",
  multiple,
  label,
  hint,
  className,
  compact,
}: {
  onFiles: (files: DroppedFile[]) => void;
  accept?: string;
  multiple?: boolean;
  label?: string;
  hint?: string;
  className?: string;
  compact?: boolean;
}) {
  const L = useL();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  async function handle(list: FileList | null) {
    if (!list?.length) return;
    const files = await Promise.all(Array.from(list).map(read));
    onFiles(files);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => e.key === "Enter" && input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        handle(e.dataTransfer.files);
      }}
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-border-strong bg-surface text-start transition-colors hover:border-ai/50 hover:bg-ai-soft/40",
        compact ? "px-3 py-2" : "px-4 py-4",
        over && "border-ai bg-ai-soft/60",
        className,
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
        <Upload className="size-3.5" />
      </span>
      <span className="min-w-0">
        <span className="block text-[12.5px] font-medium">{label ?? L({ en: "Add your own file", ar: "أضف ملفك الخاص" })}</span>
        <span className="block text-[11px] text-muted-foreground">
          {hint ?? L({ en: "Drop a document or photo — it is processed on your own servers", ar: "اسحب مستنداً أو صورة — تتم المعالجة على خوادم الجهة" })}
        </span>
      </span>
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          handle(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
