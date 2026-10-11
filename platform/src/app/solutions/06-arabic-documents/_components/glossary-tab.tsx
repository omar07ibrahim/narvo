"use client";

import { useEffect, useMemo, useState } from "react";
import { BookA, LoaderCircle, Save, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Workbench, Pane, SectionLabel } from "@/components/narvo/pane";
import { StatusPill } from "@/components/narvo/status";
import { EmptyState } from "@/components/narvo/empty";
import { useFormat, useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { domainLabel, type Term } from "../_lib/shared";
import { ResolveTerm } from "./resolve-term";

export function GlossaryTab({ terms, onTerms }: { terms: Term[]; onTerms: (t: Term[]) => void }) {
  const L = useL();
  const fmt = useFormat();
  const [q, setQ] = useState("");
  const [domain, setDomain] = useState("all");
  const [status, setStatus] = useState<"all" | "approved" | "disputed">("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState<{ en: string; ar: string; note: string; variants_en: string; variants_ar: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const domains = useMemo(() => [...new Set(terms.map((t) => t.domain))].sort(), [terms]);
  const list = useMemo(() => {
    const f = q.trim().toLowerCase();
    return terms
      .filter((t) => domain === "all" || t.domain === domain)
      .filter((t) => status === "all" || t.status === status)
      .filter((t) => !f || `${t.en} ${t.ar} ${(t.variants_en ?? []).join(" ")} ${(t.variants_ar ?? []).join(" ")} ${t.note ?? ""} ${t.id}`.toLowerCase().includes(f));
  }, [terms, q, domain, status]);
  const t = terms.find((x) => x.id === selected) ?? list[0];

  useEffect(() => {
    if (t) setForm({ en: t.en, ar: t.ar, note: t.note ?? "", variants_en: (t.variants_en ?? []).join(", "), variants_ar: (t.variants_ar ?? []).join("، ") });
  }, [t?.id, t?._updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  async function refresh() {
    const res = await fetch("/api/solutions/06-arabic-documents/glossary");
    if (res.ok) onTerms((await res.json()).terms);
  }

  async function save() {
    if (!t || !form) return;
    setBusy(true);
    try {
      const res = await fetch("/api/solutions/06-arabic-documents/glossary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "edit",
          id: t.id,
          patch: {
            en: form.en.trim(),
            ar: form.ar.trim(),
            note: form.note.trim(),
            variants_en: form.variants_en.split(",").map((v) => v.trim()).filter(Boolean),
            variants_ar: form.variants_ar.split(/[،,]/).map((v) => v.trim()).filter(Boolean),
          },
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      onTerms((await res.json()).terms);
      toast.success(L({ en: "Glossary updated — recorded in the audit trail", ar: "حُدّث المسرد — وسُجّل في سجل التدقيق" }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const disputedCount = terms.filter((x) => x.status === "disputed").length;

  return (
    <Workbench cols="minmax(0,1fr) 400px">
      <Pane
        title={L({ en: "MNDA glossary", ar: "مسرد الهيئة" })}
        subtitle={L({
          en: `${terms.length} terms · ${terms.length - disputedCount} approved · ${disputedCount} disputed — governs every translation`,
          ar: `${terms.length} مصطلحاً · ${terms.length - disputedCount} معتمد · ${disputedCount} خلافي — يحكم كل ترجمة`,
        })}
        flush
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute start-2.5 top-2.5 size-3.5 text-faint" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} dir="auto" className="h-8 ps-8 text-[12.5px]" placeholder={L({ en: "Search English or Arabic", ar: "ابحث بالعربية أو الإنجليزية" })} />
          </div>
          <Select value={domain} onValueChange={setDomain}>
            <SelectTrigger size="sm" className="min-w-48 text-[12.5px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-[12.5px]">
                {L({ en: "All domains", ar: "كل المجالات" })}
              </SelectItem>
              {domains.map((d) => (
                <SelectItem key={d} value={d} className="text-[12.5px]">
                  {L(domainLabel(d))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="inline-flex items-center rounded-lg border border-border bg-surface p-0.5">
            {(["all", "approved", "disputed"] as const).map((s) => (
              <button key={s} type="button" onClick={() => setStatus(s)} className={cn("h-7 rounded-md px-2.5 text-[12px] font-medium", status === s ? "bg-foreground text-background" : "text-muted-foreground")}>
                {s === "all" ? L({ en: "All", ar: "الكل" }) : s === "approved" ? L({ en: "Approved", ar: "معتمد" }) : L({ en: "Disputed", ar: "خلافي" })}
              </button>
            ))}
          </div>
        </div>
        <div className="scrollbar-thin max-h-[640px] overflow-y-auto">
          <table className="w-full text-[12.5px]">
            <thead className="sticky top-0 z-[1] bg-card">
              <tr className="border-b border-border bg-muted/40">
                <th className="label-caps px-4 py-2 text-start !text-[9.5px] font-medium">English</th>
                <th className="label-caps px-4 py-2 text-start !text-[9.5px] font-medium">العربية</th>
                <th className="label-caps px-4 py-2 text-start !text-[9.5px] font-medium">{L({ en: "Domain", ar: "المجال" })}</th>
                <th className="label-caps px-4 py-2 text-start !text-[9.5px] font-medium">{L({ en: "Status", ar: "الحالة" })}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.map((x) => (
                <tr key={x.id} onClick={() => setSelected(x.id)} className={cn("cursor-pointer hover:bg-muted/40", t?.id === x.id && "bg-ai-soft/40 hover:bg-ai-soft/50")}>
                  <td className="px-4 py-2">
                    <div className="font-medium">{x.en}</div>
                    <div className="font-mono text-[10px] text-faint">{x.id}</div>
                  </td>
                  <td className="px-4 py-2 text-[13.5px]" dir="rtl">
                    {x.ar}
                  </td>
                  <td className="px-4 py-2 text-[11.5px] text-muted-foreground">{L(domainLabel(x.domain))}</td>
                  <td className="px-4 py-2">
                    {x.status === "disputed" ? <StatusPill tone="warning">{L({ en: "Disputed", ar: "خلافي" })}</StatusPill> : <StatusPill tone="success">{L({ en: "Approved", ar: "معتمد" })}</StatusPill>}
                    {(x._updatedAt || x._createdAt) && <span className="ms-1.5 text-[10px] text-ai">{L({ en: "updated", ar: "محدّث" })}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length === 0 && <EmptyState icon={<BookA className="size-4" />} title={L({ en: "No terms match", ar: "لا توجد مصطلحات مطابقة" })} />}
        </div>
      </Pane>

      <Pane title={t ? <span className="font-mono">{t.id}</span> : L({ en: "Term", ar: "المصطلح" })} actions={t && (t.status === "disputed" ? <StatusPill tone="warning">{L({ en: "Disputed", ar: "خلافي" })}</StatusPill> : <StatusPill tone="success">{L({ en: "Approved", ar: "معتمد" })}</StatusPill>)}>
        {!t || !form ? (
          <EmptyState icon={<BookA className="size-4" />} title={L({ en: "Select a term", ar: "اختر مصطلحاً" })} />
        ) : (
          <div className="space-y-4">
            <div>
              <div className="text-[18px] font-light tracking-tight">{t.en}</div>
              <div className="text-[20px] font-light" dir="rtl">
                {t.ar}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {L(domainLabel(t.domain))} · {t.source} · {L({ en: "updated", ar: "حُدّث" })} {t.updated ? fmt.date(t.updated) : "—"}
              </div>
            </div>
            {t.status === "disputed" && (
              <div className="rounded-md border border-warning/30 bg-warning-soft/30 p-2.5">
                <SectionLabel className="!mb-2">{L({ en: "Resolve the dispute", ar: "حسم الخلاف" })}</SectionLabel>
                <ResolveTerm key={t.id} term={t} onApproved={() => refresh()} />
              </div>
            )}
            <div className="space-y-2">
              <SectionLabel className="!mb-1">{L({ en: "Edit entry", ar: "تحرير المدخل" })}</SectionLabel>
              <div className="grid grid-cols-2 gap-2">
                <Input value={form.en} onChange={(e) => setForm({ ...form, en: e.target.value })} className="h-8 text-[12.5px]" />
                <Input value={form.ar} onChange={(e) => setForm({ ...form, ar: e.target.value })} dir="rtl" className="h-8 text-[13px]" />
              </div>
              <Input value={form.variants_en} onChange={(e) => setForm({ ...form, variants_en: e.target.value })} className="h-8 text-[12px]" placeholder={L({ en: "English variants, comma-separated", ar: "صيغ إنجليزية مفصولة بفواصل" })} />
              <Input value={form.variants_ar} onChange={(e) => setForm({ ...form, variants_ar: e.target.value })} dir="rtl" className="h-8 text-[12.5px]" placeholder="صيغ عربية مفصولة بفواصل" />
              <Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={3} dir="auto" className="text-[12px]" />
              <Button size="sm" onClick={save} disabled={busy}>
                {busy ? <LoaderCircle className="animate-spin" /> : <Save />}
                {L({ en: "Save entry", ar: "حفظ المدخل" })}
              </Button>
            </div>
          </div>
        )}
      </Pane>
    </Workbench>
  );
}
