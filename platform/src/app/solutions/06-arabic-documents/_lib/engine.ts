import "server-only";
import { normalizeArabic } from "@/lib/retrieval/arabic";
import { wordCount, type Flag, type Lang, type RunMetrics, type Segment, type Term } from "./shared";

/* ───────────── 1. Segmentation (structure-preserving) ───────────── */

/** Split markdown into translatable segments: headings, paragraphs, list items and table rows (separators kept verbatim). */
export function segmentMarkdown(md: string): Segment[] {
  const lines = md.replace(/\r/g, "").split("\n");
  const segs: Segment[] = [];
  let gap = false;
  let n = 0;
  const id = () => `S${String(++n).padStart(2, "0")}`;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      gap = true;
      i++;
      continue;
    }
    if (line.trim().startsWith("|")) {
      let first = true;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const l = lines[i].trim();
        const isSep = /^[\s|:-]+$/.test(l) && l.includes("-");
        segs.push({
          id: id(),
          kind: isSep ? "table-sep" : first ? "table-head" : "table-row",
          prefix: "",
          gapBefore: first ? gap : false,
          source: l,
          target: isSep ? l : "",
          terms: [],
          flags: [],
          status: isSep ? "accepted" : "pending",
        });
        first = false;
        gap = false;
        i++;
      }
      continue;
    }
    const h = line.match(/^(#{1,6}\s+)(.*)$/);
    const li = line.match(/^(\s*(?:[-*•]|\d+[.)]|[٠-٩]+[.)]|>)\s+)(.*)$/);
    const [kind, prefix, text] = h ? (["heading", h[1], h[2]] as const) : li ? (["list", li[1], li[2]] as const) : (["paragraph", "", line.trim()] as const);
    segs.push({ id: id(), kind, prefix, gapBefore: gap, source: text.trim(), target: "", terms: [], flags: [], status: "pending" });
    gap = false;
    i++;
  }
  return segs;
}

