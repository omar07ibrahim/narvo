/**
 * Shared (client + server) types for 07 — Customer Service & Contact Operations.
 * No server-only imports here.
 */

export type ContactChannel = "phone" | "whatsapp" | "app_chat" | "email" | "centre";
export type Intent = "housing_status" | "permit_status" | "documents" | "appointment" | "complaint" | "maintenance" | "other";

export interface CustomerHistory {
  at: string;
  channel: ContactChannel;
  intent: Intent;
  summary: string;
  outcome: "resolved" | "handoff" | "unresolved";
}

export interface Customer {
  id: string;
  name: string;
  nameAr?: string;
  emiratesId: string;
  mobile: string;
  email?: string;
  dateOfBirth?: string;
  segment: "citizen" | "resident" | "business";
  nationality?: string;
  preferredLanguage: "ar" | "en";
  preferredChannel?: string;
  district?: string;
  housingCaseIds: string[];
  permitIds: string[];
  ticketIds: string[];
  flags?: string[];
  notes?: string;
  history: CustomerHistory[];
}

export interface HousingCase {
  id: string;
  track: "grant" | "loan";
  amountRequested: number;
  submittedAt: string;
  channel: string;
  status: string;
  officer: string | null;
  applicant: {
    name: string;
    nameAr?: string;
    emiratesId: string;
    mobile: string;
    email?: string;
    preferredLanguage?: "ar" | "en";
  };
  district?: string;
  plot?: string;
  summary?: string;
  missing?: string[];
  decision?: { by: string; at: string; reason?: string };
  slaDays?: number;
  [key: string]: unknown;
}

export interface Permit {
  id: string;
  service: string;
  serviceName: string;
  serviceNameAr?: string;
  customerId: string;
  applicant: string;
  consultant?: string;
  plot: string;
  district: string;
  gated: boolean;
  masterDeveloper: string | null;
  gfaM2: number | null;
  feeAed: number;
  submittedAt: string;
  status: string;
  statusSince: string;
  nocRequestedAt: string | null;
  nocStatus: string | null;
  returnReason: string | null;
  officer?: string;
  nextStep?: string;
  history: Array<{ at: string; event: string }>;
}

export interface Ticket {
  id: string;
  customerId: string | null;
  type: "complaint" | "maintenance" | "suggestion" | "enquiry";
  service: string;
  category: string;
  subject: string;
  description: string;
  district?: string;
  location?: string;
  priority: "normal" | "high" | "urgent";
  status: "open" | "in_progress" | "resolved" | "closed";
  createdAt: string;
  slaDue: string;
  assignedTo: string;
  channel: string;
  updates: Array<{ at: string; note: string }>;
  live?: boolean;
}

export type CentreId = "downtown" | "al-murjan" | "al-waha";
export type ServiceKey = "housing_documents" | "housing_consultation" | "permit_consultation" | "completion_certificate" | "general";

export interface Appointment {
  id: string;
  customerId: string;
  centre: CentreId;
  service: ServiceKey;
  start: string;
  status: "booked" | "completed" | "no_show" | "cancelled";
  reason: string;
  channel: string;
  createdAt: string;
  live?: boolean;
}

export interface Slot {
  id: string;
  centre: CentreId;
  date: string;
  time: string;
  capacity: number;
  booked: number;
}

export interface TranscriptTurn {
  role: "customer" | "assistant" | "agent" | "system";
  text: string;
  at?: string;
  channel?: string;
  lang?: string;
  author?: string;
}

export interface Conversation {
  id: string;
  startedAt: string;
  channel: ContactChannel;
  language: "ar" | "en" | "mixed";
  customerId: string | null;
  intent: Intent;
  handledBy: "ai" | "ai_agent" | "agent";
  outcome: "resolved" | "handoff_resolved" | "handoff_open" | "abandoned" | "in_progress";
  durationSec: number;
  csat: number | null;
  sentiment: "positive" | "neutral" | "negative";
  summary: string;
  actions: string[];
  transcript: TranscriptTurn[];
  live?: boolean;
  handoffId?: string | null;
}

