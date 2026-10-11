import "server-only";
import { z } from "zod";
import { generateObject } from "@/lib/ai/json";
import { chatStream } from "@/lib/ai/client";
import { langName } from "@/lib/ai/request";
import type { Emitter } from "@/lib/ai/stream";
import type { Citation } from "@/lib/ai/events";
import { CORPUS, SOL, clauseOf, groundQuote, pool, retry } from "./server";
import { dueDate } from "./dates";
import type { Contract, ExtractedObligation, Finding, Obligation, Playbook, Trigger } from "./types";

type Lang = "en" | "ar";

/** Official names — keeps Arabic output on the right terminology. */
export const ORG = "MNDA = Marsa Al Noor Development Authority (Arabic: هيئة مرسى النور للتطوير; \"الهيئة\"). Raseen Facilities Management LLC = رصين لإدارة المرافق ذ.م.م. Al Ghaf Community Centre = مركز الغاف المجتمعي. Contractor/Supplier = المقاول/المورد. Contract Owner = مالك العقد. Director, Procurement & Contracts = مدير إدارة المشتريات والعقود.";
interface Ctx {
  emit: Emitter;
  lang: Lang;
  modelKey: string | null;
}

/* ════════════════ 1. Clause review against the playbook ════════════════ */

const reviewSchema = z.object({
  findings: z.array(
    z.object({
      positionId: z.string(),
      status: z.enum(["compliant", "deviation", "missing"]),
      risk: z.enum(["high", "medium", "low"]),
      clauseRef: z.string(),
      quote: z.string(),
      summary: z.string(),
      redline: z.string().nullable(),
      fallbackOk: z.boolean(),
    }),
  ),
});

export async function reviewAgainstPlaybook(ctx: Ctx, opts: { name: string; body: string; playbook: Playbook }): Promise<{ findings: Finding[]; summary: string }> {
  const { emit, lang, modelKey } = ctx;
  // Four passes of four positions each: shorter outputs return sooner and the reviewer sees progress as each pass lands.
  const groups = Array.from({ length: Math.ceil(opts.playbook.positions.length / 4) }, (_, i) => opts.playbook.positions.slice(i * 4, i * 4 + 4));
  const system = [
    "You are a senior contracts lawyer in the Legal Affairs department of the Marsa Al Noor Development Authority (MNDA), a UAE government authority.",
    "Compare the contract with each listed MNDA playbook position. For every position return exactly one finding:",
    "- status: compliant (the contract meets the approved position), deviation (the contract addresses the topic but differs from the position), missing (the contract is silent where the position requires a clause).",
    "- risk: high / medium / low for MNDA, considering the position's severity, the size of the gap and whether the acceptable fallback is met.",
    "- clauseRef: the clause number as written in the contract (e.g. \"15.2\" or \"Clause 7\"); \"—\" if missing.",
    "- quote: ONE sentence copied verbatim from the contract that shows the issue (\"\" if missing).",
    `- summary: one or two sentences explaining the gap in ${langName(lang)}.`,
    "- redline: for deviation/missing, the replacement or new clause text MNDA should propose, drafted in the contract's own language and style, implementing the approved position (or the fallback if more realistic); null if compliant.",
    "- fallbackOk: true if the contract at least meets the acceptable fallback.",
    "Be precise and conservative: quote only what the contract says. Do not mark a position compliant unless the clause clearly meets it.",
    ORG,
  ].join("\n");

  const s = emit.step("review", lang === "ar" ? `مقارنة البنود بـ ${opts.playbook.positions.length} موقفاً معتمداً` : `Comparing clauses with ${opts.playbook.positions.length} approved positions`);
  const doneIds: string[] = [];
  const results = await pool(groups, 4, async (positions) => {
    const user = [
      "PLAYBOOK POSITIONS:",
      positions.map((p) => `${p.id} ${p.topic.en} [severity ${p.severity}]\n  Approved position: ${p.position}\n  Acceptable fallback: ${p.fallback}`).join("\n"),
      "",
      `CONTRACT — ${opts.name}:`,
      opts.body,
    ].join("\n");
    const { object } = await retry(() => generateObject({ schema: reviewSchema, name: "playbook_review", system, user, modelKey, solution: SOL, task: "playbook-review", maxTokens: 2400 }));
    doneIds.push(...positions.map((p) => p.id));
    emit.data("reviewProgress", { done: [...doneIds] });
    s.update(lang === "ar" ? `${doneIds.length} من ${opts.playbook.positions.length} موقفاً` : `${doneIds.length} of ${opts.playbook.positions.length} positions checked`);
    return object.findings;
  });
  const findings: Finding[] = opts.playbook.positions.map((p) => {
    const f = results.flat().find((x) => x.positionId.trim() === p.id);
    const quote = f ? groundQuote(f.quote, opts.body) : null;
    const clause = clauseOf(opts.body, quote, (f?.clauseRef ?? "—").replace(/^Clause\s+/i, ""));
    const status = f?.status ?? "missing";
    return {
      positionId: p.id,
      status,
      risk: status === "compliant" ? "low" : (f?.risk ?? p.severity),
      clauseRef: status === "missing" ? "—" : clause.ref,
      clauseTitle: status === "missing" ? "" : clause.title,
      quote,
      summary: f?.summary ?? (lang === "ar" ? "لم يُعثر على بند" : "No clause found"),
      redline: status === "compliant" ? null : (f?.redline ?? null),
      fallbackOk: f?.fallbackOk ?? false,
    };
  });
  const dev = findings.filter((f) => f.status !== "compliant");
  const high = dev.filter((f) => f.risk === "high").length;
  s.done(lang === "ar" ? `${dev.length} انحرافاً · ${high} عالي الخطورة` : `${dev.length} deviations · ${high} high risk`);
  const summary =
    lang === "ar"
      ? `${findings.length - dev.length} موقفاً متوافقاً، ${dev.length} انحرافاً أو بنداً مفقوداً (${high} عالي الخطورة).`
      : `${findings.length - dev.length} positions compliant, ${dev.length} deviations or missing clauses (${high} high risk).`;
  return { findings, summary };
}

