"use client";

import { useMemo, useState } from "react";
import { Search, Paperclip } from "lucide-react";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/narvo/status";
import { useFormat, useL, usePrefs } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { HousingCase } from "../_lib/types";
import { STATUS } from "./labels";

type Filter = "new" | "open" | "waiting" | "all";

const FILTERS: Array<{ id: Filter; en: string; ar: string }> = [
  { id: "new", en: "New", ar: "جديد" },
  { id: "open", en: "Active", ar: "قيد العمل" },
  { id: "waiting", en: "Waiting", ar: "بانتظار" },
  { id: "all", en: "All", ar: "الكل" },
];

export function CaseList({
  cases,
  selected,
  onSelect,
}: {
  cases: HousingCase[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const L = useL();
  const f = useFormat();
  const { lang } = usePrefs();
  const [filter, setFilter] = useState<Filter>("new");
  const [q, setQ] = useState("");

  const counts = useMemo(
    () => ({
      new: cases.filter((c) => c.status === "submitted").length,
      open: cases.filter((c) => ["under_review", "verification", "decision_pending"].includes(c.status)).length,
      waiting: cases.filter((c) => c.status === "incomplete").length,
      all: cases.length,
    }),
    [cases],
  );

  const list = useMemo(() => {
    const byFilter = cases.filter((c) =>
      filter === "new"
        ? c.status === "submitted"
        : filter === "open"
          ? ["under_review", "verification", "decision_pending"].includes(c.status)
          : filter === "waiting"
            ? c.status === "incomplete"
            : true,
    );
    const needle = q.trim().toLowerCase();
    return byFilter
      .filter(
        (c) =>
          !needle ||
          c.id.toLowerCase().includes(needle) ||
          c.applicant.name.toLowerCase().includes(needle) ||
          c.applicant.nameAr.includes(q.trim()) ||
          c.applicant.emiratesId.includes(needle),
      )
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  }, [cases, filter, q]);

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2.5 border-b border-border p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={L({ en: "Name, case number or Emirates ID", ar: "الاسم أو رقم الحالة أو الهوية" })}
            className="h-8 bg-surface ps-8 text-[12.5px]"
          />
        </div>
        <div className="grid grid-cols-4 gap-1 rounded-md bg-muted p-0.5">
          {FILTERS.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => setFilter(x.id)}
              className={cn(
                "flex h-7 items-center justify-center gap-1 rounded text-[11px] font-medium transition-colors",
                filter === x.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="truncate">{L(x)}</span>
              <span className="num text-faint">{counts[x.id]}</span>
            </button>
          ))}
        </div>
      </div>
      <ul className="scrollbar-thin min-h-0 flex-1 divide-y divide-border overflow-y-auto">
        {list.map((c) => {
          const st = STATUS[c.status];
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onSelect(c.id)}
                className={cn(
                  "relative w-full px-3.5 py-3 text-start transition-colors hover:bg-muted/50",
                  selected === c.id && "bg-ai-soft/60 hover:bg-ai-soft/60",
                )}
              >
                {selected === c.id && <span className="absolute inset-y-0 start-0 w-0.5 bg-ai" />}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium">{lang === "ar" ? c.applicant.nameAr : c.applicant.name}</div>
                    <div className="mt-0.5 truncate font-mono text-[10.5px] text-muted-foreground">{c.id}</div>
                  </div>
                  <StatusPill tone={st.tone} pulse={c.status === "submitted"}>
                    {L(st)}
                  </StatusPill>
                </div>
                <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="rounded border border-border px-1.5 py-px">{c.track === "grant" ? L({ en: "Grant", ar: "منحة" }) : L({ en: "Loan", ar: "قرض" })}</span>
                  <span className="num">{f.aed(c.amountRequested)}</span>
                  <span className="ms-auto flex items-center gap-1">
                    {c.documents.some((d) => d.file) && <Paperclip className="size-3" />}
                    {f.date(c.submittedAt, { day: "numeric", month: "short" })}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
        {!list.length && (
          <li className="px-4 py-10 text-center text-[12px] text-muted-foreground">{L({ en: "No cases in this view.", ar: "لا توجد حالات في هذا العرض." })}</li>
        )}
      </ul>
    </div>
  );
}
