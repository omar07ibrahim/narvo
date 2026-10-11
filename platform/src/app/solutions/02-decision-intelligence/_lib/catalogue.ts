/**
 * KPI catalogue for the MNDA Director-General weekly review (solution 02).
 * Pure data — shared by server routes, the client workspace and the verification scripts.
 * Every value is computed from data/mnda/02-decision-intelligence/{daily,permits}.csv by engine.ts.
 */

export type Dept = "housing" | "permits" | "chc" | "inspection" | "finance" | "facilities" | "hr";
export type Unit = "count" | "pct" | "days" | "duration" | "aed" | "ratio";

export interface Bi {
  en: string;
  ar: string;
}

export interface MetricDef {
  id: string;
  dept: Dept;
  name: Bi;
  /** Shorter name for the narrow KPI cards */
  short?: Bi;
  unit: Unit;
  decimals: number;
  better: "up" | "down" | "none";
  /** How the value for a period is computed from the daily facts */
  agg:
    | { kind: "sum"; col: string }
    | { kind: "sumOf"; cols: string[] }
    | { kind: "ratio"; num: string[]; den: string[]; scale?: number; denMinus?: string[] }
    | { kind: "stock"; col: string }
    | { kind: "ytdShare"; col: string; planCol: string; annual: number }
    | { kind: "permit"; measure: "received" | "issued" | "cycleMedian" | "rework" | "nocMean" };
  /** level target, or a monthly volume target scaled to the period length */
  target?: { value: number; per?: "month" } | { plan: true };
  /** relative tolerance for amber (default 10%) */
  amber?: number;
  owner: string;
  source: string;
  definition: Bi;
}

export const DEPTS: Record<Dept, { name: Bi; head: string; headAr: string; color: string }> = {
  housing: { name: { en: "Housing & Community Services", ar: "الإسكان والخدمات المجتمعية" }, head: "Fatima Obaid Al Nuaimi", headAr: "فاطمة عبيد النعيمي", color: "#1f6f68" },
  permits: { name: { en: "Planning & Building Permits", ar: "التخطيط ورخص البناء" }, head: "Eng. Omar Yousef Al Hammadi", headAr: "م. عمر يوسف الحمادي", color: "#2f5d8a" },
  chc: { name: { en: "Customer Happiness Centre", ar: "مركز إسعاد المتعاملين" }, head: "Sara Ahmed Al Blooshi", headAr: "سارة أحمد البلوشي", color: "#a8691a" },
  inspection: { name: { en: "Field Operations & Inspection", ar: "العمليات الميدانية والتفتيش" }, head: "Eng. Hamad Juma Al Kaabi", headAr: "م. حمد جمعة الكعبي", color: "#6c6860" },
  finance: { name: { en: "Finance", ar: "الشؤون المالية" }, head: "Vikram Menon", headAr: "فيكرام مينون", color: "#161513" },
  facilities: { name: { en: "Facilities & Assets", ar: "المرافق والأصول" }, head: "Eng. Tariq Mahmoud Saleh", headAr: "م. طارق محمود صالح", color: "#b4432f" },
  hr: { name: { en: "Human Capital", ar: "الموارد البشرية" }, head: "Maryam Hassan Al Shamsi", headAr: "مريم حسن الشامسي", color: "#8f8a80" },
};

export const ANNUAL_BUDGET = 1146320000;

