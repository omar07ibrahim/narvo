import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { addAudit } from "@/lib/store/db";
import { loadChannels, loadFacts, loadMeta, loadRules, loadVariants } from "@/app/solutions/10-brand-content/_lib/data";
import { cellLabel, pool, produceVariant, type PipeCtx } from "@/app/solutions/10-brand-content/_lib/pipeline";
import { CHANNEL_ORDER, LANGS, SLUG, cellId, type ChannelId, type Lang } from "@/app/solutions/10-brand-content/_lib/types";

interface Body {
  cells?: Array<{ channel: ChannelId; lang: Lang }>;
  scope?: "missing" | "stale";
  instruction?: string;
}

/** Generate / regenerate matrix cells (channel × language) from the approved fact sheet, with verification. */
export async function POST(req: Request) {
  const body = await readBody<Body>(req);
  const { modelKey, lang: uiLang } = getPrefs(req, body as Record<string, unknown>);
  const variants = loadVariants();

  let cells: Array<{ channel: ChannelId; lang: Lang }> = [];
  if (body.scope === "missing") {
    for (const ch of CHANNEL_ORDER) for (const l of LANGS) if (!variants.some((v) => v.id === cellId(ch, l))) cells.push({ channel: ch, lang: l });
  } else if (body.scope === "stale") {
    cells = variants.filter((v) => v.status === "stale").map((v) => ({ channel: v.channel, lang: v.lang }));
  } else {
    cells = Array.isArray(body.cells) ? body.cells : [];
  }
  if (!cells.length) return Response.json({ error: "No cells to generate" }, { status: 400 });
  if (cells.length > 12) return Response.json({ error: "At most 12 cells per run" }, { status: 400 });
  for (const c of cells) {
    if (!CHANNEL_ORDER.includes(c?.channel) || !LANGS.includes(c?.lang)) {
      return Response.json({ error: `Unknown cell ${JSON.stringify(c)}` }, { status: 400 });
    }
  }
  const instruction = typeof body.instruction === "string" && body.instruction.trim() ? body.instruction.trim().slice(0, 300) : null;

  return eventStream(
    req,
    async (emit) => {
      const facts = loadFacts();
      const rules = loadRules();
      const channels = loadChannels();
      const meta = loadMeta();
      const ctx: PipeCtx = { facts, rules, channels, uiLang, modelKey, signal: emit.signal };
      const changed = facts.filter((f) => f.version > 1).length;
      const s0 = emit.step("facts", uiLang === "ar" ? "تحميل ورقة الحقائق المعتمدة وقواعد العلامة" : "Loading approved fact sheet & brand rules");
      s0.done(
        uiLang === "ar"
          ? `${meta.id} · ${facts.length} حقيقة${changed ? ` (${changed} محدّثة)` : ""} · ${rules.patternRules.length} قاعدة نمطية · ${cells.length} خلية`
          : `${meta.id} · ${facts.length} facts${changed ? ` (${changed} updated)` : ""} · ${rules.patternRules.length} pattern rules · ${cells.length} cell(s)`,
      );
      emit.data("queue", cells.map((c) => cellId(c.channel, c.lang)));

      const results = await pool(cells, 4, async (c) => {
        const ch = channels.find((x) => x.id === c.channel)!;
        const id = cellId(c.channel, c.lang);
        const existing = loadVariants().find((v) => v.id === id);
        try {
          return await produceVariant({ id, channel: ch, lang: c.lang, existing, instruction, ctx, emit });
        } catch (e) {
          const msg = (e as Error).message;
          emit.step(`err:${id}`, uiLang === "ar" ? `تعذّر إنتاج ${cellLabel(ch, c.lang, uiLang)}` : `Could not produce ${cellLabel(ch, c.lang, uiLang)}`).error(msg.slice(0, 160));
          emit.data(`error:${id}`, msg);
          throw e;
        }
      });
      const ok = results.filter((r) => !(r instanceof Error));
      const failed = results.length - ok.length;
      if (ok.length) {
        addAudit({
          solution: SLUG,
          actor: { name: "NARVO Content Agent", role: "AI drafting & verification", kind: "agent" },
          action: instruction ? "Variant regenerated" : "Variants generated from fact sheet",
          subject: cells.map((c) => cellId(c.channel, c.lang)).join(", "),
          detail: `${ok.length} produced and verified against ${meta.id}${failed ? `; ${failed} failed` : ""}${instruction ? ` — instruction: "${instruction}"` : ""}`,
        });
      }
      emit.data("summary", { produced: ok.length, failed });
      if (!ok.length) throw new Error(uiLang === "ar" ? "لم يُنتج أي متغير" : "No variant could be produced");
    },
    { modelKey },
  );
}
