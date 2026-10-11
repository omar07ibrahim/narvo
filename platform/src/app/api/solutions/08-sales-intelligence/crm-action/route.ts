import { z } from "zod";
import { readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { addAudit, createApproval, type Effect } from "@/lib/store/db";
import { COL_INTERACTIONS, COL_OPPS, findOpp, loadSalesData, SLUG } from "@/app/solutions/08-sales-intelligence/_lib/records";
import { checkDraft, detectConflicts } from "@/app/solutions/08-sales-intelligence/_lib/calc";
import type { ApprovalSummary } from "@/lib/ai/events";

export const dynamic = "force-dynamic";

const stage = z.enum(["Qualification", "Proposal", "Negotiation", "Closed Won", "Closed Lost"]);
const input = z.object({
  opportunityId: z.string(),
  kind: z.enum(["follow_up", "inbound_log"]),
  actionTitle: z.string().min(3).max(200),
  crmUpdate: z.object({
    stage: stage.nullable().optional(),
    nextStep: z.string().min(3).max(400),
    nextStepDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    probability: z.number().min(0).max(100).nullable().optional(),
    note: z.string().max(1200).default(""),
  }),
  draft: z
    .object({
      channel: z.enum(["email", "whatsapp"]),
      language: z.enum(["en", "ar"]),
      to: z.string().max(200),
      subject: z.string().max(200).nullable(),
      body: z.string().min(10).max(6000),
    })
    .optional(),
  inbound: z
    .object({
      from: z.string().max(200),
      subject: z.string().max(200).nullable().optional(),
      body: z.string().min(10).max(8000),
      summary: z.string().max(2000),
      language: z.enum(["en", "ar", "mixed"]),
    })
    .optional(),
});

/** UAE wall-clock time on the demo date, e.g. 2026-10-11T10:42:00+04:00 */
function demoTimestamp(today: string) {
  const t = new Date(Date.now() + 4 * 3600_000).toISOString().slice(11, 16);
  return `${today}T${t}:00+04:00`;
}

/**
 * Turn an approved-for-review next action into a human approval (Sales Director).
 * On approval the CRM is updated: interaction logged + opportunity next step / stage / probability changed.
 */
export async function POST(req: Request) {
  const raw = await readBody<Record<string, unknown>>(req);
  const { lang } = getPrefs(req, raw);
  const ar = lang === "ar";
  const parsed = input.safeParse(raw);
  if (!parsed.success) return Response.json({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
  const a = parsed.data;
  const data = loadSalesData();
  const opp = findOpp(data, a.opportunityId);
  if (!opp) return Response.json({ error: "Unknown opportunity" }, { status: 404 });
  if (a.kind === "follow_up" && !a.draft) return Response.json({ error: "draft is required for a follow-up" }, { status: 400 });
  if (a.kind === "inbound_log" && !a.inbound) return Response.json({ error: "inbound message is required" }, { status: 400 });
  if (a.crmUpdate.nextStepDate < data.today) return Response.json({ error: `nextStepDate must be on or after ${data.today}` }, { status: 400 });

  const account = data.accounts.find((x) => x.id === opp.accountId)!;
  const director = data.people.find((p) => p.name === "Fadi Khoury")!;
  const report = detectConflicts(data, opp);
  const flags = a.draft ? checkDraft(`${a.draft.subject ?? ""}\n${a.draft.body}`, report, report.tierMaxTerms) : [];
  const interactionId = `INT-N-${Date.now().toString(36).toUpperCase()}`;
  const at = demoTimestamp(data.today);

  const interaction =
    a.kind === "follow_up"
      ? {
          id: interactionId,
          opportunityId: opp.id,
          accountId: opp.accountId,
          type: a.draft!.channel,
          direction: "outbound",
          at,
          from: opp.owner,
          to: a.draft!.to,
          subject: a.draft!.subject ?? (a.draft!.channel === "whatsapp" ? "WhatsApp" : a.actionTitle),
          lang: a.draft!.language,
          body: a.draft!.body,
          loggedVia: "NARVO",
          approvedBy: director.name,
        }
      : {
          id: interactionId,
          opportunityId: opp.id,
          accountId: opp.accountId,
          type: "email",
          direction: "inbound",
          at,
          from: a.inbound!.from,
          to: opp.owner,
          subject: a.inbound!.subject ?? a.actionTitle,
          lang: a.inbound!.language === "ar" ? "ar" : "en",
          body: a.inbound!.body,
          loggedVia: "NARVO",
          approvedBy: director.name,
        };

  const patch: Record<string, unknown> = {
    nextStep: a.crmUpdate.nextStep,
    nextStepAr: null,
    nextStepDate: a.crmUpdate.nextStepDate,
    lastUpdatedBy: `${opp.owner} via NARVO`,
  };
  const changes: string[] = [`next step → "${a.crmUpdate.nextStep}" (${a.crmUpdate.nextStepDate})`];
  if (a.crmUpdate.stage && a.crmUpdate.stage !== opp.stage) {
    patch.stage = a.crmUpdate.stage;
    patch.stageEnteredAt = data.today;
    changes.push(`stage ${opp.stage} → ${a.crmUpdate.stage}`);
  }
  if (a.crmUpdate.probability != null && a.crmUpdate.probability !== opp.probability) {
    patch.probability = Math.round(a.crmUpdate.probability);
    changes.push(`probability ${opp.probability}% → ${Math.round(a.crmUpdate.probability)}%`);
  }

  const effects: Effect[] = [
    { type: "append", collection: COL_INTERACTIONS, item: interaction },
    { type: "patch", collection: COL_OPPS, id: opp.id, patch },
    {
      type: "audit",
      action: a.kind === "follow_up" ? "Follow-up sent and CRM updated" : "Customer message logged and CRM updated",
      subject: `${opp.id} ${opp.title}`,
      detail: `${changes.join("; ")}${a.crmUpdate.note ? ` — ${a.crmUpdate.note}` : ""}`,
    },
  ];

  const high = flags.filter((f) => f.severity === "high");
  const summaryParts = ar
    ? a.kind === "follow_up"
      ? [
          `${a.draft!.channel === "whatsapp" ? "واتساب" : "بريد"} إلى ${a.draft!.to}: ${a.draft!.body.replace(/\s+/g, " ").slice(0, 220)}…`,
          `النظام: الخطوة التالية ← «${a.crmUpdate.nextStep}» (${a.crmUpdate.nextStepDate}).`,
          high.length ? `الضوابط: ${high.map((f) => f.message.ar).join(" ")}` : "الضوابط: ضمن الاتفاقية الإطارية وسياسة الائتمان.",
        ]
      : [`تسجيل رسالة واردة من ${a.inbound!.from}: ${a.inbound!.summary}`, `النظام: الخطوة التالية ← «${a.crmUpdate.nextStep}» (${a.crmUpdate.nextStepDate}).`]
    : a.kind === "follow_up"
      ? [
          `${a.draft!.channel === "whatsapp" ? "WhatsApp" : "Email"} to ${a.draft!.to} (${a.draft!.language.toUpperCase()}): ${a.draft!.body.replace(/\s+/g, " ").slice(0, 220)}…`,
          `CRM: ${changes.join("; ")}.`,
          high.length ? `Guardrails: ${high.map((f) => f.message.en).join(" ")}` : "Guardrails: within frame agreement and credit policy.",
        ]
      : [`Log inbound message from ${a.inbound!.from}: ${a.inbound!.summary}`, `CRM: ${changes.join("; ")}.`];

  const approval = createApproval({
    solution: SLUG,
    title: ar
      ? a.kind === "follow_up"
        ? `إرسال متابعة وتحديث نظام العملاء — ${account.nameAr} · ${opp.id}`
        : `تسجيل رسالة المتعامل وتحديث نظام العملاء — ${account.nameAr} · ${opp.id}`
      : a.kind === "follow_up"
        ? `Send follow-up & update CRM — ${account.name} · ${opp.id}`
        : `Log customer message & update CRM — ${account.name} · ${opp.id}`,
    summary: summaryParts.join(" "),
    actionLabel: ar
      ? a.kind === "follow_up"
        ? "اعتماد وإرسال"
        : "اعتماد وتحديث النظام"
      : a.kind === "follow_up"
        ? "Approve & send"
        : "Approve & update CRM",
    approver: { name: director.name, title: director.role },
    requestedBy: opp.owner,
    effects,
    payload: { opportunityId: opp.id, kind: a.kind, actionTitle: a.actionTitle, crmUpdate: a.crmUpdate, draft: a.draft, inbound: a.inbound, guardrails: flags, interactionId },
  });
  addAudit({
    solution: SLUG,
    actor: { name: opp.owner, role: "Key Account Manager", kind: "human" },
    action: "Submitted for approval",
    subject: a.actionTitle,
    detail: `Routed to ${director.name}; ${flags.length} guardrail flags`,
    approvalId: approval.id,
  });

  const summary: ApprovalSummary = {
    id: approval.id,
    title: approval.title,
    summary: approval.summary,
    solution: SLUG,
    actionLabel: approval.actionLabel,
    approver: approval.approver,
    status: "pending",
    createdAt: approval.createdAt,
  };
  return Response.json({ approval: summary, guardrails: flags });
}
