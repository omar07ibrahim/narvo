import "server-only";
import fs from "node:fs";
import { dataPath, readJson, readText } from "@/lib/world/data";
import { withOverlay } from "@/lib/store/db";
import { buildLog, compact, type CompactLog, type PLog } from "./mining";

export const SLUG = "03-process-intelligence";
export const CHANGES = `${SLUG}/changes`;
const DIR = "mnda/03-process-intelligence";

export interface CaseNote {
  id: string;
  caseId: string;
  date: string;
  author: string;
  theme: string;
  lang: "en" | "ar";
  text: string;
}

export interface ChangeRecord {
  id: string;
  title: string;
  titleAr?: string;
  interventions: string[];
  status: "approved" | "pilot" | "proposed" | "standard";
  approvedBy?: string;
  approvedAt?: string;
  memo?: string;
  expected?: Record<string, number | null>;
  measurement?: string;
  measurementAr?: string;
  createdAt?: string;
}

const g = globalThis as unknown as { __narvo03?: { key: number; log: PLog; compact: CompactLog } };

export function loadLog(): { log: PLog; compact: CompactLog } {
  const p = dataPath(`${DIR}/events.csv`);
  const key = fs.statSync(p).mtimeMs;
  if (g.__narvo03?.key === key) return g.__narvo03;
  const r = buildLog(readText(`${DIR}/events.csv`), "MNDA building permits — Jun to Oct 2026", "mnda");
  if ("error" in r) throw new Error(r.error);
  g.__narvo03 = { key, log: r.log, compact: compact(r.log) };
  return g.__narvo03;
}

export function loadNotes(): CaseNote[] {
  return readJson<CaseNote[]>(`${DIR}/case-notes.json`);
}

export function loadChanges(): ChangeRecord[] {
  return withOverlay<ChangeRecord>(CHANGES, readJson<ChangeRecord[]>(`${DIR}/changes.json`));
}

/** Data end of the extract (Fri 9 Oct 2026 23:59 GST) in minutes since epoch */
export const DATA_END = Date.parse("2026-10-09T23:59:00+04:00") / 60000;
