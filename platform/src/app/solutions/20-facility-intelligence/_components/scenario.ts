import type { ScenarioStep } from "@/components/narvo/solution-page";

export const SCENARIO: ScenarioStep[] = [
  {
    title: { en: "See the site issue", ar: "اكتشف مشكلة الموقع" },
    body: {
      en: "Al Ghaf Community Centre: 23 comfort complaints in August–September and 11 CH-02 high-pressure trips in September. The charts overlay chiller discharge pressure, ambient temperature, zone temperatures and every complaint (○). Note the trips (red) on the hottest afternoons and the drop after 6 October.",
      ar: "مركز الغاف المجتمعي: 23 شكوى راحة في أغسطس وسبتمبر و11 توقفاً للمبرد CH-02 في سبتمبر. تجمع الرسوم ضغط التصريف والحرارة الخارجية وحرارة المساحات وكل شكوى (○). لاحظ التوقفات (بالأحمر) في أشد فترات الظهيرة حرارة والانخفاض بعد 6 أكتوبر.",
    },
  },
  {
    title: { en: "Anomalies detected in code", ar: "رصد الحالات الشاذة برمجياً" },
    body: {
      en: "Below the charts, rule-based detection lists trips, cooling shortfalls, high-pressure unloading and hot zones. Click any item to zoom — e.g. 9 September, two trips during the Quran competition final and the Multipurpose Hall at 28 °C.",
      ar: "تحت الرسوم، يسرد الرصد القائم على القواعد التوقفات ونقص التبريد وتخفيض الحمل والمساحات الحارة. انقر أي عنصر للتكبير — مثل 9 سبتمبر: توقفان أثناء نهائي مسابقة حفظ القرآن والقاعة عند 28 درجة.",
    },
  },
  {
    title: { en: "Connect the issue", ar: "اربط المشكلة" },
    body: {
      en: "Run Correlate & explain. The computed evidence — every trip above 44 °C, CH-02 running 121 kPa hotter than CH-01, 13 of 16 September complaints within 4 hours of a trip, coil cleaning overdue since 15 August — is explained as one causal chain, with confidence and cited sources.",
      ar: "شغّل «اربط وفسّر». تُشرح الأدلة المحسوبة — كل توقف فوق 44 درجة، وضغط CH-02 أعلى بـ121 kPa من CH-01، و13 من 16 شكوى في سبتمبر خلال 4 ساعات من توقف، وتأخر تنظيف الملفات منذ 15 أغسطس — كسلسلة سببية واحدة مع درجة الثقة والمصادر.",
    },
  },
  {
    title: { en: "Prepare the response", ar: "أعدّ الاستجابة" },
    body: {
      en: "Click Prepare the response. The agent queries six systems (BMS, assets, PPM, complaints, contractor jobs, contract MNDA/CON/2023/019) and drafts a work order: priority per Schedule 3, scope, safety controls and measurable verification criteria. Eng. Tariq Mahmoud Saleh approves it in place.",
      ar: "انقر «إعداد الاستجابة». يستعلم الوكيل من ستة أنظمة (المبنى، الأصول، الصيانة، الشكاوى، أعمال المقاول، العقد MNDA/CON/2023/019) ويصوغ أمر عمل: أولوية وفق الجدول 3، والنطاق، وضوابط السلامة، ومعايير تحقق قابلة للقياس. ويعتمده م. طارق محمود صالح مباشرة.",
    },
  },
  {
    title: { en: "Check the result", ar: "تحقق من النتيجة" },
    body: {
      en: "On the work order, Record completion — pre-filled from Raseen FM's report (coils cleaned 6 Oct, 11:40). Verification is computed on the post-completion BMS window: no trips, discharge pressure 177 kPa lower at matched ambient, approach 12.7 K, zones back in band, no new complaints — and the model writes the closing note.",
      ar: "في أمر العمل، سجّل الإنجاز — معبأ من تقرير رصين (تنظيف الملفات 6 أكتوبر، 11:40). يُحتسب التحقق على بيانات المبنى بعد الإنجاز: لا توقفات، وضغط أقل بـ177 kPa عند الحرارة نفسها، وفرق حرارة 12.7 كلفن، وعودة المساحات إلى النطاق، ولا شكاوى جديدة — ويكتب النموذج مذكرة الإغلاق.",
    },
  },
  {
    title: { en: "Energy and contract", ar: "الطاقة والعقد" },
    body: {
      en: "Energy shows September chiller energy +17% vs 2025 (+14.8% weather-normalised) and the efficiency gain at matched ambient after cleaning. The contractor history shows trip responses logged as P2 when Schedule 3 makes them P1 — evidence for the 1 November renewal decision.",
      ar: "تعرض «الطاقة» زيادة استهلاك المبردات في سبتمبر 17% مقارنة بعام 2025 (14.8% بعد تطبيع الطقس) وتحسن الكفاءة بعد التنظيف. ويظهر سجل المقاول تصنيف التوقفات كـP2 بينما يجعلها الجدول 3 من فئة P1 — دليل لقرار التجديد في 1 نوفمبر.",
    },
  },
  {
    title: { en: "Report an issue yourself", ar: "أبلغ عن مشكلة بنفسك" },
    body: {
      en: "Paste a complaint in Arabic or English or add a photo: the model triages it, links it to the zone and asset from the register, sets the contract priority, checks for a known issue and drafts a reply — then one click prepares the work order.",
      ar: "الصق شكوى بالعربية أو الإنجليزية أو أضف صورة: يفرزها النموذج ويربطها بالمساحة والأصل من السجل ويحدد الأولوية التعاقدية ويتحقق من وجود مشكلة معروفة ويصوغ رداً — ثم يُعدّ أمر العمل بنقرة واحدة.",
    },
  },
];
