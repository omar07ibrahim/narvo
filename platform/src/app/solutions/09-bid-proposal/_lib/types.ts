/** Shared (client-safe) types for solution 09 — Bid & Proposal Intelligence. */

import type { Citation } from "@/lib/ai/events";

export type Bi = { en: string; ar: string };

export const CATEGORIES = ["mandatory", "technical", "hse", "staffing", "emiratisation", "helpdesk", "reporting", "commercial"] as const;
export type ReqCategory = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<ReqCategory, Bi> = {
  mandatory: { en: "Mandatory", ar: "إلزامي" },
  technical: { en: "Technical", ar: "فني" },
  hse: { en: "HSE", ar: "الصحة والسلامة" },
  staffing: { en: "Staffing", ar: "التوظيف" },
  emiratisation: { en: "Emiratisation & ICV", ar: "التوطين والقيمة الوطنية" },
  helpdesk: { en: "Helpdesk & SLAs", ar: "مكتب الخدمة ومستويات الخدمة" },
  reporting: { en: "Reporting", ar: "التقارير" },
  commercial: { en: "Commercial", ar: "تجاري" },
};

export interface Requirement {
  id: string;
  ref: string;
  category: ReqCategory;
  title: string;
  text: string;
  mandatory: boolean;
  evidenceNeeded: string;
  section: string | null;
}

export type CoverageStatus = "met" | "partial" | "missing";

export interface EvidenceRef {
  docId: string;
  title: string;
  ref?: string;
  section: string;
  quote: string;
}

export interface Coverage {
  reqId: string;
  status: CoverageStatus;
  aiStatus: CoverageStatus;
  confidence: number;
  rationale: string;
  gap: string | null;
  evidence: EvidenceRef[];
  check?: { status: "ok" | "warning" | "critical"; note: string; derived?: CoverageStatus } | null;
  source: "ai" | "contributor";
  contributor?: string;
  updatedAt: number;
}

export interface DraftVersion {
  v: number;
  label: string;
  author: string;
  kind: "human" | "ai" | "edit";
  at: string | number;
  text: string;
  lang: "en" | "ar";
  citations?: Citation[];
}

export type ClaimVerdict = "supported" | "partial" | "unsupported" | "contradicted";

export interface Claim {
  i: number;
  text: string;
  verdict: ClaimVerdict;
  note: string;
  suggestion: string | null;
  source?: EvidenceRef | null;
}

export interface ClaimCheck {
  at: number;
  version: number;
  claims: Claim[];
}

export interface SectionState {
  versions: DraftVersion[];
  check?: ClaimCheck;
}

export interface BidTask {
  id: string;
  reqId: string;
  reqTitle: string;
  owner: string;
  ownerRole: string;
  ask: string;
  evidenceType: string;
  due: string;
  priority: "critical" | "high" | "normal";
  status: "open" | "answered";
  answer?: string;
  answeredAt?: number;
  resultStatus?: CoverageStatus;
  createdAt: number;
  [key: string]: unknown;
}

export interface FormRecord {
  id: string;
  name: Bi;
  requirement: string;
  requirements?: string[];
  owner: string;
  status: "not_started" | "in_progress" | "pending_signature" | "requested" | "complete";
  note: Bi;
  [key: string]: unknown;
}

export interface CertificateRecord {
  id: string;
  name: string;
  name_ar: string;
  number: string;
  expiry: string;
  issued?: string;
  score?: number;
  minScore?: number;
  requirement: string;
  mustCover: "closing" | "validity";
  docId: string;
  note?: string;
  updatedBy?: string;
  [key: string]: unknown;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  role_ar: string;
  email: string;
  expertise: string;
}

export interface ResponseSection {
  id: string;
  no: number;
  title: Bi;
  pageLimit: number;
  requirements: string[];
}

export interface BidSeed {
  id: string;
  tender: {
    ref: string;
    title: Bi;
    client: Bi;
    published: string;
    clarificationsClosed: string;
    closing: string;
    closingTime: string;
    validityDays: number;
    contractStart: string;
    durationMonths: number;
    evaluation: string;
    portal: string;
    contact: string;
  };
  bidder: { name: string; short: string; licence: string; supplierNo: string };
  status: string;
  internalReview: string;
  wordsPerPage: number;
  team: TeamMember[];
  sections: ResponseSection[];
  certificates: CertificateRecord[];
  forms: FormRecord[];
  emiratisation: { plannedTeam: number; plannedNationals: number; targetPct: number; targetMonth: number; companyPct: number };
  financials: { turnover2025: number; minTurnover: number };
  seedDrafts: Record<string, { label: string; author: string; at: string; lang: "en" | "ar"; text: string }>;
}

export interface BidRecord {
  id: string;
  status: "in_preparation" | "approved_for_submission";
  approvedBy?: string;
  approvedAt?: number;
  [key: string]: unknown;
}

export interface ByoState {
  name: string;
  at: number;
  requirements: Requirement[];
  coverage: Record<string, Coverage>;
}

export interface LibraryDoc {
  id: string;
  title: string;
  title_ar?: string;
  type?: string;
  ref?: string;
  date?: string;
}

export interface BidState {
  requirements: { at: number; items: Requirement[] } | null;
  coverage: Record<string, Coverage>;
  sections: Record<string, SectionState>;
  tasks: BidTask[];
  forms: FormRecord[];
  certificates: CertificateRecord[];
  bid: BidRecord;
  byo: ByoState | null;
  approvals: Array<{
    id: string;
    title: string;
    summary: string;
    solution: string;
    actionLabel: string;
    approver: { name: string; title: string };
    status: "pending" | "approved" | "rejected";
    createdAt: number;
  }>;
}
