/**
 * Generator — MNDA performance facts for the Director-General review (solution 02).
 *
 *   node data/mnda/03-process-intelligence/generate.mjs        (permit event log — read here)
 *   node data/mnda/20-facility-intelligence/generate.mjs       (Al Ghaf complaints — read here)
 *   node data/mnda/02-decision-intelligence/generate.mjs
 *
 * Writes:
 *   daily.csv    — one row per day 1 Jan – 9 Oct 2026 with additive base measures (counts, sums, numerators,
 *                  denominators, stocks). Every KPI for any week/month/quarter is computed from these in code.
 *   permits.csv  — one row per building-permit application (Jan–May synthetic, Jun–Oct derived from the
 *                  solution-03 event log) so medians / rework / NOC hold are exact for any period.
 * Monthly totals are allocated to days exactly (largest remainder) so canonical WORLD.md figures hold:
 *   housing applications Aug 443 · Sep 612 · 1–9 Oct 214 · Sep incomplete 251 · backlog 9 Oct 1,184 ·
 *   Sep resolution 19.4 d · Sep touches 2.3 · CHC Sep 28,940 (+31% vs Aug 22,090), phone 61% / WA 24% / app 11% /
 *   email 4%, wait 6:40, abandonment 14.2%, FCR 61%, repeat 34%, cost AED 18.40 · Q3 inspections 2,316 /
 *   violations 412 · Al Ghaf comfort complaints Aug–Sep 23.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, "..");
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r = mulberry32(2026041);
const gauss = () => {
  let u = 0, v = 0;
  while (u === 0) u = r();
  while (v === 0) v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const pad = (n) => String(n).padStart(2, "0");

/* ───────────── calendar ───────────── */
const dates = [];
for (let t = Date.UTC(2026, 0, 1); t <= Date.UTC(2026, 9, 9); t += 86400000) {
  const d = new Date(t);
  dates.push({
    iso: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    m: d.getUTCMonth(), // 0-based
    dow: d.getUTCDay(),
  });
}
// UAE public holidays 2026 (approximate lunar dates)
const HOL = new Set([
  "2026-01-01",
  "2026-03-19", "2026-03-20", "2026-03-21", "2026-03-22", // Eid Al Fitr
  "2026-05-25", "2026-05-26", "2026-05-27", "2026-05-28", "2026-05-29", // Arafat + Eid Al Adha
  "2026-06-16", // Islamic New Year
  "2026-08-25", // Prophet's Birthday
]);
const isRamadan = (iso) => iso >= "2026-02-18" && iso <= "2026-03-18";
const work = (d) => d.dow >= 1 && d.dow <= 5 && !HOL.has(d.iso);
const workW = (d) => (!work(d) ? 0 : d.dow === 5 ? 0.55 : 1) * (isRamadan(d.iso) ? 0.82 : 1);

/** Allocate an exact integer total across the days of a month with noisy weights. */
function allocate(total, idx, wf, noise = 0.12) {
  const w = idx.map((i) => Math.max(0, wf(dates[i], i) * (1 + noise * gauss())));
  const sum = w.reduce((a, b) => a + b, 0) || 1;
  const raw = w.map((x) => (x / sum) * total);
  const out = raw.map(Math.floor);
  let rem = Math.round(total - out.reduce((a, b) => a + b, 0));
  raw
    .map((x, k) => [x - Math.floor(x), k])
    .sort((a, b) => b[0] - a[0])
    .slice(0, rem)
    .forEach(([, k]) => out[k]++);
  return out;
}
const monthIdx = (m) => dates.map((d, i) => [d, i]).filter(([d]) => d.m === m).map(([, i]) => i);
const MONTHS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

const col = {};
const set = (name, m, values) => {
  col[name] ??= new Array(dates.length).fill(0);
  monthIdx(m).forEach((i, k) => (col[name][i] = values[k]));
};

