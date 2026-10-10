import { z } from "zod";
import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { generateObject } from "@/lib/ai/json";
import { createApproval } from "@/lib/store/db";
import { loadCases, loadMessages, COL_CASES, COL_MESSAGES } from "@/app/solutions/05-case-operations/_lib/data";
import { addWorkingDays, workingDaysBetween, RULES } from "@/app/solutions/05-case-operations/_lib/rules";

export const maxDuration = 180;

const APPROVER = { name: "Mariam Saeed Al Kaabi", title: "Head, Housing Applications Section" };

/**
 * Follow-up sweep: for every case awaiting the applicant, compute the 15-working-day deadline,
 * then draft personalised reminders (one batched model call) — each needs approval to send.
 */
export async function POST(req: Request) {
  const body = await readBody(req);
  const { modelKey, lang } = getPrefs(req, body);
  const ar = lang === "ar";
  return eventStream(
    req,
    async (emit) => {
      const s1 = emit.step("scan", ar ? "حصر الحالات بانتظار المتعامل" : "Finding cases awaiting the applicant");
      const now = new Date();
      const waiting = loadCases()
        .filter((c) => c.status === "incomplete" && c.clarificationSentAt)
        .map((c) => {
          const due = addWorkingDays(c.clarificationSentAt!, RULES.clarificationWorkingDays);
          const left = workingDaysBetween(now, due) * (due >= now ? 1 : -1);
          const reminders = loadMessages(c.id).filter((m) => m.kind === "reminder").length;
          return { c, due: due.toISOString().slice(0, 10), left, reminders };
        })
        .sort((a, b) => a.left - b.left);
      emit.data(
        "queue",
        waiting.map((w) => ({ id: w.c.id, name: w.c.applicant.name, nameAr: w.c.applicant.nameAr, due: w.due, left: w.left, missing: w.c.missing ?? [], reminders: w.reminders })),
      );
      const needing = waiting.filter((w) => w.left <= 7 && w.reminders === 0);
      s1.done(
        ar
          ? `${waiting.length} حالات بانتظار المتعامل · ${needing.length} تقترب مهلتها (≤ 7 أيام عمل)`
          : `${waiting.length} cases awaiting the applicant · ${needing.length} within 7 working days of the deadline`,
      );
      if (!needing.length) return;

      const s2 = emit.step("draft", ar ? `صياغة ${needing.length} رسائل تذكير مخصصة` : `Drafting ${needing.length} personalised reminders`);
      const { object } = await generateObject({
        schema: z.object({
          reminders: z.array(z.object({ caseId: z.string(), language: z.enum(["ar", "en"]), message: z.string() })),
        }),
        name: "reminders",
        system:
          "You write short, courteous reminder SMS/app messages for the Marsa Al Noor Development Authority housing programme. Each message: greet by name, quote the case number, list the outstanding items briefly, state the deadline date and that the application will be closed (and can be re-submitted) if not received, offer help via 800 6632. Max 420 characters. Use the requested language (ar = formal Arabic).",
        user: JSON.stringify(
          needing.map((w) => ({
            caseId: w.c.id,
            language: w.c.applicant.preferredLanguage,
            name: w.c.applicant.preferredLanguage === "ar" ? w.c.applicant.nameAr : w.c.applicant.name,
            outstanding: w.c.missing ?? [],
            deadline: w.due,
            workingDaysLeft: w.left,
          })),
        ),
        modelKey,
        solution: "05-case-operations",
        task: "sweep.reminders",
        maxTokens: 2000,
      });
      s2.done(`${object.reminders.length}`);

      const s3 = emit.step("route", ar ? "إرسال المسودات للاعتماد" : "Routing drafts for approval");
      for (const r of object.reminders) {
        const w = needing.find((n) => n.c.id === r.caseId);
        if (!w) continue;
        const a = createApproval({
          solution: "05-case-operations",
          title: ar ? `تذكير بالمهلة — ${r.caseId}` : `Deadline reminder — ${r.caseId}`,
          summary: r.message,
          actionLabel: ar ? "اعتماد وإرسال" : "Approve & send",
          approver: APPROVER,
          effects: [
            {
              type: "append",
              collection: COL_MESSAGES,
              item: {
                id: crypto.randomUUID(),
                caseId: r.caseId,
                kind: "reminder",
                channels: ["SMS", "MNDA Smart"],
                language: r.language,
                body: r.message,
                sentAt: new Date().toISOString(),
                sentBy: APPROVER.name,
              },
            },
            { type: "patch", collection: COL_CASES, id: r.caseId, patch: { summary: `Reminder sent — deadline ${w.due}.` } },
            { type: "audit", action: "Deadline reminder sent", subject: r.caseId, detail: `Deadline ${w.due}` },
          ],
        });
        emit.send({
          type: "approval",
          approval: {
            id: a.id,
            title: a.title,
            summary: a.summary,
            solution: a.solution,
            actionLabel: a.actionLabel,
            approver: a.approver,
            status: "pending",
            createdAt: a.createdAt,
          },
        });
      }
      s3.done();
    },
    { modelKey },
  );
}
