/**
 * Client-safe types and catalogue for the Employee Services Hub (solution 11).
 */

export interface Bi {
  en: string;
  ar: string;
}

export type RequestType = "salary_certificate" | "hr_letter" | "annual_leave" | "remote_work" | "it_equipment" | "system_access";
export type Queue = "HR" | "IT";
export type RequestStatus = "submitted" | "approved" | "in_fulfilment" | "completed" | "rejected";

export interface Employee {
  id: string;
  name: string;
  nameAr: string;
  /** Used only for Arabic grammatical agreement in issued documents — never shown to the model. */
  gender?: "m" | "f";
  title: string;
  titleAr: string;
  department: string;
  departmentAr: string;
  grade: string;
  joined: string;
  email: string;
  extension: string;
  workPattern: "office" | "field" | "frontline";
  location: string;
  manager: { name: string; nameAr?: string; title: string };
  director: { name: string; title: string };
  probationCompleted: boolean;
  lastRating: string;
  remoteEligible: boolean;
  leave: { entitlement: number; taken: number; pending: number; carriedOver: number; sickTaken: number };
  remote: { weekOf: string; approvedDates: string[]; pattern?: string };
  laptop: { assetTag: string; model: string; purchased: string };
  secondMonitor: boolean;
  mobileDevice: string | null;
  systems: string[];
  housingCase?: { id: string; status: string; note: string; noteAr: string };
  salary: { basic: number; housing: number; transport: number; social: number; other: number; otherLabel?: string };
  note?: string;
  noteAr?: string;
}

export interface Check {
  key: string;
  label: Bi;
  ok: boolean;
  detail: Bi;
  blocking?: boolean;
}

export interface Draft {
  id: string;
  employeeId: string;
  type: RequestType;
  fields: Record<string, string | boolean | string[] | number | null>;
  checks: Check[];
  approver: { name: string; title: string };
  queue: Queue;
  slaDays: number;
  title: Bi;
  eligible: boolean;
  createdAt: string;
  submittedRequestId?: string;
}

export interface ServiceRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeNameAr?: string;
  department: string;
  type: RequestType;
  title: Bi;
  fields: Draft["fields"];
  queue: Queue;
  approver: { name: string; title: string };
  status: RequestStatus;
  channel: "NARVO assistant" | "MNDA People" | "Service Desk phone";
  submittedAt: string;
  approvedAt?: string;
  fulfilmentAt?: string;
  completedAt?: string;
  rejectedAt?: string;
  slaDays: number;
  dueAt: string;
  assignee?: string;
  resolution?: string;
  rejectionNote?: string;
  approvalId?: string;
  outputRef?: string;
  _createdAt?: number;
  _updatedAt?: number;
}

export const TYPE_META: Record<RequestType, { label: Bi; queue: Queue; icon: string }> = {
  salary_certificate: { label: { en: "Salary certificate", ar: "شهادة راتب" }, queue: "HR", icon: "FileBadge" },
  hr_letter: { label: { en: "HR letter", ar: "رسالة إدارية" }, queue: "HR", icon: "Mail" },
  annual_leave: { label: { en: "Leave", ar: "إجازة" }, queue: "HR", icon: "CalendarDays" },
  remote_work: { label: { en: "Remote work", ar: "العمل عن بُعد" }, queue: "HR", icon: "House" },
  it_equipment: { label: { en: "IT equipment", ar: "معدات تقنية" }, queue: "IT", icon: "Laptop" },
  system_access: { label: { en: "System access", ar: "صلاحية نظام" }, queue: "IT", icon: "KeyRound" },
};

export const STATUS_META: Record<RequestStatus, { label: Bi; tone: "neutral" | "info" | "ai" | "success" | "danger" | "warning" }> = {
  submitted: { label: { en: "Awaiting approval", ar: "بانتظار الاعتماد" }, tone: "warning" },
  approved: { label: { en: "Approved", ar: "معتمد" }, tone: "info" },
  in_fulfilment: { label: { en: "In fulfilment", ar: "قيد التنفيذ" }, tone: "ai" },
  completed: { label: { en: "Completed", ar: "مكتمل" }, tone: "success" },
  rejected: { label: { en: "Rejected", ar: "مرفوض" }, tone: "danger" },
};

export const FIELD_LABELS: Record<string, Bi> = {
  addressee: { en: "Addressed to", ar: "موجهة إلى" },
  purpose: { en: "Purpose", ar: "الغرض" },
  language: { en: "Language", ar: "اللغة" },
  includeBreakdown: { en: "Show salary breakdown", ar: "إظهار تفاصيل الراتب" },
  letterType: { en: "Letter type", ar: "نوع الرسالة" },
  leaveType: { en: "Leave type", ar: "نوع الإجازة" },
  startDate: { en: "From", ar: "من" },
  endDate: { en: "To", ar: "إلى" },
  workingDays: { en: "Working days", ar: "أيام العمل" },
  dates: { en: "Remote dates", ar: "أيام العمل عن بُعد" },
  item: { en: "Item", ar: "البند" },
  system: { en: "System", ar: "النظام" },
  accessLevel: { en: "Access level", ar: "مستوى الصلاحية" },
  justification: { en: "Justification", ar: "المبرر" },
  handover: { en: "Handover to", ar: "التسليم إلى" },
  assetTag: { en: "Current asset", ar: "الجهاز الحالي" },
};

