import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { addAudit } from "@/lib/store/db";
import { SOL, getByo, getCertificates, getForms, getRequirements, loadSeed, putCoverage, setByo } from "@/app/solutions/09-bid-proposal/_lib/server";
import { mapEvidence } from "@/app/solutions/09-bid-proposal/_lib/ai";
import type { Coverage } from "@/app/solutions/09-bid-proposal/_lib/types";

export const maxDuration = 300;

/** Map every requirement to approved evidence (BM25 + model judgement + computed checks). */
export async function POST(req: Request) {
  const body = await readBody<{ source?: "057" | "custom"; only?: string[] }>(req);
  const { modelKey, lang } = getPrefs(req, body);
  const custom = body.source === "custom";

  return eventStream(
    req,
    async (emit) => {
      const seed = loadSeed();
      const byo = custom ? getByo() : null;
      const all = custom ? (byo?.requirements ?? []) : (getRequirements()?.items ?? []);
      if (!all.length) throw new Error(lang === "ar" ? "استخرج المتطلبات أولاً" : "Extract the requirements first");
      const requirements = body.only?.length ? all.filter((r) => body.only!.includes(r.id)) : all;

      const acc: Record<string, Coverage> = custom ? { ...(byo?.coverage ?? {}) } : {};
      const entries = await mapEvidence(
        { emit, lang, modelKey },
        {
          requirements,
          seed,
          certs: getCertificates(seed),
          forms: getForms(seed),
          computeChecks: !custom,
          onBatch: (batch) => {
            for (const e of batch) acc[e.reqId] = e;
            if (!custom) putCoverage(batch);
            emit.data("coverage", { ...acc });
          },
        },
      );
      if (custom && byo) setByo({ ...byo, coverage: acc });

      const met = entries.filter((e) => e.status === "met").length;
      addAudit({
        solution: SOL,
        actor: { name: "NARVO Agent", role: "AI agent", kind: "agent" },
        action: "Mapped requirements to evidence",
        subject: custom ? (byo?.name ?? "Uploaded RFP") : seed.tender.ref,
        detail: `${met}/${entries.length} evidenced · ${entries.filter((e) => e.status === "partial").length} partial · ${entries.filter((e) => e.status === "missing").length} missing`,
      });
    },
    { modelKey },
  );
}
