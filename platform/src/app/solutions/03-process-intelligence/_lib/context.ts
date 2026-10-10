import "server-only";
import type { Citation } from "@/lib/ai/events";
import {
  applyFilters,
  cohortRead,
  computeDfg,
  computeStats,
  computeVariants,
  fmt0,
  fmt1,
  reasonFamily,
  rolesOf,
  simulate,
  type Filters,
  type Interventions,
  type PCase,
  type PLog,
  type SimResult,
} from "./mining";
import { DATA_END, loadLog, loadNotes, type CaseNote } from "./data";
import { INTERVENTION_LABELS } from "./labels";

export interface Source {
  n: number;
  kind: "S" | "N";
  text: string;
  citation: Citation;
}


/** Permits issued per month in Jul–Sep 2026 (all cohorts in the selection, by issue date). */
export function q3Throughput(log: PLog, cases: PCase[]) {
  const roles = rolesOf(log);
  const a = Date.parse("2026-07-01T00:00:00+04:00") / 60000;
  const b = Date.parse("2026-10-01T00:00:00+04:00") / 60000;
  let n = 0;
  for (const c of cases) {
    const last = c.ev[c.ev.length - 1];
    if (last?.a === roles.end && last.t >= a && last.t < b) n++;
  }
  return n / 3;
}

export function filterLabel(f: Filters) {
  return [
    f.cohort && f.cohort !== "all" ? `cohort ${f.cohort}` : "all cohorts",
    f.gated && f.gated !== "all" ? (f.gated === "yes" ? "gated communities" : "non-gated districts") : "",
    f.district && f.district !== "all" ? `district ${f.district}` : "",
    f.month && f.month !== "all" ? `submitted ${f.month}` : "",
  ]
    .filter(Boolean)
    .join(", ");
}

function stat(sources: Source[], title: string, text: string) {
  const n = sources.length + 1;
  sources.push({ n, kind: "S", text, citation: { n, docId: `STAT-${n}`, title, ref: "Computed from the permit event log", section: "Process analytics", quote: text } });
}

