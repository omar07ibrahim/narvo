import { z } from "zod";
import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { generateObject } from "@/lib/ai/json";
import type { ContentPart } from "@/lib/ai/client";
import { addAudit, kvSet, patchRecord } from "@/lib/store/db";
import { COL, draftKey, getBrief, jobContext, loadInventory } from "@/app/solutions/19-field-service/_lib/data";
import { addWorkingDays, partAvailability, scoreReport } from "@/app/solutions/19-field-service/_lib/rules";
import type { Reading, ServiceReport } from "@/app/solutions/19-field-service/_lib/types";

const schema = z.object({
  arrival: z.string().nullable().describe("hh:mm or null if not stated"),
  departure: z.string().nullable().describe("hh:mm or null if not stated"),
  symptomOnArrival: z.string().describe("Fault as reported and as found, operating state"),
  alarms: z.array(z.string()).describe("Alarm codes with times, e.g. 'A21 circuit B 14:37 (9 Oct)'"),
  readings: z.array(
    z.object({
      name: z.string().describe("e.g. 'Discharge pressure', 'Condenser approach', 'Fan CB-F5 current'"),
      value: z.string(),
      unit: z.string().describe("Unit exactly; '—' if none stated"),
      circuit: z.string().nullable(),
      phase: z.enum(["before", "after", "single"]).nullable(),
    }),
  ),
  workPerformed: z.array(z.string()).describe("Ordered steps actually done"),
  partsUsed: z.array(z.object({ partNo: z.string(), qty: z.number(), source: z.string().nullable().describe("VAN-117, SITE-AGCC or STORE if stated") })),
  rootCause: z.string().describe("Cause, or 'Not determined' with reason"),
  rootCauseEvidence: z.string().describe("Readings/observations supporting the cause; empty if none"),
  unresolved: z.array(
    z.object({
      description: z.string(),
      partNo: z.string().nullable().describe("Catalogue part number needed, if any"),
      qty: z.number().nullable(),
      owner: z.string().describe("Named person responsible"),
      priority: z.enum(["P1", "P2", "P3", "P4"]),
      reason: z.string().describe("Why it is still open (e.g. part not in van stock)"),
    }),
  ),
  safety: z.object({ loto: z.boolean(), isolationPoints: z.string(), permit: z.string().nullable(), notes: z.string() }),
  photos: z.array(z.object({ index: z.number(), caption: z.string(), phase: z.enum(["before", "after", "other"]) })),
  photoObservations: z.array(z.string()).describe("What the photos show that matters for the report"),
  customerSignOff: z.object({ name: z.string().nullable(), role: z.string().nullable(), time: z.string().nullable(), reasonIfMissing: z.string().nullable() }),
  recommendations: z.array(z.string()),
});

function flagReading(r: Reading): Reading["flag"] {
  const v = parseFloat(String(r.value).replace(/,/g, ""));
  if (!Number.isFinite(v)) return null;
  const n = r.name.toLowerCase();
  if (n.includes("approach")) return v > 18 ? "high" : v < 8 ? "low" : "normal";
  if (n.includes("subcool")) return v > 10 ? "high" : v < 4 ? "low" : "normal";
  if (n.includes("superheat")) return v > 12 ? "high" : v < 3 ? "low" : "normal";
  if (n.includes("vibration")) return v > 7.1 ? "high" : v > 4.5 ? "high" : "normal";
  if (n.includes("fan") && /current|amp/.test(n)) return v > 5.1 ? "high" : "normal";
  if (n.includes("discharge") && n.includes("pressure") && r.unit.toLowerCase().includes("kpa")) return v >= 1790 ? "high" : "normal";
  return null;
}

