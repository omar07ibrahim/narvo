/**
 * Client-safe types for Arabic & Multilingual Document Operations (solution 06).
 */

export type Lang = "ar" | "en";

export interface Bi {
  en: string;
  ar: string;
}

export interface QueueDoc {
  id: string;
  title: string;
  title_ar: string;
  type: string;
  type_ar?: string;
  ref?: string;
  source: Lang;
  target: Lang;
  file?: string;
  text?: string;
  requestedBy: string;
  requestedBy_ar?: string;
  requestedByTitle?: string;
  requestedByTitle_ar?: string;
  purpose?: string;
  purpose_ar?: string;
  received: string;
  due: string;
  priority: "high" | "normal";
  status: "queued" | "in_review" | "reviewed";
  confidentiality?: string;
  custom?: boolean;
  translatedAt?: string;
  reviewedAt?: string;
  _createdAt?: number;
}

export interface Alternative {
  ar: string;
  en: string;
  proposedBy?: string;
  rationale?: string;
}

export interface Term {
  id: string;
  en: string;
  ar: string;
  domain: string;
  status: "approved" | "disputed";
  variants_en?: string[];
  variants_ar?: string[];
  note?: string;
  source?: string;
  updated?: string;
  alternatives?: Alternative[];
  _updatedAt?: number;
  _createdAt?: number;
}

export type SegKind = "heading" | "paragraph" | "list" | "table-head" | "table-sep" | "table-row";

export type FlagKind = "number" | "reference" | "date" | "table" | "glossary" | "disputed" | "length" | "omission" | "addition" | "meaning" | "grammar" | "terminology";

export interface Flag {
  kind: FlagKind;
  severity: "high" | "medium" | "low" | "info";
  message: Bi;
  termId?: string;
  suggestion?: string;
  by: "code" | "model";
}

export interface Segment {
  id: string;
  kind: SegKind;
  prefix: string;
  gapBefore: boolean;
  source: string;
  target: string;
  terms: string[];
  flags: Flag[];
  status: "pending" | "accepted" | "edited";
}

export interface Candidate {
  term: string;
  proposed: string;
  domain: string;
  rationale: string;
  segmentIds: string[];
}

export interface RunMetrics {
  segments: number;
  words: number;
  termOccurrences: number;
  termCompliant: number;
  compliancePct: number | null;
  flags: number;
  highFlags: number;
  disputed: number;
  ms: number;
}

export interface RunResult {
  docId: string;
  source: Lang;
  target: Lang;
  segments: Segment[];
  candidates: Candidate[];
  metrics: RunMetrics;
  model?: string;
  createdAt: string;
  updatedAt?: string;
}

export const FLAG_LABEL: Record<FlagKind, Bi> = {
  number: { en: "Number", ar: "رقم" },
  reference: { en: "Reference", ar: "مرجع" },
  date: { en: "Date", ar: "تاريخ" },
  table: { en: "Table", ar: "جدول" },
  glossary: { en: "Glossary", ar: "المسرد" },
  disputed: { en: "Disputed term", ar: "مصطلح خلافي" },
  length: { en: "Length", ar: "الطول" },
  omission: { en: "Omission", ar: "حذف" },
  addition: { en: "Addition", ar: "إضافة" },
  meaning: { en: "Meaning", ar: "المعنى" },
  grammar: { en: "Grammar", ar: "الصياغة" },
  terminology: { en: "Terminology", ar: "المصطلحات" },
};

export const TERMINOLOGIST = { name: "Mona Abdelrahman Al Hashimi", title: "Senior Translator & Terminology Lead" };

/** Rebuild a markdown document from segments (targets, or sources). */
export function assemble(segments: Segment[], which: "target" | "source" = "target") {
  const out: string[] = [];
  for (const s of segments) {
    if (s.gapBefore && out.length) out.push("");
    if (s.kind === "table-sep") out.push(s.source);
    else if (s.kind === "table-head" || s.kind === "table-row") out.push((which === "target" ? s.target : s.source) || s.source);
    else out.push(`${s.prefix}${(which === "target" ? s.target : s.source) || ""}`);
  }
  return out.join("\n");
}

export function wordCount(text: string) {
  return text.split(/[\s|]+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** Glossary domains in both languages (the glossary stores the English name). */
export const DOMAIN_LABEL: Record<string, { en: string; ar: string }> = {
  "Customer service": { en: "Customer service", ar: "خدمة المتعاملين" },
  "Facilities & engineering": { en: "Facilities & engineering", ar: "المرافق والهندسة" },
  "HR & administration": { en: "HR & administration", ar: "الموارد البشرية والإدارة" },
  Housing: { en: "Housing", ar: "الإسكان" },
  "Legal & governance": { en: "Legal & governance", ar: "الشؤون القانونية والحوكمة" },
  Permits: { en: "Permits", ar: "الرخص" },
  "Planning & building code": { en: "Planning & building code", ar: "التخطيط وكود البناء" },
  "Procurement & contracts": { en: "Procurement & contracts", ar: "المشتريات والعقود" },
};
export const domainLabel = (d: string) => DOMAIN_LABEL[d] ?? { en: d, ar: d };
