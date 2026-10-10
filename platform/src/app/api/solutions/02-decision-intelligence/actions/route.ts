import { z } from "zod";
import { createApproval, listApprovals } from "@/lib/store/db";
import { getPrefs } from "@/lib/ai/request";
import { ACTIONS, loadActions, SLUG } from "@/app/solutions/02-decision-intelligence/_lib/data";
import { METRIC_IDS, OWNER_NAMES, PEOPLE, REVIEW, metricById } from "@/app/solutions/02-decision-intelligence/_lib/catalogue";
import { actionStats } from "@/app/solutions/02-decision-intelligence/_lib/engine";

export async function GET() {
  const actions = loadActions();
  return Response.json({ actions, stats: actionStats(actions, REVIEW.today) });
}

const proposalSchema = z.object({
  title: z.string().min(5).max(300),
  rationale: z.string().max(1200).optional().default(""),
  owner: z.enum(OWNER_NAMES),
  due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kpi: z.enum([...METRIC_IDS, "none"] as [string, ...string[]]).optional().default("none"),
  expectedEffect: z.string().max(600).optional().default(""),
});

/** Submit a proposed decision for the Director General's approval; approving records it as an action. */
export async function POST(req: Request) {
  const raw = await req.json().catch(() => ({}));
  const { lang } = getPrefs(req, raw);
  const parsed = proposalSchema.safeParse(raw);
  if (!parsed.success) return new Response(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), { status: 400 });
  const p = parsed.data;

  // next register number, counting seeds, recorded and pending approvals
  const used = new Set(loadActions().map((a) => a.id));
  for (const a of listApprovals({ solution: SLUG })) {
    const id = (a.payload as { actionId?: string } | undefined)?.actionId;
    if (id) used.add(id);
  }
  let k = 55;
  while (used.has(`ACT-2026-${String(k).padStart(3, "0")}`)) k++;
  const actionId = `ACT-2026-${String(k).padStart(3, "0")}`;
  const owner = PEOPLE.find((x) => x.name === p.owner);
  const dept = owner?.dept ?? (p.owner.includes("Dhaheri") ? "procurement" : "strategy");
  const kpiName = p.kpi && p.kpi !== "none" ? metricById(p.kpi)?.name.en : null;
  const clean = (s: string) => s.replace(/\s*\[\d+\](\[\d+\])*/g, "").trim();

  const approval = createApproval({
    solution: SLUG,
    title: `${lang === "ar" ? "قرار المراجعة" : "Review decision"} — ${p.title}`.slice(0, 200),
    summary: `${actionId} · ${p.owner} · ${lang === "ar" ? "الاستحقاق" : "due"} ${p.due}${kpiName ? ` · KPI: ${kpiName}` : ""}. ${clean(p.rationale)}`.slice(0, 600),
    actionLabel: lang === "ar" ? "اعتماد القرار وتسجيل الإجراء" : "Agree decision & record action",
    approver: { name: "H.E. Eng. Khalid Saif Al Mazrouei", title: "Director General" },
    requestedBy: "Dr. Amna Rashid Al Ketbi",
    payload: { actionId, ...p },
    effects: [
      {
        type: "append",
        collection: ACTIONS,
        item: {
          id: actionId,
          title: clean(p.title),
          owner: p.owner,
          dept,
          raisedIn: "DG review — week 41",
          raisedAt: REVIEW.meetingDate,
          due: p.due,
          status: "open",
          closedAt: null,
          kpi: p.kpi && p.kpi !== "none" ? p.kpi : null,
          note: [clean(p.expectedEffect), clean(p.rationale)].filter(Boolean).join(" — ").slice(0, 600),
          source: "approved",
        },
      },
      { type: "audit", action: "Decision agreed — action recorded", subject: `${actionId} — ${clean(p.title)}`.slice(0, 200), detail: `Owner ${p.owner}, due ${p.due}` },
    ],
  });
  return Response.json({
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
    actionId,
  });
}