/* ════════════════ 2. Obligation extraction ════════════════ */

const TRIGGER = z.object({
  kind: z.enum(["date", "before_end", "after_end", "after_start", "monthly_working_day", "monthly_day", "annual"]),
  date: z.string().nullable(),
  days: z.number().nullable(),
  day: z.number().nullable(),
  month: z.number().nullable(),
});
const obSchema = z.object({
  contract: z.object({ title: z.string(), counterparty: z.string(), start: z.string().nullable(), end: z.string().nullable() }),
  obligations: z.array(
    z.object({
      title: z.string(),
      party: z.enum(["MNDA", "Supplier"]),
      type: z.enum(["notice", "report", "insurance", "security", "review", "deliverable", "payment", "compliance"]),
      trigger: TRIGGER,
      sourceClause: z.string(),
      quote: z.string(),
      ownerRole: z.enum(["contract_owner", "contracts_officer", "finance", "legal", "service_manager"]),
    }),
  ),
});

function toTrigger(t: z.infer<typeof TRIGGER>): Trigger | null {
  switch (t.kind) {
    case "date":
      return t.date && /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? { kind: "date", date: t.date } : null;
    case "before_end":
    case "after_end":
    case "after_start":
      return t.days != null ? { kind: t.kind, days: Math.round(t.days) } : null;
    case "monthly_working_day":
    case "monthly_day":
      return t.day != null ? { kind: t.kind, day: Math.round(t.day) } : null;
    case "annual":
      return t.month != null && t.day != null ? { kind: "annual", month: t.month, day: t.day } : null;
  }
}

