export const dynamic = "force-dynamic";

import { listApprovals } from "@/lib/store/db";
import { readJson } from "@/lib/world/data";
import { PlanningWorkspace } from "./_components/workspace";
import { getForecastBundle, loadConfig, loadOverrides, loadPositions, loadPublished } from "./_lib/data";
import type { CalendarDef } from "./_lib/types";

export default function Page() {
  const cfg = loadConfig();
  const bundle = getForecastBundle();
  const approvals = listApprovals({ solution: "17-demand-planning" }).map((a) => ({
    id: a.id,
    title: a.title,
    summary: a.summary,
    solution: a.solution,
    actionLabel: a.actionLabel,
    approver: a.approver,
    status: a.status,
    createdAt: a.createdAt,
  }));
  return (
    <PlanningWorkspace
      cfg={cfg}
      bundle={bundle}
      calendar={readJson<CalendarDef>("raseen/17-demand-planning/calendar.json")}
      positions={loadPositions(cfg)}
      initialOverrides={loadOverrides()}
      initialPublished={loadPublished()}
      initialApprovals={approvals}
    />
  );
}
