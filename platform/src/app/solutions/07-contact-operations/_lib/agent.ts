import "server-only";
import { z } from "zod";
import { defineTool, type AgentTool } from "@/lib/ai/agent";
import type { Emitter } from "@/lib/ai/stream";
import type { Citation } from "@/lib/ai/events";
import { addAudit, appendRecord, patchRecord } from "@/lib/store/db";
import {
  CHC_MANAGER,
  COL,
  DEMO_TODAY,
  FACTOR_LABEL,
  SLUG,
  addWorkingDays,
  customerReferences,
  digits,
  findByEid,
  findByMobile,
  findByReference,
  levelFor,
  loadAppointments,
  loadCaseMessages,
  loadCases,
  loadCustomers,
  loadHandoffs,
  loadPermits,
  loadSlots,
  loadTickets,
  nextAppointmentId,
  nextHandoffId,
  nextTicketId,
  saveSession,
  searchPublic,
  workingDaysBetween,
} from "./data";
import {
  CENTRES,
  SERVICES,
  maskEid,
  statusMeta,
  type Appointment,
  type CentreId,
  type Customer,
  type Handoff,
  type ServiceKey,
  type SessionAction,
  type SessionState,
  type Ticket,
  type TranscriptTurn,
} from "./types";

export interface AgentCtx {
  session: SessionState;
  emit: Emitter;
  citations: Citation[];
  actions: SessionAction[];
  transcript: TranscriptTurn[];
  channel: "voice" | "chat";
  /** Customer is writing Arabic → prefer Arabic versions of bilingual sources. */
  prefAr: boolean;
  /** Language of the operator UI — approval cards and action labels follow it. */
  uiLang?: "en" | "ar";
}

const AGENT_ACTOR = { name: "NARVO Contact Assistant", role: "AI agent", kind: "agent" as const };

function customerOf(s: SessionState): Customer | undefined {
  return s.customerId ? loadCustomers().find((c) => c.id === s.customerId) : undefined;
}

export function publishSession(ctx: AgentCtx) {
  saveSession(ctx.session);
  ctx.emit.data("session", ctx.session);
}

function pushAction(ctx: AgentCtx, a: SessionAction) {
  ctx.actions.push(a);
  ctx.session.actions = [...(ctx.session.actions ?? []), a];
  ctx.emit.data("actions", ctx.actions);
}

/** Search published knowledge, number new passages as session citations and return them for the model. */
function citeSearch(ctx: AgentCtx, queries: string[], k = 5) {
  const raw = searchPublic(queries, k * 2);
  const isAr = (t: string) => /[؀-ۿ]/.test(t.slice(0, 240));
  // Bilingual sources: keep the version in the customer's language when both exist.
  const byRef = new Map<string, typeof raw>();
  for (const h of raw) byRef.set(h.ref ?? h.docId, [...(byRef.get(h.ref ?? h.docId) ?? []), h]);
  const hits = raw
    .filter((h) => {
      const group = byRef.get(h.ref ?? h.docId)!;
      const preferred = group.filter((x) => isAr(x.text) === ctx.prefAr);
      return preferred.length ? isAr(h.text) === ctx.prefAr : true;
    })
    .slice(0, k);
  const out = hits.map((h) => {
    const existing = ctx.citations.find((c) => c.docId === h.docId && c.section === h.section);
    const n = existing?.n ?? ctx.citations.length + 1;
    if (!existing)
      ctx.citations.push({ n, docId: h.docId, title: h.title, ref: h.ref, section: h.section, quote: h.text.length > 420 ? h.text.slice(0, 420) + "…" : h.text });
    return { n, source: `${h.title}${h.ref ? ` (${h.ref})` : ""} — ${h.section}`, text: h.text.slice(0, 900) };
  });
  ctx.emit.data("citations", ctx.citations);
  return out;
}

const stripCites = (t: string) => t.replace(/\s*\[\d+\]/g, "");

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dubai" });
}

function referenceSummary(c: Customer) {
  const r = customerReferences(c);
  return [
    ...r.cases.map((k) => ({ ref: k.id, type: "housing application", status: statusMeta(k.status).en })),
    ...r.permits.map((p) => ({ ref: p.id, type: p.serviceName, status: statusMeta(p.status).en })),
    ...r.tickets.map((t) => ({ ref: t.id, type: `${t.type} ticket`, status: statusMeta(t.status).en })),
    ...r.appointments
      .filter((a) => a.status === "booked")
      .map((a) => ({ ref: a.id, type: "appointment", status: `Booked ${fmtDate(a.start)}` })),
  ];
}

const requireLevel = (ctx: AgentCtx, need: "partial" | "verified") => {
  const ok = need === "partial" ? ctx.session.level !== "none" : ctx.session.level === "verified";
  if (!ok) {
    return {
      error: "identity_not_verified",
      rule: "Customer Happiness Charter — identity verification: no case details or account actions until the required factors match.",
      currentLevel: ctx.session.level,
      factorsMatched: ctx.session.factors,
      needed:
        need === "verified"
          ? "Two factors must match: registered mobile (caller ID/WhatsApp), Emirates ID number, reference number, or date of birth. Ask the customer for the missing factor(s) and call identify_customer."
          : "Identify the customer first (Emirates ID number or a reference number) with identify_customer.",
    };
  }
  return null;
};

