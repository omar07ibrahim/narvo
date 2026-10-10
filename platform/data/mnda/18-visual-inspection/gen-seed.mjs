// Builds the 18-visual-inspection seed records (inspections, findings, tasks, notices) from the compact
// definitions below. Due dates follow CSSR-2025 Art. 31 (same logic as _lib/rules.ts).
// Usage: node data/mnda/18-visual-inspection/gen-seed.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const tax = JSON.parse(fs.readFileSync(path.join(dir, "taxonomy.json"), "utf8"));
const reg = JSON.parse(fs.readFileSync(path.join(dir, "registry.json"), "utf8"));
const IMG = "/demo/18-visual-inspection/";
const insp = (n) => reg.inspectors[n];
const DAY = 86400000;
const HOL = new Set(["2026-12-01", "2026-12-02", "2026-12-03"]);
const uae = (ms) => new Date(ms + 4 * 3600000).toISOString();
const ms = (s) => Date.parse(s);

function due(servedIso, sev) {
  const t0 = ms(servedIso);
  const r = tax.severities[sev];
  if (r.dueBasis === "calendar") return uae(t0 + DAY).slice(0, 19) + "+04:00";
  let t = t0;
  let n = 0;
  while (n < r.dueDays) {
    t += DAY;
    const d = new Date(t + 4 * 3600000);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6 || HOL.has(d.toISOString().slice(0, 10))) continue;
    n++;
  }
  return `${uae(t).slice(0, 10)}T23:59:00+04:00`;
}

