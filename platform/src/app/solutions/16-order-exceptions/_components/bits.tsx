"use client";

import { Boxes, CalendarClock, CreditCard, Tag } from "lucide-react";
import type { ReactNode } from "react";
import { StatusPill, type Tone } from "@/components/narvo/status";
import { useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { TYPE_LABEL } from "../_lib/rules";
import type { ExceptionType, Severity } from "../_lib/types";

export const SEVERITY: Record<Severity, { tone: Tone; en: string; ar: string }> = {
  critical: { tone: "danger", en: "Critical", ar: "حرج" },
  high: { tone: "warning", en: "High", ar: "مرتفع" },
  medium: { tone: "info", en: "Medium", ar: "متوسط" },
  low: { tone: "neutral", en: "Low", ar: "منخفض" },
};

export const STATUS_LABEL: Record<string, { tone: Tone; en: string; ar: string }> = {
  open: { tone: "neutral", en: "Open", ar: "مفتوح" },
  credit_hold: { tone: "danger", en: "Credit hold", ar: "إيقاف ائتماني" },
  partially_delivered: { tone: "info", en: "Part delivered", ar: "مسلّم جزئياً" },
  ready: { tone: "success", en: "Ready", ar: "جاهز" },
};

export function SeverityPill({ s }: { s: Severity | null }) {
  const L = useL();
  if (!s) return null;
  const x = SEVERITY[s];
  return (
    <StatusPill tone={x.tone} pulse={s === "critical"}>
      {L(x)}
    </StatusPill>
  );
}

const ICONS: Record<ExceptionType, typeof Boxes> = { stock: Boxes, price: Tag, window: CalendarClock, credit: CreditCard };

export function TypeIcon({ t, className }: { t: ExceptionType; className?: string }) {
  const I = ICONS[t];
  return <I className={cn("size-3.5", className)} strokeWidth={1.75} />;
}

export function TypeChip({ t, muted }: { t: ExceptionType; muted?: boolean }) {
  const L = useL();
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded border px-1.5 text-[10.5px] font-medium",
        muted ? "border-border text-faint line-through" : "border-border-strong/70 bg-card text-foreground/80",
      )}
    >
      <TypeIcon t={t} className="size-3" />
      {L(TYPE_LABEL[t])}
    </span>
  );
}

export function Caps({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("label-caps !text-[9.5px]", className)}>{children}</div>;
}

export function Num({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("num", className)}>{children}</span>;
}

/** Thin horizontal meter used for credit exposure vs limit. */
export function ExposureBar({
  segments,
  limit,
  max,
  className,
}: {
  segments: Array<{ value: number; className: string; label: string }>;
  limit: number;
  max: number;
  className?: string;
}) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const scale = Math.max(max, total, limit) || 1;
  return (
    <div className={cn("relative h-2.5 w-full overflow-visible rounded-full bg-muted", className)}>
      <div className="absolute inset-0 flex overflow-hidden rounded-full">
        {segments.map((s, i) => (
          <div key={i} title={s.label} className={cn("h-full border-e-2 border-card last:border-e-0", s.className)} style={{ width: `${(s.value / scale) * 100}%` }} />
        ))}
      </div>
      <div className="absolute -top-1 -bottom-1 w-px bg-foreground" style={{ insetInlineStart: `${(limit / scale) * 100}%` }} />
    </div>
  );
}