export interface Handoff {
  id: string;
  createdAt: string;
  status: "waiting" | "in_progress" | "resolved";
  priority: "high" | "normal";
  channel: string;
  language: string;
  customerId: string | null;
  customerName: string;
  verified: boolean;
  verification: string;
  intent: string;
  reason: string;
  summary: string;
  whatTried: string[];
  sentiment: "negative" | "neutral" | "positive";
  sentimentScore?: number;
  suggestedNextStep: string;
  references: string[];
  transcript: TranscriptTurn[];
  assignedTo: string | null;
  takenAt?: string | null;
  resolution: { outcome: string; note: string; at: string; by: string } | null;
  sessionId?: string;
  live?: boolean;
}

export interface InboundContact {
  id: string;
  channel: "voice" | "chat";
  ani: string | null;
  label: string;
  customerHint: string | null;
  language: "ar" | "en";
  waitingSec: number;
  firstMessage: string;
  topic: string;
  topicAr?: string;
}

export interface KbDraft {
  id: string;
  title: string;
  titleAr?: string;
  question?: string;
  answerEn: string;
  answerAr?: string;
  rationale?: string;
  themes?: string[];
  status: string;
  createdAt: string;
}

export interface ExceptionRecord {
  id: string;
  kind: string;
  reference: string;
  customerId: string | null;
  amountAed?: number | null;
  justification: string;
  status: string;
  createdAt: string;
}

export type VerificationLevel = "none" | "partial" | "verified";

export interface SessionState {
  sessionId: string;
  channel: "voice" | "chat";
  ani: string | null;
  customerId: string | null;
  factors: string[];
  level: VerificationLevel;
  startedAt: string;
  handoffId?: string | null;
  conversationId?: string;
  actions?: SessionAction[];
  sentiments?: number[];
  /** Slots the assistant has offered (so a later "book the first one" can be executed). */
  offeredSlots?: Array<{ slotId: string; centre: string; date: string; time: string }>;
  /** Session-scoped citation list so [n] markers stay valid across turns. */
  citations?: Array<{ n: number; docId: string; title: string; ref?: string; section?: string; quote: string }>;
}

export interface SessionAction {
  kind: "appointment" | "ticket" | "exception" | "handoff" | "verification";
  id: string;
  label: string;
  at: string;
  status: "done" | "awaiting_approval" | "waiting";
}

export interface Signals {
  language: "ar" | "en" | "mixed";
  dialect: string | null;
  sentiment: number;
  sentimentLabel: string;
  intent: Intent;
}

export interface ConsoleData {
  customers: Customer[];
  cases: HousingCase[];
  permits: Permit[];
  tickets: Ticket[];
  appointments: Appointment[];
  conversations: Conversation[];
  handoffs: Handoff[];
  inbound: InboundContact[];
  kbDrafts: KbDraft[];
  exceptions: ExceptionRecord[];
}

export const INTENT_LABEL: Record<Intent, { en: string; ar: string }> = {
  housing_status: { en: "Housing application status", ar: "حالة الطلب السكني" },
  permit_status: { en: "Permit status", ar: "حالة الرخصة" },
  documents: { en: "Document requirements", ar: "المستندات المطلوبة" },
  appointment: { en: "Appointments", ar: "المواعيد" },
  complaint: { en: "Complaints", ar: "الشكاوى" },
  maintenance: { en: "Maintenance requests", ar: "طلبات الصيانة" },
  other: { en: "Other", ar: "أخرى" },
};

/** WORLD S5 — September 2026 canonical figures for the Customer Happiness Centre. */
export const SEPTEMBER_BASELINE = {
  contacts: 28940,
  august: 22090,
  growth: 31,
  channels: { phone: 61, whatsapp: 24, app_chat: 11, email: 4 },
  intents: { housing_status: 34, permit_status: 18, documents: 14, appointment: 9, complaint: 8, maintenance: 7, other: 10 } as Record<Intent, number>,
  phoneWait: "6:40",
  abandonment: 14.2,
  fcr: 61,
  repeat7d: 34,
  costPerContact: 18.4,
};

