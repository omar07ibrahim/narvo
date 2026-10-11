/**
 * Computed rules for 19 — Field Service Intelligence (client + server, no model involved):
 *  - parts availability against van / site store / central store (RFM Connect inventory)
 *  - service-report completeness per RFM-QA-STD-004 (12 weighted elements + gate rules)
 *  - KPIs: preparation time, report completeness, first-time fix, open follow-ups
 */

import type { Completeness, CompletenessItem, HistoryEntry, Inventory, Job, PartAvailability, PartLine, ServiceReport } from "./types";

export function partAvailability(lines: PartLine[], inv: Inventory, van: string, site: string, assetDescription = ""): PartAvailability[] {
  return lines.map((l) => {
    const p = inv.parts.find((x) => x.partNo === l.partNo);
    if (!p)
      return {
        ...l,
        desc: "Not in RFM Connect catalogue",
        kind: "unknown",
        unit: "",
        van: 0,
        site: 0,
        store: 0,
        status: "order" as const,
        action: "Check part number — not in catalogue",
        leadDays: 0,
        warning: "Unknown part number",
      };
    const v = p.stock[van] ?? 0;
    const s = p.stock[`SITE-${site}`] ?? 0;
    const c = p.stock.STORE ?? 0;
    let status: PartAvailability["status"];
    let action: string;
    let action_ar: string;
    if (v >= l.qty) {
      status = "in_van";
      action = `In van ${van} (${v})`;
      action_ar = `في الشاحنة ${van} (${v})`;
    } else if (v + s >= l.qty) {
      status = "site_store";
      action = `${v ? `${v} in van + ` : ""}collect ${l.qty - v} from ${site} site store`;
      action_ar = `${v ? `${v} في الشاحنة + ` : ""}استلام ${l.qty - v} من مخزن موقع ${site}`;
    } else if (v + s + c >= l.qty) {
      status = "central_store";
      action = `Collect ${l.qty - v - s} from central store (Al Quoz) before travelling`;
      action_ar = `استلام ${l.qty - v - s} من المخزن المركزي (القوز) قبل التوجه`;
    } else {
      status = "order";
      action = `Not in stock — order${p.supplier ? ` from ${p.supplier}` : ""}, lead time ${p.leadDays} working days`;
      action_ar = `غير متوفر — يُطلب${p.supplier ? ` من ${p.supplier}` : ""}، مدة التوريد ${p.leadDays} أيام عمل`;
    }
    let warning: string | undefined;
    let warning_ar: string | undefined;
    if (p.partNo === "RFM-CHM-0109" && /epoxy|coated/i.test(assetDescription)) {
      warning = "Alkaline cleaner (pH 11.5) is NOT approved for epoxy-coated coils — use RFM-CHM-0112 (RFM-MS-HVAC-014)";
      warning_ar = "المنظف القلوي (pH 11.5) غير معتمد للملفات المطلية بالإيبوكسي — استخدم RFM-CHM-0112 (RFM-MS-HVAC-014)";
    }
    return { ...l, desc: p.desc, desc_ar: p.desc_ar, kind: p.kind, unit: p.unit, van: v, site: s, store: c, status, action, action_ar, leadDays: p.leadDays, warning, warning_ar };
  });
}

/** Add n working days (Mon–Fri) to an ISO date (YYYY-MM-DD). */
export function addWorkingDays(isoDate: string, n: number) {
  let t = Date.parse(isoDate + "T00:00:00Z");
  let k = 0;
  while (k < n) {
    t += 86400000;
    const d = new Date(t).getUTCDay();
    if (d !== 0 && d !== 6) k++;
  }
  return new Date(t).toISOString().slice(0, 10);
}

