import { readBody } from "@/lib/ai/stream";
import { addAudit, appendRecord, patchRecord } from "@/lib/store/db";
import { COL_OVERRIDES, getForecastBundle, loadOverrides } from "@/app/solutions/17-demand-planning/_lib/data";

/** Planner forecast overrides: list, add (with reason), withdraw. Every change is audited. */
export async function GET() {
  return Response.json({ overrides: loadOverrides() });
}

export async function POST(req: Request) {
  const body = await readBody<{ key?: string; week?: string; value?: number; reason?: string; by?: string }>(req);
  const { key, week, reason } = body;
  const value = Number(body.value);
  if (!key || !week || !Number.isFinite(value) || value < 0) return new Response("key, week and a non-negative value are required", { status: 400 });
  if (!reason || reason.trim().length < 4) return new Response("A reason is required for every override", { status: 400 });
  const s = getForecastBundle().series.find((x) => x.key === key);
  const h = s?.forecast.weeks.indexOf(week) ?? -1;
  if (!s || h < 0) return new Response("Unknown series or week", { status: 404 });
  const original = s.forecast.p50[h];
  // Replace an existing override for the same cell
  for (const o of loadOverrides().filter((o) => o.key === key && o.week === week)) patchRecord(COL_OVERRIDES, o.id, { deleted: true });
  const item = {
    id: `OVR-${Date.now().toString(36).toUpperCase()}`,
    key,
    week,
    original,
    value,
    reason: reason.trim().slice(0, 240),
    by: body.by ?? "Joseph Abraham",
    ts: Date.now(),
  };
  appendRecord(COL_OVERRIDES, item);
  const change = original ? ((value - original) / original) * 100 : 0;
  addAudit({
    solution: "17-demand-planning",
    actor: { name: item.by, role: "Supply Chain & Planning Manager", kind: "human" },
    action: "Overrode forecast",
    subject: `${key.replace("|", " @ ")} · w/c ${week}`,
    detail: `${original} → ${value} (${change >= 0 ? "+" : ""}${change.toFixed(1)}%) — ${item.reason}`,
  });
  return Response.json({ override: item, overrides: loadOverrides() });
}

export async function DELETE(req: Request) {
  const body = await readBody<{ id?: string }>(req);
  const o = loadOverrides().find((x) => x.id === body.id);
  if (!o) return new Response("Override not found", { status: 404 });
  patchRecord(COL_OVERRIDES, o.id, { deleted: true });
  addAudit({
    solution: "17-demand-planning",
    actor: { name: "Joseph Abraham", role: "Supply Chain & Planning Manager", kind: "human" },
    action: "Withdrew forecast override",
    subject: `${o.key.replace("|", " @ ")} · w/c ${o.week}`,
    detail: `Back to statistical forecast ${o.original}`,
  });
  return Response.json({ overrides: loadOverrides() });
}