export async function extractObligations(ctx: Ctx, opts: { name: string; body: string; contract: Contract | null }) {
  const { emit, lang, modelKey } = ctx;
  const s = emit.step("extract", lang === "ar" ? "استخراج التواريخ والتعهدات" : "Extracting dates and commitments");
  const system = [
    "You are a contracts officer at the Marsa Al Noor Development Authority (MNDA). Extract the time-bound obligations from the contract — things someone must do by a date or on a schedule (notices, renewal decisions, reports, reviews, insurance and security renewals, deliverables, payments, compliance checks).",
    "Today is 11 October 2026. Prefer obligations that fall due from today onward. Recurring duties (monthly invoices, reports, review meetings) must use a recurring trigger (monthly_working_day / monthly_day / annual), never after_start. Skip one-off mobilisation duties that were completed at the start of the contract.",
    "Return 6–14 obligations, most consequential first. Each:",
    "- title: imperative, specific (in " + langName(lang) + ").",
    "- party: who must act (MNDA or Supplier).",
    "- trigger: how the date is determined — use the RULE from the contract, not a computed date: kind=before_end with days (e.g. notice 60 days before expiry), after_start/after_end with days, monthly_working_day with day (e.g. report by the 5th working day), monthly_day, annual with month and day, or date (YYYY-MM-DD) only when the contract states a fixed calendar date. Unused fields = null.",
    "- sourceClause: clause number; quote: one sentence copied verbatim from the contract.",
    "- ownerRole for MNDA follow-up: contract_owner, contracts_officer (notices, renewals, securities), finance (payments, credits), legal, or service_manager.",
    "Also return the contract title, counterparty and start/end dates (YYYY-MM-DD) as stated.",
  ].join("\n");
  const { object } = await generateObject({ schema: obSchema, name: "obligations", system, user: `CONTRACT — ${opts.name}:\n${opts.body}`, modelKey, solution: SOL, task: "extract-obligations", maxTokens: 3000 });
  const c = opts.contract;
  const dates = c ? { start: c.start, end: c.end } : { start: object.contract.start ?? "", end: object.contract.end ?? "" };
  const valid = !!(dates.start && dates.end);
  const roleOwner = (r: string) =>
    r === "contracts_officer"
      ? c?.officer ?? "Shamma Khalid Al Mansoori"
      : r === "finance"
        ? "Vikram Menon"
        : r === "legal"
          ? "Adv. Noura Khalifa Al Qubaisi"
          : r === "service_manager" && c?.id === "MNDA-CON-2025-011"
            ? "Yousef Ibrahim Al Hosani"
            : c?.owner ?? "Shamma Khalid Al Mansoori";
  const roleTitle = (r: string) =>
    r === "contracts_officer"
      ? "Senior Contracts Officer"
      : r === "finance"
        ? "Chief Financial Officer"
        : r === "legal"
          ? "Head of Legal Affairs"
          : r === "service_manager" && c?.id === "MNDA-CON-2025-011"
            ? "IT Service Desk Lead"
            : c?.ownerRole ?? (r === "contract_owner" ? "contract_owner" : "Senior Contracts Officer");
  const items: ExtractedObligation[] = object.obligations
    .map((o, i) => {
      const trigger = toTrigger(o.trigger);
      if (!trigger) return null;
      return {
        key: `X${i + 1}`,
        title: o.title,
        party: o.party,
        type: o.type,
        trigger,
        recurrence: "",
        sourceClause: o.sourceClause,
        quote: groundQuote(o.quote, opts.body),
        ownerRole: roleTitle(o.ownerRole),
        owner: roleOwner(o.ownerRole),
        due: valid || trigger.kind === "date" ? dueDate(trigger, valid ? dates : null) : null,
      };
    })
    .filter(Boolean) as ExtractedObligation[];
  s.done(lang === "ar" ? `${items.length} التزاماً — التواريخ محسوبة من قواعد العقد` : `${items.length} obligations — dates computed from the contract rules`);
  return { items, start: dates.start || null, end: dates.end || null, meta: object.contract };
}

/* ════════════════ 3. Ask a contract (scoped RAG) ════════════════ */

