import "server-only";
import { z } from "zod";
import { generateObject } from "@/lib/ai/json";
import type { BrandRules, Channel, Fact, Flag, Lang, Segment, Variant } from "./types";
import { SLUG } from "./types";
import { DEMO_TODAY } from "@/lib/world/orgs";
import type { ModelJudgement } from "./checks";

/* ───────────── prompt blocks ───────────── */

export function factsBlock(facts: Fact[], lang: Lang) {
  return facts
    .map((f) => {
      const value = lang === "ar" ? `${f.valueAr}  [EN: ${f.value}]` : f.value;
      const q = lang === "ar" ? f.qualifierAr ?? f.qualifier : f.qualifier;
      return `${f.id} (v${f.version}) · ${f.label.en}: ${value}${q ? ` — REQUIRED QUALIFIER: ${q}` : ""} — source ${f.source}`;
    })
    .join("\n");
}

export function rulesBlock(rules: BrandRules, facts: Fact[]) {
  const war = facts.find((f) => f.kind === "warranty");
  const price = facts.find((f) => f.kind === "price");
  const temp = facts.find((f) => f.kind === "temp_reduction");
  const t = typeof temp?.numeric === "number" ? temp.numeric : 18;
  const forbidden = rules.patternRules
    .filter((r) => r.kind === "forbidden")
    .map((r) => `- ${r.label.en}: ${r.reason.en}`)
    .join("\n");
  const voice = rules.voice.en.map((v) => `- ${v}`).join("\n");
  const term = rules.terminology.map((t) => `- ${t.en} = ${t.ar}${t.note ? ` (${t.note})` : ""}`).join("\n");
  return `FORBIDDEN in every channel and language:
${forbidden}
- Superlatives we cannot prove ("best", "No. 1", "unbeatable", "revolutionary", "guaranteed savings"); naming or disparaging competitors or "other/conventional" products.

RESTRICTED (allowed only with the qualifier):
- Temperature: "up to ${t} °C cooler roof surface (lab report RBM-LAB-26-112, 46 °C ambient)" — the full test basis in the SAME sentence as the first temperature claim. Never rooms, indoors, homes or villas.
- Warranty: "${war?.value ?? "warranty"} ${war?.qualifier ?? "when applied by a Raseen-certified applicator"}" — the applicator qualifier in the SAME sentence (${war?.id}, v${war?.version}).
- Price: "${price?.value ?? ""}" — never "from AED …", no discounts (${price?.id}, v${price?.version}).
- Performance numbers (solar reflectance, SRI, temperature) carry their test basis the first time they appear.

VOICE:
${voice}

TERMINOLOGY (EN = AR):
${term}`;
}

