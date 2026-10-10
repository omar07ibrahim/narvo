import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { generateObject } from "@/lib/ai/json";
import { chatStream } from "@/lib/ai/client";
import type { Citation } from "@/lib/ai/events";
import { askAnswerSystem, askSystem } from "@/app/solutions/02-decision-intelligence/_lib/prompts";
import { querySources, querySpecSchema, runQuery } from "@/app/solutions/02-decision-intelligence/_lib/query";
import { loadDataset, SLUG } from "@/app/solutions/02-decision-intelligence/_lib/data";
import { metricById } from "@/app/solutions/02-decision-intelligence/_lib/catalogue";

export async function POST(req: Request) {
  const body = await readBody<{ question?: string; history?: Array<{ q: string; a: string }> }>(req);
  const { modelKey, lang } = getPrefs(req, body);
  const ar = lang === "ar";
  const question = (body.question ?? "").trim().slice(0, 600);
  if (!question) return new Response(ar ? "السؤال مطلوب" : "A question is required", { status: 400 });

  return eventStream(
    req,
    async (emit) => {
      const s1 = emit.step("plan", ar ? "تحويل السؤال إلى استعلام آمن" : "Translating the question into a safe query");
      const history = (body.history ?? []).slice(-3).map((h) => `Previous question: ${h.q}`).join("\n");
      const { object: spec } = await generateObject({
        schema: querySpecSchema,
        name: "query_spec",
        system: askSystem(),
        user: `${history ? history + "\n" : ""}Question: ${question}`,
        modelKey,
        solution: SLUG,
        task: "ask.spec",
        maxTokens: 600,
        signal: emit.signal,
      });
      emit.data("spec", spec);
      s1.done(`${spec.metrics.join(", ")} · ${spec.from} → ${spec.to} · ${spec.granularity}${spec.compare !== "none" ? ` · ${spec.compare}` : ""}`);

      if (!spec.feasible) {
        const s = emit.step("answer", ar ? "توضيح البيانات المتاحة" : "Explaining what data is available");
        const msg = ar
          ? `لا يمكن الإجابة عن هذا السؤال من مؤشرات بطاقة الأداء الحالية. ${spec.reason ?? ""}`
          : `This question cannot be answered from the scorecard KPIs. ${spec.reason ?? ""}`;
        emit.text(msg, "answer");
        s.done();
        return;
      }

      const s2 = emit.step("compute", ar ? "احتساب النتائج من البيانات" : "Computing the result from the data");
      const ds = loadDataset();
      const result = runQuery(ds, spec);
      emit.data("result", result);
      s2.done(
        result.metrics
          .map((m) => `${ar ? m.name.ar : m.name.en}: ${m.total.text}`)
          .join(" · ") + (result.adjusted.length ? ` (${result.adjusted.join("; ")})` : ""),
      );

      const src = querySources(result);
      const citations: Citation[] = src.map((s) => ({ n: s.n, docId: `Q-${s.n}`, title: s.title, ref: s.ref, section: "Computed", quote: s.text }));
      emit.data("citations", citations);

      const s3 = emit.step("answer", ar ? "كتابة إجابة موثقة" : "Writing a cited answer");
      const gen = chatStream({
        messages: [
          { role: "system", content: askAnswerSystem(lang) },
          {
            role: "user",
            content: `Question: ${question}\nInterpreted as: ${spec.restatement}\n${result.metrics.map((m) => `Definition — ${m.name.en}: ${metricById(m.id)?.definition.en}`).join("\n")}\n\nComputed sources:\n${src.map((s) => `[${s.n}] ${s.text}`).join("\n")}`,
          },
        ],
        modelKey,
        temperature: 0.2,
        maxTokens: 400,
        solution: SLUG,
        task: "ask.answer",
        signal: emit.signal,
      });
      for (let n = await gen.next(); !n.done; n = await gen.next()) if (n.value.content) emit.text(n.value.content, "answer");
      s3.done();
    },
    { modelKey },
  );
}
