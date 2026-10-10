import type { ScenarioStep } from "@/components/narvo/solution-page";

export const SCENARIO: ScenarioStep[] = [
  {
    title: { en: "Three bids, one decision", ar: "ثلاثة عروض وقرار واحد" },
    body: {
      en: "MNDA/PRC/2026/041 — integrated FM for MNDA Tower and the three Customer Happiness Centres closed on 30 Sep. Raseen FM (incumbent elsewhere), Al Bahar (cheapest) and Crescent FM (strongest technically) bid. Click “Compare submissions against criteria”.",
      ar: "المناقصة MNDA/PRC/2026/041 لإدارة مرافق برج الهيئة ومراكز سعادة المتعاملين أغلقت في 30 سبتمبر. تقدمت رصين والبحر (الأرخص) وكريسنت (الأقوى فنياً). اضغط «قارن العروض بالمعايير».",
    },
  },
  {
    title: { en: "Read the evidence matrix", ar: "اقرأ مصفوفة الأدلة" },
    body: {
      en: "Every cell carries a verbatim quote — hover to see it. Computed gates show Al Bahar's ISO 41001 expired on 14 Aug, before closing. The scope rows show Al Bahar excluded pest control, so its price is normalised for a fair comparison (Art. 27).",
      ar: "كل خلية تحمل اقتباساً حرفياً — مرّر المؤشر لرؤيته. تُظهر الشروط المحسوبة أن شهادة الأيزو 41001 لدى البحر انتهت في 14 أغسطس قبل الإغلاق، وأن البحر استثنى مكافحة الآفات فسُوّي سعره للمقارنة العادلة (المادة 27).",
    },
  },
  {
    title: { en: "Ask, approve, issue", ar: "اسأل واعتمد وأصدر" },
    body: {
      en: "Clarifications → Al Bahar → “Draft clarification questions”. The questions confirm or evidence only — no price changes (Art. 29). Rashed Ali Al Dhaheri approves; CLR-02 is issued and logged.",
      ar: "الاستيضاحات ← البحر ← «صياغة أسئلة الاستيضاح». تقتصر الأسئلة على التأكيد أو الإثبات دون تعديل السعر (المادة 29). يعتمد راشد الظاهري فيصدر الطلب CLR-02 ويُسجّل.",
    },
  },
  {
    title: { en: "The supplier clarifies the excluded service", ar: "المورد يوضح الخدمة المستثناة" },
    body: {
      en: "Load Al Bahar's response received via the portal and click “Evaluate response”. Pest control is confirmed inside the lump sum, the renewed ISO 41001 certificate updates the register and UAE data hosting is confirmed — the matrix, gates and normalised price update, and procurement now compares the full scope.",
      ar: "حمّل رد البحر الوارد عبر البوابة واضغط «تقييم الرد». تأكد شمول مكافحة الآفات في السعر، وحدّثت الشهادة المجددة السجل، وتأكدت استضافة البيانات داخل الدولة — فتتحدث المصفوفة والشروط والسعر المسوّى وتصبح المقارنة على كامل النطاق.",
    },
  },
  {
    title: { en: "Scores the committee owns", ar: "درجات تملكها اللجنة" },
    body: {
      en: "Scoring & sensitivity: totals are computed in code (lowest price ÷ price × 30). Override a score with a written justification — it is logged (Art. 30). Drag the technical weight to see where the ranking flips and what price would change it.",
      ar: "الدرجات والحساسية: تُحسب المجاميع برمجياً (أدنى سعر ÷ السعر × 30). عدّل درجة مع مبرر مكتوب — يُسجّل التعديل (المادة 30). حرّك الوزن الفني لترى أين يتغير الترتيب والسعر الذي يغيّره.",
    },
  },
  {
    title: { en: "Report and recommend", ar: "التقرير والتوصية" },
    body: {
      en: "Report & award → “Draft evaluation report”: a cited report using the computed figures verbatim. Submit the recommendation; on the chair's approval it is recorded in the tender and in the supplier register, forwarded for the Director General's award decision.",
      ar: "التقرير والترسية ← «صياغة تقرير التقييم»: تقرير موثق يستخدم الأرقام المحسوبة كما هي. ارفع التوصية؛ وعند اعتماد الرئيس تُسجّل في المناقصة وسجل المورد وتُحال لقرار المدير العام.",
    },
  },
  {
    title: { en: "Source the next need", ar: "توريد الاحتياج التالي" },
    body: {
      en: "Sourcing: type or speak “مكافحة الآفات للمراكز المجتمعية” with an estimate of AED 186,000 — the method (limited tender) and approver are computed; the model drafts scope, requirements and weighted criteria grounded in the manual.",
      ar: "التوريد: اكتب أو قل «مكافحة الآفات للمراكز المجتمعية» بقيمة تقديرية 186,000 درهم — تُحسب الطريقة (مناقصة محدودة) وجهة الاعتماد، ويصوغ النموذج النطاق والمتطلبات والمعايير الموزونة استناداً إلى الدليل.",
    },
  },
];
