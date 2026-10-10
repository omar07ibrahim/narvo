import type { CaseCheck, HousingCase } from "./types";
import type { Extraction } from "./extract";

/**
 * Circular No. 9/2026 checks — computed deterministically from extracted fields.
 * The model reads documents; these rules decide what is complete, valid or inconsistent.
 */

export const RULES = {
  grantIncomeCeiling: 30000,
  loanIncomeCeiling: 60000,
  grantMax: 600000,
  loanMax: 900000,
  salaryCertMaxAgeDays: 30,
  noPropertyMaxAgeDays: 60,
  incomeTolerance: 0.05,
  clarificationWorkingDays: 15,
};

const DAY = 86400000;

export function daysBetween(a: string | Date, b: string | Date) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / DAY);
}

/** Add UAE working days (Mon–Fri). */
export function addWorkingDays(start: string | Date, n: number): Date {
  const d = new Date(start);
  let added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) added++;
  }
  return d;
}

export function workingDaysBetween(a: string | Date, b: string | Date) {
  const start = new Date(a);
  const end = new Date(b);
  let n = 0;
  const d = new Date(start);
  while (d < end) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6 && d <= end) n++;
  }
  return n;
}

const norm = (s?: string | null) =>
  (s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ]/g, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");

const eidNorm = (s?: string | null) => (s ?? "").replace(/\D/g, "");

const aed = (n: number) => `AED ${Math.round(n).toLocaleString("en-US")}`;

export interface RuleInput {
  c: HousingCase;
  docs: Array<{ type: string; label: string; x?: Extraction }>;
  registryCertificate?: { issued: string; result: "none" | "owns"; reference: string } | null;
}

