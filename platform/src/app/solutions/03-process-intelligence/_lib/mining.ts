/**
 * Process mining engine for solution 03 — pure and isomorphic.
 * Parses any event log (case, activity, timestamp, attributes), and computes the directly-follows graph,
 * variants, cycle-time statistics, rework, NOC holds, throughput, a replay simulation of interventions and the
 * pilot-vs-baseline comparison. Every number shown in the module comes from these functions.
 */

export interface PEvent {
  /** activity index */
  a: number;
  /** minutes since Unix epoch */
  t: number;
  /** reason index or -1 */
  r: number;
}

export interface PCase {
  id: string;
  /** attribute values aligned with log.attrKeys */
  v: string[];
  ev: PEvent[];
}

export interface PLog {
  name: string;
  kind: "mnda" | "byo";
  activities: string[];
  reasons: string[];
  attrKeys: string[];
  cases: PCase[];
}

const DAY = 1440;

/* ───────────── CSV parsing ───────────── */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let q = false;
  const s = text.replace(/\r/g, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === "," || c === ";" || c === "\t") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || (r[0] ?? "").trim());
}

export interface ColumnGuess {
  caseCol: number;
  activityCol: number;
  timeCol: number;
  reasonCol: number;
  attrCols: number[];
  header: string[];
}

export function guessColumns(header: string[]): ColumnGuess | null {
  const h = header.map((x) => x.trim().toLowerCase());
  const find = (re: RegExp, not: number[] = []) => h.findIndex((x, i) => re.test(x) && !not.includes(i));
  const caseCol = find(/^(case[_ ]?id|case|caseid|ticket|id|application|order[_ ]?id)$/) >= 0 ? find(/^(case[_ ]?id|case|caseid|ticket|id|application|order[_ ]?id)$/) : find(/case/);
  const activityCol = find(/^(activity|event|step|task|status|action|concept:name)$/) >= 0 ? find(/^(activity|event|step|task|status|action|concept:name)$/) : find(/activ|event|step/);
  const timeCol = find(/time|date|^ts$|timestamp/, [caseCol, activityCol]);
  if (caseCol < 0 || activityCol < 0 || timeCol < 0) return null;
  const reasonCol = find(/reason|cause/, [caseCol, activityCol, timeCol]);
  const attrCols = h.map((_, i) => i).filter((i) => ![caseCol, activityCol, timeCol, reasonCol].includes(i) && !/^resource$/.test(h[i]));
  return { caseCol, activityCol, timeCol, reasonCol, attrCols, header };
}

export function parseTime(s: string): number | null {
  const x = s.trim();
  if (!x) return null;
  let ms = Date.parse(x);
  if (Number.isNaN(ms)) {
    // dd/mm/yyyy hh:mm
    const m = x.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (m) ms = Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)) - 4 * 3600000;
  } else if (/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/.test(x)) {
    // no zone given: treat as Gulf Standard Time (UTC+4)
    ms = Date.parse(x.replace(" ", "T") + (x.length === 10 ? "T00:00:00" : "") + "+04:00");
  }
  return Number.isNaN(ms) ? null : ms / 60000;
}

export function buildLog(text: string, name: string, kind: PLog["kind"] = "byo"): { log: PLog; skipped: number } | { error: string } {
  const rows = parseCsv(text);
  if (rows.length < 3) return { error: "The file has fewer than two data rows." };
  const g = guessColumns(rows[0]);
  if (!g) return { error: "Could not find case id, activity and timestamp columns (expected headers like case_id, activity, timestamp)." };
  const activities: string[] = [];
  const reasons: string[] = [];
  const aIdx = new Map<string, number>();
  const rIdx = new Map<string, number>();
  const byCase = new Map<string, PCase>();
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const id = (r[g.caseCol] ?? "").trim();
    const act = (r[g.activityCol] ?? "").trim();
    const t = parseTime(r[g.timeCol] ?? "");
    if (!id || !act || t == null) {
      skipped++;
      continue;
    }
    let a = aIdx.get(act);
    if (a == null) {
      a = activities.length;
      activities.push(act);
      aIdx.set(act, a);
    }
    let ri = -1;
    const reason = g.reasonCol >= 0 ? (r[g.reasonCol] ?? "").trim() : "";
    if (reason) {
      ri = rIdx.get(reason) ?? -1;
      if (ri < 0) {
        ri = reasons.length;
        reasons.push(reason);
        rIdx.set(reason, ri);
      }
    }
    let c = byCase.get(id);
    if (!c) {
      c = { id, v: g.attrCols.map((i) => (r[i] ?? "").trim()), ev: [] };
      byCase.set(id, c);
    }
    c.ev.push({ a, t, r: ri });
  }
  const cases = Array.from(byCase.values());
  for (const c of cases) c.ev.sort((x, y) => x.t - y.t);
  if (!cases.length) return { error: "No valid events found." };
  return { log: { name, kind, activities, reasons, attrKeys: g.attrCols.map((i) => g.header[i].trim()), cases }, skipped };
}

