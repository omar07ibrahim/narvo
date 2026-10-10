import { z } from "zod";
import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { generateObject } from "@/lib/ai/json";
import { addAudit } from "@/lib/store/db";
import { search } from "@/lib/retrieval";
import { publicImageDataUrl } from "@/lib/world/data";
import type { Citation } from "@/lib/ai/events";
import { CORPUS, loadState, loadTaxonomy } from "@/app/solutions/18-visual-inspection/_lib/data";

const schema = z.object({
  sameLocation: z.enum(["likely", "unlikely", "uncertain"]).describe("Does the after photo plausibly show the same location/element as the before photo?"),
  verdict: z.enum(["resolved", "not_resolved", "inconclusive"]),
  confidence: z.number().min(0).max(1),
  observations: z.array(z.string()).describe("What the after photo shows relative to the requirement and closure evidence, 2–4 short points"),
  remaining: z.array(z.string()).describe("Issues still visible or evidence still missing; empty if none"),
  recommendation: z.enum(["close", "keep_open"]),
  reason: z.string().describe("One sentence the inspector can record as the decision reason"),
});

/** Before/after comparison for a corrective task: does the after photo show the defect corrected? (advisory) */
export async function POST(req: Request) {
  const body = await readBody<{ taskId?: string; afterPhoto?: string }>(req);
  const { modelKey, lang } = getPrefs(req, body);
  const ar = lang === "ar";
  const state = loadState();
  const task = state.tasks.find((t) => t.id === body.taskId);
  if (!task) return new Response("Task not found", { status: 404 });
  if (!body.afterPhoto?.startsWith("data:image/")) return new Response("afterPhoto (image data URL) required", { status: 400 });
  const insp = state.inspections.find((i) => i.id === task.inspectionId);
  const finding = state.findings.find((f) => f.id === task.findingId);
  if (!insp || !finding) return new Response("Inspection or finding not found", { status: 404 });

  return eventStream(
    req,
    async (emit) => {
      const tax = loadTaxonomy();
      const d = tax.defects.find((x) => x.code === task.code)!;
      const s1 = emit.step("evidence", ar ? "استرجاع متطلبات دليل الإغلاق" : "Retrieving closure-evidence requirements");
      const hits = search(CORPUS, [`${d.code} ${d.name} closure evidence`, `${d.article} ${d.name}`], 3);
      const citations: Citation[] = hits.map((h, i) => ({ n: i + 1, docId: h.docId, title: h.title, ref: h.ref, section: h.section, quote: h.text.slice(0, 420) }));
      emit.data("citations", citations);
      s1.done(hits.map((h) => h.section).join(" · "));

      const s2 = emit.step("compare", ar ? "مقارنة صورة ما قبل وما بعد بنموذج الرؤية" : "Comparing before and after photos");
      const before = insp.photos[finding.photo]?.src ?? insp.photos[0].src;
      const beforeUrl = before.startsWith("data:") ? before : publicImageDataUrl(before);
      const box = finding.bbox ? `The defect was boxed at approximately x ${Math.round(finding.bbox[0] * 100)}–${Math.round(finding.bbox[2] * 100)}%, y ${Math.round(finding.bbox[1] * 100)}–${Math.round(finding.bbox[3] * 100)}% of the before photo.` : "";
      const { object } = await generateObject({
        schema,
        name: "closure_verification",
        system: [
          "You assist an MNDA authorised site inspector in verifying closure of a corrective action under CSSR-2025 Art. 31.5.",
          "Image 1 is the BEFORE photo from the inspection; image 2 is the AFTER photo submitted as closure evidence.",
          "Judge only what is visible. 'verdict' is about the corrective action: resolved only if the after photo clearly shows the required control in place (e.g. caps on all visible starters, barriers around the excavation, guardrails with toe boards). Partial fixes are not_resolved; if the relevant element is not shown, inconclusive.",
          "Judge the location separately in 'sameLocation': a close-up of the corrected element is acceptable evidence, but say 'uncertain' when the viewpoint differs from the before photo and 'unlikely' when it clearly shows a different site.",
          "recommendation: 'close' only if verdict is resolved and sameLocation is not 'unlikely'; otherwise 'keep_open'. Mention any location doubt in the reason (CSSR-2025 Art. 31.5 asks for the same viewpoint). Your output is advisory; the inspector decides.",
          `Write observations, remaining and reason in ${ar ? "Arabic (Modern Standard Arabic)" : "English"}.`,
        ].join("\n"),
        user: [
          {
            type: "text",
            text: `Finding ${d.code} — ${d.name} (${d.article}, ${task.severity}). Observed at inspection ${insp.id}: ${finding.title}. ${finding.description} ${box}\nRequirement: ${d.requirement}\nClosure evidence guidance:\n${hits.map((h) => h.text.slice(0, 600)).join("\n---\n")}`,
          },
          { type: "text", text: "Image 1 — BEFORE:" },
          { type: "image_url", image_url: { url: beforeUrl } },
          { type: "text", text: "Image 2 — AFTER (closure evidence):" },
          { type: "image_url", image_url: { url: body.afterPhoto! } },
        ],
        modelKey,
        maxTokens: 900,
        temperature: 0.1,
        solution: "18-visual-inspection",
        task: "vision.closure",
      });
      emit.data("verdict", object);
      s2.done(
        `${object.verdict === "resolved" ? (ar ? "تم التصحيح" : "Resolved") : object.verdict === "not_resolved" ? (ar ? "لم يُصحح" : "Not resolved") : ar ? "غير حاسم" : "Inconclusive"} · ${Math.round(object.confidence * 100)}% · ${ar ? "الموقع" : "same location"}: ${object.sameLocation}`,
      );
      addAudit({
        solution: "18-visual-inspection",
        actor: { name: "NARVO Agent", role: "AI-assisted image review (advisory)", kind: "agent" },
        action: "Compared closure evidence",
        subject: `${task.id} · ${task.code}`,
        detail: `${object.verdict} (${Math.round(object.confidence * 100)}%) — ${object.reason}`,
      });
      emit.step("decide", ar ? "بانتظار قرار المفتش" : "Awaiting inspector decision").waiting(ar ? "إغلاق أو إبقاء مفتوحة مع السبب" : "Close or keep open with a reason");
    },
    { modelKey },
  );
}