/* ───────────── Housing (S1) ───────────── */
const H = {
  received: [402, 371, 318, 431, 418, 397, 412, 443, 612, 214],
  incomplete: [72, 70, 61, 79, 74, 71, 76, 93, 251, 84],
  closed: [395, 362, 309, 428, 409, 401, 418, 431, 298, 86],
  resAvg: [11.6, 12.1, 13.4, 11.2, 11.8, 11.5, 11.9, 12.6, 19.4, 21.7],
  touchAvg: [1.42, 1.45, 1.51, 1.4, 1.44, 1.41, 1.43, 1.58, 2.3, 2.4],
};
for (const m of MONTHS) {
  const idx = monthIdx(m);
  // applications come via the app (weekends too); the September surge front-loads after 1 Sep
  const rec = allocate(H.received[m], idx, (d) => (work(d) ? (d.dow === 5 ? 0.7 : 1) : 0.22) * (m === 8 ? 1.25 - (Number(d.iso.slice(8)) / 30) * 0.35 : 1));
  set("hg_received", m, rec);
  // incomplete files follow received volume (detected at first review)
  set("hg_incomplete", m, allocate(H.incomplete[m], idx, (d, i) => rec[idx.indexOf(i)] + 0.01, 0.25));
  const cl = allocate(H.closed[m], idx, workW, 0.18);
  set("hg_closed", m, cl);
  const resTot = Math.round(H.resAvg[m] * H.closed[m]);
  set("hg_res_days", m, allocate(resTot, idx, (d, i) => cl[idx.indexOf(i)] * (m >= 8 ? 1 + (i - idx[0]) / 90 : 1), 0.15));
  const tTot = Math.round(H.touchAvg[m] * H.closed[m]);
  set("hg_touches", m, allocate(tTot, idx, (d, i) => cl[idx.indexOf(i)], 0.1));
}
{
  let b = 703; // open cases on 31 Dec 2025 (→ 742 on 31 Aug, 1,056 on 30 Sep, 1,184 on 9 Oct)
  col.hg_backlog = dates.map((_, i) => (b += col.hg_received[i] - col.hg_closed[i]));
}

/* ───────────── Customer Happiness Centre (S5) ───────────── */
const C = {
  contacts: [20410, 19880, 18120, 21050, 20630, 20940, 21370, 22090, 28940, 9460],
  phoneShare: [0.645, 0.643, 0.648, 0.641, 0.64, 0.638, 0.635, 0.63, null, 0.605],
  waShare: [0.205, 0.207, 0.204, 0.21, 0.212, 0.214, 0.218, 0.222, null, 0.245],
  appShare: [0.095, 0.096, 0.094, 0.097, 0.098, 0.099, 0.1, 0.104, null, 0.112],
  abandon: [7.8, 8.4, 9.6, 7.6, 7.9, 8.1, 8.3, 8.9, 14.2, 15.1],
  wait: [236, 251, 288, 229, 240, 247, 278, 310, 400, 432],
  fcr: [72, 71, 69, 72, 71, 71, 70, 68, 61, 59],
  repeat: [24, 25, 26, 24, 24, 25, 25, 27, 34, 36],
  cost: [16.2, 16.4, 17.1, 16.1, 16.3, 16.4, 16.6, 17.1, 18.4, 18.9],
};
for (const m of MONTHS) {
  const idx = monthIdx(m);
  const tot = C.contacts[m];
  let ph, wa, ap, em;
  if (m === 8) [ph, wa, ap, em] = [17653, 6946, 3183, 1158];
  else {
    ph = Math.round(tot * C.phoneShare[m]);
    wa = Math.round(tot * C.waShare[m]);
    ap = Math.round(tot * C.appShare[m]);
    em = tot - ph - wa - ap;
  }
  const dayW = (d) => (work(d) ? (d.dow === 5 ? 0.62 : 1) : 0.28) * (isRamadan(d.iso) ? 0.9 : 1) * (m >= 8 ? 1 + 0.004 * Number(d.iso.slice(8)) : 1);
  const phD = allocate(ph, idx, dayW, 0.08);
  set("chc_phone", m, phD);
  set("chc_whatsapp", m, allocate(wa, idx, (d) => dayW(d) * 0.8 + 0.25, 0.1));
  set("chc_app", m, allocate(ap, idx, (d) => dayW(d) * 0.7 + 0.3, 0.12));
  set("chc_email", m, allocate(em, idx, dayW, 0.15));
  const ab = Math.round((C.abandon[m] / 100) * ph);
  const abD = allocate(ab, idx, (d, i) => phD[idx.indexOf(i)] * (1 + (phD[idx.indexOf(i)] / (ph / idx.length) - 1) * 0.8), 0.15);
  set("chc_abandoned", m, abD);
  const answered = ph - ab;
  set("chc_wait_sec", m, allocate(C.wait[m] * answered, idx, (d, i) => (phD[idx.indexOf(i)] - abD[idx.indexOf(i)]) * (1 + (phD[idx.indexOf(i)] / (ph / idx.length) - 1) * 0.6), 0.1));
  const dayTot = idx.map((i) => col.chc_phone[i] + col.chc_whatsapp[i] + col.chc_app[i] + col.chc_email[i]);
  set("chc_fcr", m, allocate(Math.round((C.fcr[m] / 100) * tot), idx, (d, i) => dayTot[idx.indexOf(i)], 0.04));
  set("chc_repeat7", m, allocate(Math.round((C.repeat[m] / 100) * tot), idx, (d, i) => dayTot[idx.indexOf(i)], 0.06));
  set("chc_cost_aed", m, allocate(Math.round(C.cost[m] * tot), idx, (d, i) => dayTot[idx.indexOf(i)], 0.03));
}

