"use client";

import { useEffect, useState } from "react";
import { Cloud, ShieldCheck } from "lucide-react";
import { useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export interface PlatformStatus {
  provider: "openrouter" | "local";
  host: string;
  model: string;
  modelLabel: string;
  egressBytes: number;
  calls: number;
  tokens: number;
  avgMs: number;
}

export function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

export function usePlatformStatus(interval = 4000) {
  const [status, setStatus] = useState<PlatformStatus | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/platform/status")
        .then((r) => r.json())
        .then((d) => alive && setStatus(d))
        .catch(() => {});
    load();
    const t = setInterval(load, interval);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [interval]);
  return status;
}

export function PrivacyStatus() {
  const L = useL();
  const s = usePlatformStatus();
  const local = s?.provider === "local";
  return (
    <div className="rounded-lg border border-sidebar-border bg-white/[0.03] p-3">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex size-6 items-center justify-center rounded-full",
            local ? "bg-[#5fb8ad]/15 text-[#5fb8ad]" : "bg-[#c98a2b]/15 text-[#e0a64a]",
          )}
        >
          {local ? <ShieldCheck className="size-3.5" /> : <Cloud className="size-3.5" />}
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="text-[12px] font-medium text-white">
            {local ? L({ en: "On-device · Private", ar: "على الجهاز · خاص" }) : L({ en: "Development mode", ar: "وضع التطوير" })}
          </div>
          <div className="truncate text-[10.5px] text-sidebar-muted">{s ? `${s.modelLabel} · ${s.host}` : "…"}</div>
        </div>
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-2 text-[10.5px]">
        <div>
          <div className="text-sidebar-muted">{L({ en: "Data egress", ar: "البيانات الخارجة" })}</div>
          <div dir="auto" className={cn("num text-left text-[13px] font-medium rtl:text-right", local ? "text-[#5fb8ad]" : "text-white")}>
            {s ? formatBytes(s.egressBytes) : "—"}
          </div>
        </div>
        <div>
          <div className="text-sidebar-muted">{L({ en: "AI calls", ar: "استدعاءات" })}</div>
          <div className="num text-[13px] font-medium text-white">{s?.calls ?? "—"}</div>
        </div>
      </div>
    </div>
  );
}
