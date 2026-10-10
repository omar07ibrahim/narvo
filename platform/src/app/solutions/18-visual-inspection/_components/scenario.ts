import type { ScenarioStep } from "@/components/narvo/solution-page";

export const SCENARIO: ScenarioStep[] = [
  {
    title: { en: "Open an inspection awaiting review", ar: "افتح تفتيشاً بانتظار المراجعة" },
    body: {
      en: "The list holds this autumn's site inspections across Marsa Al Noor — plots, contractors, inspectors and status. Select the first inspection awaiting review: the photo, plot, permit and the inspector's field note are on screen.",
      ar: "تضم القائمة عمليات التفتيش لهذا الخريف في مرسى النور — القطع والمقاولين والمفتشين والحالة. اختر أول تفتيش بانتظار المراجعة: تظهر الصورة والقطعة والرخصة وملاحظة المفتش الميدانية.",
    },
  },
  {
    title: { en: "Screen the photo with vision", ar: "افحص الصورة بنموذج الرؤية" },
    body: {
      en: "Press “Screen photo with vision”. The multimodal model checks the 13 CSSR-2025 defect types and proposes findings with an approximate box and confidence. Hover a finding to highlight its box; hover the article to read the requirement.",
      ar: "اضغط «افحص الصورة بنموذج الرؤية». يتحقق النموذج متعدد الوسائط من 13 نوعاً من العيوب وفق CSSR-2025 ويقترح ملاحظات مع إطار تقريبي ودرجة ثقة. مرّر المؤشر على الملاحظة لإبراز إطارها، وعلى المادة لقراءة المتطلب.",
    },
  },
  {
    title: { en: "The inspector decides", ar: "القرار للمفتش" },
    body: {
      en: "Accept the clear findings, reject one with a reason code (e.g. R1 — protection outside the frame) and use “Add a defect the AI missed” to draw a box around anything the model did not flag. The false-flag and missed-defect KPIs move immediately.",
      ar: "اقبل الملاحظات الواضحة، وارفض إحداها مع رمز السبب (مثل R1 — حماية خارج الإطار)، واستخدم «أضف عيباً لم يكتشفه النموذج» لرسم إطار حول ما فات النموذج. يتحدث مؤشرا الإنذارات الخاطئة والعيوب الفائتة فوراً.",
    },
  },
  {
    title: { en: "Draft the notice and tasks", ar: "صياغة الإشعار والمهام" },
    body: {
      en: "In the Notice panel, due dates, repeat escalation (Art. 31.6) and penalties are computed by rule. “Draft Notice of Violation” writes the corrective actions in English and Arabic in parallel around a computed header and table, then checks every finding is covered.",
      ar: "في لوحة الإشعار تُحتسب المواعيد والتصعيد بسبب التكرار (المادة 31.6) والغرامات بالقواعد. يصوغ زر «صياغة إشعار المخالفة» الإجراءات التصحيحية بالعربية والإنجليزية بالتوازي حول ترويسة وجدول محسوبين، ثم يتحقق من تغطية كل ملاحظة.",
    },
  },
  {
    title: { en: "Approval by the Director", ar: "اعتماد المدير" },
    body: {
      en: "Eng. Hamad Juma Al Kaabi approves in the card (or the Inbox). The notice is served, corrective tasks are created for the contractor with their due dates, and every step lands in the audit trail.",
      ar: "يعتمد م. حمد جمعة الكعبي من البطاقة (أو صندوق الوارد). يُبلغ الإشعار، وتُنشأ المهام التصحيحية للمقاول بمواعيدها، ويُسجل كل إجراء في سجل التدقيق.",
    },
  },
  {
    title: { en: "Verify closure with an after photo", ar: "تحقق من الإغلاق بصورة ما بعد" },
    body: {
      en: "Corrective tasks tab: open a task with evidence submitted by the contractor, load the after photo and compare. The model judges whether the defect is corrected; the inspector closes it or keeps it open with a reason — the closure KPI updates.",
      ar: "في تبويب المهام التصحيحية افتح مهمة قدّم المقاول دليلها، وحمّل صورة ما بعد وقارن. يحكم النموذج على التصحيح، ويغلق المفتش المهمة أو يبقيها مفتوحة مع السبب — ويتحدث مؤشر الإغلاق.",
    },
  },
  {
    title: { en: "Bring your own photo", ar: "صورتك أنت" },
    body: {
      en: "Press “Capture” to take a photo with the laptop or tablet camera (or upload one), enter a plot and contractor, and screen it — the same pipeline runs on the new image.",
      ar: "اضغط «التقاط» لالتقاط صورة بكاميرا الجهاز (أو تحميلها)، وأدخل القطعة والمقاول، ثم افحصها — يعمل المسار نفسه على الصورة الجديدة.",
    },
  },
];
