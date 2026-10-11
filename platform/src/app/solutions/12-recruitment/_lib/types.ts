/**
 * Shared (client + server) types and pure helpers for 12 — Recruitment & Hiring Intelligence.
 */

export interface Criterion {
  id: string;
  label: string;
  labelAr?: string;
  weight: number;
  description?: string;
  evidence?: string;
}

export interface Minimum {
  id: string;
  label: string;
  labelAr?: string;
}

export interface Person {
  name: string;
  nameAr?: string;
  title: string;
}

export interface Requisition {
  id: string;
  title: string;
  titleAr?: string;
  department: string;
  departmentAr?: string;
  grade?: string;
  gradeAr?: string;
  location?: string;
  locationAr?: string;
  contract?: string;
  contractAr?: string;
  postedAt: string;
  closedAt: string;
  openings?: number;
  hiringManager: Person;
  hr: Person;
  recruiter?: Person;
  descriptionEn: string;
  descriptionAr?: string;
  minimums: Minimum[];
  criteria: Criterion[];
  interviewPanel?: Person[];
  emiratisationPolicy?: { ref: string; name: string; nameAr?: string; rule: string; ruleAr?: string };
  stage?: string;
  shortlist?: string[];
}

export interface Application {
  id: string;
  submittedAt: string;
  source: string;
  candidate: {
    name: string;
    nameAr?: string;
    nationality: string;
    gender: string;
    dateOfBirth: string;
    maritalStatus?: string;
    email?: string;
    mobile?: string;
  };
  profile: {
    degree: string;
    degreeField: string;
    degreeLevel: string;
    university?: string;
    graduationYear?: number;
    yearsExperience: number;
    yearsPermitReview: number;
    registration: string | null;
    currentRole?: string;
    currentEmployer?: string;
    location?: string;
    attachments: { cv: boolean; degree: boolean };
  };
  cvFile: string | null;
  headline: string;
}

export interface ScreenReason {
  id: string;
  detail: string;
}

export interface ScreenedApplication extends Application {
  pass: boolean;
  reasons: ScreenReason[];
}

export interface CriterionRating {
  criterionId: string;
  rating: number;
  evidence: string;
  evidenceFound: boolean;
  gaps: string;
  confidence?: number;
}

export interface Evaluation {
  appId: string;
  ratings: CriterionRating[];
  summary: string;
  strengths: string[];
  risks: string[];
  interviewFocus: string[];
  ms: number;
  model?: string;
  at: string;
  redactions: number;
  criteriaKey: string;
  source: "application" | "upload";
  label?: string;
  lang?: "en" | "ar";
}

export interface RatingChange {
  criterionId: string;
  before: number;
  after: number;
  evidence: string;
  reason: string;
}

export interface InterviewUpdate {
  appId: string;
  at: string;
  date?: string;
  panel?: string;
  consent: string;
  changes: RatingChange[];
  newEvidence: string[];
  concerns: string[];
  summary: string;
  ms: number;
}

export interface Upload {
  id: string;
  label: string;
  text: string;
  at: string;
}

export interface Invitation {
  id: string;
  appId: string;
  to: string;
  subjectEn: string;
  bodyEn: string;
  subjectAr: string;
  bodyAr: string;
  slot: string;
  status: string;
  createdAt: string;
}

export interface Redaction {
  kind: string;
  original: string;
}

export interface RecruitmentState {
  requisition: Requisition;
  applications: ScreenedApplication[];
  evaluations: Record<string, Evaluation>;
  interviews: Record<string, InterviewUpdate[]>;
  uploads: Upload[];
  shortlist: string[];
  policyApplied: boolean;
  rationale: { text: string; at: string } | null;
  invitations: Invitation[];
  approvals: Array<{ id: string; title: string; summary: string; solution: string; actionLabel: string; approver: Person; status: "pending" | "approved" | "rejected"; createdAt: number; payload?: unknown }>;
  interviewSamples: string[];
}

export const ACCEPTED_FIELDS = ["civil", "structural", "architectural_engineering", "architecture", "urban_planning"];

export const MIN_DETAIL = {
  "MIN-1": { en: "Accepted degree", ar: "المؤهل المقبول" },
  "MIN-2": { en: "≥ 8 years experience", ar: "خبرة 8 سنوات فأكثر" },
  "MIN-3": { en: "≥ 3 years permit review", ar: "3 سنوات فأكثر في مراجعة الرخص" },
  "MIN-4": { en: "Registration", ar: "التسجيل المهني" },
  "MIN-5": { en: "Complete application", ar: "طلب مكتمل" },
} as const;

/** Deterministic minimum-requirement screening — no AI involved. */
export function screen(a: Application): ScreenReason[] {
  const r: ScreenReason[] = [];
  const p = a.profile;
  if (!ACCEPTED_FIELDS.includes(p.degreeField))
    r.push({ id: "MIN-1", detail: `${p.degree} — not an accepted discipline` });
  else if (p.degreeLevel === "diploma") r.push({ id: "MIN-1", detail: `${p.degree} — diploma, bachelor's degree required` });
  if (p.yearsExperience < 8) r.push({ id: "MIN-2", detail: `${p.yearsExperience} years post-graduate experience (minimum 8)` });
  if (p.yearsPermitReview < 3)
    r.push({ id: "MIN-3", detail: `${p.yearsPermitReview} year${p.yearsPermitReview === 1 ? "" : "s"} in permit review / authority submissions (minimum 3)` });
  if (!p.registration) r.push({ id: "MIN-4", detail: "No UAE or transferable professional registration stated" });
  if (!p.attachments.cv) r.push({ id: "MIN-5", detail: "CV not attached" });
  else if (!p.attachments.degree) r.push({ id: "MIN-5", detail: "Degree certificate not attached" });
  return r;
}

export function criteriaKey(criteria: Criterion[]) {
  return criteria.map((c) => `${c.id}:${c.label}`).join("|");
}

/** Weighted score 0–100 from 0–4 ratings; weights are normalised so edits never need to sum to exactly 100. */
export function weightedScore(ratings: Array<{ criterionId: string; rating: number }>, criteria: Criterion[]) {
  const total = criteria.reduce((a, c) => a + Math.max(0, c.weight), 0) || 1;
  let s = 0;
  for (const c of criteria) {
    const r = ratings.find((x) => x.criterionId === c.id);
    s += (Math.max(0, c.weight) / total) * ((r?.rating ?? 0) / 4);
  }
  return Math.round(s * 1000) / 10;
}

/** Ratings after applying any interview updates (latest wins). */
export function effectiveRatings(ev: Evaluation, updates?: InterviewUpdate[]) {
  const map = new Map(ev.ratings.map((r) => [r.criterionId, { ...r }]));
  for (const u of updates ?? []) {
    for (const ch of u.changes) {
      const cur = map.get(ch.criterionId);
      if (cur) map.set(ch.criterionId, { ...cur, rating: ch.after, evidence: ch.evidence || cur.evidence, evidenceFound: true, gaps: ch.reason });
    }
  }
  return Array.from(map.values());
}

export function candidateCode(appId: string) {
  return `Candidate ${appId.split("-").pop()}`;
}

export function ageOn(dob: string, on = "2026-09-28") {
  const a = new Date(dob);
  const b = new Date(on);
  let y = b.getFullYear() - a.getFullYear();
  if (b.getMonth() < a.getMonth() || (b.getMonth() === a.getMonth() && b.getDate() < a.getDate())) y--;
  return y;
}
