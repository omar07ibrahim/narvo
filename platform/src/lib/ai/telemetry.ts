import "server-only";

/**
 * In-process telemetry for every model call: latency, tokens, provider and bytes that left
 * the machine. Powers the privacy badge ("0 B egress") and the Private AI Platform console.
 */

export interface CallRecord {
  id: string;
  ts: number;
  solution: string;
  task: string;
  model: string;
  provider: "openrouter" | "local";
  promptTokens: number;
  completionTokens: number;
  ms: number;
  egressBytes: number;
  ok: boolean;
  error?: string;
}

interface TelemetryState {
  calls: CallRecord[];
  egressBytes: number;
  startedAt: number;
}

const g = globalThis as unknown as { __narvoTelemetry?: TelemetryState };
const state: TelemetryState = (g.__narvoTelemetry ??= { calls: [], egressBytes: 0, startedAt: Date.now() });

export function recordCall(rec: Omit<CallRecord, "id" | "ts">) {
  const full: CallRecord = { ...rec, id: crypto.randomUUID(), ts: Date.now() };
  state.calls.unshift(full);
  if (state.calls.length > 2000) state.calls.length = 2000;
  state.egressBytes += rec.egressBytes;
  return full;
}

export function addEgress(bytes: number) {
  state.egressBytes += bytes;
}

export function getTelemetry() {
  const calls = state.calls;
  const totals = calls.reduce(
    (acc, c) => {
      acc.calls += 1;
      acc.promptTokens += c.promptTokens;
      acc.completionTokens += c.completionTokens;
      acc.ms += c.ms;
      if (!c.ok) acc.errors += 1;
      return acc;
    },
    { calls: 0, promptTokens: 0, completionTokens: 0, ms: 0, errors: 0 },
  );
  return {
    startedAt: state.startedAt,
    egressBytes: state.egressBytes,
    totals,
    recent: calls.slice(0, 200),
  };
}
