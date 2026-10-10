import { z } from "zod";
import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { generateObject } from "@/lib/ai/json";
import { addAudit, appendRecord, patchRecord } from "@/lib/store/db";
import { publicImageDataUrl } from "@/lib/world/data";
import { COL, getInspection, loadTaxonomy } from "@/app/solutions/18-visual-inspection/_lib/data";
import { repeatCheck } from "@/app/solutions/18-visual-inspection/_lib/rules";
import type { Finding } from "@/app/solutions/18-visual-inspection/_lib/types";

const schema = z.object({
  scene: z.string().describe("One or two sentences: what the photo shows (structure, stage of works, people, equipment)."),
  findings: z
    .array(
      z.object({
        code: z.string().describe("Defect code from the checklist, e.g. D03"),
        title: z.string().describe("Short finding title, max 9 words"),
        description: z.string().describe("What exactly is visible and where in the photo, 1–2 sentences"),
        confidence: z.number().min(0).max(1),
        box: z.array(z.number()).describe("[x_min, y_min, x_max, y_max] in 0–1000 relative coordinates of the image"),
      }),
    )
    .max(8),
  notAssessable: z.array(z.string()).describe("Checklist codes that cannot be judged from this photo").optional(),
});

function normBox(b: number[] | undefined | null): [number, number, number, number] | null {
  if (!b || b.length !== 4 || b.some((v) => !Number.isFinite(v))) return null;
  const scale = b.every((v) => v <= 1.0001) ? 1 : 1000;
  let [x1, y1, x2, y2] = b.map((v) => Math.min(1, Math.max(0, v / scale)));
  if (x2 < x1) [x1, x2] = [x2, x1];
  if (y2 < y1) [y1, y2] = [y2, y1];
  if (x2 - x1 < 0.02) x2 = Math.min(1, x1 + 0.04);
  if (y2 - y1 < 0.02) y2 = Math.min(1, y1 + 0.04);
  return [x1, y1, x2, y2].map((v) => Math.round(v * 1000) / 1000) as [number, number, number, number];
}

