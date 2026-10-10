/**
 * Deterministic compliance engine for brand content (pure — runs on server and client).
 *
 *  - segmentation (headline / sentences / hashtags) with stable offsets
 *  - numeric claim extraction (temperatures, %, warranty years, prices, coverage, coats, pack size,
 *    solar reflectance, SRI, dates) compared against the CURRENT approved fact sheet
 *  - required qualifiers ("up to", test basis on first mention, Raseen-certified applicator, excl. VAT)
 *  - forbidden / restricted / voice / terminology regexes (EN + AR) from brand-rules.json
 *  - channel limits (words, headline/subject length, hashtags, emoji, exclamation marks, links, CTA,
 *    greeting / sign-off, third person)
 */
import type {
  Bi,
  BrandRules,
  Channel,
  ChannelId,
  Fact,
  FactKind,
  Flag,
  FlagCategory,
  FlagFix,
  Lang,
  ResolvedFlag,
  Segment,
  SegmentResult,
  Severity,
  Variant,
  VariantStatus,
  Verdict,
  Verification,
  VerificationMetrics,
} from "./types";
import { CHANNEL_ORDER } from "./types";

/* ───────────── helpers ───────────── */

export const hasArabic = (s: string) => /[؀-ۿ]/.test(s);
export function detectLang(s: string): Lang {
  const ar = s.match(/[؀-ۿ]/g)?.length ?? 0;
  const en = s.match(/[A-Za-z]/g)?.length ?? 0;
  return ar > en * 0.6 ? "ar" : "en";
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const bi = (en: string, ar: string): Bi => ({ en, ar });

export function factById(facts: Fact[], id: string) {
  return facts.find((f) => f.id === id);
}
export function factOfKind(facts: Fact[], kind: FactKind) {
  return facts.find((f) => f.kind === kind);
}
const num = (f?: Fact): number | undefined => (typeof f?.numeric === "number" ? f.numeric : undefined);
const range = (f?: Fact): [number, number] | undefined => (Array.isArray(f?.numeric) ? (f!.numeric as [number, number]) : undefined);
const eq = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(+n.toFixed(3)));

/* ───────────── counting ───────────── */