export function runChecks({ c, docs, registryCertificate }: RuleInput): { checks: CaseCheck[]; missing: string[]; householdIncome: number | null } {
  const checks: CaseCheck[] = [];
  const missing: string[] = [];
  const submitted = c.submittedAt;
  const married = /married|متزوج/i.test(c.applicant.maritalStatus);
  const find = (t: string) => docs.find((d) => d.type === t);
  const app = find("application_form")?.x;

  // 1. Applicant Emirates ID
  const eidA = find("emirates_id_applicant");
  if (!eidA) {
    missing.push("Emirates ID — applicant");
    checks.push({
      id: "eid_applicant",
      label: { en: "Emirates ID — applicant", ar: "الهوية الإماراتية — المتقدم" },
      status: "fail",
      detail: { en: "Not attached.", ar: "غير مرفقة." },
      policyRef: "Circular 9/2026 §4.1",
    });
  } else {
    const x = eidA.x;
    const idMatch = eidNorm(x?.emiratesId) === eidNorm(c.applicant.emiratesId);
    const expired = x?.expiryDate ? new Date(x.expiryDate) < new Date(submitted) : false;
    checks.push({
      id: "eid_applicant",
      label: { en: "Emirates ID — applicant", ar: "الهوية الإماراتية — المتقدم" },
      status: !idMatch || expired ? "fail" : "pass",
      detail: expired
        ? { en: `Expired on ${x?.expiryDate}.`, ar: `منتهية الصلاحية بتاريخ ${x?.expiryDate}.` }
        : idMatch
          ? { en: `${x?.emiratesId} matches the application; valid until ${x?.expiryDate ?? "—"}.`, ar: `${x?.emiratesId} مطابق للطلب؛ سارية حتى ${x?.expiryDate ?? "—"}.` }
          : { en: `ID on card (${x?.emiratesId ?? "unreadable"}) does not match the application.`, ar: `رقم الهوية في البطاقة (${x?.emiratesId ?? "غير مقروء"}) لا يطابق الطلب.` },
      policyRef: "Circular 9/2026 §4.1",
      evidence: eidA.label,
    });
    if (expired) missing.push("Valid Emirates ID — applicant");
  }

  // 2. Spouse Emirates ID (married applicants)
  if (married) {
    const eidS = find("emirates_id_spouse");
    checks.push({
      id: "eid_spouse",
      label: { en: "Emirates ID — spouse", ar: "الهوية الإماراتية — الزوج/الزوجة" },
      status: eidS ? "pass" : "fail",
      detail: eidS
        ? { en: `${eidS.x?.holderName ?? "Spouse"} · ${eidS.x?.emiratesId ?? ""}`, ar: `${eidS.x?.holderNameAr ?? eidS.x?.holderName ?? "الزوج/الزوجة"} · ${eidS.x?.emiratesId ?? ""}` }
        : { en: "Required for married applicants — not attached.", ar: "مطلوبة للمتزوجين — غير مرفقة." },
      policyRef: "Circular 9/2026 §4.2",
      evidence: eidS?.label,
    });
    if (!eidS) missing.push("Emirates ID — spouse");
  }

  // 3. Family book completeness
  const fb = find("family_book");
  if (!fb) {
    missing.push("Family Book — complete copy");
    checks.push({
      id: "family_book",
      label: { en: "Family Book — all pages", ar: "خلاصة القيد — جميع الصفحات" },
      status: "fail",
      detail: { en: "Not attached.", ar: "غير مرفقة." },
      policyRef: "Circular 9/2026 §4.3",
    });
  } else {
    const members = fb.x?.familyMembers ?? [];
    const children = members.filter((m) => /son|daughter|child|ابن|ابنة|بنت/i.test(m.relation)).length;
    const ok = children >= c.applicant.dependents;
    checks.push({
      id: "family_book",
      label: { en: "Family Book — all pages", ar: "خلاصة القيد — جميع الصفحات" },
      status: ok ? "pass" : "fail",
      detail: ok
        ? { en: `${members.length} members incl. ${children} children — matches ${c.applicant.dependents} dependents declared.`, ar: `${members.length} أفراد منهم ${children} أبناء — يطابق ${c.applicant.dependents} معالين مصرّح بهم.` }
        : { en: `Only ${children} children listed vs ${c.applicant.dependents} dependents declared — children's pages likely missing.`, ar: `مدرج ${children} أبناء فقط مقابل ${c.applicant.dependents} معالين — يُرجّح نقص صفحات الأبناء.` },
      policyRef: "Circular 9/2026 §4.3",
      evidence: fb.label,
    });
    if (!ok) missing.push("Family Book — complete copy including children's pages");
  }

  // 4. Salary certificate age + income consistency
  const sc = find("salary_certificate");
  let certifiedIncome: number | null = null;
  if (!sc) {
    missing.push("Salary certificate issued within the last 30 days");
    checks.push({
      id: "salary_age",
      label: { en: "Salary certificate ≤ 30 days", ar: "شهادة راتب لا يتجاوز عمرها 30 يوماً" },
      status: "fail",
      detail: { en: "Not attached.", ar: "غير مرفقة." },
      policyRef: "Circular 9/2026 §4.4",
    });
  } else {
    const issued = sc.x?.issueDate;
    const age = issued ? daysBetween(issued, submitted) : null;
    const fresh = age != null && age <= RULES.salaryCertMaxAgeDays;
    checks.push({
      id: "salary_age",
      label: { en: "Salary certificate ≤ 30 days", ar: "شهادة راتب لا يتجاوز عمرها 30 يوماً" },
      status: age == null ? "warn" : fresh ? "pass" : "fail",
      detail:
        age == null
          ? { en: "Issue date not legible — verify manually.", ar: "تاريخ الإصدار غير مقروء — يلزم التحقق يدوياً." }
          : fresh
            ? { en: `Issued ${issued} — ${age} days before submission.`, ar: `صادرة بتاريخ ${issued} — قبل التقديم بـ ${age} يوماً.` }
            : { en: `Issued ${issued} — ${age} days before submission (limit 30). Treated as missing.`, ar: `صادرة بتاريخ ${issued} — قبل التقديم بـ ${age} يوماً (الحد 30). تُعامل كمستند ناقص.` },
      policyRef: "Circular 9/2026 §4.4 · §6.1",
      evidence: sc.label,
    });
    if (!fresh) missing.push(`Salary certificate issued within the last 30 days (submitted certificate dated ${issued ?? "unknown"})`);

    certifiedIncome = sc.x?.totalMonthlySalary ?? (sc.x?.salaryComponents?.reduce((a, b) => a + b.amount, 0) || null);
  }

  const declared = app?.declaredIncome ?? c.applicant.monthlyIncomeDeclared;
  if (certifiedIncome != null && declared) {
    const diff = (certifiedIncome - declared) / declared;
    const within = Math.abs(diff) <= RULES.incomeTolerance;
    checks.push({
      id: "income_match",
      label: { en: "Declared vs certified income", ar: "الدخل المصرّح به مقابل المعتمد" },
      status: within ? "pass" : "fail",
      detail: within
        ? { en: `Declared ${aed(declared)} vs certified ${aed(certifiedIncome)} (${(diff * 100).toFixed(1)}%).`, ar: `المصرّح ${aed(declared)} مقابل المعتمد ${aed(certifiedIncome)} (${(diff * 100).toFixed(1)}%).` }
        : {
            en: `Declared ${aed(declared)} vs certified ${aed(certifiedIncome)} — difference ${(diff * 100).toFixed(1)}% exceeds 5%. Clarification required.`,
            ar: `المصرّح ${aed(declared)} مقابل المعتمد ${aed(certifiedIncome)} — فرق ${(diff * 100).toFixed(1)}% يتجاوز 5%. يلزم الاستيضاح.`,
          },
      policyRef: "Circular 9/2026 §6.2",
      evidence: sc?.label,
    });
  }

  // 5. Income ceiling for the requested track (household)
  const spouseEmployed = app?.spouseEmployed ?? null;
  const householdIncome = certifiedIncome ?? declared ?? null;
  if (householdIncome != null) {
    const ceiling = c.track === "grant" ? RULES.grantIncomeCeiling : RULES.loanIncomeCeiling;
    const over = householdIncome > ceiling;
    checks.push({
      id: "income_ceiling",
      label: { en: `Income ceiling — ${c.track}`, ar: c.track === "grant" ? "سقف الدخل — المنحة" : "سقف الدخل — القرض" },
      status: over ? "fail" : spouseEmployed === null && married ? "warn" : "pass",
      detail: over
        ? {
            en: `Household income ${aed(householdIncome)} exceeds the ${c.track} ceiling of ${aed(ceiling)}.${c.track === "grant" && householdIncome <= RULES.loanIncomeCeiling ? " Eligible for the loan track instead." : ""}`,
            ar: `دخل الأسرة ${aed(householdIncome)} يتجاوز سقف ${c.track === "grant" ? "المنحة" : "القرض"} البالغ ${aed(ceiling)}.${c.track === "grant" && householdIncome <= RULES.loanIncomeCeiling ? " مؤهل لمسار القرض بدلاً من ذلك." : ""}`,
          }
        : spouseEmployed === null && married
          ? {
              en: `Applicant income ${aed(householdIncome)} is within the ${aed(ceiling)} ceiling; spouse employment is not stated on the form — confirm household income.`,
              ar: `دخل المتقدم ${aed(householdIncome)} ضمن السقف البالغ ${aed(ceiling)}؛ لم تُذكر حالة عمل الزوج/الزوجة في النموذج — يلزم تأكيد دخل الأسرة.`,
            }
          : { en: `Household income ${aed(householdIncome)} within the ${aed(ceiling)} ceiling.`, ar: `دخل الأسرة ${aed(householdIncome)} ضمن السقف البالغ ${aed(ceiling)}.` },
      policyRef: c.track === "grant" ? "Circular 9/2026 §3.2" : "Circular 9/2026 §3.3",
    });
  }

  // 6. Amount within programme maximum
  const max = c.track === "grant" ? RULES.grantMax : RULES.loanMax;
  checks.push({
    id: "amount",
    label: { en: "Amount within programme maximum", ar: "المبلغ ضمن الحد الأقصى للبرنامج" },
    status: c.amountRequested <= max ? "pass" : "fail",
    detail: { en: `${aed(c.amountRequested)} requested · maximum ${aed(max)}.`, ar: `المطلوب ${aed(c.amountRequested)} · الحد الأقصى ${aed(max)}.` },
    policyRef: c.track === "grant" ? "Circular 9/2026 §3.2" : "Circular 9/2026 §3.3",
  });

  // 7. Certificate of No Property Ownership
  const np = find("no_property_certificate");
  const consent = app?.landRegistryConsent ?? c.landRegistryConsent ?? false;
  if (np?.x || registryCertificate) {
    const issued = registryCertificate?.issued ?? np?.x?.issueDate ?? null;
    const age = issued ? daysBetween(issued, registryCertificate ? new Date() : submitted) : null;
    const owns = registryCertificate?.result === "owns";
    const valid = !owns && (age == null || age <= RULES.noPropertyMaxAgeDays);
    checks.push({
      id: "no_property",
      label: { en: "Certificate of No Property Ownership", ar: "شهادة عدم ملكية عقار" },
      status: valid ? "pass" : "fail",
      detail: owns
        ? { en: "Land Registry shows a registered residential property.", ar: "يُظهر سجل الأراضي عقاراً سكنياً مسجلاً." }
        : registryCertificate
          ? { en: `Retrieved from the Land Registry with consent — ${registryCertificate.reference}.`, ar: `استُخرجت من سجل الأراضي بموافقة المتقدم — ${registryCertificate.reference}.` }
          : { en: `Issued ${issued ?? "—"} (${age ?? "?"} days before submission; valid 60 days).`, ar: `صادرة بتاريخ ${issued ?? "—"} (قبل التقديم بـ ${age ?? "?"} يوماً؛ صالحة 60 يوماً).` },
      policyRef: "Circular 9/2026 §4.5",
      evidence: registryCertificate ? "Land Registry" : np?.label,
    });
  } else if (consent) {
    checks.push({
      id: "no_property",
      label: { en: "Certificate of No Property Ownership", ar: "شهادة عدم ملكية عقار" },
      status: "warn",
      detail: {
        en: "Not attached, but the applicant consented to direct retrieval — the officer can obtain it from the Land Registry instead of asking the applicant.",
        ar: "غير مرفقة، لكن المتقدم وافق على الاستخراج المباشر — يمكن للموظف الحصول عليها من سجل الأراضي بدلاً من مطالبة المتقدم.",
      },
      policyRef: "Circular 9/2026 §6.3",
    });
  } else {
    missing.push("Certificate of No Property Ownership");
    checks.push({
      id: "no_property",
      label: { en: "Certificate of No Property Ownership", ar: "شهادة عدم ملكية عقار" },
      status: "fail",
      detail: { en: "Not attached and no Land Registry consent given.", ar: "غير مرفقة ولم يُمنح الإذن بالاستخراج من سجل الأراضي." },
      policyRef: "Circular 9/2026 §4.5",
    });
  }

  // 8. Bank statement (loan only)
  if (c.track === "loan") {
    const bs = find("bank_statement");
    const credits = bs?.x?.salaryCredits?.length ?? 0;
    checks.push({
      id: "bank_statement",
      label: { en: "Bank statement — 6 months", ar: "كشف حساب بنكي — 6 أشهر" },
      status: bs ? (credits >= 6 ? "pass" : "warn") : "fail",
      detail: bs
        ? { en: `${bs.x?.statementPeriod ?? "Period unclear"} · ${credits} salary credits.`, ar: `${bs.x?.statementPeriod ?? "الفترة غير واضحة"} · ${credits} إيداعات راتب.` }
        : { en: "Required for the loan track — not attached.", ar: "مطلوب لمسار القرض — غير مرفق." },
      policyRef: "Circular 9/2026 §4.6",
      evidence: bs?.label,
    });
    if (!bs) missing.push("Bank statement — last 6 months");
  }

  // 9. Name consistency across documents
  const names = docs
    .filter((d) => ["emirates_id_applicant", "salary_certificate", "application_form"].includes(d.type) && d.x)
    .map((d) => ({ label: d.label, en: d.x!.holderName, ar: d.x!.holderNameAr }));
  const target = norm(c.applicant.name);
  const targetAr = norm(c.applicant.nameAr);
  const mismatches = names.filter((n) => !(norm(n.en) === target || norm(n.ar) === targetAr || (!n.en && !n.ar)));
  checks.push({
    id: "identity",
    label: { en: "Identity consistent across documents", ar: "اتساق الهوية بين المستندات" },
    status: mismatches.length ? "warn" : "pass",
    detail: mismatches.length
      ? { en: `Name differs on: ${mismatches.map((m) => m.label).join(", ")}.`, ar: `الاسم مختلف في: ${mismatches.map((m) => m.label).join("، ")}.` }
      : { en: `Same person on ${names.length} documents.`, ar: `الشخص نفسه في ${names.length} مستندات.` },
  });

  return { checks, missing, householdIncome };
}
