import "server-only";
import { z } from "zod";
import { generateObject } from "@/lib/ai/json";
import { chatStream } from "@/lib/ai/client";
import { langName } from "@/lib/ai/request";
import type { Emitter } from "@/lib/ai/stream";
import type { Citation } from "@/lib/ai/events";
import { listDocs, search, type SearchHit } from "@/lib/retrieval";
import { LIB, SOL, excerpt, pool, retry, verifyQuote } from "./server";
import { mergeStatus, requirementCheck, validityEnd, fmt, addWorkingDays } from "./compliance";
import { claimSentences } from "./sentences";
import { DEMO_TODAY } from "@/lib/world/orgs";
import {
  CATEGORIES,
  type BidSeed,
  type BidTask,
  type CertificateRecord,
  type Claim,
  type Coverage,
  type CoverageStatus,
  type EvidenceRef,
  type FormRecord,
  type ReqCategory,
  type Requirement,
  type TeamMember,
} from "./types";

type Lang = "en" | "ar";
interface Ctx {
  emit: Emitter;
  lang: Lang;
  modelKey: string | null;
}

/* ════════════════ 1. Requirement extraction ════════════════ */

const extractSchema = z.object({
  requirements: z.array(
    z.object({
      id: z.string(),
      ref: z.string(),
      category: z.string(),
      title: z.string(),
      text: z.string(),
      mandatory: z.boolean(),
      evidenceNeeded: z.string(),
    }),
  ),
});

function normCategory(raw: string, id: string): ReqCategory {
  const c = raw.toLowerCase();
  if ((CATEGORIES as readonly string[]).includes(c)) return c as ReqCategory;
  if (/mand|إلزام/.test(c)) return "mandatory";
  if (/hse|safety|سلامة/.test(c)) return "hse";
  if (/staff|person|توظيف/.test(c)) return "staffing";
  if (/emirat|icv|توطين/.test(c)) return "emiratisation";
  if (/help|sla|service level/.test(c)) return "helpdesk";
  if (/report|تقارير/.test(c)) return "reporting";
  if (/commerc|financ|price|تجار/.test(c)) return "commercial";
  const p = id.trim().charAt(0).toUpperCase();
  const byPrefix: Record<string, ReqCategory> = { M: "mandatory", T: "technical", H: "hse", S: "staffing", E: "emiratisation", K: "helpdesk", R: "reporting", C: "commercial" };
  return byPrefix[p] ?? "technical";
}

