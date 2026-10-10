import type { Tone } from "@/components/narvo/status";
import type { Bi, CellStatus, FlagCategory, Severity, Verdict } from "../_lib/types";

export const STATUS_LABEL: Record<CellStatus, Bi> = {
  empty: { en: "Empty", ar: "فارغة" },
  generating: { en: "Generating", ar: "قيد الإنتاج" },
  draft: { en: "Draft", ar: "مسودة" },
  flagged: { en: "Flagged", ar: "عليها ملاحظات" },
  ready: { en: "Ready", ar: "جاهزة" },
  released: { en: "Released", ar: "صادرة" },
  stale: { en: "Stale", ar: "متقادمة" },
};

export const STATUS_TONE: Record<CellStatus, Tone> = {
  empty: "neutral",
  generating: "ai",
  draft: "neutral",
  flagged: "danger",
  ready: "success",
  released: "info",
  stale: "warning",
};

export const VERDICT_LABEL: Record<Verdict, Bi> = {
  supported: { en: "Supported", ar: "مدعومة" },
  no_claim: { en: "No claim", ar: "بلا ادعاء" },
  unsupported: { en: "Unsupported", ar: "غير مدعومة" },
  forbidden: { en: "Forbidden", ar: "محظورة" },
  needs_qualifier: { en: "Needs qualifier", ar: "تحتاج شرطاً" },
  pending: { en: "Not judged yet", ar: "لم تُقيّم بعد" },
};

export const CATEGORY_LABEL: Record<FlagCategory, Bi> = {
  forbidden: { en: "Forbidden claim", ar: "ادعاء محظور" },
  fact: { en: "Fact mismatch", ar: "عدم تطابق مع الحقائق" },
  qualifier: { en: "Missing qualifier", ar: "شرط ناقص" },
  channel: { en: "Channel rule", ar: "قاعدة القناة" },
  terminology: { en: "Terminology", ar: "المصطلحات" },
  voice: { en: "Brand voice", ar: "أسلوب العلامة" },
};

export const SEVERITY_TONE: Record<Severity, Tone> = { critical: "danger", major: "warning", minor: "neutral" };
export const SEVERITY_LABEL: Record<Severity, Bi> = {
  critical: { en: "Critical", ar: "حرجة" },
  major: { en: "Major", ar: "رئيسية" },
  minor: { en: "Minor", ar: "ثانوية" },
};

/** Highlight classes for a sentence according to its worst issue. */
export function segmentClass(cat: FlagCategory | null, verdict: Verdict | undefined) {
  if (cat === "forbidden" || verdict === "forbidden")
    return "bg-danger-soft/80 underline decoration-danger/70 decoration-[1.5px] underline-offset-[4px]";
  if (cat === "fact" || cat === "voice" || verdict === "unsupported")
    return "bg-warning-soft/80 underline decoration-warning/70 decoration-[1.5px] underline-offset-[4px]";
  if (cat === "qualifier" || verdict === "needs_qualifier")
    return "bg-warning-soft/45 underline decoration-dotted decoration-warning decoration-[1.5px] underline-offset-[4px]";
  if (cat === "channel" || cat === "terminology") return "underline decoration-dotted decoration-info/70 underline-offset-[4px]";
  if (verdict === "supported") return "hover:bg-ai-soft/70";
  return "";
}

export const SOURCE_LABEL = {
  computed: { en: "Computed", ar: "حتمي" },
  model: { en: "Model", ar: "النموذج" },
};
