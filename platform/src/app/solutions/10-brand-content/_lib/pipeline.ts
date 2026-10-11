import "server-only";
import type { Emitter } from "@/lib/ai/stream";
import { buildVerification, countWords, deriveStatus, runComputedChecks, updateStats, type ModelJudgement } from "./checks";
import { judgeSentences, writeCopy, type CopyDraft, type GenMode } from "./ai";
import { factVersionMap, saveVariant } from "./data";
import type { BrandRules, Channel, Fact, Lang, Segment, Variant, Verification, VariantVersion } from "./types";

export interface PipeCtx {
  facts: Fact[];
  rules: BrandRules;
  channels: Channel[];
  uiLang: Lang;
  modelKey?: string | null;
  signal?: AbortSignal;
}

const AGENT = { name: "NARVO Content Agent", role: "AI drafting & verification", kind: "agent" as const };
const L = (lang: Lang, en: string, ar: string) => (lang === "ar" ? ar : en);

export function cellLabel(ch: Channel, lang: Lang, ui: Lang) {
  return `${ui === "ar" ? ch.short.ar : ch.short.en} · ${lang.toUpperCase()}`;
}

/**
 * Computed checks + model judgement. When `previous` is given, sentences whose text did not change keep their
 * earlier model judgement (no second model call for unchanged text) unless they now carry computed failures
 * without a suggested fix.
 */
export async function verifyParts(o: {
  parts: { headline: string | null; body: string; hashtags: string[] };
  channel: Channel;
  lang: Lang;
  ctx: PipeCtx;
  previous?: Verification | null;
  dismissed?: string[];
  /** called after the deterministic pass, before the model is asked (for an honest trace) */
  onComputed?: (info: { flags: number; segments: number; toJudge: number; reused: number }) => void;
}) {
  const { parts, channel, lang, ctx } = o;
  const computed = runComputedChecks(parts, { channel, lang, facts: ctx.facts, rules: ctx.rules });
  const textSegs = computed.segments.filter((s) => s.part !== "hashtags");
  const prevBy = new Map<string, Omit<ModelJudgement, "segmentId">>();
  if (o.previous?.mode === "full") {
    for (const r of o.previous.results) {
      const seg = o.previous.segments.find((s) => s.id === r.segmentId);
      if (seg && r.modelVerdict && r.modelVerdict !== "pending")
        prevBy.set(seg.text, { verdict: r.modelVerdict, reason: r.reason ?? "", factIds: r.factIds, fix: r.fix ?? null });
    }
  }
  const reused: ModelJudgement[] = [];
  const toJudge: Segment[] = [];
  for (const s of textSegs) {
    const p = prevBy.get(s.text);
    const needsFix = computed.flags.some((f) => f.segmentId === s.id && !f.fix) && !p?.fix;
    if (p && !needsFix) reused.push({ segmentId: s.id, ...p });
    else toJudge.push(s);
  }
  o.onComputed?.({ flags: computed.flags.length, segments: computed.segments.length, toJudge: toJudge.length, reused: reused.length });
  let judged: ModelJudgement[] = [];
  let model = o.previous?.model;
  if (toJudge.length) {
    const r = await judgeSentences({
      segments: toJudge,
      computedFlags: computed.flags,
      channel,
      lang,
      uiLang: ctx.uiLang,
      facts: ctx.facts,
      rules: ctx.rules,
      modelKey: ctx.modelKey,
      signal: ctx.signal,
    });
    judged = r.judgements;
    model = r.model;
  }
  const verification = buildVerification(computed, [...reused, ...judged], {
    dismissed: o.dismissed,
    model,
    validFactIds: new Set(ctx.facts.map((f) => f.id)),
  });
  return { verification, computed, judgedCount: toJudge.length, reusedCount: reused.length };
}

function snapshot(v: Variant, reason: string): VariantVersion {
  return {
    version: v.version,
    headline: v.headline,
    body: v.body,
    hashtags: v.hashtags,
    cta: v.cta,
    factIds: v.factIds,
    at: v.updatedAt,
    by: v.author.name,
    reason,
  };
}

export function versionReason(v: Variant) {
  if (v.origin === "legacy") return `Legacy draft — ${v.author.name}`;
  if (v.instruction) return v.instruction;
  return v.origin === "edited" ? "Edited by reviewer" : "Generated from fact sheet";
}

