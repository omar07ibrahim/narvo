import { z } from "zod";
import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { chatStream } from "@/lib/ai/client";
import { generateObject } from "@/lib/ai/json";
import { addAudit, kvSet } from "@/lib/store/db";
import { search } from "@/lib/retrieval";
import type { Citation } from "@/lib/ai/events";
import { CORPUS, briefKey, jobContext, loadBms, loadHistory, loadInventory } from "@/app/solutions/19-field-service/_lib/data";
import { partAvailability } from "@/app/solutions/19-field-service/_lib/rules";

const partsSchema = z.object({
  parts: z
    .array(
      z.object({
        partNo: z.string().describe("Exact part number from the catalogue"),
        qty: z.number().describe("Quantity to bring"),
        purpose: z.string().describe("Why it is needed, max 10 words"),
      }),
    )
    .max(14),
});

/** Job brief: history analysis (computed) + manual retrieval → streamed, cited brief → parts & tools checked against stock. */
export async function POST(req: Request) {
  const body = await readBody<{ jobId?: string }>(req);
  const { modelKey, lang } = getPrefs(req, body);
  const ar = lang === "ar";
  const ctx = jobContext(body.jobId ?? "");
  if (!ctx) return new Response("Job not found", { status: 404 });
  const { job, jobs, asset, site, tech } = ctx;

  return eventStream(
    req,
    async (emit) => {
      const started = Date.now();
      const s1 = emit.step("load", ar ? "تحميل المهمة والأصل والموقع" : "Loading job, asset and site");
      s1.done(`${job.id} · ${asset.id} (${asset.make} ${asset.model}) · ${site.name}`);

      // ── 2. Service history (computed) ──
      const s2 = emit.step("history", ar ? "تحليل سجل الخدمة وسجل نظام إدارة المبنى" : "Analysing service history and BMS log");
      const history = loadHistory()
        .filter((h) => h.asset === asset.id)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 8);
      const linked = jobs.filter((j) => job.linked.includes(j.id) || (j.asset === asset.id && j.id !== job.id && j.status === "completed"));
      const facts: Array<{ id: string; title: string; section: string; text: string }> = [];
      let tripSummary: Record<string, unknown> | null = null;
      if (asset.id === "AGCC-CH-02") {
        const bms = loadBms();
        const sep = bms.trips.filter((t) => t.date.startsWith("2026-09"));
        const oct = bms.trips.filter((t) => t.date.startsWith("2026-10"));
        const hours = bms.trips.map((t) => Number(t.time.slice(0, 2)));
        const minAmb = Math.min(...bms.trips.map((t) => t.ambientC));
        const avgKpa = Math.round(bms.trips.reduce((a, t) => a + t.dischargeKpa, 0) / bms.trips.length);
        const hotDaysNoTrip = bms.daily.filter((d) => d.date.startsWith("2026-09") && d.trips === 0 && d.maxAmbientC >= 44).length;
        tripSummary = { sep: sep.length, oct: oct.length, from: Math.min(...hours), to: Math.max(...hours) + 1, minAmb, avgKpa, lockouts: bms.trips.filter((t) => t.lockout).length };
        facts.push({
          id: "bms:ch02-a21",
          title: "BMS trend — CH-02 A21 high-discharge-pressure trips",
          section: "Sep–Oct 2026",
          text: `${sep.length} A21 trips in September and ${oct.length} in October (to 9 Oct), all on circuit B between ${Math.min(...hours)}:00 and ${Math.max(...hours) + 1}:00; ambient at trip ${minAmb}–${Math.max(...bms.trips.map((t) => t.ambientC))} °C; mean discharge at trip ${avgKpa} kPa(g); ${tripSummary.lockouts} lockouts (24 Sep, 9 Oct). CH-01 had no trips in the same period. September days ≥ 44 °C without a trip: ${hotDaysNoTrip}.`,
        });
        emit.data("bms", bms);
      }
      if (asset.overduePpm?.length) {
        facts.push({
          id: "cafm:overdue-ppm",
          title: "RFM Connect — overdue PPM on this asset",
          section: asset.id,
          text: asset.overduePpm.map((p) => `${p.type}: due ${p.due} (${p.job}), last done ${p.lastDone}`).join("; ") + `. Last completed PPM: ${asset.lastPpm.type} on ${asset.lastPpm.date}.`,
        });
      }
      for (const h of history.filter((x) => x.summary).slice(0, 5)) {
        facts.push({ id: `cafm:${h.id}`, title: `RFM Connect — ${h.id} ${h.title}`, section: h.date, text: h.summary! });
      }
      for (const j of linked.filter((x) => x.outcome).slice(0, 3)) {
        facts.push({ id: `cafm:${j.id}`, title: `RFM Connect — ${j.id} ${j.title}`, section: (j.completedAt ?? j.raisedAt).slice(0, 10), text: `${j.symptom} Outcome: ${j.outcome}` });
      }
      const pending = jobs.filter((j) => job.linked.includes(j.id) && j.status !== "completed");
      if (pending.length) {
        facts.push({ id: "cafm:linked-open", title: "Linked open work orders", section: job.id, text: pending.map((j) => `${j.id} ${j.title} — ${j.status}: ${j.symptom}`).join(" | ") });
      }
      emit.data("tripSummary", tripSummary);
      s2.done(
        ar
          ? `${facts.length} وقائع من نظام RFM Connect وBMS${tripSummary ? ` · ${tripSummary.sep} توقفات في سبتمبر` : ""}`
          : `${facts.length} facts from RFM Connect and BMS${tripSummary ? ` · ${tripSummary.sep} trips in September, ${tripSummary.oct} in October` : ""}`,
      );

      // ── 3. Manuals & procedures (BM25) ──
      const s3 = emit.step("manuals", ar ? "البحث في الأدلة الفنية والإجراءات المعتمدة" : "Searching approved manuals and procedures");
      const queries = [
        `${job.title} ${job.symptom}`,
        `${asset.model} ${asset.type} troubleshooting ${job.title}`,
        "lockout tagout chiller isolation fans windmilling",
        asset.type === "Chiller" ? "condenser coil cleaning coated coil pH-neutral method statement" : `${asset.type} PPM checklist`,
        asset.type === "Chiller" ? "high discharge pressure causes approach condenser fan bearing" : `${asset.type} fault`,
        "PPE heat stress permit to work roof",
      ];
      const seen = new Set<string>();
      const hits = queries
        .flatMap((q) => search(CORPUS, q, 4))
        .sort((a, b) => b.score - a.score)
        .filter((h) => {
          const k = `${h.docId}|${h.section}`;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        })
        .slice(0, 8);
      const citations: Citation[] = [
        ...facts.map((f, i) => ({ n: i + 1, docId: f.id, title: f.title, ref: "RFM Connect / BMS", section: f.section, quote: f.text })),
        ...hits.map((h, i) => ({ n: facts.length + i + 1, docId: h.docId, title: h.title, ref: h.ref, section: h.section, quote: h.text.length > 420 ? h.text.slice(0, 420) + "…" : h.text })),
      ];
      emit.data("citations", citations);
      s3.done(ar ? `${hits.length} مقاطع من ${new Set(hits.map((h) => h.docId)).size} مستندات` : `${hits.length} passages from ${new Set(hits.map((h) => h.docId)).size} documents`);

      // ── 4. Brief (streamed) ──
      const s4 = emit.step("brief", ar ? "صياغة ملخص المهمة الموثق" : "Writing the cited job brief");
      const inv = loadInventory();
      const catalogue = inv.parts.map((p) => `${p.partNo} — ${p.desc} [${p.kind}]`).join("\n");
      const sources = citations.map((c) => `[${c.n}] ${c.title} — ${c.section}\n${c.quote}`).join("\n\n");
      const system = [
        `You are the RFM Connect field assistant at Raseen Facilities Management, preparing a job brief for ${tech.name} (${tech.role}, ${tech.years} years' experience) before a site visit.`,
        "Use ONLY the numbered sources (work-order history, BMS facts, approved manuals and procedures). Cite every factual statement with [n]. Never invent readings, dates or part numbers.",
        "Be practical and compact — this is read on a phone before driving to site. Use these sections with '###' headings:",
        "### Situation — 2–3 sentences.",
        "### Likely causes — ranked list, most likely first; for each: likelihood (High/Medium/Low), the evidence from history/BMS [n], and the check that confirms it [n].",
        "### Checklist on site — numbered steps in order, including the readings to take with their normal values/thresholds from the manual.",
        "### Safety — LOTO isolation points, PPE, permits and any chemical or heat-stress controls [n].",
        "### Parts & tools — bullet list using exact part numbers from the catalogue only; say which cleaner is approved for this coil type if relevant.",
        "### For the report — what must be recorded for a complete service report.",
        ar ? "Write in Arabic (Modern Standard Arabic, technical register). Keep part numbers, alarm codes, units and job numbers in Latin characters." : "Write in English (British spelling).",
        "Length: 350–520 words.",
      ].join("\n");
      const user = [
        `Job ${job.id} (${job.type}, ${job.priority}) — ${job.title}`,
        `Reported: ${job.symptom}`,
        `Asset ${asset.id}: ${asset.make} ${asset.model} — ${asset.description}; installed ${asset.installed}; location ${asset.location}; criticality ${asset.criticality}; status ${asset.status}.`,
        `Site: ${site.name} (${site.district}), access: ${site.access}`,
        `Technician van: ${tech.van}. Certificates: ${tech.certs.join("; ")}.`,
        "",
        "Parts catalogue (RFM Connect):",
        catalogue,
        "",
        "Sources:",
        sources,
      ].join("\n");
      const gen = chatStream({
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        modelKey,
        temperature: 0.2,
        maxTokens: 1500,
        solution: "19-field-service",
        task: "brief",
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
      s4.done(ar ? `${used} مصادر مستشهد بها` : `${used} sources cited`);

      // ── 5. Parts & tools vs stock (computed) ──
      const s5 = emit.step("parts", ar ? "مطابقة القطع والأدوات مع مخزون الشاحنة والمخازن" : "Checking parts & tools against van and store stock");
      const { object } = await generateObject({
        schema: partsSchema,
        name: "parts_to_bring",
        system:
          "Extract the parts, consumables, tools and PPE the technician should bring, from the job brief. Use ONLY exact part numbers that exist in the catalogue. Include a part that may need replacing (e.g. a component under suspicion) with qty 1. Do not include items the brief advises against.",
        user: `Brief:\n${text}\n\nCatalogue:\n${catalogue}`,
        modelKey,
        maxTokens: 900,
        solution: "19-field-service",
        task: "brief.parts",
      });
      const known = object.parts.filter((p) => inv.parts.some((x) => x.partNo === p.partNo.trim()));
      const parts = partAvailability(
        known.map((p) => ({ partNo: p.partNo.trim(), qty: Math.max(1, Math.round(p.qty)), purpose: p.purpose })),
        inv,
        tech.van,
        site.id,
        asset.description,
      );
      emit.data("parts", parts);
      // Computed safety catch: items carried in the van that must NOT be used on this asset
      const cautions = inv.parts
        .filter((p) => p.partNo === "RFM-CHM-0109" && (p.stock[tech.van] ?? 0) > 0 && /epoxy|coated/i.test(asset.description))
        .map((p) => ({ partNo: p.partNo, desc: p.desc, warning: `In ${tech.van}: not approved for this asset's epoxy-coated coil — use RFM-CHM-0112 (RFM-MS-HVAC-014)` }));
      emit.data("cautions", cautions);
      const gaps = parts.filter((p) => p.status !== "in_van");
      s5.done(
        ar
          ? `${parts.length} بنود · ${parts.filter((p) => p.status === "in_van").length} في الشاحنة · ${gaps.length} تحتاج إجراء${object.parts.length > known.length ? ` · استُبعد ${object.parts.length - known.length} رقم غير معروف` : ""}`
          : `${parts.length} items · ${parts.filter((p) => p.status === "in_van").length} in van · ${gaps.length} need action${object.parts.length > known.length ? ` · ${object.parts.length - known.length} unknown number(s) dropped` : ""}`,
      );

      const ms = Date.now() - started;
      kvSet(briefKey(job.id), { text, citations, parts, cautions, facts: tripSummary, ms, generatedAt: Date.now(), lang });
      addAudit({
        solution: "19-field-service",
        actor: { name: "NARVO Agent", role: "Field service assistant", kind: "agent" },
        action: "Prepared job brief",
        subject: `${job.id} · ${asset.id}`,
        detail: `${used} sources cited · ${parts.length} parts/tools checked (${gaps.length} not in van) · ${(ms / 1000).toFixed(1)} s`,
      });
      emit.data("briefMs", ms);
    },
    { modelKey },
  );
}
