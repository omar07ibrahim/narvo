/** Shared types for 08 — Sales Intelligence & Execution (client + server safe). */

export type Bi = { en: string; ar: string };

export type Stage = "Qualification" | "Proposal" | "Negotiation" | "Closed Won" | "Closed Lost";
export const OPEN_STAGES: Stage[] = ["Qualification", "Proposal", "Negotiation"];
export const ALL_STAGES: Stage[] = ["Qualification", "Proposal", "Negotiation", "Closed Won", "Closed Lost"];

export interface Opportunity {
  id: string;
  accountId: string;
  title: string;
  titleAr?: string;
  site: string;
  zone: string;
  value: number;
  stage: Stage;
  stageEnteredAt: string;
  probability: number;
  expectedClose: string;
  owner: string;
  previousOwner?: string;
  ownerChangedAt?: string;
  quoteId: string | null;
  customerDocId?: string;
  nextStep: string;
  nextStepDate: string | null;
  products: string[];
  deliveryWindow?: string;
  deliveryMonths?: number;
  source?: string;
  competitor?: string | null;
  lastUpdatedBy?: string;
  _updatedAt?: number;
}

export type InteractionType = "email" | "call" | "meeting" | "whatsapp" | "note";

export interface Interaction {
  id: string;
  opportunityId: string;
  accountId: string;
  type: InteractionType;
  direction: "inbound" | "outbound" | "internal";
  at: string;
  from: string;
  to: string;
  subject: string;
  lang: "en" | "ar";
  body: string;
  loggedVia?: string;
  approvedBy?: string;
  approvalId?: string;
  _createdAt?: number;
}

export interface QuoteLine {
  sku: string;
  qty: number;
  unit: string;
  unitPrice: number;
}

export interface Quote {
  id: string;
  opportunityId: string;
  accountId: string;
  title: string;
  issuedAt: string;
  validUntil: string;
  preparedBy: string;
  status: string;
  paymentTerms: string;
  paymentDays: number;
  paymentBasis: "invoice" | "delivery";
  priceBasis: string;
  fixedPriceUntil: string | null;
  delivery: string;
  retentionPct: number;
  lines: QuoteLine[];
  notes?: string;
}

export interface CustomerDoc {
  id: string;
  type: string;
  ref: string;
  opportunityId: string;
  accountId: string;
  issuedAt: string;
  issuedBy: string;
  referenceQuote?: string;
  paymentTerms: string;
  paymentDays: number;
  paymentBasis: "invoice" | "delivery";
  priceBasis: string;
  fixedPriceUntil: string | null;
  delivery: string;
  deliveryDays?: string;
  deliveryFrom?: string;
  deliveryTo?: string;
  retentionPct: number;
  retentionText?: string;
  commitmentClaim?: string;
  lines: QuoteLine[];
  text: string;
}

export interface Product {
  sku: string;
  name: string;
  nameAr: string;
  category: string;
  unit: string;
  unitAr: string;
  spec: string;
  listPrice: number;
  stdCost: number;
  supplierId: string;
  leadTimeDays: number;
}

export interface Contract {
  id: string;
  customerId: string;
  title: string;
  validFrom: string;
  validTo: string;
  paymentTermsDays: number;
  paymentBasis: string;
  delivery: string;
  priceAdjustment: string;
  retention: string;
  signedBy: string;
  signedOn: string;
  rates: Record<string, number>;
  ratesQ3?: Record<string, number>;
}

export interface Account {
  id: string;
  name: string;
  nameAr: string;
  tier: "A" | "B" | "C";
  segment: string;
  emirate: string;
  trn: string;
  creditLimit: number;
  paymentTermsDays: number;
  arOutstanding: number;
  overdue30: number;
  kam: string;
  previousKam?: string;
  kamChangedOn?: string;
  contractId?: string;
  // CRM extras
  since: number;
  revenue2025: number;
  ytd2026: number;
  openOrdersInclVat: number;
  website: string;
  address: string;
  health: string;
  notes: string;
}