const P = {
  A1: { id: "MNDA-INS-2026-07114", date: "2026-10-08T09:20:00+04:00", end: "2026-10-08T10:35:00+04:00", plot: "MN-08-204-0012", project: "Marina Quarter Tower B (B+G+24) — structural frame, level 9", project_ar: "برج حي المارينا B (قبو+أرضي+24) — الهيكل الإنشائي، الطابق التاسع", permit: "MNDA-BP-2026-01644", contractor: 0, consultant: 0, inspector: 0, type: "Routine", status: "awaiting_review", photo: "site-01-slab-edge-no-protection.jpg", caption: "Level 9, north perimeter at grid 4/A–F, facing south", caption_ar: "الطابق التاسع، المحيط الشمالي عند المحور 4/A–F، باتجاه الجنوب", note: "Rebar fixing for level 10 beams in progress. Worker at the slab edge during the visit. Same plot had an edge-protection notice on 3 Sep (MNDA-VN-2026-01341).", note_ar: "أعمال تركيب حديد كمرات الطابق العاشر جارية، وكان أحد العمال عند حافة البلاطة أثناء الزيارة. صدر للقطعة نفسها إشعار يتعلق بحماية الحواف في 3 سبتمبر (MNDA-VN-2026-01341).", weather: "34 °C, clear, wind 18 km/h" },
  A2: { id: "MNDA-INS-2026-07128", date: "2026-10-08T11:05:00+04:00", end: "2026-10-08T11:50:00+04:00", plot: "MN-02-041-0112", project: "Al Murjan — G+2 residential building, façade cladding", project_ar: "المرجان — مبنى سكني أرضي+طابقين، تكسية الواجهات", permit: "MNDA-BP-2026-01487", contractor: 5, consultant: 1, inspector: 1, type: "Routine", status: "awaiting_review", photo: "site-04-facade-scaffold-platform.jpg", caption: "East elevation, working lift at 2nd floor, taken from neighbouring roof", caption_ar: "الواجهة الشرقية، منصة العمل في الطابق الثاني، من سطح مبنى مجاور", note: "Three workers on a tube scaffold lift. Check guardrails, toe boards and scaffold tag. Spoil and rubble on the open plot to the west.", note_ar: "ثلاثة عمال على منصة سقالة أنبوبية. يُتحقق من الدرابزين وألواح القدم وبطاقة الفحص. توجد مخلفات وأنقاض في الأرض المفتوحة غرباً.", weather: "35 °C, haze" },
  A3: { id: "MNDA-INS-2026-07142", date: "2026-10-09T10:30:00+04:00", end: "2026-10-09T11:10:00+04:00", plot: "MN-01-008-0033", project: "Downtown — enabling works for mixed-use tower", project_ar: "وسط المدينة — الأعمال التمهيدية لبرج متعدد الاستخدامات", permit: "MNDA-BP-2026-01702", contractor: 2, consultant: 3, inspector: 2, type: "Complaint follow-up", status: "awaiting_review", photo: "site-12-collapsed-hoarding.jpg", caption: "Site perimeter on the service road, south boundary", caption_ar: "محيط الموقع على الطريق الخدمي، الحد الجنوبي", note: "Follow-up to Customer Happiness complaint CHC-2026-122318: 'site fence fallen onto the pavement since Thursday night'. Excavators working on spoil mound.", note_ar: "متابعة لبلاغ مركز سعادة المتعاملين CHC-2026-122318: «سقط سياج الموقع على الرصيف منذ ليلة الخميس». الحفارات تعمل على كومة ناتج الحفر.", weather: "33 °C, overcast" },
  A4: { id: "MNDA-INS-2026-07156", date: "2026-10-09T13:15:00+04:00", end: "2026-10-09T14:00:00+04:00", plot: "MN-08-198-0004", project: "Marina Quarter residential tower — podium columns", project_ar: "برج سكني في حي المارينا — أعمدة المنصة", permit: "MNDA-BP-2026-01391", contractor: 1, consultant: 0, inspector: 0, type: "Routine", status: "awaiting_review", photo: "site-08-formwork-worker-sandals.jpg", caption: "Podium level 2, column formwork at grid C/7", caption_ar: "المنصة الطابق 2، قوالب الأعمدة عند المحور C/7", note: "Steel fixers and carpenters on column formwork; worker crossing on a scaffold tube.", note_ar: "عمال حديد ونجارون على قوالب الأعمدة؛ أحد العمال يعبر على أنبوب سقالة.", weather: "36 °C" },
  A5: { id: "MNDA-INS-2026-07163", date: "2026-10-09T15:40:00+04:00", end: "2026-10-09T16:30:00+04:00", plot: "MN-06-023-0009", project: "Al Sidr Community Majlis — extension and dome (MNDA project)", project_ar: "مجلس مجتمع السدر — التوسعة والقبة (مشروع الهيئة)", permit: "MNDA-BP-2026-00918", contractor: 4, consultant: 2, inspector: 3, type: "Routine", status: "awaiting_review", photo: "site-07-lowrise-frame-blockwork.jpg", caption: "Front elevation from the car park, roof slab pour preparation", caption_ar: "الواجهة الأمامية من الموقف، التحضير لصب بلاطة السطح", note: "Roof slab edge with workers; starter bars along the perimeter; block stacks near the entrance. Gate pass via Sidr Communities LLC.", note_ar: "عمال على حافة بلاطة السطح، وأشاير حديد على المحيط، وأكوام طابوق قرب المدخل. الدخول بتصريح من شركة السدر للمجتمعات.", weather: "34 °C, dusty" },
  N1: { id: "MNDA-INS-2026-06948", date: "2026-09-29T09:40:00+04:00", end: "2026-09-29T10:45:00+04:00", plot: "MN-05-031-0007", project: "Ras Al Marsa — G+1 logistics building, slab and columns", project_ar: "رأس المرسى — مبنى لوجستي أرضي+طابق، البلاطات والأعمدة", permit: "MNDA-BP-2026-01295", contractor: 3, consultant: 1, inspector: 2, type: "Routine", status: "notice_issued", photo: "site-06-multistorey-frame-rebar.jpg", caption: "First-floor slab and column starters, west bay", caption_ar: "بلاطة الطابق الأول وأشاير الأعمدة، الجناح الغربي", note: "Uncapped starters along the walkway to the ground-floor store; aggregate and debris in the basement bay.", note_ar: "أشاير غير مغطاة على طول ممر المخزن الأرضي، وركام ومخلفات في القبو.", weather: "37 °C" },
  N2: { id: "MNDA-INS-2026-07012", date: "2026-10-02T14:20:00+04:00", end: "2026-10-02T15:05:00+04:00", plot: "MN-08-210-0003", project: "Marina Quarter — retail pavilion steel roof", project_ar: "حي المارينا — السقف الفولاذي لجناح التجزئة", permit: "MNDA-BP-2026-01518", contractor: 2, consultant: 0, inspector: 3, type: "Routine", status: "notice_issued", photo: "site-14-crane-lift-silhouette.jpg", caption: "Truss lift onto column C3, viewed from the south", caption_ar: "رفع جملون على العمود C3، من الجنوب", note: "Erector guiding a suspended truss by hand from the column head; no exclusion zone or banksman visible.", note_ar: "عامل تركيب يوجه جملوناً معلقاً بيده من رأس العمود دون منطقة حظر أو مُرشد رفع ظاهر.", weather: "39 °C at 14:20" },
  N3: { id: "MNDA-INS-2026-07055", date: "2026-10-05T10:15:00+04:00", end: "2026-10-05T11:00:00+04:00", plot: "MN-02-041-0088", project: "Al Murjan — villa extension, first floor plastering", project_ar: "المرجان — توسعة فيلا، لياسة الطابق الأول", permit: "MNDA-BP-2026-01433", contractor: 5, consultant: 2, inspector: 1, type: "Routine", status: "notice_issued", photo: "site-03-timber-pole-scaffold.jpg", caption: "Rear elevation, pole scaffold and ladder to first floor", caption_ar: "الواجهة الخلفية، سقالة أعمدة وسلم إلى الطابق الأول", note: "Improvised pole scaffold without boarding or guardrails; aluminium ladder resting on a cross-pole.", note_ar: "سقالة أعمدة مرتجلة دون ألواح أو درابزين؛ سلم ألمنيوم مستند إلى عمود عرضي.", weather: "35 °C" },
  N4: { id: "MNDA-INS-2026-07078", date: "2026-10-06T11:40:00+04:00", end: "2026-10-06T12:20:00+04:00", plot: "MN-07-112-0201", project: "Al Ghaf Community — sewer house connections, Street 14", project_ar: "مجتمع الغاف — توصيلات الصرف المنزلية، الشارع 14", permit: "MNDA-BP-2026-01560", contractor: 3, consultant: 3, inspector: 2, type: "Routine", status: "notice_issued", photo: "site-10-sewer-trench-workers.jpg", caption: "Trench at chainage 0+085, facing north (faces blurred)", caption_ar: "الخندق عند المسافة 0+085، باتجاه الشمال (الوجوه مموهة)", note: "Trench about 2.1 m deep with partial timber shoring; no barriers; several workers barefoot on the edge.", note_ar: "خندق بعمق 2.1 م تقريباً مع تدعيم خشبي جزئي؛ دون حواجز؛ عدة عمال حفاة على الحافة.", weather: "36 °C" },
  N5: { id: "MNDA-INS-2026-07091", date: "2026-10-08T07:50:00+04:00", end: "2026-10-08T08:40:00+04:00", plot: "MN-01-015-0002", project: "Downtown — two-level basement for hotel (drone survey)", project_ar: "وسط المدينة — قبو من طابقين لفندق (مسح بطائرة مسيّرة)", permit: "MNDA-BP-2026-01247", contractor: 1, consultant: 3, inspector: 3, type: "Routine", status: "notice_issued", photo: "site-11-basement-excavation-aerial.jpg", caption: "Drone image from 35 m, north up", caption_ar: "صورة جوية من ارتفاع 35 م، الشمال للأعلى", note: "Pile cap excavations flooded and unbarricaded; rebar bundles laid at the excavation edge.", note_ar: "حفر قواعد الخوازيق مغمورة بالمياه ودون حواجز؛ حزم حديد موضوعة على حافة الحفر.", weather: "33 °C, humid" },
  C1: { id: "MNDA-INS-2026-06862", date: "2026-09-23T08:30:00+04:00", end: "2026-09-23T09:20:00+04:00", plot: "MN-04-117-0031", project: "Al Waha Gardens — citizen villa, first-floor columns", project_ar: "حدائق الواحة — فيلا مواطن، أعمدة الطابق الأول", permit: "MNDA-BP-2026-00231", contractor: 3, consultant: 2, inspector: 0, type: "Routine", status: "closed", photo: "site-05-column-starter-bars.jpg", caption: "Roof of ground floor, column starters C1–C9", caption_ar: "سطح الطابق الأرضي، أشاير الأعمدة C1–C9", note: "All column starters uncapped; steel fixer without helmet.", note_ar: "جميع أشاير الأعمدة غير مغطاة؛ عامل حديد دون خوذة.", weather: "40 °C" },
  C2: { id: "MNDA-INS-2026-06811", date: "2026-09-18T09:10:00+04:00", end: "2026-09-18T09:55:00+04:00", plot: "MN-04-109-0062", project: "Al Waha Gardens — citizen villa, strip foundations", project_ar: "حدائق الواحة — فيلا مواطن، الأساسات الشريطية", permit: "MNDA-BP-2026-01102", contractor: 4, consultant: 1, inspector: 1, type: "Routine", status: "closed", photo: "site-09-foundation-trenches.jpg", caption: "Foundation trenches, view from the east boundary", caption_ar: "خنادق الأساسات، من الحد الشرقي", note: "Open foundation trenches without barriers next to the access path; bricks and spoil at the edges.", note_ar: "خنادق أساسات مفتوحة دون حواجز بجوار ممر الدخول؛ طوب وناتج حفر على الحواف.", weather: "41 °C" },
};

