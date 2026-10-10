"use client";

import { FileText } from "lucide-react";
import type { Citation } from "@/lib/ai/events";
import { cn } from "@/lib/utils";
import { useL } from "@/lib/i18n";

export function SourceList({
  citations,
  highlight,
  className,
  usedOnly,
  text,
}: {
  citations: Citation[];
  highlight?: number | null;
  className?: string;
  /** Only show sources whose marker appears in `text` */
  usedOnly?: boolean;
  text?: string;
}) {
  const L = useL();
  const used = new Set(Array.from((text ?? "").matchAll(/\[(\d+)\]/g)).map((m) => Number(m[1])));
  const list = usedOnly && text ? citations.filter((c) => used.has(c.n)) : citations;
  if (!list.length)
    return (
      <p className={cn("text-[12px] text-muted-foreground", className)}>
        {L({ en: "Sources appear here with the exact passage used.", ar: "تظهر المصادر هنا مع المقطع المستخدم بالضبط." })}
      </p>
    );
  return (
    <ul className={cn("space-y-2", className)}>
      {list.map((c) => (
        <li
          key={c.n}
          id={`src-${c.n}`}
          className={cn(
            "rounded-md border border-border bg-surface p-2.5 transition-colors",
            highlight === c.n && "border-ai/50 bg-ai-soft",
            text && !used.has(c.n) && "opacity-55",
          )}
        >
          <div className="flex items-start gap-2">
            <span className="mt-px inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-[4px] border border-ai/25 bg-ai-soft px-1 font-mono text-[10px] text-ai">
              {c.n}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[12px] font-medium leading-snug">
                <FileText className="size-3 shrink-0 text-muted-foreground" />
                <span className="truncate">{c.title}</span>
              </div>
              <div className="mt-0.5 truncate font-mono text-[10.5px] text-muted-foreground">
                {c.ref ?? c.docId}
                {c.section ? ` · § ${c.section}` : ""}
              </div>
              <p className="mt-1.5 line-clamp-3 text-[11.5px] leading-relaxed text-muted-foreground" dir="auto">
                {c.quote}
              </p>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