/** Computed statistics (S) + stratified officer notes (N) for the selection. */
export function buildRcaSources(filters: Filters) {
  const { log } = loadLog();
  const roles = rolesOf(log);
  const cases = applyFilters(log, filters);
  const st = computeStats(log, cases, roles);
  const dfg = computeDfg(log, cases);
  const variants = computeVariants(log, cases, roles);
  const sources: Source[] = [];
  const label = filterLabel(filters);
  const A = log.activities;

  stat(
    sources,
    "Selection overview",
    `Selection (${label}): ${fmt0(st.cases)} applications, ${fmt0(st.completed)} issued, ${fmt0(st.open)} still open at 9 Oct 2026. Median cycle time (submission to issue, issued cases) ${fmt1(st.cycleMedian)} days; mean ${fmt1(st.cycleMean)} days; 90th percentile ${fmt1(st.cycleP90)} days. Target 15 days.`,
  );
  if (st.gatedN && st.nonGatedN)
    stat(
      sources,
      "Gated vs non-gated",
      `Median cycle time in gated communities (MN-03 Al Lulu Island, MN-06 Al Sidr, MN-08 Marina Quarter — master-developer NOC required by Circular 14/2026 from 15 Jul 2026): ${fmt1(st.gatedMedian)} days (n = ${fmt0(st.gatedN)}); non-gated districts: ${fmt1(st.nonGatedMedian)} days (n = ${fmt0(st.nonGatedN)}).`,
    );
  const fam = new Map<string, number>();
  for (const r of st.reasons) fam.set(reasonFamily(r.label), (fam.get(reasonFamily(r.label)) ?? 0) + r.count);
  const famTotal = [...fam.values()].reduce((a, b) => a + b, 0);
  stat(
    sources,
    "Rework and return reasons",
    `Rework: ${fmt0(st.reworkCases)} of ${fmt0(st.cases)} applications (${fmt1(st.reworkPct)}%) were returned to the applicant at least once; ${fmt0(st.returnEvents)} returns in total. Return reasons: ${[...fam.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${fmt0(v)} (${fmt1((v / famTotal) * 100, 0)}%)`)
      .join("; ")}.`,
  );
  if (st.holdN)
    stat(
      sources,
      "Master-developer NOC hold",
      `Status "Awaiting master-developer NOC": ${fmt0(st.holdN)} completed holds, mean ${fmt1(st.holdMean)} days. By developer: ${st.byDeveloper.map((d) => `${d.name} ${fmt1(d.mean)} days (n = ${d.n})`).join("; ")}. Circular 14/2026 asks developers to issue within 7 working days.`,
    );
  // waiting time on transitions
  const waits = dfg.edges
    .filter((e) => e.count >= Math.max(5, st.cases * 0.05))
    .sort((a, b) => b.meanDays - a.meanDays)
    .slice(0, 6);
  stat(
    sources,
    "Longest waiting times between steps",
    `Longest average waits between consecutive steps: ${waits.map((e) => `${A[e.from]} → ${A[e.to]}: mean ${fmt1(e.meanDays)} days, median ${fmt1(e.medianDays)} days (${fmt0(e.count)} transitions)`).join("; ")}.`,
  );
  const top = variants.slice(0, 5);
  stat(
    sources,
    "Process variants",
    `${fmt0(variants.length)} distinct paths. Most common: ${top
      .map((v) => `${v.steps.map((s) => A[s]).join(" → ")} — ${fmt0(v.count)} cases (${fmt1(v.share)}%), median ${fmt1(v.medianDays)} days`)
      .join(" | ")}.`,
  );
  const sc = st.structuralByConsultant.slice(0, 4);
  const structTotal = st.structuralByConsultant.reduce((a, b) => a + b.returns, 0);
  if (sc.length)
    stat(
      sources,
      "Structural-stamp returns by consultant",
      `Returns for unstamped structural calculations: ${fmt0(structTotal)}. Top consultants: ${sc.map((x) => `${x.name} ${x.returns} returns on ${x.cases} applications`).join("; ")}; the top three account for ${fmt1((sc.slice(0, 3).reduce((a, b) => a + b.returns, 0) / Math.max(1, structTotal)) * 100, 0)}% of these returns.`,
    );
  const planQueue = dfg.edges.filter((e) => A[e.to] === "Planning review");
  if (planQueue.length)
    stat(
      sources,
      "Queue before planning review",
      `Wait before planning review starts: ${planQueue.map((e) => `after ${A[e.from]} mean ${fmt1(e.meanDays)} days (n = ${fmt0(e.count)})`).join("; ")}. Planning review → structural review mean ${fmt1(dfg.edges.find((e) => A[e.from] === "Planning review" && A[e.to] === "Structural review")?.meanDays)} days.`,
    );
  stat(sources, "Throughput", `Permits issued per month, Jul–Sep 2026 (by issue date, all applications in the selection): ${fmt0(q3Throughput(log, cases))}.`);

  // stratified notes from cases in the selection
  const ids = new Set(cases.map((c) => c.id));
  const notes = loadNotes().filter((n) => ids.has(n.caseId));
  const byTheme = new Map<string, CaseNote[]>();
  for (const n of notes) byTheme.set(n.theme, [...(byTheme.get(n.theme) ?? []), n]);
  const picked: CaseNote[] = [];
  const quota: Record<string, number> = { nocWait: 7, nocReturn: 6, struct: 5, site: 4, cd: 3, capacity: 4, other: 3, pilot: 4 };
  for (const [theme, list] of byTheme) {
    const step = Math.max(1, Math.floor(list.length / (quota[theme] ?? 3)));
    for (let i = 0; i < list.length && picked.filter((p) => p.theme === theme).length < (quota[theme] ?? 3); i += step) picked.push(list[i]);
  }
  for (const n of picked) {
    const k = sources.length + 1;
    const text = `${n.caseId}, ${n.date.slice(0, 10)}, ${n.author}: ${n.text}`;
    sources.push({
      n: k,
      kind: "N",
      text,
      citation: { n: k, docId: n.id, title: `Officer note — ${n.caseId}`, ref: `${n.author} · ${n.date.slice(0, 10)}`, section: n.theme, quote: n.text },
    });
  }
  return { sources, stats: st, notesTotal: notes.length, notesUsed: picked.length, cases, label };
}

export function buildMemoSources(filters: Filters, iv: Interventions) {
  const { log } = loadLog();
  const cases = applyFilters(log, filters);
  const st = computeStats(log, cases);
  const thr = q3Throughput(log, log.cases);
  const sim: SimResult = simulate(log, cases, iv, thr);
  const pilot = cohortRead(log, applyFilters(log, { cohort: "Pilot (Oct 2026)" }), DATA_END);
  const base = cohortRead(log, applyFilters(log, { cohort: "Q3 2026" }), DATA_END);
  const sources: Source[] = [];
  const on = (Object.keys(iv) as Array<keyof Interventions>).filter((k) => iv[k].on);
  stat(
    sources,
    "Baseline (Q3 2026)",
    `Baseline for ${filterLabel(filters)}: ${fmt0(st.cases)} applications; median cycle ${fmt1(st.cycleMedian)} days (gated ${fmt1(st.gatedMedian)}, non-gated ${fmt1(st.nonGatedMedian)}); rework ${fmt1(st.reworkPct)}%; mean NOC hold ${fmt1(st.holdMean)} days; ${fmt1(st.touchesPerCase)} officer touches per application; ${fmt0(thr)} permits issued per month (Jul–Sep 2026).`,
  );
  stat(
    sources,
    "Interventions simulated",
    `Interventions replayed on the ${fmt0(sim.completed)} issued applications of the selection: ${on
      .map((k) => {
        const x = iv[k] as Record<string, number | boolean>;
        const assumption = "catchRate" in x ? `catches ${fmt0((x.catchRate as number) * 100)}% of the targeted returns` : "share" in x ? `applies to ${fmt0((x.share as number) * 100)}% of NOC requests` : `${fmt0((x.compliance as number) * 100)}% of NOCs within ${x.capDays} days`;
        return `${INTERVENTION_LABELS[k].en} (${assumption})`;
      })
      .join("; ")}.`,
  );
  stat(
    sources,
    "Simulated result",
    `Simulated after the change: median cycle ${fmt1(sim.after.median)} days (from ${fmt1(sim.before.median)}); gated ${fmt1(sim.after.gated)} days (from ${fmt1(sim.before.gated)}); non-gated ${fmt1(sim.after.nonGated)} days (from ${fmt1(sim.before.nonGated)}); 90th percentile ${fmt1(sim.after.p90)} days (from ${fmt1(sim.before.p90)}); rework ${fmt1(sim.after.reworkPct)}% (from ${fmt1(sim.before.reworkPct)}%); officer touches per application ${fmt1(sim.after.touches)} (from ${fmt1(sim.before.touches)}). Return loops avoided: ${sim.loopsPrevented.noc} NOC, ${sim.loopsPrevented.struct} structural-stamp, ${sim.loopsPrevented.site} site-plan. Issue capacity at constant work-in-progress (Little's law): ${fmt0(sim.throughputAfter)} per month (from ${fmt0(sim.throughputBefore)}).`,
  );
  stat(
    sources,
    "Pilot early read (1–9 Oct 2026)",
    `Intake pilot (CHG-2026-014), applications submitted 1–9 Oct 2026: ${pilot.cases} applications; returned to applicant ${fmt1(pilot.returnedPct)}% vs ${fmt1(base.returnedPct)}% in Q3; NOC-related returns ${fmt1(pilot.nocReturnPct)}% of applications vs ${fmt1(base.nocReturnPct)}%; median days to an accepted file ${fmt1(pilot.firstPassDays)} vs ${fmt1(base.firstPassDays)}; mean NOC turnaround ${fmt1(pilot.nocWaitDays)} days (only ${pilot.nocWaitN} NOCs received so far) vs ${fmt1(base.nocWaitDays)} days. Only ${pilot.completed} pilot permit issued so far — cycle time cannot be measured yet.`,
  );
  return { sources, sim, st, pilot, base, thr };
}
