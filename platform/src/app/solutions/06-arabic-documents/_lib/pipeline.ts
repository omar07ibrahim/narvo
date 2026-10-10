import "server-only";
import { z } from "zod";
import { generateObject } from "@/lib/ai/json";
import { resolveModelId } from "@/lib/ai/config";
import type { Emitter } from "@/lib/ai/stream";
import { addAudit, patchRecord } from "@/lib/store/db";
import { checkSegment, findTerms, formsIn, metricsOf, normAr, normEn, segmentMarkdown } from "./engine";
import { DOCS, loadGlossary, saveRun, SOLUTION, sourceText } from "./server";
import type { Candidate, Flag, Lang, QueueDoc, RunResult, Segment, Term } from "./shared";

const LANG_NAME: Record<Lang, string> = { ar: "Arabic", en: "English" };

const ENTITIES = `Fixed names (use exactly):
- Marsa Al Noor Development Authority (MNDA) = هيئة مرسى النور للتطوير
- Planning & Building Permits Department = إدارة التخطيط ورخص البناء; Field Operations & Inspection = إدارة العمليات الميدانية والتفتيش
- Districts: Downtown (MN-01) = وسط المدينة; Al Murjan (MN-02) = المرجان; Al Lulu Island (MN-03) = جزيرة اللؤلؤ; Al Waha Gardens (MN-04) = حدائق الواحة; Ras Al Marsa Industrial (MN-05) = رأس المرسى الصناعية; Al Sidr Residential (MN-06) = السدر السكنية; Al Ghaf Community (MN-07) = مجتمع الغاف; Marina Quarter (MN-08) = حي المارينا
- Lulu Island Developments PJSC = شركة جزيرة اللؤلؤ للتطوير ش.م.ع; Sidr Communities LLC = شركة السدر للمجتمعات ذ.م.م; Marina Quarter Properties LLC = شركة حي المارينا العقارية ذ.م.م; Gulf Crest Builders LLC = شركة جلف كرست للمقاولات ذ.م.م
- MNBC-2024 = Marsa Al Noor Building Code 2024 = كود البناء في مرسى النور 2024; ePermits = نظام الرخص الإلكترونية
- Director General H.E. Eng. Khalid Saif Al Mazrouei = سعادة المهندس خالد سيف المزروعي، المدير العام; Eng. Omar Yousef Al Hammadi = م. عمر يوسف الحمادي`;

async function pool<T>(items: T[], limit: number, fn: (item: T, i: number) => Promise<void>) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  });
  await Promise.all(workers);
}

function batchesOf(segs: Segment[]) {
  const out: Segment[][] = [];
  let cur: Segment[] = [];
  let chars = 0;
  for (const s of segs) {
    if (cur.length && (cur.length >= 10 || chars + s.source.length > 2200)) {
      out.push(cur);
      cur = [];
      chars = 0;
    }
    cur.push(s);
    chars += s.source.length;
  }
  if (cur.length) out.push(cur);
  return out;
}

const translationSchema = z.object({
  translations: z.array(z.object({ id: z.string(), text: z.string() })),
});

