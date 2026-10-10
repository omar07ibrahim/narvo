import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { addAudit } from "@/lib/store/db";
import { SOL, getSuppliers, loadPrices, loadSubmission, loadTender, pool, putEval, retry } from "@/app/solutions/15-procurement-intelligence/_lib/server";
import { evaluateSupplier } from "@/app/solutions/15-procurement-intelligence/_lib/ai";
import { gateResults } from "@/app/solutions/15-procurement-intelligence/_lib/scoring";

export const maxDuration = 300;

/** Compare each supplier submission against the 041 criteria, gates and scope (one structured call per supplier). */
export async function POST(req: Request) {
  const body = await readBody<{ supplierIds?: string[] }>(req);
  const { modelKey, lang } = getPrefs(req, body);

  return eventStream(
    req,
    async (emit) => {
      const tender = loadTender();
      const all = getSuppliers();
      const suppliers = body.supplierIds?.length ? all.filter((s) => body.supplierIds!.includes(s.id)) : all;
      const prices = loadPrices(all);

      const s0 = emit.step("read", lang === "ar" ? "قراءة العروض الفنية وجداول الأسعار" : "Reading technical proposals and price schedules");
      const docs = suppliers.map((s) => ({ s, body: loadSubmission(s).body }));
      s0.done(docs.map((d) => `${d.s.short}: ${d.body.split(/\s+/).length.toLocaleString("en")} ${lang === "ar" ? "كلمة" : "words"}`).join(" · "));

      const s1 = emit.step("gates", lang === "ar" ? "فحص الشروط الإلزامية المحسوبة (الشهادات، القيمة الوطنية)" : "Computing mandatory gates (certificates, ICV)");
      const flags = suppliers.flatMap((s) =>
        Object.entries(gateResults(tender, s))
          .filter(([, g]) => g.computed && g.status !== "met")
          .map(([id, g]) => `${s.short} ${id}: ${g.value}`),
      );
      s1.done(flags.length ? flags.join(" · ") : lang === "ar" ? "كل الشروط المحسوبة مستوفاة" : "all computed gates pass");

      let done = 0;
      const s2 = emit.step("compare", lang === "ar" ? `مقارنة ${suppliers.length} عروض بالمعايير (بالتوازي)` : `Comparing ${suppliers.length} submissions against the criteria (in parallel)`);
      await pool(docs, 3, async ({ s, body: text }) => {
        const ev = await retry(() => evaluateSupplier({ emit, lang, modelKey }, { tender, supplier: s, body: text, prices: prices.find((p) => p.supplierId === s.id)! }));
        putEval(ev);
        done++;
        s2.update(`${done}/${suppliers.length} · ${s.short}`);
        emit.data(`eval:${s.id}`, ev);
        addAudit({
          solution: SOL,
          actor: { name: "NARVO Agent", role: "AI evaluation assistant", kind: "agent" },
          action: "Evaluated submission against criteria",
          subject: `${tender.ref} — ${s.name}`,
          detail: `${ev.criteria.filter((c) => c.status === "met").length}/${ev.criteria.length} criteria evidenced · exclusions: ${ev.scope.filter((x) => x.status === "excluded").length} · gates to clarify: ${ev.gates.filter((g) => g.status !== "met").length}`,
        });
      });
      s2.done(lang === "ar" ? "اكتملت المقارنة — الدرجات الفنية مقترحة وتخضع لمراجعة المقيّمين" : "Comparison complete — technical scores are suggestions for the evaluators");
    },
    { modelKey },
  );
}
