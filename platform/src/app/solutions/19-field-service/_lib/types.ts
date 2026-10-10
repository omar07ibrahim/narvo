/** Shared types for 19 — Field Service Intelligence (client + server). */

export interface Site {
  id: string;
  name: string;
  name_ar: string;
  district: string;
  plot: string;
  client: string;
  contract: string;
  built: number;
  gfaM2: number;
  access: string;
  contact: { name: string; role: string; phone: string };
}

export interface Asset {
  id: string;
  site: string;
  type: string;
  name: string;
  make: string;
  model: string;
  description: string;
  serial: string;
  installed: string;
  location: string;
  criticality: string;
  refrigerantChargeKg?: number;
  servesZones?: string[];
  lastPpm: { type: string; date: string; job: string };
  nextPpm: string;
  overduePpm?: Array<{ type: string; due: string; job: string; lastDone: string }>;
  status: string;
}

export interface Technician {
  id: string;
  name: string;
  role: string;
  role_ar: string;
  years: number;
  van: string;
  phone: string;
  skills: string[];
  certs: string[];
  languages: string[];
  supervisor?: boolean;
}

export interface Part {
  partNo: string;
  desc: string;
  unit: string;
  kind: "consumable" | "tool" | "spare" | "ppe";
  stock: Record<string, number>;
  leadDays: number;
  supplier?: string;
  unitCostAed: number;
  note?: string;
}

export interface Inventory {
  locations: Record<string, string>;
  parts: Part[];
}

export type JobStatus = "new" | "assigned" | "scheduled" | "in_progress" | "awaiting_review" | "awaiting_parts" | "completed" | "overdue";

export interface Job {
  id: string;
  title: string;
  title_ar: string;
  site: string;
  asset: string;
  type: "Reactive" | "PPM" | "Follow-up";
  priority: string;
  status: JobStatus;
  raisedAt: string;
  raisedBy: string;
  scheduledFor: string;
  completedAt?: string;
  technician: string;
  supervisor: string;
  sla: string;
  symptom: string;
  symptom_ar: string;
  outcome?: string;
  linked: string[];
  permit?: string;
  prepMode: "ai" | "manual" | null;
  prepMinutes: number | null;
  firstTimeFix?: boolean | null;
  reportCompleteness?: number;
  partsNeeded?: Array<{ partNo: string; qty: number }>;
  followUpOf?: string;
  reportId?: string;
}

export interface HistoryEntry {
  id: string;
  date: string;
  site: string;
  asset: string;
  type: "Reactive" | "PPM" | "Follow-up";
  title: string;
  technician: string;
  summary?: string;
  prepMode: "ai" | "manual";
  prepMinutes: number;
  reportCompleteness: number;
  firstTimeFix: boolean | null;
  partsRelatedRepeat?: boolean;
}

export interface BmsLog {
  asset: string;
  source: string;
  daily: Array<{ date: string; maxAmbientC: number; trips: number }>;
  trips: Array<{ id: string; date: string; time: string; alarm: string; circuit: string; ambientC: number; dischargeKpa: number; loadPct: number; lockout: boolean }>;
}

export interface PartLine {
  partNo: string;
  qty: number;
  purpose: string;
}

export interface PartAvailability extends PartLine {
  desc: string;
  kind: string;
  unit: string;
  van: number;
  site: number;
  store: number;
  status: "in_van" | "site_store" | "central_store" | "order";
  action: string;
  leadDays: number;
  warning?: string;
}

export interface Reading {
  name: string;
  value: string;
  unit: string;
  circuit?: string | null;
  phase?: "before" | "after" | "single" | null;
  flag?: "normal" | "high" | "low" | null;
}

export interface FollowUp {
  description: string;
  partNo: string | null;
  qty: number | null;
  owner: string;
  priority: string;
  reason: string;
}

export interface ServiceReport {
  jobId: string;
  assetId: string;
  arrival: string | null;
  departure: string | null;
  symptomOnArrival: string;
  alarms: string[];
  readings: Reading[];
  workPerformed: string[];
  partsUsed: Array<{ partNo: string; desc?: string; qty: number; source: string | null }>;
  rootCause: string;
  rootCauseEvidence: string;
  unresolved: FollowUp[];
  safety: { loto: boolean; isolationPoints: string; permit: string | null; notes: string };
  photos: Array<{ caption: string; phase: "before" | "after" | "other" }>;
  photoObservations: string[];
  customerSignOff: { name: string | null; role: string | null; time: string | null; reasonIfMissing: string | null };
  technicianDeclaration: { name: string; staffId: string; cert: string | null; signed: boolean };
  recommendations: string[];
}

export interface CompletenessItem {
  no: number;
  key: string;
  en: string;
  ar: string;
  weight: number;
  score: "full" | "partial" | "missing";
  points: number;
  note: string;
}

export interface Completeness {
  items: CompletenessItem[];
  total: number;
  gates: Array<{ en: string; ar: string }>;
  pass: boolean;
}
