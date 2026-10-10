import type { Interventions } from "./mining";

export const INTERVENTION_LABELS: Record<keyof Interventions, { en: string; ar: string; detail: { en: string; ar: string } }> = {
  intakeNoc: {
    en: "NOC validity check at intake",
    ar: "التحقق من صلاحية شهادة عدم الممانعة عند الاستلام",
    detail: {
      en: "Validity (90 days), plot number and drawing revision checked before the file is accepted — a missing NOC becomes a tracked request instead of a return.",
      ar: "التحقق من الصلاحية (90 يوماً) ورقم المخطط ورقم مراجعة المخططات قبل قبول الملف — وتتحول الشهادة الناقصة إلى طلب متابَع بدلاً من إعادة الملف.",
    },
  },
  parallelNoc: {
    en: "Parallel NOC request at submission",
    ar: "طلب شهادة عدم الممانعة بالتوازي عند التقديم",
    detail: {
      en: "The NOC request goes to the master developer automatically; planning and structural review run while the NOC is pending (hold applies before issue only).",
      ar: "يُرسل طلب الشهادة إلى المطور الرئيسي آلياً، ويستمر التدقيق التخطيطي والإنشائي أثناء انتظارها (ويقتصر التعليق على ما قبل الإصدار).",
    },
  },
  stampCheck: {
    en: "Automatic structural-stamp check",
    ar: "فحص آلي لختم الحسابات الإنشائية",
    detail: {
      en: "The portal verifies the licensed structural engineer's stamp and registration on upload; the consultant fixes it before submitting.",
      ar: "يتحقق النظام من ختم المهندس الإنشائي المرخص وتسجيله عند الرفع، فيصحح الاستشاري قبل التقديم.",
    },
  },
  revisionCheck: {
    en: "Drawing-revision match check (NOC ↔ site plan)",
    ar: "مطابقة رقم مراجعة المخططات مع الشهادة",
    detail: {
      en: "Compares the revision referenced in the NOC with the submitted site plan and flags mixed revisions in the drawing set.",
      ar: "يقارن رقم المراجعة في الشهادة بمخطط الموقع المقدم ويكشف اختلاط نسخ المخططات.",
    },
  },
  developerSla: {
    en: "Developer NOC service level (7 working days)",
    ar: "مستوى خدمة المطورين لإصدار الشهادة (7 أيام عمل)",
    detail: {
      en: "Signed service note with the master developers; NOC turnaround capped for compliant requests.",
      ar: "مذكرة خدمة موقعة مع المطورين الرئيسيين، مع سقف لمدة إصدار الشهادة للطلبات الملتزمة.",
    },
  },
};