export function countWords(text: string) {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

const EMOJI_RE = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*/gu;
export function countEmoji(text: string) {
  return (text.match(EMOJI_RE) ?? []).filter((e) => !/^[©®™]/.test(e)).length;
}
export function countExclamations(text: string) {
  return (text.match(/[!！]/g) ?? []).length;
}
export function inlineHashtags(text: string) {
  return text.match(/#[\p{L}\p{N}_]+/gu) ?? [];
}

/* ───────────── segmentation ───────────── */

const ABBR = /(?:^|[\s(])(?:excl|incl|approx|e\.g|i\.e|no|rev|dr|eng|vs|st|ex|min|max|fig|ref|tel|mob|co|ltd|nos)$/i;

function splitBody(body: string): Segment[] {
  const out: Segment[] = [];
  let n = 0;
  const lineRe = /[^\n]+/g;
  for (let lm = lineRe.exec(body); lm; lm = lineRe.exec(body)) {
    const line = lm[0];
    const base = lm.index;
    let start = 0;
    const endRe = /[.!?؟！]+["'”’)\]]*(?=\s|$)/g;
    const push = (s: number, e: number) => {
      const raw = line.slice(s, e);
      const lead = raw.length - raw.trimStart().length;
      const text = raw.trim();
      if (!text) return;
      out.push({ id: `b${n++}`, part: "body", text, start: base + s + lead, end: base + s + lead + text.length });
    };
    for (let m = endRe.exec(line); m; m = endRe.exec(line)) {
      const before = line.slice(start, m.index);
      if (ABBR.test(before) && m[0].startsWith(".") && m[0].length === 1) continue;
      push(start, m.index + m[0].length);
      start = m.index + m[0].length;
    }
    if (start < line.length) push(start, line.length);
  }
  return out;
}

export function segmentVariant(parts: { headline: string | null; body: string; hashtags: string[] }): Segment[] {
  const segs: Segment[] = [];
  if (parts.headline && parts.headline.trim()) segs.push({ id: "h", part: "headline", text: parts.headline.trim(), start: 0, end: parts.headline.trim().length });
  segs.push(...splitBody(parts.body));
  if (parts.hashtags.length) {
    const t = parts.hashtags.join(" ");
    segs.push({ id: "t", part: "hashtags", text: t, start: 0, end: t.length });
  }
  return segs;
}

/* ───────────── numeric extraction ───────────── */

const MASKS: RegExp[] = [
  /https?:\/\/\S+/gi,
  /\bwww\.\S+/gi,
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,
  /\{\{[^}]*\}\}/g,
  /\+?\d{3}[\s-]?\d{2}[\s-]?\d{3}[\s-]?\d{4}/g,
  /\b(?:ASTM|ISO|BS|EN)\s?[A-Z]?\d+(?:[-:]\d+)*/g,
  /\b[A-Z]{2,}[A-Z0-9]*(?:-[A-Z0-9]+)+\b/g,
  /\brev\.\s?[A-Z]\b/g,
];
function mask(text: string) {
  let m = text;
  for (const re of MASKS) m = m.replace(re, (s) => " ".repeat(s.length));
  return m;
}

const EN_NUM: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, twenty: 20, single: 1, double: 2,
};
const toNum = (s: string) => {
  const k = s.toLowerCase();
  if (k in EN_NUM) return EN_NUM[k];
  return Number(s.replace(/,/g, ""));
};

export interface Hit {
  value: number;
  value2?: number;
  match: string;
  index: number;
}
export interface Extracted {
  temps: Hit[];
  percents: Hit[];
  warrantyYears: Hit[];
  prices: Hit[];
  coverage: Hit[];
  coats: Hit[];
  packs: Hit[];
  sr: Hit[];
  sri: Hit[];
  dates: Array<Hit & { month: number; year?: number }>;
  warrantyContext: boolean;
}

const MONTHS_EN: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7,
  august: 8, aug: 8, september: 9, sep: 9, sept: 9, october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
};
const MONTHS_AR: Record<string, number> = {
  يناير: 1, فبراير: 2, مارس: 3, أبريل: 4, إبريل: 4, مايو: 5, يونيو: 6, يوليو: 7, أغسطس: 8, سبتمبر: 9, أكتوبر: 10, نوفمبر: 11, ديسمبر: 12,
};

function all(re: RegExp, text: string, f: (m: RegExpExecArray) => Hit | null): Hit[] {
  const out: Hit[] = [];
  const r = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  for (let m = r.exec(text); m; m = r.exec(text)) {
    const h = f(m);
    if (h) out.push(h);
    if (m[0].length === 0) r.lastIndex++;
  }
  return out;
}

const overlaps = (a: { index: number; match: string }, b: { index: number; match: string }) =>
  a.index < b.index + b.match.length && b.index < a.index + a.match.length;

export function extractNumbers(raw: string): Extracted {
  const t = mask(raw);
  const temps = all(
    /(\d+(?:\.\d+)?)\s?(?:°\s?C(?![A-Za-z])|º\s?C(?![A-Za-z])|°|º|degrees?(?:\s+(?:celsius|C))?(?![A-Za-z])|درجة(?:\s*مئوية)?|درجات(?:\s*مئوية)?)/gi,
    t,
    (m) => ({ value: Number(m[1]), match: m[0], index: m.index }),
  );
  const percents = all(/(\d+(?:\.\d+)?)\s?[%٪]/g, t, (m) => ({ value: Number(m[1]), match: m[0], index: m.index }));

  // Arabic "لضمان" / "ولضمان" means "to ensure", not "warranty" — ignore it
  const warrantyContext = /warrant|guarantee|ضمان|كفالة|مضمون/i.test(raw.replace(/(?<![؀-ۿ])و?لضمان/g, " "));
  let warrantyYears: Hit[] = [];
  if (warrantyContext) {
    warrantyYears = [
      ...all(
        /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|twenty)[\s-]*(?:years?|yrs?)(?![A-Za-z])/gi,
        t,
        (m) => ({ value: toNum(m[1]), match: m[0], index: m.index }),
      ),
      ...all(/(\d+)\s*(?:سنة|سنوات|عام|أعوام|عاماً|عاما)/g, t, (m) => ({ value: Number(m[1]), match: m[0], index: m.index })),
      ...all(/(عشر|عشرة|خمس|خمسة)\s+(?:سنوات|أعوام)/g, t, (m) => ({ value: /عشر/.test(m[1]) ? 10 : 5, match: m[0], index: m.index })),
    ];
  }

  const priceRaw = [
    ...all(/(?:AED|Dhs?\.?)\s?(\d[\d,]*(?:\.\d+)?)/gi, t, (m) => ({ value: toNum(m[1]), match: m[0], index: m.index })),
    ...all(/(\d[\d,]*(?:\.\d+)?)\s?(?:AED|درهم|دراهم|د\.إ)/gi, t, (m) => ({ value: toNum(m[1]), match: m[0], index: m.index })),
  ];
  const prices: Hit[] = [];
  for (const p of priceRaw) if (!prices.some((q) => overlaps(p, q))) prices.push(p);

  const AREA = "(?:m²|m2|sq\\.?\\s?m|م²|م2|متر(?:اً|ا)?\\s*مربع(?:اً|ا)?|أمتار\\s*مربعة)";
  const coverageRange = all(
    new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:–|-|—|~|to|إلى|الى|و)\\s*(\\d+(?:\\.\\d+)?)\\s*${AREA}`, "gi"),
    t,
    (m) => ({ value: Number(m[1]), value2: Number(m[2]), match: m[0], index: m.index }),
  );
  const coverageSingle = all(
    new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${AREA}\\s*(?:\\/|per|لكل|في كل|لل)\\s*(?:L(?![A-Za-z])|litre|liter|لتر)`, "gi"),
    t,
    (m) => ({ value: Number(m[1]), match: m[0], index: m.index }),
  ).filter((h) => !coverageRange.some((r) => overlaps(h, r)));
  const coverage = [...coverageRange, ...coverageSingle];

  const coats = [
    ...all(/\b(\d+|one|two|three|four|single|double)[\s-]+(?:coats?|layers?)\b/gi, t, (m) => ({ value: toNum(m[1]), match: m[0], index: m.index })),
    ...all(/طبقة\s+واحدة/g, t, (m) => ({ value: 1, match: m[0], index: m.index })),
    ...all(/طبقت(?:ين|ان)/g, t, (m) => ({ value: 2, match: m[0], index: m.index })),
    ...all(/(\d+)\s*طبقات?/g, t, (m) => ({ value: Number(m[1]), match: m[0], index: m.index })),
    ...all(/(?:ثلاث|ثلاثة)\s+طبقات/g, t, (m) => ({ value: 3, match: m[0], index: m.index })),
  ];

  const packs = [
    ...all(/(\d+(?:\.\d+)?)\s?L(?![A-Za-z²])/g, t, (m) => ({ value: Number(m[1]), match: m[0], index: m.index })),
    ...all(/(\d+(?:\.\d+)?)\s?(?:litres?|liters?)(?![A-Za-z])/gi, t, (m) => ({ value: Number(m[1]), match: m[0], index: m.index })),
    ...all(/(\d+(?:\.\d+)?)\s?(?:لتر|لترات|ليتر)/g, t, (m) => ({ value: Number(m[1]), match: m[0], index: m.index })),
  ].filter((h) => !coverage.some((c) => overlaps(h, c)));

  const sr = all(
    /(?:solar\s+reflectance(?!\s+index)|reflectance(?!\s+index)|الانعكاسية\s+الشمسية|انعكاسية\s+شمسية|الانعكاسية|انعكاسية)[^.\n\d]{0,40}?(\d?\.\d+)/gi,
    t,
    (m) => {
      const v = m[1];
      const idx = m.index + m[0].length - v.length;
      return { value: Number(v), match: v, index: idx };
    },
  ).filter((h) => !coverage.some((c) => overlaps(h, c)));
  const sri = all(
    /(?:\bSRI\b|solar\s+reflectance\s+index|مؤشر\s+الانعكاس\s+الشمسي)\)?[^.\n\d]{0,30}?(\d{2,3})(?![\d.]\d)/gi,
    t,
    (m) => {
      const v = m[1];
      const idx = m.index + m[0].length - v.length;
      return { value: Number(v), match: v, index: idx };
    },
  );

  const dates: Extracted["dates"] = [];
  const pushDate = (day: number, month: number | undefined, year: string | undefined, match: string, index: number) => {
    if (!month || !day || day > 31) return;
    dates.push({ value: day, month, year: year ? Number(year) : undefined, match, index });
  };
  const MON = "(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)";
  all(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MON}\\b\\.?(?:\\s+(\\d{4}))?`, "g"), t, (m) => {
    pushDate(Number(m[1]), MONTHS_EN[m[2].toLowerCase()], m[3], m[0], m.index);
    return null;
  });
  all(new RegExp(`\\b${MON}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?`, "g"), t, (m) => {
    pushDate(Number(m[2]), MONTHS_EN[m[1].toLowerCase()], m[3], m[0], m.index);
    return null;
  });
  all(/(\d{1,2})\s+(يناير|فبراير|مارس|أبريل|إبريل|مايو|يونيو|يوليو|أغسطس|سبتمبر|أكتوبر|نوفمبر|ديسمبر)(?:\s+(\d{4}))?/g, t, (m) => {
    pushDate(Number(m[1]), MONTHS_AR[m[2]], m[3], m[0], m.index);
    return null;
  });

  return { temps, percents, warrantyYears, prices, coverage, coats, packs, sr, sri, dates, warrantyContext };
}

/* ───────────── qualifier helpers ───────────── */

function includesAny(text: string, phrases: string[]) {
  const t = text.toLowerCase();
  return phrases.some((p) => t.includes(p.toLowerCase()));
}

/* ───────────── flag builders ───────────── */

const CATEGORY_RANK: Record<FlagCategory, number> = { forbidden: 5, fact: 4, qualifier: 3, voice: 2, terminology: 1, channel: 1 };

function verdictOfCategory(c: FlagCategory): Verdict | null {
  if (c === "forbidden") return "forbidden";
  if (c === "fact" || c === "voice") return "unsupported";
  if (c === "qualifier") return "needs_qualifier";
  return null;
}

export function worstCategory(flags: Flag[]): FlagCategory | null {
  let best: FlagCategory | null = null;
  for (const f of flags) if (!best || CATEGORY_RANK[f.category] > CATEGORY_RANK[best]) best = f.category;
  return best;
}

interface Ctx {
  channel: Channel;
  lang: Lang;
  facts: Fact[];
  rules: BrandRules;
}

/* ───────────── main computed check ───────────── */

export interface ComputedResult {
  segments: Segment[];
  flags: Flag[];
  metrics: VerificationMetrics;
}

export function runComputedChecks(
  parts: { headline: string | null; body: string; hashtags: string[] },
  ctx: Ctx,
): ComputedResult {
  const { channel, facts, rules } = ctx;
  const segments = segmentVariant(parts);
  const flags: Flag[] = [];
  const textSegs = segments.filter((s) => s.part !== "hashtags");
  const bodySegs = segments.filter((s) => s.part === "body");

  const fTemp = factOfKind(facts, "temp_reduction");
  const fBasis = factOfKind(facts, "test_basis");
  const fApp = factOfKind(facts, "application");
  const fSR = factOfKind(facts, "solar_reflectance");
  const fSRI = factOfKind(facts, "sri");
  const fWar = factOfKind(facts, "warranty");
  const fPrice = factOfKind(facts, "price");
  const fCov = factOfKind(facts, "coverage");
  const fCoats = factOfKind(facts, "coats");
  const fLaunch = factOfKind(facts, "launch_date");

  const add = (f: Omit<Flag, "key" | "source"> & { key?: string }) => {
    flags.push({ ...f, source: "computed", key: f.key ?? `${f.rule}|${norm(f.match ?? (f.segmentId ? "" : "asset"))}` });
  };

  /* 1 — pattern rules (forbidden / restricted / voice / terminology) */
  const patternHits: Array<{ segId: string; index: number; match: string }> = [];
  for (const seg of segments) {
    if (seg.part === "hashtags") continue;
    for (const rule of rules.patternRules) {
      if (rule.channels && !rule.channels.includes(channel.id)) continue;
      const pats = [...rule.patterns.en, ...rule.patterns.ar];
      for (const p of pats) {
        let re: RegExp;
        try {
          re = new RegExp(p, rule.caseSensitive ? "g" : "gi");
        } catch {
          continue;
        }
        const m = re.exec(seg.text);
        if (!m) continue;
        patternHits.push({ segId: seg.id, index: m.index, match: m[0] });
        const category: FlagCategory =
          rule.kind === "forbidden" ? "forbidden" : rule.kind === "restricted" ? "qualifier" : rule.kind === "voice" ? "voice" : "terminology";
        let fix: FlagFix | null = null;
        if (rule.id === "BR-T01") {
          const right = hasArabic(m[0]) ? "ثيرماشيلد" : "ThermaShield";
          fix = { type: "replaceSegment", text: seg.text.replace(m[0], right) };
        } else if (rule.id === "BR-T03") {
          fix = { type: "replaceSegment", text: seg.text.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)) };
        }
        add({
          rule: rule.id,
          category,
          severity: rule.severity,
          label: rule.label,
          reason: rule.reason,
          segmentId: seg.id,
          match: m[0].trim(),
          factIds: rule.factIds,
          ref: rule.ref,
          fix,
        });
        break; // one flag per rule per segment
      }
    }
  }

  /* 2 — numeric claims vs. approved facts */
  const allowedTemps = new Set<number>();
  if (num(fTemp) != null) allowedTemps.add(num(fTemp)!);
  if (num(fBasis) != null) allowedTemps.add(num(fBasis)!);
  const appR = range(fApp);
  if (appR) appR.forEach((v) => allowedTemps.add(v));

  const firstMention: Record<string, string | null> = { sr: null, sri: null, temp: null };
  const segIndex = (id: string) => segments.findIndex((s) => s.id === id);
  const nextText = (seg: { id: string }) => {
    const i = segIndex(seg.id);
    const n = segments[i + 1];
    return n && n.part === "body" ? n.text : "";
  };
  const tempList = [...allowedTemps].sort((a, b) => a - b).map((v) => `${fmt(v)} °C`).join(", ");

  for (const seg of textSegs) {
    const x = extractNumbers(seg.text);
    const withNext = seg.text + " " + nextText(seg);

    // temperatures
    for (const h of x.temps) {
      if (!allowedTemps.has(h.value)) {
        add({
          rule: "num.temp",
          category: "fact",
          severity: "major",
          label: bi("Temperature not in fact sheet", "درجة حرارة غير واردة في ورقة الحقائق"),
          reason: bi(
            `"${h.match.trim()}" does not match the approved figures (${tempList}). Approved claim: up to ${fmt(num(fTemp) ?? 18)} °C cooler roof surface (TS-F05).`,
            `"${h.match.trim()}" لا تطابق الأرقام المعتمدة (${tempList}). الادعاء المعتمد: سطح سقف أبرد بما يصل إلى ${fmt(num(fTemp) ?? 18)} °C (TS-F05).`,
          ),
          segmentId: seg.id,
          match: h.match.trim(),
          factIds: ["TS-F05"],
        });
      } else if (fTemp && h.value === num(fTemp)) {
        if (!includesAny(seg.text, [...rules.qualifiers.upTo.en, ...rules.qualifiers.upTo.ar])) {
          add({
            rule: "qual.upTo",
            category: "qualifier",
            severity: "major",
            label: bi("Missing \"up to\"", "ينقصها \"بما يصل إلى\""),
            reason: bi(
              `The temperature reduction is a maximum: write "up to ${fmt(num(fTemp)!)} °C cooler roof surface" (TS-F05).`,
              `خفض الحرارة قيمة قصوى: اكتب "سطح سقف أبرد بما يصل إلى ${fmt(num(fTemp)!)} °C" (TS-F05).`,
            ),
            segmentId: seg.id,
            match: h.match.trim(),
            factIds: [fTemp.id],
          });
        }
        if (seg.part === "body" && !firstMention.temp) firstMention.temp = seg.id;
      }
    }

    // percentages (suppressed when part of a forbidden phrase match)
    for (const h of x.percents) {
      const srPct = num(fSR) != null ? Math.round(num(fSR)! * 100) : null;
      if (srPct != null && eq(h.value, srPct)) continue;
      const inPattern = patternHits.some((p) => p.segId === seg.id && p.index <= seg.text.indexOf(h.match) && seg.text.indexOf(h.match) < p.index + p.match.length);
      if (inPattern) continue;
      add({
        rule: "num.percent",
        category: "fact",
        severity: "major",
        label: bi("Unapproved percentage", "نسبة مئوية غير معتمدة"),
        reason: bi(`"${h.match.trim()}" is not an approved figure — the fact sheet contains no percentage claims.`, `"${h.match.trim()}" ليست رقماً معتمداً — لا تتضمن ورقة الحقائق أي نسب مئوية.`),
        segmentId: seg.id,
        match: h.match.trim(),
        factIds: [],
      });
    }

    // warranty
    if (x.warrantyContext && fWar) {
      for (const h of x.warrantyYears) {
        if (num(fWar) != null && !eq(h.value, num(fWar)!)) {
          add({
            rule: "num.warranty",
            category: "fact",
            severity: "major",
            label: bi("Warranty term mismatch", "مدة ضمان غير مطابقة"),
            reason: bi(`"${h.match.trim()}" — the approved warranty is ${fWar.value} (${fWar.id}, v${fWar.version}).`, `"${h.match.trim()}" — الضمان المعتمد ${fWar.valueAr} (${fWar.id}، الإصدار ${fWar.version}).`),
            segmentId: seg.id,
            match: h.match.trim(),
            factIds: [fWar.id],
          });
        }
      }
      if (!includesAny(withNext, [...rules.qualifiers.applicator.en, ...rules.qualifiers.applicator.ar])) {
        const m = seg.text.match(/warrant\w*|guarantee\w*|(?<![؀-ۿ])(?:وبال|بال|وال|ال|وب|ب|و)?ضمان[؀-ۿ]*|كفالة/i);
        add({
          rule: "qual.applicator",
          category: "qualifier",
          severity: "major",
          label: bi("Warranty without applicator qualifier", "ضمان دون شرط مقاول التطبيق"),
          reason: bi(
            `Any warranty mention must say "when applied by a Raseen-certified applicator" (${fWar.id}).`,
            `أي ذكر للضمان يجب أن يتضمن "عند التطبيق بواسطة مقاول تطبيق معتمد من رصين" (${fWar.id}).`,
          ),
          segmentId: seg.id,
          match: m?.[0],
          factIds: [fWar.id],
        });
      }
    }

    // price
    for (const h of x.prices) {
      const p = num(fPrice);
      if (p != null && !eq(h.value, p)) {
        add({
          rule: "num.price",
          category: "fact",
          severity: "major",
          label: bi("Price mismatch", "سعر غير مطابق"),
          reason: bi(`"${h.match.trim()}" — the approved trade price is AED ${fmt(p)} per 20 L pail, excl. VAT (${fPrice!.id}, ${fPrice!.source}).`, `"${h.match.trim()}" — السعر التجاري المعتمد ${fmt(p)} درهم للسطل سعة 20 لتر غير شامل الضريبة (${fPrice!.id}، ${fPrice!.source}).`),
          segmentId: seg.id,
          match: h.match.trim(),
          factIds: [fPrice!.id],
        });
      }
    }
    if (x.prices.length && fPrice) {
      const vat = includesAny(withNext, [...rules.qualifiers.vat.en, ...rules.qualifiers.vat.ar]);
      const pail = /pail|سطل/i.test(withNext);
      if (!vat || !pail) {
        add({
          rule: "qual.price",
          category: "qualifier",
          severity: "major",
          label: bi("Price without pack / VAT qualifier", "سعر دون العبوة أو شرط الضريبة"),
          reason: bi(
            `Price must read "AED ${fmt(num(fPrice) ?? 385)} per 20 L pail (excl. VAT)" — missing: ${[!pail && "per 20 L pail", !vat && "excl. VAT"].filter(Boolean).join(", ")}.`,
            `يُكتب السعر "${fmt(num(fPrice) ?? 385)} درهم للسطل سعة 20 لتر (غير شامل ضريبة القيمة المضافة)" — ينقص: ${[!pail && "للسطل سعة 20 لتر", !vat && "غير شامل الضريبة"].filter(Boolean).join("، ")}.`,
          ),
          segmentId: seg.id,
          match: x.prices[0].match.trim(),
          factIds: [fPrice.id],
        });
      }
    }

    // coverage
    const cr = range(fCov);
    for (const h of x.coverage) {
      if (!cr) break;
      const ok = h.value2 != null ? eq(h.value, cr[0]) && eq(h.value2, cr[1]) : h.value >= cr[0] - 1e-9 && h.value <= cr[1] + 1e-9;
      if (!ok) {
        add({
          rule: "num.coverage",
          category: "fact",
          severity: "major",
          label: bi("Coverage mismatch", "معدل تغطية غير مطابق"),
          reason: bi(`"${h.match.trim()}" — approved coverage is ${fCov!.value} (${fCov!.id}).`, `"${h.match.trim()}" — معدل التغطية المعتمد ${fCov!.valueAr} (${fCov!.id}).`),
          segmentId: seg.id,
          match: h.match.trim(),
          factIds: [fCov!.id],
        });
      }
    }

    // coats
    for (const h of x.coats) {
      if (fCoats && num(fCoats) != null && !eq(h.value, num(fCoats)!)) {
        add({
          rule: "num.coats",
          category: "fact",
          severity: "major",
          label: bi("Number of coats mismatch", "عدد طبقات غير مطابق"),
          reason: bi(`"${h.match.trim()}" — the system is ${fCoats.value} (${fCoats.id}).`, `"${h.match.trim()}" — النظام المعتمد ${fCoats.valueAr} (${fCoats.id}).`),
          segmentId: seg.id,
          match: h.match.trim(),
          factIds: [fCoats.id],
        });
      }
    }

    // pack size
    const pack = fPrice?.pack ?? 20;
    for (const h of x.packs) {
      if (!eq(h.value, pack)) {
        add({
          rule: "num.pack",
          category: "fact",
          severity: "major",
          label: bi("Pack size mismatch", "حجم عبوة غير مطابق"),
          reason: bi(`"${h.match.trim()}" — ThermaShield is supplied in a ${pack} L pail (${fPrice?.id ?? "TS-F10"}).`, `"${h.match.trim()}" — يُورَّد ثيرماشيلد في سطل سعة ${pack} لتر (${fPrice?.id ?? "TS-F10"}).`),
          segmentId: seg.id,
          match: h.match.trim(),
          factIds: [fPrice?.id ?? "TS-F10"],
        });
      }
    }

    // solar reflectance
    for (const h of x.sr) {
      if (fSR && num(fSR) != null && !eq(h.value, num(fSR)!)) {
        add({
          rule: "num.sr",
          category: "fact",
          severity: "major",
          label: bi("Solar reflectance mismatch", "انعكاسية شمسية غير مطابقة"),
          reason: bi(`"${h.match}" — approved solar reflectance is ${fSR.value} (${fSR.id}, ${fSR.source}).`, `"${h.match}" — الانعكاسية الشمسية المعتمدة ${fSR.valueAr} (${fSR.id}، ${fSR.source}).`),
          segmentId: seg.id,
          match: h.match,
          factIds: [fSR.id],
        });
      } else if (seg.part === "body" && !firstMention.sr) firstMention.sr = seg.id;
    }
    // SRI
    for (const h of x.sri) {
      if (fSRI && num(fSRI) != null && !eq(h.value, num(fSRI)!)) {
        add({
          rule: "num.sri",
          category: "fact",
          severity: "major",
          label: bi("SRI mismatch", "مؤشر انعكاس غير مطابق"),
          reason: bi(`"SRI ${h.match}" — approved value is ${fSRI.value} (${fSRI.id}, ${fSRI.source}).`, `"${h.match}" — القيمة المعتمدة ${fSRI.valueAr} (${fSRI.id}، ${fSRI.source}).`),
          segmentId: seg.id,
          match: h.match,
          factIds: [fSRI.id],
        });
      } else if (seg.part === "body" && !firstMention.sri) firstMention.sri = seg.id;
    }

    // dates
    if (fLaunch?.date) {
      const [ly, lm, ld] = fLaunch.date.split("-").map(Number);
      for (const d of x.dates) {
        const ok = d.value === ld && d.month === lm && (d.year == null || d.year === ly);
        if (!ok) {
          add({
            rule: "num.date",
            category: "fact",
            severity: "major",
            label: bi("Date not in fact sheet", "تاريخ غير وارد في ورقة الحقائق"),
            reason: bi(`"${d.match.trim()}" — the only approved date is the launch, ${fLaunch.value} (${fLaunch.id}).`, `"${d.match.trim()}" — التاريخ المعتمد الوحيد هو الإطلاق في ${fLaunch.valueAr} (${fLaunch.id}).`),
            segmentId: seg.id,
            match: d.match.trim(),
            factIds: [fLaunch.id],
          });
        }
      }
    }
  }

  /* 3 — test basis on first mention (body) */
  const basis = rules.qualifiers.testBasis;
  const basisCheck = (key: "sr" | "sri" | "temp", kind: string, fact?: Fact) => {
    const segId = firstMention[key];
    if (!segId || !fact) return;
    const seg = segments.find((s) => s.id === segId)!;
    const before = segments[segIndex(seg.id) - 1];
    const near = (before && before.part === "body" ? before.text + " " : "") + seg.text + " " + nextText(seg);
    if (!includesAny(near, basis[kind] ?? [])) {
      add({
        rule: "qual.basis",
        category: "qualifier",
        severity: "major",
        label: bi("Missing test basis on first mention", "ينقص أساس الاختبار عند أول ذكر"),
        reason: bi(
          `First mention of ${fact.label.en.toLowerCase()} must carry its test basis (${(basis[kind] ?? []).slice(0, 2).join(" / ")}) — brand guidelines, Voice.`,
          `أول ذكر لـ${fact.label.ar} يجب أن يحمل أساس الاختبار (${(basis[kind] ?? []).slice(0, 2).join(" / ")}) — دليل العلامة، الأسلوب.`,
        ),
        segmentId: seg.id,
        match: undefined,
        factIds: [fact.id, "TS-F06"],
        key: `qual.basis|${key}`,
      });
    }
  };
  basisCheck("temp", "temp_reduction", fTemp);
  basisCheck("sr", "solar_reflectance", fSR);
  basisCheck("sri", "sri", fSRI);

  /* 4 — product name: first mention */
  const EN_ANY = /Raseen\s+ThermaShield|ThermaShield|Thermashield|Thermo\s?[Ss]hield|Therma\s+Shield/;
  const AR_ANY = /(رصين\s+)?(ثيرماشيلد|ثيرموشيلد|ثرماشيلد|ترماشيلد|ثيرمو شيلد|ثيرما شيلد|تيرماشيلد|ثرموشيلد)(\s*\(Raseen ThermaShield\))?/;
  const headline = segments.find((s) => s.part === "headline");
  if (headline) {
    const m = ctx.lang === "ar" ? headline.text.match(AR_ANY) ?? headline.text.match(EN_ANY) : headline.text.match(EN_ANY);
    if (m && !/^(Raseen\s|رصين\s)/.test(m[0])) {
      add({
        rule: "term.firstMention",
        category: "terminology",
        severity: "minor",
        label: bi("Product name without \"Raseen\"", "اسم المنتج دون \"رصين\""),
        reason: bi("The product name must include \"Raseen\" — \"Raseen ThermaShield\".", "يجب أن يتضمن اسم المنتج \"رصين\" — \"رصين ثيرماشيلد\"."),
        segmentId: "h",
        match: m[0],
        factIds: ["TS-F01"],
        key: "term.firstMention|h",
        fix: { type: "replaceSegment", text: headline.text.replace(m[0], ctx.lang === "ar" && hasArabic(m[0]) ? "رصين ثيرماشيلد" : "Raseen ThermaShield") },
      });
    }
  }
  const bodyFirst = (() => {
    for (const s of bodySegs) {
      const mEn = s.text.match(EN_ANY);
      const mAr = s.text.match(AR_ANY);
      if (mEn || mAr) return { seg: s, mEn, mAr };
    }
    return null;
  })();
  if (!bodyFirst) {
    add({
      rule: "term.productMissing",
      category: "terminology",
      severity: "minor",
      label: bi("Product not named", "المنتج غير مذكور"),
      reason: bi("The copy never names \"Raseen ThermaShield\".", "لا يذكر النص اسم \"رصين ثيرماشيلد\"."),
      segmentId: null,
      factIds: ["TS-F01"],
    });
  } else if (ctx.lang === "en") {
    const m = bodyFirst.mEn;
    if (m && !/^Raseen\s+ThermaShield$/.test(m[0])) {
      add({
        rule: "term.firstMention",
        category: "terminology",
        severity: "minor",
        label: bi("First mention must read \"Raseen ThermaShield\"", "أول ذكر يجب أن يكون \"Raseen ThermaShield\""),
        reason: bi("Terminology: the first mention must include \"Raseen\" — \"Raseen ThermaShield\".", "المصطلحات: يجب أن يتضمن أول ذكر \"Raseen\" — \"Raseen ThermaShield\"."),
        segmentId: bodyFirst.seg.id,
        match: m[0],
        factIds: ["TS-F01"],
        key: "term.firstMention|body",
        fix: { type: "replaceSegment", text: bodyFirst.seg.text.replace(m[0], "Raseen ThermaShield") },
      });
    }
  } else {
    const s = bodyFirst.seg.text;
    const iA = bodyFirst.mAr ? s.indexOf(bodyFirst.mAr[0]) : -1;
    const iE = bodyFirst.mEn ? s.indexOf(bodyFirst.mEn[0]) : -1;
    const canonical = "رصين ثيرماشيلد (Raseen ThermaShield)";
    const ok = iA >= 0 && bodyFirst.mAr![0].replace(/\s+/g, " ") === canonical && (iE < 0 || iE > iA);
    if (!ok) {
      const target = iA >= 0 && (iE < 0 || iA < iE) ? bodyFirst.mAr![0] : bodyFirst.mEn![0];
      add({
        rule: "term.firstMention",
        category: "terminology",
        severity: "minor",
        label: bi("Arabic first mention", "صيغة أول ذكر بالعربية"),
        reason: bi(
          "First mention in Arabic must read \"رصين ثيرماشيلد (Raseen ThermaShield)\".",
          "يجب أن يرد أول ذكر بالعربية بصيغة \"رصين ثيرماشيلد (Raseen ThermaShield)\".",
        ),
        segmentId: bodyFirst.seg.id,
        match: target,
        factIds: ["TS-F01"],
        key: "term.firstMention|body",
        fix: { type: "replaceSegment", text: s.replace(target, canonical) },
      });
    }
  }

  /* 5 — channel limits */
  const limits = rules.channelLimits[channel.id];
  const words = countWords(parts.body);
  const allHashtags = [...parts.hashtags, ...inlineHashtags(parts.body)];
  const hashtagCount = new Set(allHashtags.map((h) => h.toLowerCase())).size;
  const emoji = countEmoji([parts.headline ?? "", parts.body].join(" "));
  const excl = countExclamations([parts.headline ?? "", parts.body].join(" "));
  const headlineChars = parts.headline ? parts.headline.trim().length : null;

  if (words < channel.words[0] || words > channel.words[1]) {
    const shorter = words > channel.words[1];
    const target = Math.round((channel.words[0] + channel.words[1]) / 2);
    add({
      rule: "limit.words",
      category: "channel",
      severity: "major",
      label: bi(shorter ? "Too long for channel" : "Too short for channel", shorter ? "أطول من حد القناة" : "أقصر من حد القناة"),
      reason: bi(
        `${words} words — ${channel.name.en} must be ${channel.words[0]}–${channel.words[1]} words.`,
        `${words} كلمة — ${channel.name.ar} يجب أن تكون ${channel.words[0]}–${channel.words[1]} كلمة.`,
      ),
      segmentId: null,
      factIds: [],
      ref: channel.ref,
      fix: { type: "regenerate", instruction: `${shorter ? "Shorten" : "Lengthen"} to about ${target} words (channel limit ${channel.words[0]}–${channel.words[1]}) keeping every approved fact and qualifier.` },
    });
  }
  if (channel.headline) {
    if (!headlineChars) {
      add({
        rule: "limit.headlineMissing",
        category: "channel",
        severity: "major",
        label: bi(`${channel.headline.label.en} missing`, `${channel.headline.label.ar} غير موجود`),
        reason: bi(`${channel.name.en} requires a ${channel.headline.label.en.toLowerCase()} (≤ ${channel.headline.max} characters).`, `${channel.name.ar} يتطلب ${channel.headline.label.ar} (≤ ${channel.headline.max} حرفاً).`),
        segmentId: null,
        factIds: [],
        ref: channel.ref,
        fix: { type: "regenerate", instruction: `Add a ${channel.headline.label.en.toLowerCase()} of at most ${channel.headline.max} characters.` },
      });
    } else if (headlineChars > channel.headline.max) {
      add({
        rule: "limit.headline",
        category: "channel",
        severity: "major",
        label: bi(`${channel.headline.label.en} too long`, `${channel.headline.label.ar} أطول من الحد`),
        reason: bi(`${headlineChars} characters — limit ${channel.headline.max}.`, `${headlineChars} حرفاً — الحد ${channel.headline.max}.`),
        segmentId: "h",
        factIds: [],
        ref: channel.ref,
        key: "limit.headline|h",
      });
    }
  }
  const maxTags = channel.hashtags ? limits?.maxHashtags ?? null : 0;
  const mandatory = rules.mandatoryHashtags;
  const required = limits?.requiredHashtags ?? [];
  const hasTag = (t: string) => allHashtags.some((h) => h.toLowerCase() === t.toLowerCase());
  const missingMandatory = hashtagCount > 0 || required.length ? [...new Set([...mandatory, ...required])].filter((t) => !hasTag(t)) : [];
  const tooMany = maxTags != null && hashtagCount > maxTags;
  if (tooMany || (channel.hashtags && missingMandatory.length)) {
    let fixed: string[] = [];
    if (channel.hashtags && maxTags !== 0) {
      const base = [...new Set([...mandatory, ...required])];
      const others = parts.hashtags.filter((h) => !base.some((b) => b.toLowerCase() === h.toLowerCase()));
      fixed = [...base, ...others].slice(0, maxTags ?? 5);
    }
    if (tooMany) {
      add({
        rule: "limit.hashtags",
        category: "channel",
        severity: "minor",
        label: bi("Too many hashtags", "وسوم أكثر من المسموح"),
        reason: bi(`${hashtagCount} hashtags — ${channel.name.en} allows ${maxTags}.`, `${hashtagCount} وسوم — ${channel.name.ar} تسمح بـ${maxTags}.`),
        segmentId: parts.hashtags.length ? "t" : null,
        factIds: [],
        ref: channel.ref,
        key: "limit.hashtags|asset",
        fix: { type: "hashtags", hashtags: fixed },
      });
    }
    if (channel.hashtags && missingMandatory.length) {
      add({
        rule: "limit.mandatoryHashtags",
        category: "channel",
        severity: "minor",
        label: bi("Mandatory hashtags missing", "وسوم إلزامية ناقصة"),
        reason: bi(`Missing ${missingMandatory.join(" ")} — mandatory wherever hashtags are used.`, `ينقص ${missingMandatory.join(" ")} — إلزامية حيثما تُستخدم الوسوم.`),
        segmentId: parts.hashtags.length ? "t" : null,
        factIds: [],
        ref: "RG-MKT-BG-2026 v3.1 · Channel rules",
        key: "limit.mandatoryHashtags|asset",
        fix: { type: "hashtags", hashtags: fixed },
      });
    }
  }
  if (limits?.maxEmoji != null && emoji > limits.maxEmoji) {
    add({
      rule: "limit.emoji",
      category: "channel",
      severity: "minor",
      label: bi("Too many emoji", "رموز تعبيرية أكثر من المسموح"),
      reason: bi(`${emoji} emoji — ${channel.name.en} allows ${limits.maxEmoji}.`, `${emoji} رموز — ${channel.name.ar} تسمح بـ${limits.maxEmoji}.`),
      segmentId: null,
      factIds: [],
      ref: channel.ref,
      fix: { type: "stripEmoji", keep: limits.maxEmoji },
    });
  }
  if (limits?.maxExclamation != null && excl > limits.maxExclamation) {
    add({
      rule: "limit.exclamation",
      category: "channel",
      severity: "minor",
      label: bi("Exclamation marks", "علامات تعجب"),
      reason: bi(
        `${excl} exclamation marks — ${limits.maxExclamation === 0 ? "none allowed in this channel" : `at most ${limits.maxExclamation} in social posts`}.`,
        `${excl} علامات تعجب — ${limits.maxExclamation === 0 ? "غير مسموح بها في هذه القناة" : `علامة واحدة كحد أقصى في منشورات التواصل`}.`,
      ),
      segmentId: null,
      factIds: [],
      ref: "RG-MKT-BG-2026 v3.1 · Voice",
      fix: { type: "stripExclamations", keep: limits.maxExclamation },
    });
  }
  // links
  const allowed = limits?.allowedLinkDomains ?? rules.allowedLinkDomains;
  for (const seg of textSegs) {
    const noEmails = seg.text.replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, " ");
    const links = noEmails.match(/https?:\/\/[^\s)]+|www\.[^\s)]+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|ae|net|org|me|ly|io|co)(?:\/[^\s)]*)?/gi) ?? [];
    for (const l of links) {
      const host = l.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split(/[/?#]/)[0].toLowerCase().replace(/[.,;:]+$/, "");
      if (!allowed.some((d) => host === d || host.endsWith("." + d))) {
        add({
          rule: "limit.links",
          category: "channel",
          severity: "major",
          label: bi("Link not allowed", "رابط غير مسموح"),
          reason: bi(`"${l}" — no links other than raseen.ae.`, `"${l}" — لا روابط سوى raseen.ae.`),
          segmentId: seg.id,
          match: l,
          factIds: [],
          ref: channel.ref,
        });
      }
    }
  }
  // CTA (web)
  if (channel.ctaRequired && channel.cta) {
    const ctaHit = ctx.lang === "ar" ? /زيارة\s+فنية/.test(parts.body) : /request\s+a\s+technical\s+visit/i.test(parts.body);
    if (!ctaHit) {
      add({
        rule: "limit.cta",
        category: "channel",
        severity: "major",
        label: bi("Required CTA missing", "دعوة الإجراء المطلوبة غير موجودة"),
        reason: bi(`${channel.name.en} must end with the CTA "${channel.cta.en}".`, `${channel.name.ar} يجب أن تنتهي بدعوة الإجراء "${channel.cta.ar}".`),
        segmentId: null,
        factIds: ["TS-F15"],
        ref: channel.ref,
        fix: { type: "regenerate", instruction: `End the copy with the CTA "${ctx.lang === "ar" ? channel.cta.ar : channel.cta.en}".` },
      });
    }
  }
  // web: specification list
  if (channel.id === "web") {
    const items = parts.body.split(/\n/).filter((l) => /^\s*[-•·–]\s+\S/.test(l)).length;
    if (items < 3) {
      add({
        rule: "limit.specList",
        category: "channel",
        severity: "major",
        label: bi("Specification list missing", "قائمة المواصفات غير موجودة"),
        reason: bi(
          `Web product pages need a specification list (found ${items} list line(s); expect at least 3 lines starting with "- ").`,
          `صفحات المنتج تحتاج قائمة مواصفات (وُجد ${items} سطر؛ المطلوب 3 أسطر على الأقل تبدأ بـ"- ").`,
        ),
        segmentId: null,
        factIds: [],
        ref: channel.ref,
        fix: { type: "regenerate", instruction: "Present the specifications as a list: one item per line starting with \"- \" (solar reflectance, SRI, temperature reduction, coats & coverage, substrates)." },
      });
    }
  }
  // email greeting + sign-off
  if (channel.id === "email") {
    const first = parts.body.trim().split("\n")[0] ?? "";
    const greet = ctx.lang === "ar"
      ? /^(السيد|السيدة|السادة|الأستاذ|الأستاذة|المهندس|المهندسة|م\.|عزيزي|عزيزتي|حضرة|الأخ|الأخت|صباح الخير|مساء الخير|تحية طيبة|مرحباً|مرحبا)/.test(first.trim())
      : /^(dear|hello|hi|good (morning|afternoon))\b/i.test(first.trim());
    if (!greet) {
      add({
        rule: "limit.greeting",
        category: "channel",
        severity: "minor",
        label: bi("No personal greeting", "لا توجد تحية شخصية"),
        reason: bi("Contractor emails open with a personal greeting (e.g. \"Dear {{FirstName}},\").", "تبدأ رسائل المقاولين بتحية شخصية (مثل \"السيد/ة {{FirstName}} المحترم/ة،\")."),
        segmentId: null,
        factIds: [],
        ref: channel.ref,
        fix: { type: "regenerate", instruction: "Open with a personal greeting using {{FirstName}}." },
      });
    }
    if (channel.signoff && !(parts.body.includes(channel.signoff.name) || parts.body.includes(channel.signoff.nameAr))) {
      add({
        rule: "limit.signoff",
        category: "channel",
        severity: "minor",
        label: bi("KAM sign-off missing", "توقيع مدير الحساب غير موجود"),
        reason: bi(`Sign off from the key account manager — ${channel.signoff.name}, ${channel.signoff.role}.`, `التوقيع من مديرة الحساب — ${channel.signoff.nameAr}، ${channel.signoff.roleAr}.`),
        segmentId: null,
        factIds: [],
        ref: channel.ref,
        fix: { type: "regenerate", instruction: `End with the sign-off from ${channel.signoff.name}, ${channel.signoff.role}.` },
      });
    }
  }
  // brochure: third person
  if (channel.id === "brochure") {
    for (const seg of bodySegs) {
      const m = ctx.lang === "ar" ? seg.text.match(/(نحن|لدينا|نقدّم|نقدم|سطحك|بيتك|منزلك|لكم)/) : seg.text.match(/\b(you|your|we|our|us)\b/i);
      if (m) {
        add({
          rule: "limit.person",
          category: "channel",
          severity: "minor",
          label: bi("Not third person", "ليست بصيغة الغائب"),
          reason: bi(`"${m[0]}" — brochure blurbs are written in the third person.`, `"${m[0]}" — تُكتب فقرات الكتيّب بصيغة الغائب.`),
          segmentId: seg.id,
          match: m[0],
          factIds: [],
          ref: channel.ref,
        });
      }
    }
  }

  // de-duplicate keys (same rule + same match twice)
  const seen = new Map<string, number>();
  for (const f of flags) {
    const c = seen.get(f.key) ?? 0;
    seen.set(f.key, c + 1);
    if (c > 0) f.key = `${f.key}#${c}`;
  }

  return {
    segments,
    flags,
    metrics: { words, headlineChars, hashtags: hashtagCount, emoji, exclamations: excl },
  };
}

