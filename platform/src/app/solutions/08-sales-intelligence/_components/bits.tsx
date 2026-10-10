"use client";

import type { ReactNode } from "react";
import { Mail, MessageCircle, Phone, StickyNote, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useL, usePrefs } from "@/lib/i18n";
import { StatusPill, type Tone } from "@/components/narvo/status";
import { initials } from "../_lib/calc";
import type { Bi, InteractionType } from "../_lib/types";

export function Avatar({ name, className, tone = "ink" }: { name: string; className?: string; tone?: "ink" | "muted" | "ai" }) {
  return (
    <span
      title={name}
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[9.5px] font-medium tracking-wide",
        tone === "ink" && "bg-foreground text-background",
        tone === "muted" && "border border-border bg-muted text-muted-foreground",
        tone === "ai" && "bg-ai text-ai-foreground",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

/** AED formatting helpers that follow the UI language. */
export function useMoney() {
  const { lang } = usePrefs();
  const nf = (n: number, dp = 0) =>
    new Intl.NumberFormat(lang === "ar" ? "ar-AE-u-nu-latn" : "en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp }).format(n);
  return {
    n: nf,
    unit: (n: number) => (Number.isInteger(n) ? nf(n) : nf(n, 2)),
    aed: (n: number, dp = 0) => (lang === "ar" ? `${nf(n, dp)} درهم` : `AED ${nf(n, dp)}`),
    compact: (n: number) => {
      const abs = Math.abs(n);
      const v = abs >= 1_000_000 ? `${nf(n / 1_000_000, 2)}${lang === "ar" ? " مليون" : "M"}` : abs >= 10_000 ? `${nf(n / 1000, 0)}${lang === "ar" ? " ألف" : "K"}` : nf(n);
      return lang === "ar" ? `${v} درهم` : `AED ${v}`;
    },
  };
}

export const SEVERITY_TONE: Record<string, Tone> = { high: "danger", medium: "warning", low: "neutral" };

export function SeverityPill({ severity }: { severity: "high" | "medium" | "low" }) {
  const L = useL();
  const label: Record<string, Bi> = {
    high: { en: "High", ar: "عالية" },
    medium: { en: "Medium", ar: "متوسطة" },
    low: { en: "Info", ar: "معلومة" },
  };
  return <StatusPill tone={SEVERITY_TONE[severity]}>{L(label[severity])}</StatusPill>;
}

const TYPE_ICON: Record<InteractionType, typeof Mail> = { email: Mail, call: Phone, meeting: Users, whatsapp: MessageCircle, note: StickyNote };

export function InteractionIcon({ type, className }: { type: InteractionType; className?: string }) {
  const Icon = TYPE_ICON[type] ?? StickyNote;
  return <Icon className={cn("size-3.5", className)} strokeWidth={1.75} />;
}

export const TYPE_LABEL: Record<InteractionType, Bi> = {
  email: { en: "Email", ar: "بريد إلكتروني" },
  call: { en: "Call", ar: "مكالمة" },
  meeting: { en: "Meeting", ar: "اجتماع" },
  whatsapp: { en: "WhatsApp", ar: "واتساب" },
  note: { en: "Note", ar: "ملاحظة" },
};

export const STAGE_LABEL: Record<string, Bi> = {
  Qualification: { en: "Qualification", ar: "التأهيل" },
  Proposal: { en: "Proposal", ar: "العرض" },
  Negotiation: { en: "Negotiation", ar: "التفاوض" },
  "Closed Won": { en: "Closed — won", ar: "مغلقة — فوز" },
  "Closed Lost": { en: "Closed — lost", ar: "مغلقة — خسارة" },
};

export function Block({ label, children, className, actions }: { label?: ReactNode; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={cn("rounded-lg border border-border bg-surface/60", className)}>
      {(label || actions) && (
        <div className="flex min-h-9 items-center justify-between gap-2 border-b border-border px-3.5 py-1.5">
          <span className="label-caps">{label}</span>
          {actions && <div className="flex items-center gap-1.5">{actions}</div>}
        </div>
      )}
      <div className="p-3.5">{children}</div>
    </section>
  );
}

export function ErrorBox({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const L = useL();
  if (!message) return null;
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-danger/25 bg-danger-soft p-3 text-[12.5px] text-danger">
      <span className="min-w-0 break-words">{message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="shrink-0 font-medium underline underline-offset-2">
          {L({ en: "Retry", ar: "إعادة المحاولة" })}
        </button>
      )}
    </div>
  );
}

/** "[3] [7]" source chips rendered as small markers (used outside Markdown). */
export function SourceChips({ ids, onClick }: { ids: number[]; onClick?: (n: number) => void }) {
  if (!ids?.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-0.5 align-middle">
      {ids.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onClick?.(n)}
          className="inline-flex h-[16px] min-w-[16px] items-center justify-center rounded-[4px] border border-ai/25 bg-ai-soft px-1 font-mono text-[9.5px] text-ai hover:bg-ai hover:text-ai-foreground"
        >
          {n}
        </button>
      ))}
    </span>
  );
}

export function timeAgoLabel(ts: number, lang: "en" | "ar") {
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (mins < 1) return lang === "ar" ? "الآن" : "just now";
  if (mins < 60) return lang === "ar" ? `قبل ${mins} دقيقة` : `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return lang === "ar" ? `قبل ${h} ساعة` : `${h} h ago`;
  const d = Math.round(h / 24);
  return lang === "ar" ? `قبل ${d} يوم` : `${d} d ago`;
}

/** "[16, 22]" or "[16،22]" → "[16][22]" so the shared Markdown renderer shows hover chips. */
export function normCites(text: string) {
  return text.replace(/\[(\d+(?:\s*[,،]\s*\d+)+)\]/g, (_m, inner: string) =>
    inner
      .split(/\s*[,،]\s*/)
      .map((n) => `[${n}]`)
      .join(""),
  );
}