/** Visit capture → structured service report (notes + photos via the multimodal model) → computed checks and follow-ups → draft for supervisor. */
export async function POST(req: Request) {
  const body = await readBody<{ jobId?: string; notes?: string; photos?: Array<{ dataUrl: string; thumb?: string; caption?: string; phase?: string }> }>(req);
  const { modelKey, lang } = getPrefs(req, body);
  const ar = lang === "ar";
  const ctx = jobContext(body.jobId ?? "");
  if (!ctx) return new Response("Job not found", { status: 404 });
  const notes = (body.notes ?? "").trim();
  if (notes.length < 20) return new Response(ar ? "الملاحظات قصيرة جداً" : "Visit notes are too short", { status: 400 });
  const photos = (body.photos ?? []).filter((p) => p.dataUrl?.startsWith("data:image/")).slice(0, 4);
  const { job, asset, site, tech, supervisor } = ctx;

  return eventStream(
    req,
    async (emit) => {
      const t0 = Date.now();
      const inv = loadInventory();
      const s1 = emit.step("context", ar ? "تحميل سياق المهمة والملخص والمخزون" : "Loading job context, brief and stock");
      const brief = getBrief(job.id);
      s1.done(`${job.id} · ${asset.id} · ${tech.van}${brief ? (ar ? " · الملخص متاح" : " · brief available") : ""} · ${photos.length} ${ar ? "صور" : "photo(s)"}`);

      const s2 = emit.step("extract", ar ? "تحويل الملاحظات الصوتية والصور إلى تقرير منظم" : "Turning voice notes and photos into a structured report");
      const user: ContentPart[] = [
        {
          type: "text",
          text: [
            `Job ${job.id} (${job.type}) — ${job.title}. Asset ${asset.id}: ${asset.make} ${asset.model}, ${asset.description}. Site ${site.name}; customer contact ${site.contact.name} (${site.contact.role}).`,
            `Technician ${tech.name} (${tech.id}), van ${tech.van}; supervisor ${supervisor.name}.`,
            `Reported fault: ${job.symptom}`,
            "",
            "Technician's visit notes (dictated, may be informal):",
            notes,
            photos.length ? `\n${photos.length} photo(s) follow, in order, with the technician's captions.` : "\nNo photos attached.",
            "",
            "Parts catalogue (for part numbers):",
            inv.parts.map((p) => `${p.partNo} — ${p.desc}`).join("\n"),
          ].join("\n"),
        },
      ];
      photos.forEach((p, i) => {
        user.push({ type: "text", text: `Photo ${i} — caption: ${p.caption || "(none)"}; phase: ${p.phase || "unspecified"}` });
        user.push({ type: "image_url", image_url: { url: p.dataUrl } });
      });
      const { object, ms } = await generateObject({
        schema,
        name: "service_report",
        system: [
          "You structure a field technician's visit notes and photos into a service report for Raseen Facilities Management (standard RFM-QA-STD-004).",
          "Rules: use only what the notes and photos state; never invent readings, times, part numbers or names. If something is not stated, leave it null/empty — gaps are scored, not filled.",
          "Readings: one entry per value with its unit and circuit; mark before/after when the notes compare them.",
          "Any issue not fixed on this visit (e.g. a component that needs a part not available) goes into 'unresolved' with a catalogue part number if one fits, an owner (the technician unless the notes say otherwise) and the reason.",
          "Root cause must cite evidence from readings/observations; resetting an alarm is not a root cause.",
          "Photos: describe what each shows that matters (coil condition, damage, readings on gauges).",
          `Write all free text in ${ar ? "Arabic (Modern Standard Arabic, technical register; keep part numbers, units and codes in Latin characters)" : "English"}.`,
        ].join("\n"),
        user,
        modelKey,
        maxTokens: 2600,
        temperature: 0.1,
        solution: "19-field-service",
        task: "report.extract",
      });
      s2.done(ar ? `${object.readings.length} قراءات · ${object.workPerformed.length} أعمال · ${object.unresolved.length} قضايا معلقة · ${(ms / 1000).toFixed(1)} ث` : `${object.readings.length} readings · ${object.workPerformed.length} actions · ${object.unresolved.length} unresolved · ${(ms / 1000).toFixed(1)} s`);

      // ── Computed checks ──
      const s3 = emit.step("checks", ar ? "التحقق من القطع والقراءات وإعداد المتابعات" : "Checking parts, readings and preparing follow-ups");
      const report: ServiceReport = {
        jobId: job.id,
        assetId: asset.id,
        arrival: object.arrival,
        departure: object.departure,
        symptomOnArrival: object.symptomOnArrival,
        alarms: object.alarms,
        readings: object.readings.map((r) => ({ ...r, flag: flagReading(r as Reading) })),
        workPerformed: object.workPerformed,
        partsUsed: object.partsUsed.map((p) => {
          const part = inv.parts.find((x) => x.partNo === p.partNo.trim());
          let source = p.source;
          if (!source && part) source = (part.stock[tech.van] ?? 0) >= p.qty ? tech.van : (part.stock[`SITE-${site.id}`] ?? 0) >= p.qty ? `SITE-${site.id}` : "STORE";
          return { partNo: p.partNo.trim(), desc: part?.desc ?? "Not in catalogue", qty: p.qty, source };
        }),
        rootCause: object.rootCause,
        rootCauseEvidence: object.rootCauseEvidence,
        unresolved: object.unresolved,
        safety: object.safety,
        photos: object.photos.map((p) => ({ caption: p.caption, phase: p.phase })),
        photoObservations: object.photoObservations,
        customerSignOff: object.customerSignOff,
        technicianDeclaration: { name: tech.name, staffId: tech.id, cert: tech.certs.find((c) => /refrigerant/i.test(c)) ?? null, signed: true },
        recommendations: object.recommendations,
      };
      const today = new Date(Date.now() + 4 * 3600000).toISOString().slice(0, 10);
      const followUps = report.unresolved.map((u) => {
        const avail = u.partNo ? partAvailability([{ partNo: u.partNo, qty: u.qty ?? 1, purpose: u.description }], inv, tech.van, site.id)[0] : null;
        const lead = avail ? (avail.status === "order" ? avail.leadDays : avail.status === "central_store" ? 1 : 0) : 1;
        return {
          ...u,
          availability: avail,
          partStatus: avail ? (avail.status === "order" ? `To be ordered — lead time ${avail.leadDays} working days` : avail.action) : "No part needed",
          targetDate: addWorkingDays(today, lead + 1),
        };
      });
      const flagged = report.readings.filter((r) => r.flag === "high" || r.flag === "low");
      const notInStock = report.partsUsed.filter((p) => {
        const part = inv.parts.find((x) => x.partNo === p.partNo);
        return !part || (p.source && (part.stock[p.source] ?? 0) < p.qty);
      });
      s3.done(
        ar
          ? `${followUps.length} متابعة · ${flagged.length} قراءات خارج المدى الطبيعي${notInStock.length ? ` · ${notInStock.length} قطع لا تطابق المخزون` : ""}`
          : `${followUps.length} follow-up(s) · ${flagged.length} reading(s) outside normal range${notInStock.length ? ` · ${notInStock.length} part line(s) don't match stock` : ""}`,
      );

      const s4 = emit.step("score", ar ? "تقييم الاكتمال وفق RFM-QA-STD-004" : "Scoring completeness (RFM-QA-STD-004)");
      const completeness = scoreReport(report, job, { followUpJobs: followUps.length });
      s4.done(`${completeness.total}%${completeness.pass ? "" : ` · ${completeness.gates.map((g) => (ar ? g.ar : g.en)).join("; ")}`}`);

      const draft = {
        report,
        followUps,
        completeness,
        stockMismatch: notInStock.map((p) => p.partNo),
        generatedAt: Date.now(),
        ms: Date.now() - t0,
        notes,
        photos: photos.map((p, i) => ({ thumb: p.thumb?.startsWith("data:image/") && p.thumb.length < 200_000 ? p.thumb : p.dataUrl.length < 350_000 ? p.dataUrl : "", caption: report.photos[i]?.caption ?? p.caption ?? "", phase: report.photos[i]?.phase ?? p.phase ?? "other" })),
      };
      kvSet(draftKey(job.id), draft);
      patchRecord(COL.jobs, job.id, { status: "awaiting_review" });
      addAudit({
        solution: "19-field-service",
        actor: { name: tech.name, role: tech.role, kind: "human" },
        action: "Submitted draft service report",
        subject: `${job.id} · ${asset.id}`,
        detail: `Completeness ${completeness.total}% · ${followUps.length} unresolved issue(s) · drafted by NARVO from voice notes${photos.length ? ` and ${photos.length} photo(s)` : ""}`,
      });
      emit.data("draft", draft);
    },
    { modelKey },
  );
}
