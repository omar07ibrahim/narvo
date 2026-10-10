"use client";

import { Award, Building2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KeyValue } from "@/components/narvo/pane";
import { StatusPill } from "@/components/narvo/status";
import { useFormat, useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { DEMO_TODAY } from "@/lib/world/orgs";
import type { ProcState, Tender } from "../_lib/types";

export function RegisterView({ tender, state, onOpenDoc }: { tender: Tender; state: ProcState; onOpenDoc: (id: string) => void }) {
  const L = useL();
  const f = useFormat();
  return (
    <div className="grid grid-cols-3 gap-4 max-xl:grid-cols-1">
      {state.suppliers.map((s) => {
        const clar = state.clarifications.filter((c) => c.supplierId === s.id);
        return (
          <section key={s.id} className="flex flex-col rounded-lg border border-border bg-card">
            <header className="border-b border-border px-4 py-3">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex size-8 items-center justify-center rounded-md border border-border bg-surface text-muted-foreground">
                  <Building2 className="size-4" strokeWidth={1.5} />
                </span>
                <div className="min-w-0">
                  <div className="text-[13.5px] font-medium leading-tight">{L({ en: s.name, ar: s.name_ar })}</div>
                  <div className="mt-0.5 font-mono text-[10.5px] text-muted-foreground">
                    {s.registration.no} · {s.licence}
                  </div>
                </div>
              </div>
              {s.awardRecommendation && (
                <div className="mt-2.5 flex items-center gap-2 rounded-md border border-success/25 bg-success-soft/60 px-2.5 py-1.5 text-[11.5px] text-success">
                  <Award className="size-3.5" />
                  {L({ en: "Award recommended", ar: "موصى بالترسية" })} — {s.awardRecommendation.tender} · {s.awardRecommendation.total?.toFixed(2)} {L({ en: "pts", ar: "نقطة" })}
                </div>
              )}
            </header>
            <div className="flex-1 space-y-3 px-4 py-3">
              <div>
                <KeyValue k={L({ en: "Registration", ar: "التسجيل" })} v={<StatusPill tone={s.registration.expiry > DEMO_TODAY ? "success" : "danger"}>{s.registration.status}</StatusPill>} />
                <KeyValue k={L({ en: "Valid to", ar: "ساري حتى" })} v={f.date(s.registration.expiry)} />
                <KeyValue k={L({ en: "Category", ar: "الفئة" })} v={<span className="text-[12px]">{s.registration.category}</span>} />
                <KeyValue k={L({ en: "Staff", ar: "الموظفون" })} v={s.staff.toLocaleString("en")} />
                <KeyValue k="ICV" v={`${s.icv.score}% · ${s.icv.certificate}`} />
                <KeyValue k={L({ en: "Contact", ar: "جهة الاتصال" })} v={<span className="text-[12px]">{s.contact.name}, {s.contact.role}</span>} />
              </div>
              <div>
                <div className="label-caps mb-1.5">{L({ en: "Certificates vs tender closing", ar: "الشهادات مقابل إغلاق المناقصة" })}</div>
                <ul className="space-y-1">
                  {s.certificates.map((c) => {
                    const ok = c.expiry >= tender.closing;
                    return (
                      <li key={c.standard} className="flex items-center gap-2 text-[12px]">
                        <span className={cn("size-1.5 rounded-full", ok ? "bg-success" : "bg-danger")} />
                        <span className="w-20 shrink-0">{c.standard}</span>
                        <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-muted-foreground">{c.number}</span>
                        <span className={cn("num text-[11px]", !ok && "text-danger")}>{f.date(c.expiry)}</span>
                      </li>
                    );
                  })}
                </ul>
                {s.certificates.some((c) => c.updatedBy) && <p className="mt-1 text-[11px] text-ai">{L({ en: "Updated from clarification response", ar: "حُدّث من رد الاستيضاح" })}</p>}
              </div>
              <div>
                <div className="label-caps mb-1.5">{L({ en: "Past performance with MNDA (Art. 40)", ar: "الأداء السابق مع الهيئة (المادة 40)" })}</div>
                {s.pastPerformance.length ? (
                  s.pastPerformance.map((p) => (
                    <div key={p.contract} className="rounded-md bg-surface p-2.5 text-[12px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px]">{p.contract}</span>
                        <span className={cn("num font-medium", p.rating < 3.5 ? "text-warning" : "text-success")}>{p.rating.toFixed(1)} / 5</span>
                      </div>
                      <div className="mt-0.5 text-muted-foreground">
                        {L(p.title)} · {f.aed(p.value)}/{L({ en: "yr", ar: "سنة" })} · {p.period}
                      </div>
                      <p className="mt-1 leading-snug text-muted-foreground" dir="auto">
                        {L(p.note)}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-[12px] text-muted-foreground">{L({ en: "No previous MNDA contracts — registered", ar: "لا عقود سابقة مع الهيئة — مسجل منذ" })} {f.date(s.registration.since)}</p>
                )}
              </div>
              {clar.length > 0 && (
                <div>
                  <div className="label-caps mb-1.5">{L({ en: "Clarifications", ar: "الاستيضاحات" })}</div>
                  {clar.map((c) => (
                    <div key={c.id} className="flex items-center justify-between text-[12px]">
                      <span className="font-mono text-[11px]">{c.ref}</span>
                      <StatusPill tone={c.status === "answered" ? "success" : "info"}>{c.status === "answered" ? L({ en: "Answered", ar: "أُجيب" }) : L({ en: "Issued", ar: "صادر" })}</StatusPill>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <footer className="border-t border-border px-4 py-2">
              <Button variant="ghost" size="xs" className="-ms-2 text-muted-foreground" onClick={() => onOpenDoc(s.id)}>
                <FileText /> {L({ en: "Technical proposal", ar: "العرض الفني" })}
              </Button>
            </footer>
          </section>
        );
      })}
    </div>
  );
}
