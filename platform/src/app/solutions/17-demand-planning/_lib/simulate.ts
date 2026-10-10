/**
 * Scenario engine for 17 — Demand & Resource Planning. Pure TypeScript; runs in the browser for
 * instant what-ifs and on the server for the AI explanation (identical numbers).
 *
 * Each plan is a replenishment policy simulated week by week over the planning horizon against
 * 100 demand sample paths from the forecast (Monte Carlo). For every path and week:
 *   receive arrivals → (plan C) rebalance between warehouses → serve demand (lost sales if short)
 *   → place orders (order-up-to: lead-time cover + safety stock [+ pre-build]) subject to the
 *   Sahara rebar allocation and (plan C) storage limits, redirecting overflow to the other site.
 * Storage use is measured at the start of each week (after receipts, the weekly peak).
 */

import type { Override, PlanResult, PlanRun, PlanSpec, PlanningConfig, Position, ResourceSeries, SeriesForecast, Violation, WhId, WhatIf } from "./types";
import { addWeeks, quantile } from "./forecast";

export interface SimSeries {
  key: string;
  sku: string;
  wh: WhId;
  family: string;
  /** Planning forecast (P50, with overrides and what-if uplift), forecastWeeks long */
  f: number[];
  /** Forecast standard deviation per week (from the P10–P90 spread) */
  sigma: number[];
  /** Demand sample paths [path][week], planWeeks long */
  paths: number[][];
  overridden: boolean;
}

const Z90 = 2.5631; // P90 − P10 = 2.563 σ for a normal distribution

/** Inverse standard normal CDF (Acklam's approximation). */
export function zOf(p: number) {
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const pl = 0.02425;
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - pl) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

export function inUpliftScope(whatIf: WhatIf, sku: string, family: string, wh: WhId, cfg: PlanningConfig) {
  if (whatIf.upliftPct === 0) return false;
  if (whatIf.upliftScope === "all") return true;
  const structural = cfg.families[family]?.structural;
  if (whatIf.upliftScope === "structural") return !!structural;
  // Marina Quarter projects: structural packages delivered from MN-05
  return wh === "MN" && (family === "rebar" || family === "blocks" || sku === "CEM-OPC-50");
}

export function buildSimSeries(series: SeriesForecast[], overrides: Override[], whatIf: WhatIf, cfg: PlanningConfig): SimSeries[] {
  const famOf = new Map(cfg.skus.map((s) => [s.sku, s.family]));
  return series.map((s) => {
    const family = famOf.get(s.sku) ?? "other";
    const mult = inUpliftScope(whatIf, s.sku, family, s.wh, cfg) ? 1 + whatIf.upliftPct / 100 : 1;
    const ovr = overrides.filter((o) => o.key === s.key);
    const ratio = s.forecast.weeks.map((w, h) => {
      const o = ovr.find((x) => x.week === w);
      return o && s.forecast.p50[h] > 0 ? o.value / s.forecast.p50[h] : o ? 1 : 1;
    });
    const f = s.forecast.p50.map((v, h) => {
      const o = ovr.find((x) => x.week === s.forecast.weeks[h]);
      return (o ? o.value : v) * mult;
    });
    const sigma = s.forecast.p50.map((_, h) => ((s.forecast.p90[h] - s.forecast.p10[h]) / Z90) * mult * ratio[h]);
    const paths = s.paths.map((p) => p.map((v, h) => v * mult * ratio[h]));
    return { key: s.key, sku: s.sku, wh: s.wh, family, f, sigma, paths, overridden: ovr.length > 0 };
  });
}

interface SimOpts {
  cfg: PlanningConfig;
  positions: Record<string, Position>;
  series: SimSeries[];
  whatIf: WhatIf;
}

const RESOURCES: Array<{ id: string; wh: WhId; kind: "pallets" | "yard" }> = [
  { id: "JA-pallets", wh: "JA", kind: "pallets" },
  { id: "JA-yard", wh: "JA", kind: "yard" },
  { id: "MN-pallets", wh: "MN", kind: "pallets" },
  { id: "MN-yard", wh: "MN", kind: "yard" },
];

export function runPlans(o: SimOpts): PlanRun {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const { cfg } = o;
  const H = cfg.planWeeks;
  const weeks = Array.from({ length: H }, (_, h) => addWeeks(cfg.planStart, h));
  const plans = cfg.plans.map((p) => simulatePlan(p, o, H, weeks));
  const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
  return { weeks, plans, ms: Math.round(t1 - t0) };
}