/* ───────────── merge with model judgement ───────────── */

export interface ModelJudgement {
  segmentId: string;
  verdict: Exclude<Verdict, "pending">;
  reason: string;
  factIds: string[];
  fix: string | null;
}

export function buildVerification(
  computed: ComputedResult,
  judgements: ModelJudgement[] | null,
  opts: { dismissed?: string[]; model?: string; validFactIds: Set<string> },
): Verification {
  const dismissed = new Set(opts.dismissed ?? []);
  const flags: Flag[] = computed.flags.filter((f) => !dismissed.has(f.key));
  const results: SegmentResult[] = [];
  const modelFlags: Flag[] = [];

  for (const seg of computed.segments) {
    if (seg.part === "hashtags") continue;
    const segFlags = computed.flags.filter((f) => f.segmentId === seg.id);
    const worst = worstCategory(segFlags);
    const compVerdict = worst ? verdictOfCategory(worst) : null;
    const j = judgements?.find((x) => x.segmentId === seg.id);
    const factIds = (j?.factIds ?? []).filter((id) => opts.validFactIds.has(id));
    const verdict: Verdict = compVerdict ?? (j ? j.verdict : "pending");
    results.push({
      segmentId: seg.id,
      verdict,
      modelVerdict: j?.verdict,
      reason: j?.reason,
      factIds: [...new Set([...factIds, ...segFlags.flatMap((f) => f.factIds)])].filter((id) => opts.validFactIds.has(id)),
      fix: j?.fix ?? null,
    });
    // model-only flags (computed failures always win)
    if (!segFlags.length && j && (j.verdict === "unsupported" || j.verdict === "forbidden" || j.verdict === "needs_qualifier")) {
      const key = `model|${norm(seg.text).slice(0, 80)}`;
      if (dismissed.has(key)) continue;
      modelFlags.push({
        key,
        source: "model",
        rule: "model",
        category: j.verdict === "forbidden" ? "forbidden" : j.verdict === "needs_qualifier" ? "qualifier" : "fact",
        severity: j.verdict === "forbidden" ? "critical" : "major",
        label:
          j.verdict === "forbidden"
            ? bi("Forbidden claim (model)", "ادعاء محظور (النموذج)")
            : j.verdict === "needs_qualifier"
              ? bi("Needs qualifier (model)", "يحتاج إلى شرط (النموذج)")
              : bi("Unsupported claim (model)", "ادعاء غير مدعوم (النموذج)"),
        reason: { en: j.reason, ar: j.reason },
        segmentId: seg.id,
        factIds,
        fix: j.fix ? { type: "replaceSegment", text: j.fix } : null,
      });
    }
  }
  // attach model fixes to computed segment flags that have no computed fix
  for (const f of flags) {
    if (f.fix || !f.segmentId) continue;
    const r = results.find((x) => x.segmentId === f.segmentId);
    if (r?.fix && r.fix.trim() && r.fix.trim() !== computed.segments.find((s) => s.id === f.segmentId)?.text) {
      f.fix = { type: "replaceSegment", text: r.fix.trim() };
    }
  }
  const allFlags = [...flags, ...modelFlags];
  const sentences = results.length;
  const flaggedSegs = new Set(allFlags.map((f) => f.segmentId).filter(Boolean));
  return {
    ranAt: new Date().toISOString(),
    mode: judgements ? "full" : "computed",
    model: opts.model,
    segments: computed.segments,
    results,
    flags: allFlags,
    metrics: computed.metrics,
    summary: {
      sentences,
      supported: results.filter((r) => r.verdict === "supported" || r.verdict === "no_claim").length,
      flagged: flaggedSegs.size,
      critical: allFlags.filter((f) => f.severity === "critical").length,
      computed: flags.length,
      model: modelFlags.length,
    },
  };
}

