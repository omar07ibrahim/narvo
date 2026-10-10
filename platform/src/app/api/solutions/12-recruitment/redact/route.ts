import { fairnessGuard } from "@/app/solutions/12-recruitment/_lib/fairness";
import { getUploads, loadApplications, loadCv } from "@/app/solutions/12-recruitment/_lib/data";

export const dynamic = "force-dynamic";

/** Redaction preview: exactly what the model will (and will not) see for one application. */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("appId") ?? "";
  if (id.startsWith("UPL-")) {
    const u = getUploads().find((x) => x.id === id);
    if (!u) return new Response("Upload not found", { status: 404 });
    const g = fairnessGuard(u.text);
    return Response.json({ appId: id, original: u.text, redacted: g.text, removed: g.removed, counts: g.counts, leaks: g.leaks, autoFixed: g.autoFixed });
  }
  const app = loadApplications().find((a) => a.id === id);
  if (!app) return new Response("Application not found", { status: 404 });
  const cv = loadCv(app);
  if (!cv) return new Response("No CV on file", { status: 404 });
  const g = fairnessGuard(cv, { name: app.candidate.name, nameAr: app.candidate.nameAr });
  return Response.json({ appId: id, original: cv, redacted: g.text, removed: g.removed, counts: g.counts, leaks: g.leaks, autoFixed: g.autoFixed });
}