export function channelBlock(ch: Channel, lang: Lang, rules: BrandRules) {
  const lim = rules.channelLimits[ch.id];
  const target = Math.round((ch.words[0] + ch.words[1]) / 2);
  const lines = [
    `CHANNEL: ${ch.name.en} (${ch.ref})`,
    `Audience: ${ch.audience.en}`,
    `Voice: ${ch.voice}`,
    `Length: body ${ch.words[0]}–${ch.words[1]} words — aim for about ${target} words (count every word of the body).`,
    ch.headline
      ? `"headline" field = the ${ch.headline.label.en.toUpperCase()}${ch.id === "email" ? " LINE of the email" : ""}: REQUIRED (never null), at most ${ch.headline.max} characters including spaces. Do not repeat it inside the body.`
      : "No headline/subject: set headline to null.",
    ch.hashtags
      ? `Hashtags: ${lim.maxHashtags} at most, and they MUST include ${rules.mandatoryHashtags.join(" and ")}. Put them only in the hashtags array, never in the body.`
      : "Hashtags: none — return an empty array.",
    `Emoji: ${lim.maxEmoji == null ? "use sparingly (0–2)" : lim.maxEmoji === 0 ? "none" : `at most ${lim.maxEmoji}`}. Exclamation marks: ${lim.maxExclamation === 0 ? "none" : `at most ${lim.maxExclamation}`}.`,
    `Rules: ${ch.rules.en.join("; ")}.`,
    ch.cta ? `CTA: ${lang === "ar" ? ch.cta.ar : ch.cta.en}${ch.ctaRequired ? " (mandatory, as the last line)" : ""}. Only one CTA. Links: only raseen.ae.` : "No CTA line needed (brochure blurb). No links.",
  ];
  if (ch.id === "web")
    lines.push(
      "Structure (mandatory): \"intro\" = 1–2 short sentences on the customer's problem and what the product is; \"specs\" = 5–7 short specification items (e.g. \"Solar reflectance: 0.88 (ASTM C1549, lab report RBM-LAB-26-112)\"); \"details\" = short warranty, price and availability sentences; \"cta\" = the CTA line. Count all of them together for the word limit.",
    );
  if (ch.id === "email" && ch.signoff) {
    lines.push("Line breaks are mandatory: greeting on its own line, then 2–3 short paragraphs separated by a blank line, the CTA on its own line, then every sign-off element on its own line.");
    lines.push(
      lang === "ar"
        ? `Open with a personal greeting using the merge field {{FirstName}} (e.g. "السيد/ة {{FirstName}} المحترم/ة،"). Close with this sign-off on separate lines: "مع أطيب التحيات،" / "${ch.signoff.nameAr}" / "${ch.signoff.roleAr}" / "رصين لتجارة مواد البناء" / "${ch.signoff.mobile} · ${ch.signoff.email}".`
        : `Open with a personal greeting using the merge field {{FirstName}} (e.g. "Dear {{FirstName}},"). Close with this sign-off on separate lines: "Kind regards," / "${ch.signoff.name}" / "${ch.signoff.role}" / "Raseen Building Materials Trading LLC" / "${ch.signoff.mobile} · ${ch.signoff.email}".`,
    );
  }
  if (ch.id === "brochure") lines.push("Write strictly in the third person (no \"you\", \"your\", \"we\", \"our\").");
  if (ch.id === "whatsapp") lines.push("Sent to opt-in trade customers; short lines; exactly one CTA.");
  return lines.join("\n");
}

function languageBlock(ch: Channel, lang: Lang) {
  if (lang === "en") return "LANGUAGE: English (UAE business English, British spelling). Digits for all numbers. First mention of the product: \"Raseen ThermaShield\".";
  const reg =
    ch.register === "Gulf-friendly"
      ? "a lighter, Gulf-friendly register is welcome (e.g. \"لسطح أبرد في الصيف\") — but technical claims stay precise, never slang"
      : "Modern Standard Arabic, formal and technical";
  return `LANGUAGE: Arabic — write natively for a UAE reader (do NOT translate from English word for word). Register: ${reg}.
- Latin digits only for every number and unit (0.88، 18 °C، 20 لتر، 1.2–1.5 م²). Never Arabic-Indic digits.
- The FIRST mention of the product in the body must be exactly: رصين ثيرماشيلد (Raseen ThermaShield). Afterwards "رصين ثيرماشيلد" or "ثيرماشيلد".
- Use the approved Arabic terminology (طلاء عاكس للحرارة للأسطح — not "دهان" in formal copy; مقاول تطبيق معتمد من رصين; سطل; معدل التغطية; الانعكاسية الشمسية; مؤشر الانعكاس الشمسي (SRI)).
- "Up to" = "بما يصل إلى". Price wording follows the Arabic value of the price fact exactly.
- Test codes stay in Latin: RBM-LAB-26-112، ASTM C1549، ASTM E1980.`;
}

/* ───────────── generation ───────────── */

export const copySchema = z.object({
  headline: z.string().nullable(),
  body: z.string().min(10),
  hashtags: z.array(z.string()),
  cta: z.string(),
  factIds: z.array(z.string()),
});
export type CopyDraft = z.infer<typeof copySchema>;

const webSchema = z.object({
  headline: z.string(),
  intro: z.string().min(10),
  specs: z.array(z.string()).min(3).max(9),
  details: z.string(),
  cta: z.string(),
  factIds: z.array(z.string()),
});

export type GenMode =
  | { kind: "fresh" }
  | { kind: "revise"; previous: Variant; instruction: string }
  | { kind: "update"; previous: Variant; change: { factId: string; label: string; from: string; to: string } }
  | { kind: "repair"; draft: CopyDraft; issues: string[] }
  | { kind: "rewrite"; original: { headline: string | null; body: string; hashtags: string[] }; issues: string[] };

