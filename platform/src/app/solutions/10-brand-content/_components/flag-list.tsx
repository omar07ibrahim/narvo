"use client";

import { useState } from "react";
import { Check, RefreshCw, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dot } from "@/components/narvo/status";
import { useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { SEVERITY_RANK } from "../_lib/checks";
import type { Fact, Flag, Lang, Segment } from "../_lib/types";
import { CATEGORY_LABEL, SEVERITY_TONE, SOURCE_LABEL } from "./labels";
import { Bidi, FactChip } from "./highlighted-copy";

function DismissButton({ onDismiss, busy }: { onDismiss: (note: string) => void; busy?: boolean }) {
  const L = useL();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="xs" variant="ghost" className="text-muted-foreground" disabled={busy}>
          <X />
          {L({ en: "Overrule", ar: "تجاوز" })}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="end">
        <div className="label-caps mb-1.5 !text-[9.5px]">{L({ en: "Reviewer note (audited)", ar: "ملاحظة المراجع (تُسجّل)" })}</div>
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={L({ en: "Why is this sentence compliant?", ar: "لماذا هذه الجملة مطابقة؟" })}
          className="h-8 text-[12px]"
        />
        <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
          {L({ en: "Only model judgements can be overruled. Computed failures must be fixed.", ar: "يمكن تجاوز أحكام النموذج فقط. أما الإخفاقات الحتمية فيجب إصلاحها." })}
        </p>
        <Button
          size="xs"
          className="mt-2"
          onClick={() => {
            onDismiss(note);
            setOpen(false);
          }}
        >
          <Check />
          {L({ en: "Confirm", ar: "تأكيد" })}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

export function FlagList({
  flags,
  segments,
  facts,
  lang,
  onApply,
  onRegenerate,
  onDismiss,
  busy,
  emptyText,
}: {
  flags: Flag[];
  segments: Segment[];
  facts: Fact[];
  lang: Lang;
  onApply?: (f: Flag) => void;
  onRegenerate?: (instruction: string) => void;
  onDismiss?: (f: Flag, note: string) => void;
  busy?: boolean;
  emptyText?: string;
}) {
  const L = useL();
  const sorted = [...flags].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
  if (!sorted.length)
    return (
      <p className="flex items-center gap-2 rounded-md border border-success/25 bg-success-soft/50 px-3 py-2 text-[12.5px] text-success">
        <Check className="size-3.5" />
        {emptyText ?? L({ en: "No open flags — every sentence is supported by approved facts.", ar: "لا ملاحظات مفتوحة — كل جملة مدعومة بحقائق معتمدة." })}
      </p>
    );
  // keep flags of the same sentence together (ordered by the sentence's worst flag); quote + fix shown once per sentence
  const worstOf = new Map<string, number>();
  for (const f of sorted) {
    const k = f.segmentId ?? `asset:${f.key}`;
    worstOf.set(k, Math.max(worstOf.get(k) ?? 0, SEVERITY_RANK[f.severity]));
  }
  const order = [...worstOf.keys()];
  const grouped = [...sorted].sort((a, b) => {
    const ka = a.segmentId ?? `asset:${a.key}`;
    const kb = b.segmentId ?? `asset:${b.key}`;
    return worstOf.get(kb)! - worstOf.get(ka)! || order.indexOf(ka) - order.indexOf(kb) || SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
  });
  const shown = new Set<string>();
  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {grouped.map((f) => {
        const first = !f.segmentId || !shown.has(f.segmentId);
        if (f.segmentId) shown.add(f.segmentId);
        const seg = f.segmentId && first ? segments.find((s) => s.id === f.segmentId) : null;
        const fx = f.fix;
        const factList = f.factIds.map((id) => facts.find((x) => x.id === id)).filter(Boolean) as Fact[];
        return (
          <li key={f.key} className={cn("px-3 py-2.5", !first && "ps-7")}>
            <div className="flex items-start gap-2.5">
              <Dot tone={SEVERITY_TONE[f.severity]} className="mt-[7px]" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[12.5px] font-medium">{L(f.label)}</span>
                  <span className="text-[10.5px] text-muted-foreground">{L(CATEGORY_LABEL[f.category])}</span>
                  <span
                    className={cn(
                      "rounded-[3px] border px-1 py-px font-mono text-[9.5px]",
                      f.source === "model" ? "border-ai/25 bg-ai-soft text-ai" : "border-border bg-muted text-muted-foreground",
                    )}
                  >
                    {L(SOURCE_LABEL[f.source])}
                  </span>
                  {f.ref && <span className="truncate text-[10px] text-faint">{f.ref}</span>}
                </div>
                <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{L(f.reason)}</p>
                {seg && (
                  <p className="mt-1 line-clamp-2 border-s-2 border-border-strong ps-2 text-[12px] leading-relaxed text-foreground/80" dir={lang === "ar" ? "rtl" : "ltr"}>
                    <Bidi text={seg.text} />
                  </p>
                )}
                {fx?.type === "replaceSegment" && first && (
                  <p className="mt-1 line-clamp-3 border-s-2 border-ai/50 ps-2 text-[12px] leading-relaxed text-ai" dir={lang === "ar" ? "rtl" : "ltr"}>
                    <Bidi text={fx.text} />
                  </p>
                )}
                {fx?.type === "hashtags" && (
                  <p className="mt-1 text-[12px] text-ai" dir="auto">
                    → {fx.hashtags.join(" ")}
                  </p>
                )}
                {factList.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {factList.map((x) => (
                      <FactChip key={x.id} fact={x} compact />
                    ))}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {fx && fx.type !== "regenerate" && onApply && (
                  <Button size="xs" variant="outline" disabled={busy} onClick={() => onApply(f)}>
                    <Wand2 />
                    {L({ en: "Apply fix", ar: "تطبيق" })}
                  </Button>
                )}
                {fx?.type === "regenerate" && onRegenerate && (
                  <Button size="xs" variant="outline" disabled={busy} onClick={() => onRegenerate(fx.instruction)}>
                    <RefreshCw />
                    {L({ en: "Regenerate", ar: "إعادة الإنتاج" })}
                  </Button>
                )}
                {f.source === "model" && onDismiss && <DismissButton busy={busy} onDismiss={(note) => onDismiss(f, note)} />}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
