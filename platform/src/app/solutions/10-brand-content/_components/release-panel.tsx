"use client";

import { Check, Download, Minus, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RunButton } from "@/components/narvo/run-button";
import { StatusPill } from "@/components/narvo/status";
import { useFormat, useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { openFlags } from "../_lib/checks";
import { buildHandoff, download, handoffMarkdown } from "../_lib/handoff";
import { CHANNEL_ORDER, LANGS, cellId, type BrandState } from "../_lib/types";
import { STATUS_LABEL, STATUS_TONE } from "./labels";

export function ReleasePanel({
  state,
  running,
  onRequest,
  onOpenVariant,
}: {
  state: BrandState;
  running: boolean;
  onRequest: (ids: string[]) => void;
  onOpenVariant: (id: string) => void;
}) {
  const L = useL();
  const fmt = useFormat();
  const rows = CHANNEL_ORDER.flatMap((ch) => LANGS.map((l) => ({ ch, l, id: cellId(ch, l), v: state.variants.find((x) => x.id === cellId(ch, l)) })));
  const ready = rows.filter((r) => r.v?.status === "ready").map((r) => r.id);
  const released = rows.filter((r) => r.v?.status === "released");
  const pending = state.releases.find((r) => r.status === "pending");

  function reason(r: (typeof rows)[number]) {
    const v = r.v;
    if (!v) return L({ en: "not generated", ar: "لم تُنتج" });
    if (v.status === "released") return L({ en: `released v${v.releasedVersion}`, ar: `صادرة v${v.releasedVersion}` });
    if (v.stale) return L({ en: `stale — ${v.stale.factId} changed`, ar: `متقادمة — تغيّرت ${v.stale.factId}` });
    const open = openFlags(v).length;
    if (open) return L({ en: `${open} open flag(s)`, ar: `${open} ملاحظة مفتوحة` });
    if (v.verification?.mode !== "full" || v.status !== "ready") return L({ en: "needs full verification", ar: "تحتاج تحققاً كاملاً" });
    return L({ en: "verified · no open flags", ar: "متحقق منها · بلا ملاحظات" });
  }

  function exportPack(kind: "md" | "json") {
    const pack = buildHandoff(state);
    if (kind === "md") download(`${pack.pack}.md`, handoffMarkdown(pack), "text/markdown;charset=utf-8");
    else download(`${pack.pack}.json`, JSON.stringify(pack, null, 2), "application/json");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-light tracking-tight">{L({ en: "Release gate", ar: "بوابة الإصدار" })}</h2>
          <p className="mt-1 max-w-xl text-[12px] leading-relaxed text-muted-foreground">
            {L({
              en: "Only variants that are fully verified, carry no open flags and reflect the current fact versions can be released. Hana Yousef approves every launch release.",
              ar: "لا تُصدر إلا النسخ المتحقق منها بالكامل، بلا ملاحظات مفتوحة، والمطابقة لأحدث إصدارات الحقائق. تعتمد هناء يوسف كل إصدار للإطلاق.",
            })}
          </p>
        </div>
        <RunButton running={running} onRun={() => onRequest(ready)} disabled={!ready.length || !!pending} icon={<Send />} size="sm">
          {pending ? L({ en: "Release awaiting approval", ar: "الإصدار بانتظار الاعتماد" }) : L({ en: `Request release (${ready.length})`, ar: `طلب الإصدار (${ready.length})` })}
        </RunButton>
      </div>

      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="bg-muted/50">
              <th className="label-caps px-3 py-2 text-start !text-[9.5px]">{L({ en: "Variant", ar: "النسخة" })}</th>
              <th className="label-caps px-2 py-2 text-start !text-[9.5px]">{L({ en: "Status", ar: "الحالة" })}</th>
              <th className="label-caps px-2 py-2 text-start !text-[9.5px]">{L({ en: "Gate", ar: "البوابة" })}</th>
              <th className="w-10 px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => {
              const ch = state.channels.find((c) => c.id === r.ch)!;
              const ok = r.v?.status === "ready" || r.v?.status === "released";
              return (
                <tr key={r.id} className="cursor-pointer hover:bg-muted/40" onClick={() => onOpenVariant(r.id)}>
                  <td className="px-3 py-1.5">
                    {L(ch.name)} <span className="font-mono text-[10.5px] text-muted-foreground">· {r.l.toUpperCase()}</span>
                    {r.v && <span className="num ms-1.5 text-[10.5px] text-faint">v{r.v.version}</span>}
                  </td>
                  <td className="px-2 py-1.5">
                    <StatusPill tone={r.v ? STATUS_TONE[r.v.status] : "neutral"}>{L(STATUS_LABEL[r.v ? r.v.status : "empty"])}</StatusPill>
                  </td>
                  <td className={cn("px-2 py-1.5 text-[11.5px]", ok ? "text-success" : "text-muted-foreground")}>{reason(r)}</td>
                  <td className="px-2 py-1.5 text-end">
                    {ok ? <Check className="ms-auto size-3.5 text-success" /> : r.v ? <X className="ms-auto size-3.5 text-danger/70" /> : <Minus className="ms-auto size-3.5 text-faint" />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {state.releases.length > 0 && (
        <div>
          <div className="label-caps mb-2">{L({ en: "Release requests", ar: "طلبات الإصدار" })}</div>
          <ul className="divide-y divide-border rounded-md border border-border">
            {state.releases.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-[12.5px] font-medium">{r.title}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {r.id} · {r.approver.name} · {fmt.date(r.createdAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    {r.decidedAt && ` → ${fmt.time(r.decidedAt)}`}
                  </div>
                </div>
                <StatusPill tone={r.status === "approved" ? "success" : r.status === "rejected" ? "danger" : "warning"}>
                  {r.status === "approved" ? L({ en: "Approved", ar: "معتمد" }) : r.status === "rejected" ? L({ en: "Rejected", ar: "مرفوض" }) : L({ en: "Pending", ar: "قيد الانتظار" })}
                </StatusPill>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-md border border-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="label-caps">{L({ en: "Handoff pack", ar: "حزمة التسليم" })}</div>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {released.length
                ? L({
                    en: `${released.length} released variant(s) with text, fact IDs, fact values and sources, verification summary, approver and time.`,
                    ar: `${released.length} نسخة صادرة مع النص ومعرّفات الحقائق وقيمها ومصادرها وملخص التحقق والمعتمِد والوقت.`,
                  })
                : L({ en: "Available once variants are released.", ar: "تتاح بعد إصدار النسخ." })}
            </p>
          </div>
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" disabled={!released.length} onClick={() => exportPack("md")}>
              <Download />
              Markdown
            </Button>
            <Button size="sm" variant="outline" disabled={!released.length} onClick={() => exportPack("json")}>
              <Download />
              JSON
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