async function translateBatch(batch: Segment[], doc: QueueDoc, terms: Map<string, Term>, modelKey: string | null) {
  const src = doc.source;
  const tgt = doc.target;
  const used = [...new Set(batch.flatMap((s) => s.terms))].map((id) => terms.get(id)).filter((t): t is Term => !!t);
  const glossary = used.length
    ? used
        .map((t) => {
          const from = src === "ar" ? t.ar : t.en;
          const to = tgt === "ar" ? t.ar : t.en;
          const seen = formsIn(batch.map((s) => s.source).join("\n"), t, src).filter((f) => f.toLowerCase() !== from.toLowerCase());
          return `- ${from}${seen.length ? ` (appears as: ${seen.join(", ")})` : ""} => ${to}${t.status === "disputed" ? "   [DISPUTED — use this provisional term exactly]" : ""}`;
        })
        .join("\n")
    : "(no glossary terms in this batch)";
  const system = [
    `You are the official translator of Marsa Al Noor Development Authority (MNDA), a UAE government authority. Translate from ${LANG_NAME[src]} to ${LANG_NAME[tgt]}.`,
    tgt === "ar"
      ? "Register: formal Modern Standard Arabic in the UAE government and legal register (e.g. «يُعمل به اعتباراً من»، «المتعامل»، «يتعيّن»). Natural Arabic word order — never a word-for-word calque."
      : "Register: formal British English as used in UAE government circulars, building codes and contracts ('shall', 'with effect from'). Natural English — never a word-for-word calque.",
    "Rules:",
    "1. Translate every segment completely: no omissions, additions, explanations or translator notes.",
    "2. MNDA glossary terms below are mandatory whenever the concept appears (adapt only article, plural or construct state).",
    "3. Keep every number, percentage, measurement, reference number (MNDA/PBP/CIR/14/2026, MN-08-214-0007, MNDA-BP-2026-02217), standard (ISO 41001, ASTM C1549), email and phone exactly as in the source, in Western digits. Write dates naturally in the target language (15 July 2026 ↔ 15 يوليو 2026).",
    "4. Keep inline markdown such as **bold**. For headings and list items return only the text (no #, bullets or numbering — they are kept separately).",
    "5. A table row must stay a markdown row with exactly the same number of | cells in the same order; translate the cell text and keep codes and numbers.",
    "6. Glossary entries are in dictionary form: apply normal sentence casing (lower case mid-sentence unless a proper noun or title) and the right article/plural.",
    tgt === "en"
      ? "7. Arabic ordinal section markers become English ordinals with a colon: «أولاً: الخلفية» → 'First: Background', «ثانياً» → 'Second'; «البند (ثانياً)» → 'Section Two'; «المادة (3)» or «المادة الثالثة» → 'Article 3'."
      : "7. English section numbering stays numeric ('1. Scope' → «1. النطاق»); 'Article 3' → «المادة (3)»; 'Section 7' → «البند (7)».",
    "8. Return one translation for every id.",
    ENTITIES,
    `MNDA glossary for this passage (${LANG_NAME[src]} => ${LANG_NAME[tgt]}):\n${glossary}`,
  ].join("\n");
  const user = JSON.stringify({
    document: { title: src === "ar" ? doc.title_ar : doc.title, type: doc.type, ref: doc.ref },
    segments: batch.map((s) => ({ id: s.id, type: s.kind, text: s.source })),
  });
  const { object, model } = await generateObject({
    schema: translationSchema,
    name: "translations",
    system,
    user,
    modelKey,
    solution: SOLUTION,
    task: "translate.batch",
    maxTokens: 3800,
    temperature: 0.1,
  });
  return { map: new Map(object.translations.map((t) => [t.id, t.text.trim()])), model };
}

const candidateSchema = z.object({
  candidates: z
    .array(z.object({ term: z.string(), proposed: z.string(), domain: z.string(), rationale: z.string() }))
    .max(8),
});

async function detectCandidates(segments: Segment[], doc: QueueDoc, terms: Term[], found: Set<string>, modelKey: string | null, uiLang: Lang): Promise<Candidate[]> {
  const src = doc.source;
  const text = segments
    .filter((s) => s.kind !== "table-sep")
    .map((s) => s.source)
    .join("\n")
    .slice(0, 6500);
  const known = terms.filter((t) => found.has(t.id)).map((t) => (src === "ar" ? t.ar : t.en));
  const { object } = await generateObject({
    schema: candidateSchema,
    name: "term_candidates",
    system:
      `You are MNDA's terminologist. Find up to 6 domain-specific terms in the ${LANG_NAME[src]} text (planning, building code, engineering, legal, procurement, HR) that a translator must render consistently but that are NOT already in the glossary list given. ` +
      `Exclude names of people, companies, places and generic words. For each: the term exactly as written in the source, a proposed ${LANG_NAME[doc.target]} equivalent, a domain (Permits | Planning & building code | Facilities & engineering | Legal & governance | Procurement & contracts | Housing | Customer service | HR & administration) and a one-line rationale in ${uiLang === "ar" ? "Arabic" : "English"}.`,
    user: `Glossary terms already covered: ${known.join("; ") || "(none)"}\n\nText:\n${text}`,
    modelKey,
    solution: SOLUTION,
    task: "terms.detect",
    maxTokens: 900,
  });
  const norm = (s: string) => (src === "ar" ? normAr(s) : normEn(s));
  return object.candidates
    .filter((c) => c.term.trim() && !known.some((k) => norm(k) === norm(c.term)))
    .map((c) => ({
      ...c,
      segmentIds: segments.filter((s) => norm(s.source).includes(norm(c.term))).map((s) => s.id),
    }))
    .filter((c) => c.segmentIds.length > 0)
    .slice(0, 6);
}