/** Vision screening of an inspection photo against the CSSR-2025 defect checklist → proposed findings for review. */
export async function POST(req: Request) {
  const body = await readBody<{ inspectionId?: string; photo?: number }>(req);
  const { modelKey, lang } = getPrefs(req, body);
  const ar = lang === "ar";
  const { state, insp } = getInspection(body.inspectionId ?? "");
  if (!insp) return new Response("Inspection not found", { status: 404 });
  const photoIdx = Math.max(0, Math.min(insp.photos.length - 1, body.photo ?? 0));
  const photo = insp.photos[photoIdx];

  return eventStream(
    req,
    async (emit) => {
      const tax = loadTaxonomy();
      const s1 = emit.step("load", ar ? "تحميل سجل التفتيش وقائمة الفحص" : "Loading inspection record and checklist");
      const image = photo.src.startsWith("data:") ? photo.src : publicImageDataUrl(photo.src);
      s1.done(
        ar
          ? `${insp.id} · ${insp.plot} · ${tax.defects.length} نوعاً من العيوب (CSSR-2025)`
          : `${insp.id} · ${insp.plot} · ${tax.defects.length} defect types (CSSR-2025)`,
      );

      const s2 = emit.step("vision", ar ? "فحص الصورة بنموذج الرؤية" : "Vision model screening the photo");
      const checklist = tax.defects.map((d) => `${d.code} ${d.name} (${d.article}) — look for: ${d.visualCues}`).join("\n");
      const { object, ms } = await generateObject({
        schema,
        name: "site_inspection_findings",
        system: [
          "You are the AI-assisted image review for the Marsa Al Noor Development Authority (MNDA) Field Operations & Inspection Department.",
          "You screen construction-site photos against the MNDA Construction Site Safety Regulation (CSSR-2025) checklist below and propose candidate findings for an authorised inspector to review. Your flags are advisory only.",
          "Rules:",
          "- Use only the checklist codes. Flag a defect only when it is actually visible in the photo; do not assume what is outside the frame.",
          "- One finding per defect per location; at most 6 findings, most serious first.",
          "- For each finding give a tight bounding box around the visible defect as [x_min, y_min, x_max, y_max] in 0–1000 coordinates relative to the image (0,0 top-left, 1000,1000 bottom-right).",
          "- confidence: your honest probability (0–1) that an inspector would accept the finding; lower it when the view is partial, distant or ambiguous.",
          "- Describe where in the image the defect is (e.g. 'left scaffold, third lift').",
          "- Photograph the hazard, not the person: never describe faces or identify individuals.",
          `- Write title and description in ${ar ? "Arabic (Modern Standard Arabic, formal inspection register)" : "English"}.`,
          "",
          "Checklist:",
          checklist,
        ].join("\n"),
        user: [
          {
            type: "text",
            text: `Inspection ${insp.id}, plot ${insp.plot}, project: ${insp.project}. Contractor: ${insp.contractor}. Photo caption: ${photo.caption}. Inspector's field note: ${insp.note || "—"}`,
          },
          { type: "image_url", image_url: { url: image } },
        ],
        modelKey,
        maxTokens: 1800,
        temperature: 0.1,
        solution: "18-visual-inspection",
        task: "vision.findings",
      });
      const valid = object.findings.filter((f) => tax.defects.some((d) => d.code === f.code.trim().toUpperCase()));
      s2.done(
        ar
          ? `${valid.length} ملاحظات مرشحة · ${(ms / 1000).toFixed(1)} ث${object.findings.length > valid.length ? ` · استُبعد ${object.findings.length - valid.length} رمز غير معروف` : ""}`
          : `${valid.length} candidate findings · ${(ms / 1000).toFixed(1)} s${object.findings.length > valid.length ? ` · ${object.findings.length - valid.length} unknown code(s) dropped` : ""}`,
      );
      emit.data("scene", object.scene);

      const s3 = emit.step("map", ar ? "ربط الملاحظات بمواد اللائحة ودرجات الخطورة وسجل التكرار" : "Mapping to CSSR-2025 articles, severity and repeat history");
      const now = Date.now();
      const findings: Finding[] = valid.map((f, i) => ({
        id: `F-${now.toString(36).toUpperCase()}-${i + 1}`,
        inspectionId: insp.id,
        photo: photoIdx,
        code: f.code.trim().toUpperCase(),
        title: f.title.trim(),
        description: f.description.trim(),
        bbox: normBox(f.box),
        confidence: Math.round(Math.max(0, Math.min(1, f.confidence)) * 100) / 100,
        source: "ai",
        status: "proposed",
        createdAt: now,
        lang,
      }));
      const repeats = findings
        .map((f) => ({ code: f.code, r: repeatCheck(f.code, insp, state.tasks, now) }))
        .filter((x) => x.r.prior);
      s3.done(
        (ar ? "المواد: " : "Articles: ") +
          (findings.map((f) => `${f.code}→${tax.defects.find((d) => d.code === f.code)!.article}`).join(", ") || "—") +
          (repeats.length ? (ar ? ` · تكرار سابق: ${repeats.map((x) => x.code).join(", ")}` : ` · prior violation on this plot: ${repeats.map((x) => x.code).join(", ")}`) : ""),
      );

      const s4 = emit.step("save", ar ? "حفظ الملاحظات المقترحة لمراجعة المفتش" : "Saving proposed findings for inspector review");
      for (const old of state.findings.filter((x) => x.inspectionId === insp.id && x.photo === photoIdx && x.status === "proposed" && x.source === "ai")) {
        patchRecord(COL.findings, old.id, { status: "superseded" });
      }
      for (const f of findings) appendRecord(COL.findings, f as unknown as Record<string, unknown> & { id: string });
      if (insp.status === "awaiting_review") patchRecord(COL.inspections, insp.id, { status: "in_review" });
      addAudit({
        solution: "18-visual-inspection",
        actor: { name: "NARVO Agent", role: "AI-assisted image review (advisory)", kind: "agent" },
        action: "Screened inspection photo",
        subject: `${insp.id} · photo ${photoIdx + 1}`,
        detail: findings.length ? findings.map((f) => `${f.code} (${Math.round((f.confidence ?? 0) * 100)}%)`).join(", ") : "No defects flagged",
      });
      emit.data("findings", findings);
      emit.data("repeats", repeats);
      s4.done(ar ? "بانتظار قرار المفتش (قبول / رفض / إضافة)" : "Awaiting inspector decision (accept / reject / add)");
    },
    { modelKey },
  );
}
