/* eslint-disable react-hooks/set-state-in-effect -- effects react to streamed AI runs and server refreshes (external sources). */
"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, Save, ShieldCheck, Scale } from "lucide-react";
import { toast } from "sonner";
import { useFormat, useL, usePrefs } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Pane, SectionLabel, KeyValue } from "@/components/narvo/pane";
import { Markdown } from "@/components/narvo/markdown";
import { StatusPill } from "@/components/narvo/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Criterion, Requisition } from "../_lib/types";

const PROTECTED = [
  { en: "Name & contact details", ar: "الاسم وبيانات الاتصال" },
  { en: "Nationality / citizenship", ar: "الجنسية" },
  { en: "Gender", ar: "الجنس" },
  { en: "Age / date of birth", ar: "العمر / تاريخ الميلاد" },
  { en: "Marital status & dependants", ar: "الحالة الاجتماعية والمعالون" },
  { en: "Religion", ar: "الديانة" },
  { en: "Photo", ar: "الصورة الشخصية" },
  { en: "Place of birth, passport, visa", ar: "مكان الميلاد، جواز السفر، الإقامة" },
];

export function RequisitionTab({ requisition, onSaved }: { requisition: Requisition; onSaved: (c: Criterion[]) => void }) {
  const L = useL();
  const f = useFormat();
  const { lang } = usePrefs();
  const [jdLang, setJdLang] = useState<"en" | "ar">(lang === "ar" ? "ar" : "en");
  const [criteria, setCriteria] = useState<Criterion[]>(requisition.criteria);
  const [saving, setSaving] = useState(false);
  useEffect(() => setCriteria(requisition.criteria), [requisition.criteria]);

  const sum = criteria.reduce((a, c) => a + (Number(c.weight) || 0), 0);
  const dirty = JSON.stringify(criteria) !== JSON.stringify(requisition.criteria);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/solutions/12-recruitment/criteria", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ criteria: criteria.map((c) => ({ ...c, weight: Number(c.weight) || 0 })) }),
      });
      if (!res.ok) throw new Error(await res.text());
      const j = await res.json();
      onSaved(j.criteria);
      toast.success(L({ en: "Criteria saved — priority list re-ranked, change audited", ar: "حُفظت المعايير — أعيد الترتيب وسُجّل التغيير" }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] gap-4 max-lg:grid-cols-1">
      <Pane
        title={L({ en: "Job description", ar: "الوصف الوظيفي" })}
        subtitle={`${requisition.id} · ${L({ en: "posted", ar: "نُشر" })} ${f.date(requisition.postedAt)} · ${L({ en: "closed", ar: "أُغلق" })} ${f.date(requisition.closedAt)}`}
        actions={
          <ToggleGroup type="single" size="sm" variant="outline" value={jdLang} onValueChange={(v) => v && setJdLang(v as "en" | "ar")}>
            <ToggleGroupItem value="en" className="px-2.5 text-[12px]">English</ToggleGroupItem>
            <ToggleGroupItem value="ar" className="px-2.5 text-[12px]">العربية</ToggleGroupItem>
          </ToggleGroup>
        }
      >
        <div className="grid grid-cols-2 gap-x-6 border-b border-border pb-3 max-md:grid-cols-1">
          <KeyValue k={L({ en: "Department", ar: "الإدارة" })} v={L({ en: requisition.department, ar: requisition.departmentAr ?? requisition.department })} />
          <KeyValue k={L({ en: "Grade", ar: "الدرجة" })} v={L({ en: requisition.grade ?? "—", ar: requisition.gradeAr ?? requisition.grade ?? "—" })} />
          <KeyValue k={L({ en: "Hiring manager", ar: "مدير التوظيف" })} v={L({ en: requisition.hiringManager.name, ar: requisition.hiringManager.nameAr ?? requisition.hiringManager.name })} />
          <KeyValue k={L({ en: "Human Capital", ar: "رأس المال البشري" })} v={L({ en: requisition.hr.name, ar: requisition.hr.nameAr ?? requisition.hr.name })} />
          <KeyValue k={L({ en: "Location", ar: "الموقع" })} v={L({ en: requisition.location ?? "—", ar: requisition.locationAr ?? requisition.location ?? "—" })} />
          <KeyValue k={L({ en: "Contract", ar: "العقد" })} v={L({ en: requisition.contract ?? "—", ar: requisition.contractAr ?? requisition.contract ?? "—" })} />
        </div>
        <div className="scrollbar-thin mt-3 max-h-[560px] overflow-y-auto pe-1">
          <Markdown>{jdLang === "ar" ? (requisition.descriptionAr ?? requisition.descriptionEn) : requisition.descriptionEn}</Markdown>
        </div>
      </Pane>

      <div className="flex min-w-0 flex-col gap-4">
        <Pane
          title={L({ en: "Job-related criteria & weights", ar: "المعايير المرتبطة بالوظيفة وأوزانها" })}
          subtitle={L({ en: "Agreed by the hiring manager and HR · editable", ar: "متفق عليها بين مدير التوظيف والموارد البشرية · قابلة للتعديل" })}
          actions={
            <Button size="sm" onClick={save} disabled={!dirty || saving}>
              {saving ? <LoaderCircle className="animate-spin" /> : <Save />}
              {L({ en: "Save", ar: "حفظ" })}
            </Button>
          }
        >
          <ul className="space-y-2.5">
            {criteria.map((c, i) => (
              <li key={c.id} className="rounded-md border border-border p-2.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-muted-foreground">{c.id}</span>
                  <Input
                    value={c.label}
                    onChange={(e) => setCriteria((xs) => xs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                    className="h-7 flex-1 text-[12.5px] font-medium"
                  />
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={c.weight}
                    onChange={(e) => setCriteria((xs) => xs.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) } : x)))}
                    className="num h-7 w-16 text-end text-[12.5px]"
                  />
                  <span className="text-[11px] text-muted-foreground">%</span>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-ai transition-all" style={{ width: `${Math.min(100, (Number(c.weight) / Math.max(sum, 1)) * 100 * 2.5)}%` }} />
                </div>
                {(c.description || c.labelAr) && (
                  <p className="mt-1.5 text-[11.5px] leading-snug text-muted-foreground" dir="auto">
                    {L({ en: c.description ?? "", ar: c.labelAr ?? c.description ?? "" })}
                  </p>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between text-[12px]">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Scale className="size-3.5" />
              {L({ en: "Total weight", ar: "مجموع الأوزان" })}
            </span>
            <span className={cn("num font-medium", sum === 100 ? "text-success" : "text-warning")}>
              {sum}%{sum !== 100 && ` · ${L({ en: "normalised when scoring", ar: "تُطبّع عند الاحتساب" })}`}
            </span>
          </div>
        </Pane>

        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Pane title={L({ en: "Minimum requirements", ar: "الحد الأدنى من المتطلبات" })} subtitle={L({ en: "Checked by rules — no AI", ar: "تُفحص بالقواعد — دون ذكاء اصطناعي" })}>
            <ol className="space-y-2">
              {requisition.minimums.map((m) => (
                <li key={m.id} className="flex gap-2 text-[12px] leading-snug">
                  <span className="font-mono text-[10.5px] text-muted-foreground">{m.id}</span>
                  <span dir="auto">{L({ en: m.label, ar: m.labelAr ?? m.label })}</span>
                </li>
              ))}
            </ol>
          </Pane>
          <Pane title={L({ en: "Fairness guard", ar: "حارس العدالة" })} subtitle={L({ en: "Withheld before any model call", ar: "تُحجب قبل أي استدعاء للنموذج" })}>
            <ul className="space-y-1.5">
              {PROTECTED.map((p) => (
                <li key={p.en} className="flex items-center gap-2 text-[12px]">
                  <ShieldCheck className="size-3.5 text-success" />
                  {L(p)}
                </li>
              ))}
            </ul>
            {requisition.emiratisationPolicy && (
              <div className="mt-3 rounded-md border border-border bg-surface p-2.5 text-[11.5px] leading-relaxed">
                <SectionLabel className="!mb-1">
                  {requisition.emiratisationPolicy.ref} · {L({ en: requisition.emiratisationPolicy.name, ar: requisition.emiratisationPolicy.nameAr ?? requisition.emiratisationPolicy.name })}
                </SectionLabel>
                <span dir="auto">{L({ en: requisition.emiratisationPolicy.rule, ar: requisition.emiratisationPolicy.ruleAr ?? requisition.emiratisationPolicy.rule })}</span>
                <div className="mt-1.5">
                  <StatusPill tone="info">{L({ en: "HR step — never applied by AI", ar: "خطوة للموارد البشرية — لا يطبقها الذكاء الاصطناعي" })}</StatusPill>
                </div>
              </div>
            )}
          </Pane>
        </div>
      </div>
    </div>
  );
}
