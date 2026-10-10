import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { addAudit, appendRecord } from "@/lib/store/db";
import { COL, SOL, getCoverage, getRequirements, getTasks, loadSeed } from "@/app/solutions/09-bid-proposal/_lib/server";
import { planTasks } from "@/app/solutions/09-bid-proposal/_lib/ai";

export const maxDuration = 300;

/** Turn open evidence gaps into contributor tasks with owners from the Raseen FM bid team. */
export async function POST(req: Request) {
  const body = await readBody<{ only?: string[] }>(req);
  const { modelKey, lang } = getPrefs(req, body);

  return eventStream(
    req,
    async (emit) => {
      const seed = loadSeed();
      const reqs = getRequirements()?.items ?? [];
      const cov = getCoverage();
      if (!reqs.length || !Object.keys(cov).length) throw new Error(lang === "ar" ? "اربط المتطلبات بالأدلة أولاً" : "Map the requirements to evidence first");
      const openFor = new Set(getTasks().filter((t) => t.status === "open").map((t) => t.reqId));
      const rank = (s: string, m: boolean) => (s === "missing" ? 0 : 1) + (m ? 0 : 2);
      const gaps = reqs
        .filter((r) => cov[r.id] && cov[r.id].status !== "met" && !openFor.has(r.id) && (!body.only?.length || body.only.includes(r.id)))
        .map((r) => ({ req: r, cov: cov[r.id] }))
        .sort((a, b) => rank(a.cov.status, a.req.mandatory) - rank(b.cov.status, b.req.mandatory))
        .slice(0, 16);
      const s0 = emit.step("gaps", lang === "ar" ? "تحديد الفجوات المفتوحة" : "Collecting open gaps");
      s0.done(lang === "ar" ? `${gaps.length} فجوة بدون مهمة مفتوحة` : `${gaps.length} gaps without an open task`);
      if (!gaps.length) {
        emit.data("tasks", []);
        return;
      }
      const tasks = await planTasks({ emit, lang, modelKey }, { gaps, team: seed.team, seed });
      for (const t of tasks) appendRecord(COL.tasks, t);
      const byOwner = new Map<string, number>();
      tasks.forEach((t) => byOwner.set(t.owner, (byOwner.get(t.owner) ?? 0) + 1));
      addAudit({
        solution: SOL,
        actor: { name: "Leena Mattar", role: "Bid Manager, Raseen FM", kind: "human" },
        action: "Assigned contributor tasks",
        subject: seed.tender.ref,
        detail: [...byOwner.entries()].map(([o, n]) => `${o} (${n})`).join(", "),
      });
      emit.data("tasks", tasks);
    },
    { modelKey },
  );
}
