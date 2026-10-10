"use client";

import { Pane } from "@/components/narvo/pane";
import { useL, usePrefs } from "@/lib/i18n";
import type { Taxonomy } from "../_lib/types";
import { SEV_COLOR, SeverityPill } from "./ui";

export function ChecklistView({ tax }: { tax: Taxonomy }) {
  const L = useL();
  const { lang } = usePrefs();
  const r = tax.regulation;
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Pane title={L({ en: "Defect taxonomy used by the vision model", ar: "تصنيف العيوب المستخدم في نموذج الرؤية" })} subtitle={`${lang === "ar" ? r.title_ar : r.title} · ${r.ref}`} flush>
        <ul className="divide-y divide-border">
          {tax.defects.map((d) => (
            <li key={d.code} className="relative px-4 py-3 ps-5">
              <span className="absolute inset-y-0 start-0 w-1" style={{ background: SEV_COLOR[d.severity] }} />
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded border border-border bg-muted px-1 font-mono text-[10.5px]">{d.code}</span>
                <span className="text-[13px] font-medium">{lang === "ar" ? d.name_ar : d.name}</span>
                <span className="font-mono text-[10.5px] text-muted-foreground">{d.article}</span>
                <SeverityPill severity={d.severity} />
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground" dir="auto">
                {lang === "ar" ? d.requirement_ar : d.requirement}
              </p>
            </li>
          ))}
        </ul>
      </Pane>
      <div className="flex flex-col gap-4">
        <Pane title={L({ en: "Corrective timescales (Art. 31)", ar: "مهل التصحيح (المادة 31)" })}>
          <div className="space-y-3">
            {(["critical", "major", "minor"] as const).map((s) => (
              <div key={s}>
                <div className="flex items-center justify-between">
                  <SeverityPill severity={s} />
                  <span className="num text-[12px] font-medium">AED {tax.severities[s].penaltyAed.toLocaleString("en-US")}</span>
                </div>
                <p className="mt-1 text-[12px] text-muted-foreground" dir="auto">
                  {lang === "ar" ? tax.severities[s].rule_ar : tax.severities[s].rule}
                </p>
              </div>
            ))}
          </div>
        </Pane>
        <Pane title={L({ en: "How AI is used", ar: "كيف يُستخدم الذكاء الاصطناعي" })}>
          <ul className="list-disc space-y-1.5 ps-4 text-[12px] leading-relaxed text-muted-foreground">
            <li>{L({ en: "The vision model proposes candidate findings with an approximate box and a confidence — advisory only (Art. 30.5).", ar: "يقترح نموذج الرؤية ملاحظات مرشحة مع إطار تقريبي ودرجة ثقة — للاستئناس فقط (المادة 30.5)." })}</li>
            <li>{L({ en: "Every flag needs an inspector decision; rejections carry a reason code (R1–R6) and feed the false-flag KPI.", ar: "كل إشارة تحتاج قرار المفتش؛ ويرافق الرفض رمز سبب (R1–R6) ويغذي مؤشر الإنذارات الخاطئة." })}</li>
            <li>{L({ en: "Due dates, repeat escalation and penalties are computed by rules, not by the model.", ar: "المواعيد والتصعيد بسبب التكرار والغرامات تُحتسب بالقواعد لا بالنموذج." })}</li>
            <li>{L({ en: "Notices are served only after the Director's approval; closures are verified by an inspector.", ar: "لا تُبلغ الإشعارات إلا بعد اعتماد المدير؛ ويتحقق المفتش من الإغلاق." })}</li>
          </ul>
        </Pane>
      </div>
    </div>
  );
}
