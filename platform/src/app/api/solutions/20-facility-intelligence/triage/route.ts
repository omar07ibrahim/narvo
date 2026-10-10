import { z } from "zod";
import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { generateObject } from "@/lib/ai/json";
import type { ContentPart } from "@/lib/ai/client";
import { triageSystem } from "@/app/solutions/20-facility-intelligence/_lib/prompts";
import { loadPpm, loadSites, SLUG } from "@/app/solutions/20-facility-intelligence/_lib/data";

const schema = z.object({
  site: z.enum(["AGC", "HQ"]),
  category: z.enum(["Comfort — too hot", "Comfort — too cold", "Ventilation / air quality", "Water leak / plumbing", "Electrical / lighting", "Access / security", "Cleaning / hygiene", "Structural / fabric", "Other"]),
  zone: z.string().describe("zone id from the register, or 'unknown'"),
  asset: z.string().describe("asset id from the register, or 'unknown'"),
  priority: z.enum(["P1", "P2", "P3", "P4"]),
  priorityReason: z.string(),
  observation: z.string().describe("what the text / photo shows, one or two sentences"),
  likelyCause: z.string(),
  knownIssue: z.object({ match: z.boolean(), reference: z.string().nullable(), reason: z.string() }),
  suggestedAction: z.string(),
  reply: z.string().describe("short reply to the reporter, in the reporter's language"),
  confidence: z.number().min(0).max(1),
});

export async function POST(req: Request) {
  const body = await readBody<{ text?: string; image?: string; site?: "AGC" | "HQ" }>(req);
  const { modelKey, lang } = getPrefs(req, body);
  const ar = lang === "ar";
  const text = (body.text ?? "").trim().slice(0, 3000);
  const image = typeof body.image === "string" && body.image.startsWith("data:image/") ? body.image : null;
  if (!text && !image) return new Response(ar ? "أدخل نص البلاغ أو أرفق صورة" : "Provide a report text or a photo", { status: 400 });
  if (image && image.length > 8_000_000) return new Response("Image too large (max ~6 MB)", { status: 413 });

  return eventStream(
    req,
    async (emit) => {
      const s1 = emit.step("register", ar ? "تحميل سجل المساحات والأصول" : "Loading the space and asset register");
      const sites = loadSites();
      const register = sites.map((s) => ({
        site: s.id,
        name: s.name,
        zones: s.zones.map((z) => ({ id: z.id, name: z.name, nameAr: z.nameAr, ahu: z.ahu })),
        assets: s.assets.map((a) => ({ id: a.id, name: a.name, location: a.location })),
      }));
      const known = [
        "Al Ghaf: CH-02 high-pressure trips on hot afternoons (11 in September) → Multipurpose Hall / Ladies' Fitness overheating; contractor reports CH-02 coils cleaned 6 Oct (JOB-RFM-26-04471), verification pending; CH-01 coil cleaning overdue since 15 Aug (PPM-AGC-CH01-CCC).",
        "Al Ghaf: CHW pump P-02 seal weeping (2 Oct).",
        "MNDA Tower: VAV-14-07 actuator replaced 17 Sep (Level 14 north warm).",
        ...loadPpm()
          .filter((p) => p.status === "Overdue")
          .map((p) => `Overdue PPM ${p.id}: ${p.task} (${p.asset}) due ${p.due}.`),
      ];
      s1.done(ar ? `${register.reduce((a, s) => a + s.zones.length, 0)} مساحة · ${register.reduce((a, s) => a + s.assets.length, 0)} أصلاً` : `${register.reduce((a, s) => a + s.zones.length, 0)} zones · ${register.reduce((a, s) => a + s.assets.length, 0)} assets`);

      const s2 = emit.step("triage", image ? (ar ? "قراءة الصورة والنص وتصنيف البلاغ" : "Reading the photo and text, classifying the report") : ar ? "تصنيف البلاغ وربطه بالمساحة والأصل" : "Classifying and linking the report");
      const user: ContentPart[] = [
        {
          type: "text",
          text: `Site register:\n${JSON.stringify(register)}\n\nKnown open issues:\n- ${known.join("\n- ")}\n\nContract priorities (Schedule 3): P1 emergency (loss of >50% cooling to occupied area above 40 °C, risk to life/security; respond 1 h), P2 urgent (partial loss of service affecting users; respond 4 h), P3 routine (respond 24 h), P4 planned.\n\nDefault site if unclear: ${body.site ?? "AGC"}.\n\nReport${image ? " (photo attached)" : ""}:\n${text || "(photo only)"}`,
        },
      ];
      if (image) user.push({ type: "image_url", image_url: { url: image } });
      const { object } = await generateObject({
        schema,
        name: "triage",
        system: triageSystem(),
        user,
        modelKey,
        solution: SLUG,
        task: image ? "triage.vision" : "triage",
        maxTokens: 1200,
        signal: emit.signal,
      });
      const site = sites.find((s) => s.id === object.site)!;
      const zone = site.zones.find((z) => z.id === object.zone);
      const asset = site.assets.find((a) => a.id === object.asset);
      emit.data("triage", { ...object, zoneName: zone ? (ar ? zone.nameAr : zone.name) : null, assetName: asset?.name ?? null });
      s2.done(`${object.category} · ${object.priority} · ${zone?.name ?? object.zone} · ${(object.confidence * 100).toFixed(0)}%`);
    },
    { modelKey },
  );
}
