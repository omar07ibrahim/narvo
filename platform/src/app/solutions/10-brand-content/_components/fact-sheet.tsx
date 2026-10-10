"use client";

import { useState } from "react";
import { ArrowRight, LoaderCircle, PenLine, RefreshCw, Save, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusPill } from "@/components/narvo/status";
import { useFormat, useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Channel, Fact, FactChange, FactSheetMeta, Variant } from "../_lib/types";
import { STATUS_LABEL, STATUS_TONE } from "./labels";
import { Bidi } from "./highlighted-copy";

const AUTHORISERS = [
  { name: "Tariq Nasser", role: { en: "General Manager, RBM (Technical Services)", ar: "المدير العام، رصين لمواد البناء (الخدمات الفنية)" } },
  { name: "Fadi Khoury", role: { en: "Sales Director, RBM", ar: "مدير المبيعات، رصين لمواد البناء" } },
  { name: "Hana Yousef", role: { en: "Marketing & Brand Manager", ar: "مديرة التسويق والعلامة التجارية" } },
];

interface EditState {
  factId: string;
  value: string;
  valueAr: string;
  numeric: string;
  reason: string;
  authorisedBy: string;
}

const numStr = (n: Fact["numeric"]) => (n == null ? "" : Array.isArray(n) ? `${n[0]}–${n[1]}` : String(n));

function swapNumber(text: string, from: number, to: number) {
  const re = new RegExp(`(?<![\\d.])${String(from).replace(".", "\\.")}(?![\\d.])`, "g");
  return text.replace(re, String(to));
}