export const METRICS: MetricDef[] = [
  /* ── Housing ── */
  {
    id: "hg_backlog",
    dept: "housing",
    name: { en: "Open housing cases", ar: "طلبات الإسكان المفتوحة" },
    unit: "count",
    decimals: 0,
    better: "down",
    agg: { kind: "stock", col: "hg_backlog" },
    target: { value: 600 },
    amber: 0.15,
    owner: "Fatima Obaid Al Nuaimi",
    source: "Housing Case Management System (HCMS) — open-case snapshot",
    definition: { en: "Cases not yet decided at the end of the period (incl. awaiting applicant documents).", ar: "الطلبات غير المبتّ فيها في نهاية الفترة (بما فيها بانتظار مستندات المتعامل)." },
  },
  {
    id: "hg_received",
    dept: "housing",
    name: { en: "Housing applications received", ar: "طلبات الإسكان المستلمة" },
    unit: "count",
    decimals: 0,
    better: "none",
    agg: { kind: "sum", col: "hg_received" },
    owner: "Mariam Saeed Al Kaabi",
    source: "HCMS — new applications (MNDA-SVC-201/202)",
    definition: { en: "New housing grant/loan applications submitted in the period.", ar: "طلبات المنح والقروض السكنية الجديدة المقدمة خلال الفترة." },
  },
  {
    id: "hg_incomplete",
    dept: "housing",
    name: { en: "Incomplete at first review", ar: "الطلبات غير المكتملة عند المراجعة الأولى" },
    unit: "pct",
    decimals: 1,
    better: "down",
    agg: { kind: "ratio", num: ["hg_incomplete"], den: ["hg_received"], scale: 100 },
    target: { value: 15 },
    amber: 0.3,
    owner: "Mariam Saeed Al Kaabi",
    source: "HCMS — first-review outcome",
    definition: { en: "Share of new applications missing at least one required document at first review.", ar: "نسبة الطلبات الجديدة التي ينقصها مستند مطلوب واحد على الأقل عند المراجعة الأولى." },
  },
  {
    id: "hg_closed",
    dept: "housing",
    name: { en: "Housing cases decided", ar: "طلبات الإسكان المبتّ فيها" },
    unit: "count",
    decimals: 0,
    better: "up",
    agg: { kind: "sum", col: "hg_closed" },
    target: { value: 430, per: "month" },
    owner: "Mariam Saeed Al Kaabi",
    source: "HCMS — decisions issued",
    definition: { en: "Cases approved or rejected in the period.", ar: "الطلبات التي صدر فيها قرار بالموافقة أو الرفض خلال الفترة." },
  },
  {
    id: "hg_resolution",
    dept: "housing",
    name: { en: "Average resolution time", ar: "متوسط مدة البت" },
    unit: "days",
    decimals: 1,
    better: "down",
    agg: { kind: "ratio", num: ["hg_res_days"], den: ["hg_closed"] },
    target: { value: 12 },
    owner: "Fatima Obaid Al Nuaimi",
    source: "HCMS — decided cases (SLA 12 working days)",
    definition: { en: "Mean days from submission to decision for cases decided in the period.", ar: "متوسط الأيام من التقديم حتى القرار للطلبات المبتّ فيها خلال الفترة." },
  },
  {
    id: "hg_touches",
    dept: "housing",
    name: { en: "Handling touches per case", ar: "مرات المعالجة لكل طلب" },
    unit: "ratio",
    decimals: 1,
    better: "down",
    agg: { kind: "ratio", num: ["hg_touches"], den: ["hg_closed"] },
    target: { value: 1.5 },
    owner: "Khalfan Mohammed Al Ali",
    source: "HCMS — case activity log",
    definition: { en: "Officer handling events per decided case (repeat handling).", ar: "عدد مرات تعامل الموظف مع الطلب الواحد حتى القرار." },
  },
  /* ── Permits ── */
  {
    id: "bp_received",
    dept: "permits",
    name: { en: "Permit applications", ar: "طلبات رخص البناء" },
    unit: "count",
    decimals: 0,
    better: "none",
    agg: { kind: "permit", measure: "received" },
    owner: "Eng. Omar Yousef Al Hammadi",
    source: "Building Permits System — MNDA-SVC-101",
    definition: { en: "New-construction permit applications submitted in the period.", ar: "طلبات رخص البناء الجديدة المقدمة خلال الفترة." },
  },
  {
    id: "bp_issued",
    dept: "permits",
    name: { en: "Permits issued", ar: "الرخص الصادرة" },
    unit: "count",
    decimals: 0,
    better: "up",
    agg: { kind: "permit", measure: "issued" },
    target: { value: 350, per: "month" },
    owner: "Eng. Omar Yousef Al Hammadi",
    source: "Building Permits System — issued permits",
    definition: { en: "Building permits issued in the period (throughput).", ar: "رخص البناء الصادرة خلال الفترة (الإنجاز)." },
  },
  {
    id: "bp_cycle",
    dept: "permits",
    name: { en: "Permit cycle time (median)", ar: "زمن إصدار الرخصة (الوسيط)" },
    unit: "days",
    decimals: 1,
    better: "down",
    agg: { kind: "permit", measure: "cycleMedian" },
    target: { value: 15 },
    owner: "Eng. Omar Yousef Al Hammadi",
    source: "Building Permits System — permits issued in the period",
    definition: { en: "Median calendar days from submission to issue, for permits issued in the period.", ar: "الوسيط بالأيام التقويمية من التقديم حتى الإصدار للرخص الصادرة خلال الفترة." },
  },
  {
    id: "bp_rework",
    dept: "permits",
    name: { en: "Permits returned to applicant", ar: "الطلبات المعادة للمتعامل" },
    short: { en: "Permits returned", ar: "الرخص المعادة" },
    unit: "pct",
    decimals: 1,
    better: "down",
    agg: { kind: "permit", measure: "rework" },
    target: { value: 15 },
    amber: 0.3,
    owner: "Eng. Omar Yousef Al Hammadi",
    source: "Building Permits System — completeness-check outcomes",
    definition: { en: "Share of applications submitted in the period returned at least once (rework).", ar: "نسبة الطلبات المقدمة خلال الفترة التي أعيدت مرة واحدة على الأقل." },
  },
  {
    id: "bp_noc",
    dept: "permits",
    name: { en: "Master-developer NOC hold", ar: "مدة انتظار شهادة عدم الممانعة" },
    unit: "days",
    decimals: 1,
    better: "down",
    agg: { kind: "permit", measure: "nocMean" },
    target: { value: 9 },
    amber: 0.15,
    owner: "Eng. Omar Yousef Al Hammadi",
    source: "Building Permits System — 'Awaiting master-developer NOC' status (Circular 14/2026)",
    definition: { en: "Mean days held awaiting the master-developer NOC, applications submitted in the period.", ar: "متوسط أيام التعليق بانتظار شهادة المطور الرئيسي للطلبات المقدمة خلال الفترة." },
  },
  /* ── CHC ── */
  {
    id: "chc_contacts",
    dept: "chc",
    name: { en: "Customer contacts", ar: "تواصل المتعاملين" },
    unit: "count",
    decimals: 0,
    better: "none",
    agg: { kind: "sumOf", cols: ["chc_phone", "chc_whatsapp", "chc_app", "chc_email"] },
    owner: "Sara Ahmed Al Blooshi",
    source: "CHC contact-centre platform — all channels",
    definition: { en: "Contacts across phone (800 6632), WhatsApp, MNDA Smart chat and email.", ar: "التواصل عبر الهاتف (800 6632) وواتساب ومحادثة تطبيق MNDA Smart والبريد الإلكتروني." },
  },
  {
    id: "chc_wait",
    dept: "chc",
    name: { en: "Phone wait time", ar: "زمن الانتظار الهاتفي" },
    unit: "duration",
    decimals: 0,
    better: "down",
    agg: { kind: "ratio", num: ["chc_wait_sec"], den: ["chc_phone"], denMinus: ["chc_abandoned"] },
    target: { value: 180 },
    amber: 0.25,
    owner: "Sara Ahmed Al Blooshi",
    source: "CHC telephony — answered calls",
    definition: { en: "Average wait before an agent answers (answered calls).", ar: "متوسط الانتظار قبل رد الموظف (المكالمات المجاب عليها)." },
  },
  {
    id: "chc_abandon",
    dept: "chc",
    name: { en: "Call abandonment", ar: "نسبة المكالمات المتروكة" },
    unit: "pct",
    decimals: 1,
    better: "down",
    agg: { kind: "ratio", num: ["chc_abandoned"], den: ["chc_phone"], scale: 100 },
    target: { value: 8 },
    amber: 0.15,
    owner: "Sara Ahmed Al Blooshi",
    source: "CHC telephony — offered vs abandoned calls",
    definition: { en: "Share of offered calls abandoned before answer.", ar: "نسبة المكالمات التي أُغلقت قبل الرد." },
  },
  {
    id: "chc_fcr",
    dept: "chc",
    name: { en: "First-contact resolution", ar: "الحل من التواصل الأول" },
    unit: "pct",
    decimals: 1,
    better: "up",
    agg: { kind: "ratio", num: ["chc_fcr"], den: ["chc_phone", "chc_whatsapp", "chc_app", "chc_email"], scale: 100 },
    target: { value: 70 },
    owner: "Sara Ahmed Al Blooshi",
    source: "CHC CRM — contact outcomes",
    definition: { en: "Contacts resolved without a follow-up.", ar: "التواصل الذي حُلّ دون حاجة إلى متابعة." },
  },
  {
    id: "chc_repeat",
    dept: "chc",
    name: { en: "Repeat contacts within 7 days", ar: "تكرار التواصل خلال 7 أيام" },
    unit: "pct",
    decimals: 1,
    better: "down",
    agg: { kind: "ratio", num: ["chc_repeat7"], den: ["chc_phone", "chc_whatsapp", "chc_app", "chc_email"], scale: 100 },
    target: { value: 25 },
    owner: "Sara Ahmed Al Blooshi",
    source: "CHC CRM — customer contact history",
    definition: { en: "Contacts from a customer who already contacted the CHC in the previous 7 days.", ar: "تواصل من متعامل سبق أن تواصل مع المركز خلال الأيام السبعة السابقة." },
  },
  {
    id: "chc_cost",
    dept: "chc",
    name: { en: "Cost per contact", ar: "تكلفة التواصل الواحد" },
    unit: "aed",
    decimals: 2,
    better: "down",
    agg: { kind: "ratio", num: ["chc_cost_aed"], den: ["chc_phone", "chc_whatsapp", "chc_app", "chc_email"] },
    target: { value: 17 },
    amber: 0.06,
    owner: "Sara Ahmed Al Blooshi",
    source: "Finance cost allocation — CHC",
    definition: { en: "Fully loaded CHC cost divided by contacts handled.", ar: "إجمالي تكلفة المركز مقسوماً على عدد حالات التواصل." },
  },
  {
    id: "cmp_ontime",
    dept: "chc",
    name: { en: "Complaints answered on time", ar: "الشكاوى المجاب عليها في الموعد" },
    unit: "pct",
    decimals: 1,
    better: "up",
    agg: { kind: "ratio", num: ["cmp_ontime"], den: ["cmp_received"], scale: 100 },
    target: { value: 90 },
    owner: "Sara Ahmed Al Blooshi",
    source: "CRM — complaints (MNDA-SVC-501, 2 working days)",
    definition: { en: "Complaints received in the period answered within 2 working days.", ar: "الشكاوى المستلمة خلال الفترة التي رُدّ عليها خلال يومي عمل." },
  },
  {
    id: "cmp_received",
    dept: "chc",
    name: { en: "Complaints received", ar: "الشكاوى المستلمة" },
    unit: "count",
    decimals: 0,
    better: "none",
    agg: { kind: "sum", col: "cmp_received" },
    owner: "Sara Ahmed Al Blooshi",
    source: "CRM — complaints (MNDA-SVC-501)",
    definition: { en: "Formal complaints registered in the period.", ar: "الشكاوى الرسمية المسجلة خلال الفترة." },
  },
  /* ── Inspection ── */
  {
    id: "insp_count",
    dept: "inspection",
    name: { en: "Site inspections", ar: "الزيارات التفتيشية" },
    unit: "count",
    decimals: 0,
    better: "up",
    agg: { kind: "sum", col: "insp_count" },
    target: { value: 780, per: "month" },
    owner: "Eng. Hamad Juma Al Kaabi",
    source: "Field Inspection App — completed inspections",
    definition: { en: "Construction-site inspections completed.", ar: "زيارات التفتيش المنجزة على مواقع البناء." },
  },
  {
    id: "insp_violations",
    dept: "inspection",
    name: { en: "Violations recorded", ar: "المخالفات المسجلة" },
    unit: "count",
    decimals: 0,
    better: "none",
    agg: { kind: "sum", col: "insp_violations" },
    owner: "Eng. Hamad Juma Al Kaabi",
    source: "Field Inspection App — violations",
    definition: { en: "Safety and permit violations recorded during inspections.", ar: "مخالفات السلامة والترخيص المسجلة أثناء التفتيش." },
  },
  {
    id: "insp_rate",
    dept: "inspection",
    name: { en: "Violation rate", ar: "معدل المخالفات" },
    unit: "pct",
    decimals: 1,
    better: "down",
    agg: { kind: "ratio", num: ["insp_violations"], den: ["insp_count"], scale: 100 },
    target: { value: 16 },
    owner: "Eng. Hamad Juma Al Kaabi",
    source: "Field Inspection App",
    definition: { en: "Violations per 100 inspections.", ar: "عدد المخالفات لكل 100 زيارة تفتيشية." },
  },
  /* ── Finance ── */
  {
    id: "fin_exec",
    dept: "finance",
    name: { en: "Budget execution (YTD)", ar: "تنفيذ الميزانية (منذ بداية العام)" },
    unit: "pct",
    decimals: 1,
    better: "up",
    agg: { kind: "ytdShare", col: "fin_spend_aed", planCol: "fin_plan_aed", annual: ANNUAL_BUDGET },
    target: { plan: true },
    amber: 0.05,
    owner: "Vikram Menon",
    source: "ERP general ledger — actuals vs phased budget (annual AED 1,146,320,000)",
    definition: { en: "Year-to-date actual spend as a share of the 2026 annual budget; target is the phased plan to date.", ar: "الإنفاق الفعلي منذ بداية العام كنسبة من ميزانية 2026؛ المستهدف هو الخطة المرحلية حتى التاريخ." },
  },
  /* ── Facilities ── */
  {
    id: "fm_comfort",
    dept: "facilities",
    name: { en: "Comfort complaints (all facilities)", ar: "شكاوى الراحة الحرارية (جميع المرافق)" },
    unit: "count",
    decimals: 0,
    better: "down",
    agg: { kind: "sum", col: "fm_comfort" },
    target: { value: 12, per: "month" },
    amber: 0.25,
    owner: "Eng. Tariq Mahmoud Saleh",
    source: "CHC CRM + FM helpdesk — comfort category",
    definition: { en: "Too hot / too cold / ventilation complaints across MNDA buildings.", ar: "شكاوى الحرارة أو البرودة أو التهوية في مباني الهيئة." },
  },
  {
    id: "fm_comfort_agc",
    dept: "facilities",
    name: { en: "Comfort complaints — Al Ghaf CC", ar: "شكاوى الراحة — مركز الغاف" },
    unit: "count",
    decimals: 0,
    better: "down",
    agg: { kind: "sum", col: "fm_comfort_agc" },
    owner: "Eng. Tariq Mahmoud Saleh",
    source: "CHC CRM — Al Ghaf Community Centre",
    definition: { en: "Comfort complaints at Al Ghaf Community Centre (MN-07).", ar: "شكاوى الراحة الحرارية في مركز الغاف المجتمعي." },
  },
  {
    id: "fm_ppm",
    dept: "facilities",
    name: { en: "PPM compliance", ar: "الالتزام بالصيانة الوقائية" },
    unit: "pct",
    decimals: 1,
    better: "up",
    agg: { kind: "ratio", num: ["fm_ppm_done"], den: ["fm_ppm_due"], scale: 100 },
    target: { value: 98 },
    amber: 0.03,
    owner: "Eng. Tariq Mahmoud Saleh",
    source: "CAFM — planned preventive maintenance due vs completed on time",
    definition: { en: "PPM tasks completed on time as a share of tasks due (contract target 98%).", ar: "مهام الصيانة الوقائية المنجزة في موعدها من إجمالي المستحق (المستهدف التعاقدي 98%)." },
  },
  /* ── HR ── */
  {
    id: "hr_vacancies",
    dept: "hr",
    name: { en: "Open vacancies", ar: "الشواغر المفتوحة" },
    unit: "count",
    decimals: 0,
    better: "down",
    agg: { kind: "stock", col: "hr_vacancies" },
    target: { value: 45 },
    amber: 0.2,
    owner: "Maryam Hassan Al Shamsi",
    source: "HRMS — approved establishment vs filled posts",
    definition: { en: "Approved posts not filled at period end (establishment ~1,240).", ar: "الوظائف المعتمدة غير المشغولة في نهاية الفترة." },
  },
];

