"use client";

import { useState } from "react";
import { ChevronRight, FileImage } from "lucide-react";
import { FieldTable, type ExtractedField } from "@/components/narvo/field-table";
import { Confidence } from "@/components/narvo/status";
import { useFormat, useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { ExtractedDocument } from "../_lib/types";
import { FIELD_LABELS, FIELD_ORDER } from "./labels";

function toFields(fields: Record<string, unknown>, L: ReturnType<typeof useL>, aed: (n: number) => string, conf: number): ExtractedField[] {
  const out: ExtractedField[] = [];
  for (const key of FIELD_ORDER) {
    const v = fields[key];
    if (v == null || v === "") continue;
    let value: string;
    if (typeof v === "number") value = /salary|income|amount/i.test(key) ? aed(v) : String(v);
    else if (typeof v === "boolean") value = v ? L({ en: "Yes", ar: "نعم" }) : L({ en: "No", ar: "لا" });
    else value = String(v);
    out.push({ key, label: L(FIELD_LABELS[key]), value, confidence: conf });
  }
  const members = fields.familyMembers as Array<{ relation: string; name: string; dateOfBirth: string | null }> | null;
  if (members?.length)
    out.push({
      key: "familyMembers",
      label: L({ en: "Family members", ar: "أفراد الأسرة" }),
      value: members.map((m) => `${m.relation}: ${m.name}${m.dateOfBirth ? ` (${m.dateOfBirth})` : ""}`).join(" · "),
      confidence: conf,
    });
  const comps = fields.salaryComponents as Array<{ name: string; amount: number }> | null;
  if (comps?.length)
    out.push({
      key: "salaryComponents",
      label: L({ en: "Salary components", ar: "بنود الراتب" }),
      value: comps.map((c) => `${c.name} ${aed(c.amount)}`).join(" · "),
      confidence: conf,
    });
  const credits = fields.salaryCredits as number[] | null;
  if (credits?.length)
    out.push({ key: "salaryCredits", label: L({ en: "Salary credits", ar: "إيداعات الراتب" }), value: credits.map(aed).join(" · "), confidence: conf });
  return out;
}

export function ExtractionList({ items, onView }: { items: ExtractedDocument[]; onView?: (file: string, label: string) => void }) {
  const L = useL();
  const f = useFormat();
  const [open, setOpen] = useState<string | null>(items[0]?.docType ?? null);
  return (
    <div className="divide-y divide-border rounded-md border border-border">
      {items.map((d) => {
        const isOpen = open === d.docType;
        const obs = d.fields.observations as string | undefined;
        return (
          <div key={d.docType}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : d.docType)}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-start hover:bg-muted/40"
            >
              <ChevronRight className={cn("size-3.5 text-faint transition-transform rtl:rotate-180", isOpen && "rotate-90 rtl:rotate-90")} />
              <FileImage className="size-3.5 text-muted-foreground" />
              <span className="flex-1 truncate text-[13px] font-medium">{d.label}</span>
              <Confidence value={d.confidence} />
              <span className="num w-12 text-end text-[10.5px] text-faint">{(d.ms / 1000).toFixed(1)} s</span>
            </button>
            {isOpen && (
              <div className="space-y-2 px-3 pb-3">
                <FieldTable dense fields={toFields(d.fields, L, f.aed, d.confidence)} />
                {obs && <p className="text-[11.5px] leading-relaxed text-muted-foreground">{obs}</p>}
                {d.file && onView && (
                  <button type="button" className="text-[11.5px] text-ai underline underline-offset-2" onClick={() => onView(d.file!, d.label)}>
                    {L({ en: "View the scanned page", ar: "عرض الصفحة الممسوحة" })}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
