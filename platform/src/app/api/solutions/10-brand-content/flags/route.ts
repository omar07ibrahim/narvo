import { readBody } from "@/lib/ai/stream";
import { addAudit } from "@/lib/store/db";
import { deriveStatus } from "@/app/solutions/10-brand-content/_lib/checks";
import { getVariant, saveVariant } from "@/app/solutions/10-brand-content/_lib/data";
import { SLUG, type Variant } from "@/app/solutions/10-brand-content/_lib/types";

/**
 * Overrule a MODEL judgement with a reviewer note (audited). Computed failures cannot be dismissed —
 * they must be fixed in the copy.
 */
export async function POST(req: Request) {
  const body = await readBody<{ variantId?: string; key?: string; note?: string }>(req);
  if (!body.variantId || !body.key) return Response.json({ error: "variantId and key are required" }, { status: 400 });
  const v = getVariant(body.variantId);
  if (!v) return Response.json({ error: `Variant ${body.variantId} not found` }, { status: 404 });
  const flag = v.verification?.flags.find((f) => f.key === body.key);
  if (!flag) return Response.json({ error: "Flag not found on the current version" }, { status: 404 });
  if (flag.source !== "model") return Response.json({ error: "Deterministic flags cannot be dismissed — fix the copy instead" }, { status: 400 });
  const note = (body.note ?? "").trim().slice(0, 240) || "Reviewer judged the sentence compliant";
  const at = new Date().toISOString();
  const next: Variant = {
    ...v,
    dismissed: [...(v.dismissed ?? []), { key: flag.key, note, at }],
    flagStats: { raised: v.flagStats.raised, resolved: v.flagStats.resolved + 1, dismissed: v.flagStats.dismissed + 1 },
    flagLog: [{ key: flag.key, rule: flag.rule, label: flag.label, resolution: "dismissed" as const, at, note }, ...(v.flagLog ?? [])].slice(0, 60),
  };
  next.status = deriveStatus(next);
  saveVariant(next);
  addAudit({
    solution: SLUG,
    actor: { name: "Content reviewer", role: "Marketing & Brand", kind: "human" },
    action: "Model flag overruled",
    subject: `${v.id} v${v.version}`,
    detail: `${flag.label.en}: ${note}`,
  });
  return Response.json(next);
}