/* ───────────── roles & attributes ───────────── */

export interface Roles {
  start: number;
  end: number;
  returns: number[];
  holdStart: number;
  holdEnd: number;
  check: number;
  reviews: number[];
}

export function rolesOf(log: PLog): Roles {
  const idx = (name: string) => log.activities.indexOf(name);
  const lastCounts = new Map<number, number>();
  const firstCounts = new Map<number, number>();
  for (const c of log.cases) {
    if (!c.ev.length) continue;
    lastCounts.set(c.ev[c.ev.length - 1].a, (lastCounts.get(c.ev[c.ev.length - 1].a) ?? 0) + 1);
    firstCounts.set(c.ev[0].a, (firstCounts.get(c.ev[0].a) ?? 0) + 1);
  }
  const top = (m: Map<number, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  const issued = idx("Permit issued");
  return {
    start: idx("Submitted") >= 0 ? idx("Submitted") : top(firstCounts),
    end: issued >= 0 ? issued : top(lastCounts),
    returns: log.activities.map((a, i) => [a, i] as const).filter(([a]) => /return|reject|query raised|rework|sent back/i.test(a)).map(([, i]) => i),
    holdStart: idx("Awaiting master-developer NOC"),
    holdEnd: idx("NOC received"),
    check: idx("Completeness check"),
    reviews: ["Planning review", "Structural review", "Civil Defence coordination"].map(idx).filter((i) => i >= 0),
  };
}

export const attr = (log: PLog, c: PCase, key: string) => {
  const i = log.attrKeys.indexOf(key);
  return i >= 0 ? c.v[i] : "";
};

/* ───────────── filters ───────────── */

export interface Filters {
  cohort?: string;
  gated?: "all" | "yes" | "no";
  district?: string;
  month?: string;
}

export function applyFilters(log: PLog, f: Filters): PCase[] {
  return log.cases.filter((c) => {
    if (f.cohort && f.cohort !== "all" && attr(log, c, "cohort") !== f.cohort) return false;
    if (f.gated && f.gated !== "all" && attr(log, c, "gated") !== f.gated) return false;
    if (f.district && f.district !== "all" && attr(log, c, "district") !== f.district) return false;
    if (f.month && f.month !== "all") {
      const d = new Date((c.ev[0]?.t ?? 0) * 60000 + 4 * 3600000).toISOString().slice(0, 7);
      if (d !== f.month) return false;
    }
    return true;
  });
}

/* ───────────── statistics ───────────── */

export const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const k = s.length >> 1;
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
};
export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
export const quantile = (xs: number[], q: number) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (pos - lo);
};

export function cycleDays(c: PCase, roles: Roles): number | null {
  const last = c.ev[c.ev.length - 1];
  if (!last || last.a !== roles.end) return null;
  return (last.t - c.ev[0].t) / DAY;
}

export interface LogStats {
  cases: number;
  events: number;
  completed: number;
  open: number;
  cycleMedian: number | null;
  cycleMean: number | null;
  cycleP90: number | null;
  reworkCases: number;
  reworkPct: number | null;
  returnEvents: number;
  reasons: Array<{ label: string; count: number; pct: number }>;
  holdMean: number | null;
  holdN: number;
  byDeveloper: Array<{ name: string; mean: number; n: number }>;
  gatedMedian: number | null;
  nonGatedMedian: number | null;
  gatedN: number;
  nonGatedN: number;
  issuedPerMonth: number | null;
  touchesPerCase: number | null;
  structuralByConsultant: Array<{ name: string; returns: number; cases: number }>;
}