export async function* askContract(ctx: Ctx, opts: { question: string; citations: Citation[]; contractName: string; history: Array<{ role: "user" | "assistant"; content: string }> }) {
  const system = [
    `You are NARVO, MNDA's private contract assistant. Answer questions about ${opts.contractName} ONLY from the numbered clauses provided.`,
    "Cite every statement with [n] right after it. Quote clause numbers, amounts, notice periods and dates exactly. If the clauses do not answer the question, say so and suggest who owns the topic (Contract Owner, Procurement & Contracts, Legal Affairs).",
    `Answer in ${langName(ctx.lang)} unless the user writes in the other language. Be concise: short paragraphs or bullets.`,
    ORG,
  ].join("\n");
  const sources = opts.citations.map((c) => `[${c.n}] ${c.section}\n${c.quote}`).join("\n\n");
  const gen = chatStream({
    messages: [
      { role: "system", content: system },
      ...opts.history.slice(-6),
      { role: "user", content: `Clauses:\n\n${sources}\n\n---\n\nQuestion: ${opts.question}` },
    ],
    modelKey: ctx.modelKey,
    temperature: 0.2,
    maxTokens: 900,
    solution: SOL,
    task: "ask-contract",
    signal: ctx.emit.signal,
  });
  let text = "";
  while (true) {
    const n = await gen.next();
    if (n.done) break;
    if (n.value.content) {
      text += n.value.content;
      yield n.value.content;
    }
  }
  return text;
}

/* ════════════════ 4. Renewal decision brief ════════════════ */

const decisionSchema = z.object({
  recommendation: z.enum(["renew_with_conditions", "short_extension", "not_renew"]),
  headline: z.string(),
  conditions: z.array(z.string()),
});

export async function renewalDecision(ctx: Ctx, opts: { facts: string; sources: string }) {
  const system = [
    "You advise MNDA's Director of Procurement & Contracts on the renewal decision for contract MNDA/CON/2023/019 (Raseen Facilities Management LLC, community centres FM).",
    "Weigh the contract terms (renewal option, notice, performance review, improvement plan, service credits, termination rights) against the performance evidence and the timing of replacement tender MNDA/PRC/2026/057.",
    "recommendation: renew_with_conditions, short_extension or not_renew. headline: one sentence stating the recommendation and the main reason. conditions: 3–5 measurable conditions or actions (with dates where relevant) — empty if not_renew.",
    "Use only the facts and sources provided; computed figures are authoritative.",
    `Write headline and conditions in ${langName(ctx.lang)}.`,
    ORG,
  ].join("\n");
  const { object } = await generateObject({ schema: decisionSchema, name: "renewal_decision", system, user: `${opts.facts}\n\nSOURCES:\n${opts.sources}`, modelKey: ctx.modelKey, solution: SOL, task: "renewal-decision", maxTokens: 900 });
  return object;
}

export async function* streamText(ctx: Ctx, opts: { system: string; user: string; task: string; maxTokens?: number }) {
  const gen = chatStream({
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    modelKey: ctx.modelKey,
    temperature: 0.25,
    maxTokens: opts.maxTokens ?? 1400,
    solution: SOL,
    task: opts.task,
    signal: ctx.emit.signal,
  });
  let text = "";
  while (true) {
    const n = await gen.next();
    if (n.done) break;
    if (n.value.content) {
      text += n.value.content;
      yield n.value.content;
    }
  }
  return text;
}

export function obligationFromExtract(x: ExtractedObligation, contractId: string, lang: Lang): Obligation {
  return {
    id: `OBL-${contractId.replace(/^MNDA-CON-/, "").replace(/[^A-Z0-9-]/gi, "")}-${x.key}-${Date.now().toString(36).slice(-4).toUpperCase()}`,
    contractId,
    title: lang === "ar" ? { en: x.title, ar: x.title } : { en: x.title, ar: x.title },
    party: x.party,
    type: x.type,
    owner: x.owner,
    ownerRole: x.ownerRole,
    trigger: x.trigger,
    sourceClause: x.sourceClause,
    status: "open",
    quote: x.quote ?? undefined,
    source: "ai",
  };
}

export const CORPORA = CORPUS;
