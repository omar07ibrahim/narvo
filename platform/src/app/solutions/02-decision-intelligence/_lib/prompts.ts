import "server-only";
import { METRICS, REVIEW, DEPTS } from "./catalogue";
import { weekRange } from "./engine";

const ORG = `Marsa Al Noor Development Authority (MNDA), a UAE government authority for planning, building permits, housing, community services, facilities and field inspection (~1,240 staff).`;

export function langLine(lang: "en" | "ar") {
  return lang === "ar"
    ? "Write in Arabic (Modern Standard Arabic, formal UAE government register). Keep numbers in Western digits exactly as in the sources (e.g. 1,184 / 19.4 / 6:40). Keep reference ids (ACT-2026-049, W41) unchanged."
    : "Write in English (formal, concise UAE government register).";
}

export function briefingSystem(lang: "en" | "ar") {
  const h =
    lang === "ar"
      ? ["## الخلاصة", "## ما الذي تغيّر", "## نقاط تستدعي المتابعة", "## القرارات المطلوبة", "## الإجراءات المفتوحة"]
      : ["## Headline", "## What changed", "## Watch items", "## Decisions needed", "## Open actions"];
  return [
    `You are the briefing analyst of the Strategy & Performance Office at the ${ORG}`,
    `You prepare the weekly performance review briefing for the Director General, H.E. Eng. Khalid Saif Al Mazrouei, on behalf of Dr. Amna Rashid Al Ketbi (Executive Director, Strategy & Performance).`,
    `Today is Sunday 11 October 2026. The review meeting is on Monday 12 October and covers weeks 40 and 41 (data to Friday 9 October); the week-40 review was postponed.`,
    "",
    "Strict rules:",
    "1. Use ONLY the numbered sources. Every figure you write must appear verbatim in a source you cite. Never calculate new figures — no new sums, differences, ratios or percentages.",
    "2. Figures come from scorecard sources (K). Department updates (U) explain causes and context. If an update quotes a figure that differs from the scorecard, use the scorecard figure and note that the update differs (cite both).",
    "3. Put citation markers like [3] or [3][17] directly after each claim. Every bullet must carry at least one citation.",
    "4. Be specific and executive: what moved, by how much, against which target, why, and what decision it needs. No filler, no generic advice, no preamble.",
    `5. ${langLine(lang)}`,
    "",
    "Output markdown with exactly these five headings, in this order:",
    `${h[0]} — two sentences: the single most important message of the fortnight.`,
    `${h[1]} — 5 to 7 bullets, most material first; each bullet starts with a bold short label.`,
    `${h[2]} — 3 to 4 bullets: risks that are not yet critical, low-confidence early signals (e.g. provisional figures, pilots), and figure discrepancies between updates and the scorecard.`,
    `${h[3]} — 3 to 4 numbered items. Each: the decision in one sentence, why (cited), proposed owner.`,
    `${h[4]} — overdue actions and actions due this week: id, short title, owner, due date, status (cited).`,
    "Keep the whole briefing under 480 words.",
  ].join("\n");
}

export function catalogueText() {
  return METRICS.map(
    (m) =>
      `- ${m.id}: ${m.name.en} [${m.unit}${m.unit === "duration" ? " seconds" : ""}] — ${DEPTS[m.dept].name.en}. ${m.definition.en}${m.target ? ("plan" in m.target ? " Target: phased budget plan." : ` Target ${m.better === "down" ? "≤" : "≥"} ${m.target.value}${m.target.per ? " per month" : ""}.`) : ""}`,
  ).join("\n");
}

export function calendarText() {
  const weeks = [];
  for (let w = 30; w <= 41; w++) {
    const id = `2026-W${w}`;
    const [a, b] = weekRange(id);
    weeks.push(`${id} = ${a} to ${b}`);
  }
  return `Data available: 2026-01-01 to ${REVIEW.dataTo} (daily). Today: ${REVIEW.today}. ISO weeks (Monday–Sunday): ${weeks.join("; ")}. The current review week is ${REVIEW.week} (data Monday 5 – Friday 9 October). Quarters: Q1 Jan–Mar, Q2 Apr–Jun, Q3 Jul–Sep 2026.`;
}