// Findings: [key, code, title, description, bbox, confidence, source, status, rejectReason]
const F = [
  ["N1", "D04", "Uncapped column starter bars along walkway", "Rows of protruding column starters in the left foreground beside the walkway to the ground-floor store, none capped.", [0.0, 0.63, 0.35, 1.0], 0.91, "ai", "accepted"],
  ["N1", "D05", "Aggregate heap and debris in basement bay", "Loose aggregate heap, bags and offcuts under the first-floor slab, centre-bottom of the photo.", [0.35, 0.81, 0.58, 1.0], 0.74, "ai", "accepted"],
  ["N1", "D01", "First-floor slab edge without guardrail", "Open edge of the first-floor slab running across the centre of the photo.", [0.0, 0.5, 0.57, 0.63], 0.62, "ai", "rejected", "R1"],
  ["N2", "D13", "Suspended truss guided by hand, no exclusion zone", "Truss suspended from the crane hook (centre) being guided by an erector reaching from the column head; no barricade or banksman visible.", [0.28, 0.33, 0.66, 1.0], 0.86, "ai", "accepted"],
  ["N2", "D02", "Erector at height without visible harness", "Worker standing on the column head on the right with no full-body harness or lanyard visible.", [0.67, 0.37, 0.8, 0.62], 0.71, "ai", "accepted"],
  ["N3", "D03", "Pole scaffold without boarding or guardrails", "Improvised pole scaffold across the façade: working lifts are single poles, no boarding, guardrails or toe boards; workers on the cross-poles.", [0.0, 0.1, 1.0, 0.82], 0.93, "ai", "accepted"],
  ["N3", "D09", "Ladder resting on a cross-pole, not secured", "Aluminium ladder (right of centre) leaning on a scaffold cross-pole without tie or footing.", [0.69, 0.55, 0.78, 1.0], 0.82, "ai", "accepted"],
  ["N3", "D05", "Debris near the ground-floor entrance", "Possible loose material by the doorway at the bottom of the photo.", [0.3, 0.9, 0.52, 1.0], 0.41, "ai", "rejected", "R3"],
  ["N4", "D07", "2.1 m trench, partial shoring, no edge barriers", "Deep trench in the centre with timber shoring on one side only; spoil heaped at both edges and no barrier along the walkway.", [0.2, 0.3, 0.72, 1.0], 0.89, "ai", "accepted"],
  ["N4", "D02", "Barefoot workers at the trench edge", "Workers on the left of the trench standing barefoot on the spoil and planks at the edge.", [0.0, 0.14, 0.25, 0.65], 0.84, "ai", "accepted"],
  ["N5", "D07", "Flooded pile-cap excavations without barriers", "Two open pile-cap excavations in the centre, flooded, with no barrier or cover; workers walking along the edges.", [0.34, 0.39, 0.89, 0.63], 0.88, "ai", "accepted"],
  ["N5", "D05", "Waste and loose materials across the site", "Bags, offcuts, plastic and rubble scattered around the excavations and access route.", [0.15, 0.17, 0.85, 0.4], 0.69, "ai", "accepted"],
  ["N5", "D11", "Rebar bundles stored at the excavation edge", "Rebar bundles laid along the left edge of the excavation, within 1 m of the drop.", [0.26, 0.4, 0.33, 0.76], null, "reviewer", "accepted"],
  ["C1", "D04", "Column starters C1–C9 uncapped", "All column starter cages on the roof of the ground floor without caps; steel fixer working between them.", [0.02, 0.33, 0.95, 0.93], 0.92, "ai", "accepted"],
  ["C1", "D02", "Steel fixer without safety helmet", "Worker at the centre column wearing a brimmed hat instead of a safety helmet.", [0.43, 0.74, 0.48, 0.93], 0.79, "ai", "accepted"],
  ["C2", "D07", "Open foundation trenches without barriers", "Network of strip-foundation trenches about 1.3 m deep with no barriers beside the access path.", [0.0, 0.25, 0.62, 0.95], 0.9, "ai", "accepted"],
  ["C2", "D11", "Bricks and spoil stacked at trench edges", "Bricks and loose spoil placed directly on the trench edges in the foreground.", [0.44, 0.64, 0.7, 0.76], 0.66, "ai", "accepted"],
];