/* ───────────────────────── Tools ───────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches the shared runAgent({ tools }) signature
export function buildTools(ctx: AgentCtx): AgentTool<any>[] {
  // Text written for staff (handoff context, exception justification) follows the operator UI language.
  const opLang = ctx.uiLang === "ar" ? "Arabic (Modern Standard)" : "English";
  const identify = defineTool({
    name: "identify_customer",
    description:
      "Identify and verify the customer (Customer Happiness Charter §4). Pass whatever the customer has given: Emirates ID number (full, or last five digits on a registered mobile), a case/permit number together with the date of birth, or a mobile number. The caller ID / WhatsApp number is already checked automatically.",
    parameters: z.object({
      emiratesId: z.string().nullish().describe("Emirates ID as given, e.g. 784-1986-2297415-3"),
      reference: z.string().nullish().describe("Case, permit, ticket or appointment number"),
      dateOfBirth: z.string().nullish().describe("Date of birth as YYYY-MM-DD"),
      mobile: z.string().nullish().describe("Mobile number the customer states (only used to find the record)"),
    }),
    label: (a) =>
      a.emiratesId
        ? `Verifying Emirates ID ${maskEid(a.emiratesId)}`
        : a.reference
          ? `Verifying reference ${a.reference}`
          : "Identifying the customer",
    execute: async (a) => {
      const s = ctx.session;
      const byEid = a.emiratesId ? findByEid(a.emiratesId) : undefined;
      const byRef = a.reference ? findByReference(a.reference) : {};
      const byMobile = a.mobile ? findByMobile(a.mobile) : undefined;
      const current = customerOf(s);
      const candidate = current ?? byEid ?? byRef.customer ?? byMobile;
      if (!candidate) {
        return {
          status: "not_found",
          message: "No customer record matches the details given. Ask the customer to re-check the number, or offer to continue with general information only.",
        };
      }
      // If what the customer gave points to a different person than the caller-ID match, follow the stated identity
      // but drop the caller-ID factor (e.g. a relative calling from their own phone).
      let target = candidate;
      if (current && byEid && byEid.id !== current.id) {
        target = byEid;
        s.factors = [];
      }
      // Factors exactly as published in the Customer Happiness Charter §4 (MNDA/CHC/CHARTER/2026).
      const matched: string[] = [];
      const mismatched: string[] = [];
      const notes: string[] = [];
      const onRegistered = s.factors.includes("registered_mobile") && target.id === current?.id;
      if (a.emiratesId) {
        const given = digits(a.emiratesId);
        const actual = digits(target.emiratesId);
        if (given.length === 15) (given === actual ? matched : mismatched).push("emirates_id");
        else if (given.length >= 5 && onRegistered) (actual.endsWith(given.slice(-5)) ? matched : mismatched).push("emirates_id");
        else notes.push(onRegistered ? "Ask for at least the last five digits of the Emirates ID." : "On an unregistered or withheld number the FULL Emirates ID number is required (Charter §4.1).");
      }
      if (a.reference) {
        if (byRef.customer?.id !== target.id) mismatched.push("reference_dob");
        else if (!a.dateOfBirth) notes.push("A case/permit number counts as a factor only together with the date of birth (Charter §4.1) — ask for the date of birth.");
        else if (target.dateOfBirth && a.dateOfBirth.slice(0, 10) === target.dateOfBirth) matched.push("reference_dob");
        else mismatched.push("reference_dob");
      } else if (a.dateOfBirth) {
        notes.push("Date of birth counts only together with a case or permit number (Charter §4.1).");
      }
      s.customerId = target.id;
      s.factors = Array.from(new Set([...s.factors, ...matched]));
      s.level = levelFor(s.factors);
      publishSession(ctx);
      if (matched.length)
        pushAction(ctx, {
          kind: "verification",
          id: s.level,
          label:
            ctx.uiLang === "ar"
              ? `${s.level === "verified" ? "تم التحقق من الهوية" : "تحقق جزئي من الهوية"} — ${s.factors.map((f) => FACTOR_LABEL[f]?.ar ?? FACTOR_LABEL[f]?.en ?? f).join(" + ")}`
              : `Identity ${s.level === "verified" ? "verified" : "partially verified"} — ${s.factors.map((f) => FACTOR_LABEL[f]?.en ?? f).join(" + ")}`,
          at: new Date().toISOString(),
          status: "done",
        });
      return {
        status: mismatched.length && !matched.length ? "mismatch" : "ok",
        verification: s.level,
        factorsMatched: s.factors.map((f) => FACTOR_LABEL[f]?.en ?? f),
        factorsNotMatching: mismatched.map((f) => FACTOR_LABEL[f]?.en ?? f),
        customer:
          s.level === "verified"
            ? {
                name: target.name,
                nameAr: target.nameAr,
                preferredLanguage: target.preferredLanguage,
                segment: target.segment,
                references: referenceSummary(target),
                flags: target.flags ?? [],
              }
            : { firstName: target.name.split(" ")[0] },
        notes,
        next:
          s.level === "verified"
            ? "Identity verified. You may now discuss this customer's own references."
            : s.factors.includes("registered_mobile")
              ? "One more factor is needed: the Emirates ID number (last five digits are enough on a registered mobile) or the case/permit number with date of birth."
              : "Two factors are needed on an unregistered number: the full Emirates ID number AND the case/permit number with date of birth.",
      };
    },
  });

  const caseStatus = defineTool({
    name: "get_case_status",
    description:
      "Get the live status of the verified customer's housing application, building permit, CHC ticket or appointment, including missing documents, officer, SLA and next step.",
    parameters: z.object({ reference: z.string().describe("MNDA-HG-2026-…, MNDA-BP-2026-…, CHC-2026-… or APT-26-…") }),
    label: (a) => `Looking up ${a.reference}`,
    execute: async (a) => {
      const blocked = requireLevel(ctx, "verified");
      if (blocked) return blocked;
      const found = findByReference(a.reference);
      if (!found.id) return { error: "not_found", message: `No record ${a.reference} was found.` };
      if (found.customer?.id !== ctx.session.customerId)
        return { error: "not_linked", message: "This reference is not linked to the verified customer — do not disclose anything about it." };

      if (found.kind === "housing") {
        const k = loadCases().find((x) => x.id === found.id)!;
        const elapsed = workingDaysBetween(k.submittedAt);
        const messages = loadCaseMessages(k.id);
        const latest = messages[0];
        const missing = (k.missing as string[] | undefined) ?? [];
        return {
          reference: k.id,
          service: "MNDA-SVC-201 Housing Grant & Loan Programme",
          track: k.track,
          amountRequestedAed: k.amountRequested,
          submitted: fmtDate(k.submittedAt),
          channel: k.channel,
          status: statusMeta(k.status).en,
          statusCode: k.status,
          caseOfficer: k.officer ?? "Not yet assigned",
          workingDaysSinceSubmission: elapsed,
          serviceLevel: "12 working days from a complete application to decision; the clock stops while the file is incomplete (Circular 9/2026 §5.2).",
          missingDocuments: missing,
          responseWindow: missing.length ? "15 working days from the clarification request to provide the missing documents (Circular 9/2026 §5.2)." : undefined,
          howToSubmit: missing.length ? "MNDA Smart → My Applications → Upload missing documents, or at any Customer Happiness Centre." : undefined,
          caseNote: k.summary,
          latestOfficerMessage: latest?.body ?? null,
          decision: k.decision ?? null,
          today: DEMO_TODAY,
          policy: missing.length
            ? citeSearch(ctx, [...missing, "incomplete application 15 working days missing documents", "salary certificate issued within the last 30 days"], 3)
            : undefined,
          instruction: missing.length ? "Explain each missing item and cite the policy passages with their [n] markers." : undefined,
        };
      }
      if (found.kind === "permit") {
        const p = loadPermits().find((x) => x.id === found.id)!;
        return {
          reference: p.id,
          service: `${p.service} ${p.serviceName}`,
          plot: p.plot,
          district: p.district,
          gatedCommunity: p.gated,
          masterDeveloper: p.masterDeveloper,
          consultant: p.consultant,
          status: statusMeta(p.status).en,
          statusSince: fmtDate(p.statusSince),
          workingDaysInStatus: workingDaysBetween(p.statusSince),
          workingDaysSinceSubmission: workingDaysBetween(p.submittedAt),
          noc: p.gated
            ? {
                status: p.nocStatus,
                requested: p.nocRequestedAt ? fmtDate(p.nocRequestedAt) : null,
                workingDaysWaiting: p.nocRequestedAt ? workingDaysBetween(p.nocRequestedAt) : null,
                rule: "Circular 14/2026: master developers are asked to issue NOCs within 7 working days; an application may be held 'Awaiting master-developer NOC' for up to 20 working days with the SLA clock suspended; NOC valid 90 days and must match the submitted drawing revision.",
              }
            : null,
          returnReason: p.returnReason,
          officer: p.officer,
          feeAed: p.feeAed,
          nextStep: p.nextStep,
          recentHistory: p.history.slice(-4),
          policy:
            p.gated || p.returnReason
              ? citeSearch(ctx, ["master-developer NOC gated community awaiting 20 working days", p.returnReason ?? "", "NOC valid 90 days drawing revision"], 3)
              : undefined,
          instruction: p.gated || p.returnReason ? "Cite the policy passages with their [n] markers." : undefined,
        };
      }
      if (found.kind === "ticket") {
        const t = loadTickets().find((x) => x.id === found.id)!;
        return {
          reference: t.id,
          type: t.type,
          category: t.category,
          subject: t.subject,
          status: statusMeta(t.status).en,
          priority: t.priority,
          created: fmtDate(t.createdAt),
          responseDue: fmtDate(t.slaDue),
          assignedTo: t.assignedTo,
          updates: t.updates.slice(-3),
        };
      }
      const ap = loadAppointments().find((x) => x.id === found.id)!;
      return {
        reference: ap.id,
        centre: CENTRES[ap.centre]?.en,
        address: CENTRES[ap.centre]?.address,
        service: SERVICES[ap.service]?.en,
        when: new Date(ap.start).toLocaleString("en-GB", { timeZone: "Asia/Dubai", dateStyle: "full", timeStyle: "short" }),
        status: ap.status,
      };
    },
  });

  const knowledge = defineTool({
    name: "search_knowledge",
    description:
      "Search MNDA's published knowledge (circulars, service guides, Customer Happiness Charter, FAQs, appointment policy). Use it for any rule, document requirement, fee, deadline or procedure. Cite results as [n].",
    parameters: z.object({
      query: z.string().describe("Search query in English"),
      queryAr: z.string().nullish().describe("The same query in Arabic"),
    }),
    label: (a) => `Searching knowledge: “${a.query}”`,
    execute: async (a) => {
      const passages = citeSearch(ctx, [a.query, a.queryAr ?? ""], 5);
      return passages.length
        ? { passages, instruction: "Cite the passages you rely on with their [n] marker right after the claim." }
        : { passages: [], note: "Nothing found." };
    },
  });

  const listSlots = defineTool({
    name: "list_available_slots",
    description:
      "List the earliest free 30-minute appointment slots at the Customer Happiness Centres (Downtown, Al Murjan, Al Waha). Bookings are possible up to 14 days ahead.",
    parameters: z.object({
      centre: z.enum(["downtown", "al-murjan", "al-waha", "any"]).describe("Preferred centre or 'any'"),
      fromDate: z.string().nullish().describe("Earliest date YYYY-MM-DD (default: next working day)"),
      partOfDay: z.enum(["morning", "afternoon", "any"]).nullish(),
    }),
    label: (a) => `Checking free slots — ${a.centre === "any" ? "all centres" : CENTRES[a.centre as CentreId].en}`,
    execute: async (a) => {
      const from = a.fromDate && a.fromDate > DEMO_TODAY ? a.fromDate : "2026-10-12";
      const until = new Date(Date.parse(DEMO_TODAY) + 14 * 86400000).toISOString().slice(0, 10);
      const all = loadSlots().filter((s) => s.date >= from && s.date <= until && s.booked < s.capacity);
      const filtered = all.filter(
        (s) =>
          (a.centre === "any" || s.centre === a.centre) &&
          (!a.partOfDay || a.partOfDay === "any" || (a.partOfDay === "morning" ? s.time < "12:00" : s.time >= "12:00")),
      );
      const perCentre = (["downtown", "al-murjan", "al-waha"] as CentreId[]).map((c) => ({
        centre: CENTRES[c].en,
        centreAr: CENTRES[c].ar,
        freeSlotsThisWeek: all.filter((s) => s.centre === c && s.date <= "2026-10-16").reduce((n, s) => n + s.capacity - s.booked, 0),
      }));
      const picks = (a.centre === "any" ? (["downtown", "al-murjan", "al-waha"] as CentreId[]) : [a.centre as CentreId]).flatMap((c) =>
        filtered.filter((s) => s.centre === c).slice(0, a.centre === "any" ? 3 : 6),
      );
      ctx.session.offeredSlots = picks.map((s) => ({ slotId: s.id, centre: s.centre, date: s.date, time: s.time }));
      saveSession(ctx.session);
      const policy = citeSearch(ctx, ["appointment booking 30-minute slots reschedule cancel two hours maximum active bookings"], 2);
      return {
        policyPassages: policy,
        slots: picks.map((s) => ({
          slotId: s.id,
          centre: CENTRES[s.centre].en,
          centreAr: CENTRES[s.centre].ar,
          date: new Date(s.date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }),
          time: s.time,
          freeCounters: s.capacity - s.booked,
        })),
        availabilityThisWeek: perCentre,
        note: "Cite appointment rules with the policyPassages [n] markers.",
      };
    },
  });

  const book = defineTool({
    name: "book_appointment",
    description:
      "Book an appointment for the identified customer in a free slot (permitted action — executes immediately and returns the APT-26-… confirmation number). Identify the slot by slotId from list_available_slots, or by centre + date + time.",
    parameters: z.object({
      slotId: z.string().nullish(),
      centre: z.enum(["downtown", "al-murjan", "al-waha"]).nullish(),
      date: z.string().nullish().describe("YYYY-MM-DD"),
      time: z.string().nullish().describe("HH:MM, 24h"),
      service: z.enum(["housing_documents", "housing_consultation", "permit_consultation", "completion_certificate", "general"]),
      reason: z.string().describe("Short reason, e.g. 'Submit new salary certificate for MNDA-HG-2026-004817'"),
    }),
    label: (a) => `Booking appointment ${a.slotId ?? `${a.centre ?? ""} ${a.date ?? ""} ${a.time ?? ""}`.trim()}`,
    execute: async (a) => {
      const blocked = requireLevel(ctx, "partial");
      if (blocked) return blocked;
      const hhmm = (a.time ?? "").replace(/^(\d):/, "0$1:").slice(0, 5);
      const slots = loadSlots();
      const slot = (a.slotId && slots.find((s) => s.id === a.slotId)) || slots.find((s) => s.centre === a.centre && s.date === a.date && s.time === hhmm);
      if (!slot) return { error: "unknown_slot", message: "That slot does not exist — call list_available_slots again." };
      if (slot.booked >= slot.capacity) return { error: "slot_full", message: "The slot was just taken. Offer the next free slot." };
      const active = loadAppointments().filter(
        (x) => x.customerId === ctx.session.customerId && x.status === "booked" && x.start >= `${DEMO_TODAY}`,
      );
      if (active.length >= 2)
        return { error: "booking_limit", message: "Appointment policy: maximum 2 active bookings per customer.", active: active.map((x) => x.id) };
      const id = nextAppointmentId();
      const start = `${slot.date}T${slot.time}:00+04:00`;
      const rec: Appointment & { id: string } = {
        id,
        customerId: ctx.session.customerId!,
        centre: slot.centre,
        service: a.service as ServiceKey,
        start,
        status: "booked",
        reason: a.reason,
        channel: ctx.channel === "voice" ? "AI voice assistant" : "AI WhatsApp assistant",
        createdAt: new Date().toISOString(),
        live: true,
      };
      appendRecord(COL.appointments, rec as unknown as Record<string, unknown> & { id: string });
      const c = customerOf(ctx.session);
      addAudit({
        solution: SLUG,
        actor: AGENT_ACTOR,
        action: "Booked appointment",
        subject: `${id} · ${CENTRES[slot.centre].en} · ${slot.date} ${slot.time}`,
        detail: `${c?.name ?? "Customer"} — ${SERVICES[a.service as ServiceKey].en}: ${a.reason}`,
      });
      pushAction(ctx, {
        kind: "appointment",
        id,
        label: `${CENTRES[slot.centre].en} · ${new Date(slot.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })} ${slot.time}`,
        at: new Date().toISOString(),
        status: "done",
      });
      return {
        status: "booked",
        confirmation: id,
        centre: CENTRES[slot.centre].en,
        centreAr: CENTRES[slot.centre].ar,
        address: CENTRES[slot.centre].address,
        addressAr: CENTRES[slot.centre].addressAr,
        when: `${new Date(slot.date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })} at ${slot.time}`,
        reminder: "An SMS confirmation is sent to the registered mobile. Arrive 10 minutes early; 10-minute grace period.",
      };
    },
  });

  const ticket = defineTool({
    name: "create_ticket",
    description:
      "Log a complaint, municipal maintenance request, suggestion or enquiry as a Customer Happiness ticket (permitted action — executes immediately and returns a CHC-2026-… number).",
    parameters: z.object({
      type: z.enum(["complaint", "maintenance", "suggestion", "enquiry"]),
      category: z.string().describe("e.g. Street lighting, Irrigation, Road & pavement, Housing case handling, Service delay"),
      subject: z.string().describe("Short English subject line"),
      description: z.string().describe("What the customer reported, in their words"),
      location: z.string().nullish(),
      district: z.string().nullish().describe("e.g. MN-07 Al Ghaf Community"),
      priority: z.enum(["normal", "high", "urgent"]),
    }),
    label: (a) => `Logging ${a.type}: ${a.subject}`,
    execute: async (a) => {
      if (ctx.session.level === "none" && !ctx.session.ani)
        return requireLevel(ctx, "partial");
      // Duplicate guard: an open ticket for the same issue (same customer, or same district + category) is updated
      // with the new report instead of creating a second ticket.
      const words = (t: string) => new Set(t.toLowerCase().split(/[^a-z0-9؀-ۿ]+/).filter((w) => w.length > 3));
      const catWords = words(`${a.category} ${a.subject}`);
      const dup = loadTickets().find((t) => {
        if (t.status !== "open" && t.status !== "in_progress") return false;
        if (t.type !== a.type) return false;
        const sameCustomer = !!ctx.session.customerId && t.customerId === ctx.session.customerId;
        const sameDistrict = !!a.district && !!t.district && t.district.slice(0, 5) === a.district.slice(0, 5);
        const overlap = [...words(`${t.category} ${t.subject}`)].filter((w) => catWords.has(w)).length;
        return (sameCustomer || sameDistrict) && overlap >= 1;
      });
      if (dup) {
        const at = new Date().toISOString();
        patchRecord(COL.tickets, dup.id, {
          updates: [...dup.updates, { at, note: `Reported again via ${ctx.channel === "voice" ? "hotline" : "WhatsApp"} (AI assistant): ${a.description.slice(0, 220)}` }],
          priority: dup.priority === "normal" && a.priority !== "normal" ? a.priority : dup.priority,
        });
        addAudit({ solution: SLUG, actor: AGENT_ACTOR, action: "Linked repeat report to existing ticket", subject: `${dup.id} · ${dup.subject}`, detail: a.description.slice(0, 200) });
        pushAction(ctx, { kind: "ticket", id: dup.id, label: `Linked to existing ${dup.type} · ${dup.subject}`, at, status: "done" });
        return {
          status: "existing_ticket_updated",
          ticket: dup.id,
          subject: dup.subject,
          ticketStatus: statusMeta(dup.status).en,
          assignedTo: dup.assignedTo,
          responseDue: fmtDate(dup.slaDue),
          lastUpdate: dup.updates.at(-1) ?? null,
          note: "No new ticket was created: this issue is already logged. Tell the customer the existing reference, its status and that their report was added to it.",
        };
      }
      const id = nextTicketId();
      const now = new Date();
      const days = a.type === "maintenance" ? 3 : a.type === "complaint" ? 2 : a.type === "enquiry" ? 1 : 5;
      const assigned =
        a.type === "maintenance"
          ? /light|road|pavement|irrigation|park|waste|drain|pothole/i.test(a.category)
            ? "Field Operations & Inspection"
            : "Facilities & Assets"
          : /housing/i.test(a.category)
            ? "Housing & Community Services"
            : /permit|noc/i.test(a.category)
              ? "Planning & Building Permits"
              : "Customer Happiness Centre";
      const rec: Ticket = {
        id,
        customerId: ctx.session.customerId,
        type: a.type,
        service: a.type === "maintenance" ? "MNDA-SVC-502" : "MNDA-SVC-501",
        category: a.category,
        subject: a.subject,
        description: a.description,
        district: a.district ?? undefined,
        location: a.location ?? undefined,
        priority: a.priority,
        status: "open",
        createdAt: now.toISOString(),
        slaDue: addWorkingDays(new Date(`${DEMO_TODAY}T12:00:00+04:00`), days).toISOString(),
        assignedTo: assigned,
        channel: ctx.channel === "voice" ? "phone" : "whatsapp",
        updates: [{ at: now.toISOString(), note: "Logged by the AI assistant during the customer's contact; routed automatically." }],
        live: true,
      };
      appendRecord(COL.tickets, rec as unknown as Record<string, unknown> & { id: string });
      addAudit({
        solution: SLUG,
        actor: AGENT_ACTOR,
        action: a.type === "complaint" ? "Logged complaint" : a.type === "maintenance" ? "Logged maintenance request" : "Logged ticket",
        subject: `${id} · ${a.subject}`,
        detail: `Routed to ${assigned}; response due ${fmtDate(rec.slaDue)}`,
      });
      pushAction(ctx, { kind: "ticket", id, label: `${a.type} · ${a.subject}`, at: now.toISOString(), status: "done" });
      return {
        status: "created",
        ticket: id,
        routedTo: assigned,
        responseDue: fmtDate(rec.slaDue),
        serviceLevel: a.type === "maintenance" ? "3 working days" : a.type === "complaint" ? "2 working days" : `${days} working days`,
      };
    },
  });

  const exception = defineTool({
    name: "request_exception",
    description:
      "Request an exception the AI may NOT grant itself — fee refund (e.g. duplicate payment), fee waiver, or extension of a document deadline. Creates a request for approval by the Customer Happiness Centre Manager; nothing is executed until she approves.",
    parameters: z.object({
      kind: z.enum(["fee_refund", "fee_waiver", "deadline_extension"]),
      reference: z.string().describe("Related permit/case/payment reference"),
      amountAed: z.number().nullish(),
      justification: z.string().describe(`Facts supporting the request, in ${opLang}`),
    }),
    label: (a) => `Requesting ${a.kind.replace(/_/g, " ")} for ${a.reference}`,
    approval: (a) => {
      if (ctx.session.level !== "verified") throw new Error("identity_not_verified: two verification factors are required before requesting an exception.");
      const c = customerOf(ctx.session);
      const id = `EXC-26-${String(Date.now()).slice(-5)}`;
      const kindLabel = a.kind === "fee_refund" ? "Fee refund" : a.kind === "fee_waiver" ? "Fee waiver" : "Deadline extension";
      const ar = ctx.uiLang === "ar";
      const kindLabelUi = ar ? (a.kind === "fee_refund" ? "استرداد رسوم" : a.kind === "fee_waiver" ? "إعفاء من الرسوم" : "تمديد مهلة") : kindLabel;
      const amountUi = a.amountAed
        ? ar
          ? `${a.amountAed.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(a.amountAed) ? 0 : 2, maximumFractionDigits: 2 })} درهم`
          : `AED ${a.amountAed.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(a.amountAed) ? 0 : 2, maximumFractionDigits: 2 })}`
        : "";
      pushAction(ctx, {
        kind: "exception",
        id,
        label: `${kindLabelUi}${amountUi ? ` ${amountUi}` : ""} — ${a.reference}`,
        at: new Date().toISOString(),
        status: "awaiting_approval",
      });
      return {
        title: `${kindLabelUi} — ${a.reference}${amountUi ? ` · ${amountUi}` : ""}`,
        summary: ar
          ? `${c?.nameAr ?? c?.name ?? "المتعامل"} (تم التحقق بعاملين). ${a.justification}`
          : `${c?.name ?? "Customer"} (${ctx.session.factors.length} factors verified). ${a.justification}`,
        actionLabel: ar ? (a.kind === "fee_refund" ? "اعتماد الاسترداد" : "اعتماد الاستثناء") : a.kind === "fee_refund" ? "Approve refund" : "Approve exception",
        approver: CHC_MANAGER,
        effects: [
          {
            type: "append",
            collection: COL.exceptions,
            item: {
              id,
              kind: a.kind,
              reference: a.reference,
              customerId: ctx.session.customerId,
              amountAed: a.amountAed ?? null,
              justification: a.justification,
              status: "approved",
              createdAt: new Date().toISOString(),
            },
          },
          {
            type: "audit",
            action: a.kind === "fee_refund" ? "Refund approved — returned to original payment method within 10 working days" : `${kindLabel} approved`,
            subject: `${id} · ${a.reference}`,
            detail: a.justification,
          },
        ],
      };
    },
  });

  const handoff = defineTool({
    name: "handoff_to_agent",
    description:
      "Transfer the conversation to a human Customer Happiness agent with a complete context summary, so the customer never has to repeat themselves. Use when the customer asks for a person, is upset after your attempt, or the request needs human judgement.",
    parameters: z.object({
      reason: z.string().describe(`Why a human is needed (${opLang})`),
      intent: z.string().describe(`Customer's goal in a few words (${opLang})`),
      summary: z.string().describe(`3-4 sentence ${opLang} summary for the agent: who, verified identity, what they need, key facts and references`),
      whatTried: z.array(z.string()).describe(`What the assistant already checked or did (${opLang})`),
      sentiment: z.enum(["negative", "neutral", "positive"]),
      suggestedNextStep: z.string().describe(`Concrete next step for the agent (${opLang})`),
      priority: z.enum(["high", "normal"]),
      references: z.array(z.string()).nullish(),
    }),
    label: () => "Handing over to a Customer Happiness agent",
    execute: async (a) => {
      const c = customerOf(ctx.session);
      const id = nextHandoffId();
      const waiting = loadHandoffs().filter((h) => h.status === "waiting").length;
      const rec: Handoff = {
        id,
        createdAt: new Date().toISOString(),
        status: "waiting",
        priority: a.priority,
        channel: ctx.channel === "voice" ? "phone" : "whatsapp",
        language: /[؀-ۿ]/.test(ctx.transcript.filter((t) => t.role === "customer").map((t) => t.text).join(" ")) ? "ar" : "en",
        customerId: c?.id ?? null,
        customerName: c?.name ?? "Unidentified caller",
        verified: ctx.session.level === "verified",
        verification:
          ctx.session.factors.length > 0
            ? ctx.session.factors.map((f) => FACTOR_LABEL[f]?.en ?? f).join(" + ")
            : "Not verified",
        intent: a.intent,
        reason: stripCites(a.reason),
        summary: stripCites(a.summary),
        whatTried: a.whatTried.map(stripCites),
        sentiment: a.sentiment,
        sentimentScore: ctx.session.sentiments?.at(-1),
        suggestedNextStep: stripCites(a.suggestedNextStep),
        references: a.references ?? [],
        transcript: ctx.transcript,
        assignedTo: null,
        resolution: null,
        sessionId: ctx.session.sessionId,
        live: true,
      };
      appendRecord(COL.handoffs, rec as unknown as Record<string, unknown> & { id: string });
      ctx.session.handoffId = id;
      publishSession(ctx);
      addAudit({
        solution: SLUG,
        actor: AGENT_ACTOR,
        action: "Handed over to human agent",
        subject: `${id} · ${rec.customerName}`,
        detail: `${a.reason} — next step: ${a.suggestedNextStep}`,
      });
      pushAction(ctx, { kind: "handoff", id, label: a.intent, at: rec.createdAt, status: "waiting" });
      ctx.emit.data("handoff", rec);
      return {
        status: "queued_for_agent",
        handoffId: id,
        positionInQueue: waiting + 1,
        estimatedWait: waiting === 0 ? "under 2 minutes" : `about ${Math.round((waiting + 1) * 1.8)} minutes`,
        note: "Tell the customer a Customer Happiness agent will continue in this same conversation with the full context, so they won't need to repeat anything.",
      };
    },
  });

  return [identify, caseStatus, knowledge, listSlots, book, ticket, exception, handoff];
}

/* ───────────────────────── System prompt ───────────────────────── */

