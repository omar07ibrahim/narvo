import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { generateObject } from "@/lib/ai/json";
import { addAudit, kvGet, kvSet } from "@/lib/store/db";
import { claimsSchema, evaluateClaims, type FigureCheckResult } from "@/app/solutions/02-decision-intelligence/_lib/check";
import { figureCheckSystem } from "@/app/solutions/02-decision-intelligence/_lib/prompts";
import { KV_FIGCHECK } from "@/app/solutions/02-decision-intelligence/_lib/context";
import { loadDataset, loadUpdates, SLUG } from "@/app/solutions/02-decision-intelligence/_lib/data";

export async function GET() {
  return Response.json({ result: kvGet<FigureCheckResult>(KV_FIGCHECK) ?? null });
}

export async function POST(req: Request) {
  const body = await readBody<{ text?: string; title?: string }>(req);
  const { modelKey, lang } = getPrefs(req, body);
  const ar = lang === "ar";
  return eventStream(
    req,
    async (emit) => {
      const custom = typeof body.text === "string" && body.text.trim().length > 20;
      const updates = custom
        ? [{ id: "UPD-PASTED", dept: "pasted", week: "2026-W41", author: "Pasted text", role: "", date: "2026-10-11", lang: (/[؀-ۿ]/.test(body.text!) ? "ar" : "en") as "en" | "ar", title: body.title || "Pasted update", body: body.text!.slice(0, 12000) }]
        : loadUpdates();

      const s1 = emit.step("read", ar ? "قراءة تحديثات الإدارات" : "Reading department updates");
      s1.done(ar ? `${updates.length} تحديثات` : `${updates.length} update${updates.length === 1 ? "" : "s"}`);

      const s2 = emit.step("extract", ar ? "استخراج الأرقام وربطها بمؤشرات بطاقة الأداء" : "Extracting figures and mapping them to scorecard KPIs");
      // small batches in parallel keep each structured output short and reliable
      const batches: (typeof updates)[] = [];
      for (let i = 0; i < updates.length; i += 3) batches.push(updates.slice(i, i + 3));
      let done = 0;
      let model: string | undefined;
      const results = await Promise.all(
        batches.map(async (batch) => {
          const docText = batch.map((u) => `=== ${u.id} · ${u.title} · ${u.author} · dated ${u.date} · ${u.week} ===\n${u.body}`).join("\n\n");
          try {
            const r = await generateObject({
              schema: claimsSchema,
              name: "figure_claims",
              system: figureCheckSystem(),
              user: `Department updates:\n\n${docText}`,
              modelKey,
              solution: SLUG,
              task: "figure-check.extract",
              maxTokens: 2600,
              signal: emit.signal,
            });
            model = r.model;
            return r.object.claims;
          } catch (e) {
            s2.update((ar ? "تعذر تحليل دفعة: " : "Batch failed: ") + (e as Error).message);
            return [];
          } finally {
            done++;
            s2.update(ar ? `${done} من ${batches.length} دفعات` : `${done} of ${batches.length} batches`);
          }
        }),
      );
      const claims = results.flat();
      if (!claims.length) throw new Error(ar ? "لم يتم استخراج أي أرقام" : "No figures could be extracted");
      const object = { claims };
      const mapped = object.claims.filter((c) => c.metric !== "none").length;
      s2.done(ar ? `${object.claims.length} رقماً · ${mapped} مرتبطة بمؤشرات` : `${object.claims.length} figures · ${mapped} mapped to KPIs`);

      const s3 = emit.step("compare", ar ? "مقارنة كل رقم بالقيمة المحسوبة من البيانات" : "Comparing each figure with the computed value");
      const result = evaluateClaims(loadDataset(), object.claims, updates);
      result.model = model;
      emit.data("result", result);
      s3.done(
        ar
          ? `${result.consistent} متسقة · ${result.discrepancies} مختلفة · ${result.unverifiable} غير قابلة للتحقق`
          : `${result.consistent} consistent · ${result.discrepancies} discrepancies · ${result.unverifiable} not verifiable`,
      );
      if (!custom) {
        kvSet(KV_FIGCHECK, result);
        addAudit({
          solution: SLUG,
          actor: { name: "NARVO Agent", role: "AI figure check", kind: "agent" },
          action: "Checked figure consistency",
          subject: "Department updates — weeks 40–41",
          detail: `${result.consistent}/${result.consistent + result.discrepancies} consistent (${result.rate?.toFixed(0)}%) · ${result.discrepancies} discrepancies`,
          model,
        });
      }
    },
    { modelKey },
  );
}
