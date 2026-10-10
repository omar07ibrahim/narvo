import { addAudit, kvSet } from "@/lib/store/db";
import { HR_DIRECTOR, KV, SLUG } from "@/app/solutions/12-recruitment/_lib/data";

/** Emiratisation (HC-POL-03) is an explicit, separate HR policy step — never part of the AI evaluation. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { applied?: boolean };
  const applied = !!body.applied;
  kvSet(KV.policy, applied);
  addAudit({
    solution: SLUG,
    actor: { name: HR_DIRECTOR.name, role: HR_DIRECTOR.title, kind: "human" },
    action: applied ? "Applied Emiratisation policy step (HC-POL-03)" : "Removed Emiratisation policy step",
    subject: "MNDA-HR-REQ-2026-077",
    detail: "Policy applied by Human Capital after the job-related evaluation; AI scores unchanged",
  });
  return Response.json({ applied });
}
