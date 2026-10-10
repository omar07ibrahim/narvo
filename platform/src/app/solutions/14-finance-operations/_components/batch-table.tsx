"use client";

import { useMemo, useState } from "react";
import { ArrowDownWideNarrow, CalendarClock, FileImage, Search, Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/narvo/status";
import { useFormat, useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { fmt2 } from "../_lib/three-way";
import type { Invoice, MatchResult } from "../_lib/types";
import { statusOf, SUPPLIER_SHORT } from "./labels";

type Filter = "all" | "exceptions" | "auto" | "resolved";

export function BatchTable({
  invoices,
  matches,
  pending,
  selected,
  onSelect,
}: {
  invoices: Invoice[];
  matches: Record<string, MatchResult>;
  pending: Set<string>;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const L = useL();
  const f = useFormat();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"received" | "variance">("variance");

  const is = useMemo(
    () => ({
      exceptions: (i: Invoice) => i.status === "received" && !!matches[i.id]?.exception,
      auto: (i: Invoice) => i.status === "received" && !matches[i.id]?.exception,
      resolved: (i: Invoice) => i.status !== "received",
    }),
    [matches],
  );

  const counts = {
    all: invoices.length,
    exceptions: invoices.filter(is.exceptions).length,
    auto: invoices.filter(is.auto).length,
    resolved: invoices.filter(is.resolved).length,
  };

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = invoices
      .filter((i) => filter === "all" || is[filter](i))
      .filter(
        (i) =>
          !needle ||
          [i.id, i.supplierInvoiceNo, i.supplierName, i.poRef, i.poRefCorrected ?? "", SUPPLIER_SHORT[i.supplierId]?.ar ?? ""].some((s) => s.toLowerCase().includes(needle)),
      );
    return rows.sort((a, b) =>
      sort === "variance"
        ? (matches[b.id]?.variance ?? 0) - (matches[a.id]?.variance ?? 0) || b.receivedDate.localeCompare(a.receivedDate)
        : b.receivedDate.localeCompare(a.receivedDate) || b.id.localeCompare(a.id),
    );
  }, [invoices, filter, q, sort, matches, is]);

  const sum = list.reduce((a, i) => a + i.total, 0);
  const TABS: Array<{ id: Filter; en: string; ar: string }> = [
    { id: "all", en: "All", ar: "الكل" },
    { id: "exceptions", en: "Exceptions", ar: "استثناءات" },
    { id: "auto", en: "Auto-matched", ar: "مطابقة آلية" },
    { id: "resolved", en: "Resolved", ar: "تمت معالجتها" },
  ];

  return (
    <div className="@container flex h-full flex-col">
      <div className="space-y-2.5 border-b border-border p-3">
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={L({ en: "Supplier, invoice no. or PO", ar: "المورد أو رقم الفاتورة أو أمر الشراء" })}
              className="h-8 bg-surface ps-8 text-[12.5px]"
            />
          </div>
          <button
            type="button"
            onClick={() => setSort((s) => (s === "variance" ? "received" : "variance"))}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            title={L({ en: "Change sort order", ar: "تغيير الترتيب" })}
          >
            {sort === "variance" ? <ArrowDownWideNarrow className="size-3.5" /> : <CalendarClock className="size-3.5" />}
            {sort === "variance" ? L({ en: "Variance", ar: "الفرق" }) : L({ en: "Received", ar: "الاستلام" })}
          </button>
        </div>
        <div className="grid grid-cols-4 gap-1 rounded-md bg-muted p-0.5">
          {TABS.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => setFilter(x.id)}
              className={cn(
                "flex h-7 min-w-0 items-center justify-center gap-1 rounded px-1 text-[11px] font-medium transition-colors",
                filter === x.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="truncate">{L(x)}</span>
              <span className="num text-faint">{counts[x.id]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <table className="w-full table-fixed text-[12.5px]">
          <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur">
            <tr className="border-b border-border">
              <th className="label-caps !text-[9.5px] px-3 py-2 text-start font-medium">{L({ en: "Document", ar: "المستند" })}</th>
              <th className="label-caps !text-[9.5px] hidden w-[60px] px-2 py-2 text-start font-medium @sm:table-cell">{L({ en: "PO", ar: "أمر الشراء" })}</th>
              <th className="label-caps !text-[9.5px] w-[92px] px-2 py-2 text-end font-medium">{L({ en: "Total AED", ar: "الإجمالي" })}</th>
              <th className="label-caps !text-[9.5px] w-[140px] px-3 py-2 text-end font-medium">{L({ en: "Match", ar: "المطابقة" })}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {list.map((i) => {
              const m = matches[i.id];
              const st = statusOf(i, m, pending.has(i.id));
              const poFail = m?.checks.some((c) => c.id === "po" && c.status === "fail");
              const openVar = i.status === "received" && m?.exception;
              return (
                <tr
                  key={i.id}
                  onClick={() => onSelect(i.id)}
                  className={cn("relative cursor-pointer transition-colors hover:bg-muted/50", selected === i.id && "bg-ai-soft/60 hover:bg-ai-soft/60")}
                >
                  <td className="relative px-3 py-2.5 align-top">
                    {selected === i.id && <span className="absolute inset-y-0 start-0 w-0.5 bg-ai" />}
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate font-medium">{L(SUPPLIER_SHORT[i.supplierId] ?? { en: i.supplierName, ar: i.supplierName })}</span>
                      {i.image && !i.source?.startsWith("upload") && <FileImage className="size-3 shrink-0 text-faint" />}
                      {i.source === "upload" && <Upload className="size-3 shrink-0 text-ai" />}
                      {i.docType === "credit_note" && (
                        <span className="shrink-0 rounded border border-border px-1 text-[9.5px] text-muted-foreground">{L({ en: "CN", ar: "إشعار" })}</span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                      <span className="truncate font-mono">{i.supplierInvoiceNo}</span>
                      <span className="text-faint">·</span>
                      <span className="shrink-0">{f.date(i.invoiceDate, { day: "numeric", month: "short" })}</span>
                    </div>
                  </td>
                  <td className="hidden px-2 py-2.5 align-top @sm:table-cell">
                    <div className={cn("truncate font-mono text-[10.5px]", poFail ? "text-danger" : "text-muted-foreground")} title={i.poRef}>
                      {(i.poRefCorrected ?? i.poRef).replace(/^RBM-PO-\d{2}-/, "") || "—"}
                    </div>
                    {i.poRefCorrected && <div className="truncate font-mono text-[10px] text-faint line-through">{i.poRef.replace(/^RBM-PO-\d{2}-/, "")}</div>}
                  </td>
                  <td className="num px-2 py-2.5 text-end align-top text-[12px]">{fmt2(i.total)}</td>
                  <td className="px-3 py-2.5 text-end align-top">
                    <StatusPill tone={st.tone} pulse={st.pulse} className="max-w-full">
                      <span className="truncate">{L(st.label)}</span>
                    </StatusPill>
                    {openVar && m.variance > 0 && <div className="num mt-1 text-[10.5px] text-danger">{fmt2(m.variance)}</div>}
                    {i.status !== "received" && i.payableAmount != null && (
                      <div className="num mt-1 text-[10.5px] text-muted-foreground">
                        {L({ en: "pay", ar: "سداد" })} {fmt2(i.payableAmount)}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {!list.length && (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-[12px] text-muted-foreground">
                  {filter === "resolved"
                    ? L({ en: "Nothing resolved yet — open an exception and build its resolution case.", ar: "لم تُعالج أي حالة بعد — افتح استثناءً وابنِ ملف معالجته." })
                    : L({ en: "No documents in this view.", ar: "لا توجد مستندات في هذا العرض." })}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
        <span className="num">
          {list.length} {L({ en: "shown", ar: "معروض" })}
        </span>
        <span className="num">AED {fmt2(sum)}</span>
      </div>
    </div>
  );
}
