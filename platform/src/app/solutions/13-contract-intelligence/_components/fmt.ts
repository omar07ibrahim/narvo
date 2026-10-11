import type { Bi } from "../_lib/types";

/** Arabic forms of the MNDA people and roles that appear in the register (WORLD.md). */
const PEOPLE: Record<string, string> = {
  "Eng. Tariq Mahmoud Saleh": "م. طارق محمود صالح",
  "Shamma Khalid Al Mansoori": "شما خالد المنصوري",
  "Vikram Menon": "فيكرام مينون",
  "Eng. Hamad Juma Al Kaabi": "م. حمد جمعة الكعبي",
  "Eng. Omar Yousef Al Hammadi": "م. عمر يوسف الحمادي",
  "Fatima Obaid Al Nuaimi": "فاطمة عبيد النعيمي",
  "Hessa Abdulla Al Suwaidi": "حصة عبدالله السويدي",
  "Sara Ahmed Al Blooshi": "سارة أحمد البلوشي",
  "Yousef Ibrahim Al Hosani": "يوسف إبراهيم الحوسني",
  "Adv. Noura Khalifa Al Qubaisi": "المحامية نورة خليفة القبيسي",
  "Rashed Ali Al Dhaheri": "راشد علي الظاهري",
};

const ROLES: Record<string, Bi> = {
  "Director, Facilities & Assets": { en: "Director, Facilities & Assets", ar: "مدير إدارة المرافق والأصول" },
  "Senior Contracts Officer": { en: "Senior Contracts Officer", ar: "مسؤولة عقود أولى" },
  "Chief Financial Officer": { en: "Chief Financial Officer", ar: "المدير المالي" },
  "Director, Field Operations & Inspection": { en: "Director, Field Operations & Inspection", ar: "مدير العمليات الميدانية والتفتيش" },
  "Director, Planning & Building Permits": { en: "Director, Planning & Building Permits", ar: "مدير التخطيط ورخص البناء" },
  "Director, Housing & Community Services": { en: "Director, Housing & Community Services", ar: "مديرة الإسكان وخدمات المجتمع" },
  "Director, Digital Transformation Office": { en: "Director, Digital Transformation Office", ar: "مديرة مكتب التحول الرقمي" },
  "Manager, Customer Happiness Centre": { en: "Manager, Customer Happiness Centre", ar: "مديرة مركز سعادة المتعاملين" },
  "IT Service Desk Lead": { en: "IT Service Desk Lead", ar: "قائد مكتب خدمة تقنية المعلومات" },
  "Head of Legal Affairs": { en: "Head of Legal Affairs", ar: "رئيسة الشؤون القانونية" },
  // roles returned by the obligation extractor
  contract_owner: { en: "Contract owner", ar: "مالك العقد" },
  contracts_officer: { en: "Senior Contracts Officer", ar: "مسؤولة عقود أولى" },
  finance: { en: "Chief Financial Officer", ar: "المدير المالي" },
  legal: { en: "Head of Legal Affairs", ar: "رئيسة الشؤون القانونية" },
  service_manager: { en: "Service manager", ar: "مدير الخدمة" },
};

export function person(name: string | undefined, lang: string): string {
  if (!name) return "";
  return lang === "ar" ? (PEOPLE[name] ?? name) : name;
}

export function role(r: string | undefined, lang: string): string {
  if (!r) return "";
  const b = ROLES[r];
  return b ? b[lang === "ar" ? "ar" : "en"] : r;
}

export function flagText(fl: string | Bi, lang: string): string {
  return typeof fl === "string" ? fl : fl[lang === "ar" ? "ar" : "en"];
}

/** Compact day count for pills: "4d" / "11d late" — "4 يوم" / "متأخر 11 يوم". */
export function daysShort(days: number | null | undefined, lang: string): string {
  if (days == null) return "—";
  if (lang === "ar") return days < 0 ? `متأخر ${-days} يوم` : `${days} يوم`;
  return days < 0 ? `${-days}d late` : `${days}d`;
}

/** "4 days" / "4 أيام", "11 يوماً" — Arabic counted-noun agreement. */
export function daysLong(n: number, lang: string): string {
  if (lang !== "ar") return `${n} ${n === 1 ? "day" : "days"}`;
  if (n === 1) return "يوم واحد";
  if (n === 2) return "يومان";
  if (n >= 3 && n <= 10) return `${n} أيام`;
  return `${n} يوماً`;
}