export async function writeCopy(o: {
  channel: Channel;
  lang: Lang;
  facts: Fact[];
  rules: BrandRules;
  mode: GenMode;
  modelKey?: string | null;
  signal?: AbortSignal;
}) {
  const { channel, lang, facts, rules, mode } = o;
  const system = `You are a senior bilingual copywriter in the Marketing & Brand team of Raseen Building Materials Trading LLC (RBM, Raseen Group, UAE). Brand owner: Hana Yousef, Marketing & Brand Manager. You write launch copy for Raseen ThermaShield (PNT-TS-20), a heat-reflective roof coating launching 1 November 2026.

CONTEXT: today is ${DEMO_TODAY}. The product is NOT on sale yet — never say it is "available now", "in stock now" or "out now"; say it is available from 1 November 2026 (TS-F11, TS-F14).

ABSOLUTE RULE: write ONLY from the APPROVED FACT SHEET below. Every factual statement must come from a listed fact, with its qualifier. Never introduce any number, test, certification, comparison, durability claim, ingredient claim (e.g. "solvent-free"), customer, project or benefit that is not in the facts. Do not mention energy or bill savings at all.

APPROVED FACT SHEET (FS-PNT-TS-20):
${factsBlock(facts, lang)}

BRAND RULES (Raseen Brand & Content Guidelines v3.1):
${rulesBlock(rules, facts)}

${channelBlock(channel, lang, rules)}

${languageBlock(channel, lang)}

${
    channel.id === "web"
      ? `OUTPUT: headline (string, ≤ ${channel.headline?.max ?? 60} characters), intro (string), specs (array of 5–7 short items, no leading dash), details (string), cta (the CTA line), factIds (the IDs of EVERY fact you used).`
      : `OUTPUT: headline (string, or null when the channel has none), body (the full text — greeting, paragraphs, list lines and CTA as applicable; use \\n for line breaks; no hashtags in the body), hashtags (array), cta (the exact CTA phrase used in the body, or "" if none), factIds (the IDs of EVERY fact you used).`
  }`;

  let user: string;
  if (mode.kind === "fresh") {
    user = `Write the ${channel.name.en} variant in ${lang === "ar" ? "Arabic" : "English"} for the ThermaShield launch.`;
  } else if (mode.kind === "revise") {
    user = `Previous version (v${mode.previous.version}):
${mode.previous.headline ? `HEADLINE: ${mode.previous.headline}\n` : ""}BODY:
${mode.previous.body}
HASHTAGS: ${mode.previous.hashtags.join(" ") || "(none)"}

Reviewer instruction: "${mode.instruction}".
Rewrite the ${channel.name.en} variant in ${lang === "ar" ? "Arabic" : "English"} following the instruction while keeping every rule above.`;
  } else if (mode.kind === "update") {
    user = `The approved fact sheet has changed:
${mode.change.factId} ${mode.change.label}: "${mode.change.from}" → "${mode.change.to}"

Current version (v${mode.previous.version}):
${mode.previous.headline ? `HEADLINE: ${mode.previous.headline}\n` : ""}BODY:
${mode.previous.body}
HASHTAGS: ${mode.previous.hashtags.join(" ") || "(none)"}

Revise this variant MINIMALLY so it reflects the current fact sheet: change only the words the new fact requires and anything else that now contradicts the facts or rules; keep all other wording, structure and line breaks identical.`;
  } else if (mode.kind === "repair") {
    user = `Your draft failed these deterministic brand checks:
${mode.issues.map((i) => `- ${i}`).join("\n")}

Draft:
${mode.draft.headline ? `HEADLINE: ${mode.draft.headline}\n` : ""}BODY:
${mode.draft.body}
HASHTAGS: ${mode.draft.hashtags.join(" ") || "(none)"}

Return a corrected version that fixes every issue (keep everything that was correct).`;
  } else {
    user = `Rewrite the following ${channel.name.en} copy so it is fully compliant: keep the intent and the language of the original (${lang === "ar" ? "Arabic" : "English"}), remove or correct every claim that is not in the approved facts, add required qualifiers, respect the channel limits.

Issues already found:
${mode.issues.map((i) => `- ${i}`).join("\n") || "- (none listed)"}

ORIGINAL:
${mode.original.headline ? `HEADLINE: ${mode.original.headline}\n` : ""}${mode.original.body}
${mode.original.hashtags.length ? `HASHTAGS: ${mode.original.hashtags.join(" ")}` : ""}`;
  }

  const common = {
    system,
    user,
    modelKey: o.modelKey,
    solution: SLUG,
    task: `generate.${mode.kind}`,
    temperature: mode.kind === "update" ? 0.1 : 0.4,
    maxTokens: 1600,
    signal: o.signal,
  };
  let res: { object: CopyDraft; model: string; usage: { promptTokens: number; completionTokens: number } };
  if (channel.id === "web") {
    // structured page: the specification list is assembled deterministically from "specs"
    const r = await generateObject({ ...common, schema: webSchema, name: "web_product_page" });
    const o2 = r.object;
    const specs = o2.specs.map((s) => "- " + s.replace(/^\s*[-•·–]\s*/, "").trim()).filter((s) => s.length > 2);
    res = {
      ...r,
      object: {
        headline: o2.headline,
        body: [o2.intro.trim(), ...specs, o2.details.trim(), o2.cta.trim()].filter(Boolean).join("\n"),
        hashtags: [],
        cta: o2.cta.trim(),
        factIds: o2.factIds,
      },
    };
  } else {
    res = await generateObject({ ...common, schema: copySchema, name: "channel_variant" });
  }
  const obj = res.object;
  if (channel.id === "email") obj.body = formatEmail(obj.body, channel);
  const cleanTags = (obj.hashtags ?? [])
    .map((h) => h.trim())
    .filter(Boolean)
    .map((h) => (h.startsWith("#") ? h : `#${h}`).replace(/\s+/g, "_"));
  return {
    draft: {
      headline: channel.headline ? (obj.headline?.trim() || null) : null,
      body: obj.body.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim(),
      hashtags: channel.hashtags ? [...new Set(cleanTags)] : [],
      cta: obj.cta?.trim() ?? "",
      factIds: [...new Set(obj.factIds.filter((id) => facts.some((f) => f.id === id)))],
    } satisfies CopyDraft,
    model: res.model,
    usage: res.usage,
  };
}

