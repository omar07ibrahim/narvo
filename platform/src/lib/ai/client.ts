import "server-only";
import { getEndpoint, isLocalHost, resolveModelId, type ModelRole } from "./config";
import { recordCall } from "./telemetry";

/**
 * Minimal OpenAI-compatible chat client built on fetch.
 * Works unchanged against OpenRouter, LM Studio, mlx-lm, Ollama and vLLM.
 */

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "input_audio"; input_audio: { data: string; format: "wav" | "mp3" | "webm" | "ogg" | "m4a" } };

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string | ContentPart[] }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; content: string; tool_call_id: string };

export interface ToolSpec {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ChatOptions {
  messages: ChatMessage[];
  role?: ModelRole;
  modelKey?: string | null;
  temperature?: number;
  maxTokens?: number;
  tools?: ToolSpec[];
  toolChoice?: "auto" | "none" | "required";
  responseFormat?: Record<string, unknown>;
  /** Enable model "thinking". Off by default for snappy demos. */
  reasoning?: boolean;
  /** Abort a streamed call if no data arrives within this time (default 75 s; 180 s on a local server, which queues requests and may be loading the model). */
  firstTokenTimeoutMs?: number;
  /** Telemetry labels */
  solution?: string;
  task?: string;
  signal?: AbortSignal;
}

export interface ChatResult {
  content: string;
  reasoning: string;
  toolCalls: ToolCall[];
  usage: { promptTokens: number; completionTokens: number };
  model: string;
  ms: number;
}

export class ModelError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

function buildBody(opts: ChatOptions, stream: boolean) {
  const { provider } = getEndpoint();
  const model = resolveModelId(opts.role ?? "main", opts.modelKey);
  const body: Record<string, unknown> = {
    model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.maxTokens ?? 2048,
    stream,
  };
  if (opts.tools?.length) {
    body.tools = opts.tools;
    body.tool_choice = opts.toolChoice ?? "auto";
  }
  if (opts.responseFormat) body.response_format = opts.responseFormat;
  if (provider === "openrouter") {
    body.reasoning = opts.reasoning ? { effort: "low" } : { enabled: false };
    if (stream) body.usage = { include: true };
  } else {
    // Qwen-family local servers honour one of these to skip the thinking phase:
    // mlx-lm / vLLM read chat_template_kwargs, LM Studio reads reasoning_effort.
    body.chat_template_kwargs = { enable_thinking: !!opts.reasoning };
    body.reasoning_effort = opts.reasoning ? "low" : "none";
    if (stream) body.stream_options = { include_usage: true };
  }
  return { body, model };
}

function headers(apiKey: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    "HTTP-Referer": "https://narvo.ae",
    "X-Title": "NARVO Private Intelligence",
  };
}

async function post(path: string, payload: unknown, signal?: AbortSignal) {
  const { baseUrl, apiKey } = getEndpoint();
  const json = JSON.stringify(payload);
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: headers(apiKey),
    body: json,
    signal,
  });
  const egress = isLocalHost(baseUrl) ? 0 : Buffer.byteLength(json);
  return { res, egress };
}

/** Separate <think>…</think> blocks some local models emit inline. */
function splitThinking(text: string): { content: string; reasoning: string } {
  const m = text.match(/<think>([\s\S]*?)(<\/think>|$)/);
  if (!m) return { content: text, reasoning: "" };
  return { content: text.replace(m[0], "").trimStart(), reasoning: m[1].trim() };
}

export async function chat(opts: ChatOptions): Promise<ChatResult> {
  // A local server sends nothing until a non-streamed completion is finished, and Node's fetch gives up
  // waiting for response headers after 300 s. Stream instead: same result, plus the first-token watchdog.
  if (getEndpoint().provider === "local") {
    const gen = chatStream({ ...opts, task: opts.task ?? "chat" });
    let n = await gen.next();
    while (!n.done) n = await gen.next();
    return n.value;
  }
  const started = Date.now();
  const { body, model } = buildBody(opts, false);
  const { provider } = getEndpoint();
  let egress = 0;
  try {
    const { res, egress: e } = await post("/chat/completions", body, opts.signal);
    egress = e;
    const text = await res.text();
    if (!res.ok) throw new ModelError(parseError(text, res.status), res.status);
    const data = JSON.parse(text);
    const msg = data.choices?.[0]?.message ?? {};
    const split = splitThinking(msg.content ?? "");
    const result: ChatResult = {
      content: split.content,
      reasoning: msg.reasoning ?? msg.reasoning_content ?? split.reasoning ?? "",
      toolCalls: msg.tool_calls ?? [],
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
      },
      model,
      ms: Date.now() - started,
    };
    recordCall({
      solution: opts.solution ?? "platform",
      task: opts.task ?? "chat",
      model,
      provider,
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
      ms: result.ms,
      egressBytes: egress + (provider === "local" ? 0 : Buffer.byteLength(text)),
      ok: true,
    });
    return result;
  } catch (err) {
    recordCall({
      solution: opts.solution ?? "platform",
      task: opts.task ?? "chat",
      model,
      provider,
      promptTokens: 0,
      completionTokens: 0,
      ms: Date.now() - started,
      egressBytes: egress,
      ok: false,
      error: (err as Error).message,
    });
    throw err;
  }
}

export interface StreamDelta {
  content?: string;
  reasoning?: string;
}

