import { resetDemo } from "@/lib/store/db";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { solution?: string };
  resetDemo(body.solution);
  return Response.json({ ok: true });
}
