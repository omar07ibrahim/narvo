import type { ScenarioStep } from "@/components/narvo/solution-page";

export const SCENARIO: ScenarioStep[] = [
  {
    title: { en: "Read a forecast you can trust", ar: "توقعات يمكن الوثوق بها" },
    body: {
      en: "Forecast tab, RB-B500-16 at Jebel Ali: three years of weekly sales, the Q4 peak and a P10–P90 band. Toggle Backtest — the model was refitted without the last 12 weeks and beats the same-week-last-year baseline. The model card shows the Ramadan, Eid, summer-ban and promotion effects it estimated.",
      ar: "في تبويب التوقعات، اختر RB-B500-16 في جبل علي: ثلاث سنوات من المبيعات الأسبوعية وذروة الربع الرابع ونطاق P10–P90. فعّل الاختبار الرجعي — أُعيدت ملاءمة النموذج دون آخر 12 أسبوعاً ويتفوق على نموذج «نفس الأسبوع من العام الماضي». تعرض بطاقة النموذج آثار رمضان والعيد وحظر الظهيرة والعروض.",
    },
  },
  {
    title: { en: "A launch with no history", ar: "منتج جديد بلا سجل مبيعات" },
    body: {
      en: "Select PNT-TS-20 (ThermaShield, launching 2 Nov). With no history, the engine borrows roofing seasonality from WPF-BIT-4, adds the 1,140 pre-ordered pails and shows a deliberately wide range.",
      ar: "اختر PNT-TS-20 (ثيرماشيلد، يُطلق في 2 نوفمبر). في غياب السجل يستعير المحرك موسمية العزل من WPF-BIT-4، ويضيف 1,140 دلواً محجوزاً مسبقاً، ويعرض نطاقاً واسعاً عن قصد.",
    },
  },
  {
    title: { en: "Compare three plans against real limits", ar: "قارن ثلاث خطط بالحدود الفعلية" },
    body: {
      en: "Plan scenarios: plan A (today's policy) is cheap on stock but runs short of rebar after the Sahara maintenance; plan B pre-builds and overflows the 4,200 t rebar yard and Jebel Ali's pallet positions; plan C pre-builds only rebar within limits. Each runs over 100 demand paths.",
      ar: "سيناريوهات الخطط: الخطة (أ) منخفضة المخزون لكنها تعاني نقصاً في الحديد بعد صيانة صحارى؛ الخطة (ب) تبني مسبقاً فتتجاوز ساحة الحديد (4,200 طن) ومواقع منصات جبل علي؛ الخطة (ج) تبني الحديد فقط ضمن الحدود. كل خطة تُحاكى على 100 مسار طلب.",
    },
  },
  {
    title: { en: "Change demand and constraints", ar: "غيّر الطلب والقيود" },
    body: {
      en: "Click “Marina Quarter +15%”, then “Lose 1,000 pallet positions”. All three plans re-simulate instantly in the browser; plan A now breaches Jebel Ali in the first weeks while plan C still fits.",
      ar: "انقر «حي المارينا +15%» ثم «فقدان 1,000 موقع منصة». تُعاد محاكاة الخطط فوراً في المتصفح؛ تتجاوز الخطة (أ) سعة جبل علي في الأسابيع الأولى بينما تبقى (ج) ضمن الحدود.",
    },
  },
  {
    title: { en: "Ask the analyst", ar: "اسأل المحلل" },
    body: {
      en: "Press “Explain trade-offs”. The model recommends a plan using only the engine's computed figures — hover any [n] to see the exact numbers. Ask a follow-up such as “Why not plan B?”.",
      ar: "اضغط «اشرح المفاضلات». يوصي النموذج بخطة اعتماداً على أرقام المحرك فقط — مرّر المؤشر على أي [n] لرؤية الأرقام. ثم اطرح سؤالاً مثل «لماذا لا نختار الخطة (ب)؟».",
    },
  },
  {
    title: { en: "Override with a reason", ar: "عدّل مع ذكر السبب" },
    body: {
      en: "Back on Forecast, choose RB-B500-16 at MN-05 and click the P50 for w/c 19 Oct: set 150 t, reason “SO-26-11842 Gulf Crest call-off confirmed”. Plans recompute; the override KPI and audit trail record it.",
      ar: "في التوقعات اختر RB-B500-16 في MN-05 وانقر قيمة الوسيط لأسبوع 19 أكتوبر: 150 طناً بسبب «تأكيد سحب أمر البيع SO-26-11842 لغلف كرست». تُعاد الحسابات ويُسجَّل التعديل في المؤشر وسجل التدقيق.",
    },
  },
  {
    title: { en: "Approve and publish", ar: "الاعتماد والنشر" },
    body: {
      en: "Select plan C and submit. Joseph Abraham approves in the card (or the Inbox): the plan is published with its assumptions, the Sahara catch-up is queued, and the Decision log shows whether the plan still holds when conditions move. Finally, try “Your data” with the sample CSV.",
      ar: "اختر الخطة (ج) وأرسلها. يعتمدها جوزيف أبراهام من البطاقة (أو صندوق الوارد): تُنشر الخطة بافتراضاتها، وتُجدول الكمية التعويضية من صحارى، ويوضح سجل القرارات ما إذا كانت الخطة ما زالت صالحة. أخيراً جرّب «بياناتك» بملف العينة.",
    },
  },
];
