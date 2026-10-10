import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { chatStream } from "@/lib/ai/client";
import { addAudit, kvGet, kvSet } from "@/lib/store/db";
import { buildReviewContext, KV_BRIEFING, sourcesPrompt, traceNumbers } from "@/app/solutions/02-decision-intelligence/_lib/context";
import { briefingSystem } from "@/app/solutions/02-decision-intelligence/_lib/prompts";
import { SLUG } from "@/app/solutions/02-decision-intelligence/_lib/data";
import type { Dept } from "@/app/solutions/02-decision-intelligence/_lib/catalogue";
import type { Citation } from "@/lib/ai/events";

export interface SavedBriefing {
  text: string;
  citations: Citation[];
  verification: ReturnType<typeof traceNumbers>;
  lang: "en" | "ar";
  dept: string;
  ms: number;
  at: number;
  model?: string;
  counts: { facts: number; updates: number; actions: number };
}

export async function GET() {
  return Response.json({ briefing: kvGet<SavedBriefing>(KV_BRIEFING) ?? null });
}

export async function POST(req: Request) {
  const body = await readBody<{ dept?: Dept | "all" }>(req);
  const { modelKey, lang } = getPrefs(req, body);
  const ar = lang === "ar";
  return eventStream(
    req,
    async (emit) => {
      const started = Date.now();
      const s1 = emit.step("compute", ar ? "احتساب بطاقة الأداء للأسبوع 41" : "Computing the week-41 scorecard");
      const ctx = buildReviewContext({ dept: body.dept ?? "all" });
      const red = ctx.facts.filter((f) => f.kind !== "month" && f.kind !== "quarter" && f.rag === "red").length;
      s1.done(ar ? `${ctx.facts.length} حقيقة محسوبة · ${red} مؤشرات حمراء` : `${ctx.facts.length} computed facts · ${red} KPIs red this week`);

      const s2 = emit.step("changes", ar ? "رصد التغيرات مقارنة بالأسابيع الثمانية السابقة" : "Detecting changes vs the previous 8 weeks");
      const top = ctx.facts.filter((f) => f.signal >= 2).map((f) => f.title);
      emit.data("changes", ctx.facts.slice(0, 12).map((f) => ({ id: f.id, metricId: f.metricId, title: f.title, signal: Number(f.signal.toFixed(2)), rag: f.rag, change: f.change })));
      s2.done(ar ? `${top.length} تغيرات جوهرية` : `${top.length} material movements flagged`);

      const s3 = emit.step("updates", ar ? "قراءة تحديثات الإدارات (الأسبوعان 40 و41)" : "Reading department updates (weeks 40–41)");
      s3.done(ar ? `${ctx.updates.length} تحديثات من ${new Set(ctx.updates.map((u) => u.dept)).size} إدارات` : `${ctx.updates.length} updates from ${new Set(ctx.updates.map((u) => u.dept)).size} departments`);

      const s4 = emit.step("actions", ar ? "مراجعة سجل الإجراءات المفتوحة" : "Bringing open actions forward");
      s4.done(
        ar
          ? `${ctx.stats.overdue} متأخرة · ${ctx.stats.dueSoon} مستحقة هذا الأسبوع · نسبة الإغلاق ${ctx.stats.closureRate?.toFixed(1)}%`
          : `${ctx.stats.overdue} overdue · ${ctx.stats.dueSoon} due this week · closure ${ctx.stats.closureRate?.toFixed(1)}%`,
      );
      if (ctx.figureCheck) {
        const s = emit.step("figcheck", ar ? "إدراج نتائج فحص اتساق الأرقام" : "Including figure-consistency findings");
        s.done(ar ? `${ctx.figureCheck.discrepancies} اختلافات` : `${ctx.figureCheck.discrepancies} discrepancies carried into the briefing`);
      }

      const citations = ctx.blocks.map((b) => b.citation);
      emit.data("citations", citations);

      const s5 = emit.step("draft", ar ? "صياغة الإحاطة مع توثيق كل رقم" : "Drafting the briefing — every figure cited");
      const gen = chatStream({
        messages: [
          { role: "system", content: briefingSystem(lang) },
          {
            role: "user",
            content: `Numbered sources:\n\n${sourcesPrompt(ctx.blocks)}\n\n---\n\nWrite the week-41 review briefing for H.E. the Director General${body.dept && body.dept !== "all" ? ` focused on the ${body.dept} department` : ""}.`,
          },
        ],
        modelKey,
        temperature: 0.2,
        maxTokens: 1500,
        solution: SLUG,
        task: "briefing",
        signal: emit.signal,
      });
      let text = "";
      let model: string | undefined;
      for (let n = await gen.next(); ; n = await gen.next()) {
        if (n.done) {
          model = n.value.model;
          break;
        }
        if (n.value.content) {
          text += n.value.content;
          emit.text(n.value.content, "briefing");
        }
      }
      if (!text.trim()) throw new Error(ar ? "لم يُرجع النموذج أي نص" : "The model returned an empty briefing");
      const cited = new Set(Array.from(text.matchAll(/\[(\d+)\]/g)).map((m) => Number(m[1])));
      s5.done(ar ? `${cited.size} مصدراً مستشهداً به` : `${cited.size} sources cited`);

      const s6 = emit.step("verify", ar ? "التحقق من تتبع كل رقم إلى مصدره" : "Verifying every figure traces to a source");
      const verification = traceNumbers(text, ctx.blocks);
      emit.data("verification", verification);
      s6.done(
        verification.untraced.length
          ? ar
            ? `${verification.total - verification.untraced.length} من ${verification.total} أرقام موثقة · غير موثق: ${verification.untraced.join("، ")}`
            : `${verification.total - verification.untraced.length} of ${verification.total} figures traced · untraced: ${verification.untraced.join(", ")}`
          : ar
            ? `جميع الأرقام (${verification.total}) موثقة بمصادرها`
            : `All ${verification.total} figures traced to sources`,
      );

      const ms = Date.now() - started;
      const saved: SavedBriefing = {
        text,
        citations,
        verification,
        lang,
        dept: body.dept ?? "all",
        ms,
        at: Date.now(),
        model,
        counts: { facts: ctx.facts.length, updates: ctx.updates.length, actions: ctx.stats.open },
      };
      kvSet(KV_BRIEFING, saved);
      emit.data("saved", { ms, at: saved.at });
      addAudit({
        solution: SLUG,
        actor: { name: "NARVO Agent", role: "AI briefing analyst", kind: "agent" },
        action: "Prepared review briefing",
        subject: "DG review — week 41",
        detail: `${verification.total - verification.untraced.length}/${verification.total} figures traced · ${cited.size} sources cited · ${(ms / 1000).toFixed(0)} s`,
        model,
      });
    },
    { modelKey },
  );
}
