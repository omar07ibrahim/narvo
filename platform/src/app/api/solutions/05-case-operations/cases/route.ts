import { loadCases, loadMessages, getReview } from "@/app/solutions/05-case-operations/_lib/data";
import { listApprovals } from "@/lib/store/db";

/** Case list with runtime overlays, correspondence, last AI review and open approvals. */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  const cases = loadCases();
  if (id) {
    const c = cases.find((x) => x.id === id);
    if (!c) return new Response("Not found", { status: 404 });
    return Response.json({
      case: c,
      messages: loadMessages(id),
      review: getReview(id) ?? null,
      approvals: listApprovals({ solution: "05-case-operations" }).filter((a) => a.title.includes(id)),
    });
  }
  return Response.json({ cases, messages: loadMessages() });
}
