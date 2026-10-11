"use client";

import { LoaderCircle, Sparkles } from "lucide-react";
import { StatusPill } from "@/components/narvo/status";
import { useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { countWords, openFlags } from "../_lib/checks";
import { CHANNEL_ORDER, LANGS, cellId, type CellStatus, type Channel, type ChannelId, type Lang, type Variant } from "../_lib/types";
import { STATUS_LABEL, STATUS_TONE } from "./labels";

export function cellStatus(v: Variant | undefined, generating: boolean): CellStatus {
  if (generating) return "generating";
  if (!v) return "empty";
  return v.status;
}

export function VariantMatrix({
  channels,
  variants,
  generating,
  queued,
  selected,
  onSelect,
  onGenerateRow,
  busy,
}: {
  channels: Channel[];
  variants: Variant[];
  generating: Set<string>;
  queued: Set<string>;
  selected: string;
  onSelect: (id: string) => void;
  onGenerateRow: (channel: ChannelId) => void;
  busy: boolean;
}) {
  const L = useL();
  return (
    <div className="px-3 pt-2 pb-3">
      <div className="grid grid-cols-[minmax(0,1fr)_100px_100px] items-end gap-x-1.5 px-1 pb-1.5">
        <span className="label-caps !text-[9.5px]">{L({ en: "Channel", ar: "القناة" })}</span>
        {LANGS.map((l) => (
          <span key={l} className="label-caps text-center !text-[9.5px]">
            {l === "en" ? "English" : "العربية"}
          </span>
        ))}
      </div>
      <div className="divide-y divide-border rounded-md border border-border bg-surface/40">
        {CHANNEL_ORDER.map((cid) => {
          const ch = channels.find((c) => c.id === cid)!;
          return (
            <div key={cid} className="group grid grid-cols-[minmax(0,1fr)_100px_100px] items-stretch gap-x-1.5 p-1.5">
              <div className="relative flex min-w-0 flex-col justify-center ps-1.5">
                <span className="truncate pe-4 text-[12.5px] font-medium">{L(ch.short)}</span>
                <span className="num truncate text-[10.5px] text-muted-foreground">
                  {ch.words[0]}–{ch.words[1]} {L({ en: "w", ar: "ك" })}
                  {ch.headline ? ` · ≤${ch.headline.max}` : ""}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onGenerateRow(cid)}
                  title={L({ en: "Generate this row (EN + AR)", ar: "إنتاج هذا الصف (EN + AR)" })}
                  className="absolute end-0 top-0.5 rounded p-0.5 text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-ai disabled:opacity-30"
                >
                  <Sparkles className="size-3.5" strokeWidth={1.75} />
                </button>
              </div>
              {LANGS.map((l) => (
                <Cell
                  key={l}
                  id={cellId(cid, l)}
                  lang={l}
                  v={variants.find((x) => x.id === cellId(cid, l))}
                  generating={generating.has(cellId(cid, l))}
                  queued={queued.has(cellId(cid, l))}
                  selected={selected === cellId(cid, l)}
                  onSelect={onSelect}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Cell({
  id,
  v,
  lang,
  generating,
  queued,
  selected,
  onSelect,
}: {
  id: string;
  v?: Variant;
  lang: Lang;
  generating: boolean;
  queued: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const L = useL();
  const st = cellStatus(v, generating);
  const open = v ? openFlags(v).length : 0;
  let meta: string;
  if (generating) meta = L({ en: "writing…", ar: "قيد الكتابة…" });
  else if (queued) meta = L({ en: "queued", ar: "في الانتظار" });
  else if (!v) meta = "—";
  else if (st === "stale") meta = `${v.stale?.factId ?? ""} ${L({ en: "changed", ar: "تغيّر" })}`;
  else if (open) meta = `v${v.version} · ${open} ${L({ en: open === 1 ? "flag" : "flags", ar: "ملاحظة" })}`;
  else meta = `v${v.version} · ${countWords(v.body)} ${L({ en: "w", ar: "ك" })}`;
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      dir={lang === "ar" ? "rtl" : "ltr"}
      className={cn(
        "flex min-h-[52px] flex-col items-start justify-between gap-1 rounded-md border px-2 py-1.5 text-start transition-colors",
        selected ? "border-ai/50 bg-ai-soft/40 ring-1 ring-ai/30" : "border-border bg-card hover:bg-muted/60",
        st === "empty" && !selected && "border-dashed bg-transparent",
      )}
    >
      {generating ? (
        <span className="inline-flex h-5 items-center gap-1.5 text-[11px] font-medium text-ai">
          <LoaderCircle className="size-3 animate-spin" />
          {L(STATUS_LABEL.generating)}
        </span>
      ) : (
        <StatusPill tone={queued ? "ai" : STATUS_TONE[st]} pulse={queued}>
          <span dir="auto">{queued ? L({ en: "Queued", ar: "بالانتظار" }) : L(STATUS_LABEL[st])}</span>
        </StatusPill>
      )}
      {/* Cell aligns with the variant's language; its labels read in the UI language. */}
      <span dir="auto" className={cn("num max-w-full truncate text-[10.5px]", open && st === "flagged" ? "text-danger" : "text-muted-foreground")}>
        {meta}
      </span>
    </button>
  );
}
