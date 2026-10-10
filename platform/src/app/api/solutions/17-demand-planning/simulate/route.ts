import { readBody } from "@/lib/ai/stream";
import { getForecastBundle, loadConfig, loadOverrides, loadPositions } from "@/app/solutions/17-demand-planning/_lib/data";
import { buildSimSeries, runPlans } from "@/app/solutions/17-demand-planning/_lib/simulate";
import { DEFAULT_WHATIF, type WhatIf } from "@/app/solutions/17-demand-planning/_lib/types";

/** Run the three replenishment plans for a what-if (JSON). Same engine the browser uses. */
export async function POST(req: Request) {
  try {
    const body = await readBody<{ whatIf?: Partial<WhatIf>; detail?: boolean }>(req);
    const whatIf: WhatIf = { ...DEFAULT_WHATIF, ...(body.whatIf ?? {}) };
    const cfg = loadConfig();
    const bundle = getForecastBundle();
    const sim = buildSimSeries(bundle.series, loadOverrides(), whatIf, cfg);
    const run = runPlans({ cfg, positions: loadPositions(cfg), series: sim, whatIf });
    if (body.detail) return Response.json({ whatIf, portfolio: bundle.portfolio, computeMs: bundle.computeMs, run });
    return Response.json({
      whatIf,
      portfolio: bundle.portfolio,
      forecastComputeMs: bundle.computeMs,
      simulateMs: run.ms,
      plans: run.plans.map((p) => ({
        id: p.id,
        fillRate: +p.fillRate.toFixed(4),
        fillRateP10: +p.fillRateP10.toFixed(4),
        byFamily: Object.fromEntries(Object.entries(p.byFamily).map(([k, v]) => [k, +v.toFixed(4)])),
        cost: Object.fromEntries(Object.entries(p.cost).map(([k, v]) => [k, Math.round(v)])),
        peaks: p.resources.map((r) => ({ id: r.id, cap: r.capacity, p50: r.peakP50, p90: r.peakP90 })),
        violations: p.violations.length,
        constraintFit: +p.constraintFit.toFixed(3),
        transfersT: Math.round(p.transfersT),
        transfersPallets: Math.round(p.transfersPallets),
        rebarReceivedT: Math.round(p.rebarReceivedT),
      })),
    });
  } catch (e) {
    return new Response((e as Error).message, { status: 500 });
  }
}

export async function GET() {
  try {
    const bundle = getForecastBundle();
    return Response.json({
      portfolio: bundle.portfolio,
      computeMs: bundle.computeMs,
      series: bundle.series.map((s) => ({
        key: s.key,
        method: s.method,
        params: s.params,
        effects: s.effects,
        residualCv: s.residualCv,
        mape: s.backtest?.mape,
        naiveMape: s.backtest?.naiveMape,
        coverage: s.backtest?.coverage,
        p50: s.forecast.p50.slice(0, 13),
      })),
    });
  } catch (e) {
    return new Response((e as Error).message, { status: 500 });
  }
}
