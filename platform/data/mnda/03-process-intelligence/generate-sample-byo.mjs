/**
 * Sample "bring your own" event log for solution 03 — MNDA Finance accounts-payable invoices, Aug–Sep 2026.
 * Shows the catalogue example: repeated invoice queries reveal a missing intake check.
 *   node data/mnda/03-process-intelligence/generate-sample-byo.mjs
 * Writes public/demo/03-process-intelligence/sample-invoice-log.csv
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(DIR, "../../../public/demo/03-process-intelligence");
fs.mkdirSync(OUT, { recursive: true });
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r = mulberry32(4141);
const ln = (m, s) => m * Math.exp(s * Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r()));
const SUPPLIERS = [
  ["Al Waha Office Supplies LLC", 9],
  ["Gulf Shield Security Services LLC", 6],
  ["Marsa Print & Signage LLC", 7],
  ["Raseen Facilities Management LLC", 8],
  ["Coastal IT Solutions FZ-LLC", 6],
  ["Noor Catering & Events LLC", 5],
  ["Al Sidr Landscaping LLC", 5],
  ["Desert Pearl Cleaning Services LLC", 4],
];
const DEPTS = ["Facilities & Assets", "Customer Happiness Centre", "Human Capital", "Digital Transformation", "Housing & Community Services", "Field Operations"];
const QUERY = [
  ["PO number missing on invoice", 41],
  ["Supplier TRN missing or invalid", 23],
  ["Invoice addressed to wrong entity name", 14],
  ["Amount differs from PO", 12],
  ["Delivery note not attached", 10],
];
const pick = (arr) => {
  const tot = arr.reduce((a, [, w]) => a + w, 0);
  let x = r() * tot;
  for (const [v, w] of arr) if ((x -= w) <= 0) return v;
  return arr[0][0];
};
const BASE = Date.UTC(2026, 7, 2, 4, 0); // 2 Aug 2026 08:00 GST
let lastEmit = 0;
const iso = (ms) => {
  // keep events inside office hours (07:00–14:59 GST) and in order within a case
  const d = new Date(ms + 4 * 3600000);
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  let local = day + (7 + (d.getUTCHours() % 8)) * 3600000 + d.getUTCMinutes() * 60000;
  if (local <= lastEmit) local = lastEmit + (20 + Math.floor(r() * 90)) * 60000;
  lastEmit = local;
  return new Date(local).toISOString().slice(0, 16).replace("T", " ");
};
const rows = ["case_id,activity,timestamp,supplier,department,amount_aed,query_reason"];
for (let i = 0; i < 318; i++) {
  const id = `MNDA-AP-26-${String(7410 + i).padStart(5, "0")}`;
  lastEmit = 0;
  const sup = pick(SUPPLIERS);
  const dept = DEPTS[Math.floor(r() * DEPTS.length)];
  const amt = Math.round(ln(18500, 0.9) / 10) * 10;
  let t = BASE + Math.floor(r() * 57) * 86400000 + Math.floor(r() * 8) * 3600000;
  const ev = (a, reason = "") => rows.push([id, a, iso(t), `"${sup}"`, `"${dept}"`, amt, reason ? `"${reason}"` : ""].join(","));
  ev("Invoice received");
  t += ln(0.8, 0.5) * 86400000;
  ev("Intake check");
  // no structured intake check: problems surface later at matching, and repeat
  const problem = r() < 0.31 + (sup.startsWith("Marsa Print") || sup.startsWith("Noor Catering") ? 0.25 : 0);
  t += ln(2.2, 0.5) * 86400000;
  ev("Three-way match");
  if (problem) {
    const reason = pick(QUERY);
    const rounds = r() < 0.36 ? 2 : 1;
    for (let k = 0; k < rounds; k++) {
      t += ln(0.3, 0.6) * 86400000;
      ev("Query raised to supplier", k === 0 ? reason : pick(QUERY));
      t += ln(4.8, 0.55) * 86400000;
      ev("Supplier response received");
      t += ln(1.6, 0.5) * 86400000;
      ev("Three-way match");
    }
  }
  t += ln(1.9, 0.6) * 86400000;
  ev("Budget approval");
  t += ln(2.4, 0.5) * 86400000;
  ev("Payment scheduled");
  t += ln(3.1, 0.35) * 86400000;
  if (t < Date.UTC(2026, 9, 9, 18)) ev("Paid");
}
fs.writeFileSync(path.join(OUT, "sample-invoice-log.csv"), rows.join("\n") + "\n");
console.log("rows", rows.length - 1);
