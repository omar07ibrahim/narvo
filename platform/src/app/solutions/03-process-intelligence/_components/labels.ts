const ACT_AR: Record<string, string> = {
  Submitted: "تقديم الطلب",
  "Completeness check": "التحقق من الاكتمال",
  "Returned to applicant": "إعادة الطلب للمتعامل",
  Resubmitted: "إعادة التقديم",
  "Awaiting master-developer NOC": "بانتظار شهادة المطور الرئيسي",
  "NOC received": "استلام شهادة عدم الممانعة",
  "Planning review": "التدقيق التخطيطي",
  "Structural review": "التدقيق الإنشائي",
  "Civil Defence coordination": "التنسيق مع الدفاع المدني",
  "Permit issued": "إصدار الرخصة",
};

const ACT_SHORT: Record<string, { en: string; ar: string }> = {
  Submitted: { en: "Submit", ar: "تقديم" },
  "Completeness check": { en: "Check", ar: "تحقق" },
  "Returned to applicant": { en: "Return", ar: "إعادة" },
  Resubmitted: { en: "Resubmit", ar: "إعادة تقديم" },
  "Awaiting master-developer NOC": { en: "NOC hold", ar: "انتظار الشهادة" },
  "NOC received": { en: "NOC in", ar: "الشهادة" },
  "Planning review": { en: "Planning", ar: "تخطيطي" },
  "Structural review": { en: "Structural", ar: "إنشائي" },
  "Civil Defence coordination": { en: "Civil Defence", ar: "دفاع مدني" },
  "Permit issued": { en: "Issue", ar: "إصدار" },
};

export const activityLabel = (name: string, lang: "en" | "ar") => (lang === "ar" ? (ACT_AR[name] ?? name) : name);
export const activityShort = (name: string, lang: "en" | "ar") => ACT_SHORT[name]?.[lang] ?? (name.length > 16 ? name.slice(0, 15) + "…" : name);

export const DISTRICTS: Record<string, { en: string; ar: string }> = {
  "MN-01": { en: "Downtown", ar: "وسط المدينة" },
  "MN-02": { en: "Al Murjan", ar: "المرجان" },
  "MN-03": { en: "Al Lulu Island", ar: "جزيرة اللؤلؤ" },
  "MN-04": { en: "Al Waha Gardens", ar: "حدائق الواحة" },
  "MN-05": { en: "Ras Al Marsa Industrial", ar: "رأس المرسى الصناعية" },
  "MN-06": { en: "Al Sidr Residential", ar: "السدر السكنية" },
  "MN-07": { en: "Al Ghaf Community", ar: "مجتمع الغاف" },
  "MN-08": { en: "Marina Quarter", ar: "حي المارينا" },
};

export const COHORTS: Array<{ value: string; en: string; ar: string }> = [
  { value: "Q3 2026", en: "Q3 2026 applications", ar: "طلبات الربع الثالث 2026" },
  { value: "Pilot (Oct 2026)", en: "Intake pilot (1–9 Oct)", ar: "تجربة الاستلام (1–9 أكتوبر)" },
  { value: "Carry-in (Jun 2026)", en: "June carry-in", ar: "طلبات يونيو المرحّلة" },
  { value: "all", en: "All cases", ar: "جميع الحالات" },
];

export const REASON_AR: Record<string, string> = {
  "NOC missing or expired": "شهادة عدم الممانعة غير مرفقة أو منتهية",
  "Structural calculations not stamped": "حسابات إنشائية غير مختومة",
  "Site-plan version mismatch": "اختلاف نسخة مخطط الموقع",
  Other: "أسباب أخرى",
};
