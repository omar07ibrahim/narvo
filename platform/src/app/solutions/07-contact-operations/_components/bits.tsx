"use client";

import { Mail, MessageCircle, Phone, Smartphone, Store } from "lucide-react";
import { cn } from "@/lib/utils";
import { useL } from "@/lib/i18n";
import { StatusPill } from "@/components/narvo/status";
import { statusMeta } from "../_lib/types";

export function ChannelIcon({ channel, className }: { channel: string; className?: string }) {
  const cls = cn("size-3.5 shrink-0", className);
  if (channel === "phone" || channel === "voice") return <Phone className={cls} strokeWidth={1.75} />;
  if (channel === "whatsapp" || channel === "chat") return <MessageCircle className={cls} strokeWidth={1.75} />;
  if (channel === "app_chat" || channel === "app") return <Smartphone className={cls} strokeWidth={1.75} />;
  if (channel === "email") return <Mail className={cls} strokeWidth={1.75} />;
  return <Store className={cls} strokeWidth={1.75} />;
}

export function channelLabel(channel: string, L: ReturnType<typeof useL>) {
  const map: Record<string, { en: string; ar: string }> = {
    phone: { en: "Phone", ar: "هاتف" },
    voice: { en: "Voice", ar: "صوت" },
    whatsapp: { en: "WhatsApp", ar: "واتساب" },
    chat: { en: "WhatsApp", ar: "واتساب" },
    app_chat: { en: "App chat", ar: "محادثة التطبيق" },
    email: { en: "Email", ar: "بريد إلكتروني" },
    centre: { en: "Centre", ar: "المركز" },
  };
  return L(map[channel] ?? { en: channel, ar: channel });
}

export function RecordStatus({ status, className }: { status: string; className?: string }) {
  const L = useL();
  const m = statusMeta(status);
  return (
    <StatusPill tone={m.tone} className={className}>
      {L(m)}
    </StatusPill>
  );
}

/** Thin bipolar sentiment meter, -1 … +1. */
export function SentimentMeter({ value, label, history }: { value: number | null; label?: string; history?: number[] }) {
  const L = useL();
  const v = value ?? 0;
  const pct = ((v + 1) / 2) * 100;
  const tone = v <= -0.25 ? "bg-danger" : v >= 0.3 ? "bg-success" : "bg-warning";
  return (
    <div>
      <div className="flex items-center justify-between text-[11.5px]">
        <span className="text-muted-foreground">{L({ en: "Sentiment", ar: "المشاعر" })}</span>
        <span className="font-medium capitalize">{value == null ? "—" : (label ?? (v <= -0.25 ? "negative" : v >= 0.3 ? "positive" : "neutral"))}</span>
      </div>
      <div className="relative mt-1.5 h-1.5">
        <div className="flex h-full gap-px overflow-hidden rounded-full">
          <span className="flex-[0.375] bg-danger-soft" />
          <span className="flex-[0.275] bg-warning-soft" />
          <span className="flex-[0.35] bg-success-soft" />
        </div>
        {value != null && (
          <span
            className={cn("absolute top-1/2 size-3 -translate-y-1/2 rounded-full border-2 border-card shadow-sm transition-all", tone)}
            style={{ insetInlineStart: `calc(${pct}% - 6px)` }}
          />
        )}
      </div>
      {history && history.length > 1 && (
        <div className="mt-2 flex items-end gap-0.5" aria-hidden>
          {history.map((h, i) => (
            <span
              key={i}
              className={cn("w-1.5 rounded-sm", h <= -0.25 ? "bg-danger/60" : h >= 0.3 ? "bg-success/60" : "bg-warning/60")}
              style={{ height: `${6 + ((h + 1) / 2) * 14}px` }}
            />
          ))}
          <span className="ms-1.5 text-[10.5px] text-faint">{L({ en: "per turn", ar: "لكل رسالة" })}</span>
        </div>
      )}
    </div>
  );
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter((p) => !/^(al|bin|el|eng\.|dr\.)$/i.test(p))
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export function fmtDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function langLabel(lang: string | undefined, dialect?: string | null) {
  if (!lang) return "";
  const base = lang === "ar" ? "AR" : lang === "en" ? "EN" : "AR/EN";
  if (!dialect) return base;
  const d = dialect.replace(/arabic/i, "").replace(/modern standard/i, "MSA").trim();
  return d && !/^english$/i.test(dialect) ? `${base} · ${d}` : base;
}
