/**
 * Deterministic compliance checks for the bid (client-safe, no model involved):
 * certificate / policy expiries vs the closing date and bid validity, page limits,
 * mandatory forms, ICV and Emiratisation thresholds, coverage statistics.
 */

import { DEMO_TODAY } from "@/lib/world/orgs";
import type {
  Bi,
  BidSeed,
  BidState,
  CertificateRecord,
  Coverage,
  CoverageStatus,
  FormRecord,
  Requirement,
  SectionState,
} from "./types";

export type CheckStatus = "ok" | "warning" | "critical";

const DAY = 86_400_000;
const d = (iso: string) => Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso);

export function addDays(iso: string, n: number): string {
  return new Date(d(iso) + n * DAY).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((d(to) - d(from)) / DAY);
}

/** Add UAE working days (Mon–Fri) to a date. */
export function addWorkingDays(iso: string, n: number): string {
  let t = d(iso);
  let left = n;
  while (left > 0) {
    t += DAY;
    const wd = new Date(t).getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return new Date(t).toISOString().slice(0, 10);
}

export function validityEnd(seed: BidSeed) {
  return addDays(seed.tender.closing, seed.tender.validityDays);
}

export function daysToClosing(seed: BidSeed) {
  return daysBetween(DEMO_TODAY, seed.tender.closing);
}

export interface CertCheck {
  cert: CertificateRecord;
  status: CheckStatus;
  note: Bi;
  marginDays: number;
}

export function certificateChecks(seed: BidSeed, certs: CertificateRecord[] = seed.certificates): CertCheck[] {
  const closing = seed.tender.closing;
  const vEnd = validityEnd(seed);
  return certs.map((cert) => {
    const afterClosing = daysBetween(closing, cert.expiry);
    const afterValidity = daysBetween(vEnd, cert.expiry);
    if (afterClosing < 0) {
      return {
        cert,
        status: "critical",
        marginDays: afterClosing,
        note: {
          en: `Expires ${fmt(cert.expiry)} — ${-afterClosing} days before the closing date. Not valid at submission.`,
          ar: `ينتهي في ${fmtAr(cert.expiry)} — قبل الإغلاق بـ ${-afterClosing} يوماً. غير ساري عند التقديم.`,
        },
      };
    }
    if (cert.mustCover === "validity" && afterValidity < 0) {
      return {
        cert,
        status: "warning",
        marginDays: afterValidity,
        note: {
          en: `Valid at closing but expires ${fmt(cert.expiry)}, ${-afterValidity} days before bid validity ends (${fmt(vEnd)}).`,
          ar: `ساري عند الإغلاق لكنه ينتهي في ${fmtAr(cert.expiry)}، قبل انتهاء صلاحية العطاء (${fmtAr(vEnd)}) بـ ${-afterValidity} يوماً.`,
        },
      };
    }
    if (cert.id === "icv" && cert.issued) {
      const age = daysBetween(cert.issued, closing);
      const scoreOk = (cert.score ?? 0) >= (cert.minScore ?? 0);
      if (age > 365 || !scoreOk)
        return {
          cert,
          status: "critical",
          marginDays: afterClosing,
          note: { en: `ICV certificate issued ${age} days before closing or below minimum score.`, ar: `شهادة القيمة الوطنية صادرة منذ ${age} يوماً أو أقل من الحد الأدنى.` },
        };
      return {
        cert,
        status: "ok",
        marginDays: afterClosing,
        note: {
          en: `Score ${cert.score}% ≥ ${cert.minScore}% · issued ${age} days before closing (≤ 365).`,
          ar: `النتيجة ${cert.score}% ≥ ${cert.minScore}% · صادرة قبل الإغلاق بـ ${age} يوماً (≤ 365).`,
        },
      };
    }
    return {
      cert,
      status: "ok",
      marginDays: afterClosing,
      note: { en: `Valid until ${fmt(cert.expiry)}.`, ar: `ساري حتى ${fmtAr(cert.expiry)}.` },
    };
  });
}

/** Requirements whose evidence IS the tender form itself — their status is derived from the forms register. */
export const FORM_DRIVEN = ["M-07", "M-08", "C-01", "C-03"];

export function formCheck(forms: FormRecord[], reqId: string): { status: CheckStatus; note: string; derived: CoverageStatus } | null {
  const linked = forms.filter((f) => (f.requirements ?? [f.requirement]).includes(reqId));
  if (!linked.length) return null;
  const notStarted = linked.filter((f) => f.status === "not_started");
  const open = linked.filter((f) => f.status !== "complete");
  return {
    status: notStarted.length ? "critical" : open.length ? "warning" : "ok",
    derived: notStarted.length ? "missing" : open.length ? "partial" : "met",
    note: open.length
      ? `Form${open.length > 1 ? "s" : ""} ${open.map((f) => `${f.id} ${f.name.en} (${f.status.replace(/_/g, " ")})`).join("; ")} not complete.`
      : `Form${linked.length > 1 ? "s" : ""} ${linked.map((f) => f.id).join(", ")} complete.`,
  };
}

/** Computed check that applies to a specific requirement (worst of its certificates and forms). */
export function requirementCheck(
  seed: BidSeed,
  reqId: string,
  certs: CertificateRecord[] = seed.certificates,
  forms: FormRecord[] = seed.forms,
): { status: CheckStatus; note: string; derived?: CoverageStatus } | null {
  const rank = { ok: 0, warning: 1, critical: 2 } as const;
  const parts: Array<{ status: CheckStatus; note: string; derived?: CoverageStatus }> = [];
  const checks = certificateChecks(seed, certs).filter((c) => c.cert.requirement === reqId);
  if (checks.length) {
    const worst = checks.reduce((a, b) => (rank[b.status] > rank[a.status] ? b : a));
    parts.push({ status: worst.status, note: `${worst.cert.name} (${worst.cert.number}): ${worst.note.en}` });
  }
  const fc = formCheck(forms, reqId);
  if (fc) parts.push(FORM_DRIVEN.includes(reqId) ? fc : { status: fc.status, note: fc.note });
  if (!parts.length) return null;
  const status = parts.reduce((a, b) => (rank[b.status] > rank[a.status] ? b : a)).status;
  return { status, note: parts.map((p) => p.note).join(" "), derived: parts.find((p) => p.derived)?.derived };
}

/** Merge model judgement with the computed check — computed facts win. */
export function mergeStatus(ai: CoverageStatus, check: { status: CheckStatus; derived?: CoverageStatus } | null | undefined): CoverageStatus {
  if (!check) return ai;
  if (check.derived) return check.derived;
  if (check.status === "critical") return "missing";
  if (check.status === "warning" && ai === "met") return "partial";
  return ai;
}

/* ───────────── Text measures ───────────── */

export function cleanForCount(text: string) {
  return text
    .replace(/\[\d+\]/g, "")
    .replace(/[#*_>`|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function wordCount(text: string) {
  const t = cleanForCount(text);
  return t ? t.split(" ").length : 0;
}

export interface PageCheck {
  sectionId: string;
  words: number;
  pages: number;
  limit: number;
  status: CheckStatus | "empty";
}

export function pageChecks(seed: BidSeed, sections: Record<string, SectionState>): PageCheck[] {
  return seed.sections.map((s) => {
    const latest = sections[s.id]?.versions.at(-1);
    const words = latest ? wordCount(latest.text) : 0;
    const pages = Math.round((words / seed.wordsPerPage) * 10) / 10;
    const status: PageCheck["status"] = !latest ? "empty" : pages > s.pageLimit ? "critical" : pages > s.pageLimit * 0.9 ? "warning" : "ok";
    return { sectionId: s.id, words, pages, limit: s.pageLimit, status };
  });
}

export function formChecks(forms: FormRecord[]) {
  return forms.map((f) => ({ form: f, status: (f.status === "complete" ? "ok" : f.status === "not_started" ? "critical" : "warning") as CheckStatus }));
}

export function emiratisationCheck(seed: BidSeed) {
  const e = seed.emiratisation;
  const pct = Math.round((e.plannedNationals / e.plannedTeam) * 1000) / 10;
  const required = Math.ceil((e.targetPct / 100) * e.plannedTeam);
  const gap = Math.max(0, required - e.plannedNationals);
  return { pct, required, gap, status: (gap > 0 ? "warning" : "ok") as CheckStatus, ...e };
}

export function turnoverCheck(seed: BidSeed) {
  const f = seed.financials;
  return { ...f, status: (f.turnover2025 >= f.minTurnover ? "ok" : "critical") as CheckStatus, ratio: f.turnover2025 / f.minTurnover };
}

/* ───────────── Coverage statistics ───────────── */

export function coverageStats(reqs: Requirement[], coverage: Record<string, Coverage>) {
  const total = reqs.length;
  let met = 0,
    partial = 0,
    missing = 0,
    pending = 0;
  for (const r of reqs) {
    const c = coverage[r.id];
    if (!c) pending++;
    else if (c.status === "met") met++;
    else if (c.status === "partial") partial++;
    else missing++;
  }
  const mapped = total - pending;
  const pct = total ? Math.round((met / total) * 100) : 0;
  const weighted = total ? Math.round(((met + partial * 0.5) / total) * 100) : 0;
  const mandatoryOpen = reqs.filter((r) => r.mandatory && coverage[r.id] && coverage[r.id].status !== "met").length;
  return { total, met, partial, missing, pending, mapped, pct, weighted, mandatoryOpen };
}

export function claimStats(sections: Record<string, SectionState>) {
  let flagged = 0,
    checked = 0,
    stale = 0,
    gaps = 0;
  for (const s of Object.values(sections)) {
    const latest = s.versions.at(-1);
    if (latest) gaps += (latest.text.match(/\[(?:Evidence needed|يلزم دليل|دليل مطلوب)[^\]]*\]/gi) ?? []).length;
    if (!s.check) continue;
    checked++;
    if (latest && s.check.version !== latest.v) {
      stale++;
      continue;
    }
    flagged += s.check.claims.filter((c) => c.verdict === "unsupported" || c.verdict === "contradicted").length;
  }
  return { flagged, checked, stale, gaps };
}

export function readiness(seed: BidSeed, state: BidState) {
  const reqs = state.requirements?.items ?? [];
  const cov = coverageStats(reqs, state.coverage);
  const certs = certificateChecks(seed, state.certificates);
  const forms = formChecks(state.forms);
  const pages = pageChecks(seed, state.sections);
  const claims = claimStats(state.sections);
  const emi = emiratisationCheck(seed);
  const critical =
    certs.filter((c) => c.status === "critical").length +
    forms.filter((f) => f.status === "critical").length +
    pages.filter((p) => p.status === "critical").length;
  const warnings =
    certs.filter((c) => c.status === "warning").length +
    forms.filter((f) => f.status === "warning").length +
    pages.filter((p) => p.status === "warning").length +
    (emi.status === "warning" ? 1 : 0);
  const drafted = pages.filter((p) => p.status !== "empty").length;
  const openTasks = state.tasks.filter((t) => t.status === "open").length;
  return { cov, certs, forms, pages, claims, emi, critical, warnings, drafted, openTasks };
}

/* ───────────── formatting ───────────── */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
export function fmt(iso: string) {
  const [y, m, dd] = iso.slice(0, 10).split("-").map(Number);
  return `${dd} ${MONTHS[m - 1]} ${y}`;
}
export function fmtAr(iso: string) {
  const [y, m, dd] = iso.slice(0, 10).split("-").map(Number);
  return `${dd} ${MONTHS_AR[m - 1]} ${y}`;
}
