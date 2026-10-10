import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { chatStream } from "@/lib/ai/client";
import { addAudit, patchRecord } from "@/lib/store/db";
import { verifySystem } from "@/app/solutions/20-facility-intelligence/_lib/prompts";
import { loadComplaints, loadSeries, loadWorkOrders, SLUG, WOS } from "@/app/solutions/20-facility-intelligence/_lib/data";
import { DEFAULT_CRITERIA, verifyCompletion, type Criterion } from "@/app/solutions/20-facility-intelligence/_lib/signals";
import type { Citation } from "@/lib/ai/events";

export async function POST(req: Request) {
  const body = await readBody<{ woId?: string }>(req);
  const { modelKey, lang } = getPrefs(req, body);
  const ar = lang === "ar";
  const wo = loadWorkOrders().find((w) => w.id === body.woId);
  if (!wo) return new Response("Work order not found", { status: 404 });
  if (!wo.completedAt) return new Response(ar ? "لم يتم تسجيل الإنجاز بعد" : "Record the completion first", { status: 400 });

  return eventStream(
    req,
    async (emit) => {
      const s1 = emit.step("window", ar ? "تحديد نافذة البيانات بعد الإنجاز" : "Selecting the post-completion data window");
      const { agc, hq } = loadSeries();
      const series = wo.site === "HQ" ? hq : agc;
      const criteria: Criterion[] = (wo.verification?.length ? wo.verification : DEFAULT_CRITERIA).map((c) => ({ metric: c.metric as Criterion["metric"], threshold: c.threshold, description: c.description }));
      const v = verifyCompletion(series, wo.completedAt!, criteria, loadComplaints());
      s1.done(ar ? `${v.windowHours} ساعة بعد الإنجاز · ${v.baselineHours} ساعة قبله` : `${v.windowHours} h after completion · ${v.baselineHours} h baseline`);

      const s2 = emit.step("check", ar ? "احتساب معايير التحقق من بيانات المبنى" : "Computing each verification criterion from BMS data");
      emit.data("verification", v);
      const passed = v.results.filter((r) => r.pass === true).length;
      s2.done(
        v.verdict === "insufficient_data"
          ? ar
            ? "بيانات غير كافية بعد الإنجاز"
            : "Not enough post-completion data yet"
          : ar
            ? `${passed} من ${v.results.length} معايير مستوفاة`
            : `${passed} of ${v.results.length} criteria met`,
      );

      const sources = [
        `Work order ${wo.id}: ${wo.title}. Priority ${wo.priority}; contractor ${wo.contractor}; completion recorded ${wo.completedAt!.slice(0, 16).replace("T", " ")} GST. Contractor report: ${wo.completionNote || "—"}`,
        `Verification window: ${v.windowHours} hours of BMS data after completion (to 9 Oct 2026 23:00), compared with ${v.baselineHours} hours before. Verdict computed: ${v.verdict.replace("_", " ")}.`,
        ...v.results.map((r) => `Criterion — ${r.description}: ${r.pass === null ? "not evaluated" : r.pass ? "MET" : "NOT MET"}. ${r.detail}`),
        "Contract MNDA/CON/2023/019 §6.3: corrective work is closed only after the Authority's FM team verifies completion against agreed criteria; payment certification follows verification.",
        "Outstanding: PPM-AGC-CH01-CCC condenser coil cleaning on CH-01 overdue since 15 Aug 2026; root-cause report under §3.6 requested 14 Sep (ACT-2026-043).",
      ];
      const citations: Citation[] = sources.map((q, i) => ({ n: i + 1, docId: `VER-${i + 1}`, title: i === 0 ? wo.id : i === 1 ? "Verification window" : i < 2 + v.results.length ? `Criterion ${i - 1}` : "Contract / PPM", ref: "Computed from BMS trends", section: "Verification", quote: q }));
      emit.data("citations", citations);

      const s3 = emit.step("note", ar ? "كتابة مذكرة التحقق" : "Writing the verification note");
      const gen = chatStream({
        messages: [
          { role: "system", content: verifySystem(lang) },
          { role: "user", content: `Numbered sources:\n${sources.map((s, i) => `[${i + 1}] ${s}`).join("\n")}\n\nWrite the verification note.` },
        ],
        modelKey,
        temperature: 0.2,
        maxTokens: 700,
        solution: SLUG,
        task: "verify.note",
        signal: emit.signal,
      });
      let note = "";
      let model: string | undefined;
      for (let n = await gen.next(); ; n = await gen.next()) {
        if (n.done) {
          model = n.value.model;
          break;
        }
        if (n.value.content) {
          note += n.value.content;
          emit.text(n.value.content, "note");
        }
      }
      s3.done();
      const status = v.verdict === "verified" ? "Verified & closed" : v.verdict === "not_verified" ? "Verification failed — returned to contractor" : "Awaiting post-completion data";
      patchRecord(WOS, wo.id, { status, verificationResult: v, verificationNote: note, verificationCitations: citations, verifiedAt: new Date().toISOString() });
      emit.data("status", status);
      addAudit({
        solution: SLUG,
        actor: { name: "NARVO Agent", role: "AI verification", kind: "agent" },
        action: v.verdict === "verified" ? "Completion verified — work order closed" : v.verdict === "not_verified" ? "Verification failed" : "Verification pending — insufficient data",
        subject: `${wo.id} — ${wo.title}`.slice(0, 200),
        detail: `${passed}/${v.results.length} criteria met over ${v.windowHours} h`,
        model,
      });
    },
    { modelKey },
  );
}
