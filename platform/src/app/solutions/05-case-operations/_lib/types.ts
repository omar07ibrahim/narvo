/** Shared types for solution 05 (server + client). */

export type CaseStatus = "submitted" | "under_review" | "incomplete" | "verification" | "decision_pending" | "approved" | "not_approved";

export interface CaseDocument {
  type: string;
  label: string;
  file?: string;
  source?: "applicant" | "land_registry" | "upload";
  addedAt?: string;
}

export interface HousingCase {
  id: string;
  track: "grant" | "loan";
  amountRequested: number;
  submittedAt: string;
  channel: string;
  status: CaseStatus;
  officer: string | null;
  applicant: {
    name: string;
    nameAr: string;
    emiratesId: string;
    mobile: string;
    email?: string;
    maritalStatus: string;
    spouse?: string;
    dependents: number;
    employer: string;
    monthlyIncomeDeclared: number;
    preferredLanguage: "ar" | "en";
  };
  district: string;
  plot?: string | null;
  landRegistryConsent?: boolean;
  summary: string;
  documents: CaseDocument[];
  missing?: string[];
  decision?: { by: string; at: string; reason?: string };
  slaDays: number;
  clarificationSentAt?: string;
  clockStopped?: boolean;
  lastReview?: { at: number };
  _updatedAt?: number;
}

export interface CaseMessage {
  id: string;
  caseId: string;
  kind: "clarification" | "reminder" | "notice";
  channels: string[];
  language: "ar" | "en";
  body: string;
  sentAt: string;
  sentBy: string;
}

export type CheckStatus = "pass" | "fail" | "warn" | "info";

export interface CaseCheck {
  id: string;
  label: { en: string; ar: string };
  status: CheckStatus;
  detail: { en: string; ar: string };
  policyRef?: string;
  evidence?: string;
}

export interface ExtractedDocument {
  docType: string;
  file?: string;
  label: string;
  fields: Record<string, unknown>;
  confidence: number;
  ms: number;
}

export interface CaseReview {
  at: number;
  caseId: string;
  extractions: ExtractedDocument[];
  checks: CaseCheck[];
  summary: string;
  approvals: string[];
  model?: string;
}
