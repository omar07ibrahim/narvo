import { z } from "zod";
import { eventStream, readBody, type Emitter } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { generateObject } from "@/lib/ai/json";
import { createApproval, listApprovals } from "@/lib/store/db";
import { workOrderSystem } from "@/app/solutions/20-facility-intelligence/_lib/prompts";
import {
  loadComplaints,
  loadContract,
  loadFeed,
  loadJobs,
  loadPpm,
  loadSeries,
  loadSites,
  loadWorkOrders,
  SLUG,
  WOS,
  type WorkOrder,
} from "@/app/solutions/20-facility-intelligence/_lib/data";
import { DEFAULT_CRITERIA, correlationEvidence, detectAnomalies } from "@/app/solutions/20-facility-intelligence/_lib/signals";
import { loadEnergy, loadTrips, CLEAN_AT } from "@/app/solutions/20-facility-intelligence/_lib/data";

const METRICS = ["hp_trips", "dp_drop_matched_ambient", "approach_ch02", "chws_occupied", "zone_band", "complaints"] as const;

const woSchema = z.object({
  title: z.string(),
  asset: z.string(),
  zones: z.array(z.string()).max(6),
  priority: z.enum(["P1", "P2", "P3", "P4"]),
  priorityReason: z.string(),
  scope: z.array(z.string()).min(3).max(8),
  safety: z.array(z.string()).min(2).max(7),
  verification: z.array(z.object({ metric: z.enum(METRICS), threshold: z.number(), description: z.string() })).max(6),
  linkedComplaints: z.array(z.string()).max(30),
  linkedJobs: z.array(z.string()).max(15),
  schedule: z.string(),
  estimatedHours: z.number().min(0.5).max(200),
  notes: z.string(),
});

function mergeCriteria(v: Array<{ metric: (typeof METRICS)[number]; threshold: number; description: string }>) {
  const have = new Set(v.map((x) => x.metric));
  return [...v, ...DEFAULT_CRITERIA.filter((c) => !have.has(c.metric))];
}

const SLA: Record<string, [number | null, number | null]> = { P1: [1, 24], P2: [4, 48], P3: [24, 120], P4: [null, null] };

async function tool<T>(emit: Emitter, name: string, label: string, input: unknown, fn: () => T): Promise<T> {
  const id = `${name}-${Math.random().toString(36).slice(2, 7)}`;
  const t0 = Date.now();
  emit.send({ type: "tool", id, name, label, status: "running", input });
  const out = fn();
  emit.send({ type: "tool", id, name, label, status: "done", input, output: out, ms: Date.now() - t0 });
  return out;
}

