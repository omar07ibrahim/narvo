import { z } from "zod";
import { addAudit, kvSet } from "@/lib/store/db";
import { HR_DIRECTOR, KV, SLUG, loadRequisition } from "@/app/solutions/12-recruitment/_lib/data";

const schema = z.object({
  criteria: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(3),
        labelAr: z.string().optional(),
        weight: z.number().min(0).max(100),
        description: z.string().optional(),
        evidence: z.string().optional(),
      }),
    )
    .min(2)
    .max(12),
});

/** HR edits job-related criteria and weights. Weight changes re-rank instantly; wording changes mark evaluations stale. */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return new Response(parsed.error.issues.map((i) => i.message).join("; "), { status: 400 });
  const before = loadRequisition().criteria;
  const next = parsed.data.criteria;
  kvSet(KV.criteria, next);
  const changes = next
    .map((c) => {
      const b = before.find((x) => x.id === c.id);
      if (!b) return `${c.id} added (${c.weight}%)`;
      const parts: string[] = [];
      if (b.weight !== c.weight) parts.push(`${c.id} ${b.weight}%→${c.weight}%`);
      if (b.label !== c.label) parts.push(`${c.id} reworded`);
      return parts.join(", ");
    })
    .filter(Boolean);
  addAudit({
    solution: SLUG,
    actor: { name: HR_DIRECTOR.name, role: HR_DIRECTOR.title, kind: "human" },
    action: "Updated evaluation criteria",
    subject: "MNDA-HR-REQ-2026-077",
    detail: changes.join("; ") || "No changes",
  });
  return Response.json({ criteria: next });
}
