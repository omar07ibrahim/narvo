import "server-only";
import { readJson } from "@/lib/world/data";
import { kvGet, withOverlay } from "@/lib/store/db";
import type { Asset, BmsLog, HistoryEntry, Inventory, Job, ServiceReport, Site, Technician } from "./types";

export const SLUG = "19-field-service";
export const COL = { jobs: `${SLUG}/jobs`, reports: `${SLUG}/reports`, history: `${SLUG}/history` };
export const CORPUS = "raseen/knowledge/field-service";
const DIR = "raseen/19-field-service";
export const SUPERVISOR = { name: "Mohammed Rafiq", title: "HVAC Supervisor, Raseen FM", nameAr: "محمد رفيق", titleAr: "مشرف التكييف، رصين لإدارة المرافق" };

export const loadSites = () => readJson<Site[]>(`${DIR}/sites.json`);
export const loadAssets = () => readJson<Asset[]>(`${DIR}/assets.json`);
export const loadTechs = () => readJson<Technician[]>(`${DIR}/technicians.json`);
export const loadInventory = () => readJson<Inventory>(`${DIR}/inventory.json`);
export const loadBms = () => readJson<BmsLog>(`${DIR}/bms-ch02.json`);
export const loadJobs = () => withOverlay<Job>(COL.jobs, readJson<Job[]>(`${DIR}/jobs.json`));
export const loadHistory = () => withOverlay<HistoryEntry>(COL.history, readJson<HistoryEntry[]>(`${DIR}/history.json`));

export interface StoredReport {
  id: string;
  jobId: string;
  report: ServiceReport;
  completeness: number;
  submittedAt: number;
  approvedBy: string;
  followUps: string[];
}
export const loadReports = () => withOverlay<StoredReport & Record<string, unknown>>(COL.reports, []);

export interface StoredBrief {
  text: string;
  citations: unknown[];
  parts: unknown[];
  facts: unknown;
  ms: number;
  generatedAt: number;
  lang: "en" | "ar";
}
export interface StoredDraft {
  report: ServiceReport;
  generatedAt: number;
  photos: Array<{ thumb: string; caption: string; phase: string }>;
  notes: string;
  ms: number;
}
export const briefKey = (jobId: string) => `${SLUG}:brief:${jobId}`;
export const draftKey = (jobId: string) => `${SLUG}:draft:${jobId}`;
export const getBrief = (jobId: string) => kvGet<StoredBrief>(briefKey(jobId));
export const getDraft = (jobId: string) => kvGet<StoredDraft>(draftKey(jobId));

export function jobContext(jobId: string) {
  const jobs = loadJobs();
  const job = jobs.find((j) => j.id === jobId);
  if (!job) return null;
  const asset = loadAssets().find((a) => a.id === job.asset)!;
  const site = loadSites().find((s) => s.id === job.site)!;
  const techs = loadTechs();
  const tech = techs.find((t) => t.id === job.technician)!;
  const supervisor = techs.find((t) => t.id === job.supervisor)!;
  return { job, jobs, asset, site, tech, supervisor };
}
