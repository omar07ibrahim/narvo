export const dynamic = "force-dynamic";

import fs from "node:fs";
import path from "node:path";
import { kvGet, listApprovals } from "@/lib/store/db";
import { PUBLIC_DIR } from "@/lib/world/data";
import { FieldWorkspace, type FieldState } from "./_components/workspace";
import { briefKey, draftKey, loadAssets, loadBms, loadHistory, loadInventory, loadJobs, loadReports, loadSites, loadTechs } from "./_lib/data";

const PHOTO_CAPTIONS: Record<string, { caption: string; caption_ar: string; phase: string }> = {
  "condenser-coil-fouled": { caption: "Condenser coil — before", caption_ar: "ملف المكثف — قبل", phase: "before" },
  "chiller-rooftop": { caption: "Chiller on roof deck", caption_ar: "المبرد على سطح المبنى", phase: "other" },
  "technician-gauges": { caption: "Gauges after cleaning", caption_ar: "المقاييس بعد التنظيف", phase: "after" },
};

function samplePhotos() {
  const dir = path.join(PUBLIC_DIR, "demo", "19-field-service");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
    .map((f) => {
      const key = f.replace(/\.[^.]+$/, "");
      const meta = PHOTO_CAPTIONS[key] ?? { caption: key.replace(/-/g, " "), caption_ar: key.replace(/-/g, " "), phase: "other" };
      return { src: `/demo/19-field-service/${f}`, ...meta };
    });
}

export default function Page() {
  const jobs = loadJobs();
  const briefs: FieldState["briefs"] = {};
  const drafts: FieldState["drafts"] = {};
  for (const j of jobs) {
    const b = kvGet<FieldState["briefs"][string]>(briefKey(j.id));
    if (b) briefs[j.id] = b;
    const d = kvGet<FieldState["drafts"][string]>(draftKey(j.id));
    if (d) drafts[j.id] = d;
  }
  const approvals = listApprovals({ solution: "19-field-service" }).map((a) => ({
    id: a.id,
    title: a.title,
    summary: a.summary,
    solution: a.solution,
    actionLabel: a.actionLabel,
    approver: a.approver,
    status: a.status,
    createdAt: a.createdAt,
    jobId: (a.payload as { jobId?: string } | undefined)?.jobId,
  }));
  return (
    <FieldWorkspace
      initial={{ jobs, history: loadHistory(), reports: loadReports(), briefs, drafts }}
      sites={loadSites()}
      assets={loadAssets()}
      techs={loadTechs()}
      inventory={loadInventory()}
      bms={loadBms()}
      samplePhotos={samplePhotos()}
      initialApprovals={approvals}
    />
  );
}
