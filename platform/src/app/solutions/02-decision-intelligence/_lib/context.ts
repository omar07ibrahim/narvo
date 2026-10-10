import "server-only";
import type { Citation } from "@/lib/ai/events";
import { kvGet } from "@/lib/store/db";
import { DEPTS, METRICS, REVIEW, metricById, type Dept } from "./catalogue";
import { actionStats, buildFacts, dayLabel, extractNumbers, type ActionItem, type Fact } from "./engine";
import { loadActions, loadDataset, loadMinutes, loadUpdates, SLUG, type DeptUpdate } from "./data";
import type { FigureCheckResult } from "./check";

export const KV_BRIEFING = `${SLUG}:briefing`;
export const KV_FIGCHECK = `${SLUG}:figure-check`;

export interface SourceBlock {
  n: number;
  kind: "K" | "U" | "A" | "M" | "C";
  prompt: string;
  citation: Citation;
}

const fmtDate = (d: string) => `${dayLabel(d)} ${d.slice(0, 4)}`;

function deptName(dept: string) {
  return (DEPTS as Record<string, { name: { en: string } }>)[dept]?.name.en ?? (dept === "procurement" ? "Procurement & Contracts" : "Strategy & Performance");
}

export interface ReviewContext {
  facts: Fact[];
  updates: DeptUpdate[];
  actions: ActionItem[];
  blocks: SourceBlock[];
  stats: ReturnType<typeof actionStats>;
  figureCheck?: FigureCheckResult;
}

/**
 * Numbered source base for the review: computed KPI facts (K), department updates (U), open actions (A),
 * minutes of the last review (M) and figure-check findings (C).
 */
