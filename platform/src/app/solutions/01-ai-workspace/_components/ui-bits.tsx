"use client";

import type { ReactNode } from "react";
import { Lock, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useL, usePrefs } from "@/lib/i18n";
import { CLASS_LABEL, ROLES, accessLabel, type Classification, type RoleKey } from "../_lib/shared";

/** Calm segmented control (catalogue style). */
export function Segmented<T extends string>({
  value,
  onChange,
  items,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  items: Array<{ value: T; label: ReactNode; icon?: ReactNode }>;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex items-center rounded-lg border border-border bg-surface p-0.5", className)}>
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          onClick={() => onChange(it.value)}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-[12.5px] font-medium transition-colors",
            value === it.value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {it.icon}
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function ClassBadge({ value, className }: { value: Classification; className?: string }) {
  const L = useL();
  return (
    <span
      className={cn(
        "inline-flex h-[18px] items-center gap-1 rounded-[4px] border px-1.5 text-[10px] font-medium tracking-wide uppercase",
        value === "Public" && "border-border bg-surface text-muted-foreground",
        value === "Internal" && "border-info/20 bg-info-soft text-info",
        value === "Confidential" && "border-warning/30 bg-warning-soft text-warning",
        className,
      )}
    >
      {value === "Confidential" && <Lock className="size-2.5" />}
      {L(CLASS_LABEL[value])}
    </span>
  );
}

export function AccessChip({ role, className }: { role: RoleKey; className?: string }) {
  const L = useL();
  const { lang } = usePrefs();
  const r = ROLES[role];
  return (
    <span
      className={cn(
        "inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border px-2.5 text-[11.5px]",
        r.canAct ? "border-border bg-card" : "border-warning/30 bg-warning-soft/70",
        className,
      )}
    >
      <ShieldCheck className={cn("size-3.5 shrink-0", r.canAct ? "text-ai" : "text-warning")} />
      <span className="truncate text-muted-foreground">
        {L({ en: "Answering as", ar: "يجيب بصفة" })}{" "}
        <span className="font-medium text-foreground">{lang === "ar" ? r.persona.nameAr : r.persona.name}</span>
      </span>
      <span className="text-faint">·</span>
      <span className="shrink-0 font-medium">{accessLabel(r.access, lang)}</span>
      {!r.canAct && <span className="shrink-0 text-warning">· {L({ en: "read-only", ar: "قراءة فقط" })}</span>}
    </span>
  );
}

export function initials(name: string) {
  return name
    .replace(/^(Eng\.|Dr\.|Adv\.|H\.E\.)\s*/g, "")
    .split(" ")
    .filter((p) => !/^(al|bin|el)$/i.test(p))
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export function downloadText(filename: string, text: string, mime = "text/markdown;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
