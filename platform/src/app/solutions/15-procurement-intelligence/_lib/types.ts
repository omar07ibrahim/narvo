/** Client-safe types for solution 15 — Procurement & Supplier Intelligence. */

import type { Citation } from "@/lib/ai/events";

export type Bi = { en: string; ar: string };
export type CellStatus = "met" | "partial" | "missing" | "clarify";

export interface Criterion {
  id: string;
  section: string;
  weight: number;
  label: Bi;
  guidance: string;
}

export interface Gate {
  id: string;
  label: Bi;
  kind: "certificate" | "ai" | "icv";
  standard?: string;
  guidance?: string;
}

export interface ScopeItem {
  id: string;
  key: string;
  label: Bi;
}

export interface Tender {
  id: string;
  ref: string;
  title: Bi;
  method: Bi;
  estimate: number;
  published: string;
  siteVisit: string;
  closing: string;
  closingTime: string;
  opened: string;
  durationMonths: number;
  weights: { technical: number; commercial: number };
  passMark: number;
  icvMin: number;
  status: string;
  committee: Array<{ name: string; name_ar: string; role: Bi }>;
  sites: Array<{ name: string; gfa: number; note?: string }>;
  gates: Gate[];
  criteria: Criterion[];
  scope: ScopeItem[];
}

export interface SupplierCert {
  standard: string;
  number: string;
  expiry: string;
  updatedBy?: string;
  note?: string;
}

export interface Supplier {
  id: string;
  name: string;
  name_ar: string;
  short: string;
  licence: string;
  trn: string;
  address: string;
  registration: { no: string; status: string; since: string; expiry: string; category: string };
  contact: { name: string; role: string; email: string };
  staff: number;
  icv: { score: number; certificate: string; expiry: string };
  certificates: SupplierCert[];
  pastPerformance: Array<{ contract: string; title: Bi; value: number; period: string; rating: number; note: Bi }>;
  submission: { file: string; price: string; submittedAt: string; teamSize: number; mobilisationDays: number };
  awardRecommendation?: { tender: string; at: number; total: number; rank: number; approvedBy: string };
  [key: string]: unknown;
}

export interface PriceLine {
  item: string;
  description: string;
  category: string;
  scope_key: string;
  year1: number;
  year2: number;
  year3: number;
  total: number;
  note: string;
}

export interface PriceSchedule {
  supplierId: string;
  lines: PriceLine[];
  total: number;
}

export interface Evidence {
  quote: string;
  section: string;
  source: "proposal" | "clarification";
}

export interface CriterionEval {
  id: string;
  status: CellStatus;
  score: number;
  evidence: Evidence | null;
  gap: string | null;
  strength: string | null;
}

export interface ScopeEval {
  id: string;
  status: "included" | "excluded" | "unclear";
  evidence: Evidence | null;
}

export interface GateEval {
  id: string;
  status: CellStatus;
  evidence: Evidence | null;
  note: string | null;
}

export interface EvalChange {
  at: number;
  kind: "criterion" | "scope" | "gate" | "certificate";
  id: string;
  from: string;
  to: string;
  note: string;
}

export interface SupplierEval {
  supplierId: string;
  at: number;
  summary: string;
  criteria: CriterionEval[];
  scope: ScopeEval[];
  gates: GateEval[];
  missing: string[];
  risks: string[];
  history: EvalChange[];
}

export interface Override {
  score: number;
  reason: string;
  by: string;
  at: number;
}

export interface ClarQuestion {
  topic: string;
  question: string;
  ref: string;
  reason: string;
}

export interface ClarDraft {
  supplierId: string;
  ref: string;
  letter: string;
  questions: ClarQuestion[];
  at: number;
  approvalId: string;
}

export interface Clarification {
  id: string;
  ref: string;
  supplierId: string;
  letter: string;
  questions: ClarQuestion[];
  status: "issued" | "answered";
  issuedAt?: number;
  answeredAt?: number;
  responseExcerpt?: string;
  priceChangeAttempt?: boolean;
  [key: string]: unknown;
}

export interface Rfq {
  id: string;
  need: string;
  estimate: number | null;
  title: string;
  objective: string;
  scope: string[];
  requirements: Array<{ id: string; text: string; mandatory: boolean }>;
  criteria: Array<{ name: string; weight: number; description: string }>;
  submission: string[];
  kpis: string[];
  term: string;
  method: MethodResult | null;
  citations: Citation[];
  at: number;
  [key: string]: unknown;
}

export interface MethodResult {
  method: "direct_one" | "direct_three" | "limited" | "public";
  label: Bi;
  rule: Bi;
  approver: Bi;
  minDays?: number;
}

export interface ApprovalLite {
  id: string;
  title: string;
  summary: string;
  solution: string;
  actionLabel: string;
  approver: { name: string; title: string };
  status: "pending" | "approved" | "rejected";
  createdAt: number;
}

export interface TenderRecord {
  id: string;
  status: "technical_evaluation" | "award_recommended";
  recommended?: string;
  [key: string]: unknown;
}

export interface ProcState {
  evaluations: Record<string, SupplierEval>;
  overrides: Record<string, Record<string, Override>>;
  drafts: Record<string, ClarDraft>;
  clarifications: Clarification[];
  report: { text: string; citations: Citation[]; at: number; lang: "en" | "ar" } | null;
  tender: TenderRecord;
  suppliers: Supplier[];
  rfqs: Rfq[];
  approvals: ApprovalLite[];
}
