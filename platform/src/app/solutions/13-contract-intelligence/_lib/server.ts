import "server-only";
import { readJson, readText } from "@/lib/world/data";
import { parseFrontMatter } from "@/lib/retrieval";
import { kvGet, kvSet, listApprovals, withOverlay } from "@/lib/store/db";
import type { Contract, ContractState, Extraction, KpiFile, Obligation, Playbook, RenewalBrief, Review } from "./types";

export const SOL = "13-contract-intelligence";
export const DIR = "mnda/13-contract-intelligence";
export const CORPUS = { contracts: `${DIR}/contracts`, drafts: `${DIR}/drafts`, evidence: `${DIR}/evidence` };
const K = { reviews: `${SOL}:reviews`, extractions: `${SOL}:extractions`, renewal: `${SOL}:renewal`, byo: `${SOL}:byo` };
export const COL = { contracts: `${SOL}/contracts`, obligations: `${SOL}/obligations`, letters: `${SOL}/letters` };

export function getContracts(): Contract[] {
  return withOverlay<Contract>(COL.contracts, readJson<Contract[]>(`${DIR}/contracts.json`));
}
export function getObligations(): Obligation[] {
  return withOverlay<Obligation>(
    COL.obligations,
    readJson<Obligation[]>(`${DIR}/obligations.json`).map((o) => ({ ...o, source: "seed" as const })),
  );
}
export function loadPlaybook(): Playbook {
  return readJson<Playbook>(`${DIR}/playbook.json`);
}
export function loadKpi(): KpiFile {
  return readJson<KpiFile>(`${DIR}/kpi-019-2026.json`);
}

/** Contract text: from the register file, or a bring-your-own text stored for this session. */
export function contractText(id: string): { name: string; body: string; contract: Contract | null } | null {
  const c = getContracts().find((x) => x.id === id) ?? null;
  if (c?.file) {
    try {
      const { body } = parseFrontMatter(readText(`${DIR}/${c.file}`));
      return { name: `${c.ref} — ${c.title.en}`, body, contract: c };
    } catch {
      return null;
    }
  }
  const byo = getByo()[id];
  return byo ? { name: byo.name, body: byo.text, contract: null } : null;
}

export function getByo(): Record<string, { name: string; text: string; at: number }> {
  return kvGet<Record<string, { name: string; text: string; at: number }>>(K.byo) ?? {};
}
export function putByo(id: string, v: { name: string; text: string; at: number }) {
  const cur = getByo();
  cur[id] = v;
  kvSet(K.byo, cur);
}

export function getReviews(): Record<string, Review> {
  return kvGet<Record<string, Review>>(K.reviews) ?? {};
}
export function putReview(r: Review) {
  const cur = getReviews();
  cur[r.contractId] = r;
  kvSet(K.reviews, cur);
}
export function getExtractions(): Record<string, Extraction> {
  return kvGet<Record<string, Extraction>>(K.extractions) ?? {};
}
export function putExtraction(e: Extraction) {
  const cur = getExtractions();
  cur[e.contractId] = e;
  kvSet(K.extractions, cur);
}
export function getRenewal(): RenewalBrief | null {
  return kvGet<RenewalBrief>(K.renewal) ?? null;
}
export function setRenewal(r: RenewalBrief) {
  kvSet(K.renewal, r);
}

export function loadState(): ContractState {
  return {
    contracts: getContracts(),
    obligations: getObligations(),
    reviews: getReviews(),
    extractions: getExtractions(),
    renewal: getRenewal(),
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

/** Return the sentence in `text` that best matches the model's quote (evidence is always real contract text). */
export function groundQuote(quote: string | null | undefined, text: string): string | null {
  if (!quote?.trim()) return null;
  const norm = (s: string) => s.toLowerCase().replace(/[*_`#>|]/g, "").replace(/\s+/g, " ").trim();
  const q = norm(quote);
  if (q.length >= 12 && norm(text).includes(q)) return quote.replace(/\*\*/g, "").trim();
  const sentences = text
    .replace(/\|/g, " ")
    .split(/(?<=[.;!?؟])\s+|\n+/)
    .map((s) => s.replace(/\*\*/g, "").replace(/^[#\s>*-]+/, "").trim())
    .filter((s) => s.length > 20);
  const qTokens = new Set(q.split(/[^\p{L}\p{N}%]+/u).filter((x) => x.length > 2));
  let best: string | null = null;
  let score = 0;
  for (const s of sentences) {
    const tokens = norm(s).split(/[^\p{L}\p{N}%]+/u).filter((x) => x.length > 2);
    const sc = tokens.filter((x) => qTokens.has(x)).length / Math.max(qTokens.size, 1);
    if (sc > score) {
      score = sc;
      best = s;
    }
  }
  return score >= 0.4 && best ? (best.length > 360 ? best.slice(0, 360) + "…" : best) : null;
}

/** The heading (clause) that contains a given passage — computed, so every flag links to its source clause. */
export function clauseOf(body: string, quote: string | null, fallbackRef: string): { ref: string; title: string } {
  const headings = Array.from(body.matchAll(/^(#{2,3})\s+(.+)$/gm)).map((m) => ({ at: m.index ?? 0, text: m[2].trim() }));
  const normalise = (s: string) => {
    let plain = "";
    const map: number[] = [];
    let space = false;
    for (let i = 0; i < s.length; i++) {
      let ch = s[i];
      if (ch === "*" || ch === "_" || ch === "`") continue;
      if (/\s/.test(ch)) {
        if (space) continue;
        ch = " ";
        space = true;
      } else space = false;
      plain += ch.toLowerCase();
      map.push(i);
    }
    return { plain, map };
  };
  if (quote) {
    const b = normalise(body);
    const q = normalise(quote).plain.trim().slice(0, 50);
    const pos = q.length > 10 ? b.plain.indexOf(q) : -1;
    if (pos !== -1) {
      const original = b.map[pos];
      const h = [...headings].reverse().find((x) => x.at <= original);
      if (h) {
        const m = h.text.match(/^(?:Clause\s+)?(\d+(?:\.\d+)*|S\d\.\d+|Schedule \d+)\s*[—–.-]?\s*(.*)$/i);
        return { ref: m ? m[1] : fallbackRef, title: h.text };
      }
    }
  }
  const byRef = headings.find((x) => new RegExp(`^(Clause\\s+)?${fallbackRef.replace(/\./g, "\\.")}(\\s|$|[—–.])`, "i").test(x.text));
  return { ref: fallbackRef, title: byRef?.text ?? fallbackRef };
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
