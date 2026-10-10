import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { addAudit } from "@/lib/store/db";
import { applyOps, deriveStatus, inlineHashtags, updateStats, type FixOp } from "@/app/solutions/10-brand-content/_lib/checks";
import { getVariant, loadChannels, loadFacts, loadRules, saveVariant } from "@/app/solutions/10-brand-content/_lib/data";
import { commitVersion, verifyParts, type PipeCtx } from "@/app/solutions/10-brand-content/_lib/pipeline";
import { SLUG } from "@/app/solutions/10-brand-content/_lib/types";

interface Body {
  variantId?: string;
  edit?: { headline?: string | null; body?: string; hashtags?: string[] | string };
  ops?: FixOp[];
}

const REVIEWER = { name: "Content reviewer", role: "Marketing & Brand", kind: "human" as const };

/**
 * Verify a variant (on demand), or apply an edit / suggested fixes as a new version and re-verify it.
 * Deterministic checks always run in full; the model re-judges only sentences whose text changed.
 */
export async function POST(req: Request) {
  const body = await readBody<Body>(req);
  const { modelKey, lang: ui } = getPrefs(req, body as Record<string, unknown>);
  if (!body.variantId) return Response.json({ error: "variantId is required" }, { status: 400 });
  const existing = getVariant(body.variantId);
  if (!existing) return Response.json({ error: `Variant ${body.variantId} not found` }, { status: 404 });
  if (body.edit && (typeof body.edit.body !== "string" || !body.edit.body.trim())) {
    return Response.json({ error: "Edited body is empty" }, { status: 400 });
  }
  if (body.ops && (!Array.isArray(body.ops) || body.ops.some((o) => !o || !["replace", "hashtags", "stripExclamations", "stripEmoji"].includes(o.type)))) {
    return Response.json({ error: "Invalid fix operations" }, { status: 400 });
  }

  return eventStream(
    req,
    async (emit) => {
      const facts = loadFacts();
      const rules = loadRules();
      const channels = loadChannels();
      const channel = channels.find((c) => c.id === existing.channel)!;
      const ctx: PipeCtx = { facts, rules, channels, uiLang: ui, modelKey, signal: emit.signal };
      const isAr = ui === "ar";

      // 1 — new content (edit or fixes) or the current text
      let parts = { headline: existing.headline, body: existing.body, hashtags: existing.hashtags };
      let action: "verify" | "edit" | "fix" = "verify";
      if (body.edit) {
        const tags = Array.isArray(body.edit.hashtags) ? body.edit.hashtags : inlineHashtags(String(body.edit.hashtags ?? ""));
        parts = {
          headline: channel.headline ? (body.edit.headline ?? "").trim() || null : null,
          body: body.edit.body!.replace(/\r/g, "").trim(),
          hashtags: channel.hashtags ? tags : [],
        };
        action = "edit";
        emit.step("apply", isAr ? "حفظ التعديل كإصدار جديد" : "Saving the edit as a new version").done(`v${existing.version} → v${existing.version + 1}`);
      } else if (body.ops?.length) {
        parts = applyOps(parts, body.ops);
        action = "fix";
        const n = body.ops.length;
        emit.step("apply", isAr ? "تطبيق الإصلاحات المقترحة" : "Applying suggested fixes").done(
          isAr ? `${n} إصلاح · v${existing.version} → v${existing.version + 1}` : `${n} fix(es) · v${existing.version} → v${existing.version + 1}`,
        );
      }

      // 2 — deterministic + model verification
      const s2 = emit.step(
        "computed",
        isAr ? "فحوص حتمية — الأرقام والشروط والادعاءات المحظورة وحدود القناة" : "Deterministic checks — numbers, qualifiers, forbidden claims, channel limits",
      );
      let s3: ReturnType<typeof emit.step> | null = null;
      const result = await verifyParts({
        parts,
        channel,
        lang: existing.lang,
        ctx,
        previous: action === "verify" ? null : existing.verification,
        dismissed: (existing.dismissed ?? []).map((d) => d.key),
        onComputed: (info) => {
          s2.done(isAr ? `${info.flags} مشكلة حتمية في ${info.segments} مقطع` : `${info.flags} deterministic issue(s) across ${info.segments} segments`);
          s3 = emit.step("model", isAr ? "حكم النموذج على كل جملة مقابل الحقائق" : "Model judgement per sentence against the facts");
        },
      }).catch((e) => {
        const msg = (e as Error).message.slice(0, 160);
        if (s3) (s3 as ReturnType<typeof emit.step>).error(msg);
        else s2.error(msg);
        throw e;
      });
      (s3 as ReturnType<typeof emit.step> | null)?.done(
        result.judgedCount
          ? isAr
            ? `${result.judgedCount} جملة قُيّمت${result.reusedCount ? ` · ${result.reusedCount} دون تغيير` : ""}`
            : `${result.judgedCount} sentence(s) judged${result.reusedCount ? ` · ${result.reusedCount} unchanged, reused` : ""}`
          : isAr
            ? `لم تتغير أي جملة — أُعيد استخدام ${result.reusedCount} حكماً`
            : `No sentence changed — reused ${result.reusedCount} judgement(s)`,
      );
      const verification = result.verification;

      // 3 — persist
      let v;
      if (action === "verify") {
        const stats = updateStats(existing, existing.verification?.flags, verification.flags, "fix");
        v = {
          ...existing,
          verification,
          flagStats: { ...existing.flagStats, raised: stats.flagStats.raised, resolved: stats.flagStats.resolved },
          flagLog: stats.flagLog,
        };
        v.status = deriveStatus(v);
        saveVariant(v);
      } else {
        v = commitVersion({
          existing,
          id: existing.id,
          channel,
          lang: existing.lang,
          draft: { ...parts, cta: existing.cta, factIds: existing.factIds },
          verification,
          facts,
          origin: "edited",
          author: action === "edit" ? REVIEWER : { ...REVIEWER, name: "Content reviewer (applied fix)" },
          instruction: action === "edit" ? "Edited by reviewer" : `Applied ${body.ops!.length} suggested fix(es)`,
          resolution: action,
          model: verification.model ?? existing.model,
        });
      }
      const open = verification.flags.length;
      emit.step("save", isAr ? "حفظ نتيجة التحقق" : "Saving verification").done(
        isAr ? `${v.id} v${v.version} · ${open ? `${open} ملاحظة مفتوحة` : "لا ملاحظات مفتوحة"}` : `${v.id} v${v.version} · ${open ? `${open} open flag(s)` : "no open flags"}`,
      );
      addAudit({
        solution: SLUG,
        actor: action === "verify" ? { name: "NARVO Content Agent", role: "AI verification", kind: "agent" } : REVIEWER,
        action: action === "verify" ? "Claims verified" : action === "edit" ? "Variant edited and re-verified" : "Suggested fix applied",
        subject: `${v.id} v${v.version}`,
        detail: `${verification.summary.sentences} sentences · ${verification.summary.computed} computed + ${verification.summary.model} model flags`,
        model: verification.model,
      });
      emit.data("variant", v);
    },
    { modelKey },
  );
}