/** Models sometimes return an email as one line — restore greeting / paragraph / sign-off line breaks deterministically. */
export function formatEmail(body: string, ch: Channel): string {
  if ((body.match(/\n/g) ?? []).length >= 4 || !ch.signoff) return body;
  let b = body.replace(/\s+/g, " ").trim();
  // greeting line
  b = b.replace(/^((?:Dear|Hello|Hi)\s+\{\{FirstName\}\},|[^،,]{0,40}\{\{FirstName\}\}[^،,]{0,20}[،,])\s*/u, "$1\n\n");
  // sign-off block
  const s = ch.signoff;
  const close = b.search(/(Kind regards,|Best regards,|مع أطيب التحيات،|مع خالص التحية،|وتفضلوا بقبول فائق الاحترام،)/);
  if (close > 0) {
    let tail = b.slice(close);
    let head = b.slice(0, close).trim();
    for (const piece of [s.name, s.nameAr, s.role, s.roleAr, "Raseen Building Materials Trading LLC", "رصين لتجارة مواد البناء", s.mobile]) {
      tail = tail.replace(` ${piece}`, `\n${piece}`);
    }
    // CTA / last sentence of the letter on its own line
    const lastStop = head.lastIndexOf(". ");
    if (lastStop > 0 && head.length - lastStop < 160) head = head.slice(0, lastStop + 1) + "\n\n" + head.slice(lastStop + 2);
    b = head + "\n\n" + tail.trim();
  }
  return b;
}

/* ───────────── sentence judgement ───────────── */

const judgeSchema = z.object({
  sentences: z.array(
    z.object({
      n: z.number().int(),
      verdict: z.enum(["supported", "no_claim", "unsupported", "forbidden", "needs_qualifier"]),
      reason: z.string(),
      factIds: z.array(z.string()),
      fix: z.string().nullable(),
    }),
  ),
});

