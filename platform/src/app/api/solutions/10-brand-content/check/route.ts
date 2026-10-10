import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { addAudit } from "@/lib/store/db";
import { buildVerification, countWords, detectLang, inlineHashtags, runComputedChecks } from "@/app/solutions/10-brand-content/_lib/checks";
import { loadByo, loadChannels, loadFacts, loadRules, patchByo, saveByo } from "@/app/solutions/10-brand-content/_lib/data";
import { writeCopy } from "@/app/solutions/10-brand-content/_lib/ai";
import { verifyParts, type PipeCtx } from "@/app/solutions/10-brand-content/_lib/pipeline";
import { CHANNEL_ORDER, SLUG, type ByoCheck, type ChannelId } from "@/app/solutions/10-brand-content/_lib/types";

interface Body {
  text?: string;
  headline?: string | null;
  channel?: ChannelId;
  rewriteOf?: string;
}

/** Split trailing hashtag-only lines off the pasted copy. */
function parse(text: string) {
  const lines = text.replace(/\r/g, "").trim().split("\n");
  const tags: string[] = [];
  while (lines.length && /^\s*(#[\p{L}\p{N}_]+\s*)+$/u.test(lines[lines.length - 1])) tags.unshift(...inlineHashtags(lines.pop()!));
  return { body: lines.join("\n").trim(), hashtags: tags };
}

/** Bring-your-own copy: the same deterministic + model compliance check, and an optional compliant rewrite. */
export async function POST(req: Request) {
  const body = await readBody<Body>(req);
  const { modelKey, lang: ui } = getPrefs(req, body as Record<string, unknown>);
  const isAr = ui === "ar";

  if (body.rewriteOf) {
    const check = loadByo().find((c) => c.id === body.rewriteOf);
    if (!check) return Response.json({ error: `Check ${body.rewriteOf} not found` }, { status: 404 });
    return eventStream(
      req,
      async (emit) => {
        const facts = loadFacts();
        const rules = loadRules();
        const channel = loadChannels().find((c) => c.id === check.channel)!;
        const issues = check.verification.flags.map((f) => (f.match ? `"${f.match}": ` : "") + f.reason.en);
        const s1 = emit.step("rewrite", isAr ? "إعادة الصياغة وفق الحقائق المعتمدة" : "Rewriting compliantly from approved facts", isAr ? `${issues.length} مشكلة لمعالجتها` : `${issues.length} issue(s) to resolve`);
        const res = await writeCopy({
          channel,
          lang: check.lang,
          facts,
          rules,
          mode: { kind: "rewrite", original: { headline: check.headline, body: check.body, hashtags: check.hashtags }, issues },
          modelKey,
          signal: emit.signal,
        });
        s1.done(isAr ? `${countWords(res.draft.body)} كلمة · ${res.draft.factIds.length} حقيقة` : `${countWords(res.draft.body)} words · ${res.draft.factIds.length} facts`);
        const s2 = emit.step("recheck", isAr ? "إعادة الفحص الحتمي للنص الجديد" : "Deterministic re-check of the rewrite");
        const comp = runComputedChecks(res.draft, { channel, lang: check.lang, facts, rules });
        const verification = buildVerification(comp, null, { validFactIds: new Set(facts.map((f) => f.id)), model: res.model });
        s2.done(isAr ? `${comp.flags.length} مشكلة متبقية` : `${comp.flags.length} remaining issue(s)`);
        const rewrite = { ...res.draft, verification };
        patchByo(check.id, { rewrite });
        emit.data("rewrite", { checkId: check.id, ...rewrite });
        addAudit({
          solution: SLUG,
          actor: { name: "NARVO Content Agent", role: "AI rewrite", kind: "agent" },
          action: "Compliant rewrite drafted",
          subject: `${check.id} (${channel.name.en}, ${check.lang.toUpperCase()})`,
          detail: `${issues.length} issue(s) addressed; ${comp.flags.length} remaining after deterministic re-check`,
          model: res.model,
        });
      },
      { modelKey },
    );
  }

  const text = (body.text ?? "").trim();
  if (!text) return Response.json({ error: "Paste some copy to check" }, { status: 400 });
  if (text.length > 6000) return Response.json({ error: "Copy is too long (max 6,000 characters)" }, { status: 400 });
  const channelId = body.channel ?? "linkedin";
  if (!CHANNEL_ORDER.includes(channelId)) return Response.json({ error: `Unknown channel ${channelId}` }, { status: 400 });

  return eventStream(
    req,
    async (emit) => {
      const facts = loadFacts();
      const rules = loadRules();
      const channels = loadChannels();
      const channel = channels.find((c) => c.id === channelId)!;
      const { body: copy, hashtags } = parse(text);
      const lang = detectLang(copy);
      const headline = channel.headline && body.headline?.trim() ? body.headline.trim() : null;
      emit.step("read", isAr ? "قراءة النص وتقسيمه إلى جمل" : "Reading the copy and splitting sentences").done(
        isAr
          ? `${lang === "ar" ? "عربي" : "إنجليزي"} · ${countWords(copy)} كلمة · ${channel.name.ar}`
          : `${lang === "ar" ? "Arabic" : "English"} · ${countWords(copy)} words · ${channel.name.en}`,
      );
      const ctx: PipeCtx = { facts, rules, channels, uiLang: ui, modelKey, signal: emit.signal };
      const s2 = emit.step("computed", isAr ? "فحوص حتمية مقابل ورقة الحقائق وقواعد العلامة" : "Deterministic checks against fact sheet & brand rules");
      let s3: ReturnType<typeof emit.step> | null = null;
      const { verification } = await verifyParts({
        parts: { headline, body: copy, hashtags },
        channel,
        lang,
        ctx,
        onComputed: (i) => {
          s2.done(isAr ? `${i.flags} مشكلة حتمية` : `${i.flags} deterministic issue(s)`);
          s3 = emit.step("model", isAr ? "حكم النموذج على كل جملة" : "Model judgement per sentence", isAr ? `${i.toJudge} جملة` : `${i.toJudge} sentence(s)`);
        },
      });
      (s3 as ReturnType<typeof emit.step> | null)?.done(
        isAr
          ? `${verification.summary.supported}/${verification.summary.sentences} مدعومة · ${verification.flags.length} ملاحظة`
          : `${verification.summary.supported}/${verification.summary.sentences} supported · ${verification.flags.length} flag(s)`,
      );
      const check: ByoCheck = {
        id: `BYO-${Date.now().toString(36).toUpperCase()}`,
        at: new Date().toISOString(),
        channel: channel.id,
        lang,
        headline,
        body: copy,
        hashtags,
        verification,
        rewrite: null,
      };
      saveByo(check);
      emit.data("check", check);
      addAudit({
        solution: SLUG,
        actor: { name: "NARVO Content Agent", role: "AI verification", kind: "agent" },
        action: "Pasted copy checked",
        subject: `${check.id} (${channel.name.en}, ${lang.toUpperCase()})`,
        detail: `${verification.summary.sentences} sentences · ${verification.summary.computed} computed + ${verification.summary.model} model flags`,
        model: verification.model,
      });
    },
    { modelKey },
  );
}
