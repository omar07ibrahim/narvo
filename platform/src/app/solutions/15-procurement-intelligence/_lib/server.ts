import "server-only";
import { readCsv, readJson, readText } from "@/lib/world/data";
import { parseFrontMatter } from "@/lib/retrieval";
import { kvGet, kvSet, listApprovals, withOverlay } from "@/lib/store/db";
import type { ClarDraft, Clarification, Override, PriceSchedule, ProcState, Rfq, Supplier, SupplierEval, Tender, TenderRecord } from "./types";

export const SOL = "15-procurement-intelligence";
export const DIR = "mnda/15-procurement-intelligence";
export const CORPUS = { bids: "mnda/15-procurement-intelligence/submissions", all: "mnda/15-procurement-intelligence", manual: "mnda/knowledge/procurement" };
const K = { evals: `${SOL}:evaluations`, overrides: `${SOL}:overrides`, drafts: `${SOL}:drafts`, report: `${SOL}:report` };
export const COL = { suppliers: `${SOL}/suppliers`, clar: `${SOL}/clarifications`, tender: `${SOL}/tenders`, rfqs: `${SOL}/rfqs`, awards: `${SOL}/awards` };

export function loadTender(): Tender {
  return readJson<Tender>(`${DIR}/tender-041.json`);
}

export function getSuppliers(): Supplier[] {
  return withOverlay<Supplier>(COL.suppliers, readJson<Supplier[]>(`${DIR}/suppliers.json`));
}

export function loadPrices(suppliers = getSuppliers()): PriceSchedule[] {
  return suppliers.map((s) => {
    const rows = readCsv(`${DIR}/${s.submission.price}`);
    const lines = rows.map((r) => ({
      item: r.item,
      description: r.description,
      category: r.category,
      scope_key: r.scope_key,
      year1: Number(r.year1),
      year2: Number(r.year2),
      year3: Number(r.year3),
      total: Number(r.total),
      note: r.note,
    }));
    return { supplierId: s.id, lines, total: lines.reduce((a, l) => a + l.total, 0) };
  });
}

export function loadSubmission(s: Supplier): { meta: Record<string, string>; body: string } {
  return parseFrontMatter(readText(`${DIR}/submissions/${s.submission.file}`));
}

export function loadResponses(): Array<{ supplierId: string; id: string; title: string; date: string; body: string }> {
  const map: Record<string, string> = { "SUP-00562": "al-bahar-response.md", "SUP-00417": "raseen-fm-response.md" };
  return Object.entries(map).flatMap(([supplierId, file]) => {
    try {
      const { meta, body } = parseFrontMatter(readText(`${DIR}/clarification-responses/${file}`));
      return [{ supplierId, id: meta.id, title: meta.title, date: meta.date, body }];
    } catch {
      return [];
    }
  });
}

export function getEvals(): Record<string, SupplierEval> {
  return kvGet<Record<string, SupplierEval>>(K.evals) ?? {};
}
export function putEval(ev: SupplierEval) {
  const cur = getEvals();
  cur[ev.supplierId] = ev;
  kvSet(K.evals, cur);
}

export function getOverrides(): Record<string, Record<string, Override>> {
  return kvGet<Record<string, Record<string, Override>>>(K.overrides) ?? {};
}
export function setOverride(supplierId: string, criterionId: string, o: Override | null) {
  const cur = getOverrides();
  cur[supplierId] ??= {};
  if (o) cur[supplierId][criterionId] = o;
  else delete cur[supplierId][criterionId];
  kvSet(K.overrides, cur);
}

export function getDrafts(): Record<string, ClarDraft> {
  return kvGet<Record<string, ClarDraft>>(K.drafts) ?? {};
}
export function putDraft(d: ClarDraft) {
  const cur = getDrafts();
  cur[d.supplierId] = d;
  kvSet(K.drafts, cur);
}

export function getReport() {
  return kvGet<ProcState["report"]>(K.report) ?? null;
}
export function setReport(r: NonNullable<ProcState["report"]>) {
  kvSet(K.report, r);
}

export function getClarifications(): Clarification[] {
  return withOverlay<Clarification>(COL.clar, []);
}
export function getTenderRecord(t = loadTender()): TenderRecord {
  return withOverlay<TenderRecord>(COL.tender, [{ id: t.id, status: "technical_evaluation" }])[0];
}
export function getRfqs(): Rfq[] {
  return withOverlay<Rfq>(COL.rfqs, []);
}

/** Clarification references are fixed per bidder so letters stay traceable. */
export function clarRef(supplierId: string) {
  const order = ["SUP-00417", "SUP-00562", "SUP-00238"];
  return `MNDA/PRC/2026/041/CLR-${String(order.indexOf(supplierId) + 1).padStart(2, "0")}`;
}

export function loadState(): ProcState {
  return {
    evaluations: getEvals(),
    overrides: getOverrides(),
    drafts: getDrafts(),
    clarifications: getClarifications(),
    report: getReport(),
    tender: getTenderRecord(),
    suppliers: getSuppliers(),
    rfqs: getRfqs(),
    approvals: listApprovals({ solution: SOL }).map((a) => ({
      id: a.id,
      title: a.title,
      summary: a.summary,
      solution: a.solution,
      actionLabel: a.actionLabel,
      approver: a.approver,
      status: a.status,
      createdAt: a.createdAt,
    })),
  };
}

export async function pool<T, R>(items: T[], n: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

/** Return the sentence in `text` that best matches the model's quote (so evidence is always real text). */
export function groundQuote(quote: string, text: string): string | null {
  if (!quote?.trim()) return null;
  const norm = (s: string) => s.toLowerCase().replace(/[*_`#>|]/g, "").replace(/\s+/g, " ").trim();
  const q = norm(quote);
  const plain = norm(text);
  if (q.length >= 12 && plain.includes(q)) return quote.replace(/\*\*/g, "").trim();
  const sentences = text
    .replace(/\|/g, " ")
    .split(/(?<=[.!?؟])\s+|\n+/)
    .map((s) => s.replace(/\*\*/g, "").replace(/^[#\s>*-]+/, "").trim())
    .filter((s) => s.length > 20);
  const qTokens = new Set(q.split(/[^\p{L}\p{N}%]+/u).filter((t) => t.length > 2));
  let best: string | null = null;
  let bestScore = 0;
  for (const s of sentences) {
    const tokens = norm(s).split(/[^\p{L}\p{N}%]+/u).filter((t) => t.length > 2);
    const hit = tokens.filter((t) => qTokens.has(t)).length;
    const score = hit / Math.max(qTokens.size, 1);
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return bestScore >= 0.35 ? (best!.length > 320 ? best!.slice(0, 320) + "…" : best) : null;
}

/** Find the heading text for a section number like "9.3" in a markdown document. */
export function sectionTitle(body: string, sec: string): string {
  const clean = sec.replace(/^§\s*/, "").trim();
  const m = body.match(new RegExp(`^#{2,3}\\s+${clean.replace(/\./g, "\\.")}[\\s.]+(.+)$`, "m"));
  return m ? `${clean} ${m[1].trim()}` : clean;
}

/** Retry a model call once (transient provider errors / truncated JSON). */
export async function retry<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if ((e as Error).name === "AbortError") throw e;
    }
  }
  throw last;
}