export async function judgeSentences(o: {
  segments: Segment[];
  computedFlags: Flag[];
  channel: Channel;
  lang: Lang; // language of the copy
  uiLang: Lang; // language of the explanations
  facts: Fact[];
  rules: BrandRules;
  modelKey?: string | null;
  signal?: AbortSignal;
}): Promise<{ judgements: ModelJudgement[]; model: string }> {
  const { segments, computedFlags, channel, lang, uiLang, facts, rules } = o;
  if (!segments.length) return { judgements: [], model: "" };
  const numbered = segments
    .map((s, i) => {
      const issues = computedFlags.filter((f) => f.segmentId === s.id);
      const head = `${i + 1}. [${s.part === "headline" ? (channel.headline?.label.en ?? "Headline") : "Sentence"}] ${s.text}`;
      return issues.length ? `${head}\n   CONFIRMED ISSUES: ${issues.map((f) => f.reason.en).join(" | ")}` : head;
    })
    .join("\n");

  const system = `You are the brand compliance reviewer for Raseen Group (Marketing & Brand, owner Hana Yousef, Marketing & Brand Manager). You verify launch copy for Raseen ThermaShield (PNT-TS-20) against the APPROVED FACT SHEET and the BRAND RULES. Rely only on the data given.

APPROVED FACT SHEET:
${factsBlock(facts, "en")}

BRAND RULES:
${rulesBlock(rules, facts)}

CHANNEL: ${channel.name.en} — ${channel.rules.en.join("; ")}.

For EACH numbered sentence return one entry with:
- verdict:
  • supported — every factual claim in it matches approved facts and carries any required qualifier (list the fact IDs used);
  • no_claim — greeting, sign-off, contact line, CTA or wording with no factual product claim;
  • unsupported — states something not in the facts (other numbers, properties such as "solvent-free", durability, savings, uses or results not listed, comparisons, superlatives);
  • forbidden — a forbidden claim (no air conditioning needed, leak-proof/waterproof, government certification/approval, savings figure, health claim, indoor/room temperature);
  • needs_qualifier — a restricted claim missing its qualifier ("up to" + test basis for temperature, Raseen-certified applicator for warranty, "per 20 L pail (excl. VAT)" for price).
  Sentences marked CONFIRMED ISSUES come from deterministic checks and are definitely non-compliant — never mark them supported.
  Read sentences in context: a test basis given in the same or an immediately adjacent sentence counts for the first mention, and later mentions of the same figure do not need it again. Lines that are specification-list items are judged as statements.
- reason: one short sentence in ${uiLang === "ar" ? "Arabic" : "English"} explaining the verdict (cite fact IDs where relevant) — at most 25 words; at most 10 words for supported / no_claim.
- factIds: the supporting fact IDs (may be empty).
- fix: for any sentence that is not supported/no_claim or has confirmed issues — a compliant rewrite of THAT sentence only, in ${lang === "ar" ? "Arabic (Latin digits, same register as the original)" : "English"}, using only approved facts and qualifiers, similar length${channel.headline ? `; a ${channel.headline.label.en.toLowerCase()} rewrite must stay ≤ ${channel.headline.max} characters` : ""}. Use the CURRENT fact values from the fact sheet. Otherwise null.
Return exactly ${segments.length} entries, n = 1..${segments.length}.`;

  const res = await generateObject({
    schema: judgeSchema,
    name: "claim_verification",
    system,
    user: `Copy language: ${lang === "ar" ? "Arabic" : "English"}\n\nSentences:\n${numbered}`,
    modelKey: o.modelKey,
    solution: SLUG,
    task: "verify.claims",
    temperature: 0,
    maxTokens: 3000,
    signal: o.signal,
  });
  const judgements: ModelJudgement[] = [];
  for (const s of res.object.sentences) {
    const seg = segments[s.n - 1];
    if (!seg) continue;
    judgements.push({ segmentId: seg.id, verdict: s.verdict, reason: s.reason, factIds: s.factIds, fix: s.fix && s.fix.trim() ? s.fix.trim() : null });
  }
  return { judgements, model: res.model };
}
