import "server-only";
import { z } from "zod";
import { generateObject } from "@/lib/ai/json";
import { normForMatch, quoteFound, type GuardedText } from "./fairness";
import type { Criterion, CriterionRating, Requisition } from "./types";
import { SLUG } from "./data";

const evalSchema = z.object({
  ratings: z.array(
    z.object({
      criterionId: z.string(),
      rating: z.number().int().min(0).max(4),
      evidence: z.string().describe("Verbatim quote (max 35 words) copied exactly from the CV text, or empty string"),
      gaps: z.string().describe("One sentence: what is missing, unclear or unproven for this criterion"),
      confidence: z.number().min(0).max(1),
    }),
  ),
  summary: z.string().describe("Two sentences on overall fit, job-related only"),
  strengths: z.array(z.string()).max(3),
  risks: z.array(z.string()).max(3),
  interviewFocus: z.array(z.string()).max(3).describe("Questions to verify at interview"),
});

export const SCALE = [
  "0 — no evidence in the CV",
  "1 — limited or indirect evidence (mentioned, no specifics)",
  "2 — partial: relevant but limited depth, scale, recency or role",
  "3 — strong: direct, recent, substantive evidence with specifics",
  "4 — exceptional: direct, recent, leading role with measurable outcomes",
].join("\n");

export function criteriaBlock(criteria: Criterion[]) {
  return criteria
    .map((c) => `- ${c.id} · ${c.label} (weight ${c.weight}%)${c.description ? `\n  What it means: ${c.description}` : ""}${c.evidence ? `\n  Strong evidence: ${c.evidence}` : ""}`)
    .join("\n");
}

export interface EvalOutput {
  ratings: CriterionRating[];
  summary: string;
  strengths: string[];
  risks: string[];
  interviewFocus: string[];
  ms: number;
  model: string;
}

/**
 * Job-related evaluation of ONE redacted CV. The parameter type `GuardedText` can only be produced by the
 * fairness guard, so protected attributes never reach the prompt.
 */
export async function evaluateGuardedCv(opts: {
  cv: GuardedText;
  requisition: Requisition;
  criteria: Criterion[];
  lang: "en" | "ar";
  modelKey?: string | null;
  signal?: AbortSignal;
}): Promise<EvalOutput> {
  const { cv, requisition, criteria, lang } = opts;
  const r = await generateObject({
    schema: evalSchema,
    name: "cv_evaluation",
    system: [
      `You support the Human Capital department of the Marsa Al Noor Development Authority (MNDA, UAE government) with structured, job-related screening for requisition ${requisition.id} "${requisition.title}" in the ${requisition.department} department. The role exists to cut building-permit cycle time (median 21.6 days vs 15-day target) and coordinate master-developer NOCs in gated communities (Circular 14/2026).`,
      "You PREPARE evidence for HR; you never decide. Assess the CV ONLY against the job-related criteria below.",
      "The CV has been redacted of protected attributes. Never infer, guess or consider name, nationality, gender, age, marital status, religion, photo or place of birth — not even from writing style, language or institutions.",
      `Rating scale:\n${SCALE}`,
      "Rules: rate only what the text evidences; reward specifics (scale, numbers, codes applied, outcomes, roles) not adjectives; years alone are not quality; consultant-side submission work counts partially for authority review criteria. The evidence field MUST be copied verbatim from the CV (same language as the CV), max 35 words — never paraphrase; use an empty string when there is no evidence (rating 0).",
      `Return one rating per criterion id: ${criteria.map((c) => c.id).join(", ")}. Write summary, gaps, strengths, risks and interview questions in ${lang === "ar" ? "Arabic (formal MSA)" : "English"}.`,
    ].join("\n\n"),
    user: `CRITERIA\n${criteriaBlock(criteria)}\n\nREDACTED CV\n"""\n${cv}\n"""`,
    modelKey: opts.modelKey,
    solution: SLUG,
    task: "evaluate-cv",
    maxTokens: 1800,
    signal: opts.signal,
  });
  const o = r.object;
  const ratings: CriterionRating[] = criteria.map((c) => {
    const x = o.ratings.find((y) => y.criterionId.trim().toUpperCase() === c.id.toUpperCase());
    let evidence = (x?.evidence ?? "").trim().replace(/^["“«]|["”»]$/g, "");
    let found = evidence ? quoteFound(evidence, cv) : false;
    if (evidence && !found) {
      // Anchor a loosely-copied quote to the exact CV line it came from (never invent one).
      const anchored = anchorEvidence(evidence, cv);
      if (anchored) {
        evidence = anchored;
        found = true;
      }
    }
    return {
      criterionId: c.id,
      rating: x ? Math.max(0, Math.min(4, Math.round(x.rating))) : 0,
      evidence,
      evidenceFound: found,
      gaps: x?.gaps ?? (lang === "ar" ? "لم يُقيَّم" : "Not assessed"),
      confidence: x?.confidence,
    };
  });
  return {
    ratings,
    summary: o.summary,
    strengths: o.strengths,
    risks: o.risks,
    interviewFocus: o.interviewFocus,
    ms: r.ms,
    model: r.model,
  };
}

const tokens = (s: string) => new Set(normForMatch(s).split(" ").filter((w) => w.length > 2));

/** Find the CV line/sentence that best matches a model quote (≥ 60% token overlap), else null. */
export function anchorEvidence(quote: string, source: string): string | null {
  const q = tokens(quote);
  if (q.size < 4) return null;
  const units = source
    .split(/\n+|(?<=[.;؛])\s+/)
    .map((u) => u.replace(/^\s*[-*•#]+\s*/, "").replace(/\*\*/g, "").trim())
    .filter((u) => u.length > 20);
  let best: { u: string; s: number } | null = null;
  for (const u of units) {
    const t = tokens(u);
    let hit = 0;
    for (const w of q) if (t.has(w)) hit++;
    const s = hit / q.size;
    if (!best || s > best.s) best = { u, s };
  }
  if (!best || best.s < 0.6) return null;
  const words = best.u.split(/\s+/);
  return words.length > 40 ? words.slice(0, 40).join(" ") + " …" : best.u;
}

/** Evidence traceability: share of positive ratings whose quote exists verbatim in the redacted CV. */
export function traceability(ratings: CriterionRating[]) {
  const claims = ratings.filter((r) => r.rating > 0);
  if (!claims.length) return 1;
  return claims.filter((r) => r.evidenceFound).length / claims.length;
}

/** Simple bounded-concurrency map. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}
