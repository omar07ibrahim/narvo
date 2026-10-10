import { z } from "zod";
import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { runAgent, defineTool } from "@/lib/ai/agent";
import type { ChatMessage } from "@/lib/ai/client";
import type { Citation } from "@/lib/ai/events";
import {
  buildDraft,
  getDraft,
  getEmployee,
  loadRequests,
  NAMES_AR,
  profileFacts,
  recordQuestion,
  saveDraft,
  searchPolicy,
  SOLUTION,
  submitDraft,
} from "@/app/solutions/11-employee-services/_lib/server";
import type { RequestType } from "@/app/solutions/11-employee-services/_lib/shared";

interface Body {
  employeeId?: string;
  message?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

const TYPES = ["salary_certificate", "hr_letter", "annual_leave", "remote_work", "it_equipment", "system_access"] as const;

/** Employee assistant: answers from HR/IT policy (cited), checks eligibility, prepares and submits requests behind approvals. */
export async function POST(req: Request) {
  const body = await readBody<Body>(req);
  const { modelKey, lang } = getPrefs(req, body as Record<string, unknown>);
  const message = (body.message ?? "").trim();
  if (!message) return new Response("message is required", { status: 400 });
  const employee = getEmployee(String(body.employeeId ?? ""));
  if (!employee) return new Response("Unknown employee", { status: 404 });
  const ar = lang === "ar";

  return eventStream(
    req,
    async (emit) => {
      emit
        .step("identity", ar ? "التحقق من هوية الموظف" : "Employee identity")
        .done(`${ar ? employee.nameAr : employee.name} · ${employee.id} · ${ar ? "دخول موحّد عبر MNDA" : "MNDA single sign-on"}`);

      const registry: Citation[] = [];
      const register = (h: { docId: string; title: string; ref?: string; section: string; text: string }) => {
        const existing = registry.find((c) => c.docId === h.docId && c.section === h.section);
        if (existing) return existing.n;
        const n = registry.length + 1;
        registry.push({ n, docId: h.docId, title: h.title, ref: h.ref, section: h.section, quote: h.text.length > 420 ? h.text.slice(0, 420) + "…" : h.text });
        emit.data("citations", [...registry]);
        return n;
      };

      const getProfile = defineTool({
        name: "get_my_profile",
        description:
          "The employee's own HR/IT profile: role, manager, leave balance, remote-work eligibility and days left this week, laptop age and replacement eligibility, systems, linked housing case. Salary figures are not included.",
        parameters: z.object({}),
        label: () => (ar ? "قراءة ملفي الوظيفي" : "Reading my profile"),
        execute: async () => profileFacts(employee),
      });

      const getRequests = defineTool({
        name: "get_my_requests",
        description: "The employee's HR and IT requests with current status, approver and SLA due time.",
        parameters: z.object({}),
        label: () => (ar ? "قراءة طلباتي" : "Reading my requests"),
        execute: async () =>
          loadRequests()
            .filter((r) => r.employeeId === employee.id)
            .slice(0, 8)
            .map((r) => ({
              id: r.id,
              title: r.title.en,
              status: r.status,
              submittedAt: r.submittedAt,
              dueAt: r.dueAt,
              approver: r.approver.name,
              rejectionNote: r.rejectionNote,
            })),
      });

      const searchPolicyTool = defineTool({
        name: "search_policy",
        description:
          "Search MNDA HR and IT policies (employee handbook, HC-POL-07 remote work, salary certificate procedure, IT service catalogue, acceptable use, HR circulars). Returns numbered passages to cite as [n].",
        parameters: z.object({ query: z.string().describe("Short keyword query in English or Arabic") }),
        label: (a) => (ar ? `بحث في السياسات: «${a.query}»` : `Policy search: “${a.query}”`),
        execute: async (a) =>
          searchPolicy([a.query], 4).map((h) => ({
            n: register(h),
            title: h.title,
            ref: h.ref,
            section: h.section,
            text: h.text.length > 800 ? h.text.slice(0, 800) + "…" : h.text,
          })),
      });

      const prepare = defineTool({
        name: "prepare_request",
        description:
          "Prepare (do not submit) an HR or IT request form for the employee, filled from the conversation and profile. The system validates it and checks eligibility; the employee then reviews and confirms. Use ISO dates YYYY-MM-DD.",
        parameters: z.object({
          type: z.enum(TYPES),
          addressee: z.string().optional().describe("salary_certificate / hr_letter: who the letter is addressed to"),
          purpose: z.string().optional().describe("salary_certificate / hr_letter: purpose, e.g. 'Housing grant application'"),
          language: z.enum(["ar", "en"]).optional().describe("Language of the certificate/letter"),
          letterType: z.enum(["salary_transfer", "experience", "noc", "employment_verification"]).optional(),
          leaveType: z.enum(["annual", "sick", "compassionate", "paternity", "hajj"]).optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          handover: z.string().optional().describe("Leave: colleague covering the work"),
          dates: z.array(z.string()).optional().describe("remote_work: the requested days"),
          item: z.enum(["laptop_replacement", "second_monitor", "mobile_device", "vpn"]).optional(),
          system: z.string().optional().describe("system_access: Tamkeen CMS | MNDA ePermits | MNDA Finance | Marsa Atlas GIS | MNDA Records (EDRMS)"),
          accessLevel: z.enum(["read", "contributor", "admin"]).optional(),
          justification: z.string().optional(),
        }),
        label: (a) => (ar ? `تجهيز نموذج الطلب (${a.type})` : `Preparing the ${String(a.type).replace(/_/g, " ")} form`),
        execute: async (a) => {
          const { type, ...fields } = a;
          const draft = saveDraft(buildDraft(employee, type as RequestType, fields as Record<string, string>));
          emit.data("draft", draft);
          return {
            draftId: draft.id,
            eligible: draft.eligible,
            approver: `${draft.approver.name} (${draft.approver.title})`,
            approverArabicName: NAMES_AR[draft.approver.name] ?? null,
            slaWorkingDays: draft.slaDays,
            fields: draft.fields,
            checks: draft.checks.map((c) => ({ check: c.label.en, ok: c.ok, blocking: !!c.blocking, detail: c.detail.en })),
            note: "Shown to the employee as an editable form. Ask them to review it and press Submit, or call submit_request only if they explicitly confirm.",
          };
        },
      });

      const submit = defineTool({
        name: "submit_request",
        description: "Submit a prepared request form (by draftId) after the employee explicitly confirms. It is routed to the responsible approver.",
        parameters: z.object({ draftId: z.string() }),
        label: (a) => (ar ? `تقديم الطلب ${a.draftId}` : `Submitting ${a.draftId}`),
        approval: (a) => {
          const draft = getDraft(a.draftId);
          if (!draft || draft.employeeId !== employee.id) throw new Error(`No prepared form ${a.draftId} for this employee`);
          const { request, spec } = submitDraft(draft);
          emit.data("submitted", request);
          return spec;
        },
      });

      const history: ChatMessage[] = (body.history ?? [])
        .filter((h) => h && (h.role === "user" || h.role === "assistant") && typeof h.content === "string")
        .slice(-8)
        .map((h) => ({ role: h.role, content: h.content.slice(0, 2000) }) as ChatMessage);

      const system = [
        "You are NARVO Employee Services, the internal HR & IT assistant of Marsa Al Noor Development Authority (MNDA). You run on MNDA infrastructure.",
        `You are talking to ${employee.name} (${employee.nameAr}), ${employee.title}, ${employee.department}, employee ${employee.id}. Line manager: ${employee.manager.name}.`,
        "Today is Sunday 11 October 2026. The working week is Monday–Friday (Friday half-day). 'Next week' means 12–16 October 2026.",
        "How to work:",
        "- Before stating ANY rule, limit, validity period, entitlement or service level, call search_policy (even if you think you know it) and cite with the numeric marker [n] of the passage, right after the claim. Only numeric markers like [2] — never names like [Circular 9/2026]. Never invent policy.",
        "- When balances, eligibility, devices or the housing case matter: call get_my_profile. For status questions: get_my_requests.",
        "- When the employee wants something done: call prepare_request with every field you can infer (dates as YYYY-MM-DD). Write addressee and purpose in the language of the certificate/letter — for a housing application in Arabic use addressee 'هيئة مرسى النور للتطوير — قسم الطلبات السكنية' and purpose 'تقديم طلب منحة سكنية'; in English 'Marsa Al Noor Development Authority — Housing Applications Section' and 'Housing grant application'. Ask only for information that is genuinely missing. Then tell them the form is ready on the right to review and submit, who approves it and the service level.",
        "- If a check fails, explain why in one or two sentences and suggest the right alternative (e.g. a fault ticket instead of a replacement).",
        "- Call submit_request only when the employee clearly confirms (e.g. 'yes submit', 'تمام قدّم'). Never say a request is approved — say it is with the approver.",
        "- Never reveal other employees' data. Salary amounts are not needed: HR prints them on the certificate from payroll.",
        "Arabic vocabulary to use exactly: the Authority = «هيئة مرسى النور للتطوير»; circular = «تعميم» (e.g. «التعميم رقم 9/2026»); salary certificate = «شهادة راتب»; working day = «يوم عمل». Use approverArabicName from tool results for names in Arabic replies.",
        "Style: short and warm, like a helpful colleague; 2–6 sentences or a few bullets; no headings.",
        `Language: reply in the language of the employee's latest message. If they write Arabic (including Gulf dialect such as "أبا" / "شو" / "لو سمحت"), answer in clear, friendly Arabic — light Gulf phrasing is welcome (e.g. "أبشر"). Default: ${ar ? "Arabic" : "English"}.`,
      ].join("\n");

      const result = await runAgent({
        system,
        messages: [...history, { role: "user", content: message }],
        tools: [getProfile, getRequests, searchPolicyTool, prepare, submit],
        emit,
        solution: SOLUTION,
        modelKey,
        maxSteps: 7,
        temperature: 0.2,
      });

      const names = new Set(result.toolResults.map((t) => t.name));
      const actioned = names.has("prepare_request") || names.has("submit_request");
      recordQuestion(!actioned && names.has("search_policy"));
      emit.data("outcome", { deflected: !actioned && names.has("search_policy"), prepared: names.has("prepare_request"), submitted: result.approvals.length > 0 });
    },
    { modelKey },
  );
}
