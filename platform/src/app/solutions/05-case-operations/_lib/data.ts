import "server-only";
import { readJson } from "@/lib/world/data";
import { withOverlay, kvGet } from "@/lib/store/db";
import type { HousingCase, CaseMessage, CaseReview } from "./types";

export const SLUG = "05-case-operations";
export const COL_CASES = `${SLUG}/cases`;
export const COL_MESSAGES = `${SLUG}/messages`;

/** Clarification dates for cases that were already incomplete before the demo window. */
const SEED_CLARIFICATIONS: Record<string, string> = {
  "MNDA-HG-2026-004817": "2026-09-24T10:12:00+04:00",
  "MNDA-HG-2026-005011": "2026-09-30T13:40:00+04:00",
  "MNDA-HG-2026-004733": "2026-09-16T09:05:00+04:00",
  "MNDA-HG-2026-004871": "2026-09-22T11:26:00+04:00",
  "MNDA-HG-2026-004987": "2026-09-28T14:18:00+04:00",
};

export function loadCases(): HousingCase[] {
  const seed = readJson<HousingCase[]>(`mnda/${SLUG}/cases.json`).map((c) => ({
    ...c,
    clarificationSentAt: c.clarificationSentAt ?? SEED_CLARIFICATIONS[c.id],
  }));
  return withOverlay(COL_CASES, seed).map((c) => ({
    ...c,
    lastReview: kvGet<CaseReview>(`${SLUG}:review:${c.id}`) ? { at: kvGet<CaseReview>(`${SLUG}:review:${c.id}`)!.at } : undefined,
  }));
}

export function getCase(id: string): HousingCase | undefined {
  return loadCases().find((c) => c.id === id);
}

export function loadMessages(caseId?: string): CaseMessage[] {
  return withOverlay<CaseMessage>(COL_MESSAGES, []).filter((m) => !caseId || m.caseId === caseId);
}

export function getReview(caseId: string) {
  return kvGet<CaseReview>(`${SLUG}:review:${caseId}`);
}

interface RegistryRecord {
  residentialProperties: Array<{ titleDeed: string; plot: string; type: string; registered: string; share: string }>;
  plotsAllocated: string[];
}

export function landRegistryLookup(emiratesId: string): RegistryRecord {
  const db = readJson<{ records: Record<string, RegistryRecord> }>(`mnda/${SLUG}/land-registry.json`);
  return db.records[emiratesId] ?? { residentialProperties: [], plotsAllocated: [] };
}
