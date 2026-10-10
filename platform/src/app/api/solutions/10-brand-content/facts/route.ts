import { readBody } from "@/lib/ai/stream";
import { addAudit, patchRecord } from "@/lib/store/db";
import { mentionsFactValue } from "@/app/solutions/10-brand-content/_lib/checks";
import { addChange, loadChanges, loadFacts, loadVariants, saveVariant } from "@/app/solutions/10-brand-content/_lib/data";
import { COL_FACTS, SLUG, type Fact, type FactChange, type Variant } from "@/app/solutions/10-brand-content/_lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ facts: loadFacts(), changes: loadChanges() });
}

interface Body {
  factId?: string;
  value?: string;
  valueAr?: string;
  numeric?: number | [number, number] | string | null;
  reason?: string;
  authorisedBy?: string;
}

function parseNumeric(input: Body["numeric"], prev: Fact["numeric"]): Fact["numeric"] | "invalid" {
  if (input == null || input === "") return prev;
  if (typeof input === "number") return Number.isFinite(input) ? input : "invalid";
  if (Array.isArray(input)) return input.length === 2 && input.every((n) => Number.isFinite(n)) ? [input[0], input[1]] : "invalid";
  const parts = String(input).split(/\s*[–-]\s*/).map(Number);
  if (parts.length === 1 && Number.isFinite(parts[0])) return parts[0];
  if (parts.length === 2 && parts.every(Number.isFinite)) return [parts[0], parts[1]];
  return "invalid";
}

/**
 * Spec change: create a new version of one fact, find every variant that uses the fact or still states the
 * old value, and mark those variants stale so only they are regenerated.
 */
export async function POST(req: Request) {
  const body = await readBody<Body>(req);
  if (!body.factId) return Response.json({ error: "factId is required" }, { status: 400 });
  const facts = loadFacts();
  const fact = facts.find((f) => f.id === body.factId);
  if (!fact) return Response.json({ error: `Fact ${body.factId} not found` }, { status: 404 });
  const value = (body.value ?? "").trim();
  const valueAr = (body.valueAr ?? "").trim();
  const reason = (body.reason ?? "").trim();
  if (!value || !valueAr) return Response.json({ error: "Both English and Arabic values are required" }, { status: 400 });
  if (!reason) return Response.json({ error: "A change reason is required" }, { status: 400 });
  const numeric = parseNumeric(body.numeric, fact.numeric);
  if (numeric === "invalid") return Response.json({ error: "Numeric value must be a number or a range like 1.2–1.5" }, { status: 400 });
  if (value === fact.value && valueAr === fact.valueAr && JSON.stringify(numeric) === JSON.stringify(fact.numeric)) {
    return Response.json({ error: "Nothing changed" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const authorisedBy = (body.authorisedBy ?? "").trim() || "Tariq Nasser";
  const history = [
    {
      version: fact.version,
      value: fact.value,
      valueAr: fact.valueAr,
      numeric: fact.numeric,
      approvedBy: fact.approvedBy,
      approvedOn: fact.approvedOn,
      changeReason: fact.changeReason,
    },
    ...(fact.history ?? []),
  ];
  const patch = { value, valueAr, numeric, version: fact.version + 1, approvedBy: authorisedBy, approvedOn: now.slice(0, 10), changeReason: reason, history };
  patchRecord(COL_FACTS, fact.id, patch);
  const updated: Fact = { ...fact, ...patch };

  // impact analysis — computed, not guessed
  const affected: FactChange["affected"] = [];
  for (const v of loadVariants()) {
    const reasons: string[] = [];
    const uses =
      v.factIds.includes(fact.id) || (v.verification?.results ?? []).some((r) => r.verdict === "supported" && r.factIds.includes(fact.id));
    if (uses) reasons.push(`uses ${fact.id}`);
    const said = mentionsFactValue({ headline: v.headline, body: v.body }, fact);
    if (said) reasons.push(`states "${said}"`);
    if (!reasons.length) continue;
    affected.push({ id: v.id, reasons });
    const next: Variant = {
      ...v,
      status: "stale",
      stale: { factId: fact.id, label: fact.label, from: fact.value, to: value, at: now, reasons },
    };
    saveVariant(next);
  }

  const change: FactChange = {
    id: `CHG-${Date.now().toString(36).toUpperCase()}`,
    factId: fact.id,
    label: fact.label,
    from: fact.value,
    to: value,
    fromAr: fact.valueAr,
    toAr: valueAr,
    version: updated.version,
    reason,
    authorisedBy,
    at: now,
    affected,
  };
  addChange(change);
  addAudit({
    solution: SLUG,
    actor: { name: authorisedBy, role: "Fact owner", kind: "human" },
    action: "Fact sheet updated",
    subject: `${fact.id} ${fact.label.en} → v${updated.version}`,
    detail: `"${fact.value}" → "${value}" (${reason}). ${affected.length} variant(s) marked stale: ${affected.map((a) => a.id).join(", ") || "none"}.`,
  });
  return Response.json({ fact: updated, change, affected });
}