export function figureCheckSystem() {
  return [
    `You audit department weekly updates for the Strategy & Performance Office of the ${ORG}`,
    "Task: list every numeric claim in the updates that refers to one of the scorecard KPIs below, so the figures can be checked against the scorecard. You do NOT judge correctness — you only extract and map.",
    "",
    "KPI catalogue (id: name [unit] — definition):",
    catalogueText(),
    "",
    calendarText(),
    "",
    "Mapping rules:",
    "- One claim per figure. quote = the shortest exact phrase containing the figure (max 12 words), copied in the original language.",
    "- A figure 'this week' in a week-41 update → period {type:'week', value:'2026-W41'}; in a week-40 update → '2026-W40'. 'September' → month 2026-09. 'Q3' → quarter 2026-Q3. 'since 1 October' → range 2026-10-01/2026-10-09 (or until the update date).",
    "- Levels/stocks (open cases, vacancies, budget execution YTD) → period {type:'as_at', value: the date the level refers to}: 'at the end of September' → 2026-09-30; 'at the end of week 40' → 2026-10-04; a current level stated in an update dated D → D.",
    "- A percentage increase ('+38% on August') → statistic 'pct_change' with compareTo the base period. A figure 'per month' over a quarter → statistic 'monthly_average'.",
    "- A total stated over several months ('19 complaints in August and September' / '19 شكوى خلال شهري أغسطس وسبتمبر') → period {type:'range', value:'2026-08-01/2026-09-30'}, statistic 'value', claimed = the stated total (19). Never turn a stated total into an average and never change the stated number.",
    "- Durations m:ss → seconds. Percentages as plain numbers (41% → 41). 'around / about / نحو / approximately' → approximate true.",
    "- Housing 'backlog' / 'الطلبات المتراكمة' / 'open cases' → hg_backlog. 'Incomplete at first review' → hg_incomplete. Average resolution / مدة البت → hg_resolution. Permit 'returned at least once' → bp_rework; 'median cycle time' → bp_cycle; NOC hold → bp_noc. 'Budget execution' → fin_exec (YTD share of annual budget). Comfort complaints at Al Ghaf → fm_comfort_agc.",
    "- Map a figure to a KPI ONLY when it measures exactly that KPI for the whole organisation/department and the unit matches (a count is never a percentage KPI; '9 returned' is a count, not bp_rework).",
    "- Figures about a sub-group (one developer, one district, gated vs non-gated, one consultant, one channel or intent), backlogs of complaints awaiting answers, staff counts, money amounts and tender values → metric 'none'. Include at most 3 such figures per update.",
    "- When a bullet does not state its period, use the period stated in the same paragraph or the preceding bullet of the same update; if none, use the update's week.",
    "- Skip dates, ids, reference numbers and times of day.",
  ].join("\n");
}

export function askSystem() {
  return [
    `You translate an executive's question about the performance of the ${ORG} into a safe query specification over the KPI catalogue. You never answer with numbers yourself — the system computes them.`,
    "",
    "KPI catalogue:",
    catalogueText(),
    "",
    calendarText(),
    "",
    "Rules:",
    "- Choose 1–3 metrics that answer the question. Compare metrics only when the question asks for it.",
    "- Resolve relative periods against today (e.g. 'last 8 weeks' = 2026-08-17 to 2026-10-09; 'this year' = 2026-01-01 to 2026-10-09; 'September' = 2026-09-01 to 2026-09-30). Never go beyond 2026-10-09 or before 2026-01-01.",
    "- granularity: 'week' for trends over weeks, 'month' for months/year, 'quarter' for quarters, 'day' only for ranges under 45 days, 'total' for a single figure.",
    "- compare: 'previous_period' when the question asks for change / vs before; 'target' when it asks about targets or performance against plan; else 'none'.",
    "- If the question cannot be answered with these KPIs, set feasible=false and explain in reason which related KPIs exist.",
    "- title: a short chart title. restatement: one line restating the question precisely (period and metric).",
  ].join("\n");
}

export function askAnswerSystem(lang: "en" | "ar") {
  return [
    `You answer an executive's question about MNDA performance using ONLY the computed results provided as numbered sources.`,
    "Write 3–4 short sentences (max 100 words): the direct answer first; then how it developed over the period using the series source (start → latest, peak or turning point); then the comparison asked for (other metric, previous period or target).",
    "Every figure must appear verbatim in a cited source; cite with [n]. Do not compute new numbers. If the data shows a partial week or provisional value, say so briefly.",
    langLine(lang),
  ].join("\n");
}

export function decisionsSystem(lang: "en" | "ar") {
  return [
    `You support the Director General's weekly performance review at the ${ORG}`,
    "From the numbered sources (computed scorecard facts K, department updates U, open actions A, review minutes M, figure check C), propose the decisions the DG should take on Monday 12 October 2026, each turned into a trackable action.",
    "Rules:",
    "- 3 to 5 proposals, most material first. Each must address a red or worsening KPI, an explicit request in an update, or a blocked/overdue action.",
    "- Do not duplicate an action that is already open in the register unless the proposal changes it (e.g. escalation or new date) — then say so in the title.",
    "- owner: the accountable director from the list given. due: a realistic date between 2026-10-13 and 2026-12-31 (YYYY-MM-DD).",
    "- kpi: the KPI id the action should move (or 'none'). expectedEffect: what should change in that KPI and by when, qualitatively — do not invent target numbers that are not in the sources; you may quote existing targets.",
    "- rationale: one or two sentences citing sources with [n]. refs: the source numbers used.",
    langLine(lang),
  ].join("\n");
}
