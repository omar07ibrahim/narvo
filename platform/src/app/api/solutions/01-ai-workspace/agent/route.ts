import { z } from "zod";
import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { runAgent, defineTool, type AgentTool } from "@/lib/ai/agent";
import type { ChatMessage } from "@/lib/ai/client";
import type { Citation } from "@/lib/ai/events";
import { personaSystem } from "@/app/solutions/01-ai-workspace/_lib/ask";
import {
  addWorkingDays,
  allDocs,
  canRead,
  classOf,
  directoryForPrompt,
  findPerson,
  OUTBOX,
  resolveRole,
  searchFiltered,
  SOLUTION,
  TASKS,
} from "@/app/solutions/01-ai-workspace/_lib/server";
import { ROLES, SCOPES, accessLabel, type ScopeKey } from "@/app/solutions/01-ai-workspace/_lib/shared";

interface Body {
  prompt?: string;
  role?: string;
  scope?: ScopeKey;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

const SCOPE_KEYS = SCOPES.map((s) => s.key) as [ScopeKey, ...ScopeKey[]];

/** Agentic knowledge work: research → sourced briefing → proposed tasks / emails behind human approval. */
export async function POST(req: Request) {
  const body = await readBody<Body>(req);
  const { modelKey, lang } = getPrefs(req, body as Record<string, unknown>);
  const prompt = (body.prompt ?? "").trim();
  if (!prompt) return new Response("prompt is required", { status: 400 });
  const role = resolveRole(body.role);
  const r = ROLES[role];
  const scope: ScopeKey = SCOPE_KEYS.includes(body.scope as ScopeKey) ? (body.scope as ScopeKey) : "all";
  const ar = lang === "ar";

  return eventStream(
    req,
    async (emit) => {
      const ctx = emit.step("context", ar ? "تحديد الهوية والصلاحيات" : "Identity and access");
      ctx.done(
        ar
          ? `${r.persona.nameAr} · ${r.label.ar} · ${accessLabel(r.access, "ar")}${r.canAct ? "" : " · قراءة فقط"}`
          : `${r.persona.name} · ${r.label.en} · ${accessLabel(r.access, "en")}${r.canAct ? "" : " · read-only"}`,
      );

      // Citation registry shared by every tool call so [n] markers stay stable across the run.
      const registry: Citation[] = [];
      const register = (p: { docId: string; title: string; ref?: string; section?: string; text: string }) => {
        const existing = registry.find((c) => c.docId === p.docId && c.section === p.section);
        if (existing) return existing.n;
        const n = registry.length + 1;
        registry.push({ n, docId: p.docId, title: p.title, ref: p.ref, section: p.section, quote: p.text.length > 420 ? p.text.slice(0, 420) + "…" : p.text });
        emit.data("citations", [...registry]);
        return n;
      };
      const created: Array<{ kind: "task" | "email"; title: string }> = [];

      const searchKnowledge = defineTool({
        name: "search_knowledge",
        description:
          "Search MNDA's knowledge base (circulars, service guides, building code, policies, HR, IT, strategy and performance reports). Returns numbered passages; cite them as [n]. Results are limited to the user's access level.",
        parameters: z.object({
          query: z.string().describe("Short keyword query, English or Arabic"),
          scope: z.enum(SCOPE_KEYS).optional().describe("Optional collection to search; default is the user's selected scope"),
        }),
        label: (a) => (ar ? `بحث: «${a.query}»` : `Searching “${a.query}”`),
        execute: async (a) => {
          const { hits, withheld } = searchFiltered([a.query], role, a.scope ?? scope, 5);
          return {
            results: hits.map((h) => ({
              n: register(h),
              docId: h.docId,
              title: h.title,
              ref: h.ref,
              section: h.section,
              classification: h.classification,
              text: h.text.length > 900 ? h.text.slice(0, 900) + "…" : h.text,
            })),
            withheldForAccessLevel: withheld.length,
          };
        },
      });

      const getDocument = defineTool({
        name: "get_document",
        description: "Read a full knowledge document by its id (from search results). Fails if the document is above the user's access level.",
        parameters: z.object({ docId: z.string() }),
        label: (a) => (ar ? `قراءة المستند ${a.docId}` : `Reading ${a.docId}`),
        execute: async (a) => {
          const doc = allDocs().find((d) => d.id === a.docId);
          if (!doc) return { error: `No document with id ${a.docId}` };
          if (!canRead(role, doc))
            return { error: `Access denied: ${a.docId} is ${classOf(doc)}; this user is cleared for ${accessLabel(r.access, "en")} only.` };
          const n = register({ docId: doc.id, title: doc.title, ref: doc.ref, section: ar ? "المستند كاملاً" : "Full document", text: doc.body.slice(0, 600) });
          return { n, id: doc.id, title: doc.title, ref: doc.ref, date: doc.date, owner: doc.owner, classification: classOf(doc), text: doc.body.slice(0, 6000) };
        },
      });

      const today = new Date("2026-10-11T08:00:00+04:00");
      const createTask = defineTool({
        name: "create_task",
        description:
          "Propose a follow-up task for an MNDA employee. It is NOT created until the owner's director approves it. Owner must be a person from the MNDA directory.",
        parameters: z.object({
          title: z.string().describe("Concrete, verifiable task title starting with a verb"),
          description: z.string().describe("2-3 sentences: what to do, why, expected output"),
          owner: z.string().describe("Full name or email of the owner from the MNDA directory"),
          due: z.string().describe("Due date YYYY-MM-DD (a working day, after 2026-10-11)"),
          priority: z.enum(["high", "normal", "low"]).default("normal"),
          sourceDocIds: z.array(z.string()).default([]).describe("Ids of the knowledge documents that justify the task"),
        }),
        label: (a) => (ar ? `اقتراح مهمة: ${a.title}` : `Propose task: ${a.title}`),
        approval: (a) => {
          const person = findPerson(a.owner);
          if (!person) throw new Error(`Unknown owner "${a.owner}". Use a person from the MNDA directory.`);
          let due = new Date(`${a.due}T12:00:00+04:00`);
          if (Number.isNaN(due.getTime()) || due <= today) due = addWorkingDays(today, 5);
          while (due.getDay() === 0 || due.getDay() === 6) due.setDate(due.getDate() + 1);
          const dueIso = due.toISOString().slice(0, 10);
          const docs = allDocs();
          const sources = (a.sourceDocIds ?? [])
            .map((id) => docs.find((d) => d.id === id))
            .filter((d): d is NonNullable<typeof d> => !!d && canRead(role, d))
            .map((d) => ({ docId: d.id, ref: d.ref, title: d.title }));
          const id = `TSK-2026-${String(Date.now()).slice(-5)}${Math.floor(Math.random() * 10)}`;
          created.push({ kind: "task", title: a.title });
          return {
            title: `${ar ? "إنشاء مهمة" : "Create task"} — ${a.title}`,
            summary: `${person.name} (${person.title}) · ${ar ? "الاستحقاق" : "due"} ${dueIso} · ${a.description}`.slice(0, 380),
            actionLabel: ar ? "اعتماد وإسناد" : "Approve & assign",
            approver: person.approver,
            effects: [
              {
                type: "append" as const,
                collection: TASKS,
                item: {
                  id,
                  title: a.title,
                  description: a.description,
                  owner: person.name,
                  ownerTitle: person.title,
                  ownerEmail: person.email,
                  department: person.department,
                  due: dueIso,
                  priority: a.priority ?? "normal",
                  sources,
                  status: "open",
                  createdBy: r.persona.name,
                  createdVia: "NARVO agent",
                  createdAt: new Date().toISOString(),
                },
              },
              { type: "audit" as const, action: "Task assigned", subject: `${id} · ${a.title}`, detail: `Owner ${person.name}, due ${dueIso}` },
            ],
            payload: { taskId: id, owner: person.email, due: dueIso, sources },
          };
        },
      });

      const draftEmail = defineTool({
        name: "draft_email",
        description: "Prepare an internal email from the user to MNDA colleagues. It is NOT sent until the user (sender) approves it.",
        parameters: z.object({
          to: z.array(z.string()).min(1).describe("Recipient names or @mnda.gov.ae emails from the directory"),
          subject: z.string(),
          body: z.string().describe("Plain text email body, signed by the sender"),
          sourceDocIds: z.array(z.string()).default([]),
        }),
        label: (a) => (ar ? `إعداد بريد: ${a.subject}` : `Prepare email: ${a.subject}`),
        approval: (a) => {
          const to = a.to.map((t) => findPerson(t)?.email ?? (/@mnda\.gov\.ae$/i.test(t.trim()) ? t.trim().toLowerCase() : null));
          if (to.some((t) => !t)) throw new Error(`Unknown recipient in ${JSON.stringify(a.to)}. Use people from the MNDA directory.`);
          const id = `MAIL-${String(Date.now()).slice(-6)}`;
          created.push({ kind: "email", title: a.subject });
          return {
            title: `${ar ? "إرسال بريد" : "Send email"} — ${a.subject}`,
            summary: `${ar ? "إلى" : "To"}: ${to.join(", ")}\n\n${a.body}`.slice(0, 420),
            actionLabel: ar ? "اعتماد وإرسال" : "Approve & send",
            approver: { name: r.persona.name, title: r.persona.title.en },
            effects: [
              {
                type: "append" as const,
                collection: OUTBOX,
                item: {
                  id,
                  to: to as string[],
                  subject: a.subject,
                  body: a.body,
                  from: `${r.persona.name} <${r.persona.email}>`,
                  sentAt: new Date().toISOString(),
                  sources: (a.sourceDocIds ?? []).map((d) => ({ docId: d })),
                },
              },
              { type: "audit" as const, action: "Email sent", subject: a.subject, detail: `To ${to.join(", ")}` },
            ],
          };
        },
      });

      const tools: AgentTool<any>[] = r.canAct ? [searchKnowledge, getDocument, createTask, draftEmail] : [searchKnowledge, getDocument];

      const system = [
        personaSystem(role, lang),
        "You are the NARVO Workspace agent. You turn MNDA knowledge into completed work: research, a sourced briefing, then concrete follow-up actions.",
        "Method: run 2–4 focused search_knowledge calls (mix English and Arabic keywords, include reference numbers); use get_document only when a passage is not enough; then act.",
        r.canAct
          ? "Actions: use create_task for each follow-up (2–4 tasks max, distinct owners where sensible) and draft_email only if the user asks for an email. Owners must come from the directory below. Due dates are working days (Mon–Fri) after 11 Oct 2026, realistic for the effort (2–10 working days). Pass sourceDocIds."
          : "This user is external: you cannot create tasks or send emails. If asked, explain politely that internal actions are only available to MNDA staff, and point to public channels (permits@mnda.gov.ae, 800 6632).",
        "Cite every fact with the [n] numbers returned by the tools — only those numbers. Do not mention tool names in the final answer.",
        "Never claim a task was created or an email was sent: they are awaiting human approval (name the approver).",
        "Final answer format (markdown): '## Summary' (2–3 sentences), '## Key facts' (bullets with citations), '## What it means' (implications for the user's request), and if you proposed actions '## Proposed actions' (one line each: task — owner — due date — awaiting approval by …). Keep it under 380 words.",
        `Write the final answer in ${ar ? "formal Modern Standard Arabic" : "English"}; task titles and descriptions in the same language.`,
        r.canAct ? `MNDA directory (task owners and email recipients):\n${directoryForPrompt()}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      const history: ChatMessage[] = (body.history ?? [])
        .filter((h) => h && (h.role === "user" || h.role === "assistant") && typeof h.content === "string")
        .slice(-4)
        .map((h) => ({ role: h.role, content: h.content.slice(0, 2000) }) as ChatMessage);

      await runAgent({
        system,
        messages: [...history, { role: "user", content: prompt }],
        tools,
        emit,
        solution: SOLUTION,
        modelKey,
        maxSteps: 9,
      });

      const tasks = created.filter((c) => c.kind === "task").length;
      const emails = created.filter((c) => c.kind === "email").length;
      const fin = emit.step("handoff", ar ? "تسليم للاعتماد البشري" : "Hand-off for human approval");
      if (tasks + emails)
        fin.waiting(
          ar
            ? `${tasks} مهام و${emails} رسائل بانتظار الاعتماد`
            : `${tasks} task${tasks === 1 ? "" : "s"} and ${emails} email${emails === 1 ? "" : "s"} awaiting approval`,
        );
      else fin.done(ar ? "لا توجد إجراءات تتطلب اعتماداً" : "No actions requiring approval");
    },
    { modelKey },
  );
}