/* ───────────── Complaints (MNDA-SVC-501) ───────────── */
const CMP = { received: [412, 398, 371, 425, 409, 418, 431, 455, 641, 236], ontime: [92, 91, 89, 93, 92, 92, 91, 88, 78, 74] };
for (const m of MONTHS) {
  const idx = monthIdx(m);
  const rec = allocate(CMP.received[m], idx, (d) => (work(d) ? 1 : 0.35), 0.15);
  set("cmp_received", m, rec);
  set("cmp_ontime", m, allocate(Math.round((CMP.ontime[m] / 100) * CMP.received[m]), idx, (d, i) => rec[idx.indexOf(i)], 0.05));
}

/* ───────────── Field inspections (S7) ───────────── */
const INS = { count: [812, 776, 702, 834, 801, 797, 768, 742, 806, 241], viol: [118, 112, 97, 126, 121, 119, 131, 128, 153, 46] };
for (const m of MONTHS) {
  const idx = monthIdx(m);
  const c = allocate(INS.count[m], idx, workW, 0.12);
  set("insp_count", m, c);
  set("insp_violations", m, allocate(INS.viol[m], idx, (d, i) => c[idx.indexOf(i)], 0.3));
}

/* ───────────── Finance — budget execution ───────────── */
const ANNUAL = 1146320000;
const planPct = [6.8, 7.4, 7.9, 8.3, 8.6, 8.9, 8.1, 7.6, 8.4, 9.1];
const execOfPlan = [0.94, 0.91, 0.88, 0.93, 0.92, 0.95, 0.89, 0.86, 0.84, 0.8];
for (const m of MONTHS) {
  const idx = monthIdx(m);
  const monthDays = new Date(Date.UTC(2026, m + 1, 0)).getUTCDate();
  const planM = (ANNUAL * planPct[m]) / 100;
  const planHere = m === 9 ? planM * (idx.length / monthDays) : planM;
  set("fin_plan_aed", m, allocate(Math.round(planHere), idx, workW, 0));
  set("fin_spend_aed", m, allocate(Math.round(planHere * execOfPlan[m]), idx, (d) => workW(d) * (d.iso.slice(8) > "24" ? 1.6 : 1), 0.35));
}

/* ───────────── Facilities ───────────── */
const complaints20 = JSON.parse(fs.readFileSync(path.join(ROOT, "20-facility-intelligence", "complaints.json"), "utf8"));
const agcByDay = {};
const hqByDay = {};
for (const c of complaints20) {
  const day = c.receivedAt.slice(0, 10);
  if (c.site === "AGC") agcByDay[day] = (agcByDay[day] ?? 0) + 1;
  else hqByDay[day] = (hqByDay[day] ?? 0) + 1;
}
const otherComfort = [6, 5, 4, 9, 13, 18, 21, 19, 12, 3]; // other facilities (CHCs, satellite centres)
const ppmDue = [338, 331, 342, 336, 344, 339, 341, 346, 352, 98];
const ppmPct = [97.6, 97.9, 96.8, 97.4, 97.1, 96.9, 96.2, 91.4, 88.7, 90.3];
for (const m of MONTHS) {
  const idx = monthIdx(m);
  const other = allocate(otherComfort[m], idx, (d) => (work(d) ? 1 : 0.6), 0.4);
  set("fm_comfort_agc", m, idx.map((i) => agcByDay[dates[i].iso] ?? 0));
  set("fm_comfort", m, idx.map((i, k) => other[k] + (agcByDay[dates[i].iso] ?? 0) + (hqByDay[dates[i].iso] ?? 0)));
  const due = allocate(ppmDue[m], idx, workW, 0.2);
  set("fm_ppm_due", m, due);
  set("fm_ppm_done", m, allocate(Math.round((ppmPct[m] / 100) * ppmDue[m]), idx, (d, i) => due[idx.indexOf(i)], 0.03));
}

