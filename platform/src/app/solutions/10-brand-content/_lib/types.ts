/* Shared types for 10-brand-content (no server-only imports — used by routes and client). */

export type Lang = "en" | "ar";
export type Bi = { en: string; ar: string };
export type ChannelId = "web" | "linkedin" | "instagram" | "whatsapp" | "brochure" | "email";

export const SLUG = "10-brand-content";
export const COL_VARIANTS = "10-brand-content/variants";
export const COL_FACTS = "10-brand-content/facts";
export const COL_BYO = "10-brand-content/byo";
export const KV_CHANGES = "10-brand-content:changes";

export const CHANNEL_ORDER: ChannelId[] = ["web", "linkedin", "instagram", "whatsapp", "brochure", "email"];
export const LANGS: Lang[] = ["en", "ar"];
export const cellId = (channel: ChannelId, lang: Lang) => `V-${channel}-${lang}`;

export type FactKind =
  | "product"
  | "chemistry"
  | "solar_reflectance"
  | "sri"
  | "temp_reduction"
  | "test_basis"
  | "coats"
  | "coverage"
  | "warranty"
  | "price"
  | "launch_date"
  | "substrates"
  | "application"
  | "availability"
  | "cta"
  | "not_claimed";

export interface FactVersion {
  version: number;
  value: string;
  valueAr: string;
  numeric?: number | [number, number];
  approvedBy: string;
  approvedOn: string;
  changeReason?: string;
}

export interface Fact {
  id: string;
  kind: FactKind;
  label: Bi;
  value: string;
  valueAr: string;
  numeric?: number | [number, number];
  unit?: string;
  pack?: number;
  date?: string;
  qualifier?: string;
  qualifierAr?: string;
  source: string;
  approvedBy: string;
  approvedOn: string;
  version: number;
  changeReason?: string;
  history?: FactVersion[];
}

export interface SourceDoc {
  id: string;
  title: Bi;
  issuer: string;
  date: string;
}

export interface FactSheetMeta {
  id: string;
  title: Bi;
  sku: string;
  version: string;
  approvedBy: string;
  approvedByRole: string;
  approvedOn: string;
  launchDate: string;
  note: Bi;
  sources: SourceDoc[];
}

export interface Channel {
  id: ChannelId;
  name: Bi;
  short: Bi;
  words: [number, number];
  headline: { label: Bi; max: number } | null;
  hashtags: boolean;
  cta: Bi | null;
  ctaRequired: boolean;
  register: string;
  voice: string;
  audience: Bi;
  rules: { en: string[]; ar: string[] };
  ref: string;
  signoff?: { name: string; nameAr: string; role: string; roleAr: string; email: string; mobile: string };
}

export type RuleKind = "forbidden" | "restricted" | "voice" | "terminology";

export interface PatternRule {
  id: string;
  kind: RuleKind;
  severity: Severity;
  label: Bi;
  reason: Bi;
  ref: string;
  factIds: string[];
  channels?: ChannelId[];
  caseSensitive?: boolean;
  patterns: { en: string[]; ar: string[] };
}

export interface ChannelLimit {
  maxExclamation: number | null;
  maxEmoji: number | null;
  maxHashtags: number | null;
  requiredHashtags?: string[];
  allowedLinkDomains?: string[];
}

export interface BrandRules {
  id: string;
  derivedFrom: string;
  owner: string;
  updatedOn: string;
  patternRules: PatternRule[];
  qualifiers: {
    upTo: { en: string[]; ar: string[] };
    vat: { en: string[]; ar: string[] };
    applicator: { en: string[]; ar: string[] };
    testBasis: Record<string, string[]>;
  };
  terminology: Array<{ en: string; ar: string; note?: string }>;
  channelLimits: Record<ChannelId, ChannelLimit>;
  mandatoryHashtags: string[];
  allowedLinkDomains: string[];
  voice: { en: string[]; ar: string[] };
}

export interface Asset {
  id: string;
  title: Bi;
  type: Bi;
  owner: string;
  ownerRole: string;
  status: "Draft" | "In review" | "Released" | "Withdrawn";
  created: string;
  updated: string;
  factIds: string[];
  variantId?: string;
  note: Bi;
}

/* ───────────── Verification ───────────── */

export type Verdict = "supported" | "no_claim" | "unsupported" | "forbidden" | "needs_qualifier" | "pending";
export type Severity = "critical" | "major" | "minor";
export type FlagCategory = "forbidden" | "fact" | "qualifier" | "channel" | "terminology" | "voice";

