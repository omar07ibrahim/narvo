/**
 * Fairness guard — runs BEFORE any model sees a CV or interview record.
 *
 * Removes protected attributes (name, nationality, gender, age / date of birth, marital status, photo,
 * religion, place of birth, passport/visa) and direct identifiers, then scans the result for leaks.
 * Scoring functions only accept a `GuardedText`, which can only be produced here — the guard cannot be skipped.
 */

import type { Redaction } from "./types";

declare const guarded: unique symbol;
export type GuardedText = string & { readonly [guarded]: true };

export interface GuardResult {
  text: GuardedText;
  removed: Redaction[];
  counts: Record<string, number>;
  leaks: string[];
  autoFixed: number;
}

const LABELS: Array<{ kind: string; re: RegExp }> = [
  { kind: "nationality", re: /(nationality|citizenship|الجنسية)/i },
  { kind: "date of birth / age", re: /(date of birth|d\.o\.b|\bdob\b|\bage\b|birth ?date|تاريخ الميلاد|العمر|مواليد)/i },
  { kind: "gender", re: /(gender|\bsex\b|الجنس\b|النوع)/i },
  { kind: "marital status", re: /(marital|family status|dependents|الحالة الاجتماعية|الحالة العائلية)/i },
  { kind: "religion", re: /(religion|الديانة|الدين)/i },
  { kind: "photo", re: /(\bphoto(graph)?\b|\bpicture\b|الصورة)/i },
  { kind: "place of birth", re: /(place of birth|مكان الميلاد)/i },
  { kind: "passport / visa", re: /(passport|visa status|جواز السفر|الإقامة:)/i },
  { kind: "contact details", re: /(\be-?mail\b|\bmobile\b|\bphone\b|telephone|\btel\b|linkedin|البريد الإلكتروني|الهاتف|الجوال)/i },
];

const DEMONYMS_EN = [
  "Emirati", "UAE national", "Egyptian", "Jordanian", "Syrian", "Lebanese", "Palestinian", "Sudanese", "Iraqi", "Tunisian",
  "Moroccan", "Algerian", "Libyan", "Yemeni", "Omani", "Saudi", "Bahraini", "Kuwaiti", "Qatari", "Indian", "Pakistani",
  "Filipino", "Filipina", "Sri Lankan", "Bangladeshi", "Nepali", "Nigerian", "Kenyan", "British", "Irish", "American",
  "Canadian", "Australian", "South African", "Iranian", "Turkish", "Russian", "Ukrainian", "Chinese", "Malaysian",
];
const DEMONYMS_AR = [
  "إماراتي", "إماراتية", "مواطن إماراتي", "مواطنة إماراتية", "مصري", "مصرية", "أردني", "أردنية", "سوري", "سورية", "لبناني",
  "لبنانية", "فلسطيني", "فلسطينية", "سوداني", "سودانية", "عراقي", "عراقية", "تونسي", "تونسية", "مغربي", "مغربية",
  "جزائري", "جزائرية", "يمني", "يمنية", "عماني", "عمانية", "سعودي", "سعودية", "هندي", "هندية", "باكستاني", "باكستانية",
];
const RELIGIONS = ["Muslim", "Christian", "Hindu", "Buddhist", "Sikh", "Catholic", "Orthodox", "مسلم", "مسلمة", "مسيحي", "مسيحية"];
const GENDER_WORDS = ["Male", "Female", "ذكر", "أنثى", "Mr.", "Mrs.", "Ms.", "Miss"];

/** Demonyms inside institution / standard / place names are not personal attributes ("American University", "Saudi Arabia"). */
const NOT_INSTITUTION = "(?!\\s+(Institute|University|College|Society|Ocean|Standards?|Council|Arabia|Gulf))";

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordRe = (w: string, ar = false) =>
  ar ? new RegExp(`(^|[\\s\\(\\[،,.:؛])${esc(w)}(?=$|[\\s\\)\\]،,.:؛])`, "g") : new RegExp(`\\b${esc(w)}(?!\\w)`, "g");

function nameParts(name: string) {
  return name
    .replace(/^(eng\.|dr\.|م\.|د\.)\s*/i, "")
    .split(/[\s-]+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 3 && !/^(al|bin|ibn|abu|bint|el|abd|abdul|الـ)$/i.test(p));
}