/** Split an RFP into chunks for parallel extraction. For the 057 RFP we split the requirements chapter. */
export function chunkRfp(body: string, maxChars = 7000): string[] {
  const reqStart = body.search(/^##\s+4[\s.]/m);
  if (reqStart !== -1) {
    const after = body.slice(reqStart);
    const next = after.slice(3).search(/^##\s+\d+[\s.]/m);
    const chapter = next === -1 ? after : after.slice(0, next + 3);
    const subs = chapter.split(/(?=^###\s)/m).filter((s) => /\*\*[A-Z]-\d{2}\*\*|[A-Z]-\d{2}/.test(s));
    // One call per requirements sub-section (4.1 … 4.8): short outputs, all in parallel.
    if (subs.length >= 3) return subs.slice(0, 10);
  }
  // Generic: split by headings into windows of ~maxChars
  const parts = body.split(/(?=^#{1,3}\s)/m);
  const out: string[] = [];
  let buf = "";
  for (const p of parts) {
    if ((buf + p).length > maxChars && buf) {
      out.push(buf);
      buf = "";
    }
    buf += p;
    while (buf.length > maxChars * 1.4) {
      out.push(buf.slice(0, maxChars));
      buf = buf.slice(maxChars);
    }
  }
  if (buf.trim()) out.push(buf);
  return out.slice(0, 6);
}

export async function extractRequirements(
  ctx: Ctx,
  opts: { chunks: string[]; tenderLine: string; custom: boolean; sectionOf?: (id: string) => string | null },
): Promise<Requirement[]> {
  const { emit, lang, modelKey } = ctx;
  const system = [
    "You are a senior bid analyst at Raseen Facilities Management LLC (Dubai, UAE) preparing a tender response.",
    "Extract EVERY requirement in the RFP excerpt into a structured list. Rules:",
    opts.custom
      ? "- If the RFP numbers its requirements, keep that number as `id`; otherwise assign R-01, R-02… in order of appearance. `ref` = the clause/section number."
      : "- One entry per coded requirement (codes like M-01, T-04, K-03). Keep the exact code as `id`; `ref` = the section number plus code, e.g. \"§4.2 T-04\". Never merge, skip or invent requirements.",
    `- category: one of ${CATEGORIES.join(", ")}.`,
    "- title: at most 8 words. text: a precise restatement (1–2 sentences) keeping every threshold, number, standard and deadline.",
    "- mandatory: true for pass/fail requirements or where non-compliance disqualifies the bid.",
    "- evidenceNeeded: the specific documents or evidence a bidder must provide to satisfy the requirement (one sentence).",
    `- Write title, text and evidenceNeeded in ${langName(lang)}; keep codes, standards (ISO, SFG20, COBie) and numbers as written.`,
  ].join("\n");

  const s = emit.step("extract", lang === "ar" ? `استخراج المتطلبات (${opts.chunks.length} أجزاء بالتوازي)` : `Extracting requirements (${opts.chunks.length} parts in parallel)`);
  let doneParts = 0;
  const results = await pool(opts.chunks, 8, async (chunk) => {
    const { object } = await retry(() => generateObject({
      schema: extractSchema,
      name: "requirements",
      system,
      user: `${opts.tenderLine}\n\nRFP excerpt:\n\n${chunk}`,
      modelKey,
      solution: SOL,
      task: "extract-requirements",
      maxTokens: 3600,
    }));
    doneParts++;
    s.update(lang === "ar" ? `اكتمل ${doneParts} من ${opts.chunks.length}` : `${doneParts} of ${opts.chunks.length} parts done`);
    return object.requirements;
  });

  const seen = new Set<string>();
  const items: Requirement[] = [];
  for (const r of results.flat()) {
    const id = r.id.trim().replace(/\s+/g, "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    items.push({
      id,
      ref: r.ref,
      // For the coded MNDA RFP the chapter structure is authoritative (§4.1 = pass/fail, prefixes = categories).
      category: opts.custom ? normCategory(r.category, id) : normCategory("", id),
      title: r.title,
      text: r.text,
      mandatory: opts.custom ? r.mandatory : id.startsWith("M-"),
      evidenceNeeded: r.evidenceNeeded,
      section: opts.sectionOf?.(id) ?? null,
    });
  }
  const order = (id: string) => {
    const p = "MTHSEKRC".indexOf(id.charAt(0));
    const n = Number(id.replace(/\D/g, "")) || 0;
    return (p === -1 ? 9 : p) * 1000 + n;
  };
  if (!opts.custom) items.sort((a, b) => order(a.id) - order(b.id));
  s.done(lang === "ar" ? `${items.length} متطلباً · ${items.filter((r) => r.mandatory).length} إلزامياً` : `${items.length} requirements · ${items.filter((r) => r.mandatory).length} mandatory`);
  return items;
}

/* ════════════════ 2. Evidence mapping ════════════════ */

const judgeSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      status: z.enum(["met", "partial", "missing"]),
      confidence: z.number(),
      passages: z.array(z.string()),
      quote: z.string(),
      rationale: z.string(),
      gap: z.string().nullable(),
    }),
  ),
});

function hitsFor(r: Requirement, k = 4): SearchHit[] {
  return search(LIB, [r.title, r.text, r.evidenceNeeded], k);
}

function toRef(h: SearchHit, quote?: string): EvidenceRef {
  return {
    docId: h.docId,
    title: h.title,
    ref: h.ref,
    section: h.section,
    quote: quote && verifyQuote(quote, h.text) ? quote.trim() : excerpt(h.text, 260),
  };
}