export function computeStats(log: PLog, cases: PCase[], roles = rolesOf(log)): LogStats {
  const cyc: number[] = [];
  const gated: number[] = [];
  const nongated: number[] = [];
  let returnEvents = 0;
  let reworkCases = 0;
  const reasonCount = new Map<number, number>();
  const holds: number[] = [];
  const dev = new Map<string, number[]>();
  const consultantStruct = new Map<string, { returns: number; cases: number }>();
  let touches = 0;
  const hasGated = log.attrKeys.includes("gated");
  for (const c of cases) {
    const d = cycleDays(c, roles);
    if (d != null) {
      cyc.push(d);
      if (hasGated) (attr(log, c, "gated") === "yes" ? gated : nongated).push(d);
    }
    let returned = false;
    const seen = new Set<number>();
    let repeated = false;
    for (const e of c.ev) {
      if (roles.returns.includes(e.a)) {
        returnEvents++;
        returned = true;
        reasonCount.set(e.r, (reasonCount.get(e.r) ?? 0) + 1);
      }
      if (seen.has(e.a)) repeated = true;
      seen.add(e.a);
      if (e.a !== roles.start && e.a !== roles.holdEnd && !/resubmit/i.test(log.activities[e.a])) touches++;
    }
    if (returned || (!roles.returns.length && repeated)) reworkCases++;
    if (roles.holdStart >= 0 && roles.holdEnd >= 0) {
      const a = c.ev.find((e) => e.a === roles.holdStart);
      const b = c.ev.find((e) => e.a === roles.holdEnd);
      if (a && b && b.t > a.t) {
        const w = (b.t - a.t) / DAY;
        holds.push(w);
        const name = attr(log, c, "master_developer") || "—";
        dev.set(name, [...(dev.get(name) ?? []), w]);
      }
    }
    const cons = attr(log, c, "consultant");
    if (cons) {
      const s = consultantStruct.get(cons) ?? { returns: 0, cases: 0 };
      s.cases++;
      s.returns += c.ev.filter((e) => roles.returns.includes(e.a) && /structural/i.test(log.reasons[e.r] ?? "")).length;
      consultantStruct.set(cons, s);
    }
  }
  // issued per month over full calendar months covered by issue dates in the selection
  const issuedMonths = new Map<string, number>();
  for (const c of cases) {
    const last = c.ev[c.ev.length - 1];
    if (last?.a === roles.end) {
      const m = new Date(last.t * 60000 + 4 * 3600000).toISOString().slice(0, 7);
      issuedMonths.set(m, (issuedMonths.get(m) ?? 0) + 1);
    }
  }
  const total = [...reasonCount.values()].reduce((a, b) => a + b, 0);
  return {
    cases: cases.length,
    events: cases.reduce((a, c) => a + c.ev.length, 0),
    completed: cyc.length,
    open: cases.length - cyc.length,
    cycleMedian: median(cyc),
    cycleMean: mean(cyc),
    cycleP90: quantile(cyc, 0.9),
    reworkCases,
    reworkPct: cases.length ? (reworkCases / cases.length) * 100 : null,
    returnEvents,
    reasons: [...reasonCount.entries()]
      .map(([r, n]) => ({ label: r >= 0 ? log.reasons[r] : "Unspecified", count: n, pct: total ? (n / total) * 100 : 0 }))
      .sort((a, b) => b.count - a.count),
    holdMean: mean(holds),
    holdN: holds.length,
    byDeveloper: [...dev.entries()].map(([name, xs]) => ({ name, mean: mean(xs)!, n: xs.length })).sort((a, b) => b.mean - a.mean),
    gatedMedian: median(gated),
    nonGatedMedian: median(nongated),
    gatedN: gated.length,
    nonGatedN: nongated.length,
    issuedPerMonth: issuedMonths.size ? [...issuedMonths.values()].reduce((a, b) => a + b, 0) / issuedMonths.size : null,
    touchesPerCase: cases.length ? touches / cases.length : null,
    structuralByConsultant: [...consultantStruct.entries()]
      .map(([name, s]) => ({ name, ...s }))
      .filter((x) => x.returns > 0)
      .sort((a, b) => b.returns - a.returns),
  };
}

/** Return-reason labels grouped into the four canonical families (MNDA log). */
export function reasonFamily(label: string) {
  if (/NOC/i.test(label)) return "NOC missing or expired";
  if (/structural/i.test(label)) return "Structural calculations not stamped";
  if (/site-plan|revision/i.test(label)) return "Site-plan version mismatch";
  return "Other";
}

/* ───────────── directly-follows graph ───────────── */

