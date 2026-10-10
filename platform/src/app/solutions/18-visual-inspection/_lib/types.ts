/** Shared types for 18 — Visual Inspection & Quality Intelligence (client + server). */

export type Severity = "critical" | "major" | "minor";

export interface DefectType {
  code: string;
  name: string;
  name_ar: string;
  severity: Severity;
  article: string;
  requirement: string;
  requirement_ar: string;
  visualCues: string;
}

export interface SeverityRule {
  en: string;
  ar: string;
  dueDays: number;
  dueBasis: "calendar" | "working";
  rule: string;
  rule_ar: string;
  penaltyAed: number;
}

export interface Taxonomy {
  regulation: { code: string; title: string; title_ar: string; ref: string; issued: string; effective: string; owner: string };
  severities: Record<Severity, SeverityRule>;
  defects: DefectType[];
}

export interface Person {
  name: string;
  name_ar: string;
  id: string;
  title?: string;
}

export interface Contractor {
  name: string;
  name_ar: string;
  licence: string;
  email: string;
  siteManager: string;
}

export interface InspectionPhoto {
  src: string;
  caption: string;
  caption_ar?: string;
  credit?: string;
}

export type InspectionStatus = "awaiting_review" | "in_review" | "notice_pending" | "notice_issued" | "closed";

export interface Inspection {
  id: string;
  date: string; // ISO with +04:00
  end?: string;
  plot: string;
  district: string;
  project: string;
  project_ar: string;
  permit: string;
  contractor: string;
  consultant: string;
  inspector: Person;
  type: "Routine" | "Complaint follow-up" | "Re-inspection" | "Ad-hoc capture";
  photos: InspectionPhoto[];
  status: InspectionStatus;
  note: string;
  note_ar?: string;
  weather?: string;
  adhoc?: boolean;
  noticeId?: string;
}

export interface Finding {
  id: string;
  inspectionId: string;
  photo: number;
  code: string;
  title: string;
  description: string;
  bbox: [number, number, number, number] | null;
  confidence: number | null;
  source: "ai" | "reviewer";
  status: "proposed" | "accepted" | "rejected" | "superseded";
  originalCode?: string;
  rejectReason?: string;
  reviewer?: string;
  reviewedAt?: number;
  createdAt: number;
  lang?: "en" | "ar";
}

export interface Closure {
  verdict: "resolved" | "not_resolved" | "inconclusive";
  confidence: number;
  summary: string;
  remaining: string[];
  afterThumb?: string;
  decision: "closed" | "kept_open";
  reason: string;
  decidedBy: string;
  decidedAt: number;
}

export interface CorrectiveTask {
  id: string;
  inspectionId: string;
  findingId: string;
  noticeId: string;
  code: string;
  severity: Severity;
  escalated?: boolean;
  title: string;
  owner: string;
  plot: string;
  dueAt: string;
  penaltyAed: number;
  status: "open" | "closed";
  closure?: Closure;
  /** Closure evidence submitted by the contractor through MNDA e-services */
  submission?: { src: string; submittedAt: string; by: string; note: string };
  attempts?: Array<{ at: number; verdict: string; reason: string }>;
  createdAt: number;
}

export interface Notice {
  id: string;
  inspectionId: string;
  contractor: string;
  plot: string;
  issuedAt: number;
  approvedBy: string;
  textEn: string;
  textAr: string;
  penaltyTotal: number;
  stopWork: boolean;
  findingIds: string[];
}

export interface InspectionState {
  inspections: Inspection[];
  findings: Finding[];
  tasks: CorrectiveTask[];
  notices: Notice[];
}

export const REJECT_REASONS: Array<{ code: string; en: string; ar: string }> = [
  { code: "R1", en: "Protection present outside the frame", ar: "توجد حماية خارج إطار الصورة" },
  { code: "R2", en: "Below the article threshold", ar: "دون الحد المنصوص عليه في المادة" },
  { code: "R3", en: "Not a defect", ar: "ليس عيباً" },
  { code: "R4", en: "Image quality insufficient — re-take", ar: "جودة الصورة غير كافية — يعاد التصوير" },
  { code: "R5", en: "Duplicate of another finding", ar: "مكرر لملاحظة أخرى" },
  { code: "R6", en: "Outside the site / not the contractor's work", ar: "خارج الموقع أو ليس من أعمال المقاول" },
];
