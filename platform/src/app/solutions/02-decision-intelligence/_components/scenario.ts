import type { ScenarioStep } from "@/components/narvo/solution-page";

export const SCENARIO: ScenarioStep[] = [
  {
    title: { en: "The fortnight at a glance", ar: "الأسبوعان في لمحة" },
    body: {
      en: "Dr. Amna Al Ketbi prepares Monday's review for H.E. the Director General. The KPI header is computed live from 282 days of source data: open housing cases 1,184 against a target of 600, phone wait 7:43, budget execution 67.1% against a 74.6% plan. Click any card to open its 13-week trend.",
      ar: "تُعدّ د. آمنة الكتبي مراجعة يوم الاثنين لسعادة المدير العام. تُحتسب المؤشرات مباشرة من 282 يوماً من البيانات المصدرية: 1,184 طلب إسكان مفتوح مقابل مستهدف 600، وانتظار هاتفي 7:43، وتنفيذ ميزانية 67.1% مقابل خطة 74.6%. انقر على أي بطاقة لعرض اتجاه 13 أسبوعاً.",
    },
  },
  {
    title: { en: "Check the figures before the meeting", ar: "تحقق من الأرقام قبل الاجتماع" },
    body: {
      en: "Open Figure check and run it. The model reads 14 department updates and maps every figure to a KPI and period; the system recomputes each one. It catches Housing's “around 900” open cases (scorecard 1,184), the CHC's outdated 5:10 wait (now 7:43) and Finance's 74% execution (actual 67.1%).",
      ar: "افتح «فحص الأرقام» وشغّله. يقرأ النموذج 14 تحديثاً ويربط كل رقم بمؤشر وفترة، ويعيد النظام احتساب كل رقم. يكتشف «نحو 900» طلب في تحديث الإسكان (الفعلي 1,184)، وزمن الانتظار القديم 5:10 في تحديث المركز (الحالي 7:43)، و74% في تحديث المالية (الفعلي 67.1%).",
    },
  },
  {
    title: { en: "Generate the review briefing", ar: "أعدّ إحاطة المراجعة" },
    body: {
      en: "Generate the briefing: headline, what changed, watch items, decisions needed and open actions. Hover a citation chip to see the computed fact or the update behind it. The footer confirms every figure traces back to a source — the model never invents a number.",
      ar: "أعدّ الإحاطة: الخلاصة، وما تغيّر، ونقاط المتابعة، والقرارات المطلوبة، والإجراءات المفتوحة. مرّر المؤشر على رقم المصدر لرؤية الحقيقة المحسوبة أو التحديث الذي يستند إليه. ويؤكد التذييل أن كل رقم مرتبط بمصدره ولا يختلق النموذج أي رقم.",
    },
  },
  {
    title: { en: "Ask the data", ar: "اسأل البيانات" },
    body: {
      en: "Ask in English or Arabic — or by voice: “How has the housing backlog developed since July compared with decisions issued?”. The model writes only a validated query; the chart and figures are computed in code, and the answer cites them.",
      ar: "اسأل بالعربية أو الإنجليزية أو بالصوت: «كيف تطور تراكم طلبات الإسكان منذ يوليو مقارنة بالقرارات الصادرة؟». يكتب النموذج استعلاماً معتمداً فقط، وتُحتسب الأرقام والرسم برمجياً، وتستشهد الإجابة بها.",
    },
  },
  {
    title: { en: "Bring the next decision into focus", ar: "ركّز على القرار التالي" },
    body: {
      en: "Click Propose decisions. Each proposal names an owner, a due date and the KPI it should move, with its evidence. Submit one for approval — H.E. the Director General approves it in place (or from the Inbox) and it becomes ACT-2026-055 in the register.",
      ar: "انقر «اقتراح القرارات». يحدد كل مقترح المسؤول والموعد والمؤشر المستهدف مع أدلته. ارفع أحدها للاعتماد — يعتمده سعادة المدير العام مباشرة (أو من صندوق الوارد) فيصبح الإجراء ACT-2026-055 في السجل.",
    },
  },
  {
    title: { en: "Track the response into the next review", ar: "تابع الاستجابة حتى المراجعة التالية" },
    body: {
      en: "In the actions register, close an overdue item such as ACT-2026-049 (fast-track of the oldest housing files). Action closure rises from 48% toward the 83% target, the event is audited, and the next briefing reads the updated register.",
      ar: "في سجل الإجراءات، أغلق إجراءً متأخراً مثل ACT-2026-049 (المعالجة المسرّعة لأقدم ملفات الإسكان). ترتفع نسبة الإغلاق من 48% نحو المستهدف 83%، ويُسجَّل الحدث في سجل التدقيق، وتقرأ الإحاطة التالية السجل المحدّث.",
    },
  },
];