export interface DfgNode {
  id: number;
  label: string;
  events: number;
  cases: number;
  coverage: number;
  meanPos: number;
}

export interface DfgEdge {
  from: number;
  to: number;
  count: number;
  medianDays: number;
  meanDays: number;
  p90Days: number;
}

export function computeDfg(log: PLog, cases: PCase[]) {
  const nodeEvents = new Map<number, number>();
  const nodeCases = new Map<number, Set<string>>();
  const pos = new Map<number, number[]>();
  const edges = new Map<string, number[]>();
  for (const c of cases) {
    const n = c.ev.length;
    c.ev.forEach((e, i) => {
      nodeEvents.set(e.a, (nodeEvents.get(e.a) ?? 0) + 1);
      if (!nodeCases.has(e.a)) nodeCases.set(e.a, new Set());
      nodeCases.get(e.a)!.add(c.id);
      const arr = pos.get(e.a) ?? [];
      arr.push(n > 1 ? i / (n - 1) : 0);
      pos.set(e.a, arr);
      if (i > 0) {
        const k = `${c.ev[i - 1].a}>${e.a}`;
        const w = edges.get(k) ?? [];
        w.push((e.t - c.ev[i - 1].t) / DAY);
        edges.set(k, w);
      }
    });
  }
  const nodes: DfgNode[] = [...nodeEvents.keys()].map((a) => ({
    id: a,
    label: log.activities[a],
    events: nodeEvents.get(a)!,
    cases: nodeCases.get(a)!.size,
    coverage: cases.length ? nodeCases.get(a)!.size / cases.length : 0,
    meanPos: mean(pos.get(a)!) ?? 0,
  }));
  const edgeList: DfgEdge[] = [...edges.entries()].map(([k, w]) => {
    const [from, to] = k.split(">").map(Number);
    return { from, to, count: w.length, medianDays: median(w)!, meanDays: mean(w)!, p90Days: quantile(w, 0.9)! };
  });
  return { nodes, edges: edgeList };
}

/* ───────────── variants ───────────── */

export interface Variant {
  key: string;
  steps: number[];
  count: number;
  share: number;
  medianDays: number | null;
  completed: number;
}

export function computeVariants(log: PLog, cases: PCase[], roles = rolesOf(log)): Variant[] {
  const m = new Map<string, { steps: number[]; cyc: number[]; count: number }>();
  for (const c of cases) {
    const steps = c.ev.map((e) => e.a);
    const key = steps.join("-");
    const v = m.get(key) ?? { steps, cyc: [], count: 0 };
    v.count++;
    const d = cycleDays(c, roles);
    if (d != null) v.cyc.push(d);
    m.set(key, v);
  }
  return [...m.entries()]
    .map(([key, v]) => ({ key, steps: v.steps, count: v.count, share: cases.length ? (v.count / cases.length) * 100 : 0, medianDays: median(v.cyc), completed: v.cyc.length }))
    .sort((a, b) => b.count - a.count);
}

/* ───────────── distributions & throughput ───────────── */

export function histogram(log: PLog, cases: PCase[], roles = rolesOf(log), bin = 2, max = 60) {
  const hasGated = log.attrKeys.includes("gated");
  const bins = Array.from({ length: max / bin + 1 }, (_, i) => ({ from: i * bin, label: i * bin >= max ? `${max}+` : `${i * bin}`, gated: 0, nonGated: 0, all: 0 }));
  for (const c of cases) {
    const d = cycleDays(c, roles);
    if (d == null) continue;
    const i = Math.min(bins.length - 1, Math.floor(d / bin));
    bins[i].all++;
    if (hasGated && attr(log, c, "gated") === "yes") bins[i].gated++;
    else bins[i].nonGated++;
  }
  return bins;
}

export function weekKey(min: number) {
  const ms = min * 60000 + 4 * 3600000;
  const d = new Date(ms);
  const dow = (d.getUTCDay() + 6) % 7;
  const mon = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow));
  return mon.toISOString().slice(0, 10);
}

