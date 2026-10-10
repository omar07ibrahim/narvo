import "server-only";
import type { Citation } from "@/lib/ai/events";
import { getForecastBundle, loadConfig, loadOverrides, loadPositions } from "./data";
import { buildSimSeries, runPlans } from "./simulate";
import type { PlanRun, WhatIf } from "./types";

const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;
const aed = (v: number) => `AED ${Math.round(v).toLocaleString("en-US")}`;
const num = (v: number) => Math.round(v).toLocaleString("en-US");
const RES_LABEL: Record<string, string> = {
  "JA-pallets": "Jebel Ali pallet positions",
  "JA-yard": "Jebel Ali rebar yard (t)",
  "MN-pallets": "MN-05 pallet positions",
  "MN-yard": "MN-05 rebar bay (t)",
};

export interface PlanningFacts {
  run: PlanRun;
  citations: Citation[];
  context: string;
  summary: {
    wape: number;
    naiveWape: number;
    plans: Array<{ id: string; name: string; fillRate: number; fillRateP10: number; totalCost: number; violations: number; constraintFit: number }>;
  };
}

/** Recompute forecasts + plans for a what-if and turn the numbers into citable evidence blocks. */
export function buildFacts(whatIf: WhatIf): PlanningFacts {
  const cfg = loadConfig();
  const bundle = getForecastBundle();
  const overrides = loadOverrides();
  const sim = buildSimSeries(bundle.series, overrides, whatIf, cfg);
  const run = runPlans({ cfg, positions: loadPositions(cfg), series: sim, whatIf });
  const P = bundle.portfolio;
  const wk = (i: number) => run.weeks[i];
  const blocks: Array<{ id: string; title: string; section: string; text: string }> = [];

  blocks.push({
    id: "calc:accuracy",
    title: "Forecast accuracy — 12-week backtest",
    section: "Backtest 20 Jul – 5 Oct 2026",
    text:
      `Holt-Winters (52-week seasonality, damped trend) with Ramadan/Eid/summer-ban/promotion effects, refitted without the last 12 weeks. ` +
      `Value-weighted WAPE ${pct(P.wape)} vs seasonal-naive ${pct(P.naiveWape)}; mean SKU MAPE ${pct(P.meanMape)} vs ${pct(P.meanNaiveMape)}; ` +
      `legacy spreadsheet method ${pct(cfg.history.legacyMape, 0)} MAPE. P10–P90 interval coverage ${pct(P.coverage, 0)} (nominal 80%).`,
  });

  for (const p of run.plans) {
    const spec = cfg.plans.find((x) => x.id === p.id)!;
    const peaks = p.resources.map((r) => `${RES_LABEL[r.id]} peak ${num(r.peakP50)} of ${num(r.capacity)} (${pct(r.peakP50 / r.capacity, 0)})`).join("; ");
    const fam = Object.entries(p.byFamily)
      .map(([k, v]) => `${k} ${pct(v)}`)
      .join(", ");
    blocks.push({
      id: `calc:plan-${p.id}`,
      title: `Plan ${p.id} — ${spec.name}`,
      section: "Simulated over 13 weeks × 100 demand paths",
      text:
        `${spec.summary} Expected fill rate ${pct(p.fillRate)} (P10 ${pct(p.fillRateP10)}); by family: ${fam}. ` +
        `13-week cost ${aed(p.cost.total)} (P10–P90 ${aed(p.cost.totalP10)}–${aed(p.cost.totalP90)}): holding ${aed(p.cost.holding)}, lost-sales ${aed(p.cost.stockout)}, transfers ${aed(p.cost.transfer)}, overflow storage ${aed(p.cost.overflow)}. ` +
        `${peaks}. Capacity violations: ${p.violations.length} resource-weeks; constraint fit ${pct(p.constraintFit, 0)}. ` +
        `Rebar received ${num(p.rebarReceivedT)} t; transfers ${num(p.transfersT)} t rebar and ${num(p.transfersPallets)} pallets.`,
    });
  }

  const jaW = cfg.warehouses[0];
  const mnW = cfg.warehouses[1];
  blocks.push({
    id: "calc:limits",
    title: "Operating limits and what-if assumptions",
    section: "Capacity",
    text:
      `Jebel Ali: ${num(jaW.palletPositions - whatIf.palletLossJA)} pallet positions${whatIf.palletLossJA ? ` (after losing ${num(whatIf.palletLossJA)})` : ""}, of which ${num(jaW.otherPallets)} hold non-planned ranges; rebar yard ${num(jaW.rebarYardT - whatIf.yardLossJA)} t (${num(jaW.otherYardT ?? 0)} t other sizes). ` +
      `MN-05: ${num(mnW.palletPositions)} positions (${num(mnW.otherPallets)} other), rebar bay ${num(mnW.rebarYardT)} t. Plan C keeps 3% headroom. ` +
      `Demand what-if: ${whatIf.upliftPct ? `+${whatIf.upliftPct}% on ${whatIf.upliftScope === "mq" ? "Marina Quarter structural packages (rebar, OPC cement, blocks at MN-05)" : whatIf.upliftScope === "structural" ? "all structural SKUs" : "all SKUs"}` : "none"}; Sahara restart delay ${whatIf.millDelayWeeks} week(s); service target for B/C ${pct(whatIf.serviceTarget)}. ` +
      `Costs: holding ${pct(cfg.costs.holdingRateAnnual, 0)}/yr of cost + storage; lost sale = margin + ${pct(cfg.costs.stockoutGoodwillPctOfPrice, 0)} of price; transfer AED ${cfg.costs.transferPerPallet}/pallet, AED ${cfg.costs.transferPerTonne}/t; 3PL overflow AED ${cfg.costs.overflowPerPalletWeek}/pallet-week.`,
  });

  const s = cfg.suppliers.sahara;
  blocks.push({
    id: "calc:sahara",
    title: "Sahara Rebar Mills — supply",
    section: "Allocation",
    text: `${s.maintenance}. Allocation to RBM by arrival week: ${run.weeks
      .slice(0, 6)
      .map((w, i) => `${w} ${num(s.weeklyAllocationT[i] ?? 0)} t`)
      .join(", ")}; normal ${num(s.weeklyAllocationT[3])} t/week. ${s.catchUpNote} Plans B and C take the catch-up; plan A does not.`,
  });

  // Exposure: lowest-fill SKUs per plan
  const exposure = run.plans
    .map((p) => {
      const worst = [...p.bySku].sort((a, b) => a.fill - b.fill).slice(0, 4);
      return `Plan ${p.id}: ` + worst.map((w) => `${w.sku} @ ${w.wh === "JA" ? "Jebel Ali" : "MN-05"} ${pct(w.fill)} fill, ${w.stockoutWeeks.toFixed(1)} stock-out weeks, ${num(w.lostUnits)} units lost`).join("; ");
    })
    .join(". ");
  blocks.push({ id: "calc:exposure", title: "Most exposed SKUs", section: "Fill rate by SKU", text: exposure + ". RB-B500-16 at MN-05 opened with 64 t on hand (sales order SO-26-11842 asks for 120 t)." });

  const viol = run.plans
    .flatMap((p) => p.violations.map((v) => ({ ...v, plan: p.id })))
    .sort((a, b) => b.excess / b.capacity - a.excess / a.capacity)
    .slice(0, 8);
  blocks.push({
    id: "calc:violations",
    title: "Capacity violations (median path above limit)",
    section: "Constraint check",
    text: viol.length
      ? viol.map((v) => `Plan ${v.plan}, w/c ${v.week}: ${RES_LABEL[v.resource]} needs ${num(v.required)} vs ${num(v.capacity)} (+${num(v.excess)}, probability ${pct(v.probability, 0)})`).join("; ")
      : "No plan exceeds a storage limit on the median demand path.",
  });

  // Demand outlook for structural families (P50 / P90 totals)
  const rebar = sim.filter((x) => x.family === "rebar");
  const series = bundle.series;
  const rebarP90 = (h: number) => series.filter((x) => x.sku.startsWith("RB-")).reduce((a, x) => a + x.forecast.p90[h], 0);
  const outlook = [0, 2, 4, 6, 8, 10, 12]
    .map((h) => `w/c ${wk(h)}: rebar P50 ${num(rebar.reduce((a, x) => a + x.f[h], 0))} t (P90 ${num(rebarP90(h))} t)`)
    .join("; ");
  blocks.push({ id: "calc:outlook", title: "Demand outlook — rebar (both warehouses)", section: "Forecast P50 / P90", text: outlook + ". Q4 peak in November; National Day week (w/c 30 Nov) dips." });

  if (overrides.length) {
    blocks.push({
      id: "calc:overrides",
      title: "Planner overrides in effect",
      section: "Overrides",
      text: overrides.map((o) => `${o.key.replace("|", " @ ")} w/c ${o.week}: ${num(o.original)} → ${num(o.value)} (${o.reason})`).join("; "),
    });
  }

  const citations: Citation[] = blocks.map((b, i) => ({
    n: i + 1,
    docId: b.id,
    title: b.title,
    ref: "Computed · NARVO planning engine",
    section: b.section,
    quote: b.text,
  }));
  const context = blocks.map((b, i) => `[${i + 1}] ${b.title} — ${b.section}\n${b.text}`).join("\n\n");
  return {
    run,
    citations,
    context,
    summary: {
      wape: P.wape,
      naiveWape: P.naiveWape,
      plans: run.plans.map((p) => ({
        id: p.id,
        name: cfg.plans.find((x) => x.id === p.id)!.name,
        fillRate: p.fillRate,
        fillRateP10: p.fillRateP10,
        totalCost: p.cost.total,
        violations: p.violations.length,
        constraintFit: p.constraintFit,
      })),
    },
  };
}

export function analystSystem(lang: "en" | "ar") {
  return [
    "You are the NARVO planning analyst working for Raseen Building Materials Trading LLC (RBM), supporting Joseph Abraham, Supply Chain & Planning Manager.",
    "You explain replenishment plan trade-offs using ONLY the numbered computed facts provided. Never invent numbers; every figure you state must appear in the facts, and cite it with its marker like [2] or [3][5].",
    "The figures were computed by the planning engine (forecast + Monte Carlo simulation); you do not recompute them. If something is not in the facts, say it is not computed.",
    "Be decisive and concise, like a senior planner briefing a manager: short paragraphs or bullets, no filler.",
    lang === "ar"
      ? "Write in Arabic (Modern Standard Arabic, professional business register). Keep SKU codes, plan letters (A/B/C) and numbers in Latin characters."
      : "Write in English (British spelling).",
  ].join("\n");
}
