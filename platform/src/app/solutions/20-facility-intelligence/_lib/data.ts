import "server-only";
import fs from "node:fs";
import { dataPath, readCsv, readJson } from "@/lib/world/data";
import { withOverlay } from "@/lib/store/db";
import { parseSeries, type Complaint, type Job, type Series, type Trip } from "./signals";

export const SLUG = "20-facility-intelligence";
export const WOS = `${SLUG}/work-orders`;
const DIR = "mnda/20-facility-intelligence";
export const CLEAN_AT = "2026-10-06T11:40:00+04:00";

export interface Zone {
  id: string;
  name: string;
  nameAr: string;
  floor: string;
  area: number;
  capacity: number;
  ahu: string[];
  use: string;
  setpoint: number;
}
export interface Asset {
  id: string;
  type: string;
  name: string;
  capacityTR?: number;
  installed?: number;
  location: string;
  note?: string;
}
export interface Site {
  id: "AGC" | "HQ";
  name: string;
  nameAr: string;
  district: string;
  built: number;
  gfa: number;
  contract: string;
  contractor: string;
  openingHours: string;
  cooling: string;
  bms: string;
  zones: Zone[];
  assets: Asset[];
}
export interface PpmTask {
  id: string;
  site: string;
  asset: string;
  task: string;
  taskAr: string;
  frequency: string;
  lastDone: string;
  due: string;
  status: string;
  history: Array<{ date: string; event: string }>;
}
export interface Contract {
  id: string;
  title: string;
  titleAr: string;
  contractor: string;
  value: string;
  term: string;
  renewal: string;
  sites: string[];
  clauses: Array<{ ref: string; title: string; text: string }>;
}
export interface WorkOrder {
  id: string;
  title: string;
  site: string;
  asset: string;
  zones: string[];
  priority: string;
  priorityReason: string;
  responseHours: number | null;
  rectifyHours: number | null;
  contractor: string;
  scope: string[];
  safety: string[];
  verification: Array<{ metric: string; threshold: number; description: string }>;
  linkedComplaints: string[];
  linkedJobs: string[];
  schedule: string;
  estimatedHours: number | null;
  status: string;
  issuedAt: string;
  raisedBy: string;
  approvedBy: string;
  completedAt?: string | null;
  completionNote?: string;
  verificationResult?: unknown;
  verificationNote?: string;
  verifiedAt?: string;
}

const g = globalThis as unknown as { __narvo20?: { key: string; agc: Series; hq: Series } };

export function loadSeries() {
  const key = ["bms-agc-hourly.csv", "bms-hq-hourly.csv"].map((f) => fs.statSync(dataPath(`${DIR}/${f}`)).mtimeMs).join("|");
  if (g.__narvo20?.key === key) return g.__narvo20;
  g.__narvo20 = { key, agc: parseSeries("AGC", readCsv(`${DIR}/bms-agc-hourly.csv`)), hq: parseSeries("HQ", readCsv(`${DIR}/bms-hq-hourly.csv`)) };
  return g.__narvo20;
}

export const loadSites = () => readJson<Site[]>(`${DIR}/sites.json`);
export const loadComplaints = () => readJson<Complaint[]>(`${DIR}/complaints.json`);
export const loadTrips = () => readJson<Trip[]>(`${DIR}/trips.json`);
export const loadJobs = () => readJson<Job[]>(`${DIR}/work-orders.json`);
export const loadPpm = () => readJson<PpmTask[]>(`${DIR}/ppm.json`);
export const loadContract = () => readJson<Contract>(`${DIR}/contract.json`);
export const loadBookings = () => readJson<Array<{ id: string; zone: string; title: string; titleAr: string; start: string; end: string; expected: number; organiser: string }>>(`${DIR}/bookings.json`);
export const loadFeed = () => readJson<Array<{ job: string; reportedAt: string; workStart: string; workEnd: string; technician: string; supervisor: string; summary: string; photos: number }>>(`${DIR}/contractor-feed.json`);
export const loadEnergy = () => readJson<{ site: string; unit: string; tariffAedPerKwh: number; months: Array<{ month: string; y2025: number; y2026: number | null }>; oct2026PartialKwh: number }>(`${DIR}/energy-monthly.json`);
export const loadSep25 = () =>
  readCsv(`${DIR}/energy-sep-2025-daily.csv`).map((r) => ({ date: r.date, ambient_max_c: Number(r.ambient_max_c), ambient_mean_c: Number(r.ambient_mean_c), chiller_kwh: Number(r.chiller_kwh) }));
export const loadWorkOrders = () => withOverlay<WorkOrder>(WOS, []);
