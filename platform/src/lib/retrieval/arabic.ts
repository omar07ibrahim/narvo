/**
 * Arabic + English text normalisation and tokenisation for lexical retrieval.
 * Handles diacritics, tatweel, alef/ya/ta-marbuta variants, common clitics and stop words.
 */

const AR_DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g;
const TATWEEL = /ـ/g;

const STOP = new Set([
  // English
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "is", "are", "was", "be", "by", "with", "as", "at",
  "this", "that", "it", "from", "which", "what", "who", "how", "when", "do", "does", "can", "i", "we", "you", "my",
  "our", "your", "me", "please", "about", "any", "if", "not", "no", "will", "shall", "should", "must", "may",
  // Arabic (normalised forms)
  "في", "من", "علي", "الي", "عن", "مع", "هذا", "هذه", "ذلك", "تلك", "التي", "الذي", "الذين", "او", "و", "ثم", "كما",
  "قد", "لا", "ما", "هل", "كيف", "متي", "اين", "هو", "هي", "انا", "نحن", "انت", "كان", "تكون", "يكون", "عند", "بعد",
  "قبل", "كل", "اي", "اذا", "ان", "لم", "لن", "به", "بها", "له", "لها", "فيه", "فيها",
]);

export function normalizeArabic(text: string): string {
  return text
    .replace(AR_DIACRITICS, "")
    .replace(TATWEEL, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

const AR_PREFIXES = ["وبال", "وال", "بال", "كال", "فال", "لل", "ال"];
const AR_SUFFIXES = ["ات", "ون", "ين", "ان", "يه", "ها", "هم", "كم", "نا", "ه"];

function stemArabic(token: string): string {
  let t = token;
  for (const p of AR_PREFIXES) {
    if (t.startsWith(p) && t.length - p.length >= 3) {
      t = t.slice(p.length);
      break;
    }
  }
  for (const s of AR_SUFFIXES) {
    if (t.endsWith(s) && t.length - s.length >= 3) {
      t = t.slice(0, -s.length);
      break;
    }
  }
  return t;
}

function stemEnglish(token: string): string {
  if (token.length <= 4) return token;
  return token
    .replace(/(ies)$/, "y")
    .replace(/(ing|ed|es|s)$/, "")
    .replace(/(ation)$/, "ate");
}

const isArabic = (s: string) => /[؀-ۿ]/.test(s);

export function tokenize(text: string): string[] {
  const norm = normalizeArabic(text.toLowerCase());
  const raw = norm.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const out: string[] = [];
  for (const tok of raw) {
    if (tok.length < 2 || STOP.has(tok)) continue;
    out.push(isArabic(tok) ? stemArabic(tok) : stemEnglish(tok));
  }
  return out;
}
