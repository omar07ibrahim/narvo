import { z } from "zod";
import { createApproval, listApprovals } from "@/lib/store/db";
import { getPrefs } from "@/lib/ai/request";
import { CHANGES, loadChanges, SLUG } from "@/app/solutions/03-process-intelligence/_lib/data";
import { INTERVENTION_LABELS } from "@/app/solutions/03-process-intelligence/_lib/labels";

export async function GET() {
  return Response.json({ changes: loadChanges() });
}

const schema = z.object({
  memo: z.string().min(40).max(12000),
  interventions: z.array(z.enum(["intakeNoc", "parallelNoc", "stampCheck", "revisionCheck", "developerSla"])).min(1),
  expected: z.record(z.string(), z.number().nullable()).optional(),
});

/** Submit the drafted change memo to the Director of Planning & Building Permits; approval records the change. */
export async function POST(req: Request) {
  const raw = await req.json().catch(() => ({}));
  const { lang } = getPrefs(req, raw);
  const p = schema.safeParse(raw);
  if (!p.success) return new Response(p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), { status: 400 });
  const { memo, interventions, expected } = p.data;

  const used = new Set(loadChanges().map((c) => c.id));
  for (const a of listApprovals({ solution: SLUG })) {
    const id = (a.payload as { changeId?: string } | undefined)?.changeId;
    if (id) used.add(id);
  }
  let k = 15;
  while (used.has(`CHG-2026-${String(k).padStart(3, "0")}`)) k++;
  const changeId = `CHG-2026-${String(k).padStart(3, "0")}`;
  const names = interventions.map((i) => INTERVENTION_LABELS[i][lang === "ar" ? "ar" : "en"]);
  const subject = memo
    .match(/\*\*(.+?)\*\*/)?.[1]
    ?.replace(/^(Subject|الموضوع)\s*[:：]\s*/i, "")
    .replace(/^(Approval request|Request for approval|For approval|طلب (?:ال)?اعتماد)\s*[:：—-]\s*/i, "")
    .slice(0, 160);
  const title = subject || (lang === "ar" ? `اعتماد: ${names.join(" + ")}` : `Make standard: ${names.join(" + ")}`);
  const fmt = (x: number | null | undefined, unit = "") => (x == null ? "—" : `${x.toFixed(1)}${unit}`);
  const summary =
    lang === "ar"
      ? // starts with an Arabic word: the card lays the summary out by its first strong character (dir="auto")
        `التغيير ${changeId} · ${names.join("، ")}. الأثر المحاكى: الوسيط ${fmt(expected?.medianBefore)} ← ${fmt(expected?.medianAfter)} يوم، إعادة العمل ${fmt(expected?.reworkBefore, "%")} ← ${fmt(expected?.reworkAfter, "%")}.`
      : `${changeId} · ${names.join(" + ")}. Simulated impact: median ${fmt(expected?.medianBefore)} → ${fmt(expected?.medianAfter)} days, rework ${fmt(expected?.reworkBefore, "%")} → ${fmt(expected?.reworkAfter, "%")}.`;

  const approval = createApproval({
    solution: SLUG,
    title: `${lang === "ar" ? "تغيير في إجراءات رخص البناء" : "Permit process change"} — ${title}`.slice(0, 220),
    summary,
    actionLabel: lang === "ar" ? "اعتماد التغيير وتسجيله" : "Approve change & log it",
    approver: { name: "Eng. Omar Yousef Al Hammadi", title: "Director, Planning & Building Permits", nameAr: "م. عمر يوسف الحمادي", titleAr: "مدير إدارة التخطيط وتصاريح البناء" },
    requestedBy: "Hessa Abdulla Al Suwaidi",
    payload: { changeId, interventions, expected },
    effects: [
      {
        type: "append",
        collection: CHANGES,
        item: {
          id: changeId,
          title,
          interventions,
          status: "approved",
          approvedBy: "Eng. Omar Yousef Al Hammadi",
          approvedAt: "2026-10-11",
          memo,
          expected: expected ?? {},
          measurement:
            "Compare applications submitted 1 Nov – 31 Dec 2026 with the Q3 2026 baseline (median, gated vs non-gated, rework, NOC-related returns, NOC turnaround, officer touches).",
          measurementAr:
            "مقارنة الطلبات المقدمة من 1 نوفمبر إلى 31 ديسمبر 2026 مع خط أساس الربع الثالث 2026 (الوسيط، المسوّرة وغير المسوّرة، إعادة العمل، الإعادات المرتبطة بالشهادة، مدة إصدار الشهادة، مرات المعالجة).",
          createdAt: "2026-10-11",
        },
      },
      { type: "audit", action: "Process change approved and logged", subject: `${changeId} — ${title}`.slice(0, 200), detail: summary.slice(0, 300) },
    ],
  });
  return Response.json({
    changeId,
    approval: {
      id: approval.id,
      title: approval.title,
      summary: approval.summary,
      solution: SLUG,
      actionLabel: approval.actionLabel,
      approver: approval.approver,
      status: approval.status,
      createdAt: approval.createdAt,
    },
  });
}