const ELEMENTS: Array<Omit<CompletenessItem, "score" | "points" | "note">> = [
  { no: 1, key: "ref", en: "Job reference and asset", ar: "مرجع المهمة والأصل", weight: 5 },
  { no: 2, key: "times", en: "Arrival and departure time", ar: "وقت الوصول والمغادرة", weight: 5 },
  { no: 3, key: "symptom", en: "Symptom on arrival", ar: "العطل عند الوصول", weight: 10 },
  { no: 4, key: "readings", en: "Readings", ar: "القراءات", weight: 15 },
  { no: 5, key: "work", en: "Work performed", ar: "الأعمال المنفذة", weight: 10 },
  { no: 6, key: "parts", en: "Parts used", ar: "القطع المستخدمة", weight: 10 },
  { no: 7, key: "root", en: "Root cause", ar: "السبب الجذري", weight: 10 },
  { no: 8, key: "followups", en: "Unresolved issues and follow-ups", ar: "القضايا المعلقة والمتابعات", weight: 10 },
  { no: 9, key: "safety", en: "Safety (LOTO, permit)", ar: "السلامة (العزل والتصاريح)", weight: 10 },
  { no: 10, key: "photos", en: "Photos (before / after)", ar: "الصور (قبل / بعد)", weight: 5 },
  { no: 11, key: "signoff", en: "Customer sign-off", ar: "توقيع العميل", weight: 5 },
  { no: 12, key: "declaration", en: "Technician declaration", ar: "إقرار الفني", weight: 5 },
];

const has = (s?: string | null) => !!s && s.trim().length > 2;

/** RFM-QA-STD-004 completeness score (Full 100% / Partial 50% / Missing 0 per element) and gate rules. */
export function scoreReport(r: ServiceReport, job: Pick<Job, "id" | "type" | "asset">, opts: { followUpJobs?: number } = {}): Completeness {
  const filled = (v?: string | null) => !!v && v.trim().length > 0 && v.trim() !== "—";
  const withUnit = r.readings.filter((x) => filled(x.value) && filled(x.unit));
  const hasBeforeAfter = withUnit.some((x) => x.phase === "before") && withUnit.some((x) => x.phase === "after");
  const score = (key: string): [CompletenessItem["score"], string] => {
    switch (key) {
      case "ref":
        return r.jobId === job.id && r.assetId ? ["full", `${r.jobId} · ${r.assetId}`] : ["partial", "Job or asset reference missing"];
      case "times":
        return r.arrival && r.departure ? ["full", `${r.arrival}–${r.departure}`] : r.arrival || r.departure ? ["partial", "Arrival or departure time missing"] : ["missing", "No check-in/check-out times"];
      case "symptom":
        return has(r.symptomOnArrival) ? (r.alarms.length ? ["full", r.alarms.join(", ")] : ["partial", "No alarm codes/times recorded"]) : ["missing", "Symptom not described"];
      case "readings":
        if (withUnit.length >= 6 && (hasBeforeAfter || job.type === "PPM")) return ["full", `${withUnit.length} readings with units${hasBeforeAfter ? ", before/after" : ""}`];
        if (withUnit.length >= 2) return ["partial", `${withUnit.length} readings${hasBeforeAfter ? "" : " — no before/after pair"}`];
        return ["missing", "No readings with units"];
      case "work":
        return r.workPerformed.length >= 2 ? ["full", `${r.workPerformed.length} steps`] : r.workPerformed.length === 1 ? ["partial", "Only one step described"] : ["missing", "Work performed not described"];
      case "parts":
        if (!r.partsUsed.length) return ["full", "No parts used"];
        return r.partsUsed.every((p) => has(p.partNo) && p.qty > 0 && has(p.source)) ? ["full", r.partsUsed.map((p) => `${p.partNo} × ${p.qty}`).join(", ")] : ["partial", "Part number, quantity or source location missing"];
      case "root":
        return has(r.rootCause) ? (has(r.rootCauseEvidence) ? ["full", "Cause with evidence"] : ["partial", "Cause stated without evidence"]) : ["missing", "No root cause"];
      case "followups": {
        if (!r.unresolved.length) return ["full", "No open issues"];
        const ok = r.unresolved.every((u) => has(u.owner) && has(u.reason));
        const jobs = opts.followUpJobs ?? 0;
        return ok && jobs >= r.unresolved.length ? ["full", `${r.unresolved.length} follow-up job(s) raised`] : ["partial", jobs ? "Owner or part status incomplete" : "Follow-up job not yet raised"];
      }
      case "safety":
        return r.safety.loto && has(r.safety.isolationPoints) && has(r.safety.permit) ? ["full", r.safety.permit!] : r.safety.loto || has(r.safety.permit) ? ["partial", "LOTO isolation points or permit number missing"] : ["missing", "No LOTO / permit record"];
      case "photos": {
        const b = r.photos.some((p) => p.phase === "before");
        const a = r.photos.some((p) => p.phase === "after");
        return b && a ? ["full", `${r.photos.length} photos`] : b || a || r.photos.length ? ["partial", "Before or after photo missing"] : ["missing", "No photos"];
      }
      case "signoff":
        return has(r.customerSignOff.name) && has(r.customerSignOff.role) && has(r.customerSignOff.time)
          ? ["full", `${r.customerSignOff.name}, ${r.customerSignOff.time}`]
          : has(r.customerSignOff.reasonIfMissing)
            ? ["full", `Not obtained: ${r.customerSignOff.reasonIfMissing}`]
            : has(r.customerSignOff.name)
              ? ["partial", "Role or time missing"]
              : ["missing", "No customer sign-off"];
      case "declaration":
        return r.technicianDeclaration.signed && has(r.technicianDeclaration.staffId) ? ["full", `${r.technicianDeclaration.name} (${r.technicianDeclaration.staffId})`] : ["partial", "Declaration not signed"];
      default:
        return ["missing", ""];
    }
  };
  const items: CompletenessItem[] = ELEMENTS.map((e) => {
    const [s, note] = score(e.key);
    return { ...e, score: s, points: s === "full" ? e.weight : s === "partial" ? e.weight / 2 : 0, note };
  });
  const total = items.reduce((a, b) => a + b.points, 0);
  const gates: Completeness["gates"] = [];
  if (total < 80) gates.push({ en: "Score below 80% — returned to technician", ar: "الدرجة أقل من 80% — تُعاد إلى الفني" });
  if (items.find((i) => i.key === "safety")!.score === "missing") gates.push({ en: "Safety record missing on a job that needed LOTO/permit", ar: "سجل السلامة مفقود في مهمة تتطلب العزل/التصريح" });
  if (job.type === "PPM" && items.find((i) => i.key === "readings")!.score === "missing") gates.push({ en: "Readings missing on a PPM job", ar: "القراءات مفقودة في مهمة صيانة وقائية" });
  return { items, total, gates, pass: gates.length === 0 };
}