/**
 * Stream a completion. Yields content / reasoning deltas and returns the full result,
 * including any tool calls (accumulated from streamed fragments).
 */
export async function* chatStream(opts: ChatOptions): AsyncGenerator<StreamDelta, ChatResult> {
  const started = Date.now();
  const { body, model } = buildBody(opts, true);
  const { provider } = getEndpoint();
  // Combine the caller's abort signal with a first-token watchdog.
  const watchdog = new AbortController();
  const onAbort = () => watchdog.abort();
  opts.signal?.addEventListener("abort", onAbort);
  let gotData = false;
  const timeoutMs = opts.firstTokenTimeoutMs ?? (provider === "local" ? 180_000 : 75_000);
  const timer = setTimeout(() => {
    if (!gotData) watchdog.abort();
  }, timeoutMs);
  let res: Response;
  let egress: number;
  try {
    ({ res, egress } = await post("/chat/completions", body, watchdog.signal));
  } catch (err) {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
    if (watchdog.signal.aborted && !opts.signal?.aborted) throw new ModelError(`The model did not start responding within ${Math.round(timeoutMs / 1000)} s — please try again.`);
    throw err;
  }
  if (!res.ok || !res.body) {
    const text = await res.text();
    recordCall({
      solution: opts.solution ?? "platform",
      task: opts.task ?? "stream",
      model,
      provider,
      promptTokens: 0,
      completionTokens: 0,
      ms: Date.now() - started,
      egressBytes: egress,
      ok: false,
      error: parseError(text, res.status),
    });
    throw new ModelError(parseError(text, res.status), res.status);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let reasoning = "";
  let inThink = false;
  let usage = { promptTokens: 0, completionTokens: 0 };
  let received = 0;
  const toolAcc: Record<number, ToolCall> = {};

  while (true) {
    let chunkRead;
    try {
      chunkRead = await reader.read();
    } catch (err) {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
      if (watchdog.signal.aborted && !opts.signal?.aborted && !gotData)
        throw new ModelError(`The model did not start responding within ${Math.round(timeoutMs / 1000)} s — please try again.`);
      throw err;
    }
    const { done, value } = chunkRead;
    if (done) break;
    if (!gotData) {
      gotData = true;
      clearTimeout(timer);
    }
    received += value.byteLength;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let chunk: any;
      try {
        chunk = JSON.parse(payload);
      } catch {
        continue;
      }
      if (chunk.error) throw new ModelError(chunk.error.message ?? "Model stream error");
      if (chunk.usage) {
        usage = {
          promptTokens: chunk.usage.prompt_tokens ?? 0,
          completionTokens: chunk.usage.completion_tokens ?? 0,
        };
      }
      const delta = chunk.choices?.[0]?.delta ?? {};
      if (Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const idx = typeof tc.index === "number" ? tc.index : 0;
          const acc = (toolAcc[idx] ??= { id: tc.id ?? `call_${idx}`, type: "function", function: { name: "", arguments: "" } });
          if (tc.id) acc.id = tc.id;
          if (tc.function?.name) acc.function.name += tc.function.name;
          if (tc.function?.arguments) acc.function.arguments += tc.function.arguments;
        }
      }
      const r = delta.reasoning ?? delta.reasoning_content;
      if (r) {
        reasoning += r;
        yield { reasoning: r };
      }
      if (delta.content) {
        let piece: string = delta.content;
        // Handle inline <think> tags from local models.
        if (piece.includes("<think>")) {
          inThink = true;
          piece = piece.replace("<think>", "");
        }
        if (inThink) {
          const end = piece.indexOf("</think>");
          if (end === -1) {
            reasoning += piece;
            yield { reasoning: piece };
            continue;
          }
          const thought = piece.slice(0, end);
          reasoning += thought;
          if (thought) yield { reasoning: thought };
          piece = piece.slice(end + "</think>".length);
          inThink = false;
        }
        if (piece) {
          content += piece;
          yield { content: piece };
        }
      }
    }
  }

  clearTimeout(timer);
  opts.signal?.removeEventListener("abort", onAbort);
  const ms = Date.now() - started;
  recordCall({
    solution: opts.solution ?? "platform",
    task: opts.task ?? "stream",
    model,
    provider,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    ms,
    egressBytes: egress + (provider === "local" ? 0 : received),
    ok: true,
  });
  const toolCalls = Object.keys(toolAcc)
    .map(Number)
    .sort((a, b) => a - b)
    .map((k) => toolAcc[k])
    .filter((t) => t.function.name);
  return { content, reasoning, toolCalls, usage, model, ms };
}

function parseError(text: string, status: number): string {
  try {
    const j = JSON.parse(text);
    const msg = j.error?.message ?? j.message ?? text;
    if (status === 401) return `Model provider rejected the API key (401): ${msg}`;
    if (status === 402) return `Model provider account has insufficient credits (402): ${msg}`;
    return `Model provider error ${status}: ${msg}`;
  } catch {
    return `Model provider error ${status}: ${text.slice(0, 300)}`;
  }
}

/** Convenience: plain text completion. */
export async function complete(
  system: string,
  user: string | ContentPart[],
  opts: Omit<ChatOptions, "messages"> = {},
): Promise<string> {
  const r = await chat({ ...opts, messages: [{ role: "system", content: system }, { role: "user", content: user }] });
  return r.content.trim();
}
