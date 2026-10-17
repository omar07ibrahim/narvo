import "server-only";
import { readJsonSafe } from "@/lib/world/data";
import { addAudit, appendRecord, kvGet, kvSet, listApprovals, patchRecord, withOverlay } from "@/lib/store/db";
import { getIndex, search } from "@/lib/retrieval";
import type { ApprovalSpec } from "@/lib/ai/agent";
import {
  DEMO_TODAY,
  OPTIONS,
  TYPE_META,
  type Bi,
  type Check,
  type Draft,
  type Employee,
  type RequestType,
  type ServiceRequest, NAMES_AR, TITLES_AR, dayLabel, daysAr } from "./shared";

export const SOLUTION = "11-employee-services";
export const REQUESTS = `${SOLUTION}/requests`;
const STATS_KEY = `${SOLUTION}:stats`;

export const HR_SERVICES = { name: "Latifa Khamis Al Romaithi", title: "Senior HR Services Officer" };
export const IT_DESK = { name: "Yousef Ibrahim Al Hosani", title: "IT Service Desk Lead" };

export { NAMES_AR };

/* ───────────── Dates (UAE working week Mon–Fri) ───────────── */

const TODAY = new Date(`${DEMO_TODAY}T09:00:00+04:00`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const parseDay = (s: string) => new Date(`${s}T12:00:00+04:00`);
const isWorkday = (d: Date) => d.getUTCDay() !== 0 && d.getUTCDay() !== 6;

export function addWorkingDays(from: Date, days: number) {
  const d = new Date(from);
  let left = days;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (isWorkday(d)) left--;
  }
  return d;
}

export function workingDaysBetween(start: string, end: string) {
  const a = parseDay(start);
  const b = parseDay(end);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a) return 0;
  let n = 0;
  for (const d = new Date(a); d <= b; d.setUTCDate(d.getUTCDate() + 1)) if (isWorkday(d)) n++;
  return n;
}

function mondayOf(day: string) {
  const d = parseDay(day);
  const wd = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (wd - 1));
  return iso(d);
}

/** SLA due time: end of the working day (15:30) after N working days. */
export function dueFrom(submittedAt: string, slaDays: number) {
  const d = addWorkingDays(new Date(submittedAt), slaDays);
  const day = iso(d);
  return new Date(`${day}T15:30:00+04:00`).toISOString();
}

/* ───────────── Data ───────────── */

export function loadEmployees(): Employee[] {
  return readJsonSafe<Employee[]>(`mnda/${SOLUTION}/employees.json`, []);
}

export function getEmployee(id: string) {
  return loadEmployees().find((e) => e.id === id);
}

