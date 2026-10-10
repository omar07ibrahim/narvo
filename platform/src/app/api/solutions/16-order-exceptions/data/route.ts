import { loadSnapshot } from "@/app/solutions/16-order-exceptions/_lib/data";
import { analyzeWorld, computeKpis } from "@/app/solutions/16-order-exceptions/_lib/detect";

export const dynamic = "force-dynamic";

/**
 * World snapshot for the order-exception workspace (seed + runtime overlay).
 * `?summary=1` also returns the server-side detection result (exceptions per order + KPIs).
 * `?order=SO-…` returns the analysis of one order.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const snapshot = loadSnapshot();
  const orderId = url.searchParams.get("order");
  if (orderId) {
    const w = analyzeWorld(snapshot);
    const a = w.byId[orderId];
    if (!a) return Response.json({ error: `Order ${orderId} not found` }, { status: 404 });
    return Response.json({ order: a.order, analysis: a, proposal: snapshot.proposals[orderId] ?? null });
  }
  if (url.searchParams.get("summary")) {
    const w = analyzeWorld(snapshot);
    const kpis = computeKpis(snapshot, w);
    return Response.json({
      kpis,
      exceptions: w.orders
        .filter((o) => o.exceptions.length)
        .map((o) => ({
          id: o.order.id,
          customer: o.customer.name,
          severity: o.severity,
          score: o.score,
          valueAtRisk: o.valueAtRisk,
          days: o.daysToPromise,
          types: o.types,
          details: o.exceptions.map((e) => e.detail.en),
        })),
      resolved: w.orders.filter((o) => o.order.resolution).map((o) => ({ id: o.order.id, status: o.order.status, types: o.types, lines: o.order.lines })),
    });
  }
  return Response.json(snapshot);
}
