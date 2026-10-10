// Seeded generator for RBM weekly sales history (Oct 2023 – Oct 2026) and opening positions.
// Usage: node data/raseen/17-demand-planning/gen-sales.mjs
// Re-running produces identical output (mulberry32 seed 20261011).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const cal = JSON.parse(fs.readFileSync(path.join(dir, "calendar.json"), "utf8"));

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261011);
const gauss = () => {
  let u = 0, v = 0;
  while (u === 0) u = rnd();
  while (v === 0) v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

const DAY = 86400000;
const d = (s) => Date.parse(s + "T00:00:00Z");
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

const START = d("2023-10-02"); // Monday
const WEEKS = 158; // through week commencing 5 Oct 2026

// Monthly shape anchors (mid-month), interpolated by day of year.
const SHAPES = {
  structural: [1.06, 1.07, 1.02, 1.0, 0.99, 0.95, 0.9, 0.9, 0.96, 1.04, 1.1, 1.03],
  finishing: [1.04, 1.03, 1.0, 1.0, 1.0, 0.96, 0.93, 0.94, 0.98, 1.03, 1.06, 1.03],
  roofing: [0.95, 1.05, 1.18, 1.22, 1.12, 0.88, 0.78, 0.8, 0.95, 1.12, 1.1, 0.95],
};
function shapeAt(kind, ms) {
  const dt = new Date(ms);
  const doy = (ms - Date.UTC(dt.getUTCFullYear(), 0, 1)) / DAY; // 0..365
  const pos = doy / 30.4375 - 0.5; // month index at mid-month anchors
  const i0 = Math.floor(pos);
  const f = pos - i0;
  const a = SHAPES[kind][(i0 + 12) % 12];
  const b = SHAPES[kind][(i0 + 13) % 12];
  return a + (b - a) * f;
}

// Fraction of the 6 trading days (Mon–Sat) inside a date range set.
function frac(weekMs, ranges) {
  let n = 0;
  for (let k = 0; k < 6; k++) {
    const day = weekMs + k * DAY;
    if (ranges.some((r) => day >= d(r.from) && day <= d(r.to))) n++;
  }
  return n / 6;
}
function summerFrac(weekMs) {
  let n = 0;
  for (let k = 0; k < 6; k++) {
    const dt = new Date(weekMs + k * DAY);
    const md = dt.toISOString().slice(5, 10);
    if (md >= cal.summerBan.fromMonthDay && md <= cal.summerBan.toMonthDay) n++;
  }
  return n / 6;
}
function holidayFrac(weekMs) {
  let n = 0;
  for (let k = 0; k < 6; k++) {
    const dt = new Date(weekMs + k * DAY);
    const y = dt.getUTCFullYear();
    for (const h of cal.fixedHolidays) {
      const s = d(`${y}-${h.monthDay}`);
      if (dt.getTime() >= s && dt.getTime() < s + h.days * DAY) n++;
    }
  }
  return n / 6;
}

// family, base weekly demand at Oct 2023 [JA, MN], annual growth [JA, MN], noise cv, effects
const SKUS = [
  { sku: "CEM-OPC-50", family: "cement", shape: "structural", base: [38400, 11200], g: [0.05, 0.11], cv: 0.085, ram: -0.22, sum: -0.13, promo: 0.19, dec: 0 },
  { sku: "CEM-SRC-50", family: "cement", shape: "structural", base: [8900, 2600], g: [0.04, 0.09], cv: 0.12, ram: -0.2, sum: -0.12, promo: 0.14, dec: 0 },
  { sku: "RB-B500-12", family: "rebar", shape: "structural", base: [182, 48], g: [0.06, 0.14], cv: 0.11, ram: -0.24, sum: -0.15, promo: 0, dec: 1, lumpy: 0.035 },
  { sku: "RB-B500-16", family: "rebar", shape: "structural", base: [268, 71], g: [0.07, 0.16], cv: 0.1, ram: -0.24, sum: -0.15, promo: 0, dec: 1, lumpy: 0.04 },
  { sku: "RB-B500-20", family: "rebar", shape: "structural", base: [214, 52], g: [0.06, 0.15], cv: 0.11, ram: -0.24, sum: -0.15, promo: 0, dec: 1, lumpy: 0.04 },
  { sku: "RB-B500-25", family: "rebar", shape: "structural", base: [121, 23], g: [0.05, 0.18], cv: 0.14, ram: -0.25, sum: -0.16, promo: 0, dec: 1, lumpy: 0.05 },
  { sku: "BLK-HOL-20", family: "blocks", shape: "structural", base: [96000, 31500], g: [0.03, 0.1], cv: 0.095, ram: -0.21, sum: -0.14, promo: 0, dec: 0 },
  { sku: "TIL-POR-60120", family: "tiles", shape: "finishing", base: [7400, 1650], g: [0.08, 0.12], cv: 0.13, ram: -0.14, sum: -0.06, promo: 0.24, dec: 0 },
  { sku: "TIL-CER-3060", family: "tiles", shape: "finishing", base: [5900, 1300], g: [0.02, 0.06], cv: 0.14, ram: -0.13, sum: -0.05, promo: 0.21, dec: 0 },
  { sku: "SAN-WC-WH", family: "sanitary", shape: "finishing", base: [164, 41], g: [0.04, 0.09], cv: 0.17, ram: -0.12, sum: -0.05, promo: 0, dec: 0 },
  { sku: "WPF-BIT-4", family: "roofing", shape: "roofing", base: [1240, 380], g: [0.03, 0.08], cv: 0.14, ram: -0.18, sum: -0.2, promo: 0.17, dec: 0 },
];
const WH = ["JA", "MN"];
const MARINA_RAMP_START = d("2026-03-02");

const promoWeeks = (family) => new Set(cal.promotions.filter((p) => p.family === family).map((p) => p.week));

const rows = [];
const lastWeeks = {}; // key -> last 8 values
for (const s of SKUS) {
  const promos = promoWeeks(s.family);
  for (let w = 0; w < 2; w++) {
    const key = `${s.sku}|${WH[w]}`;
    lastWeeks[key] = [];
    let carry = 0; // post-promo pull-forward
    for (let t = 0; t < WEEKS; t++) {
      const wk = START + t * 7 * DAY;
      const years = t / 52.18;
      let level = s.base[w] * Math.pow(1 + s.g[w], years);
      if (WH[w] === "MN" && ["rebar", "cement", "blocks"].includes(s.family)) {
        level *= 1 + 0.12 * Math.min(1, Math.max(0, (wk - MARINA_RAMP_START) / (30 * 7 * DAY)));
      }
      const season = shapeAt(s.shape, wk + 3 * DAY);
      const ram = 1 + s.ram * frac(wk, cal.ramadan);
      const eid = 1 - 0.46 * frac(wk, cal.eid);
      const sum = 1 + s.sum * summerFrac(wk);
      const hol = 1 - 0.55 * holidayFrac(wk);
      const isPromo = promos.has(iso(wk));
      const promo = isPromo ? 1 + s.promo : 1 - carry;
      carry = isPromo ? 0.06 : 0;
      let noise = Math.exp(s.cv * gauss() - (s.cv * s.cv) / 2);
      if (s.lumpy && rnd() < s.lumpy) noise *= 1.28 + 0.18 * rnd(); // large project call-off
      let v = level * season * ram * eid * sum * hol * promo * noise;
      v = s.dec ? Math.round(v * 10) / 10 : Math.round(v);
      rows.push(`${iso(wk)},${s.sku},${WH[w]},${v},${isPromo ? 1 : 0}`);
      lastWeeks[key].push(v);
      if (lastWeeks[key].length > 8) lastWeeks[key].shift();
    }
  }
}
fs.writeFileSync(path.join(dir, "sales-weekly.csv"), "week_start,sku,warehouse,units,promo\n" + rows.join("\n") + "\n");

// Opening positions (start of week 12 Oct 2026) — weeks of cover vary by SKU/warehouse.
const COVER = {
  "CEM-OPC-50": [0.55, 0.7], "CEM-SRC-50": [0.95, 1.1],
  "RB-B500-12": [1.25, 1.4], "RB-B500-16": [0.9, null], "RB-B500-20": [1.3, 1.25], "RB-B500-25": [1.85, 1.75],
  "BLK-HOL-20": [0.45, 0.6], "TIL-POR-60120": [4.1, 4.6], "TIL-CER-3060": [4.4, 4.9],
  "SAN-WC-WH": [5.6, 6.1], "WPF-BIT-4": [2.1, 2.4],
};
const LEAD = { cement: 1, rebar: 1, blocks: 1, tiles: 3, sanitary: 4, roofing: 2 };
const positions = {};
for (const s of SKUS) {
  for (let w = 0; w < 2; w++) {
    const key = `${s.sku}|${WH[w]}`;
    const last4 = lastWeeks[key].slice(-4);
    const avg = last4.reduce((a, b) => a + b, 0) / last4.length;
    let onHand;
    if (s.sku === "RB-B500-16" && WH[w] === "MN") onHand = 64; // R5: only 64 t available at MN-05
    else {
      const cover = COVER[s.sku][w] * (0.94 + 0.12 * rnd());
      onHand = avg * cover;
    }
    onHand = s.dec ? Math.round(onHand * 10) / 10 : Math.round(onHand / (s.family === "blocks" ? 60 : s.family === "cement" ? 40 : 1)) * (s.family === "blocks" ? 60 : s.family === "cement" ? 40 : 1);
    // Scheduled receipts already on order (weeks 1..lead). Rebar: Sahara mill maintenance 5–19 Oct.
    const lead = LEAD[s.family];
    const batch = s.family === "blocks" ? 60 : s.family === "cement" ? 40 : 1;
    const pipeline = [];
    for (let k = 1; k <= lead; k++) {
      let q;
      if (s.family === "rebar") q = k === 1 ? 0 : 0; // no Sahara dispatches during maintenance
      else q = avg * (0.9 + 0.2 * rnd());
      q = s.dec ? Math.round(q * 10) / 10 : Math.round(q / batch) * batch;
      pipeline.push(q);
    }
    positions[key] = { onHand, avgLast4: Math.round(avg * 10) / 10, pipeline };
  }
}
fs.writeFileSync(path.join(dir, "positions.json"), JSON.stringify({ asOf: "2026-10-11", note: "Opening on-hand at start of week commencing 12 Oct 2026 (generated, seed 20261011)", positions }, null, 2) + "\n");
console.log(`wrote ${rows.length} rows`);
