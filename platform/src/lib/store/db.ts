import "server-only";
import fs from "node:fs";
import path from "node:path";

/**
 * Tiny file-backed runtime store for the demo.
 *
 * Seed data lives in /data (read-only, versioned). Everything that happens during a demo —
 * approvals, audit events, status changes, newly created records — is written to
 * /data/runtime/db.json as an overlay, so the app survives restarts and "Reset demo" is a
 * single file delete.
 */

export type Effect =
  | { type: "patch"; collection: string; id: string; patch: Record<string, unknown> }
  | { type: "append"; collection: string; item: Record<string, unknown> & { id: string } }
  | { type: "audit"; action: string; subject: string; detail?: string };

export interface Approval {
  id: string;
  solution: string;
  title: string;
  summary: string;
  actionLabel: string;
  approver: { name: string; title: string };
  requestedBy: string;
  effects: Effect[];
  payload?: unknown;
  status: "pending" | "approved" | "rejected";
  createdAt: number;
  decidedAt?: number;
  decidedBy?: string;
  comment?: string;
}

export interface AuditEvent {
  id: string;
  ts: number;
  solution: string;
  actor: { name: string; role: string; kind: "human" | "agent" | "system" };
  action: string;
  subject: string;
  detail?: string;
  model?: string;
  approvalId?: string;
}

interface DbShape {
  version: 1;
  approvals: Approval[];
  audit: AuditEvent[];
  patches: Record<string, Record<string, Record<string, unknown>>>;
  appended: Record<string, Array<Record<string, unknown> & { id: string }>>;
  kv: Record<string, unknown>;
}

const RUNTIME_DIR = path.join(process.cwd(), "data", "runtime");
const DB_FILE = path.join(RUNTIME_DIR, "db.json");

const empty = (): DbShape => ({ version: 1, approvals: [], audit: [], patches: {}, appended: {}, kv: {} });

const g = globalThis as unknown as { __narvoDb?: DbShape; __narvoDbTimer?: NodeJS.Timeout };

function load(): DbShape {
  if (g.__narvoDb) return g.__narvoDb;
  try {
    g.__narvoDb = { ...empty(), ...JSON.parse(fs.readFileSync(DB_FILE, "utf8")) };
  } catch {
    g.__narvoDb = empty();
  }
  return g.__narvoDb!;
}

function persist() {
  if (g.__narvoDbTimer) clearTimeout(g.__narvoDbTimer);
  g.__narvoDbTimer = setTimeout(() => {
    try {
      fs.mkdirSync(RUNTIME_DIR, { recursive: true });
      fs.writeFileSync(DB_FILE, JSON.stringify(load(), null, 2));
    } catch (e) {
      console.error("[narvo] failed to persist db", e);
    }
  }, 150);
}

const id = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();

/* ─────────────── Approvals ─────────────── */

export function createApproval(input: Omit<Approval, "id" | "status" | "createdAt" | "requestedBy"> & { requestedBy?: string }): Approval {
  const db = load();
  const approval: Approval = {
    ...input,
    requestedBy: input.requestedBy ?? "NARVO Agent",
    id: id("APR"),
    status: "pending",
    createdAt: Date.now(),
  };
  db.approvals.unshift(approval);
  addAudit({
    solution: input.solution,
    actor: { name: "NARVO Agent", role: "AI agent", kind: "agent" },
    action: "Requested approval",
    subject: input.title,
    detail: `Routed to ${input.approver.name} (${input.approver.title})`,
    approvalId: approval.id,
  });
  persist();
  return approval;
}

export function listApprovals(filter?: { solution?: string; status?: Approval["status"] }) {
  return load().approvals.filter(
    (a) => (!filter?.solution || a.solution === filter.solution) && (!filter?.status || a.status === filter.status),
  );
}

export function getApproval(approvalId: string) {
  return load().approvals.find((a) => a.id === approvalId);
}

