import "server-only";

/**
 * Model + provider configuration.
 *
 * NARVO talks to any OpenAI-compatible endpoint. During development we use OpenRouter with the
 * exact same open-weight models that run on-device later (LM Studio / mlx-lm / Ollama / vLLM),
 * so switching to private mode is a one-line change: NARVO_PROVIDER=local.
 */

export type ProviderKind = "openrouter" | "local";
export type ModelRole = "main" | "fast" | "vision" | "audio";

import { MODEL_OPTIONS, DEFAULT_MODEL_KEY, findModel, type ModelOption } from "./models";
export { MODEL_OPTIONS, DEFAULT_MODEL_KEY, findModel, type ModelOption };


/** Audio transcription in development uses an omni model; on-device uses Whisper (mlx-whisper). */
const AUDIO_MODEL = {
  openrouter: "qwen/qwen3.8-omni-flash",
  local: "whisper-large-v3-turbo",
};

export function getProvider(): ProviderKind {
  return process.env.NARVO_PROVIDER === "local" ? "local" : "openrouter";
}

export function getEndpoint(): { baseUrl: string; apiKey: string; provider: ProviderKind } {
  const provider = getProvider();
  if (provider === "local") {
    return {
      provider,
      baseUrl: (process.env.LOCAL_BASE_URL || "http://127.0.0.1:1234/v1").replace(/\/$/, ""),
      apiKey: process.env.LOCAL_API_KEY || "local",
    };
  }
  return {
    provider,
    baseUrl: (process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/$/, ""),
    apiKey: process.env.OPENROUTER_API_KEY || "",
  };
}

/**
 * Resolve the concrete model id for a request.
 * - `modelKey` comes from the model switcher in the UI.
 * - Models that only exist on-device fall back to the default model in development.
 */
export function resolveModelId(role: ModelRole = "main", modelKey?: string | null): string {
  const provider = getProvider();
  const envOverride: Record<ModelRole, string | undefined> = {
    main: process.env.NARVO_MODEL_MAIN,
    fast: process.env.NARVO_MODEL_FAST,
    vision: process.env.NARVO_MODEL_VISION,
    audio: process.env.NARVO_MODEL_AUDIO,
  };
  if (role === "audio") return envOverride.audio || AUDIO_MODEL[provider];

  const chosen = findModel(modelKey);
  if (provider === "local") {
    if (!modelKey && envOverride[role]) return envOverride[role]!;
    return chosen.local;
  }
  if (!modelKey && envOverride[role]) return envOverride[role]!;
  return chosen.openrouter ?? findModel(DEFAULT_MODEL_KEY).openrouter!;
}

export function isLocalHost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local");
  } catch {
    return false;
  }
}
