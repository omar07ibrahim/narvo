import "server-only";
import { exists, listFiles, readJsonSafe, readText } from "@/lib/world/data";
import { kvGet, kvSet, listApprovals, withOverlay } from "@/lib/store/db";
import {
  screen,
  type Application,
  type Criterion,
  type Evaluation,
  type InterviewUpdate,
  type Invitation,
  type RecruitmentState,
  type Requisition,
  type ScreenedApplication,
  type Upload,
} from "./types";

export const SLUG = "12-recruitment";
export const DIR = `mnda/${SLUG}`;
export const REQ_COL = `${SLUG}/requisition`;
export const INV_COL = `${SLUG}/invitations`;

export const KV = {
  criteria: `${SLUG}:criteria`,
  evaluations: `${SLUG}:evaluations`,
  interviews: `${SLUG}:interviews`,
  uploads: `${SLUG}:uploads`,
  shortlist: `${SLUG}:shortlist`,
  policy: `${SLUG}:policy`,
  rationale: `${SLUG}:rationale`,
};

export const HIRING_MANAGER = { name: "Eng. Omar Yousef Al Hammadi", title: "Director, Planning & Building Permits" };
export const HR_DIRECTOR = { name: "Maryam Hassan Al Shamsi", title: "Director, Human Capital" };

export function loadRequisition(): Requisition {
  const seed = readJsonSafe<Requisition>(`${DIR}/requisition.json`, {
    id: "MNDA-HR-REQ-2026-077",
    title: "Senior Planning Engineer — Building Permits",
    department: "Planning & Building Permits",
    postedAt: "2026-09-07",
    closedAt: "2026-09-28",
    hiringManager: HIRING_MANAGER,
    hr: HR_DIRECTOR,
    descriptionEn: "",
    minimums: [],
    criteria: [],
  });
  const [merged] = withOverlay<Requisition>(REQ_COL, [seed]);
  const criteria = kvGet<Criterion[]>(KV.criteria);
  return { ...merged, criteria: criteria?.length ? criteria : seed.criteria };
}

export function loadApplications(): ScreenedApplication[] {
  return readJsonSafe<Application[]>(`${DIR}/applications.json`, []).map((a) => {
    const reasons = screen(a);
    return { ...a, pass: reasons.length === 0, reasons };
  });
}

export function loadCv(app: Pick<Application, "cvFile">): string | null {
  if (!app.cvFile) return null;
  const rel = `${DIR}/${app.cvFile}`;
  return exists(rel) ? readText(rel) : null;
}

export function getEvaluations(): Record<string, Evaluation> {
  return kvGet<Record<string, Evaluation>>(KV.evaluations) ?? {};
}

export function saveEvaluation(ev: Evaluation) {
  const all = getEvaluations();
  all[ev.appId] = ev;
  kvSet(KV.evaluations, all);
}

export function getInterviews(): Record<string, InterviewUpdate[]> {
  return kvGet<Record<string, InterviewUpdate[]>>(KV.interviews) ?? {};
}

export function getUploads(): Upload[] {
  return kvGet<Upload[]>(KV.uploads) ?? [];
}

export function interviewSamples(): string[] {
  return listFiles(`${DIR}/interviews`, ".md").map((f) => f.replace(/\.md$/, ""));
}

export function loadInterviewSample(appId: string): string | null {
  const rel = `${DIR}/interviews/${appId}.md`;
  return exists(rel) ? readText(rel) : null;
}

export function loadState(): RecruitmentState {
  const approvals = listApprovals({ solution: SLUG }).map((a) => ({
    id: a.id,
    title: a.title,
    summary: a.summary,
    solution: a.solution,
    actionLabel: a.actionLabel,
    approver: a.approver,
    status: a.status,
    createdAt: a.createdAt,
    payload: a.payload,
  }));
  return {
    requisition: loadRequisition(),
    applications: loadApplications(),
    evaluations: getEvaluations(),
    interviews: getInterviews(),
    uploads: getUploads(),
    shortlist: kvGet<string[]>(KV.shortlist) ?? [],
    policyApplied: kvGet<boolean>(KV.policy) ?? false,
    rationale: kvGet<{ text: string; at: string }>(KV.rationale) ?? null,
    invitations: withOverlay<Invitation>(INV_COL, []),
    approvals,
    interviewSamples: interviewSamples(),
  };
}