export function decideApproval(approvalId: string, decision: "approved" | "rejected", comment?: string) {
  const db = load();
  const a = db.approvals.find((x) => x.id === approvalId);
  if (!a) throw new Error("Approval not found");
  if (a.status !== "pending") return a;
  a.status = decision;
  a.decidedAt = Date.now();
  a.decidedBy = a.approver.name;
  a.comment = comment;
  if (decision === "approved") {
    for (const e of a.effects) applyEffect(e, a);
  }
  addAudit({
    solution: a.solution,
    actor: { name: a.approver.name, role: a.approver.title, kind: "human" },
    action: decision === "approved" ? "Approved" : "Rejected",
    subject: a.title,
    detail: comment || a.actionLabel,
    approvalId: a.id,
  });
  persist();
  return a;
}

function applyEffect(e: Effect, a: Approval) {
  if (e.type === "patch") patchRecord(e.collection, e.id, e.patch);
  else if (e.type === "append") appendRecord(e.collection, e.item);
  else if (e.type === "audit")
    addAudit({
      solution: a.solution,
      actor: { name: "NARVO Agent", role: "AI agent", kind: "agent" },
      action: e.action,
      subject: e.subject,
      detail: e.detail,
      approvalId: a.id,
    });
}

/* ─────────────── Audit ─────────────── */

export function addAudit(ev: Omit<AuditEvent, "id" | "ts"> & { ts?: number }) {
  const db = load();
  const full: AuditEvent = { ...ev, id: id("AUD"), ts: ev.ts ?? Date.now() };
  db.audit.unshift(full);
  if (db.audit.length > 5000) db.audit.length = 5000;
  persist();
  return full;
}

export function listAudit(filter?: { solution?: string; limit?: number }) {
  const all = load().audit.filter((a) => !filter?.solution || a.solution === filter.solution);
  return all.slice(0, filter?.limit ?? 500);
}

/* ─────────────── Record overlays ─────────────── */

export function patchRecord(collection: string, recordId: string, patch: Record<string, unknown>) {
  const db = load();
  db.patches[collection] ??= {};
  db.patches[collection][recordId] = { ...(db.patches[collection][recordId] ?? {}), ...patch, _updatedAt: Date.now() };
  persist();
}

export function appendRecord(collection: string, item: Record<string, unknown> & { id: string }) {
  const db = load();
  db.appended[collection] ??= [];
  db.appended[collection].unshift({ ...item, _createdAt: Date.now() });
  persist();
}

/** Merge seed records with runtime patches and appended records. */
export function withOverlay<T extends { id: string }>(collection: string, seed: T[]): T[] {
  const db = load();
  const patches = db.patches[collection] ?? {};
  const appended = (db.appended[collection] ?? []) as unknown as T[];
  const merged = seed.map((r) => (patches[r.id] ? ({ ...r, ...patches[r.id] } as T) : r));
  const appendedPatched = appended.map((r) => (patches[r.id] ? ({ ...r, ...patches[r.id] } as T) : r));
  return [...appendedPatched, ...merged];
}

export function getPatch(collection: string, recordId: string) {
  return load().patches[collection]?.[recordId];
}

/* ─────────────── Key/value (cached AI results etc.) ─────────────── */

export function kvGet<T = unknown>(key: string): T | undefined {
  return load().kv[key] as T | undefined;
}

export function kvSet(key: string, value: unknown) {
  load().kv[key] = value;
  persist();
}

/* ─────────────── Reset ─────────────── */

export function resetDemo(solution?: string) {
  const db = load();
  if (!solution) {
    g.__narvoDb = empty();
    try {
      fs.rmSync(DB_FILE, { force: true });
    } catch {}
    return;
  }
  db.approvals = db.approvals.filter((a) => a.solution !== solution);
  db.audit = db.audit.filter((a) => a.solution !== solution);
  for (const key of Object.keys(db.kv)) if (key.startsWith(`${solution}:`)) delete db.kv[key];
  for (const col of Object.keys(db.patches)) if (col.startsWith(`${solution}/`)) delete db.patches[col];
  for (const col of Object.keys(db.appended)) if (col.startsWith(`${solution}/`)) delete db.appended[col];
  persist();
}
