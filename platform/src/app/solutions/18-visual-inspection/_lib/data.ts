import "server-only";
import { readJson, readJsonSafe } from "@/lib/world/data";
import { withOverlay } from "@/lib/store/db";
import type { Contractor, CorrectiveTask, Finding, Inspection, InspectionState, Notice, Person, Taxonomy } from "./types";

export const SLUG = "18-visual-inspection";
export const COL = {
  inspections: `${SLUG}/inspections`,
  findings: `${SLUG}/findings`,
  tasks: `${SLUG}/tasks`,
  notices: `${SLUG}/notices`,
};
const DIR = "mnda/18-visual-inspection";
export const CORPUS = "mnda/knowledge/inspection";
export const DIRECTOR = { name: "Eng. Hamad Juma Al Kaabi", title: "Director, Field Operations & Inspection" };

export function loadTaxonomy(): Taxonomy {
  return readJson<Taxonomy>(`${DIR}/taxonomy.json`);
}

export function loadRegistry(): { contractors: Contractor[]; inspectors: Person[]; consultants: string[]; consultants_ar?: string[] } {
  return readJson(`${DIR}/registry.json`);
}

/** English → Arabic display names for people and companies shown in the UI. */
export function loadNameMap(): Record<string, string> {
  const r = loadRegistry();
  const map: Record<string, string> = { [DIRECTOR.name]: "م. حمد جمعة الكعبي" };
  for (const c of r.contractors) map[c.name] = c.name_ar;
  for (const p of r.inspectors) map[p.name] = p.name_ar;
  r.consultants.forEach((c, i) => {
    if (r.consultants_ar?.[i]) map[c] = r.consultants_ar[i];
  });
  return map;
}

export function loadState(): InspectionState {
  const inspections = withOverlay<Inspection>(COL.inspections, readJsonSafe<Inspection[]>(`${DIR}/inspections.json`, []));
  const findings = withOverlay<Finding>(COL.findings, readJsonSafe<Finding[]>(`${DIR}/findings-seed.json`, []));
  const tasks = withOverlay<CorrectiveTask>(COL.tasks, readJsonSafe<CorrectiveTask[]>(`${DIR}/tasks-seed.json`, []));
  const notices = withOverlay<Notice>(COL.notices, readJsonSafe<Notice[]>(`${DIR}/notices-seed.json`, []));
  return {
    inspections: inspections.sort((a, b) => Date.parse(b.date) - Date.parse(a.date)),
    findings,
    tasks: tasks.sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt)),
    notices,
  };
}

export function getInspection(id: string) {
  const s = loadState();
  return { state: s, insp: s.inspections.find((i) => i.id === id) };
}
