"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useL } from "@/lib/i18n";
import type { Employee, ServiceRequest } from "../_lib/shared";

const AED = (n: number) => n.toLocaleString("en-AE");

/**
 * The issued certificate / letter. Generated deterministically from HR records (never by the model) —
 * salary figures stay with payroll.
 */
export function CertificateDialog({ open, onOpenChange, r, e }: { open: boolean; onOpenChange: (v: boolean) => void; r: ServiceRequest; e?: Employee }) {
  const L = useL();
  if (!e) return null;
  const lang = r.fields.language === "en" ? "en" : "ar";
  const total = e.salary.basic + e.salary.housing + e.salary.transport + e.salary.social + e.salary.other;
  const allowances = total - e.salary.basic;
  const issued = r.completedAt ? new Date(r.completedAt) : new Date();
  const issuedEn = issued.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const issuedAr = issued.toLocaleDateString("ar-AE-u-nu-latn", { day: "numeric", month: "long", year: "numeric" });
  const validUntil = new Date(issued.getTime() + 30 * 86400000);
  const housing = /hous|سكن|إسكان|منح/i.test(`${r.fields.purpose ?? ""} ${r.fields.addressee ?? ""}`);
  const isCert = r.type === "salary_certificate";
  const f = e.gender === "f";

  function print() {
    const node = document.getElementById("mnda-certificate");
    if (!node) return;
    const w = window.open("", "_blank", "width=900,height=1100");
    if (!w) return;
    w.document.write(
      `<!doctype html><html dir="${lang === "ar" ? "rtl" : "ltr"}"><head><meta charset="utf-8"><title>${r.outputRef ?? r.id}</title><style>body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;margin:48px;color:#161513}table{border-collapse:collapse;width:100%}td{padding:6px 0;border-bottom:1px solid #e2ded6}.muted{color:#6c6860}</style></head><body>${node.innerHTML}</body></html>`,
    );
    w.document.close();
    w.focus();
    w.print();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-[760px] overflow-hidden p-0 sm:max-w-[760px]">
        <DialogTitle className="flex items-center justify-between border-b border-border px-4 py-3 text-sm font-medium">
          <span>
            {isCert ? L({ en: "Salary certificate", ar: "شهادة راتب" }) : L({ en: "HR letter", ar: "رسالة إدارية" })} · <span className="font-mono text-[12px] text-muted-foreground">{r.outputRef}</span>
          </span>
          <Button size="sm" variant="outline" onClick={print} className="me-6">
            <Printer /> {L({ en: "Print", ar: "طباعة" })}
          </Button>
        </DialogTitle>
        <div className="scrollbar-thin max-h-[78vh] overflow-auto bg-muted/40 p-6">
          <div id="mnda-certificate" dir={lang === "ar" ? "rtl" : "ltr"} className="mx-auto max-w-[620px] rounded-sm border border-border bg-white px-10 py-9 text-[13px] leading-relaxed text-[#161513] shadow-[0_1px_8px_rgba(0,0,0,0.06)]">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid #cfcac0", paddingBottom: 14 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{lang === "ar" ? "هيئة مرسى النور للتطوير" : "Marsa Al Noor Development Authority"}</div>
                <div className="muted" style={{ fontSize: 11.5, color: "#6c6860" }}>
                  {lang === "ar" ? "إدارة رأس المال البشري — خدمات الموارد البشرية" : "Human Capital Department — HR Services"}
                </div>
              </div>
              <div style={{ fontSize: 11, color: "#6c6860", textAlign: lang === "ar" ? "left" : "right" }}>
                <div style={{ fontFamily: "monospace" }}>{r.outputRef}</div>
                <div>{lang === "ar" ? issuedAr : issuedEn}</div>
              </div>
            </div>
            <h2 style={{ textAlign: "center", fontSize: 18, fontWeight: 600, margin: "22px 0 4px" }}>
              {isCert ? (lang === "ar" ? "شهادة راتب" : "Salary Certificate") : lang === "ar" ? "رسالة" : "Letter"}
            </h2>
            <p style={{ marginTop: 14 }}>
              {lang === "ar" ? "إلى: " : "To: "}
              <strong>{String(r.fields.addressee || (lang === "ar" ? "من يهمه الأمر" : "To whom it may concern"))}</strong>
            </p>
            <p style={{ marginTop: 10 }}>
              {lang === "ar"
                ? `تشهد هيئة مرسى النور للتطوير بأن ${f ? "السيدة" : "السيد"} ${e.nameAr} ${f ? "تعمل" : "يعمل"} لديها بوظيفة ${e.titleAr} في ${e.departmentAr}، بالدرجة الوظيفية (${e.grade.replace("Grade ", "")})، وذلك منذ ${new Date(e.joined).toLocaleDateString("ar-AE-u-nu-latn", { day: "numeric", month: "long", year: "numeric" })} ولا ${f ? "تزال" : "يزال"} على رأس العمل حتى تاريخه.`
                : `This is to certify that ${e.name} is employed by the Marsa Al Noor Development Authority as ${e.title}, ${e.department}, ${e.grade}, since ${new Date(e.joined).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}, and remains in service as of the date of this certificate.`}
            </p>
            {isCert && (
              <>
                <p style={{ marginTop: 10 }}>
                  {lang === "ar" ? `${f ? "وتتقاضى" : "ويتقاضى"} راتباً شهرياً إجمالياً قدره ` : "The employee receives a total monthly salary of "}
                  <strong>{lang === "ar" ? `${AED(total)} درهم` : `AED ${AED(total)}`}</strong>
                  {lang === "ar" ? "، وتفصيله كالآتي:" : ", detailed as follows:"}
                </p>
                {r.fields.includeBreakdown !== false && (
                  <table style={{ marginTop: 8, fontSize: 12.5 }}>
                    <tbody>
                      {[
                        [lang === "ar" ? "الراتب الأساسي" : "Basic salary", e.salary.basic],
                        [lang === "ar" ? "بدل السكن" : "Housing allowance", e.salary.housing],
                        [lang === "ar" ? "بدل المواصلات" : "Transport allowance", e.salary.transport],
                        ...(e.salary.social ? [[lang === "ar" ? "العلاوة الاجتماعية" : "Social allowance", e.salary.social] as [string, number]] : []),
                        ...(e.salary.other ? [[lang === "ar" ? "بدل ميداني" : e.salary.otherLabel ?? "Other allowance", e.salary.other] as [string, number]] : []),
                        [lang === "ar" ? "إجمالي البدلات" : "Total allowances", allowances],
                      ].map(([k, v]) => (
                        <tr key={String(k)}>
                          <td>{k}</td>
                          <td style={{ textAlign: lang === "ar" ? "left" : "right", fontVariantNumeric: "tabular-nums" }}>{lang === "ar" ? `${AED(Number(v))} درهم` : `AED ${AED(Number(v))}`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}
            <p style={{ marginTop: 12 }}>
              {lang === "ar"
                ? `وقد أُعطيت هذه ${isCert ? "الشهادة" : "الرسالة"} بناءً على ${f ? "طلبها" : "طلبه"} لغرض: ${String(r.fields.purpose || "—")}، دون أدنى مسؤولية على الهيئة.`
                : `This ${isCert ? "certificate" : "letter"} is issued at the employee's request for: ${String(r.fields.purpose || "—")}, without any liability on the Authority.`}
            </p>
            {housing && isCert && (
              <p style={{ marginTop: 8, fontSize: 11.5, color: "#6c6860" }}>
                {lang === "ar"
                  ? `صالحة لأغراض طلبات الإسكان حتى ${validUntil.toLocaleDateString("ar-AE-u-nu-latn", { day: "numeric", month: "long", year: "numeric" })} (التعميم رقم 9/2026).`
                  : `Valid for housing applications until ${validUntil.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} (Circular No. 9/2026).`}
              </p>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 34 }}>
              <div>
                <div style={{ fontWeight: 600 }}>{lang === "ar" ? "لطيفة خميس الرميثي" : "Latifa Khamis Al Romaithi"}</div>
                <div style={{ fontSize: 11.5, color: "#6c6860" }}>{lang === "ar" ? "أخصائي أول خدمات الموارد البشرية" : "Senior HR Services Officer"}</div>
                <div style={{ fontSize: 10.5, color: "#9a958c", marginTop: 4 }}>{lang === "ar" ? "موقّعة رقمياً — يمكن التحقق عبر رمز الاستجابة" : "Digitally signed — verify via QR code"}</div>
              </div>
              <svg width="64" height="64" viewBox="0 0 21 21" aria-label="QR">
                {Array.from({ length: 21 * 21 }).map((_, i) => {
                  const x = i % 21;
                  const y = Math.floor(i / 21);
                  const finder = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
                  const ring = finder && (x % 14 === 0 || x % 14 === 6 || y % 14 === 0 || y % 14 === 6 || (x % 14 >= 2 && x % 14 <= 4 && y % 14 >= 2 && y % 14 <= 4));
                  const seed = (r.outputRef ?? r.id).split("").reduce((a, c) => a * 31 + c.charCodeAt(0), 7);
                  const bit = !finder && ((seed >> ((x * 7 + y * 13) % 29)) ^ (x * y + x + y)) & 1;
                  return ring || bit ? <rect key={i} x={x} y={y} width="1" height="1" fill="#161513" /> : null;
                })}
              </svg>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
