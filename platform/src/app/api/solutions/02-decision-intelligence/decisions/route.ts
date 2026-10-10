import { z } from "zod";
import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { generateObject } from "@/lib/ai/json";
import { buildReviewContext, sourcesPrompt } from "@/app/solutions/02-decision-intelligence/_lib/context";
import { decisionsSystem } from "@/app/solutions/02-decision-intelligence/_lib/prompts";
import { METRIC_IDS, OWNER_NAMES, PEOPLE } from "@/app/solutions/02-decision-intelligence/_lib/catalogue";
import { SLUG } from "@/app/solutions/02-decision-intelligence/_lib/data";

const proposalSchema = z.object({
  proposals: z
    .array(
      z.object({
        title: z.string().describe("the decision / action, imperative, one line"),
        rationale: z.string().describe("why, with [n] citations"),
        owner: z.enum(OWNER_NAMES),
        due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        kpi: z.enum([...METRIC_IDS, "none"] as [string, ...string[]]),
        expectedEffect: z.string(),
        priority: z.enum(["high", "medium"]),
        refs: z.array(z.number().int()).max(8),
      }),
    )
    .min(2)
    .max(5),
});

export type Proposal = z.infer<typeof proposalSchema>["proposals"][number];

export async function POST(req: Request) {
  const body = await readBody<{ briefing?: string }>(req);
  const { modelKey, lang } = getPrefs(req, body);
  const ar = lang === "ar";
  return eventStream(
    req,
    async (emit) => {
      const s1 = emit.step("context", ar ? "جمع المؤشرات الحمراء والطلبات والإجراءات المتعثرة" : "Collecting red KPIs, requests and blocked actions");
      const ctx = buildReviewContext({ maxFacts: 36 });
      emit.data("citations", ctx.blocks.map((b) => b.citation));
      s1.done(ar ? `${ctx.blocks.length} مصدراً` : `${ctx.blocks.length} sources`);

      const s2 = emit.step("propose", ar ? "اقتراح القرارات والإجراءات القابلة للمتابعة" : "Proposing decisions as trackable actions");
      const owners = PEOPLE.filter((p) => p.name !== "H.E. Eng. Khalid Saif Al Mazrouei")
        .map((p) => `${p.name} — ${p.role}`)
        .join("\n");
      const { object } = await generateObject({
        schema: proposalSchema,
        name: "decision_proposals",
        system: decisionsSystem(lang),
        user: `Possible owners:\n${owners}\n\nNumbered sources:\n\n${sourcesPrompt(ctx.blocks)}${body.briefing ? `\n\n---\nDraft briefing already prepared:\n${body.briefing.slice(0, 5000)}` : ""}`,
        modelKey,
        solution: SLUG,
        task: "decisions",
        maxTokens: 2200,
        temperature: 0.2,
        signal: emit.signal,
      });
      const proposals = object.proposals.map((p) => ({
        ...p,
        due: p.due < "2026-10-13" ? "2026-10-19" : p.due > "2026-12-31" ? "2026-12-31" : p.due,
        refs: p.refs.filter((n) => n >= 1 && n <= ctx.blocks.length),
      }));
      emit.data("proposals", proposals);
      s2.done(ar ? `${proposals.length} قرارات مقترحة` : `${proposals.length} decisions proposed`);
    },
    { modelKey },
  );
}
