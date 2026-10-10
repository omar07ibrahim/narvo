import "server-only";
import { readJsonSafe } from "@/lib/world/data";
import { withOverlay, kvGet, kvSet, listApprovals } from "@/lib/store/db";
import { listDocs, search, type SearchHit } from "@/lib/retrieval";
import {
  normMobile,
  type Appointment,
  type ConsoleData,
  type Conversation,
  type Customer,
  type ExceptionRecord,
  type Handoff,
  type HousingCase,
  type InboundContact,
  type KbDraft,
  type Permit,
  type SessionState,
  type Slot,
  type Ticket,
} from "./types";

export const SLUG = "07-contact-operations";
export const DIR = `mnda/${SLUG}`;
export const COL = {
  tickets: `${SLUG}/tickets`,
  appointments: `${SLUG}/appointments`,
  handoffs: `${SLUG}/handoffs`,
  conversations: `${SLUG}/conversations`,
  kbDrafts: `${SLUG}/kb-drafts`,
  exceptions: `${SLUG}/exceptions`,
};
/** Solution 05 owns the housing cases; we read them live (seed + its runtime overlay). */
export const CASES_COL = "05-case-operations/cases";
export const CASE_MESSAGES_COL = "05-case-operations/messages";

/** Demo "today": Sunday 11 October 2026 (WORLD.md). */
export const DEMO_TODAY = "2026-10-11";

export const CHC_MANAGER = { name: "Sara Ahmed Al Blooshi", title: "Manager, Customer Happiness Centre" };
export const DESK_AGENT = { name: "Aisha Salem Al Rumaithi", title: "Customer Happiness Agent" };

export function loadCustomers(): Customer[] {
  return readJsonSafe<Customer[]>(`${DIR}/customers.json`, []).map((c) => ({
    ...c,
    housingCaseIds: c.housingCaseIds ?? [],
    permitIds: c.permitIds ?? [],
    ticketIds: c.ticketIds ?? [],
    history: c.history ?? [],
  }));
}

export function loadCases(): HousingCase[] {
  return withOverlay(CASES_COL, readJsonSafe<HousingCase[]>("mnda/05-case-operations/cases.json", []));
}

export function loadCaseMessages(caseId: string): Array<{ id: string; caseId: string; body?: string; _createdAt?: number }> {
  return withOverlay<{ id: string; caseId: string; body?: string; _createdAt?: number }>(CASE_MESSAGES_COL, []).filter(
    (m) => m.caseId === caseId,
  );
}

export function loadPermits(): Permit[] {
  return readJsonSafe<Permit[]>(`${DIR}/permits.json`, []);
}

export function loadTickets(): Ticket[] {
  return withOverlay(COL.tickets, readJsonSafe<Ticket[]>(`${DIR}/tickets.json`, []));
}

export function loadAppointments(): Appointment[] {
  return withOverlay(COL.appointments, readJsonSafe<Appointment[]>(`${DIR}/appointments.json`, []));
}

export function loadSlots(): Slot[] {
  const raw = readJsonSafe<{ slots: Slot[] }>(`${DIR}/slots.json`, { slots: [] }).slots;
  // Runtime bookings made by the assistant reduce availability.
  const live = withOverlay<Appointment>(COL.appointments, []).filter((a) => a.status === "booked");
  const extra = new Map<string, number>();
  for (const a of live) {
    const d = new Date(a.start);
    const local = new Date(d.getTime() + 4 * 3600_000);
    const key = `${a.centre}-${local.toISOString().slice(0, 10)}-${local.toISOString().slice(11, 16).replace(":", "")}`;
    extra.set(key, (extra.get(key) ?? 0) + 1);
  }
  return raw.map((s) => ({ ...s, booked: Math.min(s.capacity, s.booked + (extra.get(s.id) ?? 0)) }));
}

export function loadConversations(): Conversation[] {
  const seed = readJsonSafe<Conversation[]>(`${DIR}/conversations.json`, []);
  return withOverlay(COL.conversations, seed).sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}