/** Persist a new version of a variant (keeps the previous body in history for diffs). */
export function commitVersion(o: {
  existing: Variant | undefined;
  id: string;
  channel: Channel;
  lang: Lang;
  draft: CopyDraft;
  verification: Verification;
  facts: Fact[];
  origin: Variant["origin"];
  author: Variant["author"];
  instruction: string | null;
  resolution: "regenerate" | "update" | "fix" | "edit";
  model?: string | null;
}): Variant {
  const now = new Date().toISOString();
  const ex = o.existing;
  const base = ex ?? ({ flagStats: { raised: 0, resolved: 0, dismissed: 0 }, flagLog: [] } as unknown as Variant);
  const stats = updateStats(base, ex?.verification?.flags.filter((f) => !(ex.dismissed ?? []).some((d) => d.key === f.key)), o.verification.flags, o.resolution);
  const generated = o.origin === "generated";
  const v: Variant = {
    id: o.id,
    channel: o.channel.id,
    lang: o.lang,
    headline: o.draft.headline,
    body: o.draft.body,
    hashtags: o.draft.hashtags,
    cta: o.draft.cta,
    factIds: o.draft.factIds,
    version: (ex?.version ?? 0) + 1,
    status: "draft",
    origin: o.origin,
    author: o.author,
    assetId: ex?.assetId,
    createdAt: ex?.createdAt ?? now,
    updatedAt: now,
    generatedAt: generated ? now : ex?.generatedAt ?? null,
    firstGeneratedAt: ex?.firstGeneratedAt ?? (generated ? now : null),
    note: ex?.note,
    instruction: o.instruction,
    factVersions: factVersionMap(o.facts),
    history: ex ? [snapshot(ex, versionReason(ex)), ...(ex.history ?? [])].slice(0, 12) : [],
    verification: o.verification,
    flagStats: stats.flagStats,
    flagLog: stats.flagLog,
    dismissed: o.resolution === "fix" ? ex?.dismissed ?? [] : [],
    stale: null,
    releaseId: ex?.releaseId ?? null,
    releaseApprovalId: ex?.releaseApprovalId ?? null,
    releaseRequestedAt: ex?.releaseRequestedAt ?? null,
    releasedVersion: ex?.releasedVersion ?? null,
    releasedAt: ex?.releasedAt ?? null,
    releasedBy: ex?.releasedBy ?? null,
    model: o.model ?? ex?.model ?? null,
  };
  v.status = deriveStatus(v);
  saveVariant(v);
  return v;
}

/**
 * Generate (or regenerate / update) one matrix cell from the approved facts:
 * draft → deterministic checks → one repair round if needed → sentence-level verification → persist.
 */
