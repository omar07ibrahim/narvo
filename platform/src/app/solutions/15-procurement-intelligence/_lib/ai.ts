import "server-only";
import { z } from "zod";
import { generateObject } from "@/lib/ai/json";
import { chatStream } from "@/lib/ai/client";
import { langName } from "@/lib/ai/request";
import type { Emitter } from "@/lib/ai/stream";
import type { Citation } from "@/lib/ai/events";
import { search } from "@/lib/retrieval";
import { CORPUS, SOL, groundQuote, sectionTitle } from "./server";
import type {
  CellStatus,
  ClarQuestion,
  Clarification,
  CriterionEval,
  EvalChange,
  GateEval,
  PriceSchedule,
  ScopeEval,
  Supplier,
  SupplierEval,
  Tender,
} from "./types";

type Lang = "en" | "ar";
interface Ctx {
  emit: Emitter;
  lang: Lang;
  modelKey: string | null;
}

const STATUS = z.enum(["met", "partial", "missing", "clarify"]);

/* ════════════════ 1. Evaluate one submission against the criteria ════════════════ */

const evalSchema = z.object({
  summary: z.string(),
  criteria: z.array(z.object({ id: z.string(), status: STATUS, score: z.number(), quote: z.string(), section: z.string(), gap: z.string().nullable(), strength: z.string().nullable() })),
  scope: z.array(z.object({ id: z.string(), status: z.enum(["included", "excluded", "unclear"]), quote: z.string(), section: z.string() })),
  gates: z.array(z.object({ id: z.string(), status: STATUS, quote: z.string(), section: z.string(), note: z.string().nullable() })),
  missing: z.array(z.string()),
  risks: z.array(z.string()),
});

export async function evaluateSupplier(ctx: Ctx, opts: { tender: Tender; supplier: Supplier; body: string; prices: PriceSchedule }): Promise<SupplierEval> {
  const { tender, supplier, body, prices } = opts;
  const aiGates = tender.gates.filter((g) => g.kind === "ai");
  const system = [
    `You are a technical evaluator on the tender committee of the Marsa Al Noor Development Authority (MNDA) for tender ${tender.ref} "${tender.title.en}".`,
    "Evaluate ONE supplier's technical proposal strictly against the published criteria, using only the proposal text provided. Do not use general knowledge about the company.",
    "For each technical criterion: status = met (fully addresses the guidance with specifics), partial (addressed but weaker, generic or below expectations), missing (not addressed), clarify (ambiguous or internally inconsistent — needs a written clarification).",
    "score: 0–10 on the MNDA scale (0 not addressed, 2 poor, 4 weak, 6 adequate, 8 good, 10 excellent); compare the depth and specificity of the evidence. quote: ONE sentence copied verbatim from the proposal (max 35 words). section: the proposal section number (e.g. \"2.3\"). gap: what is missing or weak (null if none). strength: the main strength (null if none).",
    "Scope items: included / excluded / unclear, with a verbatim quote. Treat any explicit exclusion or assumption that shifts a service to the Authority as excluded. If the commercial line-item list shows a service as excluded while the technical proposal is silent (or vice versa), mark it unclear.",
    `Mandatory gates ${aiGates.map((g) => g.id).join(", ")}: met / partial / missing / clarify, with quote and a short note.`,
    "missing: up to 5 specific details the committee would need. risks: up to 5 delivery risks.",
    "Price is NOT a technical criterion — never let price influence scores.",
    `Write summary, gap, strength, note, missing and risks in ${langName(lang(ctx))}. Keep quotes in the proposal's language.`,
  ].join("\n");
  const user = [
    "TECHNICAL CRITERIA:",
    tender.criteria.map((c) => `- ${c.id} (weight ${c.weight}%, proposal section ${c.section}) ${c.label.en}: ${c.guidance}`).join("\n"),
    "",
    "MANDATORY GATES TO JUDGE:",
    aiGates.map((g) => `- ${g.id} ${g.label.en}: ${g.guidance}`).join("\n"),
    "",
    "SCOPE ITEMS:",
    tender.scope.map((s) => `- ${s.id} ${s.label.en}`).join("\n"),
    "",
    `COMMERCIAL LINE ITEMS (amounts withheld from technical evaluators — inclusion only):`,
    prices.lines.map((l) => `- ${l.item} ${l.description}: ${l.total > 0 ? "priced" : "NOT PRICED"}${l.note ? ` (${l.note})` : ""}`).join("\n"),
    "",
    `TECHNICAL PROPOSAL — ${supplier.name}:`,
    body,
  ].join("\n");

  const { object } = await generateObject({ schema: evalSchema, name: "supplier_evaluation", system, user, modelKey: ctx.modelKey, solution: SOL, task: "evaluate-submission", maxTokens: 3600 });

  const ev = (q: string, sec: string) => {
    const quote = groundQuote(q, body);
    return quote ? { quote, section: sectionTitle(body, sec), source: "proposal" as const } : null;
  };
  const criteria: CriterionEval[] = tender.criteria.map((c) => {
    const r = object.criteria.find((x) => x.id.trim() === c.id);
    return {
      id: c.id,
      status: r?.status ?? "missing",
      score: clamp(Math.round((r?.score ?? 0) * 2) / 2, 0, 10),
      evidence: r ? ev(r.quote, r.section) : null,
      gap: r?.gap ?? null,
      strength: r?.strength ?? null,
    };
  });
  const scope: ScopeEval[] = tender.scope.map((s) => {
    const r = object.scope.find((x) => x.id.trim() === s.id);
    return { id: s.id, status: r?.status ?? "unclear", evidence: r ? ev(r.quote, r.section) : null };
  });
  const gates: GateEval[] = aiGates.map((g) => {
    const r = object.gates.find((x) => x.id.trim() === g.id);
    return { id: g.id, status: r?.status ?? "clarify", evidence: r ? ev(r.quote, r.section) : null, note: r?.note ?? null };
  });
  return { supplierId: supplier.id, at: Date.now(), summary: object.summary, criteria, scope, gates, missing: object.missing.slice(0, 5), risks: object.risks.slice(0, 5), history: [] };
}