/** Guess the candidate's name from a CV heading when none is supplied (bring-your-own CV). */
export function guessName(text: string): string | undefined {
  const m = text.match(/^#\s+(.+)$/m);
  return m?.[1]?.trim();
}

export function fairnessGuard(raw: string, identity: { name?: string; nameAr?: string; extra?: string[] } = {}): GuardResult {
  const removed: Redaction[] = [];
  const names = [identity.name, identity.nameAr, guessName(raw), ...(identity.extra ?? [])].filter(Boolean) as string[];

  // 1. Line-level: protected attribute fields (EN/AR labels) → replaced by a neutral marker.
  const lines = raw.replace(/\r/g, "").split("\n");
  const out = lines.map((line, i) => {
    if (i < 3 && /^#\s+/.test(line)) {
      removed.push({ kind: "name", original: line.replace(/^#\s+/, "") });
      return "# [Candidate]";
    }
    const isField = /^\s*([-*•]\s*)?(\*\*)?[^:：\n]{1,40}(\*\*)?\s*[:：]/.test(line) && line.length < 220;
    if (!isField) return line;
    // A field line may combine several fields: "**Email:** … · **Mobile:** …"
    const segments = line.split(/\s[·|]\s/);
    let changed = false;
    const segOut = segments.map((seg) => {
      const label = seg.match(/^\s*(?:[-*•]\s*)?(?:\*\*)?([^:：*]{1,40})(?:\*\*)?\s*[:：]/)?.[1] ?? "";
      const hit = LABELS.find((l) => l.re.test(label));
      if (!hit) return seg;
      changed = true;
      removed.push({ kind: hit.kind, original: seg.replace(/^\s*[-*•]\s*/, "").replace(/\*\*/g, "").trim() });
      return seg.replace(/([:：]\s*(?:\*\*)?).*$/, `$1[REDACTED — ${hit.kind}]`);
    });
    return changed ? segOut.join(" · ") : line;
  });
  let text = out.join("\n");

  // 2. Inline: names, demonyms, religion, gender words, ages, birth years, marital phrases.
  const inline = (kind: string, re: RegExp, keepPrefix = false) => {
    text = text.replace(re, (m, p1) => {
      removed.push({ kind, original: keepPrefix ? m.slice((p1 ?? "").length) : m });
      return keepPrefix ? `${p1 ?? ""}[REDACTED]` : "[REDACTED]";
    });
  };
  for (const n of names) {
    if (n.length > 3) inline("name", new RegExp(esc(n), "g"));
    for (const part of nameParts(n)) {
      const ar = /[؀-ۿ]/.test(part);
      inline("name", wordRe(part, ar), ar);
    }
  }
  for (const d of DEMONYMS_EN) inline("nationality", new RegExp(`\\b${esc(d)}\\b${NOT_INSTITUTION}`, "gi"));
  for (const d of DEMONYMS_AR) inline("nationality", wordRe(d, true), true);
  for (const r of RELIGIONS) inline("religion", /[؀-ۿ]/.test(r) ? wordRe(r, true) : new RegExp(`\\b${esc(r)}\\b`, "g"), /[؀-ۿ]/.test(r));
  inline("date of birth / age", /\b(\d{2})\s*(years old|yrs old|year-old)\b/gi);
  inline("date of birth / age", /\b(born (in|on) [^,.;\n]{3,30})/gi);
  inline("marital status", /\b(married|divorced|widowed)( with [a-z0-9 ]{1,20} (children|kids|child))?\b/gi);
  inline("marital status", /(^|[\s،,.:؛(])((?:متزوج|متزوجة|مطلق|مطلقة|أرمل|أرملة)(?:\s+و?لدي[^،.\n]{0,20})?)(?=$|[\s،,.:؛)])/g, true);
  inline("gender", /\b(Mr|Mrs|Ms|Miss)\.?\s(?=[A-Z[])/g);

  // 3. Leak scan — anything still present is reported and removed.
  const leaks: string[] = [];
  let autoFixed = 0;
  const scan = [
    ...names.flatMap(nameParts).map((p) => ({ kind: "name", w: p })),
    ...DEMONYMS_EN.map((w) => ({ kind: "nationality", w })),
    ...GENDER_WORDS.map((w) => ({ kind: "gender", w })),
    ...RELIGIONS.map((w) => ({ kind: "religion", w })),
  ];
  for (const s of scan) {
    const ar = /[؀-ۿ]/.test(s.w);
    const re = ar
      ? wordRe(s.w, true)
      : new RegExp(
          `\\b${esc(s.w)}${s.w.endsWith(".") ? "" : "\\b"}${NOT_INSTITUTION}`,
          s.kind === "gender" || s.kind === "religion" ? "g" : "gi",
        );
    if (re.test(text)) {
      leaks.push(`${s.kind}: ${s.w}`);
      text = text.replace(re, (m, p1) => (ar ? `${p1 ?? ""}[REDACTED]` : "[REDACTED]"));
      autoFixed++;
    }
  }

  const counts: Record<string, number> = {};
  for (const r of removed) counts[r.kind] = (counts[r.kind] ?? 0) + 1;
  return { text: text as GuardedText, removed, counts, leaks, autoFixed };
}

/** Normalise for evidence verification (quotes must exist verbatim in the redacted CV). */
export function normForMatch(s: string) {
  return s
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[إأآ]/g, "ا")
    .replace(/\*\*|__|`/g, "")
    .replace(/[^\p{L}\p{N}%]+/gu, " ")
    .trim();
}

export function quoteFound(quote: string, source: string) {
  const q = normForMatch(quote.replace(/\[REDACTED[^\]]*\]/g, " ").replace(/…|\.\.\./g, " "));
  if (q.length < 8) return false;
  const src = normForMatch(source);
  if (src.includes(q)) return true;
  // Allow light ellipsis use: every fragment of ≥ 4 words must appear in order.
  const words = q.split(" ");
  if (words.length < 6) return false;
  const head = words.slice(0, Math.ceil(words.length * 0.6)).join(" ");
  const tail = words.slice(-Math.min(4, words.length)).join(" ");
  const i = src.indexOf(head);
  return i >= 0 && src.indexOf(tail, i) >= 0;
}