/** Flag bookkeeping: which flags were raised / resolved between two verifications. */
export function diffFlags(prev: Flag[] | undefined, next: Flag[]) {
  const p = new Set((prev ?? []).map((f) => f.key));
  const n = new Set(next.map((f) => f.key));
  const raised = next.filter((f) => !p.has(f.key));
  const resolved = (prev ?? []).filter((f) => !n.has(f.key));
  return { raised, resolved };
}

export function updateStats(
  v: Pick<Variant, "flagStats" | "flagLog">,
  prev: Flag[] | undefined,
  next: Flag[],
  resolution: ResolvedFlag["resolution"],
) {
  const { raised, resolved } = diffFlags(prev, next);
  const at = new Date().toISOString();
  return {
    flagStats: {
      raised: v.flagStats.raised + raised.length,
      resolved: v.flagStats.resolved + resolved.length,
      dismissed: v.flagStats.dismissed,
    },
    flagLog: [
      ...resolved.map((f) => ({ key: f.key, rule: f.rule, label: f.label, resolution, at })),
      ...(v.flagLog ?? []),
    ].slice(0, 60),
    raisedNow: raised.length,
    resolvedNow: resolved.length,
  };
}

/* ───────────── fixes ───────────── */

export type FixOp =
  | { type: "replace"; segmentId: string; text: string }
  | { type: "hashtags"; hashtags: string[] }
  | { type: "stripExclamations"; keep: number }
  | { type: "stripEmoji"; keep: number };

