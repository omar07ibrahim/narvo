// Seeded generator for RFM Connect work-order history (Jul–Oct 2026) and the CH-02 BMS log.
// Usage: node data/raseen/19-field-service/gen-history.mjs   (deterministic, seed 4471)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const assets = JSON.parse(fs.readFileSync(path.join(dir, "assets.json"), "utf8"));
let s = 4471;
const rnd = () => {
  s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (a) => a[Math.floor(rnd() * a.length)];
const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

/* ── BMS log for AGCC-CH-02: daily max ambient and A21 trips (Sep–Oct 2026) ── */
const tripsSep = [
  ["2026-09-02", "14:12", 46.1], ["2026-09-03", "13:48", 45.7], ["2026-09-04", "15:06", 46.8], ["2026-09-08", "14:31", 45.2],
  ["2026-09-09", "13:22", 44.6], ["2026-09-11", "14:55", 45.9], ["2026-09-15", "15:40", 44.4], ["2026-09-17", "14:48", 46.1],
  ["2026-09-18", "13:57", 45.0], ["2026-09-24", "14:03", 45.2], ["2026-09-24", "14:19", 45.3],
];
const tripsOct = [["2026-10-01", "14:26", 44.2], ["2026-10-06", "15:11", 43.9], ["2026-10-09", "14:05", 43.8], ["2026-10-09", "14:21", 43.7], ["2026-10-09", "14:37", 43.6]];
const daily = [];
for (let t = Date.parse("2026-09-01"); t <= Date.parse("2026-10-10"); t += DAY) {
  const d = iso(t);
  const dayIdx = (t - Date.parse("2026-09-01")) / DAY;
  const trend = 46.2 - dayIdx * 0.13; // cooling into October
  let max = trend + (rnd() - 0.5) * 3.2;
  const trip = [...tripsSep, ...tripsOct].filter((x) => x[0] === d);
  if (trip.length) max = Math.max(max, Math.max(...trip.map((x) => x[2])) + 0.3 + rnd() * 0.6);
  else if (max > 44.2 && d <= "2026-09-30") max = 43.4 + rnd() * 0.7; // no trip ⇒ stayed below the trip zone
  daily.push({ date: d, maxAmbientC: Math.round(max * 10) / 10, trips: trip.length });
}
const trips = [...tripsSep, ...tripsOct].map(([date, time, amb], i) => ({
  id: `A21-${date.replace(/-/g, "")}-${time.replace(":", "")}`,
  date,
  time,
  alarm: "A21 High discharge pressure — transducer trip",
  circuit: "B",
  ambientC: amb,
  dischargeKpa: Math.round(1890 + rnd() * 26),
  loadPct: Math.round(78 + rnd() * 20),
  lockout: date === "2026-09-24" ? i === 10 : date === "2026-10-09" ? time === "14:37" : false,
}));
fs.writeFileSync(
  path.join(dir, "bms-ch02.json"),
  JSON.stringify({ asset: "AGCC-CH-02", source: "AGCC BMS trend export (RFM Connect integration)", daily, trips }, null, 2) + "\n",
);

/* ── Work-order history (Jul – 9 Oct 2026), excluding jobs listed in jobs.json ── */
const PILOT = Date.parse("2026-09-21");
const techs = { HVAC: ["T-0417", "T-0522"], Pump: ["T-0388"], Fire: ["T-0705"], Elec: ["T-0611"], Lift: ["T-0611"] };
const templates = {
  Chiller: { ppm: ["Quarterly chiller PPM", "Chiller oil & refrigerant check"], reactive: ["Chiller alarm A31 condenser fan fail", "Low chilled-water flow alarm", "Chiller compressor current imbalance"], tech: "HVAC" },
  AHU: { ppm: ["Monthly AHU PPM", "AHU filter change"], reactive: ["Zone too warm", "AHU drain pan overflow", "AHU fan belt noise"], tech: "HVAC" },
  Pump: { ppm: ["Pump PPM — vibration & seals"], reactive: ["Pump noisy", "Pump seal weeping"], tech: "Pump" },
  "Fire pump": { ppm: ["Weekly fire pump run test"], reactive: ["Jockey pump frequent starts", "Diesel pump battery alarm"], tech: "Fire" },
  Lift: { ppm: ["Monthly lift PPM (subcontractor)"], reactive: ["Lift door fault", "Lift levelling error"], tech: "Lift" },
  "Split unit": { ppm: ["Quarterly split PPM"], reactive: ["Unit not cooling", "Water leak from indoor unit"], tech: "HVAC" },
  "Emergency lighting": { ppm: ["Monthly emergency lighting test"], reactive: ["Exit sign not lit"], tech: "Elec" },
};
const history = [];
let n = 3610;
for (let t = Date.parse("2026-07-01"); t <= Date.parse("2026-10-09"); t += DAY) {
  const k = rnd() < 0.55 ? 1 : rnd() < 0.5 ? 2 : 0;
  for (let j = 0; j < k; j++) {
    const a = pick(assets.filter((x) => x.id !== "AGCC-CH-02"));
    const tpl = templates[a.type];
    if (!tpl) continue;
    const reactive = rnd() < 0.42;
    const ai = t >= PILOT;
    const prep = ai ? 4 + Math.round(rnd() * 5) : 27 + Math.round(rnd() * 17);
    const compl = ai ? 0.86 + Math.round(rnd() * 12) / 100 : 0.5 + Math.round(rnd() * 26) / 100;
    const ftf = reactive ? (ai ? rnd() < 0.86 : rnd() < 0.7) : null;
    history.push({
      id: `JOB-RFM-26-0${n++}`,
      date: iso(t),
      site: a.site,
      asset: a.id,
      type: reactive ? "Reactive" : "PPM",
      title: reactive ? pick(tpl.reactive) : pick(tpl.ppm),
      technician: pick(techs[tpl.tech]),
      prepMode: ai ? "ai" : "manual",
      prepMinutes: prep,
      reportCompleteness: Math.min(1, Math.round(compl * 1000) / 1000),
      firstTimeFix: ftf,
      partsRelatedRepeat: reactive && ftf === false ? rnd() < 0.45 : false,
    });
  }
}
// Authored CH-02 history (the storyline)
const ch02 = [
  { id: "JOB-RFM-26-02977", date: "2026-02-11", type: "PPM", title: "Condenser coil cleaning CH-01 & CH-02 (6-monthly, winter)", technician: "T-0417", summary: "Approach after cleaning 12.4 K (CH-02 circuit B). Fins in good condition.", prepMode: "manual", prepMinutes: 31, reportCompleteness: 0.8, firstTimeFix: null },
  { id: "JOB-RFM-26-03196", date: "2026-03-17", type: "PPM", title: "Quarterly chiller PPM — CH-02", technician: "T-0417", summary: "All readings normal. Circuit B subcooling 6.1 K, fan currents 4.6–4.9 A.", prepMode: "manual", prepMinutes: 36, reportCompleteness: 0.825, firstTimeFix: null },
  { id: "JOB-RFM-26-03344", date: "2026-05-12", type: "PPM", title: "Condenser coil cleaning CH-01 & CH-02 (3-monthly, summer)", technician: "T-0417", summary: "Heavy dust and feathers on west face of CH-02; grease film near kitchen exhaust. Approach circuit B 19.5 K before → 13.2 K after.", prepMode: "manual", prepMinutes: 34, reportCompleteness: 0.775, firstTimeFix: null },
  { id: "JOB-RFM-26-03518", date: "2026-06-16", type: "PPM", title: "Quarterly chiller PPM — CH-02", technician: "T-0522", summary: "Readings within range at 41 °C ambient (approach 15.8 K circuit B). Condenser fan CB-F5 bearing 'slight rumble' noted — monitor. Fan CB-F5 current 5.2 A (others 4.6–4.9 A).", prepMode: "manual", prepMinutes: 29, reportCompleteness: 0.7, firstTimeFix: null },
  { id: "JOB-RFM-26-03905", date: "2026-08-15", type: "PPM", title: "Condenser coil cleaning CH-01 & CH-02 — deferred", technician: "T-0417", summary: "Not carried out: coated coils need pH-neutral cleaner, chemical approval pending with HSE. Re-planned as JOB-RFM-26-04412.", prepMode: "manual", prepMinutes: 12, reportCompleteness: 0.55, firstTimeFix: null },
].map((h) => ({ ...h, site: "AGCC", asset: "AGCC-CH-02", partsRelatedRepeat: false }));
const all = [...history, ...ch02].sort((a, b) => b.date.localeCompare(a.date));
fs.writeFileSync(path.join(dir, "history.json"), JSON.stringify(all, null, 1) + "\n");
console.log(`bms days ${daily.length}, trips ${trips.length}, history ${all.length}`);
