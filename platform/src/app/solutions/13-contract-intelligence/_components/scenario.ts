import type { ScenarioStep } from "@/components/narvo/solution-page";

export const SCENARIO: ScenarioStep[] = [
  {
    title: { en: "One register, every commitment", ar: "سجل واحد لكل الالتزامات" },
    body: {
      en: "Eleven MNDA contracts in force and one incoming vendor draft. Every due date is computed from the contract's own rules — e.g. MNDA/CON/2023/019 expires 31 Dec, so the 60-day renewal notice falls on 1 Nov 2026: 21 days from today. The lift inspection certificates are already overdue.",
      ar: "أحد عشر عقداً سارياً ومسودة مورد واردة. تُحسب كل مواعيد الاستحقاق من قواعد العقد نفسه — مثلاً ينتهي العقد MNDA/CON/2023/019 في 31 ديسمبر فيكون إشعار التجديد (60 يوماً) في 1 نوفمبر 2026: بعد 21 يوماً. وشهادات فحص المصاعد متأخرة بالفعل.",
    },
  },
  {
    title: { en: "Review a vendor's paper", ar: "مراجعة نموذج المورد" },
    body: {
      en: "Playbook review → the Nuvola omnichannel draft → “Review against playbook”. Each of the 16 MNDA positions is checked: 50% liability cap, 15-day payment, data in the EU, automatic renewal, English law. Every flag links to its clause and carries a redline.",
      ar: "مراجعة الدليل ← مسودة نوفولا ← «مراجعة مقابل دليل المواقف». يُفحص كل موقف من المواقف الستة عشر: سقف مسؤولية 50%، دفع خلال 15 يوماً، بيانات في أوروبا، تجديد تلقائي، القانون الإنجليزي. كل ملاحظة مرتبطة ببندها مع تعديل مقترح.",
    },
  },
  {
    title: { en: "The reviewer decides", ar: "المراجع يقرر" },
    body: {
      en: "Accept the data-residency and liability redlines, reject one you can live with. “Send accepted redlines to Legal” routes the pack to Adv. Noura Khalifa Al Qubaisi — approval marks the contract and writes the audit trail.",
      ar: "اقبل تعديلات إقامة البيانات والمسؤولية وارفض ما يمكن قبوله. «إرسال التعديلات إلى الشؤون القانونية» يحيل الحزمة إلى المحامية نورة القبيسي — والاعتماد يحدّث العقد ويُسجَّل.",
    },
  },
  {
    title: { en: "Commitments become owned obligations", ar: "التعهدات تصبح التزامات بمسؤولين" },
    body: {
      en: "Register → MNDA/CON/2023/019 → “Extract obligations”. NARVO reads the clauses; owners and due dates are computed (the exit plan due 90 days before expiry is already late). Shamma Khalid Al Mansoori confirms — they join the calendar.",
      ar: "السجل ← MNDA/CON/2023/019 ← «استخراج الالتزامات». يقرأ نارفو البنود وتُحسب المسؤوليات والمواعيد (خطة الخروج المستحقة قبل الانتهاء بـ 90 يوماً متأخرة أصلاً). تؤكدها شما المنصوري فتنضم إلى التقويم.",
    },
  },
  {
    title: { en: "Ask the contract", ar: "اسأل العقد" },
    body: {
      en: "Ask in Arabic or English: “What happens if we miss the renewal notice?” — the answer cites clause 3.3.3: the option lapses and the contract expires.",
      ar: "اسأل بالعربية أو الإنجليزية: «ماذا يحدث إذا فاتنا إشعار التجديد؟» — تستشهد الإجابة بالبند 3.3.3: يسقط الخيار وينتهي العقد.",
    },
  },
  {
    title: { en: "Decide the renewal", ar: "قرار التجديد" },
    body: {
      en: "Renewal 019 → “Prepare renewal brief”. Computed evidence (PPM 94.1% YTD, AED 56,000 service credits, no material breach) plus the Al Ghaf memo → a recommendation with conditions and a notice in English and Arabic.",
      ar: "تجديد 019 ← «إعداد مذكرة التجديد». أدلة محسوبة (امتثال 94.1%، خصومات 56,000 درهم، لا إخلال جوهري) مع مذكرة الغاف ← توصية بشروط وإشعار بالعربية والإنجليزية.",
    },
  },
  {
    title: { en: "Record the action before it is due", ar: "تسجيل الإجراء قبل موعده" },
    body: {
      en: "Rashed Ali Al Dhaheri approves and signs: the renewal-notice obligation is closed 21 days early with the action recorded, the contract shows the decision, a follow-up obligation (improvement plan acceptance) is created and the audit trail holds every step.",
      ar: "يعتمد راشد الظاهري ويوقّع: يُغلق التزام الإشعار قبل موعده بـ 21 يوماً مع تسجيل الإجراء، ويظهر القرار على العقد، ويُنشأ التزام متابعة (قبول خطة التحسين)، ويحفظ سجل التدقيق كل خطوة.",
    },
  },
];