export function applyOps(parts: { headline: string | null; body: string; hashtags: string[] }, ops: FixOp[]) {
  const segs = segmentVariant(parts);
  let headline = parts.headline;
  let body = parts.body;
  let hashtags = [...parts.hashtags];
  const replaces = ops.filter((o): o is Extract<FixOp, { type: "replace" }> => o.type === "replace");
  const bodyRep = replaces
    .map((r) => ({ r, seg: segs.find((s) => s.id === r.segmentId) }))
    .filter((x) => x.seg && x.seg.part === "body")
    .sort((a, b) => b.seg!.start - a.seg!.start);
  for (const { r, seg } of bodyRep) body = body.slice(0, seg!.start) + r.text.trim() + body.slice(seg!.end);
  const h = replaces.find((r) => r.segmentId === "h");
  if (h) headline = h.text.trim();
  const t = replaces.find((r) => r.segmentId === "t");
  if (t) hashtags = inlineHashtags(t.text);
  for (const op of ops) {
    if (op.type === "hashtags") hashtags = op.hashtags;
    if (op.type === "stripExclamations") {
      let c = 0;
      body = body.replace(/[!！]/g, () => (++c <= op.keep ? "!" : "."));
      if (headline) headline = headline.replace(/[!！]/g, "");
    }
    if (op.type === "stripEmoji") {
      let c = 0;
      body = body
        .replace(EMOJI_RE, (e) => (++c <= op.keep ? e : ""))
        .replace(/[ \t]{2,}/g, " ")
        .replace(/ ([.,،!?])/g, "$1");
    }
  }
  return { headline, body: body.trim(), hashtags };
}

