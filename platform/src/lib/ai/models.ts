/**
 * Model catalogue shared by server and client (model switcher, platform console).
 */

export interface ModelOption {
  key: string;
  label: string;
  family: string;
  publisher: string;
  params: string;
  licence: string;
  /** Model id on OpenRouter (development). null = only available on-device. */
  openrouter: string | null;
  /** Model id as exposed by the local server (LM Studio / mlx-lm). */
  local: string;
  capabilities: Array<"text" | "vision" | "tools" | "arabic" | "audio">;
  note?: string;
}

export const MODEL_OPTIONS: ModelOption[] = [
  {
    key: "qwen3.8-27b",
    label: "Qwen3.8 27B",
    family: "Qwen",
    publisher: "Alibaba Qwen",
    params: "27B dense",
    licence: "Apache 2.0",
    openrouter: "qwen/qwen3.8-27b",
    local: "qwen/qwen3.8-27b",
    capabilities: ["text", "vision", "tools", "arabic"],
    note: "Default reasoning model — multimodal, 262K context",
  },
];

export const DEFAULT_MODEL_KEY = "qwen3.8-27b";

export function findModel(key?: string | null): ModelOption {
  return MODEL_OPTIONS.find((m) => m.key === key) ?? MODEL_OPTIONS.find((m) => m.key === DEFAULT_MODEL_KEY)!;
}
