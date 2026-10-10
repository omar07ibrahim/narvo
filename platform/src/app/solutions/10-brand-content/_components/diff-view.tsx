"use client";

import { useMemo } from "react";
import { useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { diffStats, wordDiff } from "../_lib/diff";
import type { Lang } from "../_lib/types";

export function composeText(p: { headline: string | null; body: string; hashtags: string[] }) {
  return [p.headline ? p.headline : null, p.body, p.hashtags.length ? p.hashtags.join(" ") : null].filter(Boolean).join("\n\n");
}

/** Word-level diff, hairline style: removed words struck through in red, inserted words in green. */
export function DiffView({ before, after, lang, className }: { before: string; after: string; lang: Lang; className?: string }) {
  const L = useL();
  const parts = useMemo(() => wordDiff(before, after), [before, after]);
  const stats = diffStats(parts);
  return (
    <div className={cn("rounded-md border border-border", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <span className="label-caps !text-[9.5px]">{L({ en: "Word-level diff", ar: "الفروق على مستوى الكلمات" })}</span>
        <span className="num text-[11px]">
          <span className="text-success">+{stats.added}</span>
          <span className="mx-1.5 text-faint">/</span>
          <span className="text-danger">−{stats.removed}</span>
          <span className="ms-1.5 text-muted-foreground">{L({ en: "words", ar: "كلمة" })}</span>
        </span>
      </div>
      <div dir={lang === "ar" ? "rtl" : "ltr"} className="px-3 py-2.5 text-[13px] leading-[1.85] whitespace-pre-wrap">
        {parts.map((p, i) =>
          p.type === "same" ? (
            <span key={i}>{p.text}</span>
          ) : p.type === "del" ? (
            <del key={i} className="rounded-[2px] bg-danger-soft/70 text-danger/90 decoration-danger/60">
              {p.text}
            </del>
          ) : (
            <ins key={i} className="rounded-[2px] bg-success-soft text-success no-underline">
              {p.text}
            </ins>
          ),
        )}
      </div>
    </div>
  );
}
