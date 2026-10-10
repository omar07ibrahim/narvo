import { kvGet, kvSet, addAudit } from "@/lib/store/db";

const KEY = "04-private-ai-platform:policy";

const ROLES = ["Contractor (external)", "Customer Happiness agent", "Case officer", "Section head", "Director", "Platform administrator"];
const LEVELS = ["Public", "Internal", "Confidential", "Secret"];

const DEFAULT: Record<string, string[]> = {
  "Contractor (external)": ["Public"],
  "Customer Happiness agent": ["Public", "Internal"],
  "Case officer": ["Public", "Internal"],
  "Section head": ["Public", "Internal", "Confidential"],
  Director: ["Public", "Internal", "Confidential"],
  "Platform administrator": ["Public", "Internal"],
};

/** Access policy: which document classifications each role may retrieve through AI. */
export async function GET() {
  return Response.json({ roles: ROLES, levels: LEVELS, policy: kvGet<Record<string, string[]>>(KEY) ?? DEFAULT });
}

export async function POST(req: Request) {
  const body = (await req.json()) as { role: string; level: string; allowed: boolean };
  const policy = { ...(kvGet<Record<string, string[]>>(KEY) ?? DEFAULT) };
  const set = new Set(policy[body.role] ?? []);
  if (body.allowed) set.add(body.level);
  else set.delete(body.level);
  policy[body.role] = LEVELS.filter((l) => set.has(l));
  kvSet(KEY, policy);
  addAudit({
    solution: "04-private-ai-platform",
    actor: { name: "Hessa Al Suwaidi", role: "Director, Digital Transformation Office", kind: "human" },
    action: body.allowed ? "Granted classification access" : "Revoked classification access",
    subject: body.role,
    detail: body.level,
  });
  return Response.json({ policy });
}