/* ───────────── Human Capital — vacancies (stock) ───────────── */
{
  const path_ = [[0, 61], [31, 58], [59, 57], [90, 55], [120, 54], [151, 56], [181, 59], [212, 57], [243, 55], [281, 53]];
  col.hr_vacancies = dates.map((_, i) => {
    let k = 0;
    while (k < path_.length - 1 && path_[k + 1][0] <= i) k++;
    return path_[k][1];
  });
}

/* ───────────── write daily.csv ───────────── */
const names = Object.keys(col);
const lines = ["date," + names.join(",")];
dates.forEach((d, i) => lines.push([d.iso, ...names.map((n) => col[n][i])].join(",")));
fs.writeFileSync(path.join(DIR, "daily.csv"), lines.join("\n") + "\n");

/* ───────────── permits.csv ───────────── */
const ev = fs.readFileSync(path.join(ROOT, "03-process-intelligence", "events.csv"), "utf8").trim().split("\n");
const hdr = ev[0].split(",");
const parseLine = (l) => {
  const out = [];
  let f = "", q = false;
  for (let i = 0; i < l.length; i++) {
    const ch = l[i];
    if (q) {
      if (ch === '"' && l[i + 1] === '"') { f += '"'; i++; }
      else if (ch === '"') q = false;
      else f += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { out.push(f); f = ""; }
    else f += ch;
  }
  out.push(f);
  return Object.fromEntries(hdr.map((h, i) => [h, out[i]]));
};
const cases = new Map();
for (const l of ev.slice(1)) {
  const e = parseLine(l);
  const c = cases.get(e.case_id) ?? { id: e.case_id, district: e.district, gated: e.gated, cohort: e.cohort, ev: [] };
  c.ev.push(e);
  cases.set(e.case_id, c);
}
const DAYMS = 86400000;
const permits = [];
for (const c of cases.values()) {
  const t = (a) => c.ev.find((e) => e.activity === a)?.timestamp;
  const sub = t("Submitted");
  const iss = t("Permit issued");
  const aw = t("Awaiting master-developer NOC");
  const nr = t("NOC received");
  permits.push({
    id: c.id,
    submitted: sub,
    issued: iss ?? "",
    cycle_days: iss ? ((Date.parse(iss) - Date.parse(sub)) / DAYMS).toFixed(2) : "",
    gated: c.gated,
    district: c.district,
    returned: c.ev.some((e) => e.activity === "Returned to applicant") ? 1 : 0,
    noc_days: aw && nr ? ((Date.parse(nr) - Date.parse(aw)) / DAYMS).toFixed(2) : "",
    source: "03 event log",
  });
}
// Jan–May synthetic (pre-Circular 14/2026: no NOC hold)
const rp = mulberry32(1501);
const monthly = [318, 305, 262, 371, 354];
let seq = 1001;
const GATED = new Set(["MN-03", "MN-06", "MN-08"]);
const DW = [["MN-01", 6], ["MN-02", 13], ["MN-03", 13], ["MN-04", 23], ["MN-05", 7], ["MN-06", 14], ["MN-07", 10], ["MN-08", 14]];
const synth = [];
for (let m = 0; m < 5; m++) {
  const idx = monthIdx(m);
  const per = allocate(monthly[m], idx, (d) => (work(d) ? 1 : 0.3) * (isRamadan(d.iso) ? 0.8 : 1), 0.2);
  idx.forEach((i, k) => {
    for (let n = 0; n < per[k]; n++) {
      const hour = 8 + Math.floor(rp() * 12);
      const sub = Date.parse(`${dates[i].iso}T${pad(hour)}:${pad(Math.floor(rp() * 60))}:00+04:00`);
      let x = rp() * 100, dist = DW[0][0];
      for (const [dd, w] of DW) if ((x -= w) <= 0) { dist = dd; break; }
      const returned = rp() < 0.13 ? 1 : 0;
      const u1 = rp(), u2 = rp();
      const z = Math.sqrt(-2 * Math.log(u1 || 1e-9)) * Math.cos(2 * Math.PI * u2);
      const cyc = 14.6 * Math.exp(0.42 * z) + (returned ? 5.5 : 0) + (GATED.has(dist) ? 1.2 : 0);
      // the Jan–May extract only holds cases closed before the June carry-in starts (issued by 28 Jun)
      const maxCyc = (Date.parse("2026-06-28T13:00:00+04:00") - sub) / DAYMS - rp() * 2;
      synth.push({ sub, dist, returned, cyc: Math.min(cyc, maxCyc) });
    }
  });
}
synth.sort((a, b) => a.sub - b.sub);
const isoLocal = (ms) => {
  const d = new Date(ms + 4 * 3600000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00+04:00`;
};
for (const s of synth) {
  const iss = s.sub + s.cyc * DAYMS;
  permits.push({
    id: `MNDA-BP-2026-${String(seq++).padStart(5, "0")}`,
    submitted: isoLocal(s.sub),
    issued: isoLocal(iss),
    cycle_days: s.cyc.toFixed(2),
    gated: GATED.has(s.dist) ? "yes" : "no",
    district: s.dist,
    returned: s.returned,
    noc_days: "",
    source: "Permits system extract",
  });
}
permits.sort((a, b) => a.id.localeCompare(b.id));
const pk = Object.keys(permits[0]);
fs.writeFileSync(path.join(DIR, "permits.csv"), [pk.join(","), ...permits.map((p) => pk.map((k) => p[k]).join(","))].join("\n") + "\n");

/* ───────────── verification printout ───────────── */
const sumM = (name, m) => monthIdx(m).reduce((a, i) => a + col[name][i], 0);
const lastOf = (name) => col[name][col[name].length - 1];
const med = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const k = s.length >> 1;
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
};
const inRange = (iso, a, b) => iso && iso.slice(0, 10) >= a && iso.slice(0, 10) <= b;
const q3iss = permits.filter((p) => inRange(p.issued, "2026-07-01", "2026-09-30"));
const q3sub = permits.filter((p) => inRange(p.submitted, "2026-07-01", "2026-09-30"));
console.log({
  hgSep: sumM("hg_received", 8),
  hgAug: sumM("hg_received", 7),
  hgOct: sumM("hg_received", 9),
  incSep: sumM("hg_incomplete", 8),
  backlog: lastOf("hg_backlog"),
  resSep: (sumM("hg_res_days", 8) / sumM("hg_closed", 8)).toFixed(2),
  touchSep: (sumM("hg_touches", 8) / sumM("hg_closed", 8)).toFixed(2),
  chcSep: ["chc_phone", "chc_whatsapp", "chc_app", "chc_email"].reduce((a, n) => a + sumM(n, 8), 0),
  chcAug: ["chc_phone", "chc_whatsapp", "chc_app", "chc_email"].reduce((a, n) => a + sumM(n, 7), 0),
  waitSep: (sumM("chc_wait_sec", 8) / (sumM("chc_phone", 8) - sumM("chc_abandoned", 8))).toFixed(1),
  abSep: ((sumM("chc_abandoned", 8) / sumM("chc_phone", 8)) * 100).toFixed(2),
  insQ3: sumM("insp_count", 6) + sumM("insp_count", 7) + sumM("insp_count", 8),
  violQ3: sumM("insp_violations", 6) + sumM("insp_violations", 7) + sumM("insp_violations", 8),
  agcAugSep: sumM("fm_comfort_agc", 7) + sumM("fm_comfort_agc", 8),
  finYtdActualPct: ((col.fin_spend_aed.reduce((a, b) => a + b, 0) / ANNUAL) * 100).toFixed(2),
  finYtdPlanPct: ((col.fin_plan_aed.reduce((a, b) => a + b, 0) / ANNUAL) * 100).toFixed(2),
  permits: permits.length,
  q3Submitted: q3sub.length,
  q3Issued: q3iss.length,
  q3IssuedMedian: med(q3iss.map((p) => +p.cycle_days)).toFixed(2),
  q3CohortMedian: med(q3sub.filter((p) => p.issued).map((p) => +p.cycle_days)).toFixed(2),
  q3Rework: ((q3sub.filter((p) => p.returned).length / q3sub.length) * 100).toFixed(2),
  h1IssuedMedian: med(permits.filter((p) => inRange(p.issued, "2026-01-01", "2026-06-30")).map((p) => +p.cycle_days)).toFixed(2),
});
