import { z } from "zod";
import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { chatStream } from "@/lib/ai/client";
import { buildMemoSources } from "@/app/solutions/03-process-intelligence/_lib/context";
import { memoSystem } from "@/app/solutions/03-process-intelligence/_lib/prompts";
import { SLUG } from "@/app/solutions/03-process-intelligence/_lib/data";
import { DEFAULT_INTERVENTIONS, type Interventions } from "@/app/solutions/03-process-intelligence/_lib/mining";

const rate = z.number().min(0).max(1);
const ivSchema = z.object({
  intakeNoc: z.object({ on: z.boolean(), catchRate: rate }),
  parallelNoc: z.object({ on: z.boolean(), share: rate }),
  stampCheck: z.object({ on: z.boolean(), catchRate: rate }),
  revisionCheck: z.object({ on: z.boolean(), catchRate: rate }),
  developerSla: z.object({ on: z.boolean(), compliance: rate, capDays: z.number().min(3).max(30) }),
});

export async function POST(req: Request) {
  const body = await readBody<{ interventions?: unknown; filters?: { cohort?: string } }>(req);
  const { modelKey, lang } = getPrefs(req, body);
  const ar = lang === "ar";
  const parsed = ivSchema.safeParse(body.interventions ?? DEFAULT_INTERVENTIONS);
  if (!parsed.success) return new Response("Invalid interventions", { status: 400 });
  const iv: Interventions = parsed.data;
  if (!Object.values(iv).some((x) => x.on)) return new Response(ar ? "اختر تدخلاً واحداً على الأقل" : "Select at least one intervention", { status: 400 });

  return eventStream(
    req,
    async (emit) => {
      const s1 = emit.step("simulate", ar ? "إعادة محاكاة السجل بالتدخلات المختارة" : "Re-running the replay simulation on the server");
      const r = buildMemoSources({ cohort: body.filters?.cohort ?? "Q3 2026" }, iv);
      s1.done(
        ar
          ? `الوسيط ${r.sim.before.median?.toFixed(1)} ← ${r.sim.after.median?.toFixed(1)} يوم · إعادة العمل ${r.sim.before.reworkPct?.toFixed(1)}% ← ${r.sim.after.reworkPct?.toFixed(1)}%`
          : `median ${r.sim.before.median?.toFixed(1)} → ${r.sim.after.median?.toFixed(1)} d · rework ${r.sim.before.reworkPct?.toFixed(1)}% → ${r.sim.after.reworkPct?.toFixed(1)}%`,
      );
      const s2 = emit.step("pilot", ar ? "قراءة النتائج الأولية لتجربة الاستلام" : "Reading the intake pilot's early results");
      s2.done(ar ? `${r.pilot.cases} طلباً منذ 1 أكتوبر · إعادة ${r.pilot.returnedPct?.toFixed(1)}%` : `${r.pilot.cases} applications since 1 Oct · returned ${r.pilot.returnedPct?.toFixed(1)}%`);
      emit.data("citations", r.sources.map((s) => s.citation));
      emit.data("expected", {
        medianBefore: r.sim.before.median,
        medianAfter: r.sim.after.median,
        gatedBefore: r.sim.before.gated,
        gatedAfter: r.sim.after.gated,
        reworkBefore: r.sim.before.reworkPct,
        reworkAfter: r.sim.after.reworkPct,
        throughputBefore: r.sim.throughputBefore,
        throughputAfter: r.sim.throughputAfter,
      });

      const s3 = emit.step("draft", ar ? "صياغة مذكرة التغيير" : "Drafting the change memo");
      const gen = chatStream({
        messages: [
          { role: "system", content: memoSystem(lang) },
          { role: "user", content: `Numbered sources:\n\n${r.sources.map((s) => `[${s.n}] ${s.text}`).join("\n\n")}\n\n---\nDraft the change memo.` },
        ],
        modelKey,
        temperature: 0.25,
        maxTokens: 1600,
        solution: SLUG,
        task: "change-memo",
        signal: emit.signal,
      });
      let text = "";
      for (let n = await gen.next(); !n.done; n = await gen.next())
        if (n.value.content) {
          text += n.value.content;
          emit.text(n.value.content, "memo");
        }
      if (!text.trim()) throw new Error(ar ? "لم يُرجع النموذج أي نص" : "The model returned an empty memo");
      s3.done(ar ? `${text.split(/\s+/).length} كلمة` : `${text.split(/\s+/).length} words`);
    },
    { modelKey },
  );
}