export async function mapEvidence(
  ctx: Ctx,
  opts: {
    requirements: Requirement[];
    seed: BidSeed;
    certs: CertificateRecord[];
    forms: FormRecord[];
    computeChecks: boolean;
    onBatch: (entries: Coverage[]) => void;
  },
): Promise<Coverage[]> {
  const { emit, lang, modelKey } = ctx;
  const { requirements, seed } = opts;

  const s1 = emit.step("retrieve", lang === "ar" ? "البحث في مكتبة الأدلة المعتمدة (BM25)" : "Retrieving approved evidence (BM25)");
  // Search requirement by requirement and yield between searches, so the step (and its progress) reaches the
  // browser immediately instead of after the whole retrieval pass.
  const hits = new Map<string, SearchHit[]>();
  await new Promise((res) => setTimeout(res, 0));
  for (const [i, r] of requirements.entries()) {
    hits.set(r.id, hitsFor(r));
    if (i % 6 === 5) {
      s1.update(lang === "ar" ? `${i + 1} من ${requirements.length} متطلباً` : `${i + 1} of ${requirements.length} requirements`);
      await new Promise((res) => setTimeout(res, 0));
    }
  }
  const docs = new Set([...hits.values()].flat().map((h) => h.docId));
  s1.done(lang === "ar" ? `${[...hits.values()].flat().length} مقطعاً من ${docs.size} مستندات لـ ${requirements.length} متطلباً` : `${[...hits.values()].flat().length} passages from ${docs.size} documents for ${requirements.length} requirements`);

  const batches: Requirement[][] = [];
  for (let i = 0; i < requirements.length; i += 8) batches.push(requirements.slice(i, i + 8));

  const system = [
    "You are a bid compliance reviewer at Raseen Facilities Management LLC. For each tender requirement you receive passages retrieved from Raseen FM's APPROVED evidence library.",
    "Judge coverage strictly on those passages — never on general knowledge or assumptions:",
    "- met: the passages evidence every element of the requirement, including numeric thresholds, frequencies, dates and named documents.",
    "- partial: some elements are evidenced, or the evidence is weaker than required (e.g. quarterly instead of monthly, no committed target, shared rather than dedicated role).",
    "- missing: no passage evidences the requirement.",
    "Judge the substance, not the paperwork: a procedure, plan or capability described in an approved document counts as evidence of it; narrative requirements (e.g. understanding of scope) are met when the library holds the facts needed to write them. Bid-specific forms, priced schedules and bank guarantees are tracked in a separate register — judge them only on what the passages show.",
    opts.computeChecks
      ? `Key dates: tender closing date ${fmt(seed.tender.closing)}; bid validity ends ${fmt(validityEnd(seed))}. A certificate or policy that expires before the date the requirement needs is NOT valid evidence.`
      : "Key dates: use the dates stated in the requirement (today is 11 Oct 2026). A certificate or policy that expires before the date the requirement needs is NOT valid evidence.",
    "For each requirement return: id; status; confidence 0–1; passages: ids of the passages relied on (e.g. [\"P2\"]); quote: ONE sentence copied verbatim from the strongest passage (max 35 words, \"\" if missing); rationale: one sentence; gap: what is missing or weaker than required (null if met).",
    `Write rationale and gap in ${langName(lang)}.`,
  ].join("\n");

  const s2 = emit.step("judge", lang === "ar" ? `تقييم التغطية (${batches.length} دفعات)` : `Judging coverage (${batches.length} batches)`);
  const all: Coverage[] = [];
  let done = 0;
  await pool(batches, 6, async (batch) => {
    const user = batch
      .map((r) => {
        const hs = hits.get(r.id) ?? [];
        return [
          `### ${r.id} — ${r.title}`,
          `Requirement: ${r.text}`,
          `Evidence needed: ${r.evidenceNeeded}`,
          "Passages:",
          hs.length ? hs.map((h, i) => `[P${i + 1}] ${h.title} › ${h.section}\n${h.text.slice(0, 700)}`).join("\n\n") : "(no passages found)",
        ].join("\n");
      })
      .join("\n\n---\n\n");
    const { object } = await retry(() => generateObject({
      schema: judgeSchema,
      name: "coverage",
      system,
      user,
      modelKey,
      solution: SOL,
      task: "map-evidence",
      maxTokens: 2600,
    }));
    const entries: Coverage[] = [];
    for (const r of batch) {
      const res = object.results.find((x) => x.id.replace(/\s+/g, "") === r.id);
      const hs = hits.get(r.id) ?? [];
      const aiStatus: CoverageStatus = res?.status ?? "missing";
      const used = (res?.passages ?? [])
        .map((p) => hs[Number(p.replace(/\D/g, "")) - 1])
        .filter(Boolean) as SearchHit[];
      const evidence = (used.length ? used : aiStatus === "missing" ? [] : hs.slice(0, 1)).map((h, i) => toRef(h, i === 0 ? res?.quote : undefined));
      const check = opts.computeChecks ? requirementCheck(seed, r.id, opts.certs, opts.forms) : null;
      entries.push({
        reqId: r.id,
        aiStatus,
        status: mergeStatus(aiStatus, check),
        confidence: Math.max(0, Math.min(1, res?.confidence ?? 0.5)),
        rationale: res?.rationale ?? "",
        gap: res?.gap ?? (check && check.status !== "ok" ? check.note : null),
        evidence,
        check,
        source: "ai",
        updatedAt: Date.now(),
      });
    }
    all.push(...entries);
    done++;
    s2.update(lang === "ar" ? `${done} من ${batches.length} دفعات` : `${done} of ${batches.length} batches`);
    opts.onBatch(entries);
  });
  const met = all.filter((c) => c.status === "met").length;
  s2.done(lang === "ar" ? `${met} مستوفى · ${all.filter((c) => c.status === "partial").length} جزئي · ${all.filter((c) => c.status === "missing").length} مفقود` : `${met} evidenced · ${all.filter((c) => c.status === "partial").length} partial · ${all.filter((c) => c.status === "missing").length} missing`);
  if (opts.computeChecks) {
    const s3 = emit.step("checks", lang === "ar" ? "تطبيق فحوص الامتثال المحسوبة" : "Applying computed compliance checks");
    const flagged = all.filter((c) => c.check && c.check.status !== "ok");
    s3.done(flagged.map((c) => `${c.reqId}: ${c.check!.status}`).join(" · ") || (lang === "ar" ? "لا توجد ملاحظات" : "no flags"));
  }
  return all;
}

