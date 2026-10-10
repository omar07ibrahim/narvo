"use client";

import { useState } from "react";
import { Minus, Plus, Maximize2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Markdown } from "./markdown";

/**
 * Shows a source document: scanned page images (PNG/JPG) or Markdown text,
 * with zoom and a full-screen view.
 */
export function DocumentViewer({
  src,
  markdown,
  title,
  className,
  height = 520,
}: {
  src?: string | string[];
  markdown?: string;
  title?: string;
  className?: string;
  height?: number;
}) {
  const [zoom, setZoom] = useState(1);
  const [full, setFull] = useState(false);
  const pages = Array.isArray(src) ? src : src ? [src] : [];

  const body = (z: number) =>
    pages.length ? (
      <div className="flex flex-col items-center gap-4 p-4">
        {pages.map((p, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={p + i}
            src={p}
            alt={title ? `${title} — page ${i + 1}` : `Page ${i + 1}`}
            className="rounded-sm border border-border bg-white shadow-[0_1px_8px_rgba(0,0,0,0.06)]"
            style={{ width: `${z * 100}%`, maxWidth: "none" }}
          />
        ))}
      </div>
    ) : (
      <div className="p-5" style={{ fontSize: `${z}em` }}>
        <Markdown>{markdown ?? ""}</Markdown>
      </div>
    );

  return (
    <div className={cn("relative overflow-hidden rounded-md border border-border bg-muted/40", className)}>
      <div className="absolute end-2 top-2 z-10 flex items-center gap-1 rounded-md border border-border bg-card/90 p-0.5 backdrop-blur">
        <Button variant="ghost" size="icon-xs" onClick={() => setZoom((z) => Math.max(0.5, z - 0.15))}>
          <Minus />
        </Button>
        <span className="num w-9 text-center text-[10.5px] text-muted-foreground">{Math.round(zoom * 100)}%</span>
        <Button variant="ghost" size="icon-xs" onClick={() => setZoom((z) => Math.min(2.2, z + 0.15))}>
          <Plus />
        </Button>
        <Button variant="ghost" size="icon-xs" onClick={() => setFull(true)}>
          <Maximize2 />
        </Button>
      </div>
      <div className="scrollbar-thin overflow-auto" style={{ height }}>
        {body(zoom)}
      </div>
      <Dialog open={full} onOpenChange={setFull}>
        <DialogContent className="max-h-[92vh] max-w-[min(1100px,94vw)] overflow-hidden p-0 sm:max-w-[min(1100px,94vw)]">
          <DialogTitle className="border-b border-border px-4 py-3 text-sm font-medium">{title ?? "Document"}</DialogTitle>
          <div className="scrollbar-thin max-h-[80vh] overflow-auto bg-muted/40">{body(1)}</div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
