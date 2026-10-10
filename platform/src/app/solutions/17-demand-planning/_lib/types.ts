/** Shared types for 17 — Demand & Resource Planning (client + server). */

export type WhId = "JA" | "MN";

export interface SkuMeta {
  sku: string;
  name: string;
  name_ar: string;
  family: string;
  unit: string;
  unit_ar: string;
  perPallet?: number;
  tonnes?: boolean;
  price: number;
  cost: number;
  supplier: string;
  leadWeeks: number;
  batch: number;
  currentSsWeeks: number;
  newProduct?: boolean;
}

export interface WarehouseMeta {
  id: WhId;
  name: string;
  name_ar: string;
  palletPositions: number;
  otherPallets: number;
  rebarYardT: number;
  /** Rebar sizes outside the planned range (8/10/32 mm, mesh) occupying the yard */
  otherYardT?: number;
  storagePerPalletWeek: number;
  storagePerTonneWeek: number;
}

export interface PlanSpec {
  id: "A" | "B" | "C";
  name: string;
  name_ar: string;
  summary: string;
  summary_ar: string;
  policy: "weeks" | "service";
  prebuildWeeks: number;
  prebuildFamilies: string[];
  catchUp: boolean;
  capacityAware: boolean;
  transfers: boolean;
}

export interface PlanningConfig {
  company: string;
  planner: { name: string; title: string; title_ar: string };
  historyFrom: string;
  historyTo: string;
  planStart: string;
  planWeeks: number;
  forecastWeeks: number;
  backtestWeeks: number;
  warehouses: WarehouseMeta[];
  families: Record<string, { en: string; ar: string; structural: boolean }>;
  skus: SkuMeta[];
  launch: {
    sku: string;
    date: string;
    analogue: string;
    runRate: Record<WhId, number>;
    rampWeeks: number;
    preOrders: Record<WhId, number>;
    preOrderAccounts: number;
    levelCv: number;
    weeklyCv: number;
    openingStock: Record<WhId, number>;
    pipeline: Record<WhId, number[]>;
    note: string;
  };
  suppliers: {
    sahara: {
      name: string;
      maintenance: string;
      weeklyAllocationT: number[];
      catchUpAllocationT: number;
      catchUpWeeks: number[];
      catchUpNote: string;
    };
  };
  costs: {
    holdingRateAnnual: number;
    stockoutGoodwillPctOfPrice: number;
    transferPerPallet: number;
    transferPerTonne: number;
    overflowPerPalletWeek: number;
    overflowHandlingPerPallet: number;
    overflowPerTonneWeek: number;
    overflowHandlingPerTonne: number;
  };
  plans: PlanSpec[];
  history: { overrideRateByCycle: Array<{ cycle: string; rate: number }>; legacyMape: number; legacyMethod: string };
}

export interface CalendarDef {
  ramadan: Array<{ from: string; to: string }>;
  eid: Array<{ name: string; from: string; to: string }>;
  summerBan: { fromMonthDay: string; toMonthDay: string; label: string };
  promotions: Array<{ family: string; week: string; name: string }>;
  fixedHolidays: Array<{ name: string; monthDay: string; days: number }>;
}

export interface Position {
  onHand: number;
  pipeline: number[];
}

export interface CalendarEffects {
  ramadan: number;
  eid: number;
  summer: number;
  holiday: number;
  promo: number;
}

export interface Backtest {
  weeks: string[];
  actual: number[];
  model: number[];
  naive: number[];
  p10: number[];
  p90: number[];
  mape: number;
  naiveMape: number;
  coverage: number;
}

export interface SeriesForecast {
  key: string;
  sku: string;
  wh: WhId;
  method: "hw" | "analogue";
  params?: { alpha: number; beta: number; gamma: number; phi: number };
  effects?: CalendarEffects;
  residualCv: number;
  history: { weeks: string[]; values: number[]; promo: number[] };
  forecast: { weeks: string[]; p10: number[]; p50: number[]; p90: number[]; notes: string[] };
  backtest?: Backtest;
  /** Demand sample paths for the planning horizon: paths[p][h] */
  paths: number[][];
}

export interface ForecastBundle {
  generatedAt: number;
  computeMs: number;
  series: SeriesForecast[];
  portfolio: { wape: number; naiveWape: number; meanMape: number; meanNaiveMape: number; coverage: number; seriesCount: number };
}

export interface Override {
  id: string;
  key: string;
  week: string;
  original: number;
  value: number;
  reason: string;
  by: string;
  ts: number;
}

export interface WhatIf {
  upliftPct: number;
  upliftScope: "mq" | "structural" | "all";
  palletLossJA: number;
  yardLossJA: number;
  millDelayWeeks: number;
  serviceTarget: number;
}

export const DEFAULT_WHATIF: WhatIf = {
  upliftPct: 0,
  upliftScope: "mq",
  palletLossJA: 0,
  yardLossJA: 0,
  millDelayWeeks: 0,
  serviceTarget: 0.975,
};

export interface ResourceSeries {
  id: string;
  wh: WhId;
  kind: "pallets" | "yard";
  capacity: number;
  p10: number[];
  p50: number[];
  p90: number[];
  peakP50: number;
  peakP90: number;
}

export interface Violation {
  week: string;
  weekIndex: number;
  resource: string;
  wh: WhId;
  kind: "pallets" | "yard";
  required: number;
  capacity: number;
  excess: number;
  probability: number;
}

export interface PlanResult {
  id: PlanSpec["id"];
  fillRate: number;
  fillRateP10: number;
  fillRateP90: number;
  bySku: Array<{ key: string; sku: string; wh: WhId; fill: number; lostUnits: number; stockoutWeeks: number; endCoverWeeks: number }>;
  byFamily: Record<string, number>;
  cost: { holding: number; stockout: number; transfer: number; overflow: number; total: number; totalP10: number; totalP90: number };
  avgInventoryValue: number;
  resources: ResourceSeries[];
  violations: Violation[];
  constraintFit: number;
  transfersT: number;
  transfersPallets: number;
  rebarReceivedT: number;
  stockoutWeeks: number;
}

export interface PlanRun {
  weeks: string[];
  plans: PlanResult[];
  ms: number;
}
