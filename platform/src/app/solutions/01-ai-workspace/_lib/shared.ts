/**
 * Client-safe constants and types for the Enterprise AI Workspace (solution 01).
 * Roles decide which classification levels can be retrieved — enforced on the server.
 */

export type Classification = "Public" | "Internal" | "Confidential";
export type RoleKey = "case_officer" | "director" | "contractor";
export type ScopeKey = "all" | "circulars" | "services" | "policies" | "hr" | "it" | "building-code" | "strategy" | "other";
export type Mode = "ask" | "draft" | "act";

export interface Bi {
  en: string;
  ar: string;
}

export interface RoleDef {
  key: RoleKey;
  label: Bi;
  persona: { name: string; nameAr: string; title: Bi; email: string };
  access: Classification[];
  canAct: boolean;
}

export const ROLES: Record<RoleKey, RoleDef> = {
  case_officer: {
    key: "case_officer",
    label: { en: "Case officer", ar: "موظف معالجة" },
    persona: {
      name: "Khalfan Mohammed Al Ali",
      nameAr: "خلفان محمد العلي",
      title: { en: "Senior Case Officer, Housing", ar: "موظف حالات أول، الإسكان" },
      email: "khalfan.alali@mnda.gov.ae",
    },
    access: ["Public", "Internal"],
    canAct: true,
  },
  director: {
    key: "director",
    label: { en: "Director", ar: "مدير إدارة" },
    persona: {
      name: "Hessa Abdulla Al Suwaidi",
      nameAr: "حصة عبدالله السويدي",
      title: { en: "Director, Digital Transformation Office", ar: "مديرة مكتب التحول الرقمي" },
      email: "hessa.alsuwaidi@mnda.gov.ae",
    },
    access: ["Public", "Internal", "Confidential"],
    canAct: true,
  },
  contractor: {
    key: "contractor",
    label: { en: "Contractor (external)", ar: "مقاول (جهة خارجية)" },
    persona: {
      name: "Samir Nabil Haddad",
      nameAr: "سمير نبيل حداد",
      title: { en: "Project Director, Gulf Crest Builders LLC", ar: "مدير المشروع، جلف كرست للمقاولات" },
      email: "external portal",
    },
    access: ["Public"],
    canAct: false,
  },
};

export const SCOPES: Array<{ key: ScopeKey; label: Bi }> = [
  { key: "all", label: { en: "All knowledge", ar: "كل المعرفة" } },
  { key: "circulars", label: { en: "Circulars", ar: "التعاميم" } },
  { key: "services", label: { en: "Services", ar: "الخدمات" } },
  { key: "policies", label: { en: "Policies", ar: "السياسات" } },
  { key: "hr", label: { en: "HR", ar: "الموارد البشرية" } },
  { key: "it", label: { en: "IT", ar: "تقنية المعلومات" } },
  { key: "building-code", label: { en: "Building code", ar: "كود البناء" } },
  { key: "strategy", label: { en: "Strategy", ar: "الاستراتيجية" } },
  { key: "other", label: { en: "Other collections", ar: "مجموعات أخرى" } },
];

export const CLASS_LABEL: Record<Classification, Bi> = {
  Public: { en: "Public", ar: "عام" },
  Internal: { en: "Internal", ar: "داخلي" },
  Confidential: { en: "Confidential", ar: "سري" },
};

export interface LibraryDoc {
  id: string;
  title: string;
  title_ar?: string;
  title_en?: string;
  type?: string;
  ref?: string;
  date?: string;
  effective?: string;
  owner?: string;
  classification: Classification;
  lang?: string;
  scope: ScopeKey;
  file: string;
  passages: number;
  chars: number;
}

export interface TaskRecord {
  id: string;
  title: string;
  description?: string;
  owner: string;
  ownerTitle?: string;
  ownerEmail?: string;
  department?: string;
  due: string;
  priority: "high" | "normal" | "low";
  sources?: Array<{ docId: string; ref?: string; title?: string }>;
  status: "open" | "done";
  createdBy: string;
  createdVia: "NARVO agent" | "Manual";
  createdAt: string;
  completedAt?: string;
  _createdAt?: number;
  _updatedAt?: number;
}

export interface OutboxItem {
  id: string;
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  from: string;
  sentAt: string;
  sources?: Array<{ docId: string; ref?: string }>;
  _createdAt?: number;
}

export interface Attachment {
  name: string;
  text: string;
  kind: "text" | "image";
}

export const DRAFT_KINDS: Array<{ key: "briefing" | "reply_letter" | "faq" | "email"; label: Bi; hint: Bi }> = [
  {
    key: "briefing",
    label: { en: "Briefing note", ar: "مذكرة إحاطة" },
    hint: { en: "For a director or committee — context, facts, issues, recommendations", ar: "لمدير أو لجنة — السياق والحقائق والقضايا والتوصيات" },
  },
  {
    key: "reply_letter",
    label: { en: "Reply letter", ar: "رسالة رد" },
    hint: { en: "Formal reply to a citizen, contractor or consultant", ar: "رد رسمي على متعامل أو مقاول أو استشاري" },
  },
  {
    key: "faq",
    label: { en: "FAQ", ar: "أسئلة شائعة" },
    hint: { en: "Questions and answers for the Customer Happiness Centre", ar: "أسئلة وأجوبة لمراكز إسعاد المتعاملين" },
  },
  {
    key: "email",
    label: { en: "Email", ar: "بريد إلكتروني" },
    hint: { en: "Short internal email with clear asks and dates", ar: "رسالة داخلية قصيرة بطلبات وتواريخ واضحة" },
  },
];

export function accessLabel(access: Classification[], lang: "en" | "ar") {
  return access.map((c) => CLASS_LABEL[c][lang]).join(" + ");
}
