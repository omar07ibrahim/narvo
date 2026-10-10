import "server-only";
import { z } from "zod";
import { chatStream, type ChatMessage, type ToolSpec } from "./client";
import type { Emitter } from "./stream";
import { createApproval, type Effect } from "@/lib/store/db";

/**
 * Agent loop with tool use, live trace events and human approval gates.
 *
 * Tools marked `approval` never execute directly: they create an approval request
 * (visible in the Inbox and inline in the module). The effects run only when a
 * human approves — this is the "AI prepares, people decide" principle.
 */

export interface AgentContext {
  emit: Emitter;
  solution: string;
}

export interface ApprovalSpec {
  title: string;
  summary: string;
  actionLabel: string;
  approver: { name: string; title: string };
  effects: Effect[];
  payload?: unknown;
}

export interface AgentTool<A extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  parameters: A;
  /** Human-readable label for the trace, e.g. "Looking up case MNDA-HG-2026-004817" */
  label: (args: z.infer<A>) => string;
  /** Execute immediately (read-only tools). */
  execute?: (args: z.infer<A>, ctx: AgentContext) => Promise<unknown>;
  /** Or: require a human approval before the effects are applied. */
  approval?: (args: z.infer<A>, ctx: AgentContext) => Promise<ApprovalSpec> | ApprovalSpec;
}

export function defineTool<A extends z.ZodType>(tool: AgentTool<A>): AgentTool<A> {
  return tool;
}

export interface RunAgentOptions {
  system: string;
  messages: ChatMessage[];
  tools: AgentTool<any>[];
  emit: Emitter;
  solution: string;
  modelKey?: string | null;
  maxSteps?: number;
  channel?: string;
  temperature?: number;
}

export interface RunAgentResult {
  final: string;
  messages: ChatMessage[];
  toolResults: Array<{ name: string; args: unknown; result: unknown }>;
  approvals: string[];
}

function toSpec(t: AgentTool<any>): ToolSpec {
  const params = z.toJSONSchema(t.parameters, { target: "draft-7", unrepresentable: "any" }) as Record<string, unknown>;
  delete params.$schema;
  return { type: "function", function: { name: t.name, description: t.description, parameters: params } };
}

export async function runAgent(opts: RunAgentOptions): Promise<RunAgentResult> {
  const { emit, tools, solution } = opts;
  const channel = opts.channel ?? "main";
  const specs = tools.map(toSpec);
  const messages: ChatMessage[] = [{ role: "system", content: opts.system }, ...opts.messages];
  const toolResults: RunAgentResult["toolResults"] = [];
  const approvals: string[] = [];
  const maxSteps = opts.maxSteps ?? 8;
  let final = "";

  for (let step = 0; step < maxSteps; step++) {
    const gen = chatStream({
      messages,
      tools: specs,
      modelKey: opts.modelKey,
      temperature: opts.temperature ?? 0.2,
      maxTokens: 2048,
      solution,
      task: "agent",
      signal: emit.signal,
    });
    let res;
    let streamed = "";
    while (true) {
      const n = await gen.next();
      if (n.done) {
        res = n.value;
        break;
      }
      if (n.value.content) {
        streamed += n.value.content;
        emit.text(n.value.content, channel);
      }
      if (n.value.reasoning) emit.reasoning(n.value.reasoning);
    }

    if (!res.toolCalls.length) {
      final = res.content;
      messages.push({ role: "assistant", content: res.content });
      break;
    }

    // The model may have produced a short preamble before calling tools — keep it in the transcript.
    if (streamed.trim()) emit.text("\n\n", channel);
    messages.push({ role: "assistant", content: res.content || null, tool_calls: res.toolCalls });

    for (const call of res.toolCalls) {
      const tool = tools.find((t) => t.name === call.function.name);
      let args: unknown = {};
      try {
        args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        args = {};
      }
      if (!tool) {
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: "Unknown tool" }) });
        continue;
      }
      const parsed = tool.parameters.safeParse(args);
      const a = parsed.success ? parsed.data : args;
      const label = safeLabel(tool, a);
      const t0 = Date.now();
      emit.send({ type: "tool", id: call.id, name: tool.name, label, status: "running", input: a });

      try {
        if (tool.approval) {
          const spec = await tool.approval(a, { emit, solution });
          const approval = createApproval({
            solution,
            title: spec.title,
            summary: spec.summary,
            actionLabel: spec.actionLabel,
            approver: spec.approver,
            effects: spec.effects,
            payload: spec.payload ?? a,
          });
          approvals.push(approval.id);
          emit.send({
            type: "tool",
            id: call.id,
            name: tool.name,
            label,
            status: "awaiting_approval",
            input: a,
            output: { approvalId: approval.id },
            ms: Date.now() - t0,
          });
          emit.send({
            type: "approval",
            approval: {
              id: approval.id,
              title: approval.title,
              summary: approval.summary,
              solution,
              actionLabel: approval.actionLabel,
              approver: approval.approver,
              status: "pending",
              createdAt: approval.createdAt,
            },
          });
          const result = {
            status: "queued_for_human_approval",
            approvalId: approval.id,
            approver: `${spec.approver.name} (${spec.approver.title})`,
            note: "The action has NOT been executed yet. Tell the user it is awaiting approval.",
          };
          toolResults.push({ name: tool.name, args: a, result });
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
        } else if (tool.execute) {
          const result = await tool.execute(a, { emit, solution });
          toolResults.push({ name: tool.name, args: a, result });
          emit.send({
            type: "tool",
            id: call.id,
            name: tool.name,
            label,
            status: "done",
            input: a,
            output: result,
            ms: Date.now() - t0,
          });
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result ?? null) });
        }
      } catch (err) {
        const message = (err as Error).message;
        emit.send({ type: "tool", id: call.id, name: tool.name, label, status: "error", output: { error: message } });
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: message }) });
      }
    }
  }

  return { final, messages, toolResults, approvals };
}

function safeLabel(tool: AgentTool<any>, args: unknown) {
  try {
    return tool.label(args as never);
  } catch {
    return tool.name;
  }
}