/** Turn a flag into a concrete fix operation (or a regenerate instruction). */
export function opForFlag(flag: Flag): FixOp | { type: "regenerate"; instruction: string } | null {
  const fx = flag.fix;
  if (!fx) return null;
  if (fx.type === "replaceSegment" && flag.segmentId) return { type: "replace", segmentId: flag.segmentId, text: fx.text };
  if (fx.type === "hashtags") return { type: "hashtags", hashtags: fx.hashtags };
  if (fx.type === "stripExclamations") return { type: "stripExclamations", keep: fx.keep };
  if (fx.type === "stripEmoji") return { type: "stripEmoji", keep: fx.keep };
  if (fx.type === "regenerate") return { type: "regenerate", instruction: fx.instruction };
  return null;
}

/* ───────────── fact change impact ───────────── */

export function mentionsFactValue(parts: { headline: string | null; body: string }, fact: Fact): string | null {
  const text = [parts.headline ?? "", parts.body].join("\n");
  const segs = segmentVariant({ headline: parts.headline, body: parts.body, hashtags: [] });
  const v = fact.numeric;
  for (const s of segs) {
    const x = extractNumbers(s.text);
    const hit = (hs: Hit[]) => hs.find((h) => typeof v === "number" && eq(h.value, v));
    let h: Hit | undefined;
    switch (fact.kind) {
      case "warranty": h = hit(x.warrantyYears); break;
      case "price": h = hit(x.prices); break;
      case "solar_reflectance": h = hit(x.sr); break;
      case "sri": h = hit(x.sri); break;
      case "temp_reduction":
      case "test_basis": h = hit(x.temps); break;
      case "coats": h = hit(x.coats); break;
      case "coverage":
        if (Array.isArray(v)) h = x.coverage.find((c) => eq(c.value, v[0]) && (c.value2 == null || eq(c.value2, v[1])));
        break;
      default: break;
    }
    if (h) return h.match.trim();
  }
  for (const s of [fact.value, fact.valueAr]) if (s && s.length > 6 && text.includes(s)) return s;
  return null;
}

