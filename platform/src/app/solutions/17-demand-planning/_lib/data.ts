import "server-only";
import fs from "node:fs";
import { dataPath, readCsv, readJson } from "@/lib/world/data";
import { withOverlay } from "@/lib/store/db";
import { analogueForecast, forecastSeries, type ForecastOptions } from "./forecast";
import type { CalendarDef, ForecastBundle, Override, PlanningConfig, Position, PublishedPlan, SeriesForecast, WhId } from "./types";

export const SLUG = "17-demand-planning";
export const COL_OVERRIDES = `${SLUG}/overrides`;
export const COL_PLANS = `${SLUG}/plans`;
const DIR = "raseen/17-demand-planning";

export function loadConfig(): PlanningConfig {
  return readJson<PlanningConfig>(`${DIR}/config.json`);
}
export function loadCalendar(): CalendarDef {
  return readJson<CalendarDef>(`${DIR}/calendar.json`);
}

export function loadPositions(cfg: PlanningConfig): Record<string, Position> {
  const raw = readJson<{ positions: Record<string, Position> }>(`${DIR}/positions.json`).positions;
  const out: Record<string, Position> = {};
  for (const [k, v] of Object.entries(raw)) out[k] = { onHand: v.onHand, pipeline: v.pipeline ?? [] };
  for (const wh of ["JA", "MN"] as WhId[]) {
    out[`${cfg.launch.sku}|${wh}`] = { onHand: cfg.launch.openingStock[wh], pipeline: cfg.launch.pipeline[wh] };
  }
  return out;
}

const g = globalThis as unknown as { __narvo17?: { sig: string; bundle: ForecastBundle } };

/** Fit all 24 SKU × warehouse forecasts (cached until the seed data changes). */
export function getForecastBundle(): ForecastBundle {
  const files = ["sales-weekly.csv", "config.json", "calendar.json"].map((f) => dataPath(`${DIR}/${f}`));
  const sig = files.map((f) => fs.statSync(f).mtimeMs).join("|") + "|v4";
  if (g.__narvo17?.sig === sig) return g.__narvo17.bundle;

  const t0 = Date.now();
  const cfg = loadConfig();
  const cal = loadCalendar();
  const rows = readCsv(`${DIR}/sales-weekly.csv`);
  const opts: ForecastOptions = {
    cal,
    horizon: cfg.forecastWeeks,
    planWeeks: cfg.planWeeks,
    backtestWeeks: cfg.backtestWeeks,
    nPaths: 500,
    nPlanPaths: 100,
  };
  const grouped = new Map<string, { weeks: string[]; values: number[]; promo: number[] }>();
  for (const r of rows) {
    const key = `${r.sku}|${r.warehouse}`;
    const gq = grouped.get(key) ?? { weeks: [], values: [], promo: [] };
    gq.weeks.push(r.week_start);
    gq.values.push(Number(r.units));
    gq.promo.push(Number(r.promo));
    grouped.set(key, gq);
  }

  const series: SeriesForecast[] = [];
  const fitted = new Map<string, ReturnType<typeof forecastSeries>>();
  for (const sku of cfg.skus) {
    for (const wh of ["JA", "MN"] as WhId[]) {
      const key = `${sku.sku}|${wh}`;
      const gq = grouped.get(key);
      if (!gq) continue;
      const f = forecastSeries({ key, sku: sku.sku, wh, family: sku.family, tonnes: sku.tonnes, ...gq }, opts);
      fitted.set(key, f);
      const { _hw, _cal, ...pub } = f;
      void _hw;
      void _cal;
      series.push(pub);
    }
  }
  // New product (no history): analogue launch curve.
  const L = cfg.launch;
  for (const wh of ["JA", "MN"] as WhId[]) {
    const an = fitted.get(`${L.analogue}|${wh}`);
    if (!an) continue;
    series.push(
      analogueForecast(
        {
          key: `${L.sku}|${wh}`,
          sku: L.sku,
          wh,
          family: "roofing",
          analogue: { hw: an._hw, cal: an._cal },
          launchDate: L.date,
          runRate: L.runRate[wh],
          rampWeeks: L.rampWeeks,
          preOrders: L.preOrders[wh],
          levelCv: L.levelCv,
          weeklyCv: L.weeklyCv,
          firstWeek: cfg.planStart,
        },
        opts,
      ),
    );
  }

  // Portfolio accuracy (value-weighted WAPE across SKUs with history)
  let absErr = 0,
    absNaive = 0,
    vol = 0,
    cov = 0,
    nb = 0,
    mapeSum = 0,
    naiveSum = 0;
  for (const s of series) {
    if (!s.backtest) continue;
    const price = cfg.skus.find((k) => k.sku === s.sku)!.price;
    s.backtest.actual.forEach((a, i) => {
      absErr += Math.abs(a - s.backtest!.model[i]) * price;
      absNaive += Math.abs(a - s.backtest!.naive[i]) * price;
      vol += a * price;
    });
    cov += s.backtest.coverage;
    mapeSum += s.backtest.mape;
    naiveSum += s.backtest.naiveMape;
    nb++;
  }
  const bundle: ForecastBundle = {
    generatedAt: Date.now(),
    computeMs: Date.now() - t0,
    series,
    portfolio: {
      wape: absErr / vol,
      naiveWape: absNaive / vol,
      meanMape: mapeSum / nb,
      meanNaiveMape: naiveSum / nb,
      coverage: cov / nb,
      seriesCount: series.length,
    },
  };
  g.__narvo17 = { sig, bundle };
  return bundle;
}

export function loadOverrides(): Override[] {
  return withOverlay<Override>(COL_OVERRIDES, []).filter((o) => !(o as Override & { deleted?: boolean }).deleted);
}

export function loadPublished(): PublishedPlan[] {
  const seed = readJson<PublishedPlan[]>(`${DIR}/published-plans.json`);
  return withOverlay<PublishedPlan>(COL_PLANS, seed).sort((a, b) => b.version - a.version);
}