function simulatePlan(plan: PlanSpec, o: SimOpts, H: number, weeks: string[]): PlanResult {
  const { cfg, series, whatIf } = o;
  const S = series.length;
  const skuMeta = series.map((s) => cfg.skus.find((k) => k.sku === s.sku)!);
  const isYard = skuMeta.map((m) => !!m.tonnes);
  const per = skuMeta.map((m) => (m.tonnes ? 1 : (m.perPallet ?? 1)));
  const whIdx = series.map((s) => (s.wh === "JA" ? 0 : 1));
  const twin = series.map((s) => series.findIndex((x) => x.sku === s.sku && x.wh !== s.wh));
  const wh = cfg.warehouses;
  const capPallets = [wh[0].palletPositions - whatIf.palletLossJA, wh[1].palletPositions];
  const capYard = [wh[0].rebarYardT - whatIf.yardLossJA, wh[1].rebarYardT];
  const usable = plan.capacityAware ? 0.97 : 1;
  const z = plan.policy === "service" ? zOf(whatIf.serviceTarget) : 0;
  const N = Math.min(...series.map((s) => s.paths.length));
  const c = cfg.costs;

  // Sahara allocation per arrival week, shifted by a mill delay what-if.
  const sahara = cfg.suppliers.sahara;
  const alloc = Array.from({ length: H + 6 }, (_, w) => {
    const src = w - whatIf.millDelayWeeks;
    if (src < 0) return 0;
    if (whatIf.millDelayWeeks > 0 && w < whatIf.millDelayWeeks + 1) return 0;
    const base = sahara.weeklyAllocationT[Math.min(src, sahara.weeklyAllocationT.length - 1)] ?? 0;
    const catchUp = plan.catchUp && sahara.catchUpWeeks.includes(src) ? sahara.catchUpAllocationT : 0;
    return Math.max(base, catchUp);
  });

  // Order-up-to target for series i, decided at end of week t (arrival at t + L).
  const L = skuMeta.map((m) => m.leadWeeks);
  const prebuild = series.map((s) => plan.prebuildFamilies.includes(s.family));
  const target = (i: number, t: number) => {
    const f = series[i].f;
    const at = (k: number) => f[Math.min(k, f.length - 1)] ?? 0;
    let cover = 0;
    let varSum = 0;
    for (let k = 1; k <= L[i]; k++) {
      cover += at(t + k);
      varSum += Math.pow(series[i].sigma[Math.min(t + k, f.length - 1)] ?? 0, 2);
    }
    const ss = plan.policy === "weeks" ? skuMeta[i].currentSsWeeks * at(t + L[i]) : z * Math.sqrt(varSum);
    let pre = 0;
    if (plan.prebuildWeeks > 0 && prebuild[i] && t + L[i] <= 8) {
      for (let k = 1; k <= plan.prebuildWeeks; k++) pre += at(t + L[i] + k);
    }
    return cover + ss + pre;
  };
  const roundBatch = (i: number, q: number) => {
    const b = skuMeta[i].batch || 1;
    return Math.max(0, Math.round(q / b) * b);
  };

  // Accumulators
  const fillPaths: number[] = [];
  const costPaths: number[] = [];
  const skuSales = new Array(S).fill(0);
  const skuDemand = new Array(S).fill(0);
  const skuLost = new Array(S).fill(0);
  const skuStockoutWeeks = new Array(S).fill(0);
  const skuEnd = new Array(S).fill(0);
  const famSales: Record<string, number> = {};
  const famDemand: Record<string, number> = {};
  let holdingSum = 0,
    stockoutSum = 0,
    transferSum = 0,
    overflowSum = 0,
    invValueSum = 0,
    transfersT = 0,
    transfersPal = 0,
    rebarRecv = 0,
    stockoutWeeksTotal = 0;
  const occ: number[][][] = RESOURCES.map(() => Array.from({ length: H }, () => [] as number[]));

  for (let p = 0; p < N; p++) {
    const onHand = series.map((s) => o.positions[s.key]?.onHand ?? 0);
    const arrivals: number[][] = series.map((s) => {
      const arr = new Array(H + 8).fill(0);
      (o.positions[s.key]?.pipeline ?? []).forEach((q, k) => (arr[k] += q));
      return arr;
    });
    let salesVal = 0,
      demandVal = 0,
      hold = 0,
      short = 0,
      trans = 0,
      over = 0;
    const prevExcess = [0, 0, 0, 0];

    for (let t = 0; t < H; t++) {
      // 1. Receipts
      for (let i = 0; i < S; i++) {
        onHand[i] += arrivals[i][t];
        if (isYard[i]) rebarRecv += arrivals[i][t] / N;
      }

      // 2. Rebalancing transfers (plan C) — move surplus over (this week + safety cover) to the twin site.
      if (plan.transfers) {
        for (let i = 0; i < S; i++) {
          const j = twin[i];
          if (j < 0 || i > j) continue;
          for (const [a, b] of [
            [i, j],
            [j, i],
          ]) {
            const needB = series[b].f[t] * 1.15 + z * (series[b].sigma[t] ?? 0) - onHand[b];
            const spareA = onHand[a] - (series[a].f[t] * 1.15 + z * (series[a].sigma[t] ?? 0) + series[a].f[t + 1] * 0.5);
            if (needB > 0 && spareA > 0) {
              let x = Math.min(needB, spareA);
              // respect destination storage
              const dst = whIdx[b];
              const free = isYard[b]
                ? capYard[dst] * usable - yardUse(dst)
                : (capPallets[dst] * usable - palletUse(dst)) * per[b];
              x = Math.max(0, Math.min(x, free));
              if (x > 0) {
                onHand[a] -= x;
                onHand[b] += x;
                if (isYard[b]) {
                  trans += x * c.transferPerTonne;
                  transfersT += x / N;
                } else {
                  trans += (x / per[b]) * c.transferPerPallet;
                  transfersPal += x / per[b] / N;
                }
              }
            }
          }
        }
      }

      // 2b. Capacity relief (plan C): if a site is over its usable limit, shuttle the largest
      //     stock positions to the twin site while it has room.
      if (plan.transfers) {
        for (const w of [0, 1]) {
          for (const kind of ["pallets", "yard"] as const) {
            let over = (kind === "yard" ? yardUse(w) - capYard[w] * usable : palletUse(w) - capPallets[w] * usable);
            if (over <= 0) continue;
            const cand = series
              .map((_, i) => i)
              .filter((i) => whIdx[i] === w && (kind === "yard") === isYard[i] && twin[i] >= 0)
              .sort((a, b) => onHand[b] / per[b] - onHand[a] / per[a]);
            for (const i of cand) {
              if (over <= 0) break;
              const j = twin[i];
              const dst = whIdx[j];
              const room = kind === "yard" ? capYard[dst] * usable - yardUse(dst) : capPallets[dst] * usable - palletUse(dst);
              if (room <= 0) break;
              const movable = Math.max(0, onHand[i] - series[i].f[t] * 1.1);
              const units = Math.min(movable, (kind === "yard" ? Math.min(over, room) : Math.min(over, room) * per[i]));
              if (units <= 0) continue;
              onHand[i] -= units;
              onHand[j] += units;
              const load = kind === "yard" ? units : units / per[i];
              over -= load;
              if (kind === "yard") {
                trans += units * c.transferPerTonne;
                transfersT += units / N;
              } else {
                trans += load * c.transferPerPallet;
                transfersPal += load / N;
              }
            }
          }
        }
      }

      // 3. Storage occupancy at the weekly peak (after receipts)
      const use = [palletUse(0), yardUse(0), palletUse(1), yardUse(1)];
      const caps = [capPallets[0], capYard[0], capPallets[1], capYard[1]];
      use.forEach((u, r) => {
        occ[r][t].push(u);
        const excess = Math.max(0, u - caps[r]);
        if (excess > 0) {
          const kindYard = r % 2 === 1;
          over += kindYard
            ? excess * c.overflowPerTonneWeek + Math.max(0, excess - prevExcess[r]) * c.overflowHandlingPerTonne
            : excess * c.overflowPerPalletWeek + Math.max(0, excess - prevExcess[r]) * c.overflowHandlingPerPallet;
        }
        prevExcess[r] = excess;
      });

      // 4. Demand
      for (let i = 0; i < S; i++) {
        const d = series[i].paths[p][t] ?? 0;
        const sold = Math.min(d, Math.max(0, onHand[i]));
        const lost = d - sold;
        onHand[i] -= sold;
        const m = skuMeta[i];
        salesVal += sold * m.price;
        demandVal += d * m.price;
        skuSales[i] += sold / N;
        skuDemand[i] += d / N;
        skuLost[i] += lost / N;
        if (d > 0 && lost / d > 0.005) {
          skuStockoutWeeks[i] += 1 / N;
          stockoutWeeksTotal += 1 / N;
        }
        famSales[series[i].family] = (famSales[series[i].family] ?? 0) + (sold * m.price) / N;
        famDemand[series[i].family] = (famDemand[series[i].family] ?? 0) + (d * m.price) / N;
        short += lost * (m.price - m.cost + c.stockoutGoodwillPctOfPrice * m.price);
        // holding: capital + storage
        hold += (onHand[i] * m.cost * c.holdingRateAnnual) / 52;
        hold += isYard[i] ? onHand[i] * wh[whIdx[i]].storagePerTonneWeek : (onHand[i] / per[i]) * wh[whIdx[i]].storagePerPalletWeek;
        invValueSum += (onHand[i] * m.cost) / N / H;
      }

      // 5. Orders (arrive at t + L)
      const q = new Array(S).fill(0);
      for (let i = 0; i < S; i++) {
        if (t + L[i] >= H + 6) continue;
        let pipe = 0;
        for (let k = t + 1; k < t + L[i]; k++) pipe += arrivals[i][k];
        q[i] = roundBatch(i, target(i, t) - (onHand[i] + pipe + arrivals[i][t + L[i]]));
      }
      // 5a. Sahara allocation for rebar arriving at t + 1
      const rebarIdx = series.map((_, i) => i).filter((i) => isYard[i]);
      const want = rebarIdx.reduce((s, i) => s + q[i], 0);
      const cap = alloc[t + 1] ?? 0;
      if (want > cap) {
        const k = want > 0 ? cap / want : 0;
        for (const i of rebarIdx) q[i] = Math.floor(q[i] * k * 10) / 10;
      }
      // 5b. Storage-aware clipping and overflow redirection (plan C) for 1-week-lead items
      if (plan.capacityAware) {
        for (const kind of ["pallets", "yard"] as const) {
          const idx = series.map((_, i) => i).filter((i) => L[i] === 1 && (kind === "yard") === isYard[i]);
          const excessUnits: number[] = new Array(S).fill(0);
          for (const w of [0, 1]) {
            const mine = idx.filter((i) => whIdx[i] === w);
            const projected = projectedUse(w, kind, t + 1, q);
            const capW = (kind === "yard" ? capYard[w] : capPallets[w]) * usable;
            if (projected > capW) {
              const orderLoad = mine.reduce((s, i) => s + (kind === "yard" ? q[i] : q[i] / per[i]), 0);
              const cut = Math.min(orderLoad, projected - capW);
              const k = orderLoad > 0 ? 1 - cut / orderLoad : 1;
              for (const i of mine) {
                const nq = roundBatch(i, q[i] * k);
                excessUnits[i] = q[i] - nq;
                q[i] = nq;
              }
            }
          }
          if (plan.transfers) {
            for (const i of idx) {
              if (excessUnits[i] <= 0) continue;
              const j = twin[i];
              if (j < 0) continue;
              const w = whIdx[j];
              const capW = (kind === "yard" ? capYard[w] : capPallets[w]) * usable;
              const free = capW - projectedUse(w, kind, t + 1, q);
              const units = Math.max(0, Math.min(excessUnits[i], kind === "yard" ? free : free * per[j]));
              const r = roundBatch(j, units);
              if (r > 0) {
                q[j] += r;
                trans += kind === "yard" ? r * c.transferPerTonne : (r / per[j]) * c.transferPerPallet;
                if (kind === "yard") transfersT += r / N;
                else transfersPal += r / per[j] / N;
              }
            }
          }
        }
      }
      for (let i = 0; i < S; i++) arrivals[i][t + L[i]] += q[i];
    }

    for (let i = 0; i < S; i++) {
      const avgF = (series[i].f[H] + series[i].f[H + 1] + series[i].f[H + 2] + series[i].f[H + 3]) / 4 || series[i].f[H - 1] || 1;
      skuEnd[i] += onHand[i] / Math.max(1e-9, avgF) / N;
    }
    fillPaths.push(demandVal > 0 ? salesVal / demandVal : 1);
    costPaths.push(hold + short + trans + over);
    holdingSum += hold / N;
    stockoutSum += short / N;
    transferSum += trans / N;
    overflowSum += over / N;

    function palletUse(w: number) {
      let u = wh[w].otherPallets;
      for (let i = 0; i < S; i++) if (whIdx[i] === w && !isYard[i]) u += Math.max(0, onHand[i]) / per[i];
      return u;
    }
    function yardUse(w: number) {
      let u = wh[w].otherYardT ?? 0;
      for (let i = 0; i < S; i++) if (whIdx[i] === w && isYard[i]) u += Math.max(0, onHand[i]);
      return u;
    }
    // Projected start-of-week use at week tt given candidate orders q (expected demand removed).
    function projectedUse(w: number, kind: "pallets" | "yard", tt: number, q: number[]) {
      let u = kind === "yard" ? (wh[w].otherYardT ?? 0) : wh[w].otherPallets;
      for (let i = 0; i < S; i++) {
        if (whIdx[i] !== w || (kind === "yard") !== isYard[i]) continue;
        const units = Math.max(0, onHand[i]) + arrivals[i][tt] + (L[i] === 1 ? q[i] : 0);
        u += kind === "yard" ? units : units / per[i];
      }
      return u;
    }
  }

  const resources: ResourceSeries[] = RESOURCES.map((r, ri) => {
    const capacity = r.kind === "yard" ? capYard[r.wh === "JA" ? 0 : 1] : capPallets[r.wh === "JA" ? 0 : 1];
    const qs = occ[ri].map((arr) => {
      const s = [...arr].sort((a, b) => a - b);
      return [quantile(s, 0.1), quantile(s, 0.5), quantile(s, 0.9)];
    });
    return {
      id: r.id,
      wh: r.wh,
      kind: r.kind,
      capacity,
      p10: qs.map((x) => Math.round(x[0])),
      p50: qs.map((x) => Math.round(x[1])),
      p90: qs.map((x) => Math.round(x[2])),
      peakP50: Math.round(Math.max(...qs.map((x) => x[1]))),
      peakP90: Math.round(Math.max(...qs.map((x) => x[2]))),
    };
  });
  const violations: Violation[] = [];
  RESOURCES.forEach((r, ri) => {
    const res = resources[ri];
    occ[ri].forEach((arr, t) => {
      const prob = arr.filter((u) => u > res.capacity).length / Math.max(1, arr.length);
      if (prob >= 0.5) {
        violations.push({
          week: weeks[t],
          weekIndex: t,
          resource: r.id,
          wh: r.wh,
          kind: r.kind,
          required: res.p50[t],
          capacity: res.capacity,
          excess: Math.max(0, res.p50[t] - res.capacity),
          probability: prob,
        });
      }
    });
  });
  const sortedFill = [...fillPaths].sort((a, b) => a - b);
  const sortedCost = [...costPaths].sort((a, b) => a - b);
  const byFamily: Record<string, number> = {};
  for (const k of Object.keys(famDemand)) byFamily[k] = famDemand[k] > 0 ? famSales[k] / famDemand[k] : 1;

  return {
    id: plan.id,
    fillRate: fillPaths.reduce((a, b) => a + b, 0) / Math.max(1, fillPaths.length),
    fillRateP10: quantile(sortedFill, 0.1),
    fillRateP90: quantile(sortedFill, 0.9),
    bySku: series.map((s, i) => ({
      key: s.key,
      sku: s.sku,
      wh: s.wh,
      fill: skuDemand[i] > 0 ? skuSales[i] / skuDemand[i] : 1,
      lostUnits: skuLost[i],
      stockoutWeeks: skuStockoutWeeks[i],
      endCoverWeeks: skuEnd[i],
    })),
    byFamily,
    cost: {
      holding: holdingSum,
      stockout: stockoutSum,
      transfer: transferSum,
      overflow: overflowSum,
      total: holdingSum + stockoutSum + transferSum + overflowSum,
      totalP10: quantile(sortedCost, 0.1),
      totalP90: quantile(sortedCost, 0.9),
    },
    avgInventoryValue: invValueSum,
    resources,
    violations,
    constraintFit: 1 - violations.length / (RESOURCES.length * H),
    transfersT,
    transfersPallets: transfersPal,
    rebarReceivedT: rebarRecv,
    stockoutWeeks: stockoutWeeksTotal,
  };
}