export async function produceVariant(o: {
  id: string;
  channel: Channel;
  lang: Lang;
  existing?: Variant;
  instruction?: string | null;
  ctx: PipeCtx;
  emit: Emitter;
}): Promise<Variant> {
  const { id, channel, lang, existing, ctx, emit } = o;
  const ui = ctx.uiLang;
  const label = cellLabel(channel, lang, ui);

  let mode: GenMode = { kind: "fresh" };
  if (existing?.stale && !o.instruction && existing.origin !== "legacy") {
    const f = ctx.facts.find((x) => x.id === existing.stale!.factId);
    mode = {
      kind: "update",
      previous: existing,
      change: { factId: existing.stale.factId, label: existing.stale.label.en, from: existing.stale.from, to: f?.value ?? existing.stale.to },
    };
  } else if (existing && o.instruction && existing.origin !== "legacy") {
    mode = { kind: "revise", previous: existing, instruction: o.instruction };
  }

  const modeLabel =
    mode.kind === "update"
      ? L(ui, `Updating ${label} for the new fact`, `تحديث ${label} وفق الحقيقة الجديدة`)
      : mode.kind === "revise"
        ? L(ui, `Rewriting ${label} — "${o.instruction}"`, `إعادة كتابة ${label} — "${o.instruction}"`)
        : L(ui, `Writing ${label} from approved facts`, `كتابة ${label} من الحقائق المعتمدة`);
  const sGen = emit.step(`gen:${id}`, modeLabel);
  let res = await writeCopy({ channel, lang, facts: ctx.facts, rules: ctx.rules, mode, modelKey: ctx.modelKey, signal: ctx.signal });
  // A truncated answer (e.g. an email that stops after "Dear {{FirstName}},") is never kept: write it again once.
  const tooShort = (d: CopyDraft) => countWords(d.body) < Math.max(6, Math.round(channel.words[0] * 0.5));
  if (tooShort(res.draft)) {
    sGen.update(L(ui, "Draft came back truncated → writing it again", "عادت المسودة مبتورة ← إعادة الكتابة"));
    const again = await writeCopy({ channel, lang, facts: ctx.facts, rules: ctx.rules, mode, modelKey: ctx.modelKey, signal: ctx.signal });
    if (!tooShort(again.draft)) res = again;
  }
  let draft = res.draft;
  let comp = runComputedChecks(draft, { channel, lang, facts: ctx.facts, rules: ctx.rules });
  let revised = false;
  if (comp.flags.length) {
    sGen.update(
      L(ui, `${comp.flags.length} deterministic issue(s): ${comp.flags.slice(0, 3).map((f) => f.label.en).join(", ")} → revising once`, `${comp.flags.length} مشكلة حتمية: ${comp.flags.slice(0, 3).map((f) => f.label.ar).join("، ")} ← مراجعة واحدة`),
    );
    const r2 = await writeCopy({
      channel,
      lang,
      facts: ctx.facts,
      rules: ctx.rules,
      mode: { kind: "repair", draft, issues: comp.flags.map((f) => f.reason.en) },
      modelKey: ctx.modelKey,
      signal: ctx.signal,
    });
    const comp2 = runComputedChecks(r2.draft, { channel, lang, facts: ctx.facts, rules: ctx.rules });
    const score = (fs: typeof comp.flags) => fs.reduce((a, f) => a + (f.severity === "critical" ? 9 : f.severity === "major" ? 3 : 1), 0);
    // Never trade a complete draft for a truncated "repair".
    if (!tooShort(r2.draft) && (tooShort(draft) || score(comp2.flags) <= score(comp.flags))) {
      draft = r2.draft;
      comp = comp2;
      res = r2;
      revised = true;
    }
  }
  sGen.done(
    L(
      ui,
      `${countWords(draft.body)} words · ${draft.factIds.length} facts${draft.headline ? ` · ${channel.headline?.label.en.toLowerCase()} ${draft.headline.length} chars` : ""}${revised ? " · revised once" : ""}`,
      `${countWords(draft.body)} كلمة · ${draft.factIds.length} حقيقة${draft.headline ? ` · ${channel.headline?.label.ar} ${draft.headline.length} حرفاً` : ""}${revised ? " · روجعت مرة" : ""}`,
    ),
  );

  const sVer = emit.step(`vfy:${id}`, L(ui, `Verifying ${label} sentence by sentence`, `التحقق من ${label} جملةً جملة`));
  const { verification } = await verifyParts({ parts: draft, channel, lang, ctx });
  const open = verification.flags.length;
  sVer.done(
    L(
      ui,
      `${verification.summary.sentences} sentences · ${verification.summary.supported} supported · ${open ? `${open} flag(s)` : "no flags"}`,
      `${verification.summary.sentences} جمل · ${verification.summary.supported} مدعومة · ${open ? `${open} ملاحظة` : "بلا ملاحظات"}`,
    ),
  );

  const v = commitVersion({
    existing,
    id,
    channel,
    lang,
    draft,
    verification,
    facts: ctx.facts,
    origin: "generated",
    author: AGENT,
    instruction: mode.kind === "update" ? `Fact change ${mode.change.factId}: ${mode.change.from} → ${mode.change.to}` : o.instruction ?? null,
    resolution: mode.kind === "update" ? "update" : "regenerate",
    model: res.model,
  });
  emit.data(`variant:${id}`, v);
  return v;
}

/** Run async jobs with a small concurrency limit. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<Array<R | Error>> {
  const out: Array<R | Error> = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try {
        out[idx] = await fn(items[idx]);
      } catch (e) {
        out[idx] = e instanceof Error ? e : new Error(String(e));
      }
    }
  });
  await Promise.all(workers);
  return out;
}