export function buildReviewContext(opts: { dept?: Dept | "all"; maxFacts?: number } = {}): ReviewContext {
  const ds = loadDataset();
  const all = buildFacts(ds, METRICS, { week: REVIEW.week, previousWeek: REVIEW.previousWeek, dataTo: REVIEW.dataTo });
  const inDept = (d: string) => !opts.dept || opts.dept === "all" || d === opts.dept;
  const facts = all
    .filter((f) => inDept(f.dept))
    .sort((a, b) => b.signal - a.signal)
    .slice(0, opts.maxFacts ?? 60);
  const updates = loadUpdates().filter((u) => inDept(u.dept) || u.dept === "procurement");
  const actions = loadActions();
  const stats = actionStats(actions, REVIEW.today);
  const figureCheck = kvGet<FigureCheckResult>(KV_FIGCHECK);

  const blocks: SourceBlock[] = [];
  let n = 1;
  for (const f of facts) {
    const def = metricById(f.metricId)!;
    blocks.push({
      n,
      kind: "K",
      prompt: `[${n}] (K · scorecard · ${deptName(f.dept)}) ${f.text}`,
      citation: { n, docId: f.id, title: f.title, ref: def.source, section: deptName(f.dept), quote: f.text },
    });
    n++;
  }
  for (const u of updates) {
    blocks.push({
      n,
      kind: "U",
      prompt: `[${n}] (U · department update · ${deptName(u.dept)} · ${u.week.replace("2026-W", "week ")} · ${u.author}, ${fmtDate(u.date)})\n${u.body}`,
      citation: { n, docId: u.id, title: u.title, ref: `${u.author} · ${fmtDate(u.date)}`, section: u.week.replace("2026-W", "Week "), quote: u.body.replace(/\*\*/g, "").slice(0, 600) },
    });
    n++;
  }
  const relevant = actions.filter((a) => a.status !== "done" && (a.due <= REVIEW.today || a.due <= "2026-10-18"));
  for (const a of relevant) {
    const overdue = a.due < REVIEW.today;
    const text = `${a.id} — ${a.title}. Owner: ${a.owner}. Raised in ${a.raisedIn}. Due ${fmtDate(a.due)}. Status: ${a.status.replace("_", " ")}${overdue ? " — OVERDUE" : ""}.${a.note ? ` Note: ${a.note}` : ""}${a.kpi ? ` KPI: ${metricById(a.kpi)?.name.en ?? a.kpi}.` : ""}`;
    blocks.push({
      n,
      kind: "A",
      prompt: `[${n}] (A · actions register) ${text}`,
      citation: { n, docId: a.id, title: a.title, ref: `${a.owner} · due ${fmtDate(a.due)}`, section: overdue ? "Overdue" : "Due soon", quote: text },
    });
    n++;
  }
  {
    const s = stats;
    const text = `Actions register at ${fmtDate(REVIEW.today)}: ${s.total} actions; ${s.due} due to date, of which ${s.closedOnTime + s.closedLate} closed (${s.closureRate?.toFixed(1)}% closure; ${s.closedOnTime} on time) and ${s.overdue} overdue; ${s.dueSoon} due in the next 7 days.`;
    blocks.push({
      n,
      kind: "A",
      prompt: `[${n}] (A · actions register summary) ${text}`,
      citation: { n, docId: "ACT-REGISTER", title: "Actions register — summary", ref: "Strategy & Performance Office", section: "Register", quote: text },
    });
    n++;
  }
  const minutes = loadMinutes();
  blocks.push({
    n,
    kind: "M",
    prompt: `[${n}] (M · minutes of the week-39 review, ${fmtDate(minutes.date)})\n${minutes.body.slice(0, 2600)}`,
    citation: { n, docId: minutes.id, title: minutes.title, ref: "Strategy & Performance Office", section: fmtDate(minutes.date), quote: minutes.body.replace(/[#*]/g, "").slice(0, 600) },
  });
  n++;
  if (figureCheck?.checks?.length) {
    const disc = figureCheck.checks.filter((c) => c.status === "discrepancy");
    if (disc.length) {
      const text =
        `Figure check of department updates (${figureCheck.consistent} of ${figureCheck.consistent + figureCheck.discrepancies} verifiable figures consistent with the scorecard). Discrepancies: ` +
        disc.map((c) => `${c.updateId} states "${c.quote}" (${c.claimedText}); scorecard ${c.actualText} (${c.metricName}, ${c.periodLabel})`).join("; ") +
        ".";
      blocks.push({
        n,
        kind: "C",
        prompt: `[${n}] (C · figure consistency check) ${text}`,
        citation: { n, docId: "FIGURE-CHECK", title: "Figure consistency check — department updates", ref: "NARVO figure check", section: "Discrepancies", quote: text },
      });
      n++;
    }
  }
  return { facts, updates, actions, blocks, stats, figureCheck };
}

/** Numbers available in sources, split into scorecard (K/A/C summary) and narrative (U/M). */
export function traceNumbers(text: string, blocks: SourceBlock[]) {
  const clean = text
    .replace(/\[\d+\]/g, " ")
    .replace(/\b[A-Z]{2,}[-/][A-Z0-9][\w\-/]*/g, " ") // reference ids
    .replace(/\b(19|20)\d{2}\b/g, " ")
    .replace(/\bW\d{1,2}\b/g, " ");
  const kSet = new Set<string>();
  const anySet = new Set<string>();
  for (const b of blocks) {
    const nums = extractNumbers(b.prompt);
    for (const x of nums) {
      anySet.add(norm(x));
      if (b.kind === "K" || b.kind === "C" || (b.kind === "A" && b.citation.docId === "ACT-REGISTER")) kSet.add(norm(x));
    }
  }
  const found = extractNumbers(clean).filter((x) => x.includes(".") || x.includes(":") || Number(x) >= 10);
  const unique = Array.from(new Set(found.map(norm)));
  const toScorecard = unique.filter((x) => kSet.has(x));
  const toNarrative = unique.filter((x) => !kSet.has(x) && anySet.has(x));
  const untraced = unique.filter((x) => !anySet.has(x));
  return { total: unique.length, toScorecard, toNarrative, untraced };
}

function norm(x: string) {
  if (x.includes(":")) return x;
  const n = Number(x);
  return Number.isFinite(n) ? String(n) : x;
}

export function sourcesPrompt(blocks: SourceBlock[]) {
  return blocks.map((b) => b.prompt).join("\n\n");
}
