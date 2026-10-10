/**
 * Generator — MNDA building-permit event log (solution 03, WORLD storyline S2).
 *
 *   node data/mnda/03-process-intelligence/generate.mjs
 *
 * Reproducible (seeded). Calibrates the simulated log so the computed statistics reproduce the canonical
 * WORLD.md figures for Q3 2026 submissions:
 *   1,047 applications · median cycle 21.6 d (gated 27.9 / non-gated 16.8) · rework 27% ·
 *   return reasons NOC 46% / structural 18% / site-plan 14% / other 22% · NOC hold mean 9.2 d (Lulu 12.4 d) ·
 *   312 permits issued per month in Jul–Sep (carry-in June cases included).
 * Also writes a pilot cohort (1–9 Oct 2026, intake NOC check + parallel NOC request) and ~120 officer notes.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));

/* ───────────── seeded randomness ───────────── */
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const master = mulberry32(140726);
const gauss = (r) => {
  let u = 0, v = 0;
  while (u === 0) u = r();
  while (v === 0) v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const ln = (r, median, sigma) => median * Math.exp(sigma * gauss(r));
const pickW = (r, items) => {
  const tot = items.reduce((a, [, w]) => a + w, 0);
  let x = r() * tot;
  for (const [v, w] of items) if ((x -= w) <= 0) return v;
  return items[items.length - 1][0];
};

/* ───────────── calendar (local GST minutes since 2026-01-01 00:00) ───────────── */
const BASE = Date.UTC(2026, 0, 1);
const DAY = 1440;
const dateMin = (y, m, d, hh = 0, mm = 0) => (Date.UTC(y, m - 1, d, hh, mm) - BASE) / 60000;
const dow = (min) => new Date(BASE + min * 60000).getUTCDay(); // 0 Sun … 6 Sat
const dayStart = (min) => Math.floor(min / DAY) * DAY;
const HOLIDAYS = new Set([dateMin(2026, 8, 25)]); // Prophet's Birthday (approx.)
const END = dateMin(2026, 10, 9, 23, 59);
const iso = (min) => {
  const d = new Date(BASE + Math.round(min) * 60000);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:00+04:00`;
};
const isWorkDay = (min) => {
  const w = dow(min);
  return w >= 1 && w <= 5 && !HOLIDAYS.has(dayStart(min));
};
const dayEnd = (min) => dayStart(min) + (dow(min) === 5 ? 12 * 60 : 15 * 60 + 30);
const dayOpen = (min) => dayStart(min) + 7 * 60 + 30;
/** Snap to the next MNDA working minute; always consumes one random number. */
function workAt(t, r, open = 7.5 * 60) {
  const jitter = r();
  let s = t;
  let moved = false;
  for (let guard = 0; guard < 20; guard++) {
    if (!isWorkDay(s)) {
      s = dayStart(s) + DAY + open;
      moved = true;
      continue;
    }
    const o = dayStart(s) + open;
    if (s < o) {
      s = o;
      moved = true;
    }
    if (s > dayEnd(s) - 10) {
      s = dayStart(s) + DAY + open;
      moved = true;
      continue;
    }
    break;
  }
  if (moved) s = Math.min(s + Math.floor(jitter * 170), dayEnd(s) - 12);
  return s;
}
/** Applicant / portal time: any day, 07:00–23:30. */
function portalAt(t, r) {
  const j = r();
  const h = (t - dayStart(t)) / 60;
  if (h < 7) return dayStart(t) + 7 * 60 + Math.floor(j * 120);
  if (h > 23.5) return dayStart(t) + DAY + 7 * 60 + Math.floor(j * 120);
  return t;
}

/* ───────────── reference data ───────────── */
const DISTRICTS = {
  "MN-01": { name: "Downtown", gated: false, dev: null, w: 6 },
  "MN-02": { name: "Al Murjan", gated: false, dev: null, w: 12 },
  "MN-03": { name: "Al Lulu Island", gated: true, dev: "Lulu Island Developments PJSC", w: 14 },
  "MN-04": { name: "Al Waha Gardens", gated: false, dev: null, w: 21 },
  "MN-05": { name: "Ras Al Marsa Industrial", gated: false, dev: null, w: 7 },
  "MN-06": { name: "Al Sidr Residential", gated: true, dev: "Sidr Communities LLC", w: 15 },
  "MN-07": { name: "Al Ghaf Community", gated: false, dev: null, w: 10 },
  "MN-08": { name: "Marina Quarter", gated: true, dev: "Marina Quarter Properties LLC", w: 15 },
};
const DEV_AR = {
  "Lulu Island Developments PJSC": "شركة جزيرة اللؤلؤ للتطوير ش.م.ع",
  "Sidr Communities LLC": "شركة السدر للمجتمعات ذ.م.م",
  "Marina Quarter Properties LLC": "شركة حي المارينا العقارية ذ.م.م",
};
const CONSULTANTS = [
  ["Al Noor Engineering Consultants", 11],
  ["Gulf Horizon Consulting Engineers", 10],
  ["Dar Al Marsa Engineering Consultancy", 9],
  ["Bayt Al Handasa Consultants", 8],
  ["Meridian Design Studio", 7],
  ["Sahel Engineering Consultants", 7],
  ["Qasr Al Bahr Consulting Engineers", 6],
  ["Coastline Architects & Engineers", 6],
  ["Al Waha Engineering Bureau", 6],
  ["Falcon Line Consulting Engineers", 5],
  ["Arabesque Design Consultants", 5],
  ["Hadeed Partners Engineering", 4],
  ["Bin Ghanim Engineering Consultants", 4],
  ["Mizan Engineering Consultants", 4],
  ["Atlas Structural Consultants", 3],
  ["Dune Architects", 3],
];
const WEAK_STRUCT = new Set(["Dune Architects", "Arabesque Design Consultants", "Coastline Architects & Engineers"]);
const OFFICERS = [
  ["Aisha Khalfan Al Marri", 13],
  ["Saeed Rashid Al Nuaimi", 12],
  ["Reem Abdulla Al Zaabi", 12],
  ["Hamdan Saif Al Ketbi", 11],
  ["Khaled Mansour Haddad", 10],
  ["Latifa Obaid Al Shamsi", 10],
  ["Mohammed Ali Al Hosani", 9],
  ["Priya Nair", 8],
  ["Ahmed Fathy Abdelrahman", 8],
];
const INTAKE = ["Noor Hamad Al Ali", "Faisal Juma Al Rumaithi", "Mariam Khalid Al Blooshi"];
const STRUCTURAL = ["Priya Nair", "Ahmed Fathy Abdelrahman", "Hamdan Saif Al Ketbi"];
const OTHER_REASONS = [
  ["Fee payment pending", 18],
  ["Title deed / ownership document missing", 16],
  ["Soil investigation report missing", 14],
  ["Plot number mismatch on drawings", 12],
  ["Consultant registration expired", 10],
  ["GFA calculation sheet missing", 12],
];
const REASON_LABEL = {
  noc: "NOC missing or expired",
  struct: "Structural calculations not stamped",
  site: "Site-plan version mismatch",
};

function buildingFor(r, district) {
  if (district === "MN-05") return pickW(r, [["Warehouse / industrial", 8], ["Commercial", 1]]);
  if (district === "MN-08") return pickW(r, [["Residential building", 6], ["Commercial", 3], ["Villa", 1]]);
  if (district === "MN-01") return pickW(r, [["Commercial", 5], ["Residential building", 4], ["Community facility", 1]]);
  if (district === "MN-07") return pickW(r, [["Villa", 8], ["Community facility", 1], ["Residential building", 1]]);
  return pickW(r, [["Villa", 19], ["Residential building", 1]]);
}
function gfaFor(r, type) {
  const span = {
    Villa: [380, 1150],
    "Residential building": [5200, 46000],
    Commercial: [2400, 28500],
    "Warehouse / industrial": [1800, 9400],
    "Community facility": [900, 4200],
  }[type];
  const x = span[0] + Math.pow(r(), 1.6) * (span[1] - span[0]);
  return Math.round(x / 5) * 5;
}

/* ───────────── case skeletons (attributes fixed, randomness per case) ───────────── */
let seq = 1630;
function skeleton(submitted, cohort, src = master) {
  const r = mulberry32(Math.floor(src() * 2 ** 31));
  const district = pickW(r, Object.entries(DISTRICTS).map(([k, v]) => [k, v.w]));
  const D = DISTRICTS[district];
  const type = buildingFor(r, district);
  const gfa = gfaFor(r, type);
  const consultant = pickW(r, CONSULTANTS);
  const officer = pickW(r, OFFICERS);
  const intake = INTAKE[Math.floor(r() * INTAKE.length)];
  const structural = STRUCTURAL[Math.floor(r() * STRUCTURAL.length)];
  const plot = `${district}-${String(100 + Math.floor(r() * 140)).padStart(3, "0")}-${String(1 + Math.floor(r() * 220)).padStart(4, "0")}`;
  const cd = type !== "Villa" || gfa > 2000;
  return {
    id: `MNDA-BP-2026-${String(seq++).padStart(5, "0")}`,
    seed: Math.floor(r() * 2 ** 31),
    key: r(), // ranking key for exact assignments
    key2: r(),
    zc: gauss(r), // case complexity (drives dispersion of review durations)
    submitted,
    cohort,
    district,
    gated: D.gated,
    dev: D.dev,
    type,
    gfa,
    consultant,
    officer,
    intake,
    structural,
    plot,
    cd,
    returns: [], // reasons
    nocHold: false,
    exempt: false,
  };
}

function submissionTimes(n, from, to, r, weightFn) {
  // distribute n submissions over [from,to) days with weekday weighting
  const days = [];
  for (let d = from; d < to; d += DAY) days.push(d);
  const w = days.map((d) => {
    const wd = dow(d);
    let base = wd === 6 ? 0.35 : wd === 0 ? 0.55 : wd === 5 ? 0.7 : 1;
    if (HOLIDAYS.has(d)) base = 0.3;
    return base * (weightFn ? weightFn(d) : 1);
  });
  const tot = w.reduce((a, b) => a + b, 0);
  // largest remainder allocation (exact n)
  const raw = w.map((x) => (x / tot) * n);
  const alloc = raw.map(Math.floor);
  let rem = n - alloc.reduce((a, b) => a + b, 0);
  raw.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0]).slice(0, rem).forEach(([, i]) => alloc[i]++);
  const out = [];
  days.forEach((d, i) => {
    for (let k = 0; k < alloc[i]; k++) {
      const hour = pickW(r, [[8, 3], [9, 5], [10, 6], [11, 6], [12, 5], [13, 4], [14, 4], [15, 3], [16, 2], [18, 2], [20, 2], [22, 1]]);
      out.push(d + hour * 60 + Math.floor(r() * 59));
    }
  });
  return out.sort((a, b) => a - b);
}

/* ───────────── Q3 cohort: 1,047 submissions ───────────── */
const rS = mulberry32(99);
const CIRC = dateMin(2026, 7, 15);
const q3Times = [
  ...submissionTimes(371, dateMin(2026, 7, 1), dateMin(2026, 8, 1), rS, (d) => (d < CIRC ? 1.45 : 0.82)),
  ...submissionTimes(322, dateMin(2026, 8, 1), dateMin(2026, 9, 1), rS),
  ...submissionTimes(354, dateMin(2026, 9, 1), dateMin(2026, 10, 1), rS),
];
const q3 = q3Times.map((t) => skeleton(t, "Q3 2026"));

// Exemption: before 15 July gated cases are exempt (transitional provision)
for (const c of q3) c.exempt = c.submitted < CIRC;

/* exact rework assignment */
function takeTop(list, n, keyFn) {
  return [...list].sort((a, b) => keyFn(a) - keyFn(b)).slice(0, n);
}
const gatedPost = q3.filter((c) => c.gated && !c.exempt && c.submitted < dateMin(2026, 9, 27));
const nocReturned = takeTop(gatedPost, 130, (c) => c.key);
nocReturned.forEach((c) => c.returns.push("noc"));
const free1 = q3.filter((c) => !c.returns.length);
const structReturned = takeTop(free1, 51, (c) => c.key * (WEAK_STRUCT.has(c.consultant) ? 0.18 : 1) * (c.type === "Villa" ? 1 : 0.7));
structReturned.forEach((c) => c.returns.push("struct"));
const free2 = q3.filter((c) => !c.returns.length);
const siteReturned = takeTop(free2, 40, (c) => c.key2 * (c.gated && !c.exempt ? 0.45 : 1));
siteReturned.forEach((c) => c.returns.push("site"));
const free3 = q3.filter((c) => !c.returns.length);
const otherReturned = takeTop(free3, 62, (c) => c.key2 * 0.9 + c.key * 0.1);
otherReturned.forEach((c) => c.returns.push("other"));
// second returns (24 cases, early enough to complete inside the window)
const returnedEarly = q3.filter((c) => c.returns.length && c.submitted < dateMin(2026, 9, 1));
const second = { noc: 11, struct: 4, site: 3, other: 6 };
for (const [reason, n] of Object.entries(second)) {
  const pool = returnedEarly.filter((c) => c.returns.length === 1 && (reason !== "noc" || (c.gated && !c.exempt)));
  takeTop(pool, n, (c) => (c.key * 7.31 + c.key2) % 1).forEach((c) => c.returns.push(reason));
}
// NOC hold: gated, post-circular, not returned for NOC, ~72% had requested but not received the NOC
for (const c of q3) {
  if (c.gated && !c.exempt && !c.returns.includes("noc")) c.nocHold = c.key2 < 0.74;
}
// sub-reasons for "other"
const rO = mulberry32(5150);
const otherDetail = new Map();

/* ───────────── trace builder ───────────── */
function buildTrace(c, P) {
  const r = mulberry32(c.seed);
  const ev = [];
  const push = (activity, t, resource, extra = {}) => ev.push({ activity, t, resource, ...extra });
  let t = c.submitted;
  push("Submitted", t, c.consultant);
  const pilot = c.cohort === "Pilot (Oct 2026)";
  const sc = (c.gated ? P.sG : P.sN) * Math.exp((c.gated ? P.dispG : P.dispN) * c.zc);
  const big = c.type === "Villa" ? 1 : 1.25;
  const devScale = c.dev === "Lulu Island Developments PJSC" ? P.nocLulu : P.nocOther;

  t = workAt(t + ln(r, 1.05 * P.sCheck, 0.45) * DAY, r);
  push("Completeness check", t, c.intake);
  for (const reason of c.returns) {
    t = workAt(t + (12 + r() * 110), r);
    let label = REASON_LABEL[reason];
    if (reason === "other") {
      if (!otherDetail.has(c.id + ev.length)) otherDetail.set(c.id + ev.length, pickW(rO, OTHER_REASONS));
      label = otherDetail.get(c.id + ev.length);
    } else r();
    push("Returned to applicant", t, c.intake, { reason, reasonLabel: label });
    const gap =
      reason === "noc"
        ? ln(r, (c.dev === "Lulu Island Developments PJSC" ? 12.5 : 8.4) * P.resubNoc, 0.38)
        : reason === "struct"
          ? ln(r, 4.6, 0.45)
          : reason === "site"
            ? ln(r, 6.2 * (c.gated ? 1.35 : 1), 0.42)
            : ln(r, 4.1, 0.55);
    t = portalAt(t + gap * DAY, r);
    push("Resubmitted", t, c.consultant);
    t = workAt(t + ln(r, 0.85 * P.sCheck, 0.5) * DAY, r);
    push("Completeness check", t, c.intake);
  }
  let nocAt = null;
  if (c.nocHold && !pilot) {
    t = workAt(t + 20 + r() * 160, r);
    push("Awaiting master-developer NOC", t, c.intake);
    const wait = ln(r, 7.6 * devScale, 0.42);
    t = workAt(t + wait * DAY, r, 8 * 60);
    push("NOC received", t, c.dev);
  } else {
    r();
    r();
    r();
    r();
  }
  if (pilot && c.nocHold) {
    // parallel NOC request at submission; reviews continue while NOC pending
    nocAt = workAt(c.submitted + ln(r, 7.6 * devScale * 0.92, 0.4) * DAY, r, 8 * 60);
    push("Awaiting master-developer NOC", c.submitted + 4 + Math.floor(r() * 20), "MNDA Smart (automatic NOC request)");
    r();
    r();
  }
  t = workAt(t + ln(r, 3.3 * sc * big, 0.55) * DAY, r);
  push("Planning review", t, c.officer);
  t = workAt(t + ln(r, 2.7 * sc * big, 0.5) * DAY, r);
  push("Structural review", t, c.structural);
  if (c.cd) {
    t = workAt(t + ln(r, 2.6 * sc, 0.6) * DAY, r);
    push("Civil Defence coordination", t, "Civil Defence liaison");
  } else {
    r();
    r();
  }
  if (nocAt != null) {
    push("NOC received", nocAt, c.dev);
    t = Math.max(t, nocAt);
  }
  t = workAt(t + ln(r, 1.4 * sc, 0.6) * DAY, r);
  push("Permit issued", t, c.officer);
  ev.sort((a, b) => a.t - b.t);
  return ev.filter((e) => e.t <= END);
}

/* ───────────── stats ───────────── */
const median = (xs) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
function cycle(ev) {
  const last = ev[ev.length - 1];
  return last.activity === "Permit issued" ? (last.t - ev[0].t) / DAY : null;
}
function stats(cases, P) {
  const traces = cases.map((c) => [c, buildTrace(c, P)]);
  const done = traces.filter(([, e]) => cycle(e) != null);
  const cyc = done.map(([, e]) => cycle(e));
  const g = done.filter(([c]) => c.gated).map(([, e]) => cycle(e));
  const n = done.filter(([c]) => !c.gated).map(([, e]) => cycle(e));
  const nocW = [];
  const lulu = [];
  for (const [c, e] of traces) {
    const a = e.find((x) => x.activity === "Awaiting master-developer NOC");
    const b = e.find((x) => x.activity === "NOC received");
    if (a && b) {
      const d = (b.t - a.t) / DAY;
      nocW.push(d);
      if (c.dev === "Lulu Island Developments PJSC") lulu.push(d);
    }
  }
  return { traces, med: median(cyc), medG: median(g), medN: median(n), noc: mean(nocW), lulu: mean(lulu), done: done.length };
}

/* ───────────── calibration ───────────── */
const P = { sN: 1.2, sG: 1.2, sCheck: 1, nocLulu: 1.4, nocOther: 1.0, resubNoc: 1, dispN: 0.35, dispG: 0.12 };
let S;
for (let it = 0; it < 200; it++) {
  S = stats(q3, P);
  const e = {
    n: 16.8 / S.medN,
    g: 27.9 / S.medG,
    lulu: 12.4 / S.lulu,
    noc: 9.2 / S.noc,
  };
  const k = it < 60 ? 0.9 : it < 120 ? 0.45 : 0.2;
  P.sN *= Math.pow(e.n, k);
  P.sG *= Math.pow(e.g, k);
  P.nocLulu *= Math.pow(e.lulu, k);
  // overall NOC mean controlled through the other developers
  P.nocOther *= Math.pow(e.noc, 1.6 * k) * Math.pow(e.lulu, -0.3 * k);
  // overall median: widen the non-gated distribution (its median stays pinned by sN)
  const eo = 21.6 / S.med;
  P.dispN = Math.max(0.05, Math.min(1.2, P.dispN * Math.pow(eo, 2.2 * k)));
  const ok =
    S.medN.toFixed(1) === "16.8" &&
    S.medG.toFixed(1) === "27.9" &&
    S.lulu.toFixed(1) === "12.4" &&
    S.noc.toFixed(1) === "9.2" &&
    S.med.toFixed(1) === "21.6";
  if (ok) break;
}
console.log("Q3 calibration", {
  med: S.med.toFixed(2),
  medG: S.medG.toFixed(2),
  medN: S.medN.toFixed(2),
  noc: S.noc.toFixed(2),
  lulu: S.lulu.toFixed(2),
  completed: S.done,
  P,
});

/* ───────────── pilot cohort (1–9 Oct) ───────────── */
const rP = mulberry32(2026100);
const pilotTimes = submissionTimes(114, dateMin(2026, 10, 1), dateMin(2026, 10, 10), rP);
const pilot = pilotTimes.map((t) => skeleton(t, "Pilot (Oct 2026)"));
{
  const gp = pilot.filter((c) => c.gated);
  // intake NOC validity check: only 2 NOC returns slip through; NOC requested in parallel for the rest lacking a valid NOC
  takeTop(gp, 2, (c) => c.key).forEach((c) => c.returns.push("noc"));
  for (const c of gp) if (!c.returns.length) c.nocHold = c.key2 < 0.74;
  const free = pilot.filter((c) => !c.returns.length);
  takeTop(free, 6, (c) => c.key * (WEAK_STRUCT.has(c.consultant) ? 0.2 : 1)).forEach((c) => c.returns.push("struct"));
  takeTop(pilot.filter((c) => !c.returns.length), 3, (c) => c.key2).forEach((c) => c.returns.push("site"));
  takeTop(pilot.filter((c) => !c.returns.length), 4, (c) => (c.key + c.key2) % 1).forEach((c) => c.returns.push("other"));
}

/* ───────────── June carry-in: makes Jul–Sep throughput 312 / month ───────────── */
const Q3_START = dateMin(2026, 7, 1);
const Q3_END = dateMin(2026, 10, 1);
const issuedAt = (e) => (e.length && e[e.length - 1].activity === "Permit issued" ? e[e.length - 1].t : null);
const q3IssuedInQ3 = S.traces.filter(([, e]) => {
  const i = issuedAt(e);
  return i != null && i >= Q3_START && i < Q3_END;
}).length;
const needCarry = 936 - q3IssuedInQ3;
// June carry-in: two knobs — submission timing skew (k) and review speed (scale).
//   count constraint: exactly `needCarry` June cases issued in Jul–Sep (→ 936 issued in Q3 = 312 / month)
//   median constraint: median cycle of ALL permits issued in Q3 = 21.6 d (same as the Q3-cohort median)
const q3Issued = S.traces
  .map(([, e]) => e)
  .filter((e) => {
    const i = issuedAt(e);
    return i != null && i >= Q3_START && i < Q3_END;
  })
  .map((e) => (issuedAt(e) - e[0].t) / DAY);
let juneAll, juneTr, PJ, best = null;
for (let kk = -120; kk <= 320; kk++) {
  const k = kk * 0.0005;
  const attr = mulberry32(60607);
  const rJ = mulberry32(60606);
  seq = 1630;
  const ja = submissionTimes(352, dateMin(2026, 6, 1), dateMin(2026, 7, 1), rJ, (d) => Math.exp(-k * ((d - dateMin(2026, 6, 1)) / DAY))).map((t) => skeleton(t, "Carry-in (Jun 2026)", attr));
  for (const c of ja) {
    c.exempt = true;
    if (c.key < 0.15) c.returns.push(c.key2 < 0.5 ? "struct" : c.key2 < 0.75 ? "site" : "other");
  }
  const pj = { ...P, sG: P.sN * 1.05 };
  let tr;
  for (let it = 0; it < 60; it++) {
    tr = ja.map((c) => [c, buildTrace(c, pj)]);
    const inQ3 = tr.filter(([, e]) => issuedAt(e) >= Q3_START && issuedAt(e) < Q3_END).length;
    if (inQ3 === needCarry) break;
    const f = Math.pow(needCarry / Math.max(1, inQ3), it < 30 ? 0.35 : 0.1);
    pj.sN *= f;
    pj.sG *= f;
  }
  const juneCyc = tr.filter(([, e]) => issuedAt(e) >= Q3_START && issuedAt(e) < Q3_END).map(([, e]) => (issuedAt(e) - e[0].t) / DAY);
  const m = median([...q3Issued, ...juneCyc]);
  const cnt = juneCyc.length;
  if (!best || (cnt === needCarry && (best.cnt !== needCarry || Math.abs(m - 21.6) < Math.abs(best.m - 21.6)))) best = { k, m, ja, tr, pj, cnt };
  if (best.cnt === needCarry && Math.abs(best.m - 21.6) < 0.02) break;
}
juneAll = best.ja;
juneTr = best.tr;
PJ = best.pj;
console.log("June knob", { k: best.k, issuedQ3Median: best.m.toFixed(2), count: best.cnt });
const juneInQ3 = juneTr.filter(([, e]) => issuedAt(e) >= Q3_START).length;
console.log("June carry-in", { needCarry, juneInQ3, june: juneAll.length, scale: PJ.sN.toFixed(3) });

/* ───────────── assemble & write ───────────── */
const pilotTr = pilot.map((c) => [c, buildTrace(c, P)]);
const all = [...juneTr, ...S.traces, ...pilotTr].sort((a, b) => a[0].submitted - b[0].submitted);
// permit numbers are issued in submission order (Jan–May applications used 01001–01610)
all.forEach(([c], i) => (c.id = `MNDA-BP-2026-${String(1611 + i).padStart(5, "0")}`));
const header = [
  "case_id",
  "activity",
  "timestamp",
  "resource",
  "district",
  "district_name",
  "gated",
  "master_developer",
  "building_type",
  "gfa_m2",
  "consultant",
  "officer",
  "return_reason",
  "cohort",
];
const esc = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const rows = [header.join(",")];
for (const [c, ev] of all) {
  for (const e of ev) {
    rows.push(
      [
        c.id,
        e.activity,
        iso(e.t),
        e.resource,
        c.district,
        DISTRICTS[c.district].name,
        c.gated ? "yes" : "no",
        c.dev ?? "",
        c.type,
        c.gfa,
        c.consultant,
        c.officer,
        e.reasonLabel ?? "",
        c.cohort,
      ]
        .map(esc)
        .join(","),
    );
  }
}
fs.writeFileSync(path.join(DIR, "events.csv"), rows.join("\n") + "\n");

/* ───────────── verification of canonical figures ───────────── */
const q3Tr = S.traces;
const returnedCases = q3Tr.filter(([, e]) => e.some((x) => x.activity === "Returned to applicant")).length;
const retEvents = q3Tr.flatMap(([, e]) => e.filter((x) => x.activity === "Returned to applicant"));
const mix = {};
for (const e of retEvents) mix[e.reason] = (mix[e.reason] ?? 0) + 1;
const issuedByMonth = {};
for (const [, e] of all) {
  const i = issuedAt(e);
  if (i == null) continue;
  const m = iso(i).slice(0, 7);
  issuedByMonth[m] = (issuedByMonth[m] ?? 0) + 1;
}
const summary = {
  generatedFrom: "generate.mjs (seeded)",
  q3Applications: q3.length,
  q3Completed: S.done,
  q3Open: q3.length - S.done,
  medianCycle: +S.med.toFixed(1),
  medianGated: +S.medG.toFixed(1),
  medianNonGated: +S.medN.toFixed(1),
  nocHoldMean: +S.noc.toFixed(1),
  luluNocMean: +S.lulu.toFixed(1),
  reworkPct: +((returnedCases / q3.length) * 100).toFixed(1),
  returnedCases,
  returnEvents: retEvents.length,
  returnMixPct: Object.fromEntries(Object.entries(mix).map(([k, v]) => [k, +((v / retEvents.length) * 100).toFixed(1)])),
  issuedByMonth,
  q3IssuedPerMonth: +((issuedByMonth["2026-07"] + issuedByMonth["2026-08"] + issuedByMonth["2026-09"]) / 3).toFixed(1),
  pilotCases: pilot.length,
  events: rows.length - 1,
};
console.log(summary);
fs.writeFileSync(path.join(DIR, "generated-summary.json"), JSON.stringify(summary, null, 2));

/* ───────────── officer case notes (~120) ───────────── */
const rN = mulberry32(777);
const fmtD = (min) => {
  const d = new Date(BASE + min * 60000);
  return `${d.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]}`;
};
const AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const fmtDAr = (min) => {
  const d = new Date(BASE + min * 60000);
  return `${d.getUTCDate()} ${AR_MONTHS[d.getUTCMonth()]}`;
};
const revs = ["B", "C", "D", "E"];
const arDays = (n) => (n === 1 ? "يوم واحد" : n === 2 ? "يومين" : n <= 10 ? `${n} أيام` : `${n} يوماً`);
const T = {
  nocWaitEn: [
    (x) => `Day ${x.days} awaiting NOC from ${x.dev}. Consultant (${x.consultant}) has chased twice; developer's design-review team says the request is "in queue". Nothing outstanding on our side.`,
    (x) => `Application complete since ${x.d0}, held only for the master-developer NOC. ${x.dev} acknowledged the request but no issue date given. SLA clock suspended per Circular 14/2026 §5.2.`,
    (x) => `Still no NOC (${x.days} days). Applicant called the hotline twice asking why the permit is late — explained the hold. ${x.dev} portal shows "under technical review".`,
    (x) => `NOC finally received after ${x.days} days. Developer asked for façade colour change before issuing (RAL 9010 instead of sand beige). Planning review can start.`,
    (x) => `Escalated to Eng. Omar: ${x.days} days on NOC hold for plot ${x.plot}. ${x.dev} says the NOC team is two people and handles all community requests.`,
  ],
  nocWaitAr: [
    (x) => `بانتظار شهادة عدم الممانعة من ${x.devAr} منذ ${arDays(x.days)}. تواصل المكتب الاستشاري مع المطور أكثر من مرة وأفاد بأن الطلب ما زال قيد المراجعة لدى قسم التصاميم.`,
    (x) => `الملف مكتمل منذ ${x.d0Ar} ومتوقف فقط على الـ NOC من المطور الرئيسي. تم تعليق احتساب مدة الخدمة وفق البند 5.2 من التعميم 14/2026.`,
    (x) => `اتصل المتعامل بمركز إسعاد المتعاملين يسأل عن سبب التأخير؛ تم إبلاغه أن الطلب بانتظار موافقة ${x.devAr} على المخططات (${arDays(x.days)} حتى الآن).`,
    (x) => `وصلت شهادة عدم الممانعة بعد ${arDays(x.days)}، مع ملاحظة من المطور بتعديل ارتفاع السور الخارجي إلى 2.1 م. تم تحويل الطلب للتدقيق التخطيطي.`,
  ],
  nocReturnEn: [
    (x) => `Returned — no NOC attached. Applicant believed the NOC only applies to Marina Quarter towers, not villas on Al Lulu Island. Explained Circular 14/2026 §2.`,
    (x) => `NOC attached is dated ${x.oldNoc}, older than 90 days (§4.2) — treated as missing. Returned to applicant.`,
    (x) => `Returned: NOC issued for plot ${x.plotWrong} instead of ${x.plot}. Consultant to request a corrected NOC from ${x.dev}.`,
    (x) => `Second return on this file — renewed NOC still references drawing rev ${x.revOld}, submission is rev ${x.revNew}. Applicant frustrated; advised to request NOC only after final revision.`,
  ],
  nocReturnAr: [
    (x) => `تمت إعادة الطلب للمتعامل لعدم إرفاق شهادة عدم ممانعة من المطور الرئيسي، علماً بأن المخطط يقع ضمن منطقة مسوّرة (${x.districtAr}).`,
    (x) => `الـ NOC المرفق صادر بتاريخ ${x.oldNocAr} ومنتهي الصلاحية (أكثر من 90 يوماً)، ويُعامل كأنه غير مرفق وفق البند 4.2. تمت الإعادة.`,
    (x) => `أُعيد الطلب: الشهادة المرفقة لا تتضمن رقم المخطط بالصيغة المعتمدة ولا رقم مراجعة المخططات.`,
  ],
  structEn: [
    (x) => `Structural calculations not stamped by a licensed structural engineer. ${x.consultant} outsourced the calcs and the stamp page is missing. Returned.`,
    (x) => `Calc package unsigned (third time this month from ${x.consultant}). Suggest we flag this at the consultants' forum.`,
    (x) => `Returned — structural report stamped by an engineer whose registration is not linked to ${x.consultant}'s licence.`,
  ],
  structAr: [
    (x) => `الحسابات الإنشائية غير مختومة من مهندس إنشائي مرخّص. تم إبلاغ ${x.consultant} بإعادة التقديم بعد استكمال الختم.`,
    (x) => `تكرر من نفس المكتب الاستشاري تقديم حسابات إنشائية دون ختم. نقترح فحصاً آلياً للختم عند التقديم.`,
  ],
  siteEn: [
    (x) => `Site plan rev ${x.revNew} submitted but the NOC refers to rev ${x.revOld}. New NOC required (§4.3). Developer will not turn it round inside 7 working days.`,
    (x) => `Drawing set mixes rev ${x.revOld} and rev ${x.revNew} sheets — setback dimension differs on the site plan. Returned for a consistent set.`,
  ],
  siteAr: [
    (x) => `المخططات المقدمة بمراجعة rev ${x.revNew} بينما شهادة عدم الممانعة تشير إلى rev ${x.revOld}؛ يلزم الحصول على شهادة جديدة وفق البند 4.3 من التعميم.`,
    (x) => `اختلاف في أبعاد الارتداد بين مخطط الموقع والمخطط المعماري (rev ${x.revOld} مقابل rev ${x.revNew}). أُعيد الطلب لتوحيد النسخ.`,
  ],
  cdEn: [
    (x) => `Civil Defence comments: escape-stair width on typical floors below requirement; consultant revising. GFA ${x.gfa.toLocaleString("en")} m².`,
    (x) => `Civil Defence coordination meeting held — basement sprinkler layout requested. Expect 3–4 days.`,
  ],
  cdAr: [(x) => `ملاحظات الدفاع المدني على عرض مخارج الطوارئ في الطابق الأرضي، والاستشاري يعمل على تعديل المخططات.`],
  capacityEn: [
    (x) => `Planning review delayed ~3 days — two engineers on annual leave and the Senior Planning Engineer post still vacant. Re-assigned to ${x.officer}.`,
    (x) => `Queue at planning review is 61 files this morning. Prioritising files already past 15 working days.`,
  ],
  capacityAr: [(x) => `تأخر التدقيق التخطيطي بسبب إجازة المهندس المختص وشغور وظيفة مهندس تخطيط أول؛ أعيد توزيع الملف على ${x.officer}.`],
  otherEn: [
    (x) => `Returned — ${x.otherReason.toLowerCase()}. Applicant resubmitted within ${x.days} days.`,
    (x) => `Applicant unreachable for 4 days (mobile switched off). Fee voucher still unpaid.`,
  ],
  otherAr: [(x) => `أُعيد الطلب بسبب: ${x.otherReasonAr}. أعاد المتعامل التقديم خلال ${arDays(x.days)}.`],
  pilotEn: [
    (x) => `Pilot: NOC validity checked at intake — expiry flagged before acceptance, applicant uploaded the renewed NOC the same afternoon. No return needed.`,
    (x) => `Pilot: NOC request sent to ${x.dev} automatically at submission; planning review started in parallel while the NOC is pending.`,
    (x) => `Pilot: intake checklist caught plot number mismatch on the NOC before acceptance. 20 minutes at the counter instead of a full return cycle.`,
  ],
  pilotAr: [
    (x) => `ضمن التجربة: تم التحقق من صلاحية الـ NOC عند الاستلام، وطُلب من المتعامل تحديثه قبل قبول الطلب، فتم الرفع في اليوم نفسه دون إعادة.`,
    (x) => `ضمن التجربة: أُرسل طلب شهادة عدم الممانعة إلى ${x.devAr} آلياً عند التقديم، وبدأ التدقيق التخطيطي بالتوازي.`,
  ],
};
const DIST_AR = {
  "MN-03": "جزيرة اللؤلؤ",
  "MN-06": "السدر السكنية",
  "MN-08": "حي المارينا",
};
const OTHER_AR = {
  "Fee payment pending": "عدم سداد الرسوم",
  "Title deed / ownership document missing": "عدم إرفاق سند الملكية",
  "Soil investigation report missing": "عدم إرفاق تقرير فحص التربة",
  "Plot number mismatch on drawings": "اختلاف رقم المخطط في الرسومات",
  "Consultant registration expired": "انتهاء تسجيل المكتب الاستشاري",
  "GFA calculation sheet missing": "عدم إرفاق جدول حساب المساحة الإجمالية",
};
const notes = [];
const used = new Set();
function addNote(theme, c, ev, atMin, extra = {}) {
  const ar = rN() < 0.42;
  const list = T[theme + (ar ? "Ar" : "En")] ?? T[theme + "En"];
  const tpl = list[Math.floor(rN() * list.length)];
  const ri = Math.floor(rN() * 3);
  const x = {
    dev: c.dev,
    devAr: DEV_AR[c.dev] ?? "",
    consultant: c.consultant,
    plot: c.plot,
    plotWrong: c.plot.slice(0, -2) + String(10 + Math.floor(rN() * 89)),
    officer: c.officer,
    gfa: c.gfa,
    districtAr: DIST_AR[c.district] ?? "",
    revOld: revs[ri],
    revNew: revs[ri + 1],
    d0: fmtD(c.submitted + DAY),
    d0Ar: fmtDAr(c.submitted + DAY),
    oldNoc: fmtD(c.submitted - (100 + Math.floor(rN() * 60)) * DAY) + " 2026",
    oldNocAr: fmtDAr(c.submitted - (100 + Math.floor(rN() * 60)) * DAY) + " 2026",
    days: 4,
    ...extra,
  };
  const text = tpl(x);
  const k = c.id + theme;
  if (used.has(k)) return;
  used.add(k);
  notes.push({
    id: `NOTE-${String(notes.length + 1).padStart(3, "0")}`,
    caseId: c.id,
    date: iso(atMin),
    author: c.officer,
    theme,
    lang: /[؀-ۿ]/.test(text.replace(/NOC|rev [A-E]/g, "")) && ar ? "ar" : "en",
    text,
  });
}
const shuffle = (arr, r) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const q3Shuffled = shuffle(S.traces, rN);
let quota = { nocWait: 30, nocReturn: 22, struct: 14, site: 12, cd: 9, capacity: 7, other: 8 };
for (const [c, ev] of q3Shuffled) {
  const hold = ev.find((e) => e.activity === "Awaiting master-developer NOC");
  const recv = ev.find((e) => e.activity === "NOC received");
  if (hold && quota.nocWait > 0) {
    const waited = recv ? (recv.t - hold.t) / DAY : (END - hold.t) / DAY;
    if (waited > 8 || (c.dev === "Lulu Island Developments PJSC" && waited > 6)) {
      const at = recv ? recv.t - 60 : hold.t + Math.min(waited, 10) * DAY;
      addNote("nocWait", c, ev, at, { days: Math.round(Math.min(waited, (at - hold.t) / DAY + 0.5)) || Math.round(waited) });
      quota.nocWait--;
      continue;
    }
  }
  const ret = ev.find((e) => e.activity === "Returned to applicant");
  if (ret) {
    const theme = ret.reason === "noc" ? "nocReturn" : ret.reason === "struct" ? "struct" : ret.reason === "site" ? "site" : "other";
    if (quota[theme] > 0) {
      const resub = ev.find((e) => e.activity === "Resubmitted" && e.t > ret.t);
      addNote(theme, c, ev, ret.t + 5, {
        otherReason: ret.reasonLabel,
        otherReasonAr: OTHER_AR[ret.reasonLabel] ?? ret.reasonLabel,
        days: resub ? Math.max(1, Math.round((resub.t - ret.t) / DAY)) : 3,
      });
      quota[theme]--;
      continue;
    }
  }
  const cd = ev.find((e) => e.activity === "Civil Defence coordination");
  if (cd && quota.cd > 0 && rN() < 0.25) {
    addNote("cd", c, ev, cd.t - 120);
    quota.cd--;
    continue;
  }
  const pr = ev.find((e) => e.activity === "Planning review");
  if (pr && quota.capacity > 0 && rN() < 0.04 && pr.t > dateMin(2026, 8, 10)) {
    addNote("capacity", c, ev, pr.t - 200);
    quota.capacity--;
  }
}
let pq = 10;
for (const [c, ev] of shuffle(pilotTr, rN)) {
  if (pq <= 0) break;
  if (c.gated) {
    addNote("pilot", c, ev, c.submitted + 90);
    pq--;
  }
}
notes.sort((a, b) => a.date.localeCompare(b.date));
notes.forEach((n, i) => (n.id = `NOTE-${String(i + 1).padStart(3, "0")}`));
fs.writeFileSync(path.join(DIR, "case-notes.json"), JSON.stringify(notes, null, 2));
console.log("notes", notes.length, Object.fromEntries(Object.keys(T).map((k) => [k, notes.filter((n) => k.startsWith(n.theme)).length])));
