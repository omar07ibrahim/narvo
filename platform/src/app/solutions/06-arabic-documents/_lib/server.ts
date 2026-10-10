import "server-only";
import fs from "node:fs";
import { parseFrontMatter } from "@/lib/retrieval";
import { dataPath, readJsonSafe } from "@/lib/world/data";
import { kvGet, kvSet, withOverlay } from "@/lib/store/db";
import type { QueueDoc, RunResult, Term } from "./shared";

export const SOLUTION = "06-arabic-documents";
export const DOCS = `${SOLUTION}/documents`;
export const GLOSSARY = `${SOLUTION}/glossary`;

export function loadQueue(): QueueDoc[] {
  const seed = readJsonSafe<QueueDoc[]>(`mnda/${SOLUTION}/documents.json`, []);
  return withOverlay(DOCS, seed);
}

export function getQueueDoc(id: string) {
  return loadQueue().find((d) => d.id === id);
}

/** Source text of a queued document (seed file, corpus file, or user-supplied text). */
export function sourceText(doc: QueueDoc): string {
  if (doc.text) return doc.text;
  if (!doc.file) return "";
  try {
    const raw = fs.readFileSync(dataPath(`mnda/${doc.file}`), "utf8");
    return parseFrontMatter(raw).body.trim();
  } catch {
    return "";
  }
}

export function loadGlossary(): Term[] {
  const seed = readJsonSafe<Term[]>(`mnda/${SOLUTION}/glossary.json`, []);
  return withOverlay(GLOSSARY, seed).sort((a, b) => a.id.localeCompare(b.id));
}

export function getRun(docId: string) {
  return kvGet<RunResult>(`${SOLUTION}:run:${docId}`);
}

export function saveRun(r: RunResult) {
  kvSet(`${SOLUTION}:run:${r.docId}`, { ...r, updatedAt: new Date().toISOString() });
}

export function runSummaries() {
  const out: Record<string, RunResult["metrics"] & { accepted: number; total: number; createdAt: string }> = {};
  for (const d of loadQueue()) {
    const r = getRun(d.id);
    if (!r) continue;
    const trans = r.segments.filter((s) => s.kind !== "table-sep");
    out[d.id] = { ...r.metrics, accepted: trans.filter((s) => s.status !== "pending").length, total: trans.length, createdAt: r.createdAt };
  }
  return out;
}
