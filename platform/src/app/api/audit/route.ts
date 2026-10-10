import fs from "node:fs";
import path from "node:path";
import { listAudit, type AuditEvent } from "@/lib/store/db";
import { DATA_DIR } from "@/lib/world/data";

/** Seeded organisational history: every `audit-seed.json` found under /data. */
function loadSeeds(): AuditEvent[] {
  const out: AuditEvent[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== "runtime") walk(p);
      } else if (e.name === "audit-seed.json") {
        try {
          const items = JSON.parse(fs.readFileSync(p, "utf8")) as Array<AuditEvent & { ts: number | string }>;
          for (const it of items) out.push({ ...it, ts: typeof it.ts === "string" ? Date.parse(it.ts) : it.ts });
        } catch {}
      }
    }
  };
  walk(DATA_DIR);
  return out;
}

/** Live audit events (this session) merged with the seeded organisational history. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const solution = url.searchParams.get("solution") ?? undefined;
  const limit = Number(url.searchParams.get("limit") ?? 300);
  const seed = loadSeeds().filter((e) => !solution || e.solution === solution);
  const live = listAudit({ solution, limit });
  const events = [...live, ...seed].sort((a, b) => b.ts - a.ts).slice(0, limit);
  return Response.json({ events, liveCount: live.length });
}
