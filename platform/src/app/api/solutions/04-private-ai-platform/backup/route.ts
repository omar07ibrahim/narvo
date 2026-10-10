import fs from "node:fs";
import path from "node:path";
import { addAudit } from "@/lib/store/db";

const DB = path.join(process.cwd(), "data", "runtime", "db.json");

/** Recovery: export the platform's runtime state (approvals, audit, records) as a JSON snapshot. */
export async function GET() {
  // Give the debounced writer a moment to flush.
  await new Promise((r) => setTimeout(r, 250));
  const content = fs.existsSync(DB) ? fs.readFileSync(DB, "utf8") : JSON.stringify({ version: 1 });
  addAudit({
    solution: "04-private-ai-platform",
    actor: { name: "Platform Operator", role: "NARVO Operations", kind: "human" },
    action: "Exported state snapshot",
    subject: "data/runtime/db.json",
    detail: `${(Buffer.byteLength(content) / 1024).toFixed(1)} KB`,
  });
  return new Response(content, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="narvo-state-${new Date().toISOString().slice(0, 19).replace(/:/g, "")}.json"`,
    },
  });
}
