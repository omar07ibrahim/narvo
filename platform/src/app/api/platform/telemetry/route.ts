import { getTelemetry } from "@/lib/ai/telemetry";
import { getEndpoint } from "@/lib/ai/config";

export async function GET() {
  const { provider, baseUrl } = getEndpoint();
  return Response.json({ provider, host: new URL(baseUrl).host, ...getTelemetry() });
}