/* ───────────── 2. Terminology matching (Arabic-aware) ───────────── */

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function normAr(s: string) {
  return normalizeArabic(s)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
export function normEn(s: string) {
  return s
    .toLowerCase()
    .replace(/[‐-―-]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface Matcher {
  termId: string;
  re: RegExp;
}

function formsOf(t: Term, lang: Lang) {
  return lang === "ar" ? [t.ar, ...(t.variants_ar ?? [])] : [t.en, ...(t.variants_en ?? [])];
}

function compile(form: string, lang: Lang): RegExp | null {
  if (lang === "ar") {
    const f = normAr(form);
    if (f.length < 2) return null;
    // Proclitics (و ف ب ك ل) on the first word; the article is optional on every word so construct
    // forms match ("تكسية الواجهات" ≈ "تكسية واجهات المنصة"); whole-word end (plurals come from variants).
    const words = f.split(" ").map((w) => (w.startsWith("ال") && w.length > 4 ? w.slice(2) : w));
    const body = words.map((w) => `(?:ال)?${esc(w)}`).join(" ");
    return new RegExp(`(?:^|\\s)[وفبكل]{0,2}${body}(?=\\s|$)`, "gu");
  }
  const f = normEn(form);
  if (f.length < 2) return null;
  return new RegExp(`(?:^|\\s)${esc(f)}(?:s|es)?(?=\\s|$)`, "gu");
}

const cache = new Map<string, Matcher[]>();

export function matchers(terms: Term[], lang: Lang): Matcher[] {
  const key = `${lang}|${terms.length}|${terms.map((t) => `${t.id}:${t.ar}:${t.en}:${t.status}`).join(",")}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const list: Matcher[] = [];
  for (const t of terms) for (const f of formsOf(t, lang)) {
    const re = compile(f, lang);
    if (re) list.push({ termId: t.id, re });
  }
  cache.set(key, list);
  if (cache.size > 40) cache.delete(cache.keys().next().value!);
  return list;
}

/** Term ids found in a text, longest match first, without overlaps. */
export function findTerms(text: string, lang: Lang, terms: Term[]): string[] {
  // Reference numbers (MNDA/PBP/…, MN-08-…) must not trigger terms such as "MNDA".
  let clean = text;
  for (const r of refsOf(text)) clean = clean.split(r).join(" ");
  const norm = lang === "ar" ? normAr(clean) : normEn(clean);
  const spans: Array<{ termId: string; start: number; end: number }> = [];
  for (const m of matchers(terms, lang)) {
    m.re.lastIndex = 0;
    for (const x of norm.matchAll(m.re)) spans.push({ termId: m.termId, start: x.index ?? 0, end: (x.index ?? 0) + x[0].length });
  }
  spans.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
  const kept: typeof spans = [];
  for (const s of spans) if (!kept.some((k) => s.start < k.end && k.start < s.end)) kept.push(s);
  kept.sort((a, b) => a.start - b.start);
  return [...new Set(kept.map((k) => k.termId))];
}

/** Surface forms of a term that actually occur in a text (for the translator's glossary list). */
export function formsIn(text: string, term: Term, lang: Lang) {
  const norm = lang === "ar" ? normAr(text) : normEn(text);
  return formsOf(term, lang).filter((f) => {
    const re = compile(f, lang);
    if (!re) return false;
    re.lastIndex = 0;
    return re.test(norm);
  });
}

export function containsTerm(text: string, term: Term, lang: Lang) {
  const norm = lang === "ar" ? normAr(text) : normEn(text);
  return formsOf(term, lang).some((f) => {
    const re = compile(f, lang);
    if (!re) return false;
    re.lastIndex = 0;
    return re.test(norm);
  });
}

/* ───────────── 3. Deterministic QA ───────────── */

const digits = (s: string) => s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/٫/g, ".").replace(/٬/g, ",");

const REF_RES = [
  /\b[A-Z]{2,}[A-Z0-9]*(?:[/\-][A-Z0-9.]+)+\b/g,
  /\b(?:ISO|ASTM|EN|BS|RAL)\s?[A-Z]?\d{3,5}(?:[-:]\d+)?\b/g,
  /[\w.+-]+@[\w-]+\.[\w.]+/g,
];

export function refsOf(s: string): string[] {
  const t = digits(s);
  const out = new Set<string>();
  for (const re of REF_RES) for (const m of t.matchAll(re)) if (/\d|@/.test(m[0])) out.add(m[0].replace(/[.,;:]+$/, ""));
  return [...out];
}

function numbersOf(s: string, refs: string[]) {
  let t = digits(s);
  for (const r of refs) t = t.split(r).join(" ");
  const out: string[] = [];
  for (const m of t.matchAll(/\d+(?:[.,]\d+)*/g)) {
    let v = m[0];
    if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(v)) v = v.replace(/,/g, "");
    else v = v.replace(/,/g, ".");
    out.push(String(Number(v)));
  }
  return out;
}

const EN_NUM = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
const EN_ORD = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth"];
const AR_NUM = ["صفر", "واحد", "اثن", "ثلاث", "اربع", "خمس", "ست", "سبع", "ثمان", "تسع", "عشر", "احد عشر", "اثني عشر", "ثلاثه عشر", "اربعه عشر", "خمسه عشر", "سته عشر", "سبعه عشر", "ثمانيه عشر", "تسعه عشر", "عشرين"];
const AR_ORD = ["", "اول", "ثاني", "ثالث", "رابع", "خامس", "سادس", "سابع", "ثامن", "تاسع", "عاشر", "حادي عشر", "ثاني عشر"];

function hasWordNumber(text: string, n: number, lang: Lang) {
  if (n > 20) return false;
  if (lang === "en") {
    const t = normEn(text);
    return new RegExp(`\\b(${EN_NUM[n]}|${EN_ORD[n] || "_"})\\b`).test(t);
  }
  const t = normAr(text);
  return [AR_NUM[n], AR_ORD[n]].filter(Boolean).some((w) => t.includes(w));
}

const MONTHS_EN = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTHS_AR = ["يناير", "فبراير", "مارس", "ابريل", "مايو", "يونيو", "يوليو", "اغسطس", "سبتمبر", "اكتوبر", "نوفمبر", "ديسمبر"];

function monthsOf(text: string, lang: Lang) {
  const t = lang === "ar" ? normAr(text) : normEn(text);
  const list = lang === "ar" ? MONTHS_AR : MONTHS_EN;
  return list.map((m, i) => (new RegExp(`(?:^|\\s)${lang === "ar" ? "[وب]?" : ""}${m}(?=\\s|$)`).test(t) ? i : -1)).filter((i) => i >= 0);
}

const cells = (row: string) => row.trim().replace(/^\||\|$/g, "").split("|").length;

/** Code-level checks for one segment. Returns flags and glossary counts. */
export function checkSegment(seg: Segment, src: Lang, tgt: Lang, termsById: Map<string, Term>) {
  const flags: Flag[] = [];
  let occ = 0;
  let ok = 0;
  if (seg.kind === "table-sep") return { flags, occ, ok };
  const target = seg.target ?? "";
  if (!target.trim()) {
    flags.push({ kind: "omission", severity: "high", by: "code", message: { en: "Segment not translated", ar: "المقطع غير مترجم" } });
    return { flags, occ, ok };
  }
  const sRefs = refsOf(seg.source);
  const tRefsText = digits(target);
  for (const r of sRefs)
    if (!tRefsText.includes(r))
      flags.push({ kind: "reference", severity: "high", by: "code", message: { en: `Reference “${r}” missing or altered`, ar: `المرجع «${r}» مفقود أو معدّل` } });

  const sNums = numbersOf(seg.source, sRefs);
  const tNums = numbersOf(target, refsOf(target));
  const pool = [...tNums];
  for (const n of sNums) {
    const i = pool.indexOf(n);
    if (i >= 0) pool.splice(i, 1);
    else if (!hasWordNumber(target, Number(n), tgt))
      flags.push({ kind: "number", severity: "high", by: "code", message: { en: `Number ${n} missing in translation`, ar: `الرقم ${n} مفقود في الترجمة` } });
  }
  for (const extra of pool)
    if (Number(extra) > 20 && !hasWordNumber(seg.source, Number(extra), src))
      flags.push({ kind: "number", severity: "medium", by: "code", message: { en: `Number ${extra} not in source`, ar: `الرقم ${extra} غير موجود في الأصل` } });

  const sMonths = monthsOf(seg.source, src);
  const tMonths = new Set(monthsOf(target, tgt));
  for (const m of sMonths)
    if (!tMonths.has(m))
      flags.push({ kind: "date", severity: "medium", by: "code", message: { en: `Month “${MONTHS_EN[m]}” not rendered`, ar: `الشهر «${MONTHS_AR[m]}» غير مترجم` } });

  if ((seg.kind === "table-head" || seg.kind === "table-row") && cells(seg.source) !== cells(target))
    flags.push({
      kind: "table",
      severity: "high",
      by: "code",
      message: { en: `Table row has ${cells(target)} cells; source has ${cells(seg.source)}`, ar: `صف الجدول يحتوي ${cells(target)} خلايا والأصل ${cells(seg.source)}` },
    });

  for (const id of seg.terms) {
    const t = termsById.get(id);
    if (!t) continue;
    const expected = tgt === "ar" ? t.ar : t.en;
    const original = src === "ar" ? t.ar : t.en;
    if (t.status === "disputed") {
      const alts = (t.alternatives ?? []).map((a) => (tgt === "ar" ? a.ar : a.en)).join(" / ");
      flags.push({
        kind: "disputed",
        severity: "info",
        by: "code",
        termId: id,
        message: { en: `Disputed: “${original}” → provisional “${expected}”${alts ? ` (alt. ${alts})` : ""}`, ar: `مصطلح خلافي: «${original}» ← مؤقتاً «${expected}»${alts ? ` (بديل: ${alts})` : ""}` },
      });
      continue;
    }
    occ++;
    if (containsTerm(target, t, tgt)) ok++;
    else
      flags.push({
        kind: "glossary",
        severity: "medium",
        by: "code",
        termId: id,
        suggestion: expected,
        message: { en: `Glossary: use “${expected}” for “${original}”`, ar: `المسرد: استخدم «${expected}» مقابل «${original}»` },
      });
  }

  if (seg.source.length >= 40) {
    const ratio = target.length / seg.source.length;
    const [lo, hi] = src === "ar" ? [0.6, 2.3] : [0.45, 1.8];
    if (ratio < lo || ratio > hi)
      flags.push({
        kind: "length",
        severity: "low",
        by: "code",
        message: { en: `Unusual length (${ratio.toFixed(2)}× source) — check for omission or addition`, ar: `طول غير معتاد (${ratio.toFixed(2)}× الأصل) — تحقق من الحذف أو الإضافة` },
      });
  }
  return { flags, occ, ok };
}

/** Re-run code QA over all segments, keeping model flags; returns updated segments + metrics. */
export function recheck(segments: Segment[], src: Lang, tgt: Lang, terms: Term[], ms: number) {
  const byId = new Map(terms.map((t) => [t.id, t]));
  let occ = 0;
  let ok = 0;
  const next = segments.map((s) => {
    const terms2 = s.kind === "table-sep" ? [] : findTerms(s.source, src, terms);
    const seg = { ...s, terms: terms2 };
    const r = checkSegment(seg, src, tgt, byId);
    occ += r.occ;
    ok += r.ok;
    return { ...seg, flags: [...r.flags, ...s.flags.filter((f) => f.by === "model")] };
  });
  return { segments: next, metrics: metricsOf(next, src, occ, ok, ms) };
}

export function metricsOf(segments: Segment[], src: Lang, occ: number, ok: number, ms: number): RunMetrics {
  const trans = segments.filter((s) => s.kind !== "table-sep");
  const all = trans.flatMap((s) => s.flags);
  return {
    segments: trans.length,
    words: trans.reduce((a, s) => a + wordCount(s.kind === "table-head" || s.kind === "table-row" ? s.source.replace(/\|/g, " ") : s.source), 0),
    termOccurrences: occ,
    termCompliant: ok,
    compliancePct: occ ? Math.round((ok / occ) * 100) : null,
    flags: all.filter((f) => f.severity !== "info").length,
    highFlags: all.filter((f) => f.severity === "high").length,
    disputed: new Set(all.filter((f) => f.kind === "disputed").map((f) => f.termId)).size,
    ms,
  };
  void src;
}
export const ENGINE_VERSION = "2026-10-10.3";
