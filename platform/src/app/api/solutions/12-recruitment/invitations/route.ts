import { z } from "zod";
import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { generateObject } from "@/lib/ai/json";
import { createApproval, kvGet, type Effect } from "@/lib/store/db";
import { HR_DIRECTOR, INV_COL, KV, REQ_COL, SLUG, loadApplications, loadRequisition } from "@/app/solutions/12-recruitment/_lib/data";
import type { Invitation } from "@/app/solutions/12-recruitment/_lib/types";

export const maxDuration = 120;

const schema = z.object({
  subjectEn: z.string(),
  bodyEn: z.string().describe("Plain-text email body in English with the placeholders"),
  subjectAr: z.string(),
  bodyAr: z.string().describe("Plain-text email body in formal Arabic with the placeholders"),
});

const SLOTS = [
  { date: "2026-10-14", time: "09:00" },
  { date: "2026-10-14", time: "10:30" },
  { date: "2026-10-14", time: "12:00" },
  { date: "2026-10-15", time: "09:00" },
  { date: "2026-10-15", time: "10:30" },
  { date: "2026-10-15", time: "12:00" },
  { date: "2026-10-16", time: "09:00" },
  { date: "2026-10-16", time: "10:30" },
];

const fill = (t: string, v: Record<string, string>) => t.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => v[k] ?? `{{${k}}}`);

/**
 * Drafts bilingual interview invitations for the approved finalists. The model writes one template with placeholders
 * (it never sees candidate names); the server fills in each finalist. Sending requires the HR Director's approval.
 */
export async function POST(req: Request) {
  const body = await readBody<Record<string, unknown>>(req);
  const { modelKey, lang } = getPrefs(req, body);
  const shortlist = kvGet<string[]>(KV.shortlist) ?? [];
  if (shortlist.length < 1) return new Response("No shortlist selected yet.", { status: 400 });

  return eventStream(
    req,
    async (emit) => {
      const r = loadRequisition();
      const apps = loadApplications();
      const s1 = emit.step("draft", lang === "ar" ? "صياغة دعوة ثنائية اللغة" : "Drafting a bilingual invitation");
      const panel = (r.interviewPanel ?? []).map((p) => `${p.name} (${p.title})`).join("; ");
      const { object: tpl } = await generateObject({
        schema,
        name: "interview_invitation",
        system: [
          "You draft formal interview invitation emails for the Human Capital department of the Marsa Al Noor Development Authority (MNDA), a UAE government authority.",
          "Write ONE template in English and ONE in Arabic (formal MSA, UAE government register — e.g. «يسرّنا دعوتكم», «نأمل التكرم بتأكيد»). Use these placeholders exactly: {{name}} (candidate name), {{reference}} (application number), {{date}}, {{time}}, {{dateAr}}. Do not invent names.",
          "Include: congratulations on being shortlisted for the role; format (75-minute panel interview, technical case discussion on a permit file); venue; what to bring (Emirates ID or passport, original degree certificate, professional registration, portfolio of 2 permit reviews); confirmation deadline; contact; a note that reasonable adjustments are available on request; a short privacy line (interview notes are taken with the candidate's consent and used only for this recruitment). Plain text, 140-200 words each, signed by the Human Capital department.",
        ].join("\n"),
        user: [
          `Role: ${r.title} / ${r.titleAr ?? ""} — requisition ${r.id}, ${r.department}.`,
          `Venue: MNDA Tower, Corniche Road, Downtown (MN-01) — 12th floor, Planning & Building Permits meeting room 12-03. Parking at the visitors' entrance.`,
          `Panel: ${panel || "Eng. Omar Yousef Al Hammadi (Director, Planning & Building Permits) and two panel members"}.`,
          `Confirm by: Tuesday 13 October 2026, 15:00, by replying to this email or calling +971 2 663 2140 (Talent Acquisition).`,
          `Recruiter: ${r.recruiter ? `${r.recruiter.name}, ${r.recruiter.title}` : "Talent Acquisition team"}, careers@mnda.gov.ae.`,
        ].join("\n"),
        modelKey,
        solution: SLUG,
        task: "invitation-draft",
        maxTokens: 1600,
      });
      s1.done();

      const s2 = emit.step("personalise", lang === "ar" ? "تعبئة الدعوات للمرشحين النهائيين" : "Personalising for each finalist");
      const invitations: Invitation[] = shortlist.map((id, i) => {
        const a = apps.find((x) => x.id === id);
        const slot = SLOTS[i % SLOTS.length];
        const d = new Date(`${slot.date}T00:00:00Z`);
        const date = d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
        const dateAr = d.toLocaleDateString("ar-AE-u-nu-latn", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
        const v = { name: a?.candidate.name ?? id, reference: id, date, dateAr, time: slot.time };
        const vAr = { ...v, name: a?.candidate.nameAr || a?.candidate.name || id };
        return {
          id: `INV-077-${id.split("-").pop()}`,
          appId: id,
          to: a?.candidate.email ?? "",
          subjectEn: fill(tpl.subjectEn, v),
          bodyEn: fill(tpl.bodyEn, v),
          subjectAr: fill(tpl.subjectAr, vAr),
          bodyAr: fill(tpl.bodyAr, vAr),
          slot: `${slot.date} ${slot.time}`,
          status: "sent",
          createdAt: new Date().toISOString(),
        };
      });
      emit.data("invitations", invitations);
      s2.done(`${invitations.length} ${lang === "ar" ? "دعوات" : "invitations"}`);

      const s3 = emit.step("approval", lang === "ar" ? "طلب اعتماد مديرة الموارد البشرية" : "Routing to the HR Director for approval");
      const effects: Effect[] = [
        ...invitations.map((inv) => ({ type: "append" as const, collection: INV_COL, item: inv as unknown as Record<string, unknown> & { id: string } })),
        { type: "patch", collection: REQ_COL, id: r.id, patch: { stage: "invitations_sent", invitationsSentAt: new Date().toISOString() } },
        { type: "audit", action: "Interview invitations sent", subject: r.id, detail: invitations.map((x) => `${x.appId} ${x.slot}`).join("; ") },
      ];
      const approval = createApproval({
        solution: SLUG,
        title: `Send interview invitations — ${invitations.length} finalists`,
        summary: `Bilingual invitations (EN/AR) for ${r.title}; interviews ${invitations[0]?.slot.slice(0, 10)} to ${invitations.at(-1)?.slot.slice(0, 10)} at MNDA Tower, room 12-03. Shortlist status: ${r.stage === "shortlist_approved" || r.stage === "invitations_sent" ? "approved by the hiring manager" : "awaiting hiring-manager approval"}.`,
        actionLabel: "Approve & send",
        approver: HR_DIRECTOR,
        effects,
        payload: { invitations: invitations.map((x) => x.id) },
      });
      emit.send({
        type: "approval",
        approval: {
          id: approval.id,
          title: approval.title,
          summary: approval.summary,
          solution: SLUG,
          actionLabel: approval.actionLabel,
          approver: approval.approver,
          status: "pending",
          createdAt: approval.createdAt,
        },
      });
      s3.waiting(HR_DIRECTOR.name);
    },
    { modelKey },
  );
}