export function loadRequests(): ServiceRequest[] {
  const seed = readJsonSafe<ServiceRequest[]>(`mnda/${SOLUTION}/requests.json`, []).map((r) => ({
    ...r,
    dueAt: r.dueAt ?? dueFrom(r.submittedAt, r.slaDays),
  }));
  const merged = withOverlay(REQUESTS, seed);
  // Approvals decided in the inline card or the global Inbox drive the request status.
  const approvals = listApprovals({ solution: SOLUTION });
  const byReq = new Map<string, (typeof approvals)[number]>();
  for (const a of approvals) {
    const rid = (a.payload as { requestId?: string } | undefined)?.requestId;
    if (rid) byReq.set(rid, a);
  }
  return merged
    .map((r) => {
      const a = byReq.get(r.id);
      if (!a) return r;
      if (a.status === "approved") {
        return {
          ...r,
          approvalId: a.id,
          status: r.status === "submitted" ? "approved" : r.status,
          approvedAt: r.approvedAt ?? new Date(a.decidedAt ?? Date.now()).toISOString(),
        } as ServiceRequest;
      }
      if (a.status === "rejected") {
        return {
          ...r,
          approvalId: a.id,
          status: "rejected",
          rejectedAt: new Date(a.decidedAt ?? Date.now()).toISOString(),
          rejectionNote: a.comment,
        } as ServiceRequest;
      }
      return { ...r, approvalId: a.id };
    })
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

export function getStats() {
  const seed = readJsonSafe<{ period: string; questions: number; deflected: number }>(`mnda/${SOLUTION}/stats-seed.json`, {
    period: "",
    questions: 0,
    deflected: 0,
  });
  const live = kvGet<{ questions: number; deflected: number }>(STATS_KEY) ?? { questions: 0, deflected: 0 };
  return { period: seed.period, questions: seed.questions + live.questions, deflected: seed.deflected + live.deflected, live };
}

export function recordQuestion(deflected: boolean) {
  const live = kvGet<{ questions: number; deflected: number }>(STATS_KEY) ?? { questions: 0, deflected: 0 };
  kvSet(STATS_KEY, { questions: live.questions + 1, deflected: live.deflected + (deflected ? 1 : 0) });
}

/* ───────────── Profile view for the assistant (no salary figures) ───────────── */

export function profileFacts(e: Employee) {
  const remaining = e.leave.entitlement - e.leave.taken - e.leave.pending;
  const ageDays = Math.floor((TODAY.getTime() - parseDay(e.laptop.purchased).getTime()) / 86400000);
  const years = ageDays / 365.25;
  const weekUsed = e.remote.approvedDates.filter((d) => mondayOf(d) === e.remote.weekOf).length;
  return {
    employeeId: e.id,
    name: e.name,
    title: e.title,
    department: e.department,
    grade: e.grade,
    joined: e.joined,
    email: e.email,
    workPattern: e.workPattern,
    location: e.location,
    lineManager: { ...e.manager, arabicName: NAMES_AR[e.manager.name] ?? null },
    director: { ...e.director, arabicName: NAMES_AR[e.director.name] ?? null },
    nameArabic: e.nameAr,
    annualLeave: { entitlement: e.leave.entitlement, taken: e.leave.taken, pendingApproval: e.leave.pending, remaining, sickDaysTaken: e.leave.sickTaken },
    remoteWork: {
      roleIsRemoteEligible: e.remoteEligible,
      probationCompleted: e.probationCompleted,
      lastRating: e.lastRating,
      approvedPattern: e.remote.pattern ?? null,
      weekOf: e.remote.weekOf,
      approvedDatesThisWeek: e.remote.approvedDates,
      daysLeftThisWeek: e.remoteEligible ? Math.max(0, 2 - weekUsed) : 0,
    },
    laptop: {
      ...e.laptop,
      ageYears: Number(years.toFixed(1)),
      eligibleForReplacement: years >= 4,
      eligibleFrom: iso(new Date(parseDay(e.laptop.purchased).getTime() + 4 * 365.25 * 86400000)),
    },
    secondMonitor: e.secondMonitor,
    mobileDevice: e.mobileDevice,
    systemAccess: e.systems,
    housingCase: e.housingCase ? { id: e.housingCase.id, status: e.housingCase.status, note: e.housingCase.note } : null,
    salaryNote: "Salary figures are held by HR payroll and are printed on the certificate by HR — they are not needed in this conversation.",
  };
}

/* ───────────── Policy retrieval (HR + IT + HR circulars) ───────────── */

const POLICY_DOCS = new Set(["MNDA-CIR-2026-11-EN", "MNDA-CIR-2026-09-EN", "MNDA-CIR-2026-09-AR", "AI-POL-01", "IS-POL-01"]);

export function searchPolicy(queries: string[], k = 5) {
  const docs = getIndex("mnda/knowledge").docs;
  const allowed = new Set(docs.filter((d) => /knowledge\/(hr|it)\//.test(d.file) || POLICY_DOCS.has(d.id)).map((d) => d.id));
  const seen = new Set<string>();
  return search("mnda/knowledge", queries, 60)
    .filter((h) => allowed.has(h.docId))
    .filter((h) => {
      const key = `${h.docId}|${h.section}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, k);
}

/* ───────────── Drafts: validation + eligibility ───────────── */

type Fields = Draft["fields"];

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const chk = (key: string, ok: boolean, label: Bi, detail: Bi, blocking = false): Check => ({ key, ok, label, detail, blocking: !ok && blocking });

const SLA: Record<string, number> = {
  salary_certificate: 1,
  "hr_letter:salary_transfer": 2,
  "hr_letter:experience": 3,
  "hr_letter:noc": 2,
  "hr_letter:employment_verification": 1,
  annual_leave: 2,
  remote_work: 1,
  "it_equipment:laptop_replacement": 5,
  "it_equipment:second_monitor": 3,
  "it_equipment:mobile_device": 5,
  "it_equipment:vpn": 1,
  system_access: 2,
};

export function buildDraft(e: Employee, type: RequestType, input: Fields, id?: string): Draft {
  const checks: Check[] = [];
  const f: Fields = {};
  let approver = { ...HR_SERVICES };
  let slaKey: string = type;
  let title: Bi = TYPE_META[type].label;
  const facts = profileFacts(e);

  if (type === "salary_certificate") {
    f.language = input.language === "en" ? "en" : "ar";
    const ar = f.language === "ar";
    // Models sometimes put the purpose in "justification" — accept either.
    const purpose = s(input.purpose) || s(input.justification);
    const housing = /hous|سكن|إسكان|اسكان|منح|loan|grant/i.test(`${purpose} ${s(input.addressee)}`);
    f.addressee =
      s(input.addressee) ||
      (housing
        ? ar
          ? "هيئة مرسى النور للتطوير — قسم الطلبات السكنية"
          : "Marsa Al Noor Development Authority — Housing Applications Section"
        : ar
          ? "إلى من يهمه الأمر"
          : "To whom it may concern");
    f.purpose = purpose || (ar ? "لأغراض عامة" : "General purposes");
    f.includeBreakdown = input.includeBreakdown !== false;
    const joined = new Date(`${e.joined}T12:00:00+04:00`);
    const joinedEn = joined.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "Asia/Dubai" });
    const joinedAr = joined.toLocaleDateString("ar-AE-u-nu-latn", { month: "long", year: "numeric", timeZone: "Asia/Dubai" });
    checks.push(
      chk(
        "employment",
        true,
        { en: "Active employee record", ar: "سجل وظيفي نشط" },
        { en: `${e.grade} · since ${joinedEn}`, ar: `${e.grade.replace(/^Grade\s*/i, "الدرجة ")} · منذ ${joinedAr}` },
      ),
    );
    if (housing) {
      f.includeBreakdown = true;
      checks.push(
        chk(
          "housing",
          true,
          { en: "Meets Circular 9/2026", ar: "مطابقة للتعميم 9/2026" },
          {
            en: "Shows basic salary and total allowances; valid for housing applications for 30 days from the issue date.",
            ar: "تتضمن الراتب الأساسي وإجمالي البدلات؛ وصالحة لطلبات الإسكان مدة 30 يوماً من تاريخ الإصدار.",
          },
        ),
      );
      if (e.housingCase)
        checks.push(
          chk("case", true, { en: `Linked housing case ${e.housingCase.id}`, ar: `مرتبطة بالطلب السكني ${e.housingCase.id}` }, { en: e.housingCase.note, ar: e.housingCase.noteAr }),
        );
    }
    title = {
      en: `Salary certificate (${f.language === "ar" ? "Arabic" : "English"}) — ${f.addressee}`,
      ar: `شهادة راتب (${f.language === "ar" ? "عربي" : "إنجليزي"}) — ${f.addressee}`,
    };
  }

  if (type === "hr_letter") {
    const lt = OPTIONS.letterType.some((o) => o.value === input.letterType) ? String(input.letterType) : "employment_verification";
    f.letterType = lt;
    f.language = input.language === "en" ? "en" : "ar";
    f.addressee = s(input.addressee) || (lt === "salary_transfer" ? "" : f.language === "ar" ? "إلى من يهمه الأمر" : "To whom it may concern");
    f.purpose = s(input.purpose) || s(input.justification);
    slaKey = `hr_letter:${lt}`;
    checks.push(
      chk(
        "addressee",
        !!f.addressee,
        { en: "Addressee", ar: "الجهة الموجّه إليها" },
        f.addressee ? { en: String(f.addressee), ar: String(f.addressee) } : { en: "The bank's name is required for a salary transfer letter.", ar: "يلزم اسم البنك لرسالة تحويل الراتب." },
        true,
      ),
    );
    const lbl = OPTIONS.letterType.find((o) => o.value === lt)!.label;
    title = { en: `${lbl.en} — ${f.addressee || "addressee missing"}`, ar: `${lbl.ar} — ${f.addressee || "الجهة غير محددة"}` };
  }

  if (type === "annual_leave") {
    const lt = OPTIONS.leaveType.some((o) => o.value === input.leaveType) ? String(input.leaveType) : "annual";
    f.leaveType = lt;
    f.startDate = s(input.startDate);
    f.endDate = s(input.endDate) || s(input.startDate);
    f.handover = s(input.handover);
    const days = f.startDate && f.endDate ? workingDaysBetween(String(f.startDate), String(f.endDate)) : 0;
    f.workingDays = days;
    approver = e.manager;
    checks.push(
      chk(
        "dates",
        days > 0,
        { en: "Dates", ar: "التواريخ" },
        days > 0
          ? { en: `${days} working day${days > 1 ? "s" : ""} (${f.startDate} → ${f.endDate})`, ar: `${days} يوم عمل (${f.startDate} ← ${f.endDate})` }
          : { en: "A valid start and end date are required.", ar: "يلزم تاريخ بداية ونهاية صحيحان." },
        true,
      ),
    );
    if (lt === "annual" && days > 0) {
      const remaining = facts.annualLeave.remaining;
      checks.push(
        chk(
          "balance",
          days <= remaining,
          { en: "Leave balance", ar: "رصيد الإجازات" },
          { en: `${remaining} days available, ${days} requested → ${remaining - days} left`, ar: `المتاح ${remaining} يوماً، المطلوب ${days} ← المتبقي ${remaining - days}` },
          true,
        ),
      );
      const notice = days > 10 ? 10 : 5;
      const earliest = addWorkingDays(TODAY, notice);
      const ok = parseDay(String(f.startDate)) >= parseDay(iso(earliest));
      checks.push(
        chk(
          "notice",
          ok,
          { en: `Notice (${notice} working days)`, ar: `مدة الإشعار (${notice} أيام عمل)` },
          ok
            ? { en: `Requested in time (earliest start ${iso(earliest)})`, ar: `مقدّم في الوقت المناسب (أقرب بداية ${iso(earliest)})` }
            : { en: `Short notice — earliest standard start is ${iso(earliest)}; your manager may still approve.`, ar: `إشعار قصير — أقرب بداية معتادة ${iso(earliest)}؛ ويجوز لمديرك الاعتماد.` },
        ),
      );
      if (days > 20) {
        approver = e.director;
        checks.push(chk("director", true, { en: "Director approval", ar: "اعتماد المدير" }, { en: "More than 20 consecutive working days — routed to the director.", ar: "أكثر من 20 يوم عمل متتالية — يُحال إلى مدير الإدارة." }));
      }
      if (!e.probationCompleted) checks.push(chk("probation", false, { en: "Probation", ar: "فترة التجربة" }, { en: "Leave during probation needs director approval.", ar: "الإجازة خلال فترة التجربة تتطلب اعتماد المدير." }));
    }
    if (lt === "sick" && days > 1)
      checks.push(chk("medical", false, { en: "Medical certificate", ar: "شهادة طبية" }, { en: "Upload a certificate from a licensed UAE facility within 2 working days.", ar: "ارفع شهادة من منشأة صحية مرخصة في الدولة خلال يومي عمل." }));
    const lbl = OPTIONS.leaveType.find((o) => o.value === lt)!.label;
    title = {
      en: `${lbl.en} — ${days} day${days === 1 ? "" : "s"} from ${f.startDate ? dayLabel(String(f.startDate), "en") : "?"}`,
      ar: `${lbl.ar} — ${daysAr(days)} اعتباراً من ${f.startDate ? dayLabel(String(f.startDate), "ar") : "؟"}`,
    };
  }

  if (type === "remote_work") {
    const dates = (Array.isArray(input.dates) ? input.dates : s(input.dates).split(/[,\s]+/))
      .map((d) => String(d).trim())
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
    f.dates = [...new Set(dates)].sort();
    f.justification = s(input.justification);
    approver = e.manager;
    checks.push(
      chk(
        "role",
        e.remoteEligible,
        { en: "Role eligible (HC-POL-07)", ar: "الوظيفة مؤهلة (HC-POL-07)" },
        e.remoteEligible
          ? { en: `Office-based role · ${e.lastRating}`, ar: `وظيفة مكتبية · ${e.lastRating}` }
          : {
              en: e.workPattern === "field" ? "Field inspection roles are not remote-eligible." : "Front-line rostered Customer Happiness shifts are not remote-eligible.",
              ar: e.workPattern === "field" ? "وظائف التفتيش الميداني غير مؤهلة للعمل عن بُعد." : "مناوبات إسعاد المتعاملين الأمامية غير مؤهلة للعمل عن بُعد.",
            },
        true,
      ),
    );
    const list = f.dates as string[];
    checks.push(chk("dates", list.length > 0, { en: "Dates", ar: "التواريخ" }, list.length ? { en: list.join(", "), ar: list.join("، ") } : { en: "Choose at least one working day.", ar: "اختر يوم عمل واحداً على الأقل." }, true));
    const weekend = list.filter((d) => !isWorkday(parseDay(d)));
    if (weekend.length) checks.push(chk("workday", false, { en: "Working days only", ar: "أيام العمل فقط" }, { en: `${weekend.join(", ")} is a weekend day.`, ar: `${weekend.join("، ")} يوم عطلة.` }, true));
    const earliest = iso(addWorkingDays(TODAY, 1));
    const late = list.filter((d) => d < earliest);
    checks.push(
      chk(
        "notice",
        late.length === 0,
        { en: "1 working day notice", ar: "إشعار يوم عمل واحد" },
        late.length ? { en: `${late.join(", ")} is too soon (earliest ${earliest}).`, ar: `${late.join("، ")} قريب جداً (الأقرب ${earliest}).` } : { en: `Earliest allowed date ${earliest}`, ar: `أقرب تاريخ مسموح ${earliest}` },
        true,
      ),
    );
    const weeks = new Map<string, number>();
    for (const d of e.remote.approvedDates) weeks.set(mondayOf(d), (weeks.get(mondayOf(d)) ?? 0) + 1);
    let over = "";
    for (const d of list) {
      const w = mondayOf(d);
      const n = (weeks.get(w) ?? 0) + (e.remote.approvedDates.includes(d) ? 0 : 1);
      weeks.set(w, n);
      if (n > 2) over = w;
    }
    const thisWeek = weeks.get(e.remote.weekOf) ?? 0;
    checks.push(
      chk(
        "limit",
        !over,
        { en: "Max 2 days per week", ar: "يومان كحد أقصى أسبوعياً" },
        over
          ? { en: `Week of ${over} would exceed 2 remote days (already approved: ${e.remote.approvedDates.join(", ") || "none"}).`, ar: `أسبوع ${over} سيتجاوز يومين (المعتمد مسبقاً: ${e.remote.approvedDates.join("، ") || "لا يوجد"}).` }
          : { en: `Week of ${e.remote.weekOf}: ${thisWeek} of 2 days after this request`, ar: `أسبوع ${e.remote.weekOf}: ${thisWeek} من 2 بعد هذا الطلب` },
        true,
      ),
    );
    title = { en: `Remote work — ${list.join(", ") || "dates missing"}`, ar: `عمل عن بُعد — ${list.join("، ") || "التواريخ غير محددة"}` };
  }

  if (type === "it_equipment") {
    const item = OPTIONS.item.some((o) => o.value === input.item) ? String(input.item) : "laptop_replacement";
    f.item = item;
    f.justification = s(input.justification);
    slaKey = `it_equipment:${item}`;
    if (item === "laptop_replacement") {
      f.assetTag = e.laptop.assetTag;
      approver = IT_DESK;
      const damaged = /damag|broken|crack|spill|كسر|تلف|مكسور|خربان/i.test(String(f.justification));
      const ok = facts.laptop.eligibleForReplacement;
      checks.push(
        chk(
          "lifecycle",
          ok || damaged,
          { en: "4-year lifecycle", ar: "دورة الاستبدال 4 سنوات" },
          ok
            ? { en: `${e.laptop.model} (${e.laptop.assetTag}) bought ${e.laptop.purchased} — ${facts.laptop.ageYears} years old → eligible`, ar: `${e.laptop.model} (${e.laptop.assetTag}) شُري في ${e.laptop.purchased} — عمره ${facts.laptop.ageYears} سنوات ← مؤهل` }
            : damaged
              ? { en: `Only ${facts.laptop.ageYears} years old — early replacement needs a damage report.`, ar: `عمره ${facts.laptop.ageYears} سنوات فقط — الاستبدال المبكر يتطلب تقرير تلف.` }
              : { en: `${facts.laptop.ageYears} years old — eligible from ${facts.laptop.eligibleFrom}. Raise a fault ticket for performance issues.`, ar: `عمره ${facts.laptop.ageYears} سنوات — مؤهل اعتباراً من ${facts.laptop.eligibleFrom}. افتح بلاغ عطل لمشكلات الأداء.` },
          true,
        ),
      );
      checks.push(chk("return", true, { en: "Old device return", ar: "إعادة الجهاز القديم" }, { en: "Returned and wiped on delivery (certificate of data destruction).", ar: "يُعاد ويُمسح عند التسليم (شهادة إتلاف البيانات)." }));
    } else if (item === "second_monitor") {
      approver = e.manager;
      checks.push(chk("assigned", !e.secondMonitor, { en: "Not already assigned", ar: "غير مخصصة مسبقاً" }, e.secondMonitor ? { en: "A second monitor is already assigned to you.", ar: "لديك شاشة إضافية مخصصة بالفعل." } : { en: "No second monitor on record", ar: "لا توجد شاشة إضافية مسجلة" }, true));
      checks.push(chk("office", e.workPattern !== "field", { en: "Office-based workstation", ar: "محطة عمل مكتبية" }, { en: e.location, ar: e.location }, true));
    } else if (item === "mobile_device") {
      approver = e.director;
      const ok = e.workPattern === "field";
      checks.push(chk("role", ok, { en: "Field, director or on-call role", ar: "وظيفة ميدانية أو إدارية أو مناوبة" }, ok ? { en: "Field role", ar: "وظيفة ميدانية" } : { en: "Corporate phones are issued to field roles, directors and on-call staff.", ar: "تُصرف الهواتف المؤسسية للوظائف الميدانية والمديرين والمناوبين." }, true));
      if (e.mobileDevice) checks.push(chk("existing", false, { en: "Existing device", ar: "جهاز حالي" }, { en: `Already assigned: ${e.mobileDevice} — this will be a replacement.`, ar: `مخصص حالياً: ${e.mobileDevice} — سيكون الطلب استبدالاً.` }));
    } else {
      approver = e.manager;
      checks.push(
        chk(
          "vpn",
          e.remoteEligible,
          { en: "Linked to HC-POL-07", ar: "مرتبطة بسياسة HC-POL-07" },
          e.remoteEligible ? { en: "Granted with an approved remote arrangement; MFA mandatory.", ar: "تُمنح مع ترتيب عمل عن بُعد معتمد؛ والمصادقة متعددة العوامل إلزامية." } : { en: "Role is not remote-eligible — manager must justify.", ar: "الوظيفة غير مؤهلة للعمل عن بُعد — يلزم مبرر من المدير." },
        ),
      );
    }
    const lbl = OPTIONS.item.find((o) => o.value === item)!.label;
    title = { en: lbl.en, ar: lbl.ar };
  }

  if (type === "system_access") {
    f.system = OPTIONS.system.some((o) => o.value === input.system) ? String(input.system) : s(input.system);
    f.accessLevel = OPTIONS.accessLevel.some((o) => o.value === input.accessLevel) ? String(input.accessLevel) : "read";
    f.justification = s(input.justification);
    approver = e.manager;
    checks.push(chk("system", !!f.system, { en: "System", ar: "النظام" }, { en: String(f.system || "Choose a system"), ar: String(f.system || "اختر النظام") }, true));
    checks.push(
      chk(
        "justification",
        String(f.justification).length >= 12,
        { en: "Business justification", ar: "مبرر العمل" },
        String(f.justification).length >= 12 ? { en: String(f.justification), ar: String(f.justification) } : { en: "Explain why the access is needed (least privilege).", ar: "وضّح سبب الحاجة إلى الصلاحية (مبدأ الحد الأدنى من الصلاحيات)." },
        true,
      ),
    );
    if (f.accessLevel === "admin") checks.push(chk("admin", false, { en: "Administrator access", ar: "صلاحية مسؤول" }, { en: "Also needs the system owner and Information Security review.", ar: "تتطلب أيضاً موافقة مالك النظام ومراجعة أمن المعلومات." }));
    if (e.systems.some((x) => f.system && x.toLowerCase().startsWith(String(f.system).toLowerCase())))
      checks.push(chk("existing", false, { en: "Existing access", ar: "صلاحية حالية" }, { en: "You already have access to this system — this will change the level.", ar: "لديك صلاحية على هذا النظام — سيتغير المستوى." }));
    checks.push(chk("owner", true, { en: "System owner notified", ar: "إشعار مالك النظام" }, { en: "After your manager approves, the system owner confirms the role.", ar: "بعد اعتماد مديرك يؤكد مالك النظام الدور." }));
    title = { en: `Access to ${f.system || "system"} (${f.accessLevel})`, ar: `صلاحية على ${f.system || "النظام"} (${f.accessLevel})` };
  }

  return {
    id: id ?? `DRF-${Date.now().toString(36).toUpperCase()}`,
    employeeId: e.id,
    type,
    fields: f,
    checks,
    approver,
    queue: TYPE_META[type].queue,
    slaDays: SLA[slaKey] ?? 2,
    title,
    eligible: !checks.some((c) => c.blocking),
    createdAt: new Date().toISOString(),
  };
}

export function saveDraft(d: Draft) {
  kvSet(`${SOLUTION}:draft:${d.id}`, d);
  return d;
}

export function getDraft(id: string) {
  return kvGet<Draft>(`${SOLUTION}:draft:${id}`);
}

/* ───────────── Submit → request record + approval spec ───────────── */

function nextId(queue: "HR" | "IT") {
  const all = loadRequests();
  const prefix = queue === "HR" ? "HRS-2026-" : "ITS-2026-";
  const max = all.filter((r) => r.id.startsWith(prefix)).reduce((m, r) => Math.max(m, Number(r.id.slice(prefix.length)) || 0), queue === "HR" ? 2370 : 4420);
  return `${prefix}${String(max + 1).padStart(5, "0")}`;
}

/** Create the request (status "submitted") and return the approval for the responsible approver. */
export function submitDraft(draft: Draft, editedFields?: Fields, lang: "en" | "ar" = "en"): { request: ServiceRequest; spec: ApprovalSpec } {
  const e = getEmployee(draft.employeeId);
  if (!e) throw new Error("Employee not found");
  if (draft.submittedRequestId) throw new Error(`This form was already submitted as ${draft.submittedRequestId}`);
  const d = buildDraft(e, draft.type, { ...draft.fields, ...(editedFields ?? {}) }, draft.id);
  if (!d.eligible) {
    const why = d.checks.filter((c) => c.blocking).map((c) => c.detail.en).join(" ");
    throw new Error(`Not eligible: ${why}`);
  }
  const now = new Date().toISOString();
  const request: ServiceRequest = {
    id: nextId(d.queue),
    employeeId: e.id,
    employeeName: e.name,
    employeeNameAr: e.nameAr,
    department: e.department,
    type: d.type,
    title: d.title,
    fields: d.fields,
    queue: d.queue,
    approver: d.approver,
    status: "submitted",
    channel: "NARVO assistant",
    submittedAt: now,
    slaDays: d.slaDays,
    dueAt: dueFrom(now, d.slaDays),
  };
  appendRecord(REQUESTS, request as unknown as Record<string, unknown> & { id: string });
  saveDraft({ ...d, submittedRequestId: request.id });
  addAudit({
    solution: SOLUTION,
    actor: { name: e.name, role: e.title, kind: "human" },
    action: "Request submitted",
    subject: `${request.id} · ${d.title.en}`,
    detail: `Routed to ${d.approver.name} (${d.approver.title}) · SLA ${d.slaDays} working day${d.slaDays > 1 ? "s" : ""}`,
  });
  const fieldsSummary = Object.entries(d.fields)
    .filter(([, v]) => v !== "" && v != null && !(Array.isArray(v) && !v.length))
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`)
    .join(" · ");
  const spec: ApprovalSpec = {
    title: lang === "ar" ? `${request.id} — ${d.title.ar} (${e.nameAr})` : `${request.id} — ${d.title.en} (${e.name})`,
    summary: (lang === "ar" ? `${e.nameAr}، ${e.titleAr} — ${fieldsSummary}` : `${e.name}, ${e.title} — ${fieldsSummary}`).slice(0, 380),
    actionLabel: lang === "ar" ? "اعتماد الطلب" : "Approve request",
    // the Arabic UI shows the approver in Arabic; the record keeps the English name for the audit trail
    approver: { ...d.approver, nameAr: NAMES_AR[d.approver.name], titleAr: TITLES_AR[d.approver.title] },
    effects: [
      { type: "patch", collection: REQUESTS, id: request.id, patch: { status: "approved" } },
      { type: "audit", action: "Request approved", subject: `${request.id} · ${d.title.en}`, detail: `Queued for ${d.queue} fulfilment` },
    ],
    payload: { requestId: request.id, employeeId: e.id, type: d.type },
  };
  return { request, spec };
}

/* ───────────── Service desk actions ───────────── */

export function advanceRequest(id: string, to: "in_fulfilment" | "completed", agent: string, note?: string) {
  const r = loadRequests().find((x) => x.id === id);
  if (!r) throw new Error("Request not found");
  if (to === "in_fulfilment" && r.status !== "approved") throw new Error("Only approved requests can move to fulfilment");
  if (to === "completed" && r.status !== "approved" && r.status !== "in_fulfilment") throw new Error("Request is not ready to complete");
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: to, assignee: agent };
  if (to === "in_fulfilment") patch.fulfilmentAt = now;
  if (to === "completed") {
    patch.completedAt = now;
    if (!r.fulfilmentAt) patch.fulfilmentAt = now;
    patch.resolution = note || null;
    if (r.type === "salary_certificate" || r.type === "hr_letter") {
      patch.outputRef = `MNDA/HC/${r.type === "salary_certificate" ? "SC" : "LTR"}/2026/${String(Math.floor(Date.now() / 1000) % 100000).padStart(5, "0")}`;
    }
  }
  patchRecord(REQUESTS, id, patch);
  addAudit({
    solution: SOLUTION,
    actor: { name: agent, role: r.queue === "HR" ? HR_SERVICES.title : IT_DESK.title, kind: "human" },
    action: to === "completed" ? "Request completed" : "Fulfilment started",
    subject: `${r.id} · ${r.title.en}`,
    detail: note || (to === "completed" ? "Closed by service desk" : "Assigned for fulfilment"),
  });
  return loadRequests().find((x) => x.id === id)!;
}
