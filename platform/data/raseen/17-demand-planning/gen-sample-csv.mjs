// Seeded sample for the "Your data" tab: daily trade-counter sales at RBM's Al Noor branch (MN-05),
// two items, 1 Jan 2024 – 9 Oct 2026, Sundays closed. Output: public/demo/17-demand-planning/al-noor-branch-daily-sales.csv
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const dir = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(dir, "../../../public/demo/17-demand-planning/al-noor-branch-daily-sales.csv");
let a = 9071;
const rnd = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const g = () => Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());
const ram = [["2024-03-11","2024-04-09"],["2025-03-01","2025-03-30"],["2026-02-18","2026-03-19"]];
const rows = ["date,item,bags_sold"];
for (let t = Date.parse("2024-01-01"); t <= Date.parse("2026-10-09"); t += 86400000) {
  const d = new Date(t); const dow = d.getUTCDay(); if (dow === 0) continue;
  const iso = d.toISOString().slice(0, 10); const m = d.getUTCMonth();
  const yrs = (t - Date.parse("2024-01-01")) / (365.25 * 86400000);
  const season = [1.06,1.07,1.02,1.0,0.99,0.94,0.88,0.89,0.96,1.05,1.1,1.02][m];
  const inRam = ram.some(([f, e]) => iso >= f && iso <= e) ? 0.78 : 1;
  const sat = dow === 6 ? 0.62 : 1;
  const summer = iso.slice(5) >= "06-15" && iso.slice(5) <= "09-15" ? 0.9 : 1;
  const opc = 182 * Math.pow(1.09, yrs) * season * inRam * sat * summer * Math.exp(0.16 * g());
  const adh = 64 * Math.pow(1.14, yrs) * (0.5 + 0.5 * season) * inRam * sat * Math.exp(0.22 * g());
  rows.push(`${iso},OPC cement 50kg,${Math.round(opc)}`);
  rows.push(`${iso},Tile adhesive C2TE 25kg,${Math.round(adh)}`);
}
fs.writeFileSync(out, rows.join("\n") + "\n");
console.log("wrote", rows.length - 1, "rows to", out);