const lang = (ctx: Ctx) => ctx.lang;
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

/* ════════════════ 2. Clarification questions ════════════════ */

const clarSchema = z.object({
  letter: z.string(),
  questions: z.array(z.object({ topic: z.string(), question: z.string(), ref: z.string(), reason: z.string() })),
});

export async function draftClarifications(
  ctx: Ctx,
  opts: { tender: Tender; supplier: Supplier; ev: SupplierEval; gateNotes: string[] },
): Promise<{ letter: string; questions: ClarQuestion[] }> {
  const { tender, supplier, ev } = opts;
  const at = (e: { section: string } | null) => (e ? ` (proposal § ${e.section})` : "");
  const findings = [
    ...ev.criteria.filter((c) => c.status !== "met").map((c) => `${c.id} ${tender.criteria.find((x) => x.id === c.id)?.label.en} — ${c.status}: ${c.gap ?? ""}${at(c.evidence)}`),
    ...ev.scope.filter((s) => s.status !== "included").map((s) => `${s.id} ${tender.scope.find((x) => x.id === s.id)?.label.en} — ${s.status}: "${s.evidence?.quote ?? ""}"${at(s.evidence)}`),
    ...ev.gates.filter((g) => g.status !== "met").map((g) => `Gate ${g.id} ${tender.gates.find((x) => x.id === g.id)?.label.en} — ${g.status}: ${g.note ?? ""}${at(g.evidence)}`),
    ...opts.gateNotes,
    ...ev.missing.map((m) => `Missing detail: ${m}`),
  ];
  const system = [
    `You are the secretary of MNDA's tender committee for ${tender.ref}, drafting a written clarification request under Procurement Manual v3.2, Article 29.`,
    "Clarifications may only ask the bidder to confirm, explain or evidence what was submitted. They must NOT invite any change to the price or to the substance of the bid, and must not reveal other bidders' information.",
    "Draft 2–5 precise questions, prioritising mandatory-gate failures, scope exclusions and inconsistencies, then material technical gaps. Each question: topic (short), question (formal, 1–2 sentences, cite the proposal section), ref (criterion / gate / scope id), reason (internal note for the committee, one line).",
    "letter: a short formal covering paragraph addressed to the bidder, stating that responses are due within 5 working days via the MNDA Supplier Portal and that the price may not be changed.",
    `Write in ${langName(ctx.lang)}.`,
  ].join("\n");
  const user = `Bidder: ${supplier.name}\n\nEvaluation findings:\n${findings.map((f) => `- ${f}`).join("\n")}`;
  const { object } = await generateObject({ schema: clarSchema, name: "clarification_request", system, user, modelKey: ctx.modelKey, solution: SOL, task: "draft-clarifications", maxTokens: 1600 });
  return { letter: object.letter, questions: object.questions.slice(0, 5) };
}

/* ════════════════ 3. Clarification response → evaluation update ════════════════ */