export function weekly(log: PLog, cases: PCase[], roles = rolesOf(log)) {
  const m = new Map<string, { week: string; submitted: number; issued: number; returned: number }>();
  const get = (k: string) => {
    let x = m.get(k);
    if (!x) {
      x = { week: k, submitted: 0, issued: 0, returned: 0 };
      m.set(k, x);
    }
    return x;
  };
  for (const c of cases) {
    if (!c.ev.length) continue;
    const s = get(weekKey(c.ev[0].t));
    s.submitted++;
    if (c.ev.some((e) => roles.returns.includes(e.a))) s.returned++;
    const last = c.ev[c.ev.length - 1];
    if (last.a === roles.end) get(weekKey(last.t)).issued++;
  }
  return [...m.values()].sort((a, b) => a.week.localeCompare(b.week));
}

/* ───────────── replay simulation of interventions ───────────── */

export interface Interventions {
  intakeNoc: { on: boolean; catchRate: number };
  parallelNoc: { on: boolean; share: number };
  stampCheck: { on: boolean; catchRate: number };
  revisionCheck: { on: boolean; catchRate: number };
  developerSla: { on: boolean; compliance: number; capDays: number };
}

export const DEFAULT_INTERVENTIONS: Interventions = {
  intakeNoc: { on: true, catchRate: 0.85 },
  parallelNoc: { on: true, share: 1 },
  stampCheck: { on: true, catchRate: 0.9 },
  revisionCheck: { on: false, catchRate: 0.7 },
  developerSla: { on: false, compliance: 0.8, capDays: 9 },
};