/* ───────────── status, KPIs ───────────── */

export function openFlags(v: Pick<Variant, "verification" | "dismissed">): Flag[] {
  const d = new Set((v.dismissed ?? []).map((x) => x.key));
  return (v.verification?.flags ?? []).filter((f) => !d.has(f.key));
}

export function deriveStatus(v: Variant): VariantStatus {
  if (v.stale) return "stale";
  if (v.status === "released" && v.releasedVersion === v.version) return "released";
  const ver = v.verification;
  if (!ver) return "draft";
  if (openFlags(v).length) return "flagged";
  if (ver.mode !== "full") return "draft";
  if (ver.results.some((r) => r.verdict === "pending")) return "draft"; // a sentence the model did not judge — re-verify
  return "ready";
}

export function usedFactIds(v: Variant, valid: Set<string>): string[] {
  const s = new Set<string>(v.factIds.filter((id) => valid.has(id)));
  for (const r of v.verification?.results ?? []) {
    if (r.verdict === "supported") r.factIds.forEach((id) => valid.has(id) && s.add(id));
  }
  return [...s];
}

export interface Kpis {
  ready: number;
  total: number;
  present: number;
  factsCovered: number;
  factsTotal: number;
  flagsRaised: number;
  flagsResolved: number;
  openFlags: number;
  releaseMs: number | null;
  firstGeneratedAt: string | null;
  releasedAt: string | null;
  released: number;
}