const respSchema = z.object({
  summary: z.string(),
  priceChange: z.boolean(),
  updates: z.array(
    z.object({
      kind: z.enum(["criterion", "scope", "gate"]),
      id: z.string(),
      status: z.string(),
      score: z.number().nullable(),
      quote: z.string(),
      note: z.string(),
    }),
  ),
  certificate: z.object({ standard: z.string(), number: z.string(), expiry: z.string() }).nullable(),
});

export async function applyResponse(
  ctx: Ctx,
  opts: { tender: Tender; supplier: Supplier; ev: SupplierEval; clar: Clarification | undefined; response: string },
) {
  const { tender, supplier, ev } = opts;
  const system = [
    `You are a technical evaluator on MNDA's tender committee for ${tender.ref}. The bidder ${supplier.name} has answered a written clarification request.`,
    "Update the evaluation ONLY for items the response actually addresses. Keep everything else unchanged (do not list it).",
    "Rules (Procurement Manual v3.2, Art. 29): a clarification may confirm, explain or evidence the bid but cannot change its price or substance. If the response tries to change the price or add priced scope, set priceChange=true and do not credit that part.",
    "updates: kind = criterion | scope | gate; id; status — for criteria/gates one of met, partial, missing, clarify; for scope one of included, excluded, unclear; score 0–10 for criteria (null otherwise); quote: ONE sentence copied verbatim from the response (max 35 words); note: why the status changed.",
    "certificate: if the response evidences a renewed/valid certificate, return its standard (e.g. \"ISO 41001\"), number and expiry date (YYYY-MM-DD); otherwise null.",
    `Write summary and notes in ${langName(ctx.lang)}.`,
  ].join("\n");
  const user = [
    "CURRENT EVALUATION:",
    ...ev.criteria.map((c) => `- criterion ${c.id} ${tender.criteria.find((x) => x.id === c.id)?.label.en}: ${c.status}, score ${c.score}${c.gap ? ` — gap: ${c.gap}` : ""}`),
    ...ev.scope.map((s) => `- scope ${s.id} ${tender.scope.find((x) => x.id === s.id)?.label.en}: ${s.status}`),
    ...ev.gates.map((g) => `- gate ${g.id} ${tender.gates.find((x) => x.id === g.id)?.label.en}: ${g.status}`),
    ...supplier.certificates.map((c) => `- certificate on record ${c.standard} ${c.number} expires ${c.expiry} (tender closed ${tender.closing})`),
    "",
    opts.clar ? `CLARIFICATION REQUEST ${opts.clar.ref}:\n${opts.clar.questions.map((q, i) => `${i + 1}. [${q.ref}] ${q.question}`).join("\n")}` : "CLARIFICATION REQUEST: (not on file)",
    "",
    "BIDDER RESPONSE:",
    opts.response,
  ].join("\n");
  const { object } = await generateObject({ schema: respSchema, name: "clarification_update", system, user, modelKey: ctx.modelKey, solution: SOL, task: "evaluate-clarification", maxTokens: 1800 });

  const next: SupplierEval = JSON.parse(JSON.stringify(ev));
  const changes: EvalChange[] = [];
  const now = Date.now();
  const evd = (q: string) => {
    const quote = groundQuote(q, opts.response);
    return quote ? { quote, section: opts.clar?.ref ?? "Clarification response", source: "clarification" as const } : null;
  };
  const crit = ["met", "partial", "missing", "clarify"];
  for (const u of object.updates) {
    const id = u.id.trim();
    if (u.kind === "criterion") {
      const c = next.criteria.find((x) => x.id === id);
      if (!c || !crit.includes(u.status)) continue;
      const before = `${c.status} · ${c.score}`;
      c.status = u.status as CellStatus;
      if (u.score != null) c.score = clamp(Math.round(u.score * 2) / 2, 0, 10);
      c.evidence = evd(u.quote) ?? c.evidence;
      c.gap = u.status === "met" ? null : c.gap;
      changes.push({ at: now, kind: "criterion", id, from: before, to: `${c.status} · ${c.score}`, note: u.note });
    } else if (u.kind === "scope") {
      const s = next.scope.find((x) => x.id === id);
      if (!s || !["included", "excluded", "unclear"].includes(u.status)) continue;
      const before = s.status;
      s.status = u.status as ScopeEval["status"];
      s.evidence = evd(u.quote) ?? s.evidence;
      changes.push({ at: now, kind: "scope", id, from: before, to: s.status, note: u.note });
    } else {
      const g = next.gates.find((x) => x.id === id);
      if (!g || !crit.includes(u.status)) continue; // computed gates (certificates, ICV) change only through the register
      const before = g.status;
      g.status = u.status as CellStatus;
      g.evidence = evd(u.quote) ?? g.evidence;
      g.note = u.note;
      changes.push({ at: now, kind: "gate", id, from: before, to: g.status, note: u.note });
    }
  }
  next.history = [...(ev.history ?? []), ...changes];
  return { next, changes, certificate: object.certificate, priceChange: object.priceChange, summary: object.summary };
}