export function FactSheetPanel({
  meta,
  facts,
  changes,
  variants,
  channels,
  busy,
  onChanged,
  onRegenerate,
  onOpenVariant,
}: {
  meta: FactSheetMeta;
  facts: Fact[];
  changes: FactChange[];
  variants: Variant[];
  channels: Channel[];
  busy: boolean;
  onChanged: (change: FactChange) => void;
  onRegenerate: () => void;
  onOpenVariant: (id: string) => void;
}) {
  const L = useL();
  const fmt = useFormat();
  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = changes[0];
  const stale = variants.filter((v) => v.status === "stale");

  function open(f: Fact, preset?: { to: number; reason: string; by: string }) {
    setError(null);
    if (preset && typeof f.numeric === "number") {
      setEdit({
        factId: f.id,
        value: swapNumber(f.value, f.numeric, preset.to),
        valueAr: swapNumber(f.valueAr, f.numeric, preset.to),
        numeric: String(preset.to),
        reason: preset.reason,
        authorisedBy: preset.by,
      });
    } else {
      setEdit({ factId: f.id, value: f.value, valueAr: f.valueAr, numeric: numStr(f.numeric), reason: "", authorisedBy: f.kind === "price" ? "Fadi Khoury" : f.kind === "cta" || f.kind === "launch_date" ? "Hana Yousef" : "Tariq Nasser" });
    }
  }

  async function save() {
    if (!edit) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/solutions/10-brand-content/facts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...edit, numeric: edit.numeric.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      toast.success(L({ en: `${edit.factId} saved as v${data.fact.version}`, ar: `حُفظت ${edit.factId} كإصدار ${data.fact.version}` }), {
        description: L({ en: `${data.affected.length} variant(s) marked stale`, ar: `${data.affected.length} نسخة أصبحت متقادمة` }),
      });
      setEdit(null);
      onChanged(data.change);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const war = facts.find((f) => f.kind === "warranty");
  const price = facts.find((f) => f.kind === "price");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[18px] font-light tracking-tight">{L(meta.title)}</h2>
          </div>
          <p className="mt-1 text-[11.5px] text-muted-foreground">
            {meta.id} v{meta.version} · {L({ en: "approved by", ar: "اعتمدها" })} {meta.approvedBy}, {meta.approvedByRole} · {fmt.date(meta.approvedOn)}
          </p>
          <p className="mt-1.5 max-w-2xl text-[12px] leading-relaxed text-muted-foreground">{L(meta.note)}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {war && typeof war.numeric === "number" && (
            <Button size="sm" variant="outline" disabled={busy || !!edit} onClick={() => open(war, { to: war.numeric === 10 ? 12 : (war.numeric as number) + 2, reason: "Coastal Coatings extended the system guarantee after accelerated weathering results (Technical Services memo TS-MEMO-26-031)", by: "Tariq Nasser" })}>
              <PenLine />
              {L({ en: `Warranty ${war.numeric} → ${war.numeric === 10 ? 12 : war.numeric + 2} years`, ar: `الضمان ${war.numeric} ← ${war.numeric === 10 ? 12 : war.numeric + 2} سنة` })}
            </Button>
          )}
          {price && typeof price.numeric === "number" && (
            <Button size="sm" variant="outline" disabled={busy || !!edit} onClick={() => open(price, { to: price.numeric === 385 ? 399 : (price.numeric as number) + 14, reason: "PL-2026-Q4 amendment approved by Sales after the resin cost increase", by: "Fadi Khoury" })}>
              <PenLine />
              {L({ en: `Price AED ${price.numeric} → ${price.numeric === 385 ? 399 : price.numeric + 14}`, ar: `السعر ${price.numeric} ← ${price.numeric === 385 ? 399 : price.numeric + 14} درهم` })}
            </Button>
          )}
        </div>
      </div>

      {/* change impact */}
      {latest && (
        <div className="rounded-md border border-warning/35 bg-warning-soft/40 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="label-caps !text-[9.5px]">{L({ en: "Latest spec change · impact", ar: "آخر تغيير في المواصفات · الأثر" })}</div>
              <div className="mt-1 text-[13px]">
                <span className="font-mono text-[11.5px] text-muted-foreground">{latest.factId}</span> {L(latest.label)} → v{latest.version}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px]" dir="auto">
                <span className="text-danger line-through decoration-danger/50">{L({ en: latest.from, ar: latest.fromAr })}</span>
                <ArrowRight className="size-3 text-faint rtl:rotate-180" />
                <span className="text-success">{L({ en: latest.to, ar: latest.toAr })}</span>
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {latest.authorisedBy} · {fmt.date(latest.at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} — {latest.reason}
              </div>
            </div>
            <Button size="sm" disabled={busy || !stale.length} onClick={onRegenerate}>
              {busy ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
              {stale.length
                ? L({ en: `Regenerate affected (${stale.length})`, ar: `إعادة إنتاج المتأثرة (${stale.length})` })
                : L({ en: "All affected variants updated", ar: "حُدّثت كل النسخ المتأثرة" })}
            </Button>
          </div>
          <ul className="mt-2.5 grid grid-cols-2 gap-1.5">
            {latest.affected.map((a) => {
              const v = variants.find((x) => x.id === a.id);
              const ch = v ? channels.find((c) => c.id === v.channel) : null;
              return (
                <li key={a.id}>
                  <button type="button" onClick={() => onOpenVariant(a.id)} className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-start hover:bg-muted/60">
                    <span className="min-w-0">
                      <span className="block truncate text-[12px] font-medium">
                        {ch ? L(ch.short) : a.id} · {v?.lang.toUpperCase()}
                      </span>
                      <span className="block truncate text-[10.5px] text-muted-foreground" dir="auto">
                        {a.reasons.join(" · ")}
                      </span>
                    </span>
                    {v && <StatusPill tone={STATUS_TONE[v.status]}>{L(STATUS_LABEL[v.status])}</StatusPill>}
                  </button>
                </li>
              );
            })}
            {!latest.affected.length && <li className="text-[12px] text-muted-foreground">{L({ en: "No variant uses or states this fact.", ar: "لا توجد نسخة تستخدم هذه الحقيقة أو تذكرها." })}</li>}
          </ul>
        </div>
      )}

      {/* facts table */}
      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="bg-muted/50">
              <th className="label-caps px-3 py-2 text-start !text-[9.5px]">ID</th>
              <th className="label-caps px-2 py-2 text-start !text-[9.5px]">{L({ en: "Fact", ar: "الحقيقة" })}</th>
              <th className="label-caps px-2 py-2 text-start !text-[9.5px]">{L({ en: "Approved value", ar: "القيمة المعتمدة" })}</th>
              <th className="label-caps px-2 py-2 text-start !text-[9.5px]">{L({ en: "Source", ar: "المصدر" })}</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {facts.map((f) => {
              const editingRow = edit?.factId === f.id;
              const prev = f.history?.[0];
              return (
                <tr key={f.id} className={cn("align-top", editingRow && "bg-ai-soft/30", f.version > 1 && !editingRow && "bg-warning-soft/25")}>
                  <td className="w-[72px] px-3 py-2 font-mono text-[11px] whitespace-nowrap text-muted-foreground">
                    {f.id}
                    <div className="num mt-0.5 text-[10px] text-faint">v{f.version}</div>
                  </td>
                  <td className="w-[128px] px-2 py-2 font-medium">{L(f.label)}</td>
                  <td className="px-2 py-2">
                    {editingRow ? (
                      <div className="space-y-1.5">
                        <Input value={edit.value} onChange={(e) => setEdit({ ...edit, value: e.target.value })} className="h-8 text-[12.5px]" />
                        <Input value={edit.valueAr} onChange={(e) => setEdit({ ...edit, valueAr: e.target.value })} dir="rtl" className="h-8 text-[12.5px]" />
                        {f.numeric != null && (
                          <div className="flex items-center gap-2">
                            <span className="label-caps !text-[9.5px]">{L({ en: "Numeric", ar: "القيمة الرقمية" })}</span>
                            <Input value={edit.numeric} onChange={(e) => setEdit({ ...edit, numeric: e.target.value })} className="num h-7 w-28 text-[12px]" />
                            {f.unit && <span className="text-[11px] text-muted-foreground">{f.unit}</span>}
                          </div>
                        )}
                        <Textarea
                          value={edit.reason}
                          onChange={(e) => setEdit({ ...edit, reason: e.target.value })}
                          placeholder={L({ en: "Reason for the change (required, audited)", ar: "سبب التغيير (مطلوب، يُسجّل)" })}
                          className="min-h-14 text-[12px]"
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <Select value={edit.authorisedBy} onValueChange={(v) => setEdit({ ...edit, authorisedBy: v })}>
                            <SelectTrigger size="sm" className="h-7 w-auto min-w-48 text-[12px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {AUTHORISERS.map((a) => (
                                <SelectItem key={a.name} value={a.name} className="text-[12px]">
                                  {a.name} — {L(a.role)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button size="xs" disabled={saving || !edit.reason.trim()} onClick={save}>
                            {saving ? <LoaderCircle className="animate-spin" /> : <Save />}
                            {L({ en: "Save new version", ar: "حفظ إصدار جديد" })}
                          </Button>
                          <Button size="xs" variant="ghost" onClick={() => setEdit(null)}>
                            <X />
                            {L({ en: "Cancel", ar: "إلغاء" })}
                          </Button>
                        </div>
                        {error && <p className="rounded border border-danger/25 bg-danger-soft px-2 py-1 text-[11.5px] text-danger">{error}</p>}
                      </div>
                    ) : (
                      <>
                        <div dir="auto" className="leading-relaxed">
                          <Bidi text={L({ en: f.value, ar: f.valueAr })} />
                        </div>
                        {(f.qualifier || f.qualifierAr) && (
                          <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground" dir="auto">
                            {L({ en: f.qualifier ?? "", ar: f.qualifierAr ?? f.qualifier ?? "" })}
                          </div>
                        )}
                        {prev && (
                          <div className="mt-1 text-[11px] text-faint" dir="auto">
                            v{prev.version}: <span className="line-through">{L({ en: prev.value, ar: prev.valueAr })}</span> · {f.changeReason}
                          </div>
                        )}
                      </>
                    )}
                  </td>
                  <td className="w-[132px] px-2 py-2">
                    <div className="font-mono text-[10.5px] text-muted-foreground">{f.source}</div>
                    <div className="mt-0.5 text-[10.5px] text-faint">
                      {f.approvedBy} · {f.approvedOn}
                    </div>
                  </td>
                  <td className="w-10 px-2 py-2 text-end">
                    {!editingRow && (
                      <Button size="icon-xs" variant="ghost" disabled={busy || !!edit} onClick={() => open(f)} title={L({ en: "Edit fact", ar: "تعديل الحقيقة" })}>
                        <PenLine />
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* sources */}
      <div>
        <div className="label-caps mb-2">{L({ en: "Source documents", ar: "المستندات المصدر" })}</div>
        <ul className="grid grid-cols-2 gap-2">
          {meta.sources.map((s) => (
            <li key={s.id} className="rounded-md border border-border p-2.5">
              <div className="font-mono text-[10.5px] text-ai">{s.id}</div>
              <div className="mt-0.5 text-[12px] font-medium leading-snug">{L(s.title)}</div>
              <div className="mt-0.5 text-[10.5px] text-muted-foreground">
                {s.issuer} · {fmt.date(s.date)}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {changes.length > 1 && (
        <div>
          <div className="label-caps mb-2">{L({ en: "Change log", ar: "سجل التغييرات" })}</div>
          <ul className="divide-y divide-border rounded-md border border-border">
            {changes.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-1.5 text-[12px]">
                <span className="min-w-0 truncate" dir="auto">
                  <span className="font-mono text-[10.5px] text-muted-foreground">{c.factId} v{c.version}</span> {c.from} → {c.to}
                </span>
                <span className="shrink-0 text-[10.5px] text-muted-foreground">
                  {c.affected.length} {L({ en: "affected", ar: "متأثرة" })} · {fmt.time(c.at)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
