import { z } from "zod";
import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { answerWithCitations } from "@/lib/ai/rag";
import { runAgent, defineTool } from "@/lib/ai/agent";

/** Development self-test of the core: RAG and agent + approval. */
export async function POST(req: Request) {
  const body = await readBody<{ mode?: string; q?: string }>(req);
  const { modelKey, lang } = getPrefs(req, body);
  return eventStream(req, async (emit) => {
    if (body.mode === "agent") {
      const lookup = defineTool({
        name: "get_case",
        description: "Get a housing case by id",
        parameters: z.object({ caseId: z.string() }),
        label: (a) => `Looking up ${a.caseId}`,
        execute: async (a) => ({ caseId: a.caseId, applicant: "Saeed Khalifa Al Romaithi", status: "Incomplete — awaiting applicant", missing: ["Salary certificate (issued within 30 days)"] }),
      });
      const notify = defineTool({
        name: "send_reminder",
        description: "Send a reminder SMS to the applicant",
        parameters: z.object({ caseId: z.string(), message: z.string() }),
        label: (a) => `Send reminder for ${a.caseId}`,
        approval: (a) => ({
          title: `Send reminder — ${a.caseId}`,
          summary: a.message,
          actionLabel: "Approve & send",
          approver: { name: "Mariam Saeed Al Kaabi", title: "Head, Housing Applications" },
          effects: [{ type: "audit", action: "Reminder sent", subject: a.caseId }],
        }),
      });
      await runAgent({
        system: "You are a case assistant at MNDA. Use tools. Be brief.",
        messages: [{ role: "user", content: body.q ?? "Check case MNDA-HG-2026-004817 and send the applicant a reminder about what is missing." }],
        tools: [lookup, notify],
        emit,
        solution: "dev",
        modelKey,
      });
    } else {
      await answerWithCitations({
        emit,
        corpus: "mnda/knowledge",
        question: body.q ?? "What documents are now required for a housing grant and how recent must the salary certificate be?",
        lang,
        modelKey,
        solution: "dev",
      });
    }
  }, { modelKey });
}
