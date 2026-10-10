import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { chatStream } from "@/lib/ai/client";
import { addAudit } from "@/lib/store/db";
import { analystSystem, buildFacts } from "@/app/solutions/17-demand-planning/_lib/facts";
import { getForecastBundle } from "@/app/solutions/17-demand-planning/_lib/data";
import { DEFAULT_WHATIF, type WhatIf } from "@/app/solutions/17-demand-planning/_lib/types";

/** Recompute the plans for the current what-if and have the model explain the trade-offs (streamed, cited). */
export async function POST(req: Request) {
  const body = await readBody<{ whatIf?: Partial<WhatIf>; focus?: string }>(req);
  const { modelKey, lang } = getPrefs(req, body);
  const whatIf: WhatIf = { ...DEFAULT_WHATIF, ...(body.whatIf ?? {}) };
  const ar = lang === "ar";

  return eventStream(
    req,
    async (emit) => {
      const s1 = emit.step("forecast", ar ? "تحميل التوقعات ونتائج الاختبار الرجعي" : "Loading forecasts and backtest");
      const bundle = getForecastBundle();
      s1.done(
        ar
          ? `${bundle.series.length} سلسلة · WAPE ${(bundle.portfolio.wape * 100).toFixed(1)}% مقابل ${(bundle.portfolio.naiveWape * 100).toFixed(1)}% للنموذج الموسمي البسيط`
          : `${bundle.series.length} series · WAPE ${(bundle.portfolio.wape * 100).toFixed(1)}% vs ${(bundle.portfolio.naiveWape * 100).toFixed(1)}% seasonal-naive`,
      );

      const s2 = emit.step("simulate", ar ? "محاكاة الخطط الثلاث على 100 مسار طلب" : "Simulating 3 plans × 100 demand paths");
      const facts = buildFacts(whatIf);
      s2.done(ar ? `13 أسبوعاً · ${facts.run.ms} مللي ثانية` : `13 weeks · ${facts.run.ms} ms`);

      const s3 = emit.step("constraints", ar ? "فحص حدود التخزين والتوريد" : "Checking storage and supply limits");
      const v = facts.run.plans.map((p) => `${p.id}: ${p.violations.length}`).join(" · ");
      s3.done(ar ? `مخالفات السعة (أسبوع-مورد) — ${v}` : `Capacity violations (resource-weeks) — ${v}`);
      emit.data("facts", facts.summary);
      emit.data("citations", facts.citations);

      const s4 = emit.step("explain", ar ? "صياغة التوصية وشرح المفاضلات" : "Writing the recommendation");
      const task = [
        "Write a briefing for Joseph Abraham with these sections (use '###' headings):",
        ar ? "### التوصية — one or two sentences naming the plan you recommend and why." : "### Recommendation — one or two sentences naming the plan you recommend and why.",
        ar ? "### المفاضلات — service vs cost vs storage limits for A, B and C (compact bullets, numbers cited)." : "### Trade-offs — service vs cost vs storage limits for A, B and C (compact bullets, numbers cited).",
        ar ? "### عدم اليقين — what the P10 fill rate and cost range mean; the most exposed SKUs." : "### Uncertainty — what the P10 fill rate and cost range mean; the most exposed SKUs.",
        ar ? "### ما الذي يغيّر القرار — conditions under which another plan would be better." : "### What would change the decision — conditions under which another plan would be better.",
        ar ? "### الخطوات التالية — 3 concrete actions with dates where the facts give them." : "### Next steps — 3 concrete actions with dates where the facts give them.",
        "Use the section headings in the output language. 220–330 words. Cite every number.",
        body.focus ? `The user's focus: ${body.focus}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      const gen = chatStream({
        messages: [
          { role: "system", content: analystSystem(lang) },
          { role: "user", content: `Computed facts:\n\n${facts.context}\n\n---\n\n${task}` },
        ],
        modelKey,
        temperature: 0.25,
        maxTokens: 1200,
        solution: "17-demand-planning",
        task: "explain",
        signal: emit.signal,
      });
      let text = "";
      for (let n = await gen.next(); !n.done; n = await gen.next()) {
        if (n.value.content) {
          text += n.value.content;
          emit.text(n.value.content);
        }
      }
      const used = new Set(Array.from(text.matchAll(/\[(\d+)\]/g)).map((m) => m[1])).size;
      s4.done(ar ? `${used} أدلة محسوبة مستشهد بها` : `${used} computed evidence blocks cited`);
      addAudit({
        solution: "17-demand-planning",
        actor: { name: "NARVO Agent", role: "AI planning analyst", kind: "agent" },
        action: "Explained plan trade-offs",
        subject: `What-if: ${whatIf.upliftPct ? `+${whatIf.upliftPct}% ${whatIf.upliftScope}` : "base"}${whatIf.palletLossJA ? `, −${whatIf.palletLossJA} JA pallets` : ""}${whatIf.millDelayWeeks ? `, mill +${whatIf.millDelayWeeks} wk` : ""}`,
        detail: facts.summary.plans.map((p) => `${p.id} ${(p.fillRate * 100).toFixed(1)}% / AED ${Math.round(p.totalCost).toLocaleString("en-US")} / ${p.violations} viol.`).join(" · "),
      });
    },
    { modelKey },
  );
}
