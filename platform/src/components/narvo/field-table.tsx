"use client";

import { motion } from "motion/react";
import { CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Confidence } from "./status";
import { useL } from "@/lib/i18n";

export interface ExtractedField {
  key: string;
  label: string;
  value: string | null;
  confidence?: number;
  status?: "ok" | "missing" | "mismatch" | "check";
  source?: string;
  note?: string;
}

const STATUS_ICON = {
  ok: <CircleCheck className="size-3.5 text-success" />,
  missing: <CircleAlert className="size-3.5 text-danger" />,
  mismatch: <TriangleAlert className="size-3.5 text-warning" />,
  check: <TriangleAlert className="size-3.5 text-warning" />,
};

export function FieldTable({ fields, className, dense }: { fields: ExtractedField[]; className?: string; dense?: boolean }) {
  const L = useL();
  return (
    <div className={cn("overflow-hidden rounded-md border border-border", className)}>
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="border-b border-border bg-muted/50 text-start">
            <th className="label-caps !text-[9.5px] px-3 py-2 text-start font-medium">{L({ en: "Field", ar: "الحقل" })}</th>
            <th className="label-caps !text-[9.5px] px-3 py-2 text-start font-medium">{L({ en: "Extracted value", ar: "القيمة المستخرجة" })}</th>
            <th className="label-caps !text-[9.5px] w-28 px-3 py-2 text-start font-medium">{L({ en: "Confidence", ar: "الثقة" })}</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f, i) => (
            <motion.tr
              key={f.key}
              initial={false}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.035 }}
              className={cn("border-b border-border last:border-0", f.status === "missing" && "bg-danger-soft/40", f.status === "mismatch" && "bg-warning-soft/40")}
            >
              <td className={cn("px-3 align-top text-muted-foreground", dense ? "py-1.5" : "py-2")}>
                <div className="flex items-center gap-1.5">
                  {f.status && STATUS_ICON[f.status]}
                  <span>{f.label}</span>
                </div>
              </td>
              <td className={cn("px-3 align-top", dense ? "py-1.5" : "py-2")}>
                <div className={cn("font-medium break-words", !f.value && "text-danger")} dir="auto">
                  {f.value ?? L({ en: "Not provided", ar: "غير مقدّم" })}
                </div>
                {(f.note || f.source) && (
                  <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground" dir="auto">
                    {f.note}
                    {f.note && f.source ? " · " : ""}
                    {f.source && <span className="font-mono text-[10.5px]">{f.source}</span>}
                  </div>
                )}
              </td>
              <td className={cn("px-3 align-top", dense ? "py-1.5" : "py-2")}>
                {typeof f.confidence === "number" ? <Confidence value={f.confidence} /> : <span className="text-faint">—</span>}
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