export async function POST(req: Request) {
  const body = await readBody<{ site?: "AGC" | "HQ"; issue?: { text: string; zone?: string; asset?: string; category?: string; priority?: string } }>(req);
  const { modelKey, lang } = getPrefs(req, body);
  const ar = lang === "ar";
  const siteId = body.site === "HQ" ? "HQ" : "AGC";
  return eventStream(
    req,
    async (emit) => {
      const site = loadSites().find((s) => s.id === siteId)!;
      const issue = body.issue;
      const assetId = issue?.asset && site.assets.some((a) => a.id === issue.asset) ? issue.asset : siteId === "AGC" && !issue ? "CH-02" : (issue?.asset ?? site.assets[0].id);
      const s0 = emit.step("context", ar ? "جمع السياق من الأنظمة المتصلة" : "Gathering context from connected systems");
      const { agc, hq } = loadSeries();
      const series = siteId === "AGC" ? agc : hq;
      const signal = await tool(emit, "get_signal_summary", `BMS anomalies — ${site.name}`, { site: siteId, asset: assetId }, () => {
        const an = detectAnomalies(series, site.zones);
        const counts = an.reduce<Record<string, number>>((a, x) => ((a[x.kind] = (a[x.kind] ?? 0) + 1), a), {});
        const ev =
          siteId === "AGC"
            ? correlationEvidence(agc, {
                trips: loadTrips(),
                complaints: loadComplaints(),
                jobs: loadJobs(),
                ppmDue: "2026-08-15",
                cleanAt: CLEAN_AT,
                energy: { sep25: loadEnergy().months[8].y2025, sep26: loadEnergy().months[8].y2026 ?? 0 },
              }).map((e) => e.text)
            : [];
        return { anomalies: counts, evidence: ev.slice(0, 5) };
      });
      const asset = await tool(emit, "get_asset", `Asset register — ${assetId}`, { asset: assetId }, () => site.assets.find((a) => a.id === assetId) ?? null);
      const ppm = await tool(emit, "get_ppm_status", `PPM schedule — ${site.id}`, { site: siteId }, () =>
        loadPpm()
          .filter((p) => p.site === siteId)
          .map((p) => ({ id: p.id, asset: p.asset, task: p.task, due: p.due, status: p.status, last: p.history.at(-1)?.event ?? null })),
      );
      const complaints = await tool(emit, "get_linked_complaints", `Complaints — ${site.name}`, { site: siteId, zone: issue?.zone ?? "all" }, () =>
        loadComplaints()
          .filter((c) => c.site === siteId && (!issue?.zone || c.zone === issue.zone || !issue))
          .map((c) => ({ id: c.id, at: c.receivedAt.slice(0, 16), zone: c.zone, text: c.text.slice(0, 140) })),
      );
      const jobs = await tool(emit, "get_contractor_jobs", `Contractor jobs & completion reports — ${assetId}`, { asset: assetId }, () => ({
        jobs: loadJobs()
          .filter((j) => j.site === siteId && (j.asset === assetId || j.id === "JOB-RFM-26-04471"))
          .map((j) => ({ id: j.id, title: j.title, priority: j.priority, raised: j.raisedAt.slice(0, 16), responded: j.respondedAt?.slice(0, 16), status: j.status, note: j.resolution })),
        completionReports: loadFeed(),
      }));
      const contract = await tool(emit, "get_contract_terms", siteId === "AGC" ? "Contract MNDA/CON/2023/019 — SLA & clauses" : "HQ in-house FM standards", { contract: site.contract }, () =>
        siteId === "AGC" ? loadContract().clauses : [{ ref: "HQ FM standard", title: "In-house response targets", text: "Urgent comfort faults: respond 2 h, rectify 24 h; routine: respond 1 working day." }],
      );
      s0.done(ar ? "6 مصادر بيانات" : "6 data sources queried");

      const s1 = emit.step("draft", ar ? "صياغة أمر العمل وفق شروط العقد" : "Drafting the work order against the contract");
      const ctx = {
        site: { id: site.id, name: site.name, contractor: site.contractor, contract: site.contract, openingHours: site.openingHours, cooling: site.cooling, zones: site.zones.map((z) => `${z.id} ${z.name}`) },
        issue: issue ?? {
          text: "Close the recurring CH-02 high-discharge-pressure trip fault at Al Ghaf Community Centre (primary asset CH-02). The contractor reports the CH-02 condenser coils were chemically cleaned on 6 Oct under JOB-RFM-26-04471, but MNDA has not verified the fix (contract §6.3). The work order must: confirm and document the CH-02 coil clean and HP switch / transducer readings, complete the overdue CH-01 coil cleaning (PPM-AGC-CH01-CCC) in a low-load window, restore the quarterly coil-cleaning PPM, and obtain the §3.6 root-cause report. Verification criteria must measure CH-02 and the affected zones.",
        },
        signal,
        asset,
        ppm,
        complaints: complaints.slice(0, 40),
        jobs,
        contract,
        today: "2026-10-11",
      };
      const { object: wo } = await generateObject({
        schema: woSchema,
        name: "work_order",
        system: workOrderSystem(),
        user: `Context (JSON):\n${JSON.stringify(ctx, null, 1)}`,
        modelKey,
        solution: SLUG,
        task: "work-order.draft",
        maxTokens: 2200,
        signal: emit.signal,
      });
      // validate against the registers: assets, complaints, jobs, SLA
      const validAsset = !issue ? assetId : site.assets.some((a) => a.id === wo.asset) ? wo.asset : assetId;
      const complaintIds = new Set(loadComplaints().map((c) => c.id));
      const jobIds = new Set(loadJobs().map((j) => j.id));
      const zoneIds = new Set(site.zones.map((z) => z.id));
      const [resp, rect] = SLA[wo.priority];
      const used = new Set(loadWorkOrders().map((w) => w.id));
      for (const a of listApprovals({ solution: SLUG })) {
        const id = (a.payload as { woId?: string } | undefined)?.woId;
        if (id) used.add(id);
      }
      let k = 418;
      while (used.has(`MNDA-FM-WO-26-0${k}`)) k++;
      const woId = `MNDA-FM-WO-26-0${k}`;
      const record: WorkOrder = {
        id: woId,
        title: wo.title,
        site: siteId,
        asset: validAsset,
        zones: (() => {
          const z = wo.zones.filter((x) => zoneIds.has(x));
          if (z.length) return z;
          const fromComplaints = loadComplaints()
            .filter((c) => wo.linkedComplaints.includes(c.id))
            .map((c) => c.zone);
          return [...new Set(fromComplaints.length ? fromComplaints : issue?.zone ? [issue.zone] : [])].filter((x) => zoneIds.has(x));
        })(),
        priority: wo.priority,
        priorityReason: wo.priorityReason,
        responseHours: siteId === "AGC" ? resp : 2,
        rectifyHours: siteId === "AGC" ? rect : 24,
        contractor: site.contractor,
        scope: wo.scope,
        safety: wo.safety,
        verification: !issue && validAsset === "CH-02" && wo.verification.length < 4 ? mergeCriteria(wo.verification) : wo.verification,
        linkedComplaints: wo.linkedComplaints.filter((c) => complaintIds.has(c)),
        linkedJobs: wo.linkedJobs.filter((j) => jobIds.has(j)),
        schedule: wo.schedule,
        estimatedHours: wo.estimatedHours,
        status: "Issued to contractor",
        issuedAt: "2026-10-11",
        raisedBy: "NARVO Agent (prepared) · Eng. Tariq Mahmoud Saleh (approved)",
        approvedBy: "Eng. Tariq Mahmoud Saleh",
        completedAt: null,
      };
      emit.data("draft", { ...record, notes: wo.notes });
      s1.done(`${record.priority} · ${record.scope.length} ${ar ? "خطوات" : "steps"} · ${record.verification.length} ${ar ? "معايير تحقق" : "verification criteria"} · ${record.linkedComplaints.length} ${ar ? "شكاوى مرتبطة" : "complaints linked"}`);

      const s2 = emit.step("approval", ar ? "رفع أمر العمل لاعتماد م. طارق محمود صالح" : "Routing to Eng. Tariq Mahmoud Saleh for approval");
      const approval = createApproval({
        solution: SLUG,
        title: `${ar ? "أمر عمل" : "Work order"} ${woId} — ${record.title}`.slice(0, 200),
        summary: `${record.priority} · ${record.contractor} · ${record.asset}${record.zones.length ? ` · ${record.zones.join(", ")}` : ""}. ${record.scope.slice(0, 2).join(" ")}`.slice(0, 500),
        actionLabel: ar ? "اعتماد وإصدار أمر العمل" : "Approve & issue work order",
        approver: { name: "Eng. Tariq Mahmoud Saleh", title: "Director, Facilities & Assets" },
        requestedBy: "NARVO Agent",
        payload: { woId, record },
        effects: [
          { type: "append", collection: WOS, item: record as unknown as Record<string, unknown> & { id: string } },
          { type: "audit", action: "Work order issued", subject: `${woId} — ${record.title}`.slice(0, 200), detail: `${record.priority} to ${record.contractor}; ${record.linkedComplaints.length} complaints linked` },
        ],
      });
      emit.send({
        type: "approval",
        approval: {
          id: approval.id,
          title: approval.title,
          summary: approval.summary,
          solution: SLUG,
          actionLabel: approval.actionLabel,
          approver: approval.approver,
          status: "pending",
          createdAt: approval.createdAt,
        },
      });
      s2.waiting(ar ? "بانتظار الاعتماد" : "Awaiting approval");
    },
    { modelKey },
  );
}
