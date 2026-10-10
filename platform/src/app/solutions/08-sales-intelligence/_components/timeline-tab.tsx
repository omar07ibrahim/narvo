"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFormat, useL } from "@/lib/i18n";
import { StatusPill } from "@/components/narvo/status";
import { InteractionIcon, TYPE_LABEL } from "./bits";
import type { Interaction, Opportunity } from "../_lib/types";

function Item({ i, opps }: { i: Interaction; opps: Opportunity[] }) {
  const L = useL();
  const f = useFormat();
  const [open, setOpen] = useState(false);
  const long = i.body.length > 320;
  const other = opps.find((o) => o.id === i.opportunityId);
  return (
    <li className="relative ps-9">
      <span
        className={cn(
          "absolute start-0 top-0.5 flex size-6 items-center justify-center rounded-full border bg-card",
          i.loggedVia === "NARVO" ? "border-ai/40 text-ai" : i.direction === "inbound" ? "border-border-strong text-foreground" : "border-border text-muted-foreground",
        )}
      >
        <InteractionIcon type={i.type} />
      </span>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-muted-foreground">
        <span className="font-medium text-foreground">{L(TYPE_LABEL[i.type])}</span>
        <span>·</span>
        <span>{i.direction === "inbound" ? L({ en: "from customer", ar: "من المتعامل" }) : i.direction === "outbound" ? L({ en: "to customer", ar: "إلى المتعامل" }) : L({ en: "internal", ar: "داخلي" })}</span>
        <span>·</span>
        <span className="num">
          {f.date(i.at, { day: "numeric", month: "short" })} {i.at.slice(11, 16)}
        </span>
        {other && <span className="font-mono text-[10.5px] text-faint">{other.id}</span>}
        {i.loggedVia === "NARVO" && (
          <StatusPill tone="ai" dot={false}>
            <ShieldCheck className="size-2.5" />
            {L({ en: `Logged via NARVO · approved by ${i.approvedBy}`, ar: `سُجّل عبر نارفو · اعتمده ${i.approvedBy}` })}
          </StatusPill>
        )}
      </div>
      <div className="mt-0.5 text-[12px] text-muted-foreground" dir="auto">
        {i.from} → {i.to}
      </div>
      {i.subject && i.subject !== "WhatsApp" && (
        <div className="mt-1 text-[13px] font-medium" dir="auto">
          {i.subject}
        </div>
      )}
      <p className={cn("mt-1 text-[12.5px] leading-relaxed whitespace-pre-line", !open && long && "line-clamp-4")} dir="auto">
        {i.body}
      </p>
      {long && (
        <button type="button" onClick={() => setOpen((v) => !v)} className="mt-0.5 text-[11.5px] text-ai hover:underline">
          {open ? L({ en: "Show less", ar: "عرض أقل" }) : L({ en: "Show all", ar: "عرض الكل" })}
        </button>
      )}
    </li>
  );
}

export function TimelineTab({ interactions, opps, oppId }: { interactions: Interaction[]; opps: Opportunity[]; oppId: string }) {
  const L = useL();
  const [scope, setScope] = useState<"opp" | "account">("opp");
  const accountId = opps.find((o) => o.id === oppId)?.accountId;
  const list = interactions
    .filter((i) => (scope === "opp" ? i.opportunityId === oppId : i.accountId === accountId))
    .sort((a, b) => b.at.localeCompare(a.at));
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <span className="label-caps">{L({ en: `${list.length} interactions`, ar: `${list.length} تفاعلاً` })}</span>
        <div className="flex items-center rounded-md border border-border bg-card p-0.5">
          {(["opp", "account"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className={cn("h-6 rounded-[5px] px-2.5 text-[11.5px]", scope === s ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
            >
              {s === "opp" ? L({ en: "This opportunity", ar: "هذه الفرصة" }) : L({ en: "Whole account", ar: "الحساب كاملاً" })}
            </button>
          ))}
        </div>
      </div>
      <ol className="relative space-y-5 before:absolute before:start-[11.5px] before:top-2 before:bottom-2 before:w-px before:bg-border">
        {list.map((i) => (
          <Item key={i.id} i={i} opps={scope === "account" ? opps.filter((o) => o.id !== oppId) : []} />
        ))}
      </ol>
      {!list.length && <p className="py-8 text-center text-[12px] text-faint">{L({ en: "No interactions logged", ar: "لا توجد تفاعلات مسجلة" })}</p>}
    </div>
  );
}
