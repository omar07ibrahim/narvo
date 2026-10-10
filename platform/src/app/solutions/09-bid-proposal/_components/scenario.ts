import type { ScenarioStep } from "@/components/narvo/solution-page";

export const SCENARIO: ScenarioStep[] = [
  {
    title: { en: "Read the tender", ar: "قراءة المناقصة" },
    body: {
      en: "Raseen FM is bidding for MNDA/PRC/2026/057 (closes 22 Oct). Click “Extract requirements”: the model reads the full RFP and returns every coded requirement — mandatory, technical, HSE, staffing, Emiratisation, SLAs, reporting, commercial — with the evidence each one needs.",
      ar: "تتقدم رصين لإدارة المرافق للمناقصة MNDA/PRC/2026/057 (تغلق في 22 أكتوبر). اضغط «استخراج المتطلبات»: يقرأ النموذج كراسة الشروط كاملة ويعيد كل متطلب مرمّز مع الدليل المطلوب لكل منها.",
    },
  },
  {
    title: { en: "Map approved evidence", ar: "ربط الأدلة المعتمدة" },
    body: {
      en: "Click “Map evidence”. Each requirement is matched to Raseen's approved library (BM25) and judged met / partial / missing with a verbatim quote. Computed checks overrule the model: the public liability policy expires 15 Oct — before closing — and ISO 45001 lapses inside the bid validity period. Open S-04: no CEM-certified Energy Manager in the library.",
      ar: "اضغط «ربط الأدلة». يُطابَق كل متطلب مع مكتبة رصين المعتمدة ويُقيَّم مع اقتباس حرفي. الفحوص المحسوبة تتقدم على النموذج: وثيقة المسؤولية تنتهي في 15 أكتوبر قبل الإغلاق، وشهادة الأيزو 45001 تنتهي خلال فترة صلاحية العطاء. افتح S-04: لا يوجد مدير طاقة معتمد.",
    },
  },
  {
    title: { en: "Catch unsupported claims", ar: "رصد الادعاءات غير المدعومة" },
    body: {
      en: "Go to Response drafting → Executive Summary (v0.3 by Marketing). Click “Check claims”: “100% PPM compliance”, “ISO 50001” and “zero lost-time injuries in five years” are contradicted by Raseen's own KPI, certificate and HSE records. Click “Replace in draft” on one — a new revision is saved and logged.",
      ar: "انتقل إلى صياغة الرد ← الملخص التنفيذي (النسخة 0.3 من التسويق). اضغط «تحقق من الادعاءات»: «امتثال 100% للصيانة الوقائية» و«الأيزو 50001» و«صفر إصابات مضيعة للوقت» تتعارض مع سجلات رصين نفسها. اضغط «استبدل في المسودة» — تُحفظ مراجعة جديدة وتُسجّل.",
    },
  },
  {
    title: { en: "Draft a sourced section", ar: "صياغة قسم موثق" },
    body: {
      en: "Select “Maintenance Methodology” and click “Draft with AI”. The section streams with [n] citations to method statements and CVs; requirements the library cannot evidence (e.g. monthly coil cleaning, T-04) are marked as evidence gaps instead of being invented.",
      ar: "اختر «منهجية الصيانة» واضغط «صياغة بالذكاء الاصطناعي». يُكتب القسم مباشرة مع استشهادات [n]، والمتطلبات التي لا تدعمها المكتبة تُعلَّم كفجوات أدلة بدلاً من اختلاقها.",
    },
  },
  {
    title: { en: "Turn gaps into owned tasks", ar: "تحويل الفجوات إلى مهام" },
    body: {
      en: "Contributor tasks → “Assign gaps to contributors”. Each gap becomes a precise ask for the right person (HR for the Energy Manager CV, Group CFO for insurance, HVAC supervisor for the summer plan) with a due date computed before the 19 Oct internal review.",
      ar: "المهام ← «إسناد الفجوات». تتحول كل فجوة إلى طلب محدد للشخص المناسب مع تاريخ استحقاق محسوب قبل المراجعة الداخلية في 19 أكتوبر.",
    },
  },
  {
    title: { en: "Fill the missing response", ar: "استكمال الرد الناقص" },
    body: {
      en: "On Huda Al Marzooqi's S-04 task, insert her emailed reply (Energy Manager CV) and click “Evaluate & update matrix” — S-04 turns Evidenced. Do the same for Priya's renewed insurance: the certificate register updates and the computed M-04 check clears.",
      ar: "في مهمة هدى المرزوقي (S-04) أدرج ردها (السيرة الذاتية لمدير الطاقة) واضغط «تقييم وتحديث المصفوفة» — يصبح S-04 مستوفى. كرر ذلك لتجديد التأمين: يتحدث سجل الشهادات ويزول تنبيه M-04.",
    },
  },
  {
    title: { en: "Approve and export", ar: "الاعتماد والتصدير" },
    body: {
      en: "In the Submission panel click “Request submission approval”. Leena Mattar sees computed readiness (coverage, flags, forms) and approves — status becomes “Approved for submission”, Form F-2 is completed, the audit trail records it, and the response pack exports as Markdown.",
      ar: "في لوحة التقديم اضغط «طلب اعتماد التقديم». ترى لينا مطر الجاهزية المحسوبة وتعتمد — تصبح الحالة «معتمد للتقديم» ويُستكمل النموذج F-2 ويُسجَّل ذلك، ثم تُصدَّر حزمة الرد.",
    },
  },
];
