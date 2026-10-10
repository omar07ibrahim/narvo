/**
 * Generator — Al Ghaf Community Centre & MNDA Tower building signals (solution 20, WORLD storyline S4).
 *
 *   node data/mnda/20-facility-intelligence/generate.mjs
 *
 * Seeded and physics-based (R134a saturation curve, air-cooled capacity derating, staging, HP unloading):
 *  - hourly BMS 1 Sep – 9 Oct 2026 for both sites (ambient, chillers, CHW temps, zone temperatures)
 *  - CH-02 condenser fouling grows from the missed 15 Aug coil-cleaning PPM → exactly 11 high-pressure trips in
 *    September, all 13:00–16:00 with ambient > 44 °C; coil cleaned 6 Oct 2026 (JOB-RFM-26-04471) → trips stop
 *  - September 2026 chiller energy = +17% vs September 2025 (daily 2025 baseline written alongside)
 *  - complaint timestamps anchored to the computed trips; reactive jobs generated per trip
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r = mulberry32(20260906);
const gauss = () => {
  let u = 0, v = 0;
  while (u === 0) u = r();
  while (v === 0) v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const round = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;
const pad = (n) => String(n).padStart(2, "0");

/* ───────────── time axis (local GST) ───────────── */
const START = Date.UTC(2026, 8, 1); // 1 Sep 2026 00:00 local (treated as UTC for arithmetic)
const HOURS = 39 * 24; // to 9 Oct 23:00
const tsOf = (h) => {
  const d = new Date(START + h * 3600000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:00:00+04:00`;
};
const isoMin = (ms) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00+04:00`;
};
const L = (y, m, d, hh = 0, mm = 0) => Date.UTC(y, m - 1, d, hh, mm);
const CLEAN_AT = L(2026, 10, 6, 11, 40); // coil chemical clean completed (JOB-RFM-26-04471)

/* ───────────── weather (Marsa Al Noor coastal) ───────────── */
// Daily max/min. Ten September days peak above 44 °C (the trip days); October cools.
const HOT = { 2: 44.6, 3: 44.4, 8: 45.1, 9: 46.4, 10: 45.3, 14: 44.8, 15: 44.5, 21: 44.9, 22: 44.3, 28: 44.7 };
const days = [];
for (let i = 0; i < 39; i++) {
  const date = new Date(START + i * 86400000);
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  let max;
  let min;
  if (m === 9) {
    max = HOT[d] ?? round(43.4 - (d / 30) * 2.6 + gauss() * 0.7, 1);
    if (!HOT[d]) max = Math.min(max, 43.7);
    min = round(32.2 - (d / 30) * 2.2 + gauss() * 0.5, 1);
  } else {
    const oct = { 1: 41.6, 2: 41.2, 3: 40.6, 4: 39.8, 5: 40.3, 6: 39.4, 7: 38.9, 8: 39.7, 9: 38.6 };
    max = oct[d];
    min = round(29.4 - d * 0.18 + gauss() * 0.4, 1);
  }
  days.push({ m, d, max, min });
}
function ambientAt(h) {
  const di = Math.floor(h / 24);
  const hr = h % 24;
  const { max, min } = days[di];
  const nextMin = days[Math.min(di + 1, days.length - 1)].min;
  const prevMax = days[Math.max(di - 1, 0)].max;
  let v;
  if (hr >= 5 && hr <= 14.5) v = min + (max - min) * (0.5 - 0.5 * Math.cos((Math.PI * (hr - 5)) / 9.5));
  else if (hr > 14.5) v = nextMin + (max - nextMin) * (0.5 + 0.5 * Math.cos((Math.PI * (hr - 14.5)) / 14.5));
  else v = min + (prevMax - min) * (0.5 + 0.5 * Math.cos((Math.PI * (hr + 9.5)) / 14.5));
  return v;
}

/* ───────────── R134a & chiller model ───────────── */
const psat = (tc) => Math.exp(15.3054 - 2624.4 / (tc + 273.15)); // kPa abs, fitted 40–65 °C
const TRIP_KPA = 1750;
const UNLOAD_KPA = 1715;
const capAt = (amb) => 350 * (1 - 0.0105 * Math.max(0, amb - 35)); // TR, air-cooled derating
// condenser fouling (K of extra approach)
const foul02 = (ms) => (ms >= CLEAN_AT ? 0.35 : 4.15 + ((ms - START) / (35 * 86400000)) * 1.35);
const foul01 = (ms) => 1.35 + ((ms - START) / (39 * 86400000)) * 0.5;

/* ───────────── occupancy & bookings (Multipurpose Hall drives the peaks) ───────────── */
const bookings = [];
const EVENT_TYPES = [
  ["Quran memorisation competition", "مسابقة حفظ القرآن الكريم", 320, 410],
  ["Back-to-school community fair", "معرض العودة إلى المدارس المجتمعي", 260, 420],
  ["Youth table-tennis tournament", "بطولة كرة الطاولة للشباب", 120, 190],
  ["Emirati heritage workshop", "ورشة التراث الإماراتي", 70, 140],
  ["Senior citizens' majlis", "مجلس كبار المواطنين", 60, 110],
  ["Blood donation drive", "حملة التبرع بالدم", 90, 160],
  ["Volunteer induction — Marsa Al Noor Volunteers", "تعريف المتطوعين — متطوعو مرسى النور", 80, 150],
  ["Wedding reception (community booking)", "حفل زفاف (حجز مجتمعي)", 300, 440],
  ["Parents' council meeting", "اجتماع مجلس أولياء الأمور", 90, 170],
  ["Community health awareness talk", "محاضرة توعية صحية", 70, 130],
];
// Fixed afternoon events on the hot days (they are what make the hall overheat)
const fixedEvents = [
  [2, 14, 18, "Back-to-school community fair"],
  [3, 14, 18, "Back-to-school community fair"],
  [8, 13, 17, "Youth table-tennis tournament"],
  [9, 14, 18, "Quran memorisation competition"],
  [10, 13, 16, "Blood donation drive"],
  [14, 15, 18, "Parents' council meeting"],
  [15, 13, 17, "Emirati heritage workshop"],
  [21, 14, 17, "Community health awareness talk"],
  [22, 13, 17, "Youth table-tennis tournament"],
  [28, 14, 18, "Volunteer induction — Marsa Al Noor Volunteers"],
];
let bk = 3301;
const evByHour = new Map();
function addBooking(y, m, d, h0, h1, type) {
  const t = EVENT_TYPES.find((e) => e[0] === type);
  const att = Math.round(t[2] + r() * (t[3] - t[2]));
  const b = {
    id: `BK-AGC-26-${bk++}`,
    site: "AGC",
    zone: "Z-MPH",
    title: t[0],
    titleAr: t[1],
    start: `${y}-${pad(m)}-${pad(d)}T${pad(h0)}:00:00+04:00`,
    end: `${y}-${pad(m)}-${pad(d)}T${pad(h1)}:00:00+04:00`,
    expected: att,
    organiser: type.includes("Wedding") ? "Private (community booking)" : "Al Ghaf Community Centre programmes",
  };
  bookings.push(b);
  const base = (L(y, m, d) - START) / 3600000;
  for (let h = h0; h < h1; h++) evByHour.set(base + h, Math.max(evByHour.get(base + h) ?? 0, att));
}
for (const [d, h0, h1, type] of fixedEvents) addBooking(2026, 9, d, h0, h1, type);
// evening & other bookings
for (let i = 0; i < 39; i++) {
  const date = new Date(START + i * 86400000);
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  const wd = date.getUTCDay();
  if (m === 9 && fixedEvents.some((e) => e[0] === d)) {
    if (r() < 0.35) addBooking(2026, m, d, 19, 22, "Wedding reception (community booking)");
    continue;
  }
  if (r() < (wd === 0 || wd === 6 ? 0.85 : 0.55)) {
    const evening = r() < 0.6;
    const type = EVENT_TYPES[Math.floor(r() * EVENT_TYPES.length)][0];
    if (evening) addBooking(2026, m, d, 19, 22, type.includes("Wedding") || r() < 0.3 ? "Wedding reception (community booking)" : type);
    else addBooking(2026, m, d, 10, 13, type.includes("Wedding") ? "Senior citizens' majlis" : type);
  }
}
bookings.sort((a, b) => a.start.localeCompare(b.start));

function occupancy(h) {
  const hr = h % 24;
  const wd = new Date(START + h * 3600000).getUTCDay();
  const open = wd === 5 ? hr >= 14 && hr < 22 : hr >= 8 && hr < 22;
  if (!open) return 0.05;
  // weekday afternoons busy (after school), weekends busy all day
  const shape = [0, 0, 0, 0, 0, 0, 0, 0, 0.45, 0.55, 0.6, 0.6, 0.62, 0.7, 0.78, 0.86, 0.92, 0.95, 0.9, 0.85, 0.75, 0.55, 0.3, 0][hr];
  return shape * (wd === 0 || wd === 6 ? 1.1 : 1);
}

/* ───────────── simulate Al Ghaf ───────────── */
const trips = [];
const rows = [];
const zones = {
  "Z-MPH": { sp: 23.5, k: 1.05, occ: 1.0, name: "Multipurpose Hall" },
  "Z-LF": { sp: 22.5, k: 1.35, occ: 1.0, name: "Ladies' Fitness" },
  "Z-MF": { sp: 23.0, k: 0.6, occ: 0.7, name: "Men's Fitness" },
  "Z-LOB": { sp: 23.5, k: 0.4, occ: 0.45, name: "Main Lobby" },
  "Z-LIB": { sp: 23.5, k: 0.3, occ: 0.3, name: "Library" },
  "Z-CLS": { sp: 23.5, k: 0.4, occ: 0.5, name: "Classrooms & Workshops" },
  "Z-MAJ": { sp: 23.5, k: 0.35, occ: 0.4, name: "Majlis & Admin" },
};
const zt = Object.fromEntries(Object.entries(zones).map(([k, z]) => [k, z.sp + 2]));
let ch02LockedUntil = -1;
// Raseen FM response time (hours) per trip day — CH-02 stays locked out until a technician resets it
const RESP_H = [2.6, 5.1, 3.4, 1.4, 7.2, 4.6, 2.2, 6.3, 3.9, 4.8];
let tripDayCount = 0;
let tripsToday = 0;
let lastDay = -1;
const kwh = { sep: 0, oct: 0 };
for (let h = 0; h < HOURS; h++) {
  const ms = START + h * 3600000;
  const hr = h % 24;
  const di = Math.floor(h / 24);
  if (di !== lastDay) {
    tripsToday = 0;
    lastDay = di;
  }
  const amb = ambientAt(h) + gauss() * 0.15;
  const occ = occupancy(h);
  const ev = evByHour.get(h) ?? 0;
  const load = 92 + 6.9 * Math.max(0, amb - 24) + 175 * occ + ev * 0.24 + gauss() * 6;
  const cap = capAt(amb);
  // staging: CH-01 lead; CH-02 lag above 88% of one machine
  let on1 = true;
  let on2 = load > 0.88 * cap;
  let trip = 0;
  let tripMinute = null;
  if (ch02LockedUntil > h) on2 = false;
  const loadEach = on2 ? load / 2 : load;
  const lf2 = Math.min(1, loadEach / cap);
  const ap2 = 10.6 + 3.6 * lf2 + foul02(ms) + gauss() * 0.25;
  const ap1 = 10.6 + 3.6 * Math.min(1, loadEach / cap) + foul01(ms) + gauss() * 0.25;
  let dp2 = on2 ? psat(amb + ap2) : psat(amb + 1.5) - 40;
  let dp1 = psat(amb + ap1);
  let unload2 = 0;
  // HP trip: only when HP unloading can no longer hold the head pressure (ambient > 44 °C, 13:00–16:00)
  const tripWindow = hr >= 13 && hr <= 15 && amb > 44.0 && on2 && ms < CLEAN_AT;
  const maxTrips = days[di].max >= 46 ? 2 : 1;
  if (tripWindow && dp2 >= TRIP_KPA - 25 && tripsToday < maxTrips) {
    trip = 1;
    tripsToday++;
    tripMinute = Math.floor(8 + r() * 47);
    dp2 = TRIP_KPA + 4 + r() * 22;
    if (tripsToday === 1) tripDayCount++;
    const lock = tripsToday === 2 ? 2 : Math.ceil(RESP_H[tripDayCount - 1] + 0.4);
    r();
    ch02LockedUntil = h + lock;
    trips.push({
      at: isoMin(ms + tripMinute * 60000),
      ambient: round(amb, 1),
      dischargeKpa: Math.round(dp2),
      lockoutHours: lock,
      hourIndex: h,
    });
  } else if (on2 && dp2 > UNLOAD_KPA) {
    // HP unloading holds the pressure just under the trip limit and sheds capacity
    unload2 = Math.min(0.35, (dp2 - UNLOAD_KPA) / 260);
    dp2 = UNLOAD_KPA + (TRIP_KPA - UNLOAD_KPA - 6) * Math.min(1, (dp2 - UNLOAD_KPA) / 120) + gauss() * 3;
  }
  if (dp1 > UNLOAD_KPA) dp1 = UNLOAD_KPA - 5 + gauss() * 4;
  const run2 = on2 && !trip ? 1 : trip ? 0.3 : 0; // ran part of the hour before tripping
  const cap2 = run2 * cap * (1 - unload2);
  const supply = cap + cap2;
  const shortfall = Math.max(0, load - supply);
  const chws = 6.7 + (shortfall / load) * 11.5 + gauss() * 0.12;
  const delivered = Math.min(load, supply);
  const tr1 = on2 ? delivered * (cap / supply) : delivered;
  const tr2 = delivered - tr1;
  const kwPerTr = (amb2, f) => 0.9 + 0.0145 * Math.max(0, amb2 - 35) + 0.042 * f;
  const kw1 = tr1 * kwPerTr(amb, foul01(ms)) + gauss() * 3;
  const kw2 = tr2 > 0 ? tr2 * kwPerTr(amb, foul02(ms)) + gauss() * 3 : 0;
  const k1 = Math.max(0, Math.round(kw1));
  const k2 = Math.max(0, Math.round(kw2));
  if (new Date(ms).getUTCMonth() === 8) kwh.sep += k1 + k2;
  else kwh.oct += k1 + k2;
  // zones (first-order lag towards a target)
  const zrow = {};
  for (const [id, z] of Object.entries(zones)) {
    const occupied = occ > 0.1;
    const evHeat = id === "Z-MPH" ? ev / 160 : 0;
    const sp = id === "Z-LIB" && ms < L(2026, 9, 16, 11) ? 21.6 : z.sp; // library setpoint mis-set until the 16 Sep job
    const target = occupied
      ? sp + 0.25 * occ * z.occ + evHeat * 0.35 + z.k * Math.max(0, chws - 7.4) * (0.75 + 0.5 * occ * z.occ + evHeat * 0.4)
      : Math.min(26.8, sp + 2.2 + Math.max(0, amb - 33) * 0.06);
    zt[id] = zt[id] + (target - zt[id]) * 0.55 + gauss() * 0.08;
    zrow[id] = round(zt[id], 1);
  }
  rows.push({
    ts: tsOf(h),
    ambient_c: round(amb, 1),
    load_tr: Math.round(load),
    ch01_status: on1 ? 1 : 0,
    ch01_kw: Math.max(0, Math.round(kw1)),
    ch01_dp_kpa: Math.round(dp1),
    ch02_status: run2 >= 1 ? 1 : 0,
    ch02_kw: Math.max(0, Math.round(kw2)),
    ch02_dp_kpa: Math.round(dp2),
    ch02_trip: trip,
    chws_c: round(chws, 1),
    chwr_c: round(chws + 4.9 * Math.min(1.15, load / Math.max(supply, 1)) + gauss() * 0.1, 1),
    ...Object.fromEntries(Object.entries(zrow).map(([k, v]) => [k.toLowerCase().replace("-", "_") + "_c", v])),
    mph_event_attendance: ev,
  });
}
const sepTrips = trips.filter((t) => t.at.startsWith("2026-09"));
console.log("trips", trips.length, "sep", sepTrips.length, trips.map((t) => `${t.at.slice(5, 16)} ${t.ambient}`).join(" | "));

/* ───────────── September 2025 baseline (+17%) ───────────── */
const sep25 = [];
const r25 = mulberry32(2025);
let raw25 = 0;
for (let d = 1; d <= 30; d++) {
  const max = round(43.1 - (d / 30) * 2.4 + (r25() - 0.5) * 2.6, 1);
  const min = round(31.6 - (d / 30) * 2.0 + (r25() - 0.5) * 1.2, 1);
  const mean = round((max + min) / 2 + 0.6, 1);
  const k = 7300 + 330 * Math.max(0, mean - 28) + (r25() - 0.5) * 520;
  raw25 += k;
  sep25.push({ date: `2025-09-${pad(d)}`, ambient_max_c: max, ambient_mean_c: mean, chiller_kwh: k });
}
const target25 = kwh.sep / 1.17;
const f25 = target25 / raw25;
let tot25 = 0;
for (const x of sep25) {
  x.chiller_kwh = Math.round(x.chiller_kwh * f25);
  tot25 += x.chiller_kwh;
}
console.log("energy Sep 2026 kWh", Math.round(kwh.sep), "Sep 2025", tot25, "ratio", (kwh.sep / tot25).toFixed(4));

/* ───────────── write BMS CSVs ───────────── */
const toCsv = (arr) => [Object.keys(arr[0]).join(","), ...arr.map((o) => Object.values(o).join(","))].join("\n") + "\n";
fs.writeFileSync(path.join(DIR, "bms-agc-hourly.csv"), toCsv(rows));
fs.writeFileSync(path.join(DIR, "energy-sep-2025-daily.csv"), toCsv(sep25));

/* ───────────── MNDA Tower (water-cooled, well maintained) ───────────── */
const hq = [];
const zHq = { "Z-L03": 23.0, "Z-L09": 23.0, "Z-L14": 23.0, "Z-L21": 23.0 };
const zHqT = { ...zHq };
for (let h = 0; h < HOURS; h++) {
  const ms = START + h * 3600000;
  const hr = h % 24;
  const wd = new Date(ms).getUTCDay();
  const work = wd >= 1 && wd <= 5 && hr >= 7 && hr < (wd === 5 ? 13 : 16);
  const amb = ambientAt(h) - 0.8 + gauss() * 0.15;
  const load = 380 + 9.5 * Math.max(0, amb - 26) + (work ? 520 : 60) + gauss() * 12;
  // CH-T2 out for annual PPM 22 Sep 07:00–15:00 (planned): CH-T3 standby covers it
  const t2out = ms >= L(2026, 9, 22, 7) && ms < L(2026, 9, 22, 15);
  const n = load > 1020 ? 3 : load > 520 ? 2 : 1;
  const st = { t1: 1, t2: n >= 2 && !t2out ? 1 : 0, t3: n >= 3 || (t2out && n >= 2) ? 1 : 0 };
  const running = st.t1 + st.t2 + st.t3;
  const kwTr = 0.62 + 0.004 * Math.max(0, amb - 30);
  const each = load / running;
  const changeover = t2out && hr === 7;
  const chws = 6.5 + (changeover ? 1.6 : 0) + gauss() * 0.1;
  const zrow = {};
  for (const [id, sp] of Object.entries(zHq)) {
    const vavFault = id === "Z-L14" && ms >= L(2026, 9, 13) && ms < L(2026, 9, 17, 12) && work; // VAV damper actuator fault, fixed 17 Sep
    const target = work ? sp + 0.3 + (vavFault ? 2.6 : 0) + (changeover ? 0.6 : 0) : sp + 1.8;
    zHqT[id] = zHqT[id] + (target - zHqT[id]) * 0.6 + gauss() * 0.07;
    zrow[id.toLowerCase().replace("-", "_") + "_c"] = round(zHqT[id], 1);
  }
  hq.push({
    ts: tsOf(h),
    ambient_c: round(amb, 1),
    load_tr: Math.round(load),
    cht1_status: st.t1,
    cht1_kw: Math.round(st.t1 ? each * kwTr : 0),
    cht2_status: st.t2,
    cht2_kw: Math.round(st.t2 ? each * kwTr : 0),
    cht3_status: st.t3,
    cht3_kw: Math.round(st.t3 ? each * kwTr : 0),
    chws_c: round(chws, 1),
    ...zrow,
  });
}
fs.writeFileSync(path.join(DIR, "bms-hq-hourly.csv"), toCsv(hq));

/* ───────────── complaints (23 in Aug–Sep + 2 in early Oct) ───────────── */
// Sep complaints are anchored to the computed trips (minutes after the trip); Aug ones precede the BMS window.
const T = (i, plus) => {
  const t = trips[i];
  return isoMin(Date.parse(t.at.replace("+04:00", "Z")) + plus * 60000);
};
const C = [
  // August (before the BMS extract)
  ["2026-08-04T15:42:00+04:00", "Z-LF", "MNDA Smart app", "ar", "النادي الرياضي للسيدات حار جداً اليوم العصر، المكيف ما يبرد أبداً والمدربة اضطرت توقف الكلاس. لو سمحتوا شوفوا الموضوع."],
  ["2026-08-11T16:05:00+04:00", "Z-MPH", "800 6632", "en", "Caller attending the summer camp closing ceremony reports the multipurpose hall is very hot, children uncomfortable. Asked for the AC to be checked."],
  ["2026-08-13T14:50:00+04:00", "Z-LF", "WhatsApp", "ar", "مرة ثانية الصالة حارة، درجة الحرارة على الجهاز ٢٨. شو صار على البلاغ السابق؟"],
  ["2026-08-18T15:20:00+04:00", "Z-MPH", "On-site feedback kiosk", "en", "Hall too hot during the afternoon session. Fans brought in but not enough."],
  ["2026-08-20T13:55:00+04:00", "Z-LF", "MNDA Smart app", "en", "Ladies gym is not cooling at all between 2 and 4 pm. Third time this month. Please fix before September classes start."],
  ["2026-08-25T16:40:00+04:00", "Z-MPH", "Email", "en", "As organiser of the Marsa Al Noor Volunteers meeting on 25 Aug I would like to log a complaint: the hall was uncomfortably warm (I would estimate above 27 °C) for most of the event."],
  ["2026-08-27T15:10:00+04:00", "Z-LF", "WhatsApp", "ar", "المكيف في النادي النسائي ضعيف جداً وقت الظهر. أبا أعرف متى بيتصلح؟ مشكورين."],
  // September (anchored to trips)
  [T(0, 52), "Z-MPH", "800 6632", "en", "Back-to-school fair visitor: the hall is extremely hot, several elderly visitors left early. Please send someone urgently."],
  [T(0, 95), "Z-LF", "MNDA Smart app", "ar", "الحرارة في النادي الرياضي للسيدات لا تُحتمل اليوم، والمكيف يطلع هوا حار."],
  [T(1, 70), "Z-MPH", "WhatsApp", "ar", "ثاني يوم على التوالي القاعة حارة في المعرض. الأطفال تعبوا من الحر. لو سمحتوا حلّوا المشكلة."],
  [T(2, 40), "Z-MPH", "On-site feedback kiosk", "en", "Table-tennis tournament — players complaining about heat and sweat on the tables. Hall temperature display shows 28."],
  [T(3, 35), "Z-MPH", "800 6632", "ar", "أنا من أولياء أمور المشاركين في مسابقة حفظ القرآن، القاعة حارة جداً والأولاد ما يقدرون يركزون. نرجو الإسراع."],
  [T(3, 80), "Z-LF", "MNDA Smart app", "en", "Ladies fitness AC off again?? It's half past two and the room is like an oven."],
  [T(5, 60), "Z-LF", "MNDA Smart app", "en", "Hot again in the ladies' gym this afternoon — this keeps happening on the hottest days. Is anyone looking at the root cause?"],
  [T(6, 45), "Z-LF", "WhatsApp", "ar", "الصالة النسائية حارة من بعد الظهر. نفس المشكلة كل أسبوع تقريباً."],
  [T(7, 55), "Z-MPH", "800 6632", "en", "Heritage workshop instructor reports the hall is too hot for the participants; asked whether the session should be moved."],
  [T(8, 50), "Z-MPH", "On-site feedback kiosk", "ar", "القاعة حارة جداً أثناء المحاضرة الصحية، ونحتاج تكييف أفضل."],
  [T(8, 95), "Z-LF", "MNDA Smart app", "ar", "للمرة الرابعة هذا الشهر النادي الرياضي للسيدات بدون تبريد وقت العصر. نرجو حل جذري للمشكلة."],
  [T(9, 30), "Z-LF", "WhatsApp", "en", "Ladies gym hot again, AC blowing warm air."],
  [T(10, 40), "Z-MPH", "Email", "en", "Volunteer induction on 28 Sep: the hall became very warm from around 3 pm and we had to shorten the programme. Please treat as a formal complaint."],
  ["2026-09-16T10:20:00+04:00", "Z-LIB", "MNDA Smart app", "en", "Library study room is far too cold in the morning, students wearing jackets. Can the temperature be raised a bit?"],
  ["2026-09-17T18:35:00+04:00", "Z-CLS", "On-site feedback kiosk", "ar", "قاعة الورش رقم ٢ خانقة والتهوية ضعيفة أثناء الدورة المسائية."],
  ["2026-09-24T11:05:00+04:00", "Z-MAJ", "800 6632", "en", "Majlis: stuffy and warm this morning, smell of damp near the AC grille."],
];
const tickets = C.map((c) => c[0]).sort();
const ticketNo = (iso) => {
  // CHC ticket numbers grow with contact volume (Aug ≈ 108k, Sep ≈ 124k, Oct ≈ 145k)
  const t = Date.parse(iso);
  const pts = [
    [L(2026, 8, 1), 108400],
    [L(2026, 9, 1), 124300],
    [L(2026, 10, 1), 145100],
    [L(2026, 10, 10), 151400],
  ];
  for (let i = 0; i < pts.length - 1; i++)
    if (t >= pts[i][0] - 4 * 3600000 && t < pts[i + 1][0]) return Math.round(pts[i][1] + ((t - pts[i][0]) / (pts[i + 1][0] - pts[i][0])) * (pts[i + 1][1] - pts[i][1]));
  return 150000;
};
const complaints = C.map(([at, zone, channel, lang, text]) => ({
  id: `CHC-2026-${ticketNo(at)}`,
  receivedAt: at,
  site: "AGC",
  zone,
  channel,
  lang,
  category: zone === "Z-LIB" ? "Comfort — too cold" : zone === "Z-CLS" || zone === "Z-MAJ" ? "Comfort — stuffy / ventilation" : "Comfort — too hot",
  text,
})).sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
// HQ complaints (VAV fault on L14, fixed 17 Sep)
complaints.push(
  { id: `CHC-2026-${ticketNo("2026-09-14T10:15:00+04:00")}`, receivedAt: "2026-09-14T10:15:00+04:00", site: "HQ", zone: "Z-L14", channel: "IT/FM self-service portal", lang: "en", category: "Comfort — too hot", text: "Meeting room 14.03 is warm all morning, thermostat set to 22 but reads 26." },
  { id: `CHC-2026-${ticketNo("2026-09-15T13:40:00+04:00")}`, receivedAt: "2026-09-15T13:40:00+04:00", site: "HQ", zone: "Z-L14", channel: "IT/FM self-service portal", lang: "ar", category: "Comfort — too hot", text: "الطابق 14 الجهة الشمالية حار منذ يومين، نرجو المعالجة." },
  { id: `CHC-2026-${ticketNo("2026-09-16T09:05:00+04:00")}`, receivedAt: "2026-09-16T09:05:00+04:00", site: "HQ", zone: "Z-L14", channel: "IT/FM self-service portal", lang: "en", category: "Comfort — too hot", text: "Still hot on 14th floor open office (north side)." },
);
complaints.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
fs.writeFileSync(path.join(DIR, "complaints.json"), JSON.stringify(complaints, null, 2));
const agc = complaints.filter((c) => c.site === "AGC");
console.log(
  "complaints AGC Aug",
  agc.filter((c) => c.receivedAt.startsWith("2026-08")).length,
  "Sep",
  agc.filter((c) => c.receivedAt.startsWith("2026-09")).length,
  "Oct",
  agc.filter((c) => c.receivedAt.startsWith("2026-10")).length,
);

/* ───────────── work orders (Raseen FM jobs under MNDA/CON/2023/019) ───────────── */
const jobs = [];
let jn = 3912;
const job = (o) => jobs.push({ id: `JOB-RFM-26-${String(o.no ?? jn++).padStart(5, "0")}`, contract: "MNDA/CON/2023/019", ...o, no: undefined });
const techs = ["Arun Pillai", "Ramesh Kumar", "Jomon Varghese", "Imran Siddiqui"];
// one reactive job per trip day (the 9 Sep double trip is one job)
const tripDays = [...new Set(sepTrips.map((t) => t.at.slice(0, 10)))];
tripDays.forEach((day, i) => {
  const t = sepTrips.find((x) => x.at.startsWith(day));
  const raised = Date.parse(t.at.replace("+04:00", "Z")) + (6 + Math.floor(r() * 18)) * 60000;
  const respH = RESP_H[i] ?? 3.5;
  const responded = raised + respH * 3600000;
  const done = responded + (25 + Math.floor(r() * 30)) * 60000;
  const tech = techs[i % 3 === 0 ? 0 : i % 3];
  const note =
    i === 6
      ? "Reset HP trip on CH-02. Condenser coils visibly dusty and partly blocked with sand on the lower rows — recommend coil cleaning (PPM overdue since 15 Aug). Chiller restarted, monitored 30 min."
      : i === 3
        ? "Two HP trips today (second after reset). Reset and restarted. Discharge pressure high at full load. Advised to keep CH-02 on reduced load during peak — not possible with hall booked."
        : "Reset high-discharge-pressure trip on CH-02, chiller restarted and monitored 30 min. No fault found.";
  job({
    title: "CH-02 tripped — high discharge pressure",
    titleAr: "توقف المبرد CH-02 — ارتفاع ضغط التصريف",
    site: "AGC",
    asset: "CH-02",
    zone: "Plant yard",
    priority: "P2",
    source: "BMS alarm",
    raisedAt: isoMin(raised),
    respondedAt: isoMin(responded),
    completedAt: isoMin(done),
    status: "Closed",
    technician: tech,
    resolution: note,
  });
});
// other reactive / PPM jobs for realism
const misc = [
  ["2026-09-03T09:40", "AGC", "AHU-06", "Z-LIB", "P3", "Library supply air too cold — adjust setpoint", "Setpoint raised 21.5 → 23 °C; damper checked.", 20.5, 1.2],
  ["2026-09-16T10:45", "AGC", "AHU-06", "Z-LIB", "P3", "Library too cold — complaint CHC follow-up", "Re-balanced VAV, setpoint 23.5 °C.", 22.0, 0.8],
  ["2026-09-05T11:10", "AGC", "WC-G-03", "Z-LOB", "P3", "Ladies' washroom flush valve leaking", "Replaced flush valve diaphragm.", 26.0, 0.7],
  ["2026-09-11T08:20", "AGC", "LT-MPH", "Z-MPH", "P3", "Two stage lights not working", "Replaced 2 × LED drivers.", 30.5, 1.5],
  ["2026-09-17T19:00", "AGC", "AHU-07", "Z-CLS", "P3", "Workshop 2 stuffy — check fresh air", "Fresh-air damper actuator stuck at 20%; freed and recalibrated.", 15.0, 1.1],
  ["2026-09-19T07:30", "AGC", "FAHU-01", "Plant room", "P4", "Quarterly FAHU filter change", "Pre-filters and bag filters replaced.", 0, 3.0],
  ["2026-09-24T11:30", "AGC", "AHU-08", "Z-MAJ", "P2", "Majlis AHU condensate tray blocked — damp smell", "Cleared drain, cleaned tray, biocide tablet added.", 3.1, 1.4],
  ["2026-09-26T16:50", "AGC", "ACS-01", "Z-LOB", "P2", "Main entrance access-control door not releasing", "Replaced maglock power supply.", 2.4, 0.9],
  ["2026-10-02T09:15", "AGC", "P-02", "Plant room", "P3", "CHW pump P-02 mechanical seal weeping", "Seal replaced; scheduled vibration check.", 23.0, 2.6],
  ["2026-09-14T10:40", "HQ", "VAV-14-07", "Z-L14", "P3", "Level 14 north office warm — VAV not opening", "Actuator failed; replaced 17 Sep (part on order).", 1.8, 3.2],
  ["2026-09-22T07:00", "HQ", "CH-T2", "Plant room", "P4", "CH-T2 annual PPM (planned outage 07:00–15:00)", "Annual service completed; CH-T3 covered load.", 0, 8.0],
  ["2026-09-29T13:20", "HQ", "LIFT-03", "Core", "P2", "Lift 3 stopping between floors", "Door operator re-adjusted, OEM informed.", 1.1, 1.6],
  ["2026-10-05T08:05", "HQ", "WC-11-02", "Z-L09", "P3", "Pantry tap leaking level 11", "Cartridge replaced.", 4.2, 0.5],
];
for (const [at, site, asset, zone, pr, title, res, respH, durH] of misc) {
  const raised = Date.parse(at + ":00Z");
  job({
    title,
    site,
    asset,
    zone,
    priority: pr,
    source: pr === "P4" ? "PPM schedule" : "Complaint / helpdesk",
    raisedAt: isoMin(raised),
    respondedAt: isoMin(raised + respH * 3600000),
    completedAt: isoMin(raised + (respH + durH) * 3600000),
    status: "Closed",
    technician: techs[Math.floor(r() * techs.length)],
    resolution: res,
  });
}
// the recurring-fault job (R7, solution 19)
job({
  no: 4471,
  title: "CH-02 high discharge pressure trip — Al Ghaf Community Centre",
  titleAr: "توقف المبرد CH-02 بسبب ارتفاع ضغط التصريف — مركز الغاف المجتمعي",
  site: "AGC",
  asset: "CH-02",
  zone: "Plant yard",
  priority: "P2",
  source: "Recurring alarm — raised by Raseen FM supervisor",
  raisedAt: "2026-09-30T08:35:00+04:00",
  respondedAt: "2026-09-30T10:05:00+04:00",
  completedAt: isoMin(CLEAN_AT),
  status: "Completed by contractor — awaiting MNDA verification",
  technician: "Arun Pillai",
  supervisor: "Mohammed Rafiq",
  resolution:
    "Diagnosis 30 Sep: condenser coils fouled with sand/dust (lower third of coil face blocked); condenser fan 3 vibration slightly high. Recommended chemical coil cleaning on both chillers. CH-02 coil clean planned for Tue 6 Oct 06:30 (low load window). 6 Oct: CH-02 coils chemically cleaned 06:30–11:40, chiller back in service (completion report in RFM Connect). CH-01 coil clean not yet scheduled.",
});
jobs.sort((a, b) => a.raisedAt.localeCompare(b.raisedAt));
fs.writeFileSync(path.join(DIR, "work-orders.json"), JSON.stringify(jobs, null, 2));

/* contractor completion feed (RFM Connect) — what Raseen reports when work is finished */
const at38 = (pre) => {
  const x = rows.filter((q) => q.ch02_status === 1 && q.ambient_c >= 37.5 && q.ambient_c < 38.5 && (pre ? q.ts < "2026-10-06T06" && q.ts >= "2026-09-25" : q.ts >= "2026-10-06T12"));
  return Math.round(x.reduce((a, q) => a + q.ch02_dp_kpa, 0) / x.length);
};
const pre38 = at38(true);
const post38 = at38(false);
const feed = [
  {
    job: "JOB-RFM-26-04471",
    reportedAt: "2026-10-06T12:05:00+04:00",
    workStart: "2026-10-06T06:30:00+04:00",
    workEnd: isoMin(CLEAN_AT),
    technician: "Arun Pillai",
    supervisor: "Mohammed Rafiq",
    summary:
      `CH-02 condenser coils chemically cleaned (alkaline coil cleaner, low-pressure rinse), all 4 condenser fans checked, fan 3 bearing greased. Chiller returned to service 11:40. Pre-clean discharge pressure at ~38 °C ambient: ${pre38.toLocaleString("en")} kPa; post-clean at ~38 °C: ${post38.toLocaleString("en")} kPa. CH-01 coil clean to follow (requires CH-02 to carry load).`,
    photos: 6,
  },
];
fs.writeFileSync(path.join(DIR, "contractor-feed.json"), JSON.stringify(feed, null, 2));
fs.writeFileSync(path.join(DIR, "bookings.json"), JSON.stringify(bookings, null, 2));
fs.writeFileSync(path.join(DIR, "trips.json"), JSON.stringify(trips.map(({ hourIndex, ...t }) => t), null, 2));
console.log("bookings", bookings.length, "jobs", jobs.length, "kwh oct", Math.round(kwh.oct));

/* ───────────── monthly chiller energy (Al Ghaf) — Sep values are the computed sums above ───────────── */
{
  const shape = [0.36, 0.38, 0.47, 0.62, 0.81, 0.93, 1.0, 1.02, 0.9, 0.7, 0.5, 0.39]; // relative to July
  const jul25 = Math.round(tot25 / 0.9);
  const m25 = shape.map((x, i) => (i === 8 ? tot25 : Math.round(jul25 * x * (1 + (r() - 0.5) * 0.03))));
  const uplift = [1.03, 1.02, 1.04, 1.03, 1.04, 1.05, 1.04, 1.09];
  const m26 = m25.slice(0, 8).map((v, i) => Math.round(v * uplift[i]));
  m26.push(Math.round(kwh.sep));
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const energy = {
    site: "AGC",
    unit: "kWh (chillers CH-01 + CH-02)",
    tariffAedPerKwh: 0.32,
    months: months.map((m, i) => ({ month: m, y2025: m25[i], y2026: m26[i] ?? null })),
    oct2026PartialKwh: Math.round(kwh.oct),
    note: "September 2026 is the sum of the hourly BMS series; September 2025 is the sum of the daily 2025 export.",
  };
  fs.writeFileSync(path.join(DIR, "energy-monthly.json"), JSON.stringify(energy, null, 2));
  console.log("energy months", energy.months.slice(6, 9));
}

