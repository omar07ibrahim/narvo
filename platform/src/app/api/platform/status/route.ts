import { getEndpoint, resolveModelId, findModel } from "@/lib/ai/config";
import { getTelemetry } from "@/lib/ai/telemetry";
import { getPrefs } from "@/lib/ai/request";

export async function GET(req: Request) {
  const { provider, baseUrl } = getEndpoint();
  const { modelKey } = getPrefs(req);
  const t = getTelemetry();
  const model = resolveModelId("main", modelKey);
  return Response.json({
    provider,
    host: new URL(baseUrl).host,
    model,
    modelLabel: findModel(modelKey).label,
    egressBytes: t.egressBytes,
    calls: t.totals.calls,
    tokens: t.totals.promptTokens + t.totals.completionTokens,
    avgMs: t.totals.calls ? Math.round(t.totals.ms / t.totals.calls) : 0,
  });
}
