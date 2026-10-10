import type { ScenarioStep } from "@/components/narvo/solution-page";

export const SCENARIO: ScenarioStep[] = [
  {
    title: { en: "The job: CH-02 keeps tripping", ar: "المهمة: توقف متكرر للمبرد CH-02" },
    body: {
      en: "JOB-RFM-26-04471 at Al Ghaf Community Centre: chiller CH-02 tripped on high discharge pressure again on Friday, with the hall at 27.5 °C. Arun Pillai goes this morning; Mohammed Rafiq supervises. Open “Asset & history” to see 11 trips in September — all between 13:00 and 16:00 above 44 °C — and the coil-cleaning PPM overdue since 15 August.",
      ar: "أمر العمل JOB-RFM-26-04471 في مركز مجتمع الغاف: توقف المبرد CH-02 مجدداً يوم الجمعة بسبب ارتفاع ضغط التصريف وحرارة القاعة 27.5°م. يتوجه أرون بيلاي صباح اليوم بإشراف محمد رفيق. افتح «الأصل والسجل» لترى 11 حالة توقف في سبتمبر — جميعها بين 13:00 و16:00 فوق 44°م — وتأخر صيانة تنظيف الملفات منذ 15 أغسطس.",
    },
  },
  {
    title: { en: "Prepare the job in seconds", ar: "جهّز المهمة في ثوانٍ" },
    body: {
      en: "Press “Prepare job brief”. NARVO analyses the work orders and BMS log, retrieves the ACX-350 manual, the coil-cleaning method statement and LOTO procedure, and streams a brief with ranked likely causes — every claim cited. Hover a citation to see the source passage.",
      ar: "اضغط «إعداد ملخص المهمة». يحلل NARVO أوامر العمل وسجل نظام المبنى، ويسترجع دليل ACX-350 وبيان طريقة تنظيف الملفات وإجراء العزل، ويكتب ملخصاً بالأسباب المرجحة مرتبة — مع توثيق كل معلومة. مرّر المؤشر على المرجع لرؤية النص.",
    },
  },
  {
    title: { en: "Parts checked against real stock", ar: "مطابقة القطع مع المخزون الفعلي" },
    body: {
      en: "The parts list is checked against Arun's van, the site store and the central store. The approved pH-neutral cleaner is at the site store — and the alkaline cleaner in the van is flagged as not allowed on coated coils. The fan motor shows zero stock. On the phone, “Mark brief reviewed” records the preparation time KPI.",
      ar: "تُطابق قائمة القطع مع شاحنة أرون ومخزن الموقع والمخزن المركزي. المنظف المعتمد متعادل الحموضة في مخزن الموقع — ويُنبَّه إلى أن المنظف القلوي الموجود في الشاحنة غير مسموح للملفات المطلية. محرك المروحة غير متوفر. على الهاتف يسجل «تمت مراجعة الملخص» مؤشر وقت التحضير.",
    },
  },
  {
    title: { en: "Hands-free questions on the roof", ar: "أسئلة دون استخدام اليدين على السطح" },
    body: {
      en: "Phone → Ask: tap the mic and ask, in English or Arabic, e.g. “Can I use the alkaline coil cleaner on CH-02?”. The answer comes from the approved documents with sources and is read aloud.",
      ar: "الهاتف ← اسأل: اضغط الميكروفون واسأل بالعربية أو الإنجليزية، مثل «هل يمكنني استخدام المنظف القلوي على ملفات CH-02؟». تأتي الإجابة من المستندات المعتمدة مع المصادر وتُقرأ بصوت مسموع.",
    },
  },
  {
    title: { en: "Record the visit", ar: "سجّل الزيارة" },
    body: {
      en: "Phone → Visit: dictate the notes (or use Arun's recorded note), add the coil photo, and press “Create service report”. The multimodal model structures readings, actions, parts, root cause and sign-off — and keeps the noisy fan-motor bearing open because the part is not in stock.",
      ar: "الهاتف ← الزيارة: أملِ الملاحظات (أو استخدم ملاحظة أرون المسجلة)، وأضف صورة الملف، واضغط «إنشاء تقرير الخدمة». يرتب النموذج متعدد الوسائط القراءات والأعمال والقطع والسبب الجذري والتوقيع — ويبقي محمل المروحة ذا الصوت المرتفع مفتوحاً لعدم توفر القطعة.",
    },
  },
  {
    title: { en: "Supervisor review with a computed score", ar: "مراجعة المشرف بدرجة محسوبة" },
    body: {
      en: "Supervisor review: every field is editable; completeness is scored live against the 12 elements of RFM-QA-STD-004, readings outside normal ranges are flagged, and the unresolved issue shows its part status and follow-up date.",
      ar: "مراجعة المشرف: كل الحقول قابلة للتعديل، ويُحتسب الاكتمال مباشرة وفق العناصر الاثني عشر في RFM-QA-STD-004، وتُبرز القراءات خارج المدى الطبيعي، وتظهر للقضية المعلقة حالة القطعة وموعد المتابعة.",
    },
  },
  {
    title: { en: "Approve the handover", ar: "اعتماد التسليم" },
    body: {
      en: "Submit for approval; Mohammed Rafiq approves. The job closes, the report is filed and shared with MNDA, a follow-up job for the fan motor appears in the list awaiting parts, the asset history updates and the KPIs move.",
      ar: "أرسل للاعتماد؛ يعتمد محمد رفيق. تُغلق المهمة ويُحفظ التقرير ويُشارك مع الهيئة، وتظهر مهمة متابعة لمحرك المروحة بانتظار القطع، ويُحدَّث سجل الأصل وتتغير المؤشرات.",
    },
  },
];