export const OPTIONS: Record<string, Array<{ value: string; label: Bi }>> = {
  language: [
    { value: "ar", label: { en: "Arabic", ar: "العربية" } },
    { value: "en", label: { en: "English", ar: "الإنجليزية" } },
  ],
  letterType: [
    { value: "salary_transfer", label: { en: "Salary transfer letter (bank)", ar: "رسالة تحويل راتب (بنك)" } },
    { value: "experience", label: { en: "Experience certificate", ar: "شهادة خبرة" } },
    { value: "noc", label: { en: "NOC (licence / visa / embassy)", ar: "شهادة عدم ممانعة (رخصة / تأشيرة / سفارة)" } },
    { value: "employment_verification", label: { en: "Employment verification", ar: "إثبات عمل" } },
  ],
  leaveType: [
    { value: "annual", label: { en: "Annual leave", ar: "إجازة سنوية" } },
    { value: "sick", label: { en: "Sick leave", ar: "إجازة مرضية" } },
    { value: "compassionate", label: { en: "Compassionate leave", ar: "إجازة وفاة" } },
    { value: "paternity", label: { en: "Paternity leave", ar: "إجازة أبوة" } },
    { value: "hajj", label: { en: "Hajj leave", ar: "إجازة حج" } },
  ],
  item: [
    { value: "laptop_replacement", label: { en: "Laptop replacement", ar: "استبدال الحاسوب المحمول" } },
    { value: "second_monitor", label: { en: "Second monitor (27\" QHD)", ar: "شاشة إضافية 27 بوصة" } },
    { value: "mobile_device", label: { en: "Corporate mobile device", ar: "هاتف مؤسسي" } },
    { value: "vpn", label: { en: "VPN access", ar: "صلاحية الشبكة الافتراضية VPN" } },
  ],
  system: [
    { value: "Tamkeen CMS", label: { en: "Tamkeen CMS (case management)", ar: "تمكين — نظام إدارة الحالات" } },
    { value: "MNDA ePermits", label: { en: "MNDA ePermits", ar: "نظام الرخص الإلكترونية" } },
    { value: "MNDA Finance", label: { en: "MNDA Finance", ar: "النظام المالي" } },
    { value: "Marsa Atlas GIS", label: { en: "Marsa Atlas GIS", ar: "أطلس مرسى — نظم المعلومات الجغرافية" } },
    { value: "MNDA Records (EDRMS)", label: { en: "MNDA Records (EDRMS)", ar: "نظام السجلات الإلكتروني" } },
  ],
  accessLevel: [
    { value: "read", label: { en: "Read only", ar: "قراءة فقط" } },
    { value: "contributor", label: { en: "Contributor", ar: "مساهم" } },
    { value: "admin", label: { en: "Administrator", ar: "مسؤول نظام" } },
  ],
};

export function optionLabel(field: string, value: unknown, lang: "en" | "ar") {
  const o = OPTIONS[field]?.find((x) => x.value === value);
  return o ? o.label[lang] : String(value ?? "");
}

/** Demo "today": Sunday 11 October 2026 (UAE). */
export const DEMO_TODAY = "2026-10-11";

/** Arabic forms of approver names, so Arabic replies never transliterate badly. */
export const NAMES_AR: Record<string, string> = {
  "Latifa Khamis Al Romaithi": "لطيفة خميس الرميثي",
  "Yousef Ibrahim Al Hosani": "يوسف إبراهيم الحوسني",
  "Eng. Hamad Juma Al Kaabi": "م. حمد جمعة الكعبي",
  "Eng. Layla Ahmed Al Marzooqi": "م. ليلى أحمد المرزوقي",
  "Eng. Omar Yousef Al Hammadi": "م. عمر يوسف الحمادي",
  "Hessa Abdulla Al Suwaidi": "حصة عبدالله السويدي",
  "Sara Ahmed Al Blooshi": "سارة أحمد البلوشي",
  "Mariam Saeed Al Kaabi": "مريم سعيد الكعبي",
  "Fatima Obaid Al Nuaimi": "فاطمة عبيد النعيمي",
  "Maryam Hassan Al Shamsi": "مريم حسن الشامسي",
};

/** "19 Oct 2026" / "19 أكتوبر 2026" for an ISO day (YYYY-MM-DD). */
export function dayLabel(iso: string, lang: "en" | "ar") {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00+04:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(lang === "ar" ? "ar-AE-u-nu-latn" : "en-GB", { day: "numeric", month: lang === "ar" ? "long" : "short", year: "numeric", timeZone: "Asia/Dubai" });
}

const arCount = (n: number, one: string, two: string, few: string, many: string) => (n === 1 ? one : n === 2 ? two : n >= 3 && n <= 10 ? `${n} ${few}` : `${n} ${many}`);
/** Arabic duration such as «يومان و3 ساعات» or «5 ساعات و20 دقيقة». */
export function durationAr(d: number, h: number, m: number) {
  const hrs = (x: number) => arCount(x, "ساعة", "ساعتان", "ساعات", "ساعة");
  const mins = (x: number) => arCount(x, "دقيقة", "دقيقتان", "دقائق", "دقيقة");
  if (d >= 1) return h ? `${daysAr(d)} و${hrs(h)}` : daysAr(d);
  if (h >= 1) return m ? `${hrs(h)} و${mins(m)}` : hrs(h);
  return mins(m);
}

/** Arabic count of days with the right noun form (1 يوم، 2 يومان، 3–10 أيام، 11+ يوماً). */
export function daysAr(n: number, noun: "day" | "working" = "day") {
  const w = noun === "working";
  if (n === 1) return w ? "يوم عمل واحد" : "يوم واحد";
  if (n === 2) return w ? "يوما عمل" : "يومان";
  if (n >= 3 && n <= 10) return w ? `${n} أيام عمل` : `${n} أيام`;
  return w ? `${n} يوم عمل` : `${n} يوماً`;
}