export function loadHandoffs(): Handoff[] {
  return withOverlay(COL.handoffs, readJsonSafe<Handoff[]>(`${DIR}/handoffs.json`, [])).sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
}

export function loadInbound(): InboundContact[] {
  return readJsonSafe<InboundContact[]>(`${DIR}/inbound.json`, []);
}

export function loadKbDrafts(): KbDraft[] {
  return withOverlay<KbDraft>(COL.kbDrafts, []);
}

export function loadExceptions(): ExceptionRecord[] {
  return withOverlay<ExceptionRecord>(COL.exceptions, []);
}

export function loadConsoleData(): ConsoleData & { approvals: ReturnType<typeof listApprovals> } {
  return {
    customers: loadCustomers(),
    cases: loadCases(),
    permits: loadPermits(),
    tickets: loadTickets(),
    appointments: loadAppointments(),
    conversations: loadConversations(),
    handoffs: loadHandoffs(),
    inbound: loadInbound(),
    kbDrafts: loadKbDrafts(),
    exceptions: loadExceptions(),
    approvals: listApprovals({ solution: SLUG }),
  };
}

/* ───────────── Customer lookup ───────────── */

export function digits(s: string | null | undefined) {
  return (s ?? "").replace(/\D/g, "");
}

export function findByMobile(mobile: string | null | undefined): Customer | undefined {
  const m = normMobile(mobile);
  if (m.length < 8) return undefined;
  return loadCustomers().find((c) => normMobile(c.mobile) === m);
}

export function findByEid(eid: string | null | undefined): Customer | undefined {
  const d = digits(eid);
  if (d.length < 15) return undefined;
  return loadCustomers().find((c) => digits(c.emiratesId) === d);
}

/** Resolve any reference (housing case, permit, ticket, appointment) to its owner. */
export function findByReference(ref: string | null | undefined): { customer?: Customer; kind?: string; id?: string } {
  const r = (ref ?? "").toUpperCase().replace(/\s+/g, "");
  if (!r) return {};
  const customers = loadCustomers();
  const hg = r.match(/(?:MNDA-?HG-?2026-?)?(\d{6})$/);
  if (/HG/.test(r) || (hg && !/BP|CHC|APT/.test(r))) {
    const id = `MNDA-HG-2026-${(hg?.[1] ?? "").padStart(6, "0")}`;
    const c = customers.find((x) => x.housingCaseIds.includes(id));
    if (c) return { customer: c, kind: "housing", id };
    const kase = loadCases().find((k) => k.id === id);
    if (kase) return { customer: customers.find((x) => digits(x.emiratesId) === digits(kase.applicant.emiratesId)), kind: "housing", id };
  }
  const bp = r.match(/BP-?2026-?(\d{5})/) ?? (/^\d{5}$/.test(r) ? [r, r] : null);
  if (bp) {
    const id = `MNDA-BP-2026-${bp[1]}`;
    const p = loadPermits().find((x) => x.id === id);
    if (p) return { customer: customers.find((c) => c.id === p.customerId), kind: "permit", id };
  }
  const chc = r.match(/CHC-?2026-?(\d{6})/);
  if (chc) {
    const id = `CHC-2026-${chc[1]}`;
    const t = loadTickets().find((x) => x.id === id);
    if (t) return { customer: customers.find((c) => c.id === t.customerId), kind: "ticket", id };
  }
  const apt = r.match(/APT-?26-?(\d{5})/);
  if (apt) {
    const id = `APT-26-${apt[1]}`;
    const a = loadAppointments().find((x) => x.id === id);
    if (a) return { customer: customers.find((c) => c.id === a.customerId), kind: "appointment", id };
  }
  return {};
}

