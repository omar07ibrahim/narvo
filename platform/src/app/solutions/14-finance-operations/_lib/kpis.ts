import { r2 } from "./three-way";
import type { HistoryItem, Invoice, MatchResult } from "./types";

export function isResolved(inv: Invoice) {
  return inv.status !== "received";
}

export function resolvedAtOf(inv: Invoice): number | null {
  if (!isResolved(inv)) return null;
  return inv.resolvedAt ?? inv._updatedAt ?? null;
}

export interface Kpis {
  batchDocs: number;
  batchValue: number;
  autoMatched: number;
  autoMatchedPct: number;
  autoMatchedValue: number;
  exceptionsTotal: number;
  openExceptions: number;
  openVariance: number;
  openUnmatched: number;
  resolvedLive: number;
  resolvedToday: number;
  releasedToday: number;
  histAvgEffort: number;
  histAvgDays: number;
  histCount: number;
  histReopenedPct: number;
  liveAvgEffort: number | null;
  liveCount: number;
  blendedAvgEffort: number;
}

const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

export function computeKpis(invoices: Invoice[], matches: Record<string, MatchResult>, history: HistoryItem[], now = Date.now()): Kpis {
  const batch = invoices.filter((i) => i.source !== "upload");
  const auto = batch.filter((i) => !isResolved(i) && !matches[i.id]?.exception);
  const exceptionDocs = batch.filter((i) => matches[i.id]?.exception || isResolved(i));
  const open = batch.filter((i) => !isResolved(i) && matches[i.id]?.exception);
  const resolved = invoices.filter(isResolved);
  const today = resolved.filter((i) => {
    const t = resolvedAtOf(i);
    return t != null && sameDay(t, now);
  });
  const live = resolved
    .map((i) => {
      const t = resolvedAtOf(i);
      return t && i.caseOpenedAt ? Math.max(1, (t - i.caseOpenedAt) / 60000) : null;
    })
    .filter((x): x is number => x != null);
  const histEffort = history.reduce((a, h) => a + h.effortMinutes, 0);
  const histDays = history.reduce((a, h) => a + (Date.parse(h.resolvedAt) - Date.parse(h.openedAt)) / 86400000, 0);
  return {
    batchDocs: batch.length,
    batchValue: r2(batch.reduce((a, i) => a + i.total, 0)),
    autoMatched: auto.length,
    autoMatchedPct: batch.length ? (auto.length / batch.length) * 100 : 0,
    autoMatchedValue: r2(auto.reduce((a, i) => a + i.total, 0)),
    exceptionsTotal: exceptionDocs.length,
    openExceptions: open.length,
    openVariance: r2(open.reduce((a, i) => a + (matches[i.id]?.variance ?? 0), 0)),
    openUnmatched: r2(open.reduce((a, i) => a + (matches[i.id]?.unmatchedValue ?? 0), 0)),
    resolvedLive: resolved.length,
    resolvedToday: today.length,
    releasedToday: r2(today.reduce((a, i) => a + (i.payableAmount ?? 0), 0)),
    histAvgEffort: history.length ? histEffort / history.length : 0,
    histAvgDays: history.length ? histDays / history.length : 0,
    histCount: history.length,
    histReopenedPct: history.length ? (history.filter((h) => h.reopened).length / history.length) * 100 : 0,
    liveAvgEffort: live.length ? live.reduce((a, x) => a + x, 0) / live.length : null,
    liveCount: live.length,
    blendedAvgEffort: (histEffort + live.reduce((a, x) => a + x, 0)) / Math.max(1, history.length + live.length),
  };
}
