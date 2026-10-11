/** Arabic display labels for values stored in English (statuses, categories) and text direction of generated content. */

export const WO_STATUS: Record<string, { en: string; ar: string }> = {
  "Issued to contractor": { en: "Issued to contractor", ar: "صدر للمقاول" },
  "Completed — verification pending": { en: "Completed — verification pending", ar: "منجز — بانتظار التحقق" },
  "Verified & closed": { en: "Verified & closed", ar: "تم التحقق والإغلاق" },
  "Verification failed — returned to contractor": { en: "Verification failed — returned to contractor", ar: "فشل التحقق — أُعيد إلى المقاول" },
  "Awaiting post-completion data": { en: "Awaiting post-completion data", ar: "بانتظار بيانات ما بعد الإنجاز" },
};

export const CATEGORY: Record<string, { en: string; ar: string }> = {
  "Comfort — too hot": { en: "Comfort — too hot", ar: "الراحة — حرارة مرتفعة" },
  "Comfort — too cold": { en: "Comfort — too cold", ar: "الراحة — برودة زائدة" },
  "Comfort — stuffy / ventilation": { en: "Comfort — stuffy / ventilation", ar: "الراحة — كتمة / تهوية" },
  "Ventilation / air quality": { en: "Ventilation / air quality", ar: "التهوية / جودة الهواء" },
  "Water leak / plumbing": { en: "Water leak / plumbing", ar: "تسرب مياه / سباكة" },
  "Electrical / lighting": { en: "Electrical / lighting", ar: "كهرباء / إنارة" },
  "Access / security": { en: "Access / security", ar: "الدخول / الأمن" },
  "Cleaning / hygiene": { en: "Cleaning / hygiene", ar: "النظافة" },
  "Structural / fabric": { en: "Structural / fabric", ar: "إنشائي / تشطيبات" },
  Other: { en: "Other", ar: "أخرى" },
};

export const label = (map: Record<string, { en: string; ar: string }>, v: string) => map[v] ?? { en: v, ar: v };

/** Direction by script, so English text generated earlier stays readable in the Arabic UI. */
export function textDir(text: string | undefined | null): "rtl" | "ltr" {
  if (!text) return "ltr";
  const ar = (text.match(/[\u0600-\u06FF]/g) ?? []).length;
  const lat = (text.match(/[A-Za-z]/g) ?? []).length;
  return ar > lat * 0.6 ? "rtl" : "ltr";
}