export interface Kpis {
  prepAi: number;
  prepManual: number;
  prepSaved: number;
  complAi: number;
  complManual: number;
  ftf: number;
  ftfN: number;
  openFollowUps: number;
  jobsToday: number;
  overdue: number;
}

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

export function computeKpis(jobs: Job[], history: HistoryEntry[], todayIso: string): Kpis {
  const fromJobs = jobs
    .filter((j) => j.prepMinutes != null && j.prepMode)
    .map((j) => ({ prepMode: j.prepMode!, prepMinutes: j.prepMinutes!, reportCompleteness: j.reportCompleteness, firstTimeFix: j.firstTimeFix ?? null, type: j.type }));
  const all = [...history.map((h) => ({ prepMode: h.prepMode, prepMinutes: h.prepMinutes, reportCompleteness: h.reportCompleteness, firstTimeFix: h.firstTimeFix, type: h.type })), ...fromJobs];
  const ai = all.filter((x) => x.prepMode === "ai");
  const man = all.filter((x) => x.prepMode === "manual");
  const prepAi = mean(ai.map((x) => x.prepMinutes));
  const prepManual = mean(man.map((x) => x.prepMinutes));
  const complAi = mean(ai.filter((x) => x.reportCompleteness != null).map((x) => x.reportCompleteness!));
  const complManual = mean(man.filter((x) => x.reportCompleteness != null).map((x) => x.reportCompleteness!));
  const reactive = all.filter((x) => x.type === "Reactive" && x.firstTimeFix != null);
  return {
    prepAi,
    prepManual,
    prepSaved: prepManual ? 1 - prepAi / prepManual : 0,
    complAi,
    complManual,
    ftf: reactive.length ? reactive.filter((x) => x.firstTimeFix).length / reactive.length : 0,
    ftfN: reactive.length,
    openFollowUps: jobs.filter((j) => j.type === "Follow-up" && j.status !== "completed").length,
    jobsToday: jobs.filter((j) => j.scheduledFor.slice(0, 10) === todayIso && j.status !== "completed").length,
    overdue: jobs.filter((j) => j.status === "overdue").length,
  };
}
