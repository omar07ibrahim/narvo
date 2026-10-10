/** Client-safe types for solution 13 — Contract & Obligation Intelligence. */

import type { Citation } from "@/lib/ai/events";

export type Bi = { en: string; ar: string };

export interface Contract {
  id: string;
  ref: string;
  title: Bi;
  counterparty: string;
  category: "facilities" | "it" | "field" | "consultancy" | "customer";
  owner: string;
  ownerRole: string;
  officer: string;
  annualValue: number | null;
  totalValue: number;
  start: string;
  end: string;
  renewal: { type: "option" | "auto" | "none"; months?: number; noticeDays?: number; party?: string; clause?: string; note?: string };
  status: "active" | "extended" | "draft" | "expired";
  file: string | null;
  performanceSecurity?: { amount: number; expiry: string };
  flags: string[];
  received?: string;
  reviewStatus?: string;
  renewalDecision?: { decision: string; at: number; by: string };
  [key: string]: unknown;
}

export interface PlaybookPosition {
  id: string;
  topic: Bi;
  severity: "high" | "medium" | "low";
  position: string;
  fallback: string;
  escalation: string;
}

export interface Playbook {
  ref: string;
  title: Bi;
  owner: string;
  approved: string;
  positions: PlaybookPosition[];
}

export type Trigger =
  | { kind: "date"; date: string }
  | { kind: "before_end"; days: number }
  | { kind: "after_end"; days: number }
  | { kind: "after_start"; days: number }
  | { kind: "monthly_working_day"; day: number }
  | { kind: "monthly_day"; day: number }
  | { kind: "annual"; month: number; day: number };

export interface Obligation {
  id: string;
  contractId: string;
  title: Bi;
  party: "MNDA" | "Supplier";
  type: "notice" | "report" | "insurance" | "security" | "review" | "deliverable" | "payment" | "compliance";
  owner: string;
  ownerRole: string;
  trigger: Trigger;
  sourceClause: string;
  status: "open" | "done";
  critical?: boolean;
  action?: string;
  doneAt?: string;
  quote?: string;
  source?: "seed" | "ai";
  [key: string]: unknown;
}

export interface Finding {
  positionId: string;
  status: "compliant" | "deviation" | "missing";
  risk: "high" | "medium" | "low";
  clauseRef: string;
  clauseTitle: string;
  quote: string | null;
  summary: string;
  redline: string | null;
  fallbackOk: boolean;
  decision?: "accepted" | "rejected";
  decidedBy?: string;
  note?: string;
}

export interface Review {
  contractId: string;
  name: string;
  at: number;
  summary: string;
  findings: Finding[];
  approvalId?: string;
}

export interface ExtractedObligation {
  key: string;
  title: string;
  party: "MNDA" | "Supplier";
  type: Obligation["type"];
  trigger: Trigger;
  recurrence: string;
  sourceClause: string;
  quote: string | null;
  ownerRole: string;
  owner: string;
  due: string | null;
}

export interface Extraction {
  contractId: string;
  name: string;
  at: number;
  start: string | null;
  end: string | null;
  items: ExtractedObligation[];
  approvalId?: string;
}

export interface RenewalBrief {
  at: number;
  lang: "en" | "ar";
  recommendation: "renew_with_conditions" | "short_extension" | "not_renew";
  headline: string;
  conditions: string[];
  brief: string;
  letterEn: string;
  letterAr: string;
  citations: Citation[];
  approvalId?: string;
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

export interface ContractState {
  contracts: Contract[];
  obligations: Obligation[];
  reviews: Record<string, Review>;
  extractions: Record<string, Extraction>;
  renewal: RenewalBrief | null;
  approvals: ApprovalLite[];
}

export interface KpiMonth {
  month: string;
  ppm: number;
  p1Attend: number;
  p1MakeSafe: number;
  p2Rectify: number;
  reportOnTime: boolean;
  complaintsAlGhaf: number;
  csat?: number;
  coilCleaningDone?: boolean;
}

export interface KpiFile {
  contract: string;
  monthlyFee: number;
  capPct: number;
  source: string;
  months: KpiMonth[];
  alGhaf: { ch02TripsSeptember: number; coilCleaningOverdueSince: string; energySeptemberVsLastYearPct: number; job: string };
}