export const CENTRES: Record<CentreId, { en: string; ar: string; address: string; addressAr: string; counters: number }> = {
  downtown: {
    en: "Downtown",
    ar: "وسط المدينة",
    address: "MNDA Tower, ground floor, Corniche Road (MN-01)",
    addressAr: "برج الهيئة، الطابق الأرضي، شارع الكورنيش (MN-01)",
    counters: 4,
  },
  "al-murjan": {
    en: "Al Murjan",
    ar: "المرجان",
    address: "Al Murjan Community Services Building, Street 9 (MN-02)",
    addressAr: "مبنى خدمات مجتمع المرجان، الشارع 9 (MN-02)",
    counters: 3,
  },
  "al-waha": {
    en: "Al Waha",
    ar: "الواحة",
    address: "Al Waha Gardens Service Centre, plot MN-04-100-0002 (MN-04)",
    addressAr: "مركز خدمات حدائق الواحة، قطعة MN-04-100-0002 (MN-04)",
    counters: 2,
  },
};

export const SERVICES: Record<ServiceKey, { en: string; ar: string }> = {
  housing_documents: { en: "Housing — submit documents", ar: "الإسكان — تسليم مستندات" },
  housing_consultation: { en: "Housing — case consultation", ar: "الإسكان — استشارة بشأن الطلب" },
  permit_consultation: { en: "Building permit consultation", ar: "استشارة رخص البناء" },
  completion_certificate: { en: "Completion certificate", ar: "شهادة إنجاز المبنى" },
  general: { en: "General enquiry", ar: "استفسار عام" },
};

export const HG_STATUS: Record<string, { en: string; ar: string; tone: "neutral" | "info" | "warning" | "success" | "danger" | "ai" }> = {
  submitted: { en: "Submitted", ar: "مُقدَّم", tone: "neutral" },
  under_review: { en: "Under review", ar: "قيد المراجعة", tone: "info" },
  incomplete: { en: "Incomplete — awaiting applicant", ar: "غير مكتمل — بانتظار المتعامل", tone: "warning" },
  awaiting_applicant: { en: "Incomplete — awaiting applicant", ar: "غير مكتمل — بانتظار المتعامل", tone: "warning" },
  verification: { en: "Verification", ar: "قيد التحقق", tone: "info" },
  decision_pending: { en: "Decision pending", ar: "بانتظار القرار", tone: "ai" },
  approved: { en: "Approved", ar: "معتمد", tone: "success" },
  not_approved: { en: "Not approved", ar: "غير معتمد", tone: "danger" },
  rejected: { en: "Not approved", ar: "غير معتمد", tone: "danger" },
  // permits
  returned_to_applicant: { en: "Returned to applicant", ar: "معاد إلى المتعامل", tone: "warning" },
  awaiting_noc: { en: "Awaiting master-developer NOC", ar: "بانتظار عدم ممانعة المطور الرئيسي", tone: "warning" },
  technical_review: { en: "Technical review", ar: "مراجعة فنية", tone: "info" },
  civil_defence: { en: "Civil Defence coordination", ar: "تنسيق الدفاع المدني", tone: "info" },
  issued: { en: "Issued", ar: "صادرة", tone: "success" },
  // tickets
  open: { en: "Open", ar: "مفتوحة", tone: "warning" },
  in_progress: { en: "In progress", ar: "قيد المعالجة", tone: "info" },
  resolved: { en: "Resolved", ar: "تم الحل", tone: "success" },
  closed: { en: "Closed", ar: "مغلقة", tone: "neutral" },
  booked: { en: "Booked", ar: "محجوز", tone: "ai" },
  completed: { en: "Completed", ar: "مكتمل", tone: "success" },
  no_show: { en: "No-show", ar: "لم يحضر", tone: "danger" },
  cancelled: { en: "Cancelled", ar: "ملغى", tone: "neutral" },
};

export function statusMeta(s: string) {
  return HG_STATUS[s] ?? { en: s.replace(/_/g, " "), ar: s.replace(/_/g, " "), tone: "neutral" as const };
}

/** Normalise a UAE mobile to its 9 significant digits (5XXXXXXXX). */
export function normMobile(m: string | null | undefined): string {
  const d = (m ?? "").replace(/\D/g, "");
  if (d.startsWith("971")) return d.slice(3);
  if (d.startsWith("00971")) return d.slice(5);
  if (d.startsWith("0")) return d.slice(1);
  return d;
}

export function maskMobile(m: string): string {
  const d = normMobile(m);
  return d.length >= 9 ? `+971 ${d.slice(0, 2)} ••• ${d.slice(-4)}` : m;
}

export function maskEid(e: string): string {
  const d = e.replace(/\D/g, "");
  return d.length === 15 ? `784-••••-•••${d.slice(10, 14)}-${d.slice(14)}` : e;
}
