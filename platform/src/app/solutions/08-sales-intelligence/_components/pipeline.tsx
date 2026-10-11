"use client";

import { motion } from "motion/react";
import { ArrowRightLeft, Search, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { useL, useFormat } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/narvo/status";
import { Avatar, personName, STAGE_LABEL, useMoney } from "./bits";
import { arDays, detectConflicts, oppHealth, type OppHealth } from "../_lib/calc";
import type { Opportunity, SalesData, Stage } from "../_lib/types";

export interface PipelineFilter {
  owner: string;
  stalledOnly: boolean;
  q: string;
}

export function shortName(name: string) {
  return name.replace(/\s*\((.*?)\)\s*/g, " ").replace(/\s+(LLC|Co\.|PJSC|FZCO)\b.*$/i, "").trim();
}

export interface OppRow {
  opp: Opportunity;
  health: OppHealth;
  accountName: string;
  accountNameAr: string;
  conflicts: number;
  highConflicts: number;
}

export function buildOppRows(data: SalesData, filter: PipelineFilter): OppRow[] {
  const q = filter.q.trim().toLowerCase();
  return data.opportunities
    .map((opp) => {
      const acc = data.accounts.find((a) => a.id === opp.accountId);
      const report = detectConflicts(data, opp);
      return {
        opp,
        health: oppHealth(opp, data.interactions, data.today),
        accountName: acc?.name ?? opp.accountId,
        accountNameAr: acc?.nameAr ?? "",
        conflicts: report.conflicts.filter((c) => c.severity !== "low").length,
        highConflicts: report.conflicts.filter((c) => c.severity === "high").length,
      };
    })
    .filter((r) => filter.owner === "all" || r.opp.owner === filter.owner)
    .filter((r) => !filter.stalledOnly || r.health.stalled)
    .filter((r) => !q || `${r.opp.id} ${r.opp.title} ${r.accountName} ${r.accountNameAr} ${r.opp.titleAr ?? ""}`.toLowerCase().includes(q));
}

export function FilterBar({
  owners,
  filter,
  onChange,
  compact,
}: {
  owners: string[];
  filter: PipelineFilter;
  onChange: (f: PipelineFilter) => void;
  compact?: boolean;
}) {
  const L = useL();
  return (
    <div className={cn("flex flex-wrap items-center gap-2", compact && "gap-1.5")}>
      <div className="flex items-center rounded-md border border-border bg-card p-0.5">
        {["all", ...owners].map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onChange({ ...filter, owner: o })}
            className={cn(
              "flex h-6 items-center gap-1.5 rounded-[5px] px-2 text-[11.5px] transition-colors",
              filter.owner === o ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o === "all" ? L({ en: "All owners", ar: "كل المسؤولين" }) : compact ? personName(o, L).split(" ")[0] : personName(o, L)}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange({ ...filter, stalledOnly: !filter.stalledOnly })}
        className={cn(
          "flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11.5px] transition-colors",
          filter.stalledOnly ? "border-warning/40 bg-warning-soft text-warning" : "border-border bg-card text-muted-foreground hover:text-foreground",
        )}
      >
        <TriangleAlert className="size-3" />
        {L({ en: "Stalled only", ar: "المتعثرة فقط" })}
      </button>
      {!compact && (
        <div className="relative">
          <Search className="pointer-events-none absolute start-2 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
          <Input
            value={filter.q}
            onChange={(e) => onChange({ ...filter, q: e.target.value })}
            placeholder={L({ en: "Search account or opportunity", ar: "ابحث عن حساب أو فرصة" })}
            className="h-7 w-60 ps-7 text-[12px]"
          />
        </div>
      )}
    </div>
  );
}

function DaysBar({ h }: { h: OppHealth }) {
  const L = useL();
  const pct = Math.min(100, (h.daysInStage / Math.max(1, h.threshold)) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-muted">
        <div className={cn("absolute inset-y-0 start-0 rounded-full", h.stalled ? "bg-warning" : h.overThreshold ? "bg-warning/60" : "bg-foreground/35")} style={{ width: `${pct}%` }} />
      </div>
      <span className={cn("num shrink-0 text-[11px]", h.stalled ? "font-medium text-warning" : "text-muted-foreground")}>
        {L({ en: `${h.daysInStage} d in stage`, ar: `${arDays(h.daysInStage)} في المرحلة` })}
      </span>
    </div>
  );
}

function OppCard({ row, onOpen, selected }: { row: OppRow; onOpen: (id: string) => void; selected: boolean }) {
  const L = useL();
  const m = useMoney();
  const f = useFormat();
  const { opp, health: h } = row;
  const closed = !h.open;
  const newOwner = opp.ownerChangedAt && opp.previousOwner;
  return (
    <motion.button
      layout
      initial={{ opacity: 1, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      type="button"
      onClick={() => onOpen(opp.id)}
      className={cn(
        "group w-full rounded-lg border bg-card p-3 text-start transition-colors hover:border-border-strong",
        h.stalled ? "border-warning/35" : "border-border",
        selected && "ring-1 ring-ai/50",
        closed && "opacity-70",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted-foreground" dir="auto">
          {shortName(L({ en: row.accountName, ar: row.accountNameAr || row.accountName }))}
        </span>
        <Avatar name={opp.owner} className="size-5 text-[8.5px]" />
      </div>
      <div className="mt-1.5 line-clamp-2 text-[13px] font-medium leading-snug" dir="auto">
        {L({ en: opp.title, ar: opp.titleAr || opp.title })}
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span className="num text-[16px] font-light tracking-tight">{m.compact(opp.value)}</span>
        <span className="num text-[11px] text-muted-foreground">{opp.probability}%</span>
      </div>
      {!closed && (
        <div className="mt-2">
          <DaysBar h={h} />
        </div>
      )}
      {!closed && (
        <div className={cn("mt-2 line-clamp-1 text-[11.5px]", h.nextStepOverdue ? "text-danger" : "text-muted-foreground")} dir="auto">
          {opp.nextStepDate ? `${f.date(opp.nextStepDate, { day: "numeric", month: "short" })} · ` : ""}
          {L({ en: opp.nextStep, ar: opp.nextStepAr || opp.nextStep })}
        </div>
      )}
      {(h.stalled || newOwner || row.highConflicts > 0) && !closed && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {h.stalled && <StatusPill tone="warning">{L({ en: "Stalled", ar: "متعثرة" })}</StatusPill>}
          {row.highConflicts > 0 && (
            <StatusPill tone="danger">{L({ en: `${row.conflicts} conflicts`, ar: `${row.conflicts} تعارضات` })}</StatusPill>
          )}
          {newOwner && (
            <StatusPill tone="info" dot={false}>
              <ArrowRightLeft className="size-2.5" />
              {L({ en: "New owner", ar: "مسؤول جديد" })}
            </StatusPill>
          )}
        </div>
      )}
    </motion.button>
  );
}

const BOARD_COLUMNS: Array<{ key: string; stages: Stage[] }> = [
  { key: "Qualification", stages: ["Qualification"] },
  { key: "Proposal", stages: ["Proposal"] },
  { key: "Negotiation", stages: ["Negotiation"] },
  { key: "Closed", stages: ["Closed Won", "Closed Lost"] },
];

export function PipelineBoard({ rows, onOpen, selectedId }: { rows: OppRow[]; onOpen: (id: string) => void; selectedId: string | null }) {
  const L = useL();
  const m = useMoney();
  return (
    <div className="grid grid-cols-4 gap-4 max-xl:grid-cols-2 max-md:grid-cols-1">
      {BOARD_COLUMNS.map((col) => {
        const items = rows.filter((r) => col.stages.includes(r.opp.stage)).sort((a, b) => Number(b.health.stalled) - Number(a.health.stalled) || b.opp.value - a.opp.value);
        const value = items.reduce((a, r) => a + r.opp.value, 0);
        const stalled = items.filter((r) => r.health.stalled).length;
        return (
          <section key={col.key} className="flex min-w-0 flex-col rounded-lg border border-border bg-surface/70">
            <header className="flex items-end justify-between gap-2 border-b border-border px-3.5 py-2.5">
              <div>
                <div className="label-caps">{col.key === "Closed" ? L({ en: "Closed this quarter", ar: "مغلقة هذا الربع" }) : L(STAGE_LABEL[col.key])}</div>
                <div className="num mt-1 text-[15px] font-light tracking-tight">{m.compact(value)}</div>
              </div>
              <div className="text-end text-[11px] text-muted-foreground">
                <div className="num">{L({ en: `${items.length} opportunities`, ar: `${items.length} فرص` })}</div>
                {stalled > 0 && <div className="num text-warning">{L({ en: `${stalled} stalled`, ar: `${stalled} متعثرة` })}</div>}
              </div>
            </header>
            <div className="scrollbar-thin flex max-h-[640px] flex-col gap-2.5 overflow-auto p-2.5">
              {items.map((r) => (
                <OppCard key={r.opp.id} row={r} onOpen={onOpen} selected={selectedId === r.opp.id} />
              ))}
              {!items.length && <p className="px-1 py-6 text-center text-[12px] text-faint">{L({ en: "Nothing here with these filters", ar: "لا شيء هنا بهذه المرشحات" })}</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function PipelineList({ rows, selectedId, onOpen }: { rows: OppRow[]; selectedId: string | null; onOpen: (id: string) => void }) {
  const L = useL();
  const m = useMoney();
  const order: Stage[] = ["Negotiation", "Proposal", "Qualification", "Closed Won", "Closed Lost"];
  const sorted = [...rows].sort((a, b) => order.indexOf(a.opp.stage) - order.indexOf(b.opp.stage) || Number(b.health.stalled) - Number(a.health.stalled) || b.opp.value - a.opp.value);
  return (
    <ul className="divide-y divide-border">
      {sorted.map((r) => {
        const sel = selectedId === r.opp.id;
        return (
          <li key={r.opp.id}>
            <button
              type="button"
              onClick={() => onOpen(r.opp.id)}
              className={cn("relative flex w-full flex-col gap-1 px-4 py-2.5 text-start transition-colors hover:bg-muted/50", sel && "bg-muted/60")}
            >
              {sel && <span className="absolute inset-y-0 start-0 w-0.5 bg-ai" />}
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[12.5px] font-medium" dir="auto">
                  {L({ en: r.opp.title, ar: r.opp.titleAr || r.opp.title })}
                </span>
                <span className="num shrink-0 text-[12px]">{m.compact(r.opp.value)}</span>
              </div>
              <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span className="truncate" dir="auto">
                  {shortName(L({ en: r.accountName, ar: r.accountNameAr || r.accountName }))} · {L(STAGE_LABEL[r.opp.stage])}
                </span>
                {r.health.open ? (
                  <span className={cn("num shrink-0", r.health.stalled && "font-medium text-warning")}>
                    {r.health.stalled ? L({ en: `stalled ${r.health.daysInStage} d`, ar: `متعثرة ${arDays(r.health.daysInStage)}` }) : L({ en: `${r.health.daysInStage} d`, ar: arDays(r.health.daysInStage) })}
                  </span>
                ) : (
                  <span className="shrink-0">{r.opp.stage === "Closed Won" ? L({ en: "won", ar: "فوز" }) : L({ en: "lost", ar: "خسارة" })}</span>
                )}
              </div>
            </button>
          </li>
        );
      })}
      {!sorted.length && <li className="px-4 py-8 text-center text-[12px] text-faint">{L({ en: "No opportunities match", ar: "لا توجد فرص مطابقة" })}</li>}
    </ul>
  );
}
