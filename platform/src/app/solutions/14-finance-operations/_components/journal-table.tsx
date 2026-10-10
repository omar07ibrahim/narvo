"use client";

import { Check } from "lucide-react";
import { useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { fmt2, r2 } from "../_lib/three-way";
import { ACCOUNT_NAMES } from "../_lib/treatments";
import type { JournalLine } from "../_lib/types";

export function JournalTable({ lines, memo, id, posted, className }: { lines: JournalLine[]; memo: string; id?: string; posted?: boolean; className?: string }) {
  const L = useL();
  const dr = r2(lines.reduce((a, l) => a + l.debit, 0));
  const cr = r2(lines.reduce((a, l) => a + l.credit, 0));
  return (
    <div className={cn("overflow-hidden rounded-md border", posted ? "border-success/30" : "border-border", className)}>
      <div className={cn("flex items-center justify-between gap-2 border-b px-3 py-2", posted ? "border-success/25 bg-success-soft/50" : "border-border bg-muted/50")}>
        <span className="label-caps !text-[9.5px]">
          {posted ? L({ en: "Journal posted", ar: "القيد المرحّل" }) : L({ en: "Journal to post on approval", ar: "القيد المقترح عند الاعتماد" })}
          {id && <span className="ms-2 font-mono normal-case tracking-normal text-muted-foreground">{id}</span>}
        </span>
        {lines.length > 0 && (
          <span className={cn("flex items-center gap-1 text-[10.5px]", Math.abs(dr - cr) < 0.005 ? "text-success" : "text-danger")}>
            <Check className="size-3" />
            {Math.abs(dr - cr) < 0.005 ? L({ en: "balanced", ar: "متوازن" }) : L({ en: "out of balance", ar: "غير متوازن" })}
          </span>
        )}
      </div>
      {lines.length === 0 ? (
        <p className="px-3 py-3 text-[12px] text-muted-foreground">{memo}</p>
      ) : (
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-border">
              <th className="label-caps !text-[9px] px-3 py-1.5 text-start font-medium">{L({ en: "Account", ar: "الحساب" })}</th>
              <th className="label-caps !text-[9px] px-3 py-1.5 text-start font-medium">{L({ en: "Narration", ar: "البيان" })}</th>
              <th className="label-caps !text-[9px] w-[96px] px-3 py-1.5 text-end font-medium">{L({ en: "Debit", ar: "مدين" })}</th>
              <th className="label-caps !text-[9px] w-[96px] px-3 py-1.5 text-end font-medium">{L({ en: "Credit", ar: "دائن" })}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {lines.map((l, i) => (
              <tr key={i}>
                <td className="px-3 py-1.5 align-top whitespace-nowrap">
                  <span className="font-mono text-[11px]">{l.account}</span>{" "}
                  <span className="text-muted-foreground">{L(ACCOUNT_NAMES[l.account] ?? { en: l.accountName, ar: l.accountName })}</span>
                </td>
                <td className="px-3 py-1.5 align-top text-[11.5px] text-muted-foreground">{l.memo}</td>
                <td className="num px-3 py-1.5 text-end align-top">{l.debit ? fmt2(l.debit) : ""}</td>
                <td className="num px-3 py-1.5 text-end align-top">{l.credit ? fmt2(l.credit) : ""}</td>
              </tr>
            ))}
            <tr className="bg-muted/40 font-medium">
              <td className="px-3 py-1.5 text-muted-foreground" colSpan={2}>
                {memo}
              </td>
              <td className="num px-3 py-1.5 text-end">{fmt2(dr)}</td>
              <td className="num px-3 py-1.5 text-end">{fmt2(cr)}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}