const SERVE_OFFSET_H = 4; // notices served ~4 h after the visit, after inspector review
const closures = {
  "N2-D13": { at: "2026-10-03T09:30:00+04:00", how: "Re-inspection: lift plan issued, exclusion zone barricaded and certified banksman on duty." },
  "N3-D03": { at: "2026-10-06T08:45:00+04:00", how: "Re-inspection: pole scaffold dismantled; system scaffold with boarded lifts, guardrails and toe boards erected, green tag dated 6 Oct." },
  "N4-D07": { at: "2026-10-07T09:20:00+04:00", how: "Re-inspection: trench shored both sides and barriers installed 1 m from the edge." },
  "C1-D04": { at: "2026-09-25T10:10:00+04:00", how: "Photo review: mushroom caps fitted on all starters (contractor photo via e-services).", thumb: IMG + "after-rebar-caps.jpg" },
  "C1-D02": { at: "2026-09-24T08:00:00+04:00", how: "Re-inspection: all operatives in helmets and safety boots." },
  "C2-D07": { at: "2026-09-19T09:30:00+04:00", how: "Re-inspection: rigid barriers 1 m back from trench edges along the access path." },
  "C2-D11": { at: "2026-09-21T11:15:00+04:00", how: "Re-inspection: bricks restacked 1.5 m from the trenches on level ground." },
};
const submissions = {
  "N1-D04": { src: IMG + "after-rebar-caps.jpg", submittedAt: "2026-10-01T16:20:00+04:00", by: "Eng. Khaled Mustafa Odeh (Al Marsa Engineering & Contracting)", note: "Caps fitted to all exposed starters along the store walkway." },
  "N5-D07": { src: IMG + "after-excavation-barrier.jpg", submittedAt: "2026-10-09T09:40:00+04:00", by: "Mohammed Saif Bin Hilal (Bin Hilal Contracting)", note: "Mesh barriers installed around the excavation and pedestrian route signed." },
};