/* ════════════════ 3. Section drafting ════════════════ */

export function gatherSources(requirements: Requirement[], extra: Array<{ docId: string; title: string; section: string; text: string }>): Citation[] {
  // Internal-only records (e.g. KPI extracts) inform the claim check but are never quoted in a client-facing response.
  const internal = new Set(listDocs(LIB).filter((d) => /internal/i.test(String(d.classification ?? ""))).map((d) => d.id));
  const seen = new Set<string>();
  const hits: SearchHit[] = [];
  for (const r of requirements) {
    for (const h of search(LIB, [r.title, r.text, r.evidenceNeeded], 5)) {
      const key = `${h.docId}|${h.section}`;
      if (seen.has(key) || internal.has(h.docId)) continue;
      seen.add(key);
      hits.push(h);
    }
  }
  hits.sort((a, b) => b.score - a.score);
  const top = hits.slice(0, Math.max(8, 14 - extra.length));
  const cites: Citation[] = top.map((h, i) => ({ n: i + 1, docId: h.docId, title: h.title, ref: h.ref, section: h.section, quote: h.text }));
  extra.forEach((e, i) => cites.push({ n: top.length + i + 1, docId: e.docId, title: e.title, section: e.section, quote: e.text }));
  return cites;
}

export async function* draftSection(
  ctx: Ctx,
  opts: {
    seed: BidSeed;
    sectionTitle: string;
    sectionNo: number;
    pageLimit: number;
    requirements: Requirement[];
    citations: Citation[];
    draftLang: Lang;
    previous?: string;
  },
): AsyncGenerator<string, string> {
  const { seed } = opts;
  const words = Math.min(650, Math.round(opts.pageLimit * 220));
  const gapMarker = opts.draftLang === "ar" ? "**[يلزم دليل — <ما هو ناقص> (<الرمز>)]**" : "**[Evidence needed — <what is missing> (<code>)]**";
  const system = [
    `You are the bid writer for ${seed.bidder.name} responding to MNDA tender ${seed.tender.ref} "${seed.tender.title.en}".`,
    `Write section ${opts.sectionNo} "${opts.sectionTitle}" of the technical proposal (page limit ${opts.pageLimit} pages).`,
    "Rules:",
    "- Use ONLY facts found in the numbered sources. Cite every factual sentence with its marker, e.g. [2] or [1][4], right after the claim.",
    "- Address each listed requirement explicitly and reference its code in brackets, e.g. (T-04).",
    `- Where the sources do not evidence a requirement element, do NOT invent it — write a separate line exactly like ${gapMarker}.`,
    "- Precise, confident, factual tender language. No superlatives, no '100%' or 'zero' claims unless a source states them, no certifications that are not in the sources.",
    `- About ${words} words. Short paragraphs; ### sub-headings and bullet lists where helpful. Do not repeat the section title.`,
    opts.draftLang === "ar"
      ? "- Write in formal Modern Standard Arabic (UAE tender register). Keep codes, standards, reference numbers and figures in Latin digits."
      : "- Write in British English.",
  ].join("\n");
  const sources = opts.citations.map((c) => `[${c.n}] ${c.title}${c.ref ? ` (${c.ref})` : ""} › ${c.section}\n${c.quote.slice(0, 900)}`).join("\n\n");
  const reqs = opts.requirements.map((r) => `- ${r.id} (${r.ref}): ${r.text}`).join("\n");
  const user = [`Requirements to address:\n${reqs}`, opts.previous ? `Previous version for reference (correct any unsupported statements):\n${opts.previous.slice(0, 2500)}` : "", `Sources:\n\n${sources}`]
    .filter(Boolean)
    .join("\n\n---\n\n");

  const gen = chatStream({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    modelKey: ctx.modelKey,
    temperature: 0.3,
    maxTokens: 1900,
    solution: SOL,
    task: "draft-section",
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

/* ════════════════ 4. Unsupported-claim check ════════════════ */

const claimSchema = z.object({
  claims: z.array(
    z.object({
      i: z.number(),
      verdict: z.enum(["supported", "partial", "unsupported", "contradicted"]),
      note: z.string(),
      suggestion: z.string().nullable(),
      source: z.string().nullable(),
    }),
  ),
});

export async function checkClaims(ctx: Ctx, opts: { text: string; extra: Array<{ docId: string; title: string; section: string; text: string }> }): Promise<Claim[]> {
  const { emit, lang, modelKey } = ctx;
  const sentences = claimSentences(opts.text);
  const s1 = emit.step("split", lang === "ar" ? "تقسيم المسودة إلى ادعاءات" : "Splitting the draft into claims");
  s1.done(lang === "ar" ? `${sentences.length} جملة قابلة للتحقق` : `${sentences.length} checkable sentences`);
  if (!sentences.length) return [];

  const s2 = emit.step("evidence", lang === "ar" ? "جلب الأدلة لكل ادعاء" : "Retrieving evidence for each claim");
  const seen = new Set<string>();
  const passages: Array<{ id: string; hit: { docId: string; title: string; ref?: string; section: string; text: string } }> = [];
  for (const s of sentences) {
    for (const h of search(LIB, s.bare, 2)) {
      const key = `${h.docId}|${h.section}`;
      if (seen.has(key)) continue;
      seen.add(key);
      passages.push({ id: `S${passages.length + 1}`, hit: h });
    }
  }
  for (const e of opts.extra) passages.push({ id: `S${passages.length + 1}`, hit: e });
  const used = passages.slice(0, 22);
  s2.done(lang === "ar" ? `${used.length} مقاطع أدلة` : `${used.length} evidence passages`);

  const s3 = emit.step("verify", lang === "ar" ? "التحقق من كل ادعاء مقابل الأدلة" : "Verifying each claim against evidence");
  const system = [
    "You are an independent bid quality reviewer at Raseen Facilities Management LLC. Check each numbered sentence of a draft tender response against the APPROVED evidence passages.",
    "Verdicts:",
    "- supported: every factual element (figures, certifications, names, dates, scope) is backed by a passage.",
    "- partial: the core is backed but a detail is not, or the wording overstates the evidence.",
    "- unsupported: no passage backs the factual claim.",
    "- contradicted: a passage states something different (another figure, a certification that is not held, a different record).",
    "Statements of intent or approach ('we will…', 'we propose…', 'our team is committed to…') are supported unless they assert a specific fact.",
    "For partial / unsupported / contradicted give `note` (why, quoting the passage facts briefly) and `suggestion`: a corrected replacement sentence, in the same language as the sentence, that states only what the evidence supports and is ready to publish. For supported, suggestion = null.",
    "`source`: the passage id you relied on (e.g. \"S3\") or null.",
    `Write notes in ${langName(lang)}. Return one entry per sentence index.`,
  ].join("\n");
  const user = [
    "Sentences:",
    sentences.map((s) => `(${s.i}) ${s.bare}`).join("\n"),
    "",
    "Evidence passages:",
    used.map((p) => `[${p.id}] ${p.hit.title} › ${p.hit.section}\n${p.hit.text.slice(0, 650)}`).join("\n\n"),
  ].join("\n");
  const { object } = await generateObject({ schema: claimSchema, name: "claim_check", system, user, modelKey, solution: SOL, task: "check-claims", maxTokens: 3000 });

  const claims: Claim[] = sentences.map((s) => {
    const r = object.claims.find((c) => c.i === s.i);
    const p = r?.source ? used.find((x) => x.id === r.source!.trim()) : undefined;
    return {
      i: s.i,
      text: s.bare,
      verdict: r?.verdict ?? "supported",
      note: r?.note ?? "",
      suggestion: r && r.verdict !== "supported" ? r.suggestion : null,
      source: p ? { docId: p.hit.docId, title: p.hit.title, ref: p.hit.ref, section: p.hit.section, quote: excerpt(p.hit.text, 300) } : null,
    };
  });
  const bad = claims.filter((c) => c.verdict === "unsupported" || c.verdict === "contradicted").length;
  const partial = claims.filter((c) => c.verdict === "partial").length;
  s3.done(lang === "ar" ? `${bad} غير مدعوم أو متعارض · ${partial} جزئي` : `${bad} unsupported or contradicted · ${partial} partial`);
  return claims;
}

/* ════════════════ 5. Gap → contributor tasks ════════════════ */

const taskSchema = z.object({
  tasks: z.array(z.object({ reqId: z.string(), owner: z.string(), ask: z.string(), evidenceType: z.string() })),
});

export async function planTasks(
  ctx: Ctx,
  opts: { gaps: Array<{ req: Requirement; cov: Coverage }>; team: TeamMember[]; seed: BidSeed },
): Promise<BidTask[]> {
  const { emit, lang, modelKey } = ctx;
  const s = emit.step("assign", lang === "ar" ? `إسناد ${opts.gaps.length} فجوة إلى المساهمين` : `Assigning ${opts.gaps.length} gaps to contributors`);
  const roster = opts.team.filter((t) => t.id !== "leena");
  const system = [
    `You are the bid coordinator for ${opts.seed.bidder.name} on tender ${opts.seed.tender.ref}. Turn each evidence gap into ONE contributor task.`,
    "Pick the owner strictly from the roster (exact name) based on expertise. Write `ask` as 2–3 precise sentences: what evidence or text is needed, the threshold it must meet, and the format (e.g. signed CV ≤ 2 pages, certificate copy, revised method statement paragraph).",
    "`evidenceType`: a short label such as CV, Certificate, Insurance, Method statement, Plan, Data, Signed form.",
    `Write ask and evidenceType in ${langName(lang)}.`,
  ].join("\n");
  const batches: Array<typeof opts.gaps> = [];
  for (let i = 0; i < opts.gaps.length; i += 12) batches.push(opts.gaps.slice(i, i + 12));
  const results = await pool(batches, 3, async (batch) => {
    const user = [
      "Roster:",
      roster.map((t) => `- ${t.name} — ${t.role}: ${t.expertise}`).join("\n"),
      "",
      "Gaps:",
      batch
        .map(({ req, cov }) => `- ${req.id} [${cov.status}${req.mandatory ? ", mandatory" : ""}] ${req.title}: ${req.text}\n  Gap: ${cov.gap ?? cov.rationale}${cov.check && cov.check.status !== "ok" ? `\n  Computed check: ${cov.check.note}` : ""}`)
        .join("\n"),
    ].join("\n");
    const r = await generateObject({ schema: taskSchema, name: "tasks", system, user, modelKey, solution: SOL, task: "plan-tasks", maxTokens: 2600 });
    return r.object.tasks;
  });
  const object = { tasks: results.flat() };

  const now = Date.now();
  const tasks: BidTask[] = [];
  for (const { req, cov } of opts.gaps) {
    const t = object.tasks.find((x) => x.reqId.replace(/\s+/g, "") === req.id);
    const member = roster.find((m) => m.name === t?.owner) ?? roster.find((m) => t?.owner && m.name.split(" ")[0] === t.owner.split(" ")[0]) ?? roster[0];
    const priority: BidTask["priority"] = req.mandatory || cov.check?.status === "critical" ? "critical" : cov.status === "missing" ? "high" : "normal";
    const due = addWorkingDays(DEMO_TODAY, priority === "critical" ? 2 : priority === "high" ? 3 : 4);
    tasks.push({
      id: `TSK-057-${req.id}-${now.toString(36).slice(-4).toUpperCase()}`,
      reqId: req.id,
      reqTitle: req.title,
      owner: member.name,
      ownerRole: member.role,
      ask: t?.ask ?? cov.gap ?? req.evidenceNeeded,
      evidenceType: t?.evidenceType ?? "Evidence",
      due,
      priority,
      status: "open",
      createdAt: now,
    });
  }
  s.done(lang === "ar" ? `${tasks.length} مهمة لـ ${new Set(tasks.map((t) => t.owner)).size} مساهمين` : `${tasks.length} tasks for ${new Set(tasks.map((t) => t.owner)).size} contributors`);
  return tasks;
}

/* ════════════════ 6. Contributor answer → re-judge ════════════════ */

const answerSchema = z.object({
  status: z.enum(["met", "partial", "missing"]),
  rationale: z.string(),
  gap: z.string().nullable(),
  quote: z.string(),
  confidence: z.number(),
  certificate: z.object({ number: z.string().nullable(), expiry: z.string().nullable() }).nullable(),
});

export async function judgeAnswer(
  ctx: Ctx,
  opts: { req: Requirement; prior: Coverage | undefined; answer: string; contributor: string; seed: BidSeed; certs: CertificateRecord[] },
) {
  const { emit, lang, modelKey } = ctx;
  const s = emit.step("rejudge", lang === "ar" ? `إعادة تقييم ${opts.req.id} بإجابة المساهم` : `Re-judging ${opts.req.id} with the contributor's answer`);
  const system = [
    "You are a bid compliance reviewer at Raseen Facilities Management LLC. A contributor has supplied new evidence for a tender requirement.",
    "Decide whether the requirement is now met / partial / missing, using the prior evidence and the new answer together. Apply every threshold strictly (years of experience, certifications, percentages, dates).",
    `Closing date ${fmt(opts.seed.tender.closing)}; bid validity ends ${fmt(validityEnd(opts.seed))}.`,
    "quote: one sentence copied verbatim from the contributor's answer that best evidences the requirement (\"\" if none).",
    "certificate: if the answer provides a renewed or new certificate / policy / guarantee for this requirement, return its number and expiry date (YYYY-MM-DD) exactly as stated; otherwise null.",
    `Write rationale and gap in ${langName(lang)}. gap = null when met.`,
  ].join("\n");
  const user = [
    `Requirement ${opts.req.id} (${opts.req.ref}): ${opts.req.text}`,
    `Evidence needed: ${opts.req.evidenceNeeded}`,
    opts.prior ? `Prior judgement: ${opts.prior.status} — ${opts.prior.rationale} Gap: ${opts.prior.gap ?? "none"}` : "Prior judgement: none",
    opts.prior?.evidence.length ? `Prior evidence: ${opts.prior.evidence.map((e) => `${e.title}: "${e.quote}"`).join(" | ")}` : "",
    opts.certs.filter((c) => c.requirement === opts.req.id).length
      ? `Certificates on record for this requirement: ${opts.certs
          .filter((c) => c.requirement === opts.req.id)
          .map((c) => `${c.name} ${c.number} expires ${c.expiry}`)
          .join("; ")}`
      : "",
    `New answer from ${opts.contributor}:\n${opts.answer}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const { object } = await generateObject({ schema: answerSchema, name: "answer_judgement", system, user, modelKey, solution: SOL, task: "judge-answer", maxTokens: 700 });
  s.done(`${opts.prior?.status ?? "—"} → ${object.status}`);
  return object;
}
