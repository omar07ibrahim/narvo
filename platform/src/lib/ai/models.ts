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
    local: "qwen3.8-27b",
    capabilities: ["text", "vision", "tools", "arabic"],
    note: "Default reasoning model — multimodal, 262K context",
  },
  {
    key: "gemma-4-26b",
    label: "Gemma 4 26B A4B",
    family: "Gemma",
    publisher: "Google DeepMind",
    params: "26B MoE · 3.8B active",
    licence: "Apache 2.0",
    openrouter: "google/gemma-4-26b-a4b-it",
    local: "gemma-4-26b-a4b-it",
    capabilities: ["text", "vision", "tools", "arabic"],
    note: "Fast mixture-of-experts model",
  },
  {
    key: "falcon-h1-arabic",
    label: "Falcon-H1 Arabic 7B",
    family: "Falcon",
    publisher: "TII · Abu Dhabi",
    params: "7B hybrid",
    licence: "Falcon LLM licence",
    openrouter: null,
    local: "falcon-h1-arabic-7b",
    capabilities: ["text", "arabic"],
    note: "Emirati Arabic-first model — on-device only",
  },
  {
    key: "jais-2-8b",
    label: "Jais 2 8B",
    family: "Jais",
    publisher: "Inception · MBZUAI",
    params: "8B dense",
    licence: "Jais 2 licence",
    openrouter: null,
    local: "jais-2-8b-chat",
    capabilities: ["text", "arabic"],
    note: "Emirati Arabic-centric model — on-device only",
  },
];

export const DEFAULT_MODEL_KEY = "qwen3.8-27b";

export function findModel(key?: string | null): ModelOption {
  return MODEL_OPTIONS.find((m) => m.key === key) ?? MODEL_OPTIONS.find((m) => m.key === DEFAULT_MODEL_KEY)!;
}