const inspections = [];
const findings = [];
const tasks = [];
const notices = [];
let fSeq = 0;
let tSeq = 30212;
let vSeq = 1352;
const order = ["C2", "C1", "N1", "N2", "N3", "N4", "N5"];
const fmt = (iso, lang) =>
  new Intl.DateTimeFormat(lang === "ar" ? "ar-AE-u-nu-latn" : "en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Dubai" }).format(new Date(iso));

for (const [key, p] of Object.entries(P)) {
  inspections.push({
    id: p.id,
    date: p.date,
    end: p.end,
    plot: p.plot,
    district: p.plot.slice(0, 5),
    project: p.project,
    project_ar: p.project_ar,
    permit: p.permit,
    contractor: reg.contractors[p.contractor].name,
    consultant: reg.consultants[p.consultant],
    inspector: insp(p.inspector),
    type: p.type,
    photos: [{ src: IMG + p.photo, caption: p.caption, caption_ar: p.caption_ar, credit: "Wikimedia Commons — see CREDITS.md" }],
    status: p.status,
    note: p.note,
    note_ar: p.note_ar,
    weather: p.weather,
  });
}
for (const key of order) {
  const p = P[key];
  const served = uae(ms(p.date) + SERVE_OFFSET_H * 3600000).slice(0, 19) + "+04:00";
  const fs_ = F.filter((f) => f[0] === key);
  const noticeId = `MNDA-VN-2026-0${vSeq}`;
  vSeq += key === "N5" ? 2 : 3;
  const accepted = [];
  for (const f of fs_) {
    const id = `F-S${String(++fSeq).padStart(3, "0")}`;
    const rec = {
      id,
      inspectionId: p.id,
      photo: 0,
      code: f[1],
      title: f[2],
      description: f[3],
      bbox: f[4],
      confidence: f[5],
      source: f[6],
      status: f[7],
      reviewer: insp(p.inspector).name,
      reviewedAt: ms(p.end) + 2 * 3600000,
      createdAt: ms(p.end) + 1800000,
      ...(f[8] ? { rejectReason: f[8] } : {}),
    };
    findings.push(rec);
    if (rec.status === "accepted") accepted.push(rec);
  }
  let total = 0;
  const rows = [];
  for (const f of accepted) {
    const d = tax.defects.find((x) => x.code === f.code);
    const sev = d.severity;
    const penalty = tax.severities[sev].penaltyAed;
    total += penalty;
    const k = `${key}-${f.code}`;
    const c = closures[k];
    const task = {
      id: `CT-2026-${tSeq++}`,
      inspectionId: p.id,
      findingId: f.id,
      noticeId,
      code: f.code,
      severity: sev,
      title: f.title,
      owner: reg.contractors[p.contractor].name,
      plot: p.plot,
      dueAt: due(served, sev),
      penaltyAed: penalty,
      status: c ? "closed" : "open",
      createdAt: ms(served),
      ...(c ? { closure: { verdict: "resolved", confidence: 1, summary: c.how, remaining: [], ...(c.thumb ? { afterThumb: c.thumb } : {}), decision: "closed", reason: c.how, decidedBy: insp(p.inspector).name, decidedAt: ms(c.at) } } : {}),
      ...(submissions[k] ? { submission: submissions[k] } : {}),
    };
    tasks.push(task);
    rows.push({ d, f, task });
  }
  const table = (lang) =>
    rows
      .map(({ d, f, task }, i) => `| ${i + 1} | ${d.code} — ${lang === "ar" ? d.name_ar : d.name}: ${f.title} | ${lang === "ar" ? d.article.replace("Art.", "المادة") : d.article} | ${tax.severities[task.severity][lang === "ar" ? "ar" : "en"]} | ${fmt(task.dueAt, lang)} | ${lang === "ar" ? `${task.penaltyAed.toLocaleString("en-US")} درهم` : `AED ${task.penaltyAed.toLocaleString("en-US")}`} |`)
      .join("\n");
  const c = reg.contractors[p.contractor];
  const textEn = [
    `## Notice of Violation ${noticeId}`,
    "**Marsa Al Noor Development Authority — Field Operations & Inspection Department**",
    "",
    `- **Inspection reference:** ${p.id} — ${fmt(p.date, "en")}`,
    `- **Plot:** ${p.plot} · **Building permit:** ${p.permit}`,
    `- **Main contractor:** ${c.name} (${c.licence})`,
    `- **Consultant:** ${reg.consultants[p.consultant]}`,
    "",
    "| No. | Code and finding | Article | Severity | Due | Penalty |",
    "|---|---|---|---|---|---|",
    table("en"),
    "",
    `**Total penalties:** AED ${total.toLocaleString("en-US")}`,
    "",
    "### Required corrective actions",
    ...rows.map(({ d }, i) => `${i + 1}. **${d.code}** — ${d.requirement}`),
    "",
    `Issued under the authority of the Director, Field Operations & Inspection — Eng. Hamad Juma Al Kaabi. Authorised inspector: ${insp(p.inspector).name} (${insp(p.inspector).id}). The Arabic text prevails.`,
  ].join("\n");
  const textAr = [
    `## إشعار مخالفة رقم ${noticeId}`,
    "**هيئة مرسى النور للتطوير — إدارة العمليات الميدانية والتفتيش**",
    "",
    `- **مرجع التفتيش:** ${p.id} — ${fmt(p.date, "ar")}`,
    `- **رقم القطعة:** ${p.plot} · **رخصة البناء:** ${p.permit}`,
    `- **المقاول الرئيسي:** ${c.name_ar} (${c.licence})`,
    `- **الاستشاري:** ${reg.consultants[p.consultant]}`,
    "",
    "| م | الرمز والملاحظة | المادة | الدرجة | موعد التصحيح | الغرامة |",
    "|---|---|---|---|---|---|",
    table("ar"),
    "",
    `**إجمالي الغرامات:** ${total.toLocaleString("en-US")} درهم`,
    "",
    "### الإجراءات التصحيحية المطلوبة",
    ...rows.map(({ d }, i) => `${i + 1}. **${d.code}** — ${d.requirement_ar}`),
    "",
    `صدر بتفويض من مدير إدارة العمليات الميدانية والتفتيش — م. حمد جمعة الكعبي. المفتش المخوّل: ${insp(p.inspector).name_ar} (${insp(p.inspector).id}). يُعتد بالنص العربي عند الاختلاف.`,
  ].join("\n");
  notices.push({ id: noticeId, inspectionId: p.id, contractor: c.name, plot: p.plot, issuedAt: ms(served), approvedBy: "Eng. Hamad Juma Al Kaabi", textEn, textAr, penaltyTotal: total, stopWork: rows.some((r) => r.task.severity === "critical"), findingIds: accepted.map((f) => f.id) });
  const ins = inspections.find((i) => i.id === p.id);
  ins.noticeId = noticeId;
}