/** All references linked to a customer, including runtime-created tickets and appointments. */
export function customerReferences(c: Customer) {
  const cases = loadCases().filter((k) => c.housingCaseIds.includes(k.id) || digits(k.applicant.emiratesId) === digits(c.emiratesId));
  const permits = loadPermits().filter((p) => p.customerId === c.id || c.permitIds.includes(p.id));
  const tickets = loadTickets().filter((t) => t.customerId === c.id || c.ticketIds.includes(t.id));
  const appointments = loadAppointments().filter((a) => a.customerId === c.id);
  return { cases, permits, tickets, appointments };
}

/* ───────────── Session (verification state lives server-side) ───────────── */

const sessionKey = (id: string) => `${SLUG}:session:${id}`;

export function getSession(id: string): SessionState | undefined {
  return kvGet<SessionState>(sessionKey(id));
}

export function saveSession(s: SessionState) {
  kvSet(sessionKey(s.sessionId), s);
}

export function levelFor(factors: string[]): SessionState["level"] {
  const n = new Set(factors).size;
  return n >= 2 ? "verified" : n === 1 ? "partial" : "none";
}

export const FACTOR_LABEL: Record<string, { en: string; ar: string }> = {
  registered_mobile: { en: "Registered mobile (caller ID / WhatsApp)", ar: "الرقم المسجّل (هوية المتصل / واتساب)" },
  emirates_id: { en: "Emirates ID number", ar: "رقم الهوية الإماراتية" },
  reference_dob: { en: "Case / permit number + date of birth", ar: "رقم الطلب أو الرخصة مع تاريخ الميلاد" },
};

/* ───────────── Working days ───────────── */

/** Count UAE working days (Mon–Fri) strictly after `from` up to and including `to`. */
export function workingDaysBetween(from: string | Date, to: string | Date = DEMO_TODAY): number {
  const a = new Date(typeof from === "string" ? from.slice(0, 10) : from.toISOString().slice(0, 10));
  const b = new Date(typeof to === "string" ? to.slice(0, 10) : to.toISOString().slice(0, 10));
  let n = 0;
  for (let d = new Date(a.getTime() + 86400000); d <= b; d = new Date(d.getTime() + 86400000)) {
    const dow = d.getUTCDay();
    if (dow >= 1 && dow <= 5) n++;
  }
  return n;
}

export function addWorkingDays(from: Date, days: number): Date {
  let d = new Date(from);
  let added = 0;
  while (added < days) {
    d = new Date(d.getTime() + 86400000);
    const dow = d.getUTCDay();
    if (dow >= 1 && dow <= 5) added++;
  }
  return d;
}

/** Next sequential CHC ticket number across seed + runtime tickets. */
export function nextTicketId(): string {
  const max = loadTickets().reduce((m, t) => Math.max(m, Number(t.id.split("-").pop()) || 0), 118650);
  return `CHC-2026-${String(max + 1).padStart(6, "0")}`;
}

export function nextAppointmentId(): string {
  const max = loadAppointments().reduce((m, a) => Math.max(m, Number(a.id.split("-").pop()) || 0), 41200);
  return `APT-26-${String(max + 1).padStart(5, "0")}`;
}

export function nextHandoffId(): string {
  const n = loadHandoffs().reduce((m, h) => Math.max(m, Number(h.id.split("-").pop()) || 0), 30);
  return `HO-2610-${String(n + 1).padStart(4, "0")}`;
}

/* ───────────── Customer-facing retrieval: Public documents only ───────────── */

/**
 * Anything the assistant may say to a customer must come from documents classified Public
 * (circulars, service guides, charter, FAQs, policies) — never Internal or Confidential material.
 */
export function searchPublic(queries: string[], k = 5): SearchHit[] {
  const pub = new Set(listDocs("mnda/knowledge").filter((d) => /^public$/i.test(String(d.classification ?? ""))).map((d) => d.id));
  return search("mnda/knowledge", queries.filter(Boolean), k * 4)
    .filter((h) => pub.has(h.docId))
    .slice(0, k);
}