export interface Contact {
  id: string;
  accountId: string;
  name: string;
  role: string;
  email: string;
  mobile: string;
  language: string;
  influence: string;
  notes: string;
}

export interface Handover {
  id: string;
  from: string;
  to: string;
  effective: string;
  approvedBy: string;
  reason: string;
  accountIds: string[];
  handoverNoteId: string;
  dueBy: string;
  status: string;
}

export interface SiteWindow {
  zone: string;
  days: string;
  from: string;
  to: string;
  gate: string;
  maxVehicle: string;
}

export interface CreditPolicy {
  ref: string;
  tiers: Record<"A" | "B" | "C", { minLimit: number; maxTermsDays: number }>;
  temporaryReleaseMaxPct: number;
  temporaryReleaseApprover: string;
  extendedTermsApprover: string;
}

export interface Person {
  name: string;
  nameAr: string;
  role: string;
  roleAr: string;
  email: string;
  mobile?: string;
}

export interface Sample {
  id: string;
  label: Bi;
  opportunityId: string;
  text: string;
}

export interface SalesData {
  today: string;
  vatRate: number;
  accounts: Account[];
  contacts: Contact[];
  opportunities: Opportunity[];
  interactions: Interaction[];
  quotes: Quote[];
  customerDocs: CustomerDoc[];
  contracts: Contract[];
  products: Product[];
  handovers: Handover[];
  samples: Sample[];
  creditPolicy: CreditPolicy;
  siteWindows: SiteWindow[];
  people: Person[];
  cache: Record<string, CachedResult>;
}

export interface CachedResult {
  kind: "brief" | "handover" | "conflicts";
  opportunityId: string;
  text?: string;
  data?: unknown;
  citations?: unknown[];
  at: number;
  ms?: number;
  lang: "en" | "ar";
}

/* ───────── AI result shapes (server returns, client renders) ───────── */

export interface ConflictExplanation {
  headline: string;
  perConflict: Array<{ id: string; explanation: string; recommendation: string; approver: string | null }>;
  resolution: {
    summary: string;
    proposedTerms: Array<{ term: string; proposal: string; rationale: string }>;
    negotiationRoom: string;
    risksIfUnresolved: string[];
  };
  additionalFindings: Array<{ finding: string; sources: number[] }>;
}

export interface Commitment {
  commitment: string;
  madeBy: string;
  madeTo: string;
  date: string;
  status: "open" | "fulfilled" | "disputed" | "expired" | "overdue";
  risk: string;
  sources: number[];
}

export interface HandoverAnalysis {
  commitments: Commitment[];
  gaps: Array<{ gap: string; sources: number[] }>;
  deadlines: Array<{ date: string; what: string; sources: number[] }>;
}

export interface CrmUpdate {
  stage: Stage;
  nextStep: string;
  nextStepDate: string;
  probability: number;
  note: string;
}

export interface Draft {
  channel: "email" | "whatsapp";
  language: "en" | "ar";
  to: string;
  subject: string | null;
  body: string;
}

export interface NextAction {
  action: { title: string; rationale: string; urgency: "today" | "this_week" | "later" };
  crmUpdate: CrmUpdate;
  draft: Draft;
  commitmentsInDraft: string[];
  sources: number[];
}

export interface IngestResult {
  language: "en" | "ar" | "mixed";
  sender: string;
  intent: string;
  sentiment: "positive" | "neutral" | "negative" | "urgent";
  summary: string;
  requestedChanges: Array<{
    topic: "price" | "payment_terms" | "delivery" | "quantity" | "validity" | "retention" | "other";
    sku: string | null;
    requested: string;
    requestedValue: number | null;
    quote: string;
  }>;
  deadlines: Array<{ what: string; date: string | null }>;
  claims: string[];
  proposedCrm: { stage: Stage | null; nextStep: string; nextStepDate: string | null; probability: number | null; note: string };
}

export interface GuardrailFlag {
  id: string;
  severity: "high" | "check";
  message: Bi;
  match: string;
}
