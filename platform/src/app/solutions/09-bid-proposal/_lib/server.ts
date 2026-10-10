import "server-only";
import { readJson, readText } from "@/lib/world/data";
import { parseFrontMatter, listDocs } from "@/lib/retrieval";
import { kvGet, kvSet, withOverlay, listApprovals } from "@/lib/store/db";
import type {
  BidRecord,
  BidSeed,
  BidState,
  BidTask,
  ByoState,
  CertificateRecord,
  Coverage,
  FormRecord,
  LibraryDoc,
  Requirement,
  SectionState,
} from "./types";

export const SOL = "09-bid-proposal";
export const LIB = "raseen/knowledge/bid-library";
const K = {
  reqs: `${SOL}:requirements`,
  cov: `${SOL}:coverage`,
  sections: `${SOL}:sections`,
  byo: `${SOL}:byo`,
};
export const COL = { tasks: `${SOL}/tasks`, forms: `${SOL}/forms`, bids: `${SOL}/bids`, certs: `${SOL}/certificates` };

export function loadSeed(): BidSeed {
  return readJson<BidSeed>("raseen/09-bid-proposal/bid.json");
}

export function loadRfp(): { meta: Record<string, string>; body: string } {
  try {
    return parseFrontMatter(readText("raseen/09-bid-proposal/rfp-057.md"));
  } catch {
    return { meta: {}, body: "" };
  }
}

export function libraryDocs(): LibraryDoc[] {
  return listDocs(LIB).map((d) => ({ id: d.id, title: d.title, title_ar: d.title_ar, type: d.type, ref: d.ref, date: d.date }));
}

export function getRequirements(): { at: number; items: Requirement[] } | null {
  return kvGet<{ at: number; items: Requirement[] }>(K.reqs) ?? null;
}
export function setRequirements(items: Requirement[]) {
  const v = { at: Date.now(), items };
  kvSet(K.reqs, v);
  return v;
}

export function getCoverage(): Record<string, Coverage> {
  return kvGet<Record<string, Coverage>>(K.cov) ?? {};
}
export function putCoverage(entries: Coverage[], replace = false) {
  const cur = replace ? {} : getCoverage();
  for (const e of entries) cur[e.reqId] = e;
  kvSet(K.cov, cur);
  return cur;
}

export function getSections(seed = loadSeed()): Record<string, SectionState> {
  const saved = kvGet<Record<string, SectionState>>(K.sections);
  if (saved) return saved;
  const init: Record<string, SectionState> = {};
  for (const [id, d] of Object.entries(seed.seedDrafts)) {
    init[id] = { versions: [{ v: 1, label: d.label, author: d.author, kind: "human", at: d.at, text: d.text, lang: d.lang }] };
  }
  return init;
}
export function saveSections(s: Record<string, SectionState>) {
  kvSet(K.sections, s);
}

export function getTasks(): BidTask[] {
  return withOverlay<BidTask>(COL.tasks, []);
}
export function getForms(seed = loadSeed()): FormRecord[] {
  return withOverlay<FormRecord>(COL.forms, seed.forms);
}
export function getCertificates(seed = loadSeed()): CertificateRecord[] {
  return withOverlay<CertificateRecord>(COL.certs, seed.certificates);
}
export function getBid(seed = loadSeed()): BidRecord {
  return withOverlay<BidRecord>(COL.bids, [{ id: seed.id, status: "in_preparation" }])[0];
}

export function getByo(): ByoState | null {
  return kvGet<ByoState>(K.byo) ?? null;
}
export function setByo(v: ByoState) {
  kvSet(K.byo, v);
}

export function loadState(): BidState {
  const seed = loadSeed();
  return {
    requirements: getRequirements(),
    coverage: getCoverage(),
    sections: getSections(seed),
    tasks: getTasks(),
    forms: getForms(seed),
    certificates: getCertificates(seed),
    bid: getBid(seed),
    byo: getByo(),
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

/** Run async work with bounded concurrency. */
export async function pool<T, R>(items: T[], n: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Does `quote` actually appear in `text`? (whitespace/case/punctuation tolerant) */
export function verifyQuote(quote: string, text: string) {
  const norm = (s: string) => s.toLowerCase().replace(/[*_`#>|]/g, "").replace(/\s+/g, " ").trim();
  const q = norm(quote);
  if (q.length < 8) return false;
  const t = norm(text);
  if (t.includes(q)) return true;
  return t.includes(q.slice(0, Math.min(60, q.length)));
}

export function excerpt(text: string, n = 240) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n).replace(/\s\S*$/, "") + "…" : t;
}
