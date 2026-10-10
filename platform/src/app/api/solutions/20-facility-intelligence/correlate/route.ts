import { z } from "zod";
import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { chatStream } from "@/lib/ai/client";
import { generateObject } from "@/lib/ai/json";
import { addAudit, kvGet, kvSet } from "@/lib/store/db";
import { buildCorrelationSources } from "@/app/solutions/20-facility-intelligence/_lib/context";
import { correlateSystem, findingSystem } from "@/app/solutions/20-facility-intelligence/_lib/prompts";
import { SLUG } from "@/app/solutions/20-facility-intelligence/_lib/data";

const findingSchema = z.object({
  rootCause: z.string().describe("one sentence"),
  mechanism: z.string().describe("one or two sentences linking the asset behaviour to the complaints"),
  confidence: z.number().min(0).max(1),
  contributing: z.array(z.string()).max(4),
  ruledOut: z.array(z.string()).max(3),
  assets: z.array(z.string()).max(4),
  zones: z.array(z.string()).max(4),
  nextStep: z.string(),
});

export async function GET() {
  return Response.json({ result: kvGet(`${SLUG}:correlation`) ?? null });
}

export async function POST(req: Request) {
  const body = await readBody(req);
  const { modelKey, lang } = getPrefs(req, body);
  const ar = lang === "ar";
  return eventStream(
    req,
    async (emit) => {
      const s1 = emit.step("signals", ar ? "تحليل إشارات المبنى ورصد الحالات الشاذة" : "Analysing building signals and detecting anomalies");
      const ctx = buildCorrelationSources();
      const counts = ctx.anomalies.reduce<Record<string, number>>((a, x) => ((a[x.kind] = (a[x.kind] ?? 0) + 1), a), {});
      s1.done(
        ar
          ? `${counts.trip ?? 0} توقفات · ${counts.shortfall ?? 0} حالات نقص تبريد · ${counts.zone_hot ?? 0} فترات حرارة زائدة`
          : `${counts.trip ?? 0} trips · ${counts.shortfall ?? 0} cooling shortfalls · ${counts.zone_hot ?? 0} hot-zone episodes`,
      );
      const s2 = emit.step("link", ar ? "ربط الشكاوى والحجوزات وسجلات الصيانة والعقد" : "Linking complaints, bookings, PPM, jobs and contract");
      s2.done(ar ? `${ctx.sources.length} مصدراً مرقماً` : `${ctx.sources.length} numbered sources`);
      const citations = ctx.sources.map((s) => s.citation);
      emit.data("citations", citations);
      const srcText = ctx.sources.map((s) => `[${s.n}] ${s.text}`).join("\n\n");

      const s3 = emit.step("finding", ar ? "تحديد السبب الجذري ودرجة الثقة" : "Determining root cause and confidence");
      const { object: finding, model } = await generateObject({
        schema: findingSchema,
        name: "finding",
        system: findingSystem(),
        user: `Evidence:\n\n${srcText}\n\nAnswer in ${ar ? "Arabic" : "English"}.`,
        modelKey,
        solution: SLUG,
        task: "correlate.finding",
        maxTokens: 900,
        signal: emit.signal,
      });
      emit.data("finding", finding);
      s3.done(`${ar ? "الثقة" : "confidence"} ${(finding.confidence * 100).toFixed(0)}%`);

      const s4 = emit.step("explain", ar ? "شرح سلسلة الأدلة" : "Writing the evidence chain");
      const gen = chatStream({
        messages: [
          { role: "system", content: correlateSystem(lang) },
          { role: "user", content: `Numbered sources:\n\n${srcText}\n\n---\nExplain the recurring comfort issue at Al Ghaf Community Centre.` },
        ],
        modelKey,
        temperature: 0.2,
        maxTokens: 1200,
        solution: SLUG,
        task: "correlate.explain",
        signal: emit.signal,
      });
      let text = "";
      for (let n = await gen.next(); !n.done; n = await gen.next())
        if (n.value.content) {
          text += n.value.content;
          emit.text(n.value.content, "explain");
        }
      if (!text.trim()) throw new Error(ar ? "لم يُرجع النموذج أي نص" : "The model returned an empty explanation");
      s4.done();
      kvSet(`${SLUG}:correlation`, { finding, text, citations, at: Date.now(), lang });
      addAudit({
        solution: SLUG,
        actor: { name: "NARVO Agent", role: "AI building-performance analyst", kind: "agent" },
        action: "Correlated recurring issue",
        subject: "Al Ghaf Community Centre — comfort complaints",
        detail: `${finding.rootCause} (confidence ${(finding.confidence * 100).toFixed(0)}%)`,
        model,
      });
    },
    { modelKey },
  );
}
