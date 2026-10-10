import type { ScenarioStep } from "@/components/narvo/solution-page";

export const SCENARIO: ScenarioStep[] = [
  {
    title: { en: "Find the delay", ar: "اكتشف التأخير" },
    body: {
      en: "The process map is discovered from 8,600 events of 1,513 building-permit applications. For Q3 2026 (1,047 applications) the median is 21.6 days against a 15-day target; the orange arrows mark the longest waits — the master-developer NOC hold and the return loop.",
      ar: "تُكتشف خريطة العملية من 8,600 حدث لـ1,513 طلب رخصة بناء. في الربع الثالث 2026 (1,047 طلباً) بلغ الوسيط 21.6 يوماً مقابل مستهدف 15 يوماً، وتشير الأسهم البرتقالية إلى أطول فترات الانتظار: انتظار شهادة المطور الرئيسي ودورة الإعادة.",
    },
  },
  {
    title: { en: "Compare gated and non-gated", ar: "قارن المسوّرة وغير المسوّرة" },
    body: {
      en: "Filter Gated: 27.9 days vs 16.8 for non-gated districts. Open Variants and Performance: 27% of applications are returned, 46% of returns are a missing or expired NOC, and Lulu Island Developments averages 12.4 days per NOC.",
      ar: "صفِّ حسب المسوّرة: 27.9 يوماً مقابل 16.8 لغير المسوّرة. في «المسارات» و«الأداء»: أعيد 27% من الطلبات، و46% من الإعادات بسبب شهادة غير مرفقة أو منتهية، ومتوسط شركة جزيرة اللؤلؤ 12.4 يوماً لكل شهادة.",
    },
  },
  {
    title: { en: "Explain the root causes", ar: "فسّر الأسباب الجذرية" },
    body: {
      en: "Run the root-cause analysis. The model receives the computed statistics and a balanced sample of Arabic and English officer notes, and explains each cause with figures and verbatim quotes — every claim cited.",
      ar: "شغّل تحليل الأسباب الجذرية. يتلقى النموذج الإحصاءات المحسوبة وعينة متوازنة من ملاحظات الموظفين بالعربية والإنجليزية، ويشرح كل سبب بالأرقام والاقتباسات الحرفية مع توثيق كل ادعاء.",
    },
  },
  {
    title: { en: "Fix the process — simulate it first", ar: "أصلح العملية — بالمحاكاة أولاً" },
    body: {
      en: "In Simulate & improve, switch interventions on and adjust their assumptions. Every issued case is replayed with its own recorded waits: the default package brings the median from 21.6 to about 18.9 days and rework from 27% to 13%.",
      ar: "في «المحاكاة والتحسين» فعّل التدخلات وعدّل افتراضاتها. يُعاد تشغيل كل طلب صادر بأزمنته المسجلة: تخفض الحزمة الافتراضية الوسيط من 21.6 إلى نحو 18.9 يوماً وإعادة العمل من 27% إلى 13%.",
    },
  },
  {
    title: { en: "Propose the change", ar: "اقترح التغيير" },
    body: {
      en: "Draft the change memo — problem, evidence, intervention, expected impact and measurement plan — then submit it. Eng. Omar Yousef Al Hammadi approves it in place and it is written to the change log with an audit record.",
      ar: "صُغ مذكرة التغيير — المشكلة والأدلة والتدخل والأثر المتوقع وخطة القياس — ثم ارفعها. يعتمدها م. عمر يوسف الحمادي مباشرة فتُسجَّل في سجل التغييرات مع قيد تدقيق.",
    },
  },
  {
    title: { en: "Measure the change", ar: "قِس التغيير" },
    body: {
      en: "Measure the change compares the intake pilot (114 applications since 1 Oct) with the Q3 baseline: 7.9% returned vs 27%. Cycle time is honestly marked “too early” until enough pilot permits are issued.",
      ar: "يقارن «قياس التغيير» تجربة الاستلام (114 طلباً منذ 1 أكتوبر) بخط أساس الربع الثالث: 7.9% معادة مقابل 27%. ويُوسم زمن الدورة بوضوح «مبكر جداً» حتى يصدر عدد كافٍ من رخص التجربة.",
    },
  },
  {
    title: { en: "Bring your own log", ar: "استخدم سجلك الخاص" },
    body: {
      en: "Drop any CSV with case id, activity and timestamp — or load the sample AP invoice log. The same discovery runs on it: repeated supplier queries reveal the missing intake check.",
      ar: "أسقط أي ملف CSV يحتوي رقم الحالة والنشاط والوقت — أو حمّل سجل الفواتير التجريبي. يعمل الاكتشاف نفسه عليه: تكشف الاستفسارات المتكررة للموردين غياب التحقق عند الاستلام.",
    },
  },
];
