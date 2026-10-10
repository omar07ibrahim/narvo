import type { Tone } from "@/components/narvo/status";
import type { CaseStatus } from "../_lib/types";

export const STATUS: Record<CaseStatus, { en: string; ar: string; tone: Tone }> = {
  submitted: { en: "New", ar: "جديد", tone: "info" },
  under_review: { en: "Under review", ar: "قيد المراجعة", tone: "neutral" },
  incomplete: { en: "Awaiting applicant", ar: "بانتظار المتعامل", tone: "warning" },
  verification: { en: "Verification", ar: "التحقق", tone: "ai" },
  decision_pending: { en: "Decision pending", ar: "بانتظار القرار", tone: "ai" },
  approved: { en: "Approved", ar: "معتمد", tone: "success" },
  not_approved: { en: "Not approved", ar: "غير معتمد", tone: "danger" },
};

export const FIELD_LABELS: Record<string, { en: string; ar: string }> = {
  title: { en: "Document", ar: "المستند" },
  holderName: { en: "Name (Latin)", ar: "الاسم (لاتيني)" },
  holderNameAr: { en: "Name (Arabic)", ar: "الاسم (عربي)" },
  emiratesId: { en: "Emirates ID", ar: "رقم الهوية" },
  issueDate: { en: "Issue date", ar: "تاريخ الإصدار" },
  expiryDate: { en: "Expiry date", ar: "تاريخ الانتهاء" },
  issuer: { en: "Issuer", ar: "جهة الإصدار" },
  reference: { en: "Reference", ar: "المرجع" },
  employer: { en: "Employer", ar: "جهة العمل" },
  position: { en: "Position", ar: "الوظيفة" },
  totalMonthlySalary: { en: "Total monthly salary", ar: "إجمالي الراتب الشهري" },
  declaredIncome: { en: "Declared household income", ar: "الدخل المصرّح به" },
  track: { en: "Track", ar: "المسار" },
  amountRequested: { en: "Amount requested", ar: "المبلغ المطلوب" },
  plot: { en: "Plot", ar: "رقم الأرض" },
  maritalStatus: { en: "Marital status", ar: "الحالة الاجتماعية" },
  dependents: { en: "Dependents", ar: "المعالون" },
  spouseName: { en: "Spouse", ar: "الزوج/الزوجة" },
  spouseEmployed: { en: "Spouse employed", ar: "عمل الزوج/الزوجة" },
  landRegistryConsent: { en: "Land Registry consent", ar: "الموافقة على الاستعلام" },
  statementPeriod: { en: "Statement period", ar: "فترة الكشف" },
  registryResult: { en: "Registry result", ar: "نتيجة السجل" },
};

export const FIELD_ORDER = Object.keys(FIELD_LABELS);