const qaSchema = z.object({
  issues: z.array(
    z.object({
      id: z.string(),
      type: z.enum(["omission", "addition", "meaning", "terminology", "grammar"]),
      severity: z.enum(["high", "medium", "low"]),
      note: z.string(),
      suggestion: z.string().optional(),
    }),
  ),
});

async function modelReview(segments: Segment[], doc: QueueDoc, modelKey: string | null, uiLang: Lang) {
  const pairs = segments
    .filter((s) => s.kind !== "table-sep" && s.source.length > 3)
    .map((s) => ({ id: s.id, source: s.source, target: s.target }));
  const { object } = await generateObject({
    schema: qaSchema,
    name: "translation_review",
    system:
      `You are a senior bilingual reviewer (Arabic/English) at MNDA. Compare each ${LANG_NAME[doc.source]} source segment with its ${LANG_NAME[doc.target]} translation. ` +
      "Report ONLY real problems: content omitted or added; changed meaning (obligation shall/may, negation, quantities, deadlines, parties); wrong domain terminology; seriously ungrammatical target text. " +
      "Do not report numbers or reference formatting (checked by software) or style preferences. Most segments are fine — an empty list is a good answer. " +
      `Write each note in ${uiLang === "ar" ? "Arabic" : "English"} (max 25 words). Give 'suggestion' as the corrected full target segment only when the fix is clear.\n` +
      "Reference names (correct by definition — do not flag):\n" +
      ENTITIES,
    user: JSON.stringify(pairs),
    modelKey,
    solution: SOLUTION,
    task: "qa.review",
    maxTokens: 1800,
  });
  return object.issues.filter((i) => pairs.some((p) => p.id === i.id));
}