// Prior notice on the Marina Quarter Tower B plot (repeat history for A1) — older inspection, not in the current list
const prior = { id: "MNDA-INS-2026-06521", date: "2026-09-03T10:05:00+04:00" };
const priorNotice = "MNDA-VN-2026-01341";
for (const [code, sev, title, closedAt] of [
  ["D01", "critical", "Level 6 east slab edge open over 14 m", "2026-09-04T09:00:00+04:00"],
  ["D02", "major", "Two steel fixers at the slab edge without harness", "2026-09-05T10:30:00+04:00"],
]) {
  const served = "2026-09-03T14:00:00+04:00";
  tasks.push({
    id: `CT-2026-${tSeq++}`,
    inspectionId: prior.id,
    findingId: `F-P-${code}`,
    noticeId: priorNotice,
    code,
    severity: sev,
    title,
    owner: reg.contractors[0].name,
    plot: "MN-08-204-0012",
    dueAt: due(served, sev),
    penaltyAed: tax.severities[sev].penaltyAed,
    status: "closed",
    createdAt: ms(served),
    closure: { verdict: "resolved", confidence: 1, summary: "Re-inspection", remaining: [], decision: "closed", reason: "Re-inspection: guardrails with toe boards along the east edge; harness anchor line installed.", decidedBy: insp(0).name, decidedAt: ms(closedAt) },
  });
}
notices.push({ id: priorNotice, inspectionId: prior.id, contractor: reg.contractors[0].name, plot: "MN-08-204-0012", issuedAt: ms("2026-09-03T14:00:00+04:00"), approvedBy: "Eng. Hamad Juma Al Kaabi", textEn: `## Notice of Violation ${priorNotice}\n\nInspection ${prior.id} (3 September 2026) — D01 Art. 12.3 (Critical, AED 10,000) and D02 Art. 8.1 (Major, AED 5,000). Both closed on re-inspection.`, textAr: `## إشعار مخالفة رقم ${priorNotice}\n\nالتفتيش ${prior.id} (3 سبتمبر 2026) — D01 المادة 12.3 (حرجة، 10,000 درهم) وD02 المادة 8.1 (جسيمة، 5,000 درهم). أُغلقت كلتاهما بإعادة التفتيش.`, penaltyTotal: 15000, stopWork: true, findingIds: [] });

const w = (f, v) => fs.writeFileSync(path.join(dir, f), JSON.stringify(v, null, 2) + "\n");
w("inspections.json", inspections);
w("findings-seed.json", findings);
w("tasks-seed.json", tasks);
w("notices-seed.json", notices);
console.log(`inspections ${inspections.length}, findings ${findings.length}, tasks ${tasks.length}, notices ${notices.length}`);
for (const t of tasks) console.log(t.id, t.code, t.severity, t.dueAt, t.status, t.submission ? "SUB" : "");
