import "server-only";
import { readJson } from "@/lib/world/data";
import { appendRecord, kvGet, kvSet, listApprovals, patchRecord, withOverlay } from "@/lib/store/db";
import { buildVerification, deriveStatus, runComputedChecks } from "./checks";
import {
  COL_BYO,
  COL_FACTS,
  COL_VARIANTS,
  KV_CHANGES,
  SLUG,
  type Asset,
  type BrandRules,
  type BrandState,
  type ByoCheck,
  type Channel,
  type ChannelId,
  type Fact,
  type FactChange,
  type FactSheetMeta,
  type ReleaseApprovalInfo,
  type Variant,
} from "./types";

const DIR = "raseen/10-brand-content";

interface MasterProduct {
  sku: string;
  listPrice: number;
}

interface RawSheet extends FactSheetMeta {
  facts: Array<Fact & { masterRef?: { sku: string; field: string } }>;
}

/** Fact sheet seed — the price fact is filled from the Raseen master data (single source of truth). */
function seedFacts(): { meta: FactSheetMeta; facts: Fact[] } {
  const raw = readJson<RawSheet>(`${DIR}/fact-sheet.json`);
  const master = readJson<{ products: MasterProduct[] }>("raseen/knowledge/reference/raseen-master.json");
  const facts = raw.facts.map((f) => {
    if (!f.masterRef) return f as Fact;
    const p = master.products.find((x) => x.sku === f.masterRef!.sku);
    const price = p ? Number((p as unknown as Record<string, number>)[f.masterRef.field]) : NaN;
    const shown = Number.isInteger(price) ? String(price) : price.toFixed(2);
    const { masterRef: _m, ...rest } = f;
    void _m;
    return { ...rest, numeric: price, value: f.value.replace("{price}", shown), valueAr: f.valueAr.replace("{price}", shown) } as Fact;
  });
  const { facts: _f, ...meta } = raw;
  void _f;
  return { meta, facts };
}

export function loadMeta(): FactSheetMeta {
  return seedFacts().meta;
}

export function loadFacts(): Fact[] {
  return withOverlay(COL_FACTS, seedFacts().facts);
}

export function loadChannels(): Channel[] {
  return readJson<Channel[]>(`${DIR}/channels.json`);
}

export function loadRules(): BrandRules {
  return readJson<BrandRules>(`${DIR}/brand-rules.json`);
}

export function loadAssets(): Asset[] {
  return readJson<Asset[]>(`${DIR}/assets.json`);
}

export function getChannel(id: ChannelId) {
  return loadChannels().find((c) => c.id === id);
}

function releaseApprovals(): ReleaseApprovalInfo[] {
  return listApprovals({ solution: SLUG })
    .filter((a) => (a.payload as { kind?: string } | undefined)?.kind === "release")
    .map((a) => {
      const p = a.payload as { releaseId: string; variantIds: string[] };
      return {
        id: a.id,
        releaseId: p.releaseId,
        title: a.title,
        summary: a.summary,
        solution: a.solution,
        actionLabel: a.actionLabel,
        approver: a.approver,
        status: a.status,
        createdAt: a.createdAt,
        decidedAt: a.decidedAt,
        variantIds: p.variantIds,
      };
    });
}

/**
 * Variants = legacy seed + generated (appended) records with runtime patches. Legacy drafts that were never
 * verified get a deterministic (computed-only) verification on load, so their flags show immediately.
 */
export function loadVariants(): Variant[] {
  const seed = readJson<Variant[]>(`${DIR}/legacy-variants.json`);
  const all = withOverlay<Variant>(COL_VARIANTS, seed);
  const facts = loadFacts();
  const channels = loadChannels();
  const rules = loadRules();
  const valid = new Set(facts.map((f) => f.id));
  const releases = releaseApprovals();
  return all.map((v) => {
    let out: Variant = { ...v, history: v.history ?? [], flagStats: v.flagStats ?? { raised: 0, resolved: 0, dismissed: 0 } };
    if (!out.verification) {
      const ch = channels.find((c) => c.id === v.channel)!;
      const computed = runComputedChecks({ headline: v.headline, body: v.body, hashtags: v.hashtags }, { channel: ch, lang: v.lang, facts, rules });
      const verification = buildVerification(computed, null, { validFactIds: valid, dismissed: (v.dismissed ?? []).map((d) => d.key) });
      out = { ...out, verification, flagStats: { ...out.flagStats, raised: Math.max(out.flagStats.raised, verification.flags.length) } };
    }
    if (out.releaseId) {
      const r = releases.find((x) => x.releaseId === out.releaseId);
      if (r?.status === "approved" && out.status === "released") {
        out.releasedAt = r.decidedAt ? new Date(r.decidedAt).toISOString() : out.releasedAt ?? null;
        out.releasedBy = r.approver.name;
      }
    }
    out.status = deriveStatus(out);
    return out;
  });
}

export function getVariant(id: string): Variant | undefined {
  return loadVariants().find((v) => v.id === id);
}

/** Persist a variant: patch an existing (seed or appended) record, or append a new one. */
export function saveVariant(v: Variant) {
  const exists = withOverlay<Variant>(COL_VARIANTS, readJson<Variant[]>(`${DIR}/legacy-variants.json`)).some((x) => x.id === v.id);
  const { id, ...fields } = v;
  if (exists) patchRecord(COL_VARIANTS, id, fields as Record<string, unknown>);
  else appendRecord(COL_VARIANTS, { id, ...(fields as Record<string, unknown>) });
}

export function loadChanges(): FactChange[] {
  return kvGet<FactChange[]>(KV_CHANGES) ?? [];
}

export function addChange(c: FactChange) {
  kvSet(KV_CHANGES, [c, ...loadChanges()].slice(0, 50));
}

export function loadByo(): ByoCheck[] {
  return withOverlay<ByoCheck>(COL_BYO, []).slice(0, 12);
}

export function saveByo(c: ByoCheck) {
  appendRecord(COL_BYO, c as unknown as Record<string, unknown> & { id: string });
}

export function patchByo(id: string, patch: Partial<ByoCheck>) {
  patchRecord(COL_BYO, id, patch as Record<string, unknown>);
}

export function loadState(): BrandState {
  return {
    meta: loadMeta(),
    facts: loadFacts(),
    channels: loadChannels(),
    rules: loadRules(),
    assets: loadAssets(),
    variants: loadVariants(),
    changes: loadChanges(),
    byo: loadByo(),
    releases: releaseApprovals(),
  };
}

export function factVersionMap(facts: Fact[]) {
  return Object.fromEntries(facts.map((f) => [f.id, f.version]));
}