/** Conversation memory carried across turns (tool results are not part of the chat history). */
function memory(ctx: AgentCtx): string[] {
  const s = ctx.session;
  const done = (s.actions ?? []).filter((a) => a.kind !== "verification");
  const offered = s.offeredSlots ?? [];
  const out: string[] = [];
  if (done.length)
    out.push(`ALREADY DONE IN THIS CONVERSATION (real references — never invent others): ${done.map((a) => `${a.kind} ${a.id} — ${a.label} (${a.status})`).join("; ")}.`);
  if (offered.length)
    out.push(
      `SLOTS YOU OFFERED EARLIER: ${offered.map((o) => `${o.slotId} = ${CENTRES[o.centre as CentreId]?.en ?? o.centre} ${o.date} ${o.time}`).join("; ")}. When the customer chooses one, call book_appointment with its slotId — a booking only exists once the tool returns a confirmation number.`,
    );
  if (ctx.citations.length)
    out.push(`SOURCES ALREADY CITED (reuse these numbers): ${ctx.citations.map((c) => `[${c.n}] ${c.title} — ${c.section}`).join("; ")}.`);
  return out;
}

export function systemPrompt(ctx: AgentCtx): string {
  const c = customerOf(ctx.session);
  const s = ctx.session;
  const identity =
    s.level === "verified" && c
      ? `VERIFIED customer: ${c.name}${c.nameAr ? ` (${c.nameAr})` : ""} — factors: ${s.factors.join(" + ")}. Their references: ${JSON.stringify(referenceSummary(c))}.`
      : s.level === "partial" && c
        ? `PARTIALLY verified (1 factor: ${s.factors.join(", ")}). The record found belongs to "${c.name.split(" ")[0]} …". Do NOT disclose any case or account details yet — ask for the Emirates ID number (the last five digits are enough on a registered mobile) or the case/permit number with date of birth, then call identify_customer.`
        : s.ani
          ? `The ${ctx.channel === "voice" ? "caller ID" : "WhatsApp number"} ${s.ani} is not registered. Customer unidentified: to discuss their records two factors are required — the FULL Emirates ID number AND the case/permit number with date of birth (Charter §4.2). General information can be given without verification.`
          : "Withheld/unknown number. Customer unidentified: to discuss their records two factors are required — the FULL Emirates ID number AND the case/permit number with date of birth (Charter §4.2). General information can be given without verification.";

  return [
    "You are the AI assistant of the Customer Happiness Centre of the Marsa Al Noor Development Authority (MNDA, هيئة مرسى النور للتطوير) — a UAE government authority for housing, building permits, community services and municipal maintenance. You run privately on MNDA's own infrastructure (NARVO platform).",
    "Your purpose: help customers finish what they came to do — interpret the request, find the answer, and carry out permitted service actions. Be warm, precise and brief.",
    "",
    `TODAY: Sunday 11 October 2026. Customer Happiness Centres (Downtown, Al Murjan, Al Waha) are closed today and reopen Monday 12 October at 07:30 (Mon–Thu 07:30–15:30, Fri 07:30–12:00). You are available 24/7. Hotline 800 6632, WhatsApp +971 50 663 2000.`,
    `CHANNEL: ${ctx.channel === "voice" ? "VOICE CALL — your reply is read aloud by speech synthesis. STRICT: at most 3 short sentences (≈50 words) — the essential answer and one question. No markdown, no lists, no headings, no emoji. Say dates and times naturally. Keep [n] citation markers (they are not spoken)." : "WHATSAPP-STYLE CHAT — concise (≤ 120 words), short paragraphs; a short bullet list is fine for missing documents or options; no headings; no emoji."}`,
    `IDENTITY: ${identity}`,
    ...memory(ctx),
    "",
    "RULES",
    "1. Language: reply in the language of the customer's last message. Customers often write Emirati dialect («شو صار على طلبي», «أبا», «مالي») — understand it fully, but ANSWER in clear, simple Modern Standard Arabic (فصحى مبسّطة) with a warm Gulf courtesy opener such as «حيّاك الله» or «أبشر». Do not imitate dialect (no «وش»، «خلني»، «أشيك»، «اللي»). If English, answer in English.",
    "   Arabic terminology: مراكز إسعاد المتعاملين · تعميم رقم 9 لسنة 2026 · شهادة راتب صادرة خلال آخر 30 يوماً · شهادة عدم ملكية عقار من دائرة الأراضي في مرسى النور · طلب استكمال مستندات · رخصة بناء · شهادة عدم ممانعة من المطور الرئيسي · تطبيق MNDA Smart ← طلباتي ← تحميل المستندات الناقصة · المراكز: وسط المدينة، المرجان، الواحة (use the tools' centreAr names).",
    "2. Verification is enforced by the tools. Never reveal status, names, amounts or documents of any record before get_case_status succeeds. Never read out full Emirates ID or financial account numbers.",
    "3. Use tools for facts — never guess a status, date, fee or rule. Every rule, document requirement, fee or deadline you state must be cited with the numeric marker [n] of a passage returned by a tool (get_case_status returns `policy` passages; otherwise call search_knowledge first), e.g. «salary certificate must be issued within the last 30 days [2]». Never write source names in brackets yourself.",
    "4. Missing documents: name each missing item precisely, give the exact rule and its source (e.g. Circular No. 9/2026 §4.4: salary certificate issued within the last 30 days — previously 90), say how to submit (MNDA Smart → My Applications → Upload missing documents, or at a centre — offer to book), and mention the 15-working-day response window.",
    "5. Permitted actions you EXECUTE directly: book_appointment (after list_available_slots and the customer agreeing to a slot), create_ticket (complaints, maintenance, suggestions). When the customer agrees, CALL the tool in that same turn — a booking or ticket exists only once the tool returns its APT-26-… / CHC-2026-… number; quote that number exactly. Before logging a complaint or maintenance request, check the customer's existing open tickets (from identify_customer) to avoid duplicates.",
    "6. You may NOT approve/reject applications, waive or refund fees, or extend deadlines — use request_exception (approval by Sara Ahmed Al Blooshi, CHC Manager) and tell the customer it is pending her approval, typical decision within 1 working day.",
    "7. Hand over (handoff_to_agent) when the customer asks for a person, is upset after your attempt, the issue needs judgement or escalation outside permitted actions (e.g. chasing a master developer about a late NOC, complaints about staff), or after two failed attempts. Write a complete summary so the agent can continue without asking again.",
    "8. Never claim an action happened unless the tool returned success. Do not narrate tool use («let me check», «دعني أتحقق») — call the tools first, then write one reply. Never invent reasons or excuses (e.g. why a promised call-back did not happen); apologise, and offer a concrete fix or a handover. One question at a time. End with a clear next step.",
  ].join("\n");
}
