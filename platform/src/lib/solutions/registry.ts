/**
 * The NARVO solution catalogue — 20 solutions across 6 areas of work.
 * Titles, promises and measures mirror the NARVO AI Solutions Catalogue (September 2026).
 * Shared by server and client.
 */

export type OrgId = "mnda" | "raseen" | "narvo";

export interface Bilingual {
  en: string;
  ar: string;
}

export interface Measure {
  label: Bilingual;
  baseline: string;
  target: string;
  /** "down" when lower is better */
  better: "up" | "down";
}

export interface AreaMeta {
  id: number;
  key: string;
  title: Bilingual;
}

export interface SolutionMeta {
  n: number;
  slug: string;
  area: number;
  org: OrgId;
  title: Bilingual;
  promise: Bilingual;
  summary: Bilingual;
  measures: [Measure, Measure, Measure];
  /** Marked "Featured" in the printed catalogue */
  featured?: boolean;
  /** One of the five capability-programme hero pilots */
  hero?: boolean;
  pilot?: string;
  icon: string;
  engines: string[];
}

export const AREAS: AreaMeta[] = [
  { id: 1, key: "enterprise", title: { en: "Enterprise intelligence & delivery", ar: "ذكاء المؤسسة والتنفيذ" } },
  { id: 2, key: "documents", title: { en: "Documents & language", ar: "المستندات واللغة" } },
  { id: 3, key: "customers", title: { en: "Customers & commercial work", ar: "العملاء والأعمال التجارية" } },
  { id: 4, key: "people", title: { en: "People & internal services", ar: "الموظفون والخدمات الداخلية" } },
  { id: 5, key: "operations", title: { en: "Business operations", ar: "عمليات الأعمال" } },
  { id: 6, key: "sites", title: { en: "Sites & field operations", ar: "المواقع والعمليات الميدانية" } },
];

const m = (en: string, ar: string, baseline: string, target: string, better: "up" | "down"): Measure => ({
  label: { en, ar },
  baseline,
  target,
  better,
});

