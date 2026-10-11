"use client";

import { useRef, useState } from "react";
import { usePrefs } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Finding, Taxonomy } from "../_lib/types";
import { SEV_COLOR } from "./ui";

/**
 * Inspection photo with approximate finding boxes (normalised 0–1). Hover a box to highlight the finding;
 * in draw mode the reviewer drags a rectangle to mark a missed defect.
 */
export function PhotoViewer({
  src,
  alt,
  findings,
  tax,
  showBoxes,
  activeId,
  onHover,
  onSelect,
  drawMode,
  onDraw,
  draft,
  className,
}: {
  src: string;
  alt: string;
  findings: Finding[];
  tax: Taxonomy;
  showBoxes: boolean;
  activeId: string | null;
  onHover: (id: string | null) => void;
  onSelect?: (id: string) => void;
  drawMode?: boolean;
  onDraw?: (box: [number, number, number, number]) => void;
  draft?: [number, number, number, number] | null;
  className?: string;
}) {
  const { lang } = usePrefs();
  const wrap = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  const rel = (e: React.PointerEvent) => {
    const r = wrap.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };

  const boxes = findings.filter((f) => f.bbox && f.status !== "superseded");
  // Labels sit above each box; when two labels would overlap, the later one moves inside its box.
  const inside = boxes.map((f, i) => {
    const [x, y] = f.bbox!;
    return boxes.slice(0, i).some((o) => Math.abs(o.bbox![0] - x) < 0.17 && Math.abs(o.bbox![1] - y) < 0.05);
  });
  const rect = drag ? [Math.min(drag.x0, drag.x1), Math.min(drag.y0, drag.y1), Math.max(drag.x0, drag.x1), Math.max(drag.y0, drag.y1)] : draft;

  return (
    <div dir="ltr" className={cn("relative overflow-hidden rounded-md border border-border bg-muted", className)}>
      <div
        ref={wrap}
        className={cn("relative select-none", drawMode && "cursor-crosshair")}
        onPointerDown={(e) => {
          if (!drawMode) return;
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          const p = rel(e);
          setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
        }}
        onPointerMove={(e) => {
          if (!drawMode || !drag) return;
          const p = rel(e);
          setDrag((d) => (d ? { ...d, x1: p.x, y1: p.y } : d));
        }}
        onPointerUp={() => {
          if (!drawMode || !drag) return;
          const b: [number, number, number, number] = [
            Math.min(drag.x0, drag.x1),
            Math.min(drag.y0, drag.y1),
            Math.max(drag.x0, drag.x1),
            Math.max(drag.y0, drag.y1),
          ];
          setDrag(null);
          if (b[2] - b[0] > 0.015 && b[3] - b[1] > 0.015) onDraw?.(b.map((v) => Math.round(v * 1000) / 1000) as typeof b);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} draggable={false} className="block h-auto w-full" />
        {showBoxes &&
          boxes.map((f, i) => {
            const d = tax.defects.find((x) => x.code === f.code);
            const color = d ? SEV_COLOR[d.severity] : "var(--ai)";
            const [x1, y1, x2, y2] = f.bbox!;
            const active = activeId === f.id;
            const rejected = f.status === "rejected";
            return (
              <button
                type="button"
                key={f.id}
                onMouseEnter={() => onHover(f.id)}
                onMouseLeave={() => onHover(null)}
                onClick={() => onSelect?.(f.id)}
                className={cn("absolute rounded-[3px] transition-[background,opacity,border-width]", drawMode && "pointer-events-none", rejected && "opacity-40")}
                style={{
                  left: `${x1 * 100}%`,
                  top: `${y1 * 100}%`,
                  width: `${(x2 - x1) * 100}%`,
                  height: `${(y2 - y1) * 100}%`,
                  border: `${active ? 2.5 : 1.5}px ${f.status === "proposed" ? "dashed" : rejected ? "dotted" : "solid"} ${rejected ? "var(--muted-foreground)" : color}`,
                  background: active ? `color-mix(in oklab, ${color} 14%, transparent)` : "transparent",
                  boxShadow: "0 0 0 1px rgba(255,255,255,0.55)",
                  zIndex: active ? 10 : undefined,
                }}
                aria-label={`${f.code} ${f.title}`}
              >
                <span
                  className="absolute left-[-1.5px] rounded-[3px] px-1.5 py-[1px] font-mono text-[10px] leading-[16px] font-medium whitespace-nowrap text-white"
                  style={{ background: rejected ? "var(--muted-foreground)" : color, top: inside[i] ? (y2 > 0.94 ? "calc(100% - 17px)" : "100%") : y1 < 0.06 ? 0 : -19 }}
                >
                  {f.code}
                  {f.confidence != null ? ` · ${Math.round(f.confidence * 100)}%` : f.source === "reviewer" ? (lang === "ar" ? " · المراجع" : " · reviewer") : ""}
                </span>
              </button>
            );
          })}
        {rect && (
          <div
            className="pointer-events-none absolute rounded-[3px] border-2 border-dashed border-ai bg-ai/10"
            style={{ left: `${rect[0] * 100}%`, top: `${rect[1] * 100}%`, width: `${(rect[2] - rect[0]) * 100}%`, height: `${(rect[3] - rect[1]) * 100}%` }}
          />
        )}
      </div>
    </div>
  );
}
