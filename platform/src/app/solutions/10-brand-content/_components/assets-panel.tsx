"use client";

import { ArrowUpRight } from "lucide-react";
import { StatusPill, type Tone } from "@/components/narvo/status";
import { useFormat, useL } from "@/lib/i18n";
import type { Asset, Fact } from "../_lib/types";
import { FactChip } from "./highlighted-copy";

const TONE: Record<Asset["status"], Tone> = { Draft: "neutral", "In review": "warning", Released: "success", Withdrawn: "danger" };
const LABEL: Record<Asset["status"], { en: string; ar: string }> = {
  Draft: { en: "Draft", ar: "مسودة" },
  "In review": { en: "In review", ar: "قيد المراجعة" },
  Released: { en: "Released", ar: "صادر" },
  Withdrawn: { en: "Withdrawn", ar: "مسحوب" },
};

export function AssetsPanel({ assets, facts, onOpenVariant }: { assets: Asset[]; facts: Fact[]; onOpenVariant: (id: string) => void }) {
  const L = useL();
  const fmt = useFormat();
  const counts = (["Released", "In review", "Draft", "Withdrawn"] as const).map((s) => [s, assets.filter((a) => a.status === s).length] as const);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-light tracking-tight">{L({ en: "Launch asset register", ar: "سجل مواد الإطلاق" })}</h2>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {L({ en: "Every ThermaShield launch asset, its owner and the facts it depends on.", ar: "كل مواد إطلاق ثيرماشيلد ومالكها والحقائق التي تعتمد عليها." })}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {counts.map(([s, n]) => (
            <StatusPill key={s} tone={TONE[s]}>
              {L(LABEL[s])} <span className="num">{n}</span>
            </StatusPill>
          ))}
        </div>
      </div>
      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="bg-muted/50">
              <th className="label-caps px-3 py-2 text-start !text-[9.5px]">{L({ en: "Asset", ar: "المادة" })}</th>
              <th className="label-caps px-2 py-2 text-start !text-[9.5px]">{L({ en: "Owner", ar: "المالك" })}</th>
              <th className="label-caps px-2 py-2 text-start !text-[9.5px]">{L({ en: "Status", ar: "الحالة" })}</th>
              <th className="label-caps px-2 py-2 text-start !text-[9.5px]">{L({ en: "Facts", ar: "الحقائق" })}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {assets.map((a) => (
              <tr key={a.id} className="align-top">
                <td className="px-3 py-2">
                  <div className="flex items-start gap-2">
                    <span className="font-mono text-[10.5px] text-muted-foreground">{a.id}</span>
                    <div className="min-w-0">
                      <div className="font-medium leading-snug">{L(a.title)}</div>
                      <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                        {L(a.type)} · {fmt.date(a.updated)} — {L(a.note)}
                      </div>
                      {a.variantId && (
                        <button type="button" onClick={() => onOpenVariant(a.variantId!)} className="mt-1 inline-flex items-center gap-0.5 text-[11px] text-ai hover:underline">
                          {L({ en: "Open in matrix", ar: "افتح في المصفوفة" })}
                          <ArrowUpRight className="size-3 rtl:-scale-x-100" />
                        </button>
                      )}
                    </div>
                  </div>
                </td>
                <td className="w-[170px] px-2 py-2">
                  <div className="text-[12px]">{a.owner}</div>
                  <div className="text-[10.5px] text-muted-foreground">{a.ownerRole}</div>
                </td>
                <td className="w-[110px] px-2 py-2">
                  <StatusPill tone={TONE[a.status]}>{L(LABEL[a.status])}</StatusPill>
                </td>
                <td className="w-[150px] px-2 py-2">
                  <div className="flex flex-wrap gap-1">
                    {a.factIds.length
                      ? a.factIds.map((id) => {
                          const f = facts.find((x) => x.id === id);
                          return f ? <FactChip key={id} fact={f} compact /> : null;
                        })
                      : <span className="text-[11px] text-faint">{L({ en: "none — pre-fact-sheet", ar: "لا شيء — قبل ورقة الحقائق" })}</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
