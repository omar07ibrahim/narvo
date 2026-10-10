import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { chatStream } from "@/lib/ai/client";
import { addAudit, kvGet, kvSet } from "@/lib/store/db";
import type { Citation } from "@/lib/ai/events";
import { buildRcaSources } from "@/app/solutions/03-process-intelligence/_lib/context";
import { rcaSystem } from "@/app/solutions/03-process-intelligence/_lib/prompts";
import { SLUG } from "@/app/solutions/03-process-intelligence/_lib/data";
import type { Filters } from "@/app/solutions/03-process-intelligence/_lib/mining";

export async function POST(req: Request) {
  const body = await readBody<{ filters?: Filters; byo?: { name: string; facts: string[] } }>(req);
  const { modelKey, lang } = getPrefs(req, body);
  const ar = lang === "ar";
  return eventStream(
    req,
    async (emit) => {
      let sources: Array<{ n: number; text: string; kind: string; citation: Citation }>;
      let label = "";
      if (body.byo?.facts?.length) {
        const s1 = emit.step("stats", ar ? "قراءة الإحصاءات المحسوبة من السجل المرفوع" : "Reading statistics computed from the uploaded log");
        sources = body.byo.facts.slice(0, 20).map((t, i) => ({
          n: i + 1,
          kind: "S",
          text: String(t).slice(0, 1200),
          citation: { n: i + 1, docId: `BYO-${i + 1}`, title: body.byo!.name, ref: "Computed in the browser from the uploaded log", section: "Process analytics", quote: String(t).slice(0, 600) },
        }));
        label = body.byo.name;
        s1.done(ar ? `${sources.length} إحصاءات` : `${sources.length} computed statistics`);
      } else {
        const s1 = emit.step("stats", ar ? "احتساب مؤشرات العملية من سجل الأحداث" : "Computing process statistics from the event log");
        const r = buildRcaSources(body.filters ?? { cohort: "Q3 2026" });
        label = r.label;
        const statCount = r.sources.filter((s) => s.kind === "S").length;
        s1.done(
          ar
            ? `${r.stats.cases} طلباً · الوسيط ${r.stats.cycleMedian?.toFixed(1)} يوم · إعادة العمل ${r.stats.reworkPct?.toFixed(1)}% · ${statCount} مؤشرات`
            : `${r.stats.cases} applications · median ${r.stats.cycleMedian?.toFixed(1)} d · rework ${r.stats.reworkPct?.toFixed(1)}% · ${statCount} statistics`,
        );
        const s2 = emit.step("notes", ar ? "اختيار عينة متوازنة من ملاحظات الموظفين" : "Sampling officer case notes by theme");
        s2.done(ar ? `${r.notesUsed} من ${r.notesTotal} ملاحظة (عربي وإنجليزي)` : `${r.notesUsed} of ${r.notesTotal} notes (Arabic and English)`);
        sources = r.sources;
      }
      const citations = sources.map((s) => s.citation);
      emit.data("citations", citations);

      const s3 = emit.step("explain", ar ? "تفسير الأسباب الجذرية مع الأدلة" : "Explaining root causes with evidence");
      const gen = chatStream({
        messages: [
          { role: "system", content: rcaSystem(lang, !!body.byo) },
          { role: "user", content: `Numbered sources (${label}):\n\n${sources.map((s) => `[${s.n}] (${s.kind}) ${s.text}`).join("\n\n")}\n\n---\nExplain the root causes of delay and rework.` },
        ],
        modelKey,
        temperature: 0.2,
        maxTokens: 1500,
        solution: SLUG,
        task: "root-cause",
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
          emit.text(n.value.content, "rca");
        }
      }
      if (!text.trim()) throw new Error(ar ? "لم يُرجع النموذج أي نص" : "The model returned an empty analysis");
      const cited = new Set(Array.from(text.matchAll(/\[(\d+)\]/g)).map((m) => Number(m[1])));
      s3.done(ar ? `${cited.size} مصدراً مستشهداً به` : `${cited.size} sources cited`);
      if (!body.byo) {
        kvSet(`${SLUG}:rca`, { text, citations, at: Date.now(), label, lang });
        addAudit({
          solution: SLUG,
          actor: { name: "NARVO Agent", role: "AI process analyst", kind: "agent" },
          action: "Root-cause analysis",
          subject: `Permit process — ${label}`,
          detail: `${cited.size} sources cited`,
          model,
        });
      }
    },
    { modelKey },
  );
}

export async function GET() {
  return Response.json({ rca: kvGet(`${SLUG}:rca`) ?? null });
}
