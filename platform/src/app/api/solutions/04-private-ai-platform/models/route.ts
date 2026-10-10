import { getEndpoint, MODEL_OPTIONS, resolveModelId } from "@/lib/ai/config";

let cache: { at: number; ids: string[]; ok: boolean; ms: number; error?: string } | null = null;

/** Health check: list models on the serving endpoint and match them with the NARVO catalogue. */
export async function GET() {
  const { baseUrl, apiKey, provider } = getEndpoint();
  if (!cache || Date.now() - cache.at > 60_000) {
    const t0 = Date.now();
    try {
      const res = await fetch(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(8000) });
      const data = await res.json();
      cache = { at: Date.now(), ids: (data.data ?? []).map((m: { id: string }) => m.id), ok: res.ok, ms: Date.now() - t0 };
    } catch (e) {
      cache = { at: Date.now(), ids: [], ok: false, ms: Date.now() - t0, error: (e as Error).message };
    }
  }
  const models = MODEL_OPTIONS.map((m) => {
    const id = provider === "local" ? resolveModelId("main", m.key) : m.openrouter;
    return { ...m, servedId: id, available: !!id && cache!.ids.some((x) => x === id || x.startsWith(id)) };
  });
  return Response.json({ provider, host: new URL(baseUrl).host, endpointOk: cache.ok, listMs: cache.ms, totalServed: cache.ids.length, error: cache.error, models });
}
