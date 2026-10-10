"use client";

import { Children, cloneElement, isValidElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import type { Citation } from "@/lib/ai/events";
import { cn } from "@/lib/utils";

/**
 * Markdown renderer for model output. Turns citation markers like [3] into interactive chips
 * that show the exact source passage on hover.
 */

function CitationChip({ n, citation, onClick }: { n: number; citation?: Citation; onClick?: (n: number) => void }) {
  const chip = (
    <button
      type="button"
      onClick={() => onClick?.(n)}
      className="mx-0.5 inline-flex h-[17px] min-w-[17px] -translate-y-px items-center justify-center rounded-[4px] border border-ai/25 bg-ai-soft px-1 align-middle font-mono text-[10px] font-medium text-ai transition-colors hover:bg-ai hover:text-ai-foreground"
    >
      {n}
    </button>
  );
  if (!citation) return chip;
  return (
    <HoverCard openDelay={120} closeDelay={60}>
      <HoverCardTrigger asChild>{chip}</HoverCardTrigger>
      <HoverCardContent className="w-96 p-3" side="top">
        <div className="label-caps mb-1">
          [{n}] {citation.ref ?? citation.docId}
        </div>
        <div className="text-[12.5px] font-medium leading-snug">{citation.title}</div>
        {citation.section && <div className="mt-0.5 text-[11px] text-muted-foreground">§ {citation.section}</div>}
        <p className="mt-2 line-clamp-6 border-s-2 border-ai/40 ps-2 text-[11.5px] leading-relaxed text-muted-foreground">
          {citation.quote}
        </p>
      </HoverCardContent>
    </HoverCard>
  );
}

function withCitations(children: ReactNode, citations?: Citation[], onCite?: (n: number) => void): ReactNode {
  return Children.map(children, (child) => {
    if (typeof child === "string") {
      const parts = child.split(/(\[\d+\](?:\s*\[\d+\])*)/g);
      if (parts.length === 1) return child;
      return parts.map((p, i) => {
        const nums = Array.from(p.matchAll(/\[(\d+)\]/g)).map((m) => Number(m[1]));
        if (nums.length && /^\[\d+\](\s*\[\d+\])*$/.test(p)) {
          return (
            <span key={i} className="whitespace-nowrap">
              {nums.map((n) => (
                <CitationChip key={n} n={n} citation={citations?.find((c) => c.n === n)} onClick={onCite} />
              ))}
            </span>
          );
        }
        return p;
      });
    }
    if (isValidElement<{ children?: ReactNode }>(child) && child.props.children) {
      return cloneElement(child, undefined, withCitations(child.props.children, citations, onCite));
    }
    return child;
  });
}

export function Markdown({
  children,
  citations,
  onCite,
  className,
  streaming,
}: {
  children: string;
  citations?: Citation[];
  onCite?: (n: number) => void;
  className?: string;
  streaming?: boolean;
}) {
  const wrap = (Tag: "p" | "li" | "td" | "th" | "strong" | "em") =>
    function Wrapped({ children: c }: { children?: ReactNode }) {
      return <Tag>{withCitations(c, citations, onCite)}</Tag>;
    };
  const dir = /[؀-ۿ]/.test(children.slice(0, 200)) ? "rtl" : undefined;
  return (
    <div className={cn("prose-narvo", className)} dir={dir}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ p: wrap("p"), li: wrap("li"), td: wrap("td"), th: wrap("th"), strong: wrap("strong"), em: wrap("em") }}
      >
        {children}
      </ReactMarkdown>
      {streaming && <span className="ms-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-ai align-middle" />}
    </div>
  );
}
