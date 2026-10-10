"use client";

import { ArrowRight, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFormat, useL } from "@/lib/i18n";
import { StatusPill } from "@/components/narvo/status";
import { Avatar, STAGE_LABEL, useMoney } from "./bits";
import type { OppHealth } from "../_lib/compute";
import type { Account, Opportunity, Quote } from "../_lib/types";

export function OppHeader({ opp, account, health, quote }: { opp: Opportunity; account: Account; health: OppHealth; quote: Quote | null }) {
  const L = useL();
  const f = useFormat();
  const m = useMoney();
  return (
    <div className="border-b border-border px-5 pt-4 pb-3.5">
      <div className="label-caps flex flex-wrap items-center gap-2">
        <span dir="auto">{L({ en: account.name, ar: account.nameAr })}</span>
        <span className="h-px w-3 bg-border-strong" />
        <span>{L({ en: `Tier ${account.tier}`, ar: `الفئة ${account.tier}` })}</span>
        <span className="h-px w-3 bg-border-strong" />
        <span className="font-mono normal-case tracking-normal">{opp.id}</span>
      </div>
      <h2 className="display-title mt-1.5 text-[22px] leading-tight" dir="auto">
        {L({ en: opp.title, ar: opp.titleAr || opp.title })}
      </h2>
      <div className="mt-1 flex items-center gap-1.5 text-[12px] text-muted-foreground" dir="auto">
        <MapPin className="size-3 shrink-0" />
        <span className="truncate">{opp.site}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px]">
        <span className="num text-[17px] font-light tracking-tight">{m.aed(opp.value)}</span>
        <span className="flex items-center gap-1.5">
          <StatusPill tone={health.open ? "neutral" : opp.stage === "Closed Won" ? "success" : "neutral"}>{L(STAGE_LABEL[opp.stage])}</StatusPill>
          {health.open && (
            <StatusPill tone={health.stalled ? "warning" : "neutral"} dot={false}>
              <span className="num">
                {L({ en: `${health.daysInStage} d in stage`, ar: `${health.daysInStage} يوماً في المرحلة` })}
                {health.stalled ? L({ en: " · stalled", ar: " · متعثرة" }) : ""}
              </span>
            </StatusPill>
          )}
        </span>
        <span className="num text-muted-foreground">
          {L({ en: "Probability", ar: "الاحتمال" })} <span className="text-foreground">{opp.probability}%</span>
        </span>
        <span className="text-muted-foreground">
          {L({ en: "Close", ar: "الإغلاق" })} <span className="num text-foreground">{f.date(opp.expectedClose)}</span>
        </span>
        {quote && (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="font-mono text-[11.5px] text-foreground">{quote.id}</span>
            <StatusPill tone={quote.status === "Expired" ? "danger" : "neutral"}>
              {quote.status === "Expired" ? L({ en: `expired ${f.date(quote.validUntil, { day: "numeric", month: "short" })}`, ar: `منتهٍ ${f.date(quote.validUntil, { day: "numeric", month: "short" })}` }) : L({ en: `valid to ${f.date(quote.validUntil, { day: "numeric", month: "short" })}`, ar: `صالح حتى ${f.date(quote.validUntil, { day: "numeric", month: "short" })}` })}
            </StatusPill>
          </span>
        )}
        <span className="ms-auto flex items-center gap-2">
          {opp.previousOwner && (
            <>
              <Avatar name={opp.previousOwner} tone="muted" />
              <ArrowRight className="size-3 text-faint rtl:rotate-180" />
            </>
          )}
          <Avatar name={opp.owner} />
          <span className="text-[12px] leading-tight">
            <span className="block font-medium">{opp.owner}</span>
            {opp.previousOwner && opp.ownerChangedAt && (
              <span className={cn("block text-[11px] text-muted-foreground")}>
                {L({ en: `from ${opp.previousOwner} · ${f.date(opp.ownerChangedAt, { day: "numeric", month: "short" })}`, ar: `من ${opp.previousOwner} · ${f.date(opp.ownerChangedAt, { day: "numeric", month: "short" })}` })}
              </span>
            )}
          </span>
        </span>
      </div>
    </div>
  );
}