/** Deterministic uniform number per case and key (so a scenario always gives the same answer). */
export function u01(id: string, key: string) {
  let h = 2166136261;
  const s = id + "|" + key;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export interface SimCase {
  id: string;
  gated: boolean;
  before: number;
  after: number;
  returnsBefore: number;
  returnsAfter: number;
  touchesBefore: number;
  touchesAfter: number;
  holdBefore: number | null;
  holdAfter: number | null;
}

export interface SimResult {
  n: number;
  completed: number;
  before: { median: number | null; mean: number | null; gated: number | null; nonGated: number | null; reworkPct: number | null; touches: number | null; hold: number | null; p90: number | null };
  after: { median: number | null; mean: number | null; gated: number | null; nonGated: number | null; reworkPct: number | null; touches: number | null; hold: number | null; p90: number | null };
  throughputBefore: number | null;
  throughputAfter: number | null;
  loopsPrevented: { noc: number; struct: number; site: number };
  cases: SimCase[];
}

/** Replays every case of the log with modified waiting segments / return probabilities. */
export function simulate(log: PLog, cases: PCase[], iv: Interventions, baselineThroughput: number | null): SimResult {
  const roles = rolesOf(log);
  const out: SimCase[] = [];
  const devHold = new Map<string, number[]>();
  // developer NOC turnaround observed in this selection (median), used when an intake check turns a return into a hold
  for (const c of cases) {
    const a = c.ev.find((e) => e.a === roles.holdStart);
    const b = c.ev.find((e) => e.a === roles.holdEnd);
    if (a && b && b.t > a.t) {
      const k = attr(log, c, "master_developer");
      devHold.set(k, [...(devHold.get(k) ?? []), (b.t - a.t) / DAY]);
    }
  }
  const devMedian = new Map([...devHold.entries()].map(([k, xs]) => [k, median(xs)!]));
  const allHolds = [...devHold.values()].flat();
  const overallHold = median(allHolds) ?? 7;
  const prevented = { noc: 0, struct: 0, site: 0 };
  for (const c of cases) {
    const ev = c.ev;
    const last = ev[ev.length - 1];
    const gated = attr(log, c, "gated") === "yes";
    const t0 = ev[0].t;
    // locate return loops: (check that returned) → … → next completeness check
    const checks = ev.map((e, i) => [e, i] as const).filter(([e]) => e.a === roles.check);
    let loopSaved = 0;
    let returnsAfter = 0;
    let returnsBefore = 0;
    let convertedHold: number | null = null;
    let touchesSaved = 0;
    for (let k = 0; k < checks.length; k++) {
      const [chk, ci] = checks[k];
      const next = ev[ci + 1];
      if (!next || !roles.returns.includes(next.a)) continue;
      returnsBefore++;
      const reason = log.reasons[next.r] ?? "";
      const fam = reasonFamily(reason);
      const nextCheck = checks[k + 1]?.[0];
      const loopLen = nextCheck ? (nextCheck.t - chk.t) / DAY : null;
      let replaced: number | null = null;
      if (fam === "NOC missing or expired" && iv.intakeNoc.on && u01(c.id, `noc${k}`) < iv.intakeNoc.catchRate) {
        prevented.noc++;
        convertedHold = devMedian.get(attr(log, c, "master_developer")) ?? overallHold;
        replaced = 0;
      } else if (fam === "Structural calculations not stamped" && iv.stampCheck.on && u01(c.id, `st${k}`) < iv.stampCheck.catchRate) {
        prevented.struct++;
        replaced = 0.5;
      } else if (fam === "Site-plan version mismatch" && iv.revisionCheck.on && u01(c.id, `sp${k}`) < iv.revisionCheck.catchRate) {
        prevented.site++;
        replaced = 1;
      }
      if (replaced != null && loopLen != null) {
        loopSaved += loopLen - replaced;
        touchesSaved += 2;
      } else returnsAfter++;
    }
    const touchesBefore = ev.filter((e) => e.a !== roles.start && e.a !== roles.holdEnd && !/resubmit/i.test(log.activities[e.a])).length;
    const holdA = ev.find((e) => e.a === roles.holdStart);
    const holdB = ev.find((e) => e.a === roles.holdEnd);
    const holdBefore = holdA && holdB && holdB.t > holdA.t ? (holdB.t - holdA.t) / DAY : null;
    if (last.a !== roles.end) {
      out.push({ id: c.id, gated, before: NaN, after: NaN, returnsBefore, returnsAfter, touchesBefore, touchesAfter: touchesBefore - touchesSaved, holdBefore, holdAfter: holdBefore });
      continue;
    }
    const before = (last.t - t0) / DAY;
    // post-check segment: [hold] → reviews → issue
    const lastCheck = checks.length ? checks[checks.length - 1][0].t : t0;
    const reviewEvents = ev.filter((e) => roles.reviews.includes(e.a));
    const reviewEnd = reviewEvents.length ? reviewEvents[reviewEvents.length - 1].t : lastCheck;
    const issueGap = (last.t - reviewEnd) / DAY;
    const sequentialHold = holdA && holdB && holdA.t >= lastCheck && holdB.t <= (reviewEvents[0]?.t ?? last.t);
    let hold = holdBefore ?? convertedHold;
    let reviewDur: number;
    if (sequentialHold && holdB) reviewDur = (reviewEnd - holdB.t) / DAY;
    else reviewDur = (reviewEnd - lastCheck) / DAY;
    if (hold != null && iv.developerSla.on && u01(c.id, "sla") < iv.developerSla.compliance) hold = Math.min(hold, iv.developerSla.capDays);
    const preCheck = (lastCheck - t0) / DAY - loopSaved;
    let post: number;
    const parallel = iv.parallelNoc.on && u01(c.id, "par") < iv.parallelNoc.share;
    const holdIsSequential = sequentialHold || (holdBefore == null && convertedHold != null);
    if (hold == null) post = reviewDur + issueGap;
    else if (!holdIsSequential) post = reviewDur + issueGap; // already concurrent (pilot cases)
    else if (parallel) post = Math.max(hold, reviewDur) + issueGap;
    else post = hold + reviewDur + issueGap;
    const after = Math.max(0.5, preCheck + post);
    out.push({ id: c.id, gated, before, after, returnsBefore, returnsAfter, touchesBefore, touchesAfter: touchesBefore - touchesSaved, holdBefore, holdAfter: hold });
  }
  const done = out.filter((x) => !Number.isNaN(x.before));
  const agg = (pick: (x: SimCase) => number) => ({
    median: median(done.map(pick)),
    mean: mean(done.map(pick)),
    p90: quantile(done.map(pick), 0.9),
    gated: median(done.filter((x) => x.gated).map(pick)),
    nonGated: median(done.filter((x) => !x.gated).map(pick)),
  });
  const b = agg((x) => x.before);
  const a = agg((x) => x.after);
  const holdsB = out.map((x) => x.holdBefore).filter((x): x is number => x != null);
  const holdsA = out.map((x) => x.holdAfter).filter((x): x is number => x != null);
  return {
    n: out.length,
    completed: done.length,
    before: { ...b, reworkPct: out.length ? (out.filter((x) => x.returnsBefore > 0).length / out.length) * 100 : null, touches: mean(out.map((x) => x.touchesBefore)), hold: mean(holdsB) },
    after: { ...a, reworkPct: out.length ? (out.filter((x) => x.returnsAfter > 0).length / out.length) * 100 : null, touches: mean(out.map((x) => x.touchesAfter)), hold: mean(holdsA) },
    throughputBefore: baselineThroughput,
    // Little's law: with work-in-progress held constant, throughput scales with 1 / mean cycle time
    throughputAfter: baselineThroughput != null && b.mean && a.mean ? baselineThroughput * (b.mean / a.mean) : null,
    loopsPrevented: prevented,
    cases: out,
  };
}

/* ───────────── pilot vs baseline ───────────── */

export interface CohortRead {
  cases: number;
  returnedPct: number | null;
  nocReturnPct: number | null;
  firstPassDays: number | null;
  nocWaitDays: number | null;
  nocWaitN: number;
  issuedWithin7Pct: number | null;
  issuedWithin7N: number;
  completed: number;
  medianCycle: number | null;
  touchesPerCase: number | null;
}

export function cohortRead(log: PLog, cases: PCase[], dataEnd: number, roles = rolesOf(log)): CohortRead {
  let returned = 0;
  let nocRet = 0;
  const firstPass: number[] = [];
  const waits: number[] = [];
  let within7 = 0;
  let eligible7 = 0;
  const cyc: number[] = [];
  let touches = 0;
  for (const c of cases) {
    const ev = c.ev;
    const t0 = ev[0].t;
    const rets = ev.filter((e) => roles.returns.includes(e.a));
    if (rets.length) returned++;
    if (rets.some((e) => /NOC/i.test(log.reasons[e.r] ?? ""))) nocRet++;
    // first check that was not followed by a return = file accepted
    for (let i = 0; i < ev.length; i++) {
      if (ev[i].a === roles.check && !(ev[i + 1] && roles.returns.includes(ev[i + 1].a))) {
        if (ev[i + 1] || ev[i].t < dataEnd - 2 * DAY) firstPass.push((ev[i].t - t0) / DAY);
        break;
      }
    }
    const a = ev.find((e) => e.a === roles.holdStart);
    const b = ev.find((e) => e.a === roles.holdEnd);
    if (a && b && b.t > a.t) waits.push((b.t - a.t) / DAY);
    if (dataEnd - t0 >= 7 * DAY) {
      eligible7++;
      const last = ev[ev.length - 1];
      if (last.a === roles.end && last.t - t0 <= 7 * DAY) within7++;
    }
    const d = cycleDays(c, roles);
    if (d != null) cyc.push(d);
    touches += ev.filter((e) => e.a !== roles.start && e.a !== roles.holdEnd && !/resubmit/i.test(log.activities[e.a])).length;
  }
  const n = cases.length;
  return {
    cases: n,
    returnedPct: n ? (returned / n) * 100 : null,
    nocReturnPct: n ? (nocRet / n) * 100 : null,
    firstPassDays: median(firstPass),
    nocWaitDays: mean(waits),
    nocWaitN: waits.length,
    issuedWithin7Pct: eligible7 ? (within7 / eligible7) * 100 : null,
    issuedWithin7N: eligible7,
    completed: cyc.length,
    medianCycle: median(cyc),
    touchesPerCase: n ? touches / n : null,
  };
}

/* ───────────── compact transfer format ───────────── */

export interface CompactLog {
  name: string;
  kind: PLog["kind"];
  activities: string[];
  reasons: string[];
  attrKeys: string[];
  cases: Array<[string, string[], number[]]>;
}

export function compact(log: PLog): CompactLog {
  return {
    name: log.name,
    kind: log.kind,
    activities: log.activities,
    reasons: log.reasons,
    attrKeys: log.attrKeys,
    cases: log.cases.map((c) => [c.id, c.v, c.ev.flatMap((e) => [e.a, Math.round(e.t), e.r])]),
  };
}

export function expand(c: CompactLog): PLog {
  return {
    name: c.name,
    kind: c.kind,
    activities: c.activities,
    reasons: c.reasons,
    attrKeys: c.attrKeys,
    cases: c.cases.map(([id, v, flat]) => {
      const ev: PEvent[] = [];
      for (let i = 0; i < flat.length; i += 3) ev.push({ a: flat[i], t: flat[i + 1], r: flat[i + 2] });
      return { id, v, ev };
    }),
  };
}

export const fmt1 = (x: number | null | undefined, d = 1) => (x == null || Number.isNaN(x) ? "—" : x.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
export const fmt0 = (x: number | null | undefined) => (x == null || Number.isNaN(x) ? "—" : Math.round(x).toLocaleString("en-US"));