/* ════════════════ 4. Evaluation report (streamed, cited) ════════════════ */

export function reportSources(tender: Tender, suppliers: Supplier[], answered: Clarification[] = []): Citation[] {
  const queries: Array<[string, string | string[]]> = [
    [CORPUS.manual, ["evaluation report contents award recommendation", "commercial scoring formula lowest price"]],
    [CORPUS.manual, ["price normalisation omitted excluded scope", "clarifications during evaluation price substance"]],
    [CORPUS.manual, ["mandatory certificates valid at closing date pass fail gates"]],
    ...suppliers.flatMap((s) => [
      [CORPUS.bids, [`${s.name} energy reduction target`, `${s.short} helpdesk CAFM`]] as [string, string[]],
      [CORPUS.bids, [`${s.name} certifications exclusions`, `${s.short} Emiratisation plan`]] as [string, string[]],
    ]),
  ];
  const seen = new Set<string>();
  const cites: Citation[] = [];
  for (const [corpus, q] of queries) {
    for (const h of search(corpus, q, 3)) {
      const key = `${h.docId}|${h.section}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const text = plainMd(h.text);
      cites.push({ n: cites.length + 1, docId: h.docId, title: h.title, ref: h.ref, section: h.section, quote: text.length > 700 ? text.slice(0, 700) + "…" : text });
      if (cites.length >= 14) break;
    }
  }
  // Only clarification responses actually received on the record are citable.
  for (const c of answered) {
    const s = suppliers.find((x) => x.id === c.supplierId);
    if (!c.responseExcerpt) continue;
    cites.push({ n: cites.length + 1, docId: c.ref, title: `Clarification response — ${s?.name ?? c.supplierId}`, ref: c.ref, section: c.ref, quote: plainMd(c.responseExcerpt) });
  }
  return cites;
}

/** Source cards show plain text: no Markdown emphasis, headings or table separators. */
function plainMd(md: string): string {
  return md
    .split("\n")
    .filter((l) => !/^\s*\|?\s*:?-{3,}/.test(l))
    .map((l) => (l.trim().startsWith("|") ? l.split("|").map((c) => c.trim()).filter(Boolean).join(" — ") : l))
    .join("\n")
    .replace(/\*\*|__/g, "")
    .replace(/^#+\s*/gm, "")
    .trim();
}

export async function* streamReport(ctx: Ctx, opts: { tender: Tender; facts: string; citations: Citation[] }): AsyncGenerator<string, string> {
  const ar = ctx.lang === "ar";
  const headings = ar
    ? "## 1. بيانات المناقصة · ## 2. العروض المستلمة · ## 3. الامتثال للشروط الإلزامية · ## 4. التقييم الفني · ## 5. الاستيضاحات · ## 6. التقييم المالي · ## 7. الترتيب المجمّع والحساسية · ## 8. التوصية"
    : "## 1. Tender particulars · ## 2. Bids received · ## 3. Mandatory compliance · ## 4. Technical evaluation · ## 5. Clarifications · ## 6. Commercial evaluation · ## 7. Combined ranking and sensitivity · ## 8. Recommendation";
  const system = [
    `LANGUAGE: write the entire report in ${langName(ctx.lang)} — headings, prose and table headers.`,
    `You are the secretary of the MNDA tender committee writing the formal evaluation report for ${opts.tender.ref} "${opts.tender.title.en}" under Procurement Manual v3.2 (Article 31).`,
    "Use the COMPUTED RESULTS exactly as given — never recompute, round differently or invent scores, prices, ranks or sensitivity conclusions.",
    "State only facts present in the record or the sources: clarifications exist only if listed in the record; do not invent attendance, meetings, signatures or conditions not supported by the findings.",
    "Cite the numbered sources [n] for statements about bids, clarifications and procedure. Computed figures need no citation.",
    "Gate status is exactly as recorded: a gate marked partial, clarify or pending is still OPEN — report it as a condition to be resolved, never as resolved. Only items listed under 'Changes after clarification' changed after a clarification.",
    `Structure with exactly these headings: ${headings}.`,
    "Section 7 must contain the REQUIRED TABLE and the REQUIRED SENSITIVITY STATEMENT copied exactly — nothing else about sensitivity.",
    "In the recommendation, name the top-ranked compliant bidder, state that award is subject to approval by the competent authority (Art. 17/32), and list conditions precedent and risks drawn from the findings. Mention evaluator overrides if any. No signature block.",
    `About 650–800 words. Formal government register${ar ? " (Modern Standard Arabic; keep reference numbers, standards and figures in Latin digits)" : ""}.`,
    ar
      ? "Arabic terminology: use the official Arabic bidder names given in the record; Emiratisation = التوطين; In-Country Value = القيمة الوطنية المضافة; mandatory gate = شرط إلزامي; Customer Happiness Centres = مراكز سعادة المتعاملين; tender committee = لجنة المناقصات; clarification = استيضاح; Authority = الهيئة."
      : "",
  ].join("\n");
  const sources = opts.citations.map((c) => `[${c.n}] ${c.title}${c.ref ? ` (${c.ref})` : ""} › ${c.section}\n${c.quote}`).join("\n\n");
  const gen = chatStream({
    messages: [
      { role: "system", content: system },
      { role: "user", content: `COMPUTED RESULTS AND EVALUATION RECORD:\n${opts.facts}\n\n---\n\nSOURCES:\n\n${sources}` },
    ],
    modelKey: ctx.modelKey,
    temperature: 0.25,
    maxTokens: 2200,
    solution: SOL,
    task: "evaluation-report",
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

/* ════════════════ 5. Sourcing — RFQ drafting from a short need ════════════════ */

const rfqSchema = z.object({
  title: z.string(),
  objective: z.string(),
  scope: z.array(z.string()),
  requirements: z.array(z.object({ text: z.string(), mandatory: z.boolean() })),
  criteria: z.array(z.object({ name: z.string(), weight: z.number(), description: z.string() })),
  submission: z.array(z.string()),
  kpis: z.array(z.string()),
  term: z.string(),
  manualRefs: z.array(z.number()),
});

export async function draftRfq(ctx: Ctx, opts: { need: string; methodLine: string; citations: Citation[] }) {
  const system = [
    "You are a senior procurement officer at the Marsa Al Noor Development Authority (MNDA), a UAE government authority.",
    "Turn the business need into RFQ / tender material that complies with the MNDA Procurement Manual v3.2 (minimum RFQ content, evaluation criteria with weights, payment 30 days, MNDA Supplier Portal).",
    "Rules: scope = 5–9 concrete service lines; requirements = 6–10 measurable requirements (mark statutory/eligibility items mandatory, e.g. licences and approvals by the competent municipal authority, insurance, ICV certificate where required); criteria = 4–6 technical criteria with integer weights summing to 100 and a one-line description; submission = documents bidders must submit; kpis = 3–5 measurable KPIs; term = proposed contract term.",
    "Ground the procedural parts in the manual excerpts; manualRefs = the source numbers you relied on.",
    "Do not invent an estimated value or a procurement method — the method is computed separately and given to you.",
    "The Authority's Arabic name is هيئة مرسى النور للتطوير. Refer to regulators generically (\"the competent authority\" / \"الجهة المختصة\", \"the competent municipal authority\" / \"البلدية المختصة\") — never name real government ministries or agencies.",
    `Write all text in ${langName(ctx.lang)} (the need may be written in Arabic or English).`,
  ].join("\n");
  const sources = opts.citations.map((c) => `[${c.n}] ${c.title} › ${c.section}\n${c.quote}`).join("\n\n");
  const { object } = await generateObject({
    schema: rfqSchema,
    name: "rfq_draft",
    system,
    user: `Business need: ${opts.need}\n\nComputed procurement method: ${opts.methodLine}\n\nManual excerpts:\n${sources}`,
    modelKey: ctx.modelKey,
    solution: SOL,
    task: "draft-rfq",
    maxTokens: 2200,
  });
  // Normalise weights to exactly 100 (largest-remainder) — computed, not trusted to the model.
  const raw = object.criteria.map((c) => Math.max(0, c.weight));
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  const exact = raw.map((w) => (w / sum) * 100);
  const floor = exact.map(Math.floor);
  let rem = 100 - floor.reduce((a, b) => a + b, 0);
  exact
    .map((w, i) => ({ i, f: w - Math.floor(w) }))
    .sort((a, b) => b.f - a.f)
    .forEach(({ i }) => {
      if (rem > 0) {
        floor[i]++;
        rem--;
      }
    });
  return {
    ...object,
    criteria: object.criteria.map((c, i) => ({ ...c, weight: floor[i] })),
    requirements: object.requirements.map((r, i) => ({ id: `R-${String(i + 1).padStart(2, "0")}`, ...r })),
    weightsAdjusted: sum !== 100,
  };
}