export const SOLUTIONS: SolutionMeta[] = [
  {
    n: 1,
    slug: "01-ai-workspace",
    area: 1,
    org: "mnda",
    featured: true,
    hero: true,
    pilot: "Enterprise Knowledge & Document Intelligence",
    icon: "LayoutPanelLeft",
    title: { en: "Enterprise AI Workspace", ar: "مساحة العمل الذكية للمؤسسة" },
    promise: { en: "Turn company knowledge into useful, completed work.", ar: "حوّل معرفة المؤسسة إلى عمل مُنجز ومفيد." },
    summary: {
      en: "Search institutional knowledge, draft sourced outputs and carry out approved tasks in connected systems.",
      ar: "ابحث في المعرفة المؤسسية، وأعدّ مخرجات موثقة المصادر، ونفّذ المهام المعتمدة في الأنظمة المتصلة.",
    },
    measures: [
      m("Task completion", "إنجاز المهام", "54%", "86%", "up"),
      m("Adoption", "معدل الاستخدام", "—", "71% weekly", "up"),
      m("Handling effort", "جهد المعالجة", "42 min", "11 min", "down"),
    ],
    engines: ["RAG", "Agent", "Approvals"],
  },
  {
    n: 2,
    slug: "02-decision-intelligence",
    area: 1,
    org: "mnda",
    hero: true,
    pilot: "AI Executive & Operational Intelligence",
    icon: "ChartLine",
    title: { en: "Business Performance & Decision Intelligence", ar: "ذكاء الأداء واتخاذ القرار" },
    promise: { en: "Know what changed. Bring the next decision into focus.", ar: "اعرف ما الذي تغيّر، وركّز على القرار التالي." },
    summary: {
      en: "AI combines performance figures and business updates into a sourced review briefing with open actions.",
      ar: "يدمج الذكاء الاصطناعي مؤشرات الأداء وتحديثات العمل في إحاطة مراجعة موثقة مع الإجراءات المفتوحة.",
    },
    measures: [
      m("Preparation time", "وقت الإعداد", "2.5 days", "40 min", "down"),
      m("Figure consistency", "اتساق الأرقام", "81%", "99%", "up"),
      m("Action closure", "إغلاق الإجراءات", "48%", "83%", "up"),
    ],
    engines: ["Analytics", "Briefing", "Actions"],
  },
  {
    n: 3,
    slug: "03-process-intelligence",
    area: 1,
    org: "mnda",
    icon: "Workflow",
    title: { en: "Business Process Intelligence & Improvement", ar: "ذكاء العمليات وتحسينها" },
    promise: { en: "Find the delay. Fix the process. Measure the change.", ar: "اكتشف التأخير، وأصلح العملية، وقِس التغيير." },
    summary: {
      en: "Process analytics maps handoffs and rework; AI interprets the notes behind the delays and tests the fix.",
      ar: "تحليلات العمليات ترسم التسليمات وإعادة العمل، والذكاء الاصطناعي يفسّر أسباب التأخير ويختبر الحل.",
    },
    measures: [
      m("Cycle time", "زمن الدورة", "21.6 days", "13 days", "down"),
      m("Rework", "إعادة العمل", "27%", "11%", "down"),
      m("Completed throughput", "الإنجاز الشهري", "312 / mo", "455 / mo", "up"),
    ],
    engines: ["Process mining", "Root cause", "Simulation"],
  },
  {
    n: 4,
    slug: "04-private-ai-platform",
    area: 1,
    org: "narvo",
    icon: "Server",
    title: { en: "Private AI Platform Deployment & Operations", ar: "نشر وتشغيل منصة الذكاء الاصطناعي الخاصة" },
    promise: { en: "Run business AI in an environment shaped around you.", ar: "شغّل ذكاء الأعمال في بيئة مصممة حولك." },
    summary: {
      en: "Models, access, evaluation and costs for every AI workload — on your infrastructure, with data that never leaves.",
      ar: "النماذج والصلاحيات والتقييم والتكاليف لكل أحمال الذكاء الاصطناعي — على بنيتك التحتية دون خروج البيانات.",
    },
    measures: [
      m("Workload quality", "جودة الأحمال", "—", "≥ 92% eval", "up"),
      m("Recovery", "زمن الاستعادة", "—", "< 5 min", "down"),
      m("Operating cost", "تكلفة التشغيل", "AED 0.21 / task", "AED 0.03 / task", "down"),
    ],
    engines: ["Model router", "Evaluation", "Telemetry"],
  },
  {
    n: 5,
    slug: "05-case-operations",
    area: 2,
    org: "mnda",
    featured: true,
    hero: true,
    pilot: "Agentic Workflow & Decision Orchestration",
    icon: "FileCheck",
    title: { en: "Document, Application & Case Operations", ar: "عمليات المستندات والطلبات والحالات" },
    promise: { en: "Move from incoming documents to resolved cases.", ar: "من المستندات الواردة إلى حالات منجزة." },
    summary: {
      en: "AI reads incoming documents, extracts case details, flags missing information and drafts the clarification.",
      ar: "يقرأ الذكاء الاصطناعي المستندات الواردة ويستخرج بيانات الحالة ويرصد النواقص ويصوغ طلب الاستيفاء.",
    },
    measures: [
      m("Resolution time", "زمن الإنجاز", "19.4 days", "7.5 days", "down"),
      m("Completeness", "اكتمال الملف", "59%", "92%", "up"),
      m("Repeat handling", "تكرار المعالجة", "2.3 touches", "1.2 touches", "down"),
    ],
    engines: ["Vision OCR", "Extraction", "Rules", "Agent"],
  },
  {
    n: 6,
    slug: "06-arabic-documents",
    area: 2,
    org: "mnda",
    icon: "Languages",
    title: { en: "Arabic & Multilingual Document Operations", ar: "عمليات المستندات العربية ومتعددة اللغات" },
    promise: { en: "Keep the meaning, terminology and document intact.", ar: "حافظ على المعنى والمصطلحات وبنية المستند." },
    summary: {
      en: "Translation that follows your terminology, keeps layout and tables, and routes disputed terms to specialists.",
      ar: "ترجمة تلتزم بمصطلحاتك وتحافظ على التنسيق والجداول وتحيل المصطلحات الخلافية إلى المختصين.",
    },
    measures: [
      m("Accepted quality", "الجودة المقبولة", "74%", "95%", "up"),
      m("Correction effort", "جهد التصحيح", "3.1 h / doc", "0.6 h / doc", "down"),
      m("Turnaround", "زمن التسليم", "4 days", "same day", "down"),
    ],
    engines: ["Translation", "Terminology", "QA"],
  },
  {
    n: 7,
    slug: "07-contact-operations",
    area: 3,
    org: "mnda",
    featured: true,
    hero: true,
    pilot: "AI Customer & Service Intelligence",
    icon: "Headset",
    title: { en: "Customer Service & Contact Operations", ar: "خدمة المتعاملين وعمليات الاتصال" },
    promise: { en: "Help customers finish what they came to do.", ar: "ساعد المتعاملين على إنجاز ما جاؤوا من أجله." },
    summary: {
      en: "Voice and chat assistants in Arabic and English that resolve requests, act in systems and hand over with full context.",
      ar: "مساعدون صوتيون ونصيون بالعربية والإنجليزية ينجزون الطلبات وينفذون الإجراءات ويحيلون مع كامل السياق.",
    },
    measures: [
      m("Resolution", "نسبة الحل", "61%", "84%", "up"),
      m("Repeat contacts", "الاتصالات المتكررة", "34%", "12%", "down"),
      m("Cost per request", "تكلفة الطلب", "AED 18.40", "AED 4.10", "down"),
    ],
    engines: ["Speech", "Agent", "Handoff"],
  },
  {
    n: 8,
    slug: "08-sales-intelligence",
    area: 3,
    org: "raseen",
    icon: "UserRoundCheck",
    title: { en: "Sales Intelligence & Execution", ar: "ذكاء المبيعات والتنفيذ" },
    promise: { en: "Keep sales opportunities moving across teams.", ar: "حافظ على تقدّم فرص المبيعات بين الفرق." },
    summary: {
      en: "Account briefs from enquiries, interactions and offers; conflicts flagged, follow-ups drafted, CRM updated on approval.",
      ar: "ملخصات حسابات من الاستفسارات والتفاعلات والعروض، مع رصد التعارضات وصياغة المتابعات وتحديث النظام بعد الاعتماد.",
    },
    measures: [
      m("Handover delay", "تأخير التسليم", "6.2 days", "1 day", "down"),
      m("Preparation time", "وقت التحضير", "75 min", "8 min", "down"),
      m("Record accuracy", "دقة السجلات", "68%", "96%", "up"),
    ],
    engines: ["Briefing", "Conflict check", "CRM actions"],
  },
  {
    n: 9,
    slug: "09-bid-proposal",
    area: 3,
    org: "raseen",
    hero: true,
    pilot: "AI Technical & Commercial Intelligence",
    icon: "FileSpreadsheet",
    title: { en: "Bid & Proposal Intelligence", ar: "ذكاء العطاءات والعروض" },
    promise: { en: "Turn tender requirements into a response ready for review.", ar: "حوّل متطلبات المناقصة إلى عرض جاهز للمراجعة." },
    summary: {
      en: "Maps every tender requirement to approved evidence, drafts sourced sections and flags gaps and unsupported claims.",
      ar: "يربط كل متطلب في المناقصة بأدلة معتمدة، ويصوغ أقساماً موثقة، ويرصد الفجوات والادعاءات غير المدعومة.",
    },
    measures: [
      m("Coverage", "التغطية", "71%", "100%", "up"),
      m("Evidence quality", "جودة الأدلة", "62%", "94%", "up"),
      m("Review effort", "جهد المراجعة", "38 h", "9 h", "down"),
    ],
    engines: ["Requirement mapping", "RAG", "Drafting"],
  },
  {
    n: 10,
    slug: "10-brand-content",
    area: 3,
    org: "raseen",
    icon: "Sparkles",
    title: { en: "Brand Content Operations", ar: "عمليات محتوى العلامة التجارية" },
    promise: { en: "Create more usable content from approved facts.", ar: "أنتج محتوى أكثر قابلية للاستخدام من حقائق معتمدة." },
    summary: {
      en: "Channel and language variants generated from one approved fact sheet, checked for factual drift before release.",
      ar: "نسخ للقنوات واللغات من ورقة حقائق معتمدة واحدة، مع فحص الانحراف عن الحقائق قبل النشر.",
    },
    measures: [
      m("Release time", "زمن الإصدار", "9 days", "1 day", "down"),
      m("Correction effort", "جهد التصحيح", "5 rounds", "1 round", "down"),
      m("Factual errors", "الأخطاء الواقعية", "1 in 6", "0 in 40", "down"),
    ],
    engines: ["Generation", "Fact check", "Brand rules"],
  },
  {
    n: 11,
    slug: "11-employee-services",
    area: 4,
    org: "mnda",
    icon: "IdCard",
    title: { en: "Employee Services Hub", ar: "مركز خدمات الموظفين" },
    promise: { en: "Connect employee questions to completed requests.", ar: "اربط أسئلة الموظفين بطلبات منجزة." },
    summary: {
      en: "Employees ask in everyday language; AI answers from policy and prepares HR or IT requests with live status.",
      ar: "يسأل الموظفون بلغتهم اليومية، فيجيب الذكاء الاصطناعي من السياسات ويجهّز طلبات الموارد البشرية وتقنية المعلومات.",
    },
    measures: [
      m("Completion", "الإنجاز", "63%", "91%", "up"),
      m("Handling effort", "جهد المعالجة", "14 min", "3 min", "down"),
      m("Repeat enquiries", "الاستفسارات المتكررة", "29%", "8%", "down"),
    ],
    engines: ["RAG", "Forms", "Service actions"],
  },
  {
    n: 12,
    slug: "12-recruitment",
    area: 4,
    org: "mnda",
    featured: true,
    icon: "Users",
    title: { en: "Recruitment & Hiring Intelligence", ar: "ذكاء التوظيف والاستقطاب" },
    promise: { en: "From application overload to a clear finalist comparison.", ar: "من تكدّس الطلبات إلى مقارنة واضحة للمرشحين النهائيين." },
    summary: {
      en: "Applications compared against job-related criteria with traceable evidence. HR selects; AI never decides.",
      ar: "مقارنة الطلبات بمعايير الوظيفة مع أدلة قابلة للتتبع. الموارد البشرية تختار، والذكاء الاصطناعي لا يقرر.",
    },
    measures: [
      m("Shortlist preparation", "إعداد القائمة المختصرة", "6 days", "1 day", "down"),
      m("Source traceability", "تتبع المصادر", "—", "100%", "up"),
      m("Review effort", "جهد المراجعة", "31 h", "7 h", "down"),
    ],
    engines: ["Criteria matrix", "Evidence", "Fairness checks"],
  },
  {
    n: 13,
    slug: "13-contract-intelligence",
    area: 5,
    org: "mnda",
    icon: "ScrollText",
    title: { en: "Contract & Obligation Intelligence", ar: "ذكاء العقود والالتزامات" },
    promise: { en: "Turn agreements into visible, owned commitments.", ar: "حوّل الاتفاقيات إلى التزامات واضحة ومحددة المسؤول." },
    summary: {
      en: "Clauses compared with approved positions; dates and commitments become assigned obligations with reminders.",
      ar: "مقارنة البنود بالمواقف المعتمدة، وتحويل التواريخ والتعهدات إلى التزامات مسندة مع تذكيرات.",
    },
    measures: [
      m("Missed obligations", "الالتزامات الفائتة", "7 / yr", "0", "down"),
      m("Review effort", "جهد المراجعة", "6 h / contract", "1.2 h", "down"),
      m("Follow-through", "المتابعة", "58%", "97%", "up"),
    ],
    engines: ["Clause analysis", "Playbook", "Obligations"],
  },
  {
    n: 14,
    slug: "14-finance-operations",
    area: 5,
    org: "raseen",
    icon: "ReceiptText",
    title: { en: "Finance Operations Intelligence", ar: "ذكاء العمليات المالية" },
    promise: { en: "Resolve the discrepancies holding finance work up.", ar: "عالج الفروقات التي تعطّل العمل المالي." },
    summary: {
      en: "Invoices matched against orders and receipts; mismatches assembled into resolution cases for finance approval.",
      ar: "مطابقة الفواتير مع أوامر الشراء والاستلام، وتجميع الفروقات في حالات معالجة لاعتماد المالية.",
    },
    measures: [
      m("Resolution effort", "جهد المعالجة", "47 min", "9 min", "down"),
      m("Reopened cases", "الحالات المعاد فتحها", "14%", "3%", "down"),
      m("Processing cost", "تكلفة المعالجة", "AED 31 / inv", "AED 7 / inv", "down"),
    ],
    engines: ["3-way match", "Extraction", "Resolution"],
  },
  {
    n: 15,
    slug: "15-procurement-intelligence",
    area: 5,
    org: "mnda",
    icon: "ClipboardCheck",
    title: { en: "Procurement & Supplier Intelligence", ar: "ذكاء المشتريات والموردين" },
    promise: { en: "Make supplier decisions easier to explain and execute.", ar: "اجعل قرارات الموردين أسهل في التبرير والتنفيذ." },
    summary: {
      en: "Supplier submissions compared against tender criteria with evidence, gaps and clarification questions.",
      ar: "مقارنة عروض الموردين بمعايير المناقصة مع الأدلة والفجوات وأسئلة الاستيضاح.",
    },
    measures: [
      m("Completeness", "الاكتمال", "77%", "100%", "up"),
      m("Comparison quality", "جودة المقارنة", "—", "Fully sourced", "up"),
      m("Handoff effort", "جهد التسليم", "3 days", "4 h", "down"),
    ],
    engines: ["Evaluation matrix", "Evidence", "Clarifications"],
  },
  {
    n: 16,
    slug: "16-order-exceptions",
    area: 5,
    org: "raseen",
    icon: "PackageSearch",
    title: { en: "Order Fulfilment & Exception Intelligence", ar: "ذكاء تنفيذ الطلبات ومعالجة الاستثناءات" },
    promise: { en: "Keep accepted orders moving through the business.", ar: "حافظ على تدفّق الطلبات المقبولة عبر المؤسسة." },
    summary: {
      en: "Mismatched terms, stock and delivery constraints brought into one exception view with options to approve.",
      ar: "جمع تعارضات الشروط والمخزون وقيود التسليم في عرض استثناءات واحد مع خيارات للاعتماد.",
    },
    measures: [
      m("Exception effort", "جهد الاستثناءات", "52 min", "12 min", "down"),
      m("Corrections", "التصحيحات", "11%", "3%", "down"),
      m("Promise accuracy", "دقة الوعود", "79%", "96%", "up"),
    ],
    engines: ["Exception detection", "Options", "Handover"],
  },
  {
    n: 17,
    slug: "17-demand-planning",
    area: 5,
    org: "raseen",
    icon: "ChartSpline",
    title: { en: "Demand & Resource Planning", ar: "تخطيط الطلب والموارد" },
    promise: { en: "Turn changing demand into a feasible plan.", ar: "حوّل الطلب المتغيّر إلى خطة قابلة للتنفيذ." },
    summary: {
      en: "Forecast demand with uncertainty, compare plans against real capacity limits and explain the trade-offs.",
      ar: "توقّع الطلب مع هامش عدم اليقين، وقارن الخطط بحدود السعة الفعلية، واشرح المفاضلات.",
    },
    measures: [
      m("Forecast error", "خطأ التوقع", "24% MAPE", "11% MAPE", "down"),
      m("Constraint fit", "التوافق مع القيود", "70%", "100%", "up"),
      m("Planner overrides", "تعديلات المخطط", "41%", "12%", "down"),
    ],
    engines: ["Forecasting", "Optimisation", "Explanation"],
  },
  {
    n: 18,
    slug: "18-visual-inspection",
    area: 6,
    org: "mnda",
    featured: true,
    icon: "ScanSearch",
    title: { en: "Visual Inspection & Quality Intelligence", ar: "ذكاء الفحص البصري والجودة" },
    promise: { en: "Turn observable defects into corrective work.", ar: "حوّل العيوب الظاهرة إلى أعمال تصحيحية." },
    summary: {
      en: "Vision models flag defined defects in site photos; accepted findings become owned corrective tasks.",
      ar: "تكشف نماذج الرؤية العيوب المحددة في صور المواقع، وتتحول الملاحظات المعتمدة إلى مهام تصحيحية.",
    },
    measures: [
      m("Missed defects", "العيوب الفائتة", "18%", "4%", "down"),
      m("False flags", "الإنذارات الخاطئة", "—", "< 8%", "down"),
      m("Correction closure", "إغلاق التصحيحات", "55%", "90%", "up"),
    ],
    engines: ["Vision", "Defect taxonomy", "Tasks"],
  },
  {
    n: 19,
    slug: "19-field-service",
    area: 6,
    org: "raseen",
    icon: "Wrench",
    title: { en: "Field Service Intelligence", ar: "ذكاء الخدمات الميدانية" },
    promise: { en: "Prepare the job. Support the team. Complete the record.", ar: "جهّز المهمة، وادعم الفريق، وأكمل السجل." },
    summary: {
      en: "Job briefs from asset history and manuals; voice notes turned into structured service reports.",
      ar: "ملخصات مهام من سجل الأصول والأدلة الفنية، وتحويل الملاحظات الصوتية إلى تقارير خدمة منظمة.",
    },
    measures: [
      m("Preparation time", "وقت التحضير", "35 min", "5 min", "down"),
      m("Report quality", "جودة التقارير", "64%", "95%", "up"),
      m("Closure completeness", "اكتمال الإغلاق", "71%", "98%", "up"),
    ],
    engines: ["Briefing", "Speech", "Reporting"],
  },
  {
    n: 20,
    slug: "20-facility-intelligence",
    area: 6,
    org: "mnda",
    icon: "Building",
    title: { en: "Workplace & Facility Intelligence", ar: "ذكاء بيئة العمل والمرافق" },
    promise: { en: "See the site issue. Connect the response. Check the result.", ar: "اكتشف مشكلة الموقع، واربط الاستجابة، وتحقق من النتيجة." },
    summary: {
      en: "Building signals, space records and service requests in one view; recurring issues explained and resolved.",
      ar: "إشارات المباني وسجلات المساحات وطلبات الخدمة في عرض واحد، مع تفسير المشكلات المتكررة ومعالجتها.",
    },
    measures: [
      m("Service response", "زمن الاستجابة", "26 h", "4 h", "down"),
      m("Data coverage", "تغطية البيانات", "38%", "94%", "up"),
      m("Resource use", "استهلاك الموارد", "100%", "−14% energy", "down"),
    ],
    engines: ["Signals", "Correlation", "Work orders"],
  },
];

export function getSolution(slugOrN: string | number): SolutionMeta | undefined {
  return SOLUTIONS.find((s) => s.slug === slugOrN || s.n === slugOrN);
}

export function solutionPath(s: Pick<SolutionMeta, "slug">) {
  return `/solutions/${s.slug}`;
}

export function pad2(n: number) {
  return n.toString().padStart(2, "0");
}