export function computeKpis(variants: Variant[], facts: Fact[]): Kpis {
  const valid = new Set(facts.map((f) => f.id));
  const cells = new Map(variants.map((v) => [v.id, v]));
  let ready = 0;
  let released = 0;
  const used = new Set<string>();
  let raised = 0;
  let resolved = 0;
  let open = 0;
  let first: number | null = null;
  let rel: number | null = null;
  for (const v of cells.values()) {
    const st = deriveStatus(v);
    if (st === "ready" || st === "released") ready++;
    if (st === "released") {
      released++;
      if (v.releasedAt) rel = Math.max(rel ?? 0, Date.parse(v.releasedAt));
    }
    usedFactIds(v, valid).forEach((id) => used.add(id));
    raised += v.flagStats?.raised ?? 0;
    resolved += v.flagStats?.resolved ?? 0;
    open += openFlags(v).length;
    if (v.firstGeneratedAt) first = Math.min(first ?? Infinity, Date.parse(v.firstGeneratedAt));
  }
  return {
    ready,
    total: CHANNEL_ORDER.length * 2,
    present: cells.size,
    factsCovered: used.size,
    factsTotal: facts.length,
    flagsRaised: raised,
    flagsResolved: resolved,
    openFlags: open,
    releaseMs: first != null && rel != null && rel >= first ? rel - first : null,
    firstGeneratedAt: first != null ? new Date(first).toISOString() : null,
    releasedAt: rel != null ? new Date(rel).toISOString() : null,
    released,
  };
}

export function fmtDuration(ms: number, lang: Lang) {
  const min = Math.max(1, Math.round(ms / 60000));
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  if (lang === "ar") return [d && `${d} ي`, h && `${h} س`, (!d && m) && `${m} د`].filter(Boolean).join(" ");
  return [d && `${d} d`, h && `${h} h`, (!d && m) && `${m} min`].filter(Boolean).join(" ");
}

export const SEVERITY_RANK: Record<Severity, number> = { critical: 3, major: 2, minor: 1 };
export function channelName(channels: Channel[], id: ChannelId) {
  return channels.find((c) => c.id === id);
}