export const METRIC_IDS = METRICS.map((m) => m.id) as [string, ...string[]];
export const metricById = (id: string) => METRICS.find((m) => m.id === id);

/** KPI header — the eight figures the DG looks at first. */
export const HEADLINE = ["hg_backlog", "hg_resolution", "bp_cycle", "bp_rework", "chc_wait", "chc_abandon", "fin_exec", "fm_ppm"];

export const PEOPLE = [
  { name: "H.E. Eng. Khalid Saif Al Mazrouei", ar: "سعادة المهندس خالد سيف المزروعي", role: "Director General", dept: null },
  { name: "Dr. Amna Rashid Al Ketbi", ar: "د. آمنة راشد الكتبي", role: "Executive Director, Strategy & Performance Office", dept: null },
  { name: "Fatima Obaid Al Nuaimi", ar: "فاطمة عبيد النعيمي", role: "Director, Housing & Community Services", dept: "housing" },
  { name: "Mariam Saeed Al Kaabi", ar: "مريم سعيد الكعبي", role: "Head, Housing Applications Section", dept: "housing" },
  { name: "Eng. Omar Yousef Al Hammadi", ar: "م. عمر يوسف الحمادي", role: "Director, Planning & Building Permits", dept: "permits" },
  { name: "Sara Ahmed Al Blooshi", ar: "سارة أحمد البلوشي", role: "Manager, Customer Happiness Centre", dept: "chc" },
  { name: "Eng. Hamad Juma Al Kaabi", ar: "م. حمد جمعة الكعبي", role: "Director, Field Operations & Inspection", dept: "inspection" },
  { name: "Vikram Menon", ar: "فيكرام مينون", role: "Chief Financial Officer", dept: "finance" },
  { name: "Eng. Tariq Mahmoud Saleh", ar: "م. طارق محمود صالح", role: "Director, Facilities & Assets", dept: "facilities" },
  { name: "Maryam Hassan Al Shamsi", ar: "مريم حسن الشامسي", role: "Director, Human Capital", dept: "hr" },
  { name: "Rashed Ali Al Dhaheri", ar: "راشد علي الظاهري", role: "Director, Procurement & Contracts", dept: null },
  { name: "Hessa Abdulla Al Suwaidi", ar: "حصة عبدالله السويدي", role: "Director, Digital Transformation Office", dept: null },
] as const;

export const OWNER_NAMES = PEOPLE.filter((p) => p.name !== "H.E. Eng. Khalid Saif Al Mazrouei").map((p) => p.name) as unknown as [string, ...string[]];

/** Review calendar */
export const REVIEW = {
  week: "2026-W41",
  previousWeek: "2026-W40",
  dataTo: "2026-10-09",
  meetingDate: "2026-10-12",
  today: "2026-10-11",
};
