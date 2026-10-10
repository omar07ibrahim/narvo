/**
 * CSSR-2025 enforcement rules for 18 — computed in code, never by the model.
 *  - Art. 31.2–31.4 / 31.7: due dates (Critical 24 clock hours; Major 3 / Minor 7 working days from the day
 *    after service, ending 23:59; Mon–Fri working week, public holidays excluded)
 *  - Art. 31.6: repeat on the same site by the same contractor within 90 days escalates one class
 *  - Annex B.2: repeat within 12 months doubles the penalty; with escalation the higher of the two applies
 */

import type { CorrectiveTask, Finding, Inspection, InspectionState, Severity, Taxonomy } from "./types";

const HOLIDAYS = new Set(["2026-12-01", "2026-12-02", "2026-12-03", "2027-01-01"]);
const UAE_OFFSET_MS = 4 * 3600 * 1000;
const DAY = 86400000;

const uaeDate = (ms: number) => new Date(ms + UAE_OFFSET_MS).toISOString().slice(0, 10);
const uaeDow = (ms: number) => new Date(ms + UAE_OFFSET_MS).getUTCDay(); // 0 Sun … 6 Sat

/** Due date-time (ISO, +04:00) for a finding served at `servedAt`. */
export function dueAt(servedAt: number, severity: Severity, tax: Taxonomy): string {
  const rule = tax.severities[severity];
  if (rule.dueBasis === "calendar") return toUae(servedAt + rule.dueDays * DAY);
  let t = servedAt;
  let n = 0;
  while (n < rule.dueDays) {
    t += DAY;
    const dow = uaeDow(t);
    if (dow === 0 || dow === 6 || HOLIDAYS.has(uaeDate(t))) continue;
    n++;
  }
  return `${uaeDate(t)}T23:59:00+04:00`;
}

export function toUae(ms: number) {
  return new Date(ms + UAE_OFFSET_MS).toISOString().slice(0, 19) + "+04:00";
}

const ESCALATE: Record<Severity, Severity> = { minor: "major", major: "critical", critical: "critical" };

export interface RepeatCheck {
  escalated: boolean;
  doubled: boolean;
  prior?: { taskId: string; noticeId: string; createdAt: number; days: number };
}

/** Art. 31.6 / Annex B.2 repeat check against earlier corrective tasks (same article, site, contractor). */
export function repeatCheck(code: string, insp: Inspection, tasks: CorrectiveTask[], at: number): RepeatCheck {
  const prior = tasks
    .filter((t) => t.code === code && t.plot === insp.plot && t.owner === insp.contractor && t.inspectionId !== insp.id && t.createdAt < at)
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!prior) return { escalated: false, doubled: false };
  const days = Math.floor((at - prior.createdAt) / DAY);
  return {
    escalated: days <= 90,
    doubled: days <= 365,
    prior: { taskId: prior.id, noticeId: prior.noticeId, createdAt: prior.createdAt, days },
  };
}

export interface Assessed {
  finding: Finding;
  baseSeverity: Severity;
  severity: Severity;
  article: string;
  penaltyAed: number;
  dueAt: string;
  repeat: RepeatCheck;
}

export function assess(finding: Finding, insp: Inspection, state: Pick<InspectionState, "tasks">, tax: Taxonomy, servedAt: number): Assessed {
  const d = tax.defects.find((x) => x.code === finding.code)!;
  const repeat = repeatCheck(finding.code, insp, state.tasks, servedAt);
  const severity = repeat.escalated ? ESCALATE[d.severity] : d.severity;
  const base = tax.severities[d.severity].penaltyAed;
  const penaltyAed = repeat.escalated
    ? Math.max(tax.severities[severity].penaltyAed, repeat.doubled ? base * 2 : base)
    : repeat.doubled
      ? base * 2
      : base;
  return { finding, baseSeverity: d.severity, severity, article: d.article, penaltyAed, dueAt: dueAt(servedAt, severity, tax), repeat };
}

export interface Kpis {
  aiReviewed: number;
  aiAccepted: number;
  aiRejected: number;
  reviewerAdded: number;
  acceptanceRate: number;
  falseFlagRate: number;
  missedRate: number;
  findings: number;
  tasksDue: number;
  tasksClosedOnTime: number;
  closureRate: number;
  openTasks: number;
  overdue: number;
  pendingReview: number;
  penaltiesAed: number;
}

export function computeKpis(state: InspectionState, now: number): Kpis {
  const live = state.findings.filter((f) => f.status !== "superseded");
  const ai = live.filter((f) => f.source === "ai" && (f.status === "accepted" || f.status === "rejected"));
  const aiAccepted = ai.filter((f) => f.status === "accepted").length;
  const aiRejected = ai.length - aiAccepted;
  const reviewerAdded = live.filter((f) => f.source === "reviewer" && f.status === "accepted").length;
  const due = state.tasks.filter((t) => Date.parse(t.dueAt) <= now || t.status === "closed");
  const closedOnTime = due.filter((t) => t.status === "closed" && t.closure && t.closure.decidedAt <= Date.parse(t.dueAt) + DAY).length;
  const closed = due.filter((t) => t.status === "closed").length;
  return {
    aiReviewed: ai.length,
    aiAccepted,
    aiRejected,
    reviewerAdded,
    acceptanceRate: ai.length ? aiAccepted / ai.length : 0,
    falseFlagRate: ai.length ? aiRejected / ai.length : 0,
    missedRate: aiAccepted + reviewerAdded ? reviewerAdded / (aiAccepted + reviewerAdded) : 0,
    findings: aiAccepted + reviewerAdded,
    tasksDue: due.length,
    tasksClosedOnTime: closedOnTime,
    closureRate: due.length ? closed / due.length : 0,
    openTasks: state.tasks.filter((t) => t.status === "open").length,
    overdue: state.tasks.filter((t) => t.status === "open" && Date.parse(t.dueAt) < now).length,
    pendingReview: live.filter((f) => f.status === "proposed").length,
    penaltiesAed: state.notices.reduce((a, n) => a + n.penaltyTotal, 0),
  };
}
