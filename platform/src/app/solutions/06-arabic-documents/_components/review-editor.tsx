"use client";

import { useState } from "react";
import { Check, CircleAlert, Info, LoaderCircle, PenLine, TriangleAlert, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { FLAG_LABEL, type Flag, type Lang, type Segment, type Term } from "../_lib/shared";

const cellsOf = (row: string) => row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

function SegText({ seg, which, lang }: { seg: Segment; which: "source" | "target"; lang: Lang }) {
  const text = which === "source" ? seg.source : seg.target;
  if (seg.kind === "table-head" || seg.kind === "table-row") {
    const cells = cellsOf(text || "");
    return (
      <div dir={lang === "ar" ? "rtl" : "ltr"} className={cn("flex flex-wrap gap-y-1 text-[12.5px]", seg.kind === "table-head" && "font-medium")}>
        {cells.map((c, i) => (
          <span key={i} className={cn("px-2 py-0.5", i > 0 && "border-s border-border-strong")}>
            {c || "—"}
          </span>
        ))}
      </div>
    );
  }
  const clean = text.replace(/\*\*(.+?)\*\*/g, "$1");
  return (
    <p
      dir={lang === "ar" ? "rtl" : "ltr"}
      className={cn(
        "leading-relaxed whitespace-pre-wrap",
        lang === "ar" ? "text-[14px]" : "text-[13px]",
        seg.kind === "heading" && "text-[14px] font-semibold",
        seg.kind === "list" && "ps-3",
      )}
    >
      {seg.kind === "list" && <span className="me-1 text-faint">{seg.prefix.trim().replace(/^[-*]$/, "•")}</span>}
      {clean || <span className="text-faint">—</span>}
    </p>
  );
}

const SEV_ICON: Record<Flag["severity"], React.ReactNode> = {
  high: <CircleAlert className="size-3 shrink-0 text-danger" />,
  medium: <TriangleAlert className="size-3 shrink-0 text-warning" />,
  low: <Info className="size-3 shrink-0 text-muted-foreground" />,
  info: <Info className="size-3 shrink-0 text-warning" />,
};

export function ReviewEditor({
  segments,
  source,
  target,
  terms,
  streaming,
  filter,
  onSave,
}: {
  segments: Segment[];
  source: Lang;
  target: Lang;
  terms: Map<string, Term>;
  streaming: boolean;
  filter: "all" | "flagged" | "disputed" | "pending";
  onSave: (segmentId: string, patch: { target?: string; status?: "accepted" | "pending" }) => Promise<void>;
}) {
  const L = useL();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const rows = segments.filter((s) => {
    if (s.kind === "table-sep") return false;
    if (filter === "flagged") return s.flags.some((f) => f.severity === "high" || f.severity === "medium");
    if (filter === "disputed") return s.flags.some((f) => f.kind === "disputed");
    if (filter === "pending") return s.status === "pending";
    return true;
  });

  async function save(id: string, patch: { target?: string; status?: "accepted" | "pending" }) {
    setBusy(id);
    try {
      await onSave(id, patch);
      setEditing(null);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="divide-y divide-border">
      <div className="grid grid-cols-[44px_minmax(0,1fr)_minmax(0,1fr)_72px] gap-3 bg-muted/40 px-3 py-2">
        <span className="label-caps !text-[9.5px]">#</span>
        <span className="label-caps !text-[9.5px]">
          {L({ en: "Source", ar: "الأصل" })} · {source === "ar" ? "العربية" : "English"}
        </span>
        <span className="label-caps !text-[9.5px]">
          {L({ en: "Translation", ar: "الترجمة" })} · {target === "ar" ? "العربية" : "English"}
        </span>
        <span className="label-caps !text-[9.5px] text-end">{L({ en: "Review", ar: "المراجعة" })}</span>
      </div>
      {rows.map((s) => {
        const high = s.flags.some((f) => f.severity === "high");
        const med = s.flags.some((f) => f.severity === "medium");
        const visibleFlags = s.flags.filter((f) => f.severity !== "info" || f.kind === "disputed");
        const isEditing = editing === s.id;
        return (
          <div
            key={s.id}
            className={cn(
              "grid grid-cols-[44px_minmax(0,1fr)_minmax(0,1fr)_72px] gap-3 px-3 py-2.5 transition-colors",
              high && s.status === "pending" && "bg-danger-soft/35",
              !high && med && s.status === "pending" && "bg-warning-soft/35",
              s.status !== "pending" && "bg-success-soft/20",
            )}
          >
            <div className="pt-0.5">
              <span className="font-mono text-[10.5px] text-faint">{s.id}</span>
              {s.kind !== "paragraph" && <div className="text-[9.5px] text-faint uppercase">{s.kind.replace("table-", "row ").replace("row head", "head")}</div>}
            </div>
            <div className="min-w-0">
              <SegText seg={s} which="source" lang={source} />
              {s.terms.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {s.terms.map((id) => {
                    const t = terms.get(id);
                    if (!t) return null;
                    return (
                      <Tooltip key={id}>
                        <TooltipTrigger asChild>
                          <span
                            className={cn(
                              "inline-flex h-[18px] cursor-default items-center rounded-[4px] border px-1.5 text-[10.5px]",
                              t.status === "disputed" ? "border-warning/40 bg-warning-soft text-warning" : "border-ai/20 bg-ai-soft text-ai",
                            )}
                            dir="auto"
                          >
                            {source === "ar" ? t.ar : t.en}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {t.en} = {t.ar} · {t.status === "disputed" ? L({ en: "disputed", ar: "خلافي" }) : L({ en: "approved", ar: "معتمد" })}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="min-w-0">
              {isEditing ? (
                <div className="space-y-1.5">
                  <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} dir={target === "ar" ? "rtl" : "ltr"} rows={Math.min(8, Math.max(2, Math.ceil(draft.length / 70)))} className="text-[13px]" autoFocus />
                  <div className="flex gap-1.5">
                    <Button size="xs" onClick={() => save(s.id, { target: draft })} disabled={busy === s.id}>
                      {busy === s.id ? <LoaderCircle className="animate-spin" /> : <Check />} {L({ en: "Save", ar: "حفظ" })}
                    </Button>
                    <Button size="xs" variant="ghost" onClick={() => setEditing(null)}>
                      <X /> {L({ en: "Cancel", ar: "إلغاء" })}
                    </Button>
                  </div>
                </div>
              ) : s.target ? (
                <button type="button" className="w-full rounded text-start hover:bg-muted/50" onClick={() => !streaming && (setEditing(s.id), setDraft(s.target))}>
                  <SegText seg={s} which="target" lang={target} />
                </button>
              ) : (
                <div className={cn("h-4 w-3/4 rounded bg-muted", streaming && "animate-pulse")} />
              )}
              {visibleFlags.length > 0 && !isEditing && (
                <ul className="mt-1.5 space-y-1">
                  {visibleFlags.map((f, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[11px] leading-snug">
                      {SEV_ICON[f.severity]}
                      <span className="min-w-0">
                        <span className="font-medium">{L(FLAG_LABEL[f.kind])}</span>
                        {f.by === "model" && <span className="text-faint"> · AI</span>}
                        <span className="text-muted-foreground" dir="auto">
                          {" "}
                          — {L(f.message)}
                        </span>
                        {f.by === "model" && f.suggestion && (
                          <button type="button" onClick={() => save(s.id, { target: f.suggestion })} className="ms-1 inline-flex items-center gap-0.5 text-ai hover:underline">
                            <Wand2 className="size-3" />
                            {L({ en: "apply suggestion", ar: "تطبيق الاقتراح" })}
                          </button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex items-start justify-end gap-1">
              {!streaming && s.target && !isEditing && (
                <>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => {
                      setEditing(s.id);
                      setDraft(s.target);
                    }}
                    aria-label="Edit"
                  >
                    <PenLine />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant={s.status === "pending" ? "outline" : "default"}
                    className={cn(s.status !== "pending" && "bg-success text-white hover:bg-success/85")}
                    disabled={busy === s.id}
                    onClick={() => save(s.id, { status: s.status === "pending" ? "accepted" : "pending" })}
                    aria-label="Accept"
                  >
                    {busy === s.id ? <LoaderCircle className="animate-spin" /> : <Check />}
                  </Button>
                </>
              )}
            </div>
          </div>
        );
      })}
      {rows.length === 0 && <p className="p-6 text-center text-[12.5px] text-muted-foreground">{L({ en: "No segments match this filter.", ar: "لا توجد مقاطع مطابقة لهذا المرشح." })}</p>}
    </div>
  );
}
