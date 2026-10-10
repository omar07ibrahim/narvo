import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { addAudit } from "@/lib/store/db";
import {
  SOL,
  getClarifications,
  getEvals,
  getOverrides,
  getSuppliers,
  loadPrices,
  loadTender,
  setReport,
} from "@/app/solutions/15-procurement-intelligence/_lib/server";
import { reportSources, streamReport } from "@/app/solutions/15-procurement-intelligence/_lib/ai";
import { computeScores, flipAnalysis, gateResults, sensitivity, fmtDate } from "@/app/solutions/15-procurement-intelligence/_lib/scoring";

export const maxDuration = 300;

const aed = (n: number) => `AED ${Math.round(n).toLocaleString("en-US")}`;

/** Draft the evaluation report from the computed results and the evaluation record, streamed and cited. */
export async function POST(req: Request) {
  const body = await readBody(req);
  const { modelKey, lang } = getPrefs(req, body);

  return eventStream(
    req,
    async (emit) => {
      const tender = loadTender();
      const suppliers = getSuppliers();
      const prices = loadPrices(suppliers);
      const evals = getEvals();
      const overrides = getOverrides();
      if (suppliers.some((s) => !evals[s.id])) throw new Error(lang === "ar" ? "قيّم جميع العروض أولاً" : "Evaluate all submissions first");

      const s1 = emit.step("compute", lang === "ar" ? "احتساب الدرجات والترتيب وتحليل الحساسية (برمجياً)" : "Computing scores, ranking and sensitivity (in code)");
      const rows = computeScores(tender, suppliers, prices, evals, overrides);
      const flip = flipAnalysis(rows, tender.weights);
      const sens = sensitivity(tender, suppliers, prices, evals, overrides);
      const name = (id: string) => suppliers.find((s) => s.id === id)?.name ?? id;
      const lines: string[] = [];
      lines.push(`Tender ${tender.ref} — ${tender.title.en}. Estimate ${aed(tender.estimate)}. Published ${fmtDate(tender.published)}, closed ${fmtDate(tender.closing)} ${tender.closingTime}. Weighting ${tender.weights.technical}/${tender.weights.commercial}; technical pass mark ${tender.passMark}/100; ICV minimum ${tender.icvMin}%.`);
      lines.push(`Committee: ${tender.committee.map((c) => `${c.name} (${c.role.en})`).join("; ")}. All members declared no conflict of interest on ${fmtDate(tender.opened)}.`);
      if (lang === "ar") lines.push(`Committee names in Arabic (use exactly): ${tender.committee.map((c) => `${c.name} = ${c.name_ar} (${c.role.ar})`).join("; ")}.`);
      lines.push("");
      lines.push("| Bidder | Technical /100 | Technical pts | Bid price | Normalised price | Commercial pts | Total | Rank | Status |");
      lines.push("|---|---|---|---|---|---|---|---|---|");
      for (const r of rows) {
        const st = r.compliant ? (r.conditional ? `Compliant (pending: ${r.pending.join(", ")})` : "Compliant") : r.belowPass ? "Below technical pass mark" : `Non-compliant (failed: ${r.failed.join(", ")})`;
        lines.push(`| ${name(r.supplierId)} | ${r.tech100.toFixed(2)} | ${r.techPts.toFixed(2)} | ${aed(r.price)} | ${aed(r.normPrice)} | ${r.comPts?.toFixed(2) ?? "—"} | ${r.total?.toFixed(2) ?? "—"} | ${r.rank ?? "—"} | ${st} |`);
      }
      for (const r of rows.filter((x) => x.adjustments.length))
        lines.push(`Price normalisation for ${name(r.supplierId)} (Art. 27): ${r.adjustments.map((a) => `${a.scope} +${aed(a.amount)} (highest equivalent line, ${name(a.from)})`).join("; ")}.`);
      lines.push("");
      lines.push("Mandatory gates:");
      for (const s of suppliers) {
        const g = gateResults(tender, s, evals[s.id]);
        lines.push(`- ${s.name}: ${Object.entries(g).map(([id, x]) => `${id} ${tender.gates.find((t) => t.id === id)?.label.en}: ${x.status}${x.value ? ` (${x.value})` : ""}`).join("; ")}`);
      }
      lines.push("");
      lines.push("Technical findings (AI-assisted, reviewed by evaluators):");
      for (const s of suppliers) {
        const ev = evals[s.id];
        lines.push(`- ${s.name}: ${ev.summary} Criteria: ${ev.criteria.map((c) => `${c.id} ${overrides[s.id]?.[c.id]?.score ?? c.score}/10 (${c.status})`).join(", ")}. Exclusions: ${ev.scope.filter((x) => x.status !== "included").map((x) => `${tender.scope.find((t) => t.id === x.id)?.label.en} (${x.status})`).join(", ") || "none"}. Risks: ${ev.risks.join("; ")}.`);
        if (s.pastPerformance.length) lines.push(`  Past performance with MNDA: ${s.pastPerformance.map((p) => `${p.contract} rated ${p.rating}/5 — ${p.note.en}`).join(" ")}`);
      }
      const ovr = Object.entries(overrides).flatMap(([sid, m]) => Object.entries(m).map(([cid, o]) => `${name(sid)} ${cid}: ${o.score}/10 by ${o.by} — "${o.reason}"`));
      lines.push(`Evaluator overrides (Art. 30): ${ovr.length ? ovr.join("; ") : "none"}.`);
      const clars = getClarifications();
      lines.push(`Clarifications (Art. 29): ${clars.length ? clars.map((c) => `${c.ref} to ${name(c.supplierId)} — ${c.status}${c.priceChangeAttempt ? " (price change attempt not credited)" : ""}`).join("; ") : "none issued"}.`);
      const changes = suppliers.flatMap((s) => (evals[s.id].history ?? []).map((h) => `${s.short} ${h.id}: ${h.from} → ${h.to} (${h.note})`));
      if (changes.length) lines.push(`Changes after clarification: ${changes.join("; ")}.`);
      const leaders = sens.map((p) => {
        const best = suppliers.filter((s) => p[s.id] != null).sort((a, b) => (p[b.id] as number) - (p[a.id] as number))[0];
        return { tw: p.tw, leader: best?.short ?? "—" };
      });
      const flips = leaders.filter((x, i) => i > 0 && x.leader !== leaders[i - 1].leader).map((x) => `between ${x.tw - 5}/${105 - x.tw} and ${x.tw}/${100 - x.tw} the leader changes to ${x.leader}`);
      lines.push(`Leader by weighting (computed): ${leaders.map((x) => `${x.tw}/${100 - x.tw} ${x.leader}`).join(", ")}. ${flips.length ? `Rank flip: ${flips.join("; ")}.` : "The leader is the same at every tested weighting."}`);
      lines.push(`Sensitivity (total by technical weight): ${sens.map((p) => `${p.tw}/${100 - p.tw}: ${suppliers.map((s) => `${s.short} ${p[s.id]?.toFixed(2) ?? "n/a"}`).join(", ")}`).join(" | ")}.`);
      if (flip) lines.push(`Robustness: leader ${name(flip.leader)} leads ${name(flip.runnerUp)} by ${flip.gap.toFixed(2)} points; ${flip.priceNeeded ? `the runner-up would need a price of ${aed(flip.priceNeeded)} or lower to overtake` : "the runner-up cannot overtake on price alone"}; the leader's technical score would need to fall by ${flip.techDropNeeded.toFixed(1)} points (out of 100).`);
      // Section 7 content is fixed in code so the narrative can never contradict the computation.
      const ar = lang === "ar";
      const shortName = (id: string) => suppliers.find((s) => s.id === id)?.short ?? id;
      const tbl = [
        ar ? "| الترتيب | المورد | فني /100 | نقاط فنية | السعر بعد التسوية | نقاط مالية | المجموع |" : "| Rank | Bidder | Technical /100 | Technical pts | Normalised price | Commercial pts | Total |",
        "|---|---|---|---|---|---|---|",
        ...[...rows]
          .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
          .map((r) => `| ${r.rank ?? "—"} | ${ar ? (suppliers.find((s) => s.id === r.supplierId)?.name_ar ?? name(r.supplierId)) : name(r.supplierId)} | ${r.tech100.toFixed(2)} | ${r.techPts.toFixed(2)} | ${aed(r.normPrice)} | ${r.comPts?.toFixed(2) ?? "—"} | ${r.total?.toFixed(2) ?? (ar ? "غير مرتب" : "not ranked")} |`),
      ].join("\n");
      const flipTxt = flips.length
        ? ar
          ? `يتغير المتصدر بتغير الترجيح: ${leaders.map((x) => `${x.tw}/${100 - x.tw} ${x.leader}`).join("، ")}.`
          : `The leader changes with the weighting: ${leaders.map((x) => `${x.tw}/${100 - x.tw} ${x.leader}`).join(", ")}.`
        : ar
          ? `يبقى ${leaders[0]?.leader} متصدراً في جميع الترجيحات المختبرة من 50/50 إلى 90/10.`
          : `${leaders[0]?.leader} leads at every tested weighting from 50/50 to 90/10.`;
      const robust = flip
        ? ar
          ? `عند ترجيح ${tender.weights.technical}/${tender.weights.commercial} يتقدم ${shortName(flip.leader)} على ${shortName(flip.runnerUp)} بفارق ${flip.gap.toFixed(2)} نقطة؛ ${flip.priceNeeded ? `ويحتاج ${shortName(flip.runnerUp)} إلى سعر ${aed(flip.priceNeeded)} أو أقل ليتقدم` : `ولا يستطيع ${shortName(flip.runnerUp)} التقدم بالسعر وحده`}.`
          : `At ${tender.weights.technical}/${tender.weights.commercial}, ${shortName(flip.leader)} leads ${shortName(flip.runnerUp)} by ${flip.gap.toFixed(2)} points; ${flip.priceNeeded ? `${shortName(flip.runnerUp)} would need to price at ${aed(flip.priceNeeded)} or lower to overtake` : `${shortName(flip.runnerUp)} cannot overtake on price alone`}.`
        : "";
      lines.push("");
      lines.push(`Official bidder names: ${suppliers.map((s) => `${s.name} = ${s.name_ar}`).join("; ")}.`);
      lines.push(`REQUIRED TABLE FOR SECTION 7 (copy exactly):\n${tbl}`);
      lines.push(`REQUIRED SENSITIVITY STATEMENT FOR SECTION 7 (copy exactly, add nothing else about sensitivity): ${flipTxt} ${robust}`);
      const facts = lines.join("\n");
      s1.done(rows.filter((r) => r.rank).sort((a, b) => a.rank! - b.rank!).map((r) => `#${r.rank} ${suppliers.find((s) => s.id === r.supplierId)?.short} ${r.total?.toFixed(2)}`).join(" · ") || "no compliant bids");

      const s2 = emit.step("sources", lang === "ar" ? "جمع المصادر من العروض ودليل المشتريات" : "Retrieving sources from bids and the Procurement Manual");
      const citations = reportSources(tender, suppliers, clars.filter((c) => c.status === "answered"));
      emit.data("citations", citations);
      s2.done(`${citations.length} ${lang === "ar" ? "مقطعاً" : "passages"}`);

      const s3 = emit.step("write", lang === "ar" ? "صياغة تقرير التقييم" : "Writing the evaluation report");
      const gen = streamReport({ emit, lang, modelKey }, { tender, facts, citations });
      let text = "";
      while (true) {
        const n = await gen.next();
        if (n.done) break;
        text += n.value;
        emit.text(n.value, "report");
      }
      const used = new Set(Array.from(text.matchAll(/\[(\d+)\]/g)).map((m) => Number(m[1])));
      s3.done(lang === "ar" ? `${used.size} مصادر مستشهد بها` : `${used.size} sources cited`);
      const report = { text, citations, at: Date.now(), lang };
      setReport(report);
      emit.data("report", report);
      addAudit({ solution: SOL, actor: { name: "NARVO Agent", role: "AI evaluation assistant", kind: "agent" }, action: "Drafted evaluation report", subject: tender.ref, detail: `${used.size} sources cited` });
    },
    { modelKey },
  );
}
