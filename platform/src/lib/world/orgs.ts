import type { Bilingual, OrgId } from "@/lib/solutions/registry";

/**
 * The demo world. Both client organisations are fictional; every name, ID and figure is
 * synthetic but internally consistent (see /WORLD.md).
 */

export interface Persona {
  name: string;
  nameAr: string;
  title: string;
  titleAr: string;
  initials: string;
}

export interface OrgMeta {
  id: OrgId;
  name: Bilingual;
  short: string;
  kind: Bilingual;
  monogram: string;
  color: string;
  persona: Persona;
  location: Bilingual;
}

export const ORGS: Record<OrgId, OrgMeta> = {
  mnda: {
    id: "mnda",
    name: { en: "Marsa Al Noor Development Authority", ar: "هيئة مرسى النور للتطوير" },
    short: "MNDA",
    kind: { en: "Government authority", ar: "جهة حكومية" },
    monogram: "MN",
    color: "#1d4f47",
    location: { en: "Marsa Al Noor, UAE", ar: "مرسى النور، الإمارات" },
    persona: {
      name: "Hessa Al Suwaidi",
      nameAr: "حصة السويدي",
      title: "Director, Digital Transformation Office",
      titleAr: "مديرة مكتب التحول الرقمي",
      initials: "HS",
    },
  },
  raseen: {
    id: "raseen",
    name: { en: "Raseen Group", ar: "مجموعة رصين" },
    short: "Raseen",
    kind: { en: "Private group · Building materials & FM", ar: "مجموعة خاصة · مواد البناء وإدارة المرافق" },
    monogram: "RG",
    color: "#7a4e22",
    location: { en: "Dubai · Marsa Al Noor", ar: "دبي · مرسى النور" },
    persona: {
      name: "Karim Haddad",
      nameAr: "كريم حداد",
      title: "Chief Operating Officer",
      titleAr: "الرئيس التنفيذي للعمليات",
      initials: "KH",
    },
  },
  narvo: {
    id: "narvo",
    name: { en: "NARVO Private AI Platform", ar: "منصة نارفو للذكاء الاصطناعي الخاص" },
    short: "NARVO",
    kind: { en: "Platform operations", ar: "تشغيل المنصة" },
    monogram: "N",
    color: "#161513",
    location: { en: "On-premises", ar: "داخل المنشأة" },
    persona: {
      name: "Platform Operator",
      nameAr: "مشغل المنصة",
      title: "NARVO Operations",
      titleAr: "عمليات نارفو",
      initials: "NO",
    },
  },
};

/** "Today" in the demo world. The data set runs up to this date. */
export const DEMO_TODAY = "2026-10-11";