export interface Segment {
  id: string;
  part: "headline" | "body" | "hashtags";
  text: string;
  /** offsets within the part's text */
  start: number;
  end: number;
}

export type FlagFix =
  | { type: "replaceSegment"; text: string }
  | { type: "hashtags"; hashtags: string[] }
  | { type: "stripExclamations"; keep: number }
  | { type: "stripEmoji"; keep: number }
  | { type: "regenerate"; instruction: string };

export interface Flag {
  key: string;
  source: "computed" | "model";
  rule: string;
  category: FlagCategory;
  severity: Severity;
  label: Bi;
  reason: Bi;
  segmentId: string | null;
  match?: string;
  factIds: string[];
  ref?: string;
  fix?: FlagFix | null;
}

export interface SegmentResult {
  segmentId: string;
  verdict: Verdict;
  modelVerdict?: Verdict;
  reason?: string;
  factIds: string[];
  fix?: string | null;
}

export interface VerificationMetrics {
  words: number;
  headlineChars: number | null;
  hashtags: number;
  emoji: number;
  exclamations: number;
}

export interface ResolvedFlag {
  key: string;
  rule: string;
  label: Bi;
  resolution: "fix" | "edit" | "regenerate" | "dismissed" | "update";
  at: string;
  note?: string;
}

export interface Verification {
  ranAt: string;
  mode: "computed" | "full";
  model?: string;
  segments: Segment[];
  results: SegmentResult[];
  flags: Flag[];
  metrics: VerificationMetrics;
  summary: { sentences: number; supported: number; flagged: number; critical: number; computed: number; model: number };
}

/* ───────────── Variants ───────────── */

export type VariantStatus = "draft" | "flagged" | "ready" | "released" | "stale";
export type CellStatus = VariantStatus | "empty" | "generating";

export interface VariantVersion {
  version: number;
  headline: string | null;
  body: string;
  hashtags: string[];
  cta: string;
  factIds: string[];
  at: string;
  by: string;
  reason: string;
}

export interface StaleInfo {
  factId: string;
  label: Bi;
  from: string;
  to: string;
  at: string;
  reasons: string[];
}

export interface Variant {
  id: string;
  channel: ChannelId;
  lang: Lang;
  headline: string | null;
  body: string;
  hashtags: string[];
  cta: string;
  factIds: string[];
  version: number;
  status: VariantStatus;
  origin: "legacy" | "generated" | "edited";
  author: { name: string; role: string; kind: "human" | "agent" | "system" };
  assetId?: string;
  createdAt: string;
  updatedAt: string;
  generatedAt?: string | null;
  firstGeneratedAt?: string | null;
  note?: Bi;
  instruction?: string | null;
  factVersions?: Record<string, number>;
  history: VariantVersion[];
  verification?: Verification | null;
  flagStats: { raised: number; resolved: number; dismissed: number };
  flagLog?: ResolvedFlag[];
  dismissed?: Array<{ key: string; note: string; at: string }>;
  stale?: StaleInfo | null;
  releaseId?: string | null;
  releaseApprovalId?: string | null;
  releaseRequestedAt?: string | null;
  releasedVersion?: number | null;
  releasedAt?: string | null;
  releasedBy?: string | null;
  model?: string | null;
}

export interface FactChange {
  id: string;
  factId: string;
  label: Bi;
  from: string;
  to: string;
  fromAr: string;
  toAr: string;
  version: number;
  reason: string;
  authorisedBy: string;
  at: string;
  affected: Array<{ id: string; reasons: string[] }>;
}

export interface ByoCheck {
  id: string;
  at: string;
  channel: ChannelId;
  lang: Lang;
  headline: string | null;
  body: string;
  hashtags: string[];
  verification: Verification;
  rewrite?: { headline: string | null; body: string; hashtags: string[]; cta: string; factIds: string[]; verification: Verification } | null;
}

export interface ReleaseApprovalInfo {
  id: string;
  releaseId: string;
  title: string;
  summary: string;
  solution: string;
  actionLabel: string;
  approver: { name: string; title: string };
  status: "pending" | "approved" | "rejected";
  createdAt: number;
  decidedAt?: number;
  variantIds: string[];
}

export interface BrandState {
  meta: FactSheetMeta;
  facts: Fact[];
  channels: Channel[];
  rules: BrandRules;
  assets: Asset[];
  variants: Variant[];
  changes: FactChange[];
  byo: ByoCheck[];
  releases: ReleaseApprovalInfo[];
}