/** Full pipeline: segment → terminology → glossary-constrained translation → QA (code + model). */
export async function runPipeline(emit: Emitter, doc: QueueDoc, uiLang: Lang, modelKey: string | null): Promise<RunResult> {
  const ar = uiLang === "ar";
  const t0 = Date.now();
  const src = doc.source;
  const tgt = doc.target;
  const text = sourceText(doc);
  if (!text.trim()) throw new Error(ar ? "المستند لا يحتوي على نص" : "The document has no text");
  const terms = loadGlossary();
  const byId = new Map(terms.map((t) => [t.id, t]));

  // 1. Segment
  const s1 = emit.step("segment", ar ? "تقسيم المستند مع الحفاظ على البنية" : "Segmenting while preserving structure");
  const segments = segmentMarkdown(text);
  const trans = segments.filter((s) => s.kind !== "table-sep");
  const rows = segments.filter((s) => s.kind === "table-row" || s.kind === "table-head").length;
  const heads = segments.filter((s) => s.kind === "heading").length;
  emit.data("segments", segments);
  s1.done(ar ? `${trans.length} مقطعاً · ${heads} عناوين · ${rows} صفوف جداول` : `${trans.length} segments · ${heads} headings · ${rows} table rows`);

  // 2. Terminology (glossary matching in code)
  const s2 = emit.step("terms", ar ? "مطابقة مصطلحات مسرد الهيئة" : "Matching the MNDA glossary");
  for (const s of trans) s.terms = findTerms(s.source, src, terms);
  const found = new Set(trans.flatMap((s) => s.terms));
  const disputed = [...found].filter((id) => byId.get(id)?.status === "disputed");
  emit.data("segments", segments);
  s2.done(
    ar
      ? `${found.size} مصطلحاً من ${terms.length} في المسرد · ${disputed.length} خلافية`
      : `${found.size} of ${terms.length} glossary terms present · ${disputed.length} disputed`,
  );

  // 2b. New-term candidates (model) — runs alongside translation.
  const s2b = emit.step("candidates", ar ? "رصد مصطلحات متخصصة غير موجودة في المسرد" : "Detecting domain terms not yet in the glossary");
  const candP = detectCandidates(segments, doc, terms, found, modelKey, uiLang)
    .then((c) => {
      emit.data("candidates", c);
      s2b.done(ar ? `${c.length} مصطلحات مرشحة` : `${c.length} candidate term${c.length === 1 ? "" : "s"}`);
      return c;
    })
    .catch((e) => {
      s2b.error((e as Error).message);
      return [] as Candidate[];
    });

  // 3. Translation, batched in parallel, glossary-constrained
  const batches = batchesOf(trans);
  const s3 = emit.step(
    "translate",
    ar ? `الترجمة من ${src === "ar" ? "العربية" : "الإنجليزية"} إلى ${tgt === "ar" ? "العربية" : "الإنجليزية"} مقيدة بالمسرد` : `Translating ${LANG_NAME[src]} → ${LANG_NAME[tgt]} with glossary constraints`,
    ar ? `${batches.length} دفعات` : `${batches.length} batches`,
  );
  let doneCount = 0;
  let model = resolveModelId("main", modelKey);
  await pool(batches, 3, async (b) => {
    let res: Awaited<ReturnType<typeof translateBatch>>;
    try {
      res = await translateBatch(b, doc, byId, modelKey);
    } catch {
      res = await translateBatch(b, doc, byId, modelKey); // one retry
    }
    model = res.model;
    for (const s of b) s.target = res.map.get(s.id) ?? s.target;
    doneCount += b.length;
    s3.update(ar ? `${doneCount}/${trans.length} مقطعاً` : `${doneCount}/${trans.length} segments`);
    emit.data("segments", segments);
  });
  // Any segment the model skipped gets one individual retry.
  const missed = trans.filter((s) => !s.target.trim());
  for (const s of missed) {
    try {
      const r = await translateBatch([s], doc, byId, modelKey);
      s.target = r.map.get(s.id) ?? "";
    } catch {}
  }
  if (missed.length) emit.data("segments", segments);
  s3.done(ar ? `${trans.filter((s) => s.target).length}/${trans.length} مقطعاً مترجماً` : `${trans.filter((s) => s.target).length}/${trans.length} segments translated`);

  // 4. Deterministic QA
  const s4 = emit.step("qa", ar ? "فحص آلي: الأرقام والتواريخ والمراجع والجداول والمسرد" : "Automated checks: numbers, dates, references, tables, glossary");
  let occ = 0;
  let ok = 0;
  for (const s of trans) {
    const r = checkSegment(s, src, tgt, byId);
    s.flags = r.flags;
    occ += r.occ;
    ok += r.ok;
  }
  const codeFlags = trans.flatMap((s) => s.flags).filter((f) => f.severity !== "info");
  const count = (k: Flag["kind"]) => codeFlags.filter((f) => f.kind === k).length;
  emit.data("segments", segments);
  s4.done(
    ar
      ? `الالتزام بالمسرد ${occ ? Math.round((ok / occ) * 100) : 100}% · أرقام ${count("number")} · مراجع ${count("reference")} · جداول ${count("table")} · تواريخ ${count("date")}`
      : `Glossary compliance ${occ ? Math.round((ok / occ) * 100) : 100}% · number ${count("number")} · reference ${count("reference")} · table ${count("table")} · date ${count("date")}`,
  );

  // 5. Model review for omissions / additions / meaning
  const s5 = emit.step("review", ar ? "مراجعة ثنائية اللغة: الحذف والإضافة والمعنى" : "Bilingual review: omissions, additions, meaning");
  try {
    const issues = await modelReview(segments, doc, modelKey, uiLang);
    for (const i of issues) {
      const s = segments.find((x) => x.id === i.id);
      if (!s) continue;
      s.flags.push({ kind: i.type, severity: i.severity, by: "model", message: { en: i.note, ar: i.note }, suggestion: i.suggestion });
    }
    s5.done(ar ? `${issues.length} ملاحظات` : `${issues.length} issue${issues.length === 1 ? "" : "s"} found`);
  } catch (e) {
    s5.error((e as Error).message);
  }

  const candidates = await candP;
  const ms = Date.now() - t0;
  const result: RunResult = {
    docId: doc.id,
    source: src,
    target: tgt,
    segments,
    candidates,
    metrics: metricsOf(segments, src, occ, ok, ms),
    model,
    createdAt: new Date().toISOString(),
  };
  saveRun(result);
  patchRecord(DOCS, doc.id, { status: "in_review", translatedAt: result.createdAt, reviewedAt: null });
  addAudit({
    solution: SOLUTION,
    actor: { name: "NARVO Agent", role: "AI translation pipeline", kind: "agent" },
    action: "Translated with glossary",
    subject: `${doc.id} · ${doc.title}`,
    detail: `${result.metrics.segments} segments · compliance ${result.metrics.compliancePct ?? 100}% · ${result.metrics.flags} QA flags · ${(ms / 1000).toFixed(1)} s`,
    model,
  });
  emit.data("run", result);
  return result;
}
