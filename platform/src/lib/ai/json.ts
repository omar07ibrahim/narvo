import "server-only";
import { z } from "zod";
import { chat, ModelError, type ChatOptions, type ContentPart } from "./client";

/**
 * Structured output: ask the model for JSON that matches a zod schema.
 * 1. Try native json_schema response_format (OpenRouter + LM Studio support it).
 * 2. Fall back to instruction-only JSON if the provider rejects response_format.
 * 3. Validate with zod; on failure, one repair round with the validation errors.
 */

export interface GenerateObjectOptions<S extends z.ZodType> extends Omit<ChatOptions, "messages" | "responseFormat"> {
  schema: S;
  name: string;
  system: string;
  user: string | ContentPart[];
}

export interface GenerateObjectResult<T> {
  object: T;
  usage: { promptTokens: number; completionTokens: number };
  ms: number;
  model: string;
}

function jsonSchemaOf(schema: z.ZodType) {
  const js = z.toJSONSchema(schema, { target: "draft-7", unrepresentable: "any" }) as Record<string, unknown>;
  delete js.$schema;
  return js;
}

export function extractJson(text: string): unknown {
  const cleaned = text
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {}
  const start = cleaned.search(/[\[{]/);
  if (start === -1) throw new Error("Model did not return JSON");
  const open = cleaned[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return JSON.parse(cleaned.slice(start, i + 1));
    }
  }
  throw new Error("Model returned incomplete JSON");
}

export async function generateObject<S extends z.ZodType>(
  opts: GenerateObjectOptions<S>,
): Promise<GenerateObjectResult<z.infer<S>>> {
  const { schema, name, system, user, ...rest } = opts;
  const jsonSchema = jsonSchemaOf(schema);
  const schemaHint = `\n\nRespond with a single JSON object only — no prose, no markdown fences. It must validate against this JSON Schema:\n${JSON.stringify(jsonSchema)}`;

  const messages: ChatOptions["messages"] = [
    { role: "system", content: system + schemaHint },
    { role: "user", content: user },
  ];

  const started = Date.now();
  let result;
  try {
    result = await chat({
      ...rest,
      temperature: rest.temperature ?? 0.1,
      maxTokens: rest.maxTokens ?? 4096,
      messages,
      responseFormat: { type: "json_schema", json_schema: { name, schema: jsonSchema, strict: false } },
    });
  } catch (err) {
    if (err instanceof ModelError && err.status && [400, 422].includes(err.status)) {
      result = await chat({ ...rest, temperature: rest.temperature ?? 0.1, maxTokens: rest.maxTokens ?? 4096, messages });
    } else {
      throw err;
    }
  }

  let usage = { ...result.usage };
  let parsed: unknown;
  let issues = "";
  try {
    parsed = extractJson(result.content);
    const check = schema.safeParse(parsed);
    if (check.success) {
      return { object: check.data, usage, ms: Date.now() - started, model: result.model };
    }
    issues = check.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  } catch (e) {
    issues = (e as Error).message;
  }

  // One repair round.
  const repair = await chat({
    ...rest,
    temperature: 0,
    maxTokens: rest.maxTokens ?? 4096,
    messages: [
      ...messages,
      { role: "assistant", content: result.content },
      {
        role: "user",
        content: `Your JSON was invalid: ${issues}. Return the corrected JSON object only.`,
      },
    ],
  });
  usage = {
    promptTokens: usage.promptTokens + repair.usage.promptTokens,
    completionTokens: usage.completionTokens + repair.usage.completionTokens,
  };
  const fixed = schema.parse(extractJson(repair.content));
  return { object: fixed, usage, ms: Date.now() - started, model: repair.model };
}
