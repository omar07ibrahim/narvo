import "server-only";
import { z } from "zod";
import { defineTool, type AgentTool } from "@/lib/ai/agent";
import type { Emitter } from "@/lib/ai/stream";
import type { Citation } from "@/lib/ai/events";
import { search } from "@/lib/retrieval";
import { addAudit, appendRecord } from "@/lib/store/db";
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

export function buildTools(ctx: AgentCtx): AgentTool<any>[] {
  const identify = defineTool({
    name: "identify_customer",
    description:
      "Identify and verify the customer. Pass whatever the customer has given: Emirates ID number, a reference number (housing case MNDA-HG-2026-…, permit MNDA-BP-2026-…, ticket CHC-2026-…), date of birth, or a mobile number. The caller ID / WhatsApp number is already checked automatically.",
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
      const matched: string[] = [];
      const mismatched: string[] = [];
      if (a.emiratesId) {
        if (digits(a.emiratesId) === digits(target.emiratesId)) matched.push("emirates_id");
        else mismatched.push("emirates_id");
      }
      if (a.reference) {
        if (byRef.customer?.id === target.id) matched.push("reference");
        else mismatched.push("reference");
      }
      if (a.dateOfBirth && target.dateOfBirth) {
        if (a.dateOfBirth.slice(0, 10) === target.dateOfBirth) matched.push("date_of_birth");
        else mismatched.push("date_of_birth");
      }
      s.customerId = target.id;
      s.factors = Array.from(new Set([...s.factors, ...matched]));
      s.level = levelFor(s.factors);
      publishSession(ctx);
      if (matched.length)
        pushAction(ctx, {
          kind: "verification",
          id: s.level,
          label: `Identity ${s.level === "verified" ? "verified" : "partially verified"} — ${s.factors.map((f) => FACTOR_LABEL[f]?.en ?? f).join(" + ")}`,
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
        next:
          s.level === "verified"
            ? "Identity verified. You may now discuss this customer's own references."
            : "One more factor is needed before disclosing any case details (Emirates ID, reference number or date of birth).",
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
      const hits = search("mnda/knowledge", [a.query, a.queryAr ?? ""].filter(Boolean), 5);
      const out = hits.map((h) => {
        const existing = ctx.citations.find((c) => c.docId === h.docId && c.section === h.section);
        if (existing) return { n: existing.n, title: h.title, ref: h.ref, section: h.section, text: h.text.slice(0, 900) };
        const n = ctx.citations.length + 1;
        ctx.citations.push({
          n,
          docId: h.docId,
          title: h.title,
          ref: h.ref,
          section: h.section,
          quote: h.text.length > 420 ? h.text.slice(0, 420) + "…" : h.text,
        });
        return { n, title: h.title, ref: h.ref, section: h.section, text: h.text.slice(0, 900) };
      });
      ctx.emit.data("citations", ctx.citations);
      return out.length ? { passages: out, instruction: "Cite the passages you rely on with their [n] marker." } : { passages: [], note: "Nothing found." };
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
        freeSlotsThisWeek: all.filter((s) => s.centre === c && s.date <= "2026-10-16").reduce((n, s) => n + s.capacity - s.booked, 0),
      }));
      const picks = (a.centre === "any" ? (["downtown", "al-murjan", "al-waha"] as CentreId[]) : [a.centre as CentreId]).flatMap((c) =>
        filtered.filter((s) => s.centre === c).slice(0, a.centre === "any" ? 3 : 6),
      );
      return {
        slots: picks.map((s) => ({
          slotId: s.id,
          centre: CENTRES[s.centre].en,
          date: new Date(s.date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }),
          time: s.time,
          freeCounters: s.capacity - s.booked,
        })),
        availabilityThisWeek: perCentre,
        policy: "30-minute slots; max 2 active bookings per customer; reschedule or cancel up to 2 hours before.",
      };
    },
  });

  const book = defineTool({
    name: "book_appointment",
    description:
      "Book an appointment for the identified customer in a free slot (permitted action — executes immediately). Use a slotId returned by list_available_slots.",
    parameters: z.object({
      slotId: z.string(),
      service: z.enum(["housing_documents", "housing_consultation", "permit_consultation", "completion_certificate", "general"]),
      reason: z.string().describe("Short reason, e.g. 'Submit new salary certificate for MNDA-HG-2026-004817'"),
    }),
    label: (a) => `Booking appointment ${a.slotId}`,
    execute: async (a) => {
      const blocked = requireLevel(ctx, "partial");
      if (blocked) return blocked;
      const slot = loadSlots().find((s) => s.id === a.slotId);
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
        address: CENTRES[slot.centre].address,
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
      justification: z.string().describe("Facts supporting the request, in English"),
    }),
    label: (a) => `Requesting ${a.kind.replace(/_/g, " ")} for ${a.reference}`,
    approval: (a) => {
      if (ctx.session.level !== "verified") throw new Error("identity_not_verified: two verification factors are required before requesting an exception.");
      const c = customerOf(ctx.session);
      const id = `EXC-26-${String(Date.now()).slice(-5)}`;
      const kindLabel = a.kind === "fee_refund" ? "Fee refund" : a.kind === "fee_waiver" ? "Fee waiver" : "Deadline extension";
      pushAction(ctx, {
        kind: "exception",
        id,
        label: `${kindLabel}${a.amountAed ? ` AED ${a.amountAed.toLocaleString("en-US")}` : ""} — ${a.reference}`,
        at: new Date().toISOString(),
        status: "awaiting_approval",
      });
      return {
        title: `${kindLabel} — ${a.reference}${a.amountAed ? ` · AED ${a.amountAed.toLocaleString("en-US")}` : ""}`,
        summary: `${c?.name ?? "Customer"} (${ctx.session.factors.length} factors verified). ${a.justification}`,
        actionLabel: a.kind === "fee_refund" ? "Approve refund" : "Approve exception",
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
      reason: z.string().describe("Why a human is needed"),
      intent: z.string().describe("Customer's goal in a few words"),
      summary: z.string().describe("3-4 sentence English summary for the agent: who, verified identity, what they need, key facts and references"),
      whatTried: z.array(z.string()).describe("What the assistant already checked or did"),
      sentiment: z.enum(["negative", "neutral", "positive"]),
      suggestedNextStep: z.string().describe("Concrete next step for the agent"),
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
        reason: a.reason,
        summary: a.summary,
        whatTried: a.whatTried,
        sentiment: a.sentiment,
        sentimentScore: ctx.session.sentiments?.at(-1),
        suggestedNextStep: a.suggestedNextStep,
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

export function systemPrompt(ctx: AgentCtx): string {
  const c = customerOf(ctx.session);
  const s = ctx.session;
  const identity =
    s.level === "verified" && c
      ? `VERIFIED customer: ${c.name}${c.nameAr ? ` (${c.nameAr})` : ""} — factors: ${s.factors.join(" + ")}. Their references: ${JSON.stringify(referenceSummary(c))}.`
      : s.level === "partial" && c
        ? `PARTIALLY verified (1 factor: ${s.factors.join(", ")}). The record found belongs to "${c.name.split(" ")[0]} …". Do NOT disclose any case or account details yet — ask for the Emirates ID number (or the reference number) and call identify_customer.`
        : s.ani
          ? `The ${ctx.channel === "voice" ? "caller ID" : "WhatsApp number"} ${s.ani} is not registered. Customer unidentified: to discuss their records ask for two of: Emirates ID number, reference number, date of birth.`
          : "Withheld/unknown number. Customer unidentified: to discuss their records ask for two of: Emirates ID number, reference number, date of birth.";

  return [
    "You are the AI assistant of the Customer Happiness Centre of the Marsa Al Noor Development Authority (MNDA, هيئة مرسى النور للتطوير) — a UAE government authority for housing, building permits, community services and municipal maintenance. You run privately on MNDA's own infrastructure (NARVO platform).",
    "Your purpose: help customers finish what they came to do — interpret the request, find the answer, and carry out permitted service actions. Be warm, precise and brief.",
    "",
    `TODAY: Sunday 11 October 2026. Customer Happiness Centres (Downtown, Al Murjan, Al Waha) are closed today and reopen Monday 12 October at 07:30 (Mon–Thu 07:30–15:30, Fri 07:30–12:00). You are available 24/7. Hotline 800 6632, WhatsApp +971 50 663 2000.`,
    `CHANNEL: ${ctx.channel === "voice" ? "VOICE CALL — your reply is read aloud by speech synthesis. Max 3 short sentences (≈60 words). No markdown, no bullet lists, no headings, no emoji. Say dates and times naturally. You may keep [n] citation markers (they are not spoken)." : "WHATSAPP-STYLE CHAT — concise (≤ 120 words), short paragraphs; a short bullet list is fine for missing documents or options; no headings; no emoji."}`,
    `IDENTITY: ${identity}`,
    "",
    "RULES",
    "1. Language: reply in the language of the customer's last message. If they write Arabic (including Emirati dialect such as «شو صار على طلبي», «أبا», «مالي»), answer in clear, warm Arabic — Modern Standard Arabic with light Gulf courtesy («حيّاك الله»، «أبشر»، «إن شاء الله») — never stiff, never slang-heavy. If English, answer in English.",
    "2. Verification is enforced by the tools. Never reveal status, names, amounts or documents of any record before get_case_status succeeds. Never read out full Emirates ID or financial account numbers.",
    "3. Use tools for facts — never guess a status, date, fee or rule. For any rule, document requirement, fee or deadline call search_knowledge and cite the passage as [n] right after the claim (e.g. «salary certificate must be issued within the last 30 days [2]»).",
    "4. Missing documents: name each missing item precisely, give the exact rule and its source (e.g. Circular No. 9/2026 §4.4: salary certificate issued within the last 30 days — previously 90), say how to submit (MNDA Smart → My Applications → Upload missing documents, or at a centre — offer to book), and mention the 15-working-day response window.",
    "5. Permitted actions you EXECUTE directly: book_appointment (after list_available_slots and the customer agreeing to a slot), create_ticket (complaints, maintenance, suggestions). Confirm with the returned reference number.",
    "6. You may NOT approve/reject applications, waive or refund fees, or extend deadlines — use request_exception (approval by Sara Ahmed Al Blooshi, CHC Manager) and tell the customer it is pending her approval, typical decision within 1 working day.",
    "7. Hand over (handoff_to_agent) when the customer asks for a person, is upset after your attempt, the issue needs judgement or escalation outside permitted actions (e.g. chasing a master developer about a late NOC, complaints about staff), or after two failed attempts. Write a complete summary so the agent can continue without asking again.",
    "8. Never claim an action happened unless the tool returned success. One question at a time. End with a clear next step.",
  ].join("\n");
}
