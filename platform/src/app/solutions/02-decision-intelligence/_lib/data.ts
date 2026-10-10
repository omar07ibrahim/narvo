import "server-only";
import fs from "node:fs";
import { dataPath, listFiles, readCsv, readJson, readText } from "@/lib/world/data";
import { withOverlay } from "@/lib/store/db";
import type { ActionItem, Dataset, PermitFact } from "./engine";

/** Server-side loaders for solution 02 (seed data in data/mnda/02-decision-intelligence). */

export const SLUG = "02-decision-intelligence";
export const ACTIONS = `${SLUG}/actions`;
const DIR = "mnda/02-decision-intelligence";

const g = globalThis as unknown as { __narvo02?: { key: string; ds: Dataset } };

function mtimeKey(...rel: string[]) {
  return rel.map((r) => {
    try {
      return fs.statSync(dataPath(r)).mtimeMs;
    } catch {
      return 0;
    }
  }).join("|");
}

export function loadDataset(): Dataset {
  const key = mtimeKey(`${DIR}/daily.csv`, `${DIR}/permits.csv`);
  if (g.__narvo02?.key === key) return g.__narvo02.ds;
  const rows = readCsv(`${DIR}/daily.csv`);
  const days = rows.map((r) => r.date);
  const cols: Record<string, number[]> = {};
  for (const col of Object.keys(rows[0])) if (col !== "date") cols[col] = rows.map((r) => Number(r[col]) || 0);
  const permits: PermitFact[] = readCsv(`${DIR}/permits.csv`).map((p) => ({
    s: p.submitted.slice(0, 10),
    i: p.issued ? p.issued.slice(0, 10) : null,
    c: p.cycle_days ? Number(p.cycle_days) : null,
    r: p.returned === "1" ? 1 : 0,
    n: p.noc_days ? Number(p.noc_days) : null,
  }));
  g.__narvo02 = { key, ds: { days, cols, permits } };
  return g.__narvo02.ds;
}

export interface DeptUpdate {
  id: string;
  dept: string;
  week: string;
  author: string;
  role: string;
  date: string;
  lang: "en" | "ar";
  title: string;
  body: string;
}

function parseFrontmatter(text: string): { meta: Record<string, string>; body: string } {
  const m = text.replace(/\r/g, "").match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: text };
  const meta: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: m[2].trim() };
}

export function loadUpdates(): DeptUpdate[] {
  return listFiles(`${DIR}/updates`, ".md")
    .map((f) => {
      const { meta, body } = parseFrontmatter(readText(`${DIR}/updates/${f}`));
      return {
        id: meta.id,
        dept: meta.dept,
        week: meta.week,
        author: meta.author,
        role: meta.role,
        date: meta.date,
        lang: (meta.lang === "ar" ? "ar" : "en") as "en" | "ar",
        title: meta.title,
        body,
      };
    })
    .sort((a, b) => (a.week === b.week ? a.dept.localeCompare(b.dept) : b.week.localeCompare(a.week)));
}

export function loadMinutes(): { id: string; title: string; date: string; body: string } {
  const { meta, body } = parseFrontmatter(readText(`${DIR}/minutes/review-w39.md`));
  return { id: meta.id, title: meta.title, date: meta.date, body };
}

export function loadActions(): ActionItem[] {
  const seed = readJson<ActionItem[]>(`${DIR}/actions.json`).map((a) => ({ ...a, source: "seed" as const }));
  return withOverlay<ActionItem>(ACTIONS, seed).sort((a, b) => b.id.localeCompare(a.id));
}

/** Compact dataset for the browser (instant filtering/charts on the client). */
export function loadAll() {
  return {
    dataset: loadDataset(),
    updates: loadUpdates(),
    actions: loadActions(),
    minutes: loadMinutes(),
  };
}

export type InitialData = ReturnType<typeof loadAll>;
