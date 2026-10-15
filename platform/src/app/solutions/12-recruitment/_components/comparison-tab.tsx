/* eslint-disable react-hooks/set-state-in-effect -- effects react to streamed AI runs and server refreshes (external sources). */
"use client";

import { useEffect, useState } from "react";
import { CircleAlert, Eye, EyeOff, FileUp, ListOrdered, MessageSquareQuote, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { NarvoRun } from "@/hooks/use-narvo-run";
import { useNarvoRun } from "@/hooks/use-narvo-run";
import { useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Pane, SectionLabel } from "@/components/narvo/pane";
import { AgentTrace } from "@/components/narvo/agent-trace";
import { Markdown } from "@/components/narvo/markdown";
import { RunButton } from "@/components/narvo/run-button";
import { StatusPill } from "@/components/narvo/status";
import { EmptyState, ThinkingLines } from "@/components/narvo/empty";
import { FileDrop } from "@/components/narvo/file-drop";
import { Button } from "@/components/ui/button";
import { Checkbox } from "./checkbox";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { criteriaKey, type Criterion, type Evaluation, type RecruitmentState } from "../_lib/types";
import { RedactionDialog } from "./redaction-view";
import { RatingDots, RatingStrip, type Row } from "./rows";
import { codeOf } from "./rows";

export function ComparisonTab({
  state,
  criteria,
  rows,
  evalRun,
  shortlist,
  toggleShortlist,
  reveal,
  setReveal,
  refresh,
}: {
  state: RecruitmentState;
  criteria: Criterion[];
  rows: Row[];
  evalRun: NarvoRun;
  shortlist: string[];
  toggleShortlist: (id: string) => void;
  reveal: boolean;
  setReveal: (v: boolean) => void;
  refresh: () => void;
}) {
  const L = useL();
  const upload = useNarvoRun();
  const [selected, setSelected] = useState<string | null>(null);
  const [redactOpen, setRedactOpen] = useState(false);
  const [cvText, setCvText] = useState("");
  const [cvLabel, setCvLabel] = useState("");

  const evaluated = rows.filter((r) => r.ev);
  const stale = evaluated.filter((r) => r.ev!.criteriaKey !== criteriaKey(criteria)).length;
  const progress = evalRun.data.progress as { done: number; total: number } | undefined;
  const guard = evalRun.data.guard as { cvs: number; totals: Record<string, number>; removed: number; leaks: number; autoFixed: number } | undefined;
  const rationale = evalRun.text.rationale || (evalRun.running ? "" : state.rationale?.text) || "";

  useEffect(() => {
    if (!selected && evaluated[0]) setSelected(evaluated[0].id);
  }, [selected, evaluated]);
  useEffect(() => {
    if (upload.status === "done") {
      refresh();
      const ev = upload.data.evaluation as (Evaluation & { score: number }) | undefined;
      if (ev) {
        setSelected(ev.appId);
        toast.success(L({ en: `Uploaded CV evaluated — weighted score ${ev.score}`, ar: `قُيّمت السيرة المرفوعة — الدرجة ${ev.score}` }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upload.status]);

  const cur = rows.find((r) => r.id === selected);
  const nameOf = (r: Row) => (reveal ? r.name : r.source === "upload" ? `${L({ en: "Uploaded", ar: "مرفوعة" })} ${r.id}` : codeOf(r.id, L));

  async function loadSample() {
    const res = await fetch("/api/solutions/12-recruitment/upload", { cache: "no-store" });
    if (res.ok) {
      const j = await res.json();
      setCvText(j.text);
      setCvLabel(j.label);
    }
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_400px] gap-4 max-xl:grid-cols-1">
      <div className="flex min-w-0 flex-col gap-4">
        <Pane
          title={L({ en: "Reasoned priority list", ar: "قائمة الأولويات المعللة" })}
          subtitle={
            evaluated.length
              ? L({
                  en: `${evaluated.length} evaluated · tick candidates to build the shortlist (HR decision)`,
                  ar: `${evaluated.length} مُقيَّماً · حدّد المرشحين لبناء القائمة المختصرة (قرار الموارد البشرية)`,
                })
              : L({ en: `${rows.length} applications met the minimum requirements`, ar: `${rows.length} طلباً استوفى الحد الأدنى` })
          }
          flush
          actions={
            <>
              <label className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                {reveal ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                {L({ en: "Show names", ar: "إظهار الأسماء" })}
                <Switch checked={reveal} onCheckedChange={setReveal} />
              </label>
              <RunButton
                size="sm"
                running={evalRun.running}
                onRun={() => evalRun.start("/api/solutions/12-recruitment/evaluate", { force: evaluated.length > 0 && stale === 0 })}
                onStop={evalRun.abort}
                icon={<Sparkles />}
              >
                {evaluated.length
                  ? stale
                    ? L({ en: `Re-evaluate ${stale} (criteria changed)`, ar: `إعادة تقييم ${stale} (تغيرت المعايير)` })
                    : L({ en: "Re-run evaluation", ar: "إعادة التقييم" })
                  : L({ en: `Evaluate ${rows.length} applications`, ar: `تقييم ${rows.length} طلباً` })}
              </RunButton>
            </>
          }
        >
          {evalRun.running && progress && (
            <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
              <Progress value={(progress.done / Math.max(progress.total, 1)) * 100} className="h-1 flex-1" />
              <span className="num text-[11.5px] text-muted-foreground">
                {progress.done}/{progress.total}
              </span>
            </div>
          )}
          {!evaluated.length && !evalRun.running ? (
            <EmptyState icon={<ListOrdered className="size-4" />} title={L({ en: "Not evaluated yet", ar: "لم يُقيَّم بعد" })}>
              {L({
                en: "The fairness guard redacts each CV, then the model rates it against every criterion with a verbatim evidence quote. Scores are computed from the agreed weights.",
                ar: "يحجب حارس العدالة كل سيرة ذاتية، ثم يقيّمها النموذج مقابل كل معيار مع اقتباس حرفي كدليل. وتُحسب الدرجات من الأوزان المتفق عليها.",
              })}
            </EmptyState>
          ) : (
            <div className="scrollbar-thin max-h-[640px] overflow-auto">
              <table className="w-full text-[12.5px]">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="border-b border-border">
                    <th className="w-8 px-3 py-2" />
                    <th className="label-caps !text-[9.5px] px-2 py-2 text-start font-medium">#</th>
                    <th className="label-caps !text-[9.5px] px-2 py-2 text-start font-medium">{L({ en: "Candidate", ar: "المرشح" })}</th>
                    <th className="label-caps !text-[9.5px] px-2 py-2 text-start font-medium">{L({ en: "Weighted score", ar: "الدرجة الموزونة" })}</th>
                    <th className="label-caps !text-[9.5px] px-2 py-2 text-start font-medium whitespace-nowrap" title={L({ en: "Criteria C1–C7", ar: "المعايير C1–C7" })}>
                      {L({ en: "Criteria", ar: "المعايير" })} <span className="num normal-case tracking-normal">1–{criteria.length}</span>
                    </th>
                    <th className="label-caps !text-[9.5px] px-2 py-2 text-start font-medium">{L({ en: "Evidence", ar: "الأدلة" })}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr
                      key={r.id}
                      onClick={() => r.ev && setSelected(r.id)}
                      className={cn(
                        "border-b border-border last:border-0",
                        r.ev ? "cursor-pointer hover:bg-muted/40" : "opacity-50",
                        selected === r.id && "bg-ai-soft/40 hover:bg-ai-soft/40",
                      )}
                    >
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={shortlist.includes(r.id)} disabled={!r.ev} onChange={() => toggleShortlist(r.id)} />
                      </td>
                      <td className="num px-2 py-2 text-muted-foreground">{r.ev ? i + 1 : "—"}</td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1.5 font-medium">
                          {nameOf(r)}
                          {r.source === "upload" && <StatusPill tone="info" dot={false}>{L({ en: "BYO", ar: "مرفوعة" })}</StatusPill>}
                          {r.interviews > 0 && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <MessageSquareQuote className="size-3.5 text-ai" />
                              </TooltipTrigger>
                              <TooltipContent>{L({ en: "Updated with consented interview evidence", ar: "حُدّث بأدلة مقابلة بموافقة المرشح" })}</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                        <div className="line-clamp-1 max-w-[300px] text-[11px] text-muted-foreground">{reveal ? r.headline : r.blindHeadline}</div>
                      </td>
                      <td className="px-2 py-2">
                        {r.ev ? (
                          <div className="flex items-center gap-2">
                            <span className="num w-9 text-[13px] font-medium">{r.score.toFixed(1)}</span>
                            <span className="h-1 w-20 overflow-hidden rounded-full bg-muted">
                              <span className="block h-full rounded-full bg-ai" style={{ width: `${r.score}%` }} />
                            </span>
                          </div>
                        ) : evalRun.running ? (
                          <span className="text-[11px] text-ai">{L({ en: "evaluating…", ar: "جارٍ التقييم…" })}</span>
                        ) : (
                          <span className="text-[11px] text-faint">{L({ en: "pending", ar: "بالانتظار" })}</span>
                        )}
                      </td>
                      <td className="px-2 py-2">{r.ev && <RatingStrip ratings={r.ratings} criteria={criteria} />}</td>
                      <td className="px-2 py-2">
                        {r.ev && (
                          <span className={cn("num text-[11.5px]", r.trace === 1 ? "text-success" : "text-warning")}>
                            {Math.round(r.trace * 100)}%
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Pane>

        <Pane title={L({ en: "Priority rationale", ar: "مبررات الأولوية" })} subtitle={L({ en: "Written from anonymised results — HR selects, AI never decides", ar: "مكتوبة من نتائج مجهّلة — الموارد البشرية تختار والذكاء الاصطناعي لا يقرر" })}>
          {rationale ? (
            <Markdown streaming={evalRun.running}>{rationale}</Markdown>
          ) : evalRun.running ? (
            <ThinkingLines lines={4} />
          ) : (
            <p className="text-[12px] text-muted-foreground">{L({ en: "Appears after the evaluation run.", ar: "تظهر بعد تشغيل التقييم." })}</p>
          )}
        </Pane>

        <Pane title={L({ en: "Bring your own CV", ar: "أضف سيرتك الذاتية" })} subtitle={L({ en: "Same guard, same criteria — evaluated live", ar: "نفس الحارس ونفس المعايير — تقييم مباشر" })}>
          <div className="grid grid-cols-[minmax(0,1fr)_260px] gap-4 max-md:grid-cols-1">
            <div className="space-y-2">
              <Textarea
                value={cvText}
                onChange={(e) => setCvText(e.target.value)}
                placeholder={L({ en: "Paste a CV (English or Arabic)…", ar: "الصق سيرة ذاتية (عربية أو إنجليزية)…" })}
                className="min-h-36 bg-surface text-[12.5px]"
                dir="auto"
              />
              <div className="flex flex-wrap items-center gap-2">
                <RunButton
                  size="sm"
                  running={upload.running}
                  disabled={cvText.trim().length < 200}
                  onRun={() => upload.start("/api/solutions/12-recruitment/upload", { text: cvText, label: cvLabel })}
                  onStop={upload.abort}
                  icon={<FileUp />}
                >
                  {L({ en: "Guard & evaluate", ar: "احجب وقيّم" })}
                </RunButton>
                <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={loadSample}>
                  {L({ en: "Load late application (sample)", ar: "تحميل طلب متأخر (نموذج)" })}
                </Button>
              </div>
              {upload.status === "error" && <p className="text-[12px] text-danger">{upload.error}</p>}
            </div>
            <div className="space-y-3">
              <FileDrop
                accept=".md,.txt"
                compact
                label={L({ en: "Drop a CV (.md / .txt)", ar: "أسقط سيرة (.md / .txt)" })}
                hint={L({ en: "Processed on your own servers", ar: "تتم المعالجة على خوادم الجهة" })}
                onFiles={(fs) => {
                  const t = fs[0]?.text;
                  if (t) {
                    setCvText(t);
                    setCvLabel(fs[0].name.replace(/\.(md|txt)$/i, ""));
                  } else toast.error(L({ en: "Use a text or Markdown file", ar: "استخدم ملفاً نصياً أو Markdown" }));
                }}
              />
              {(upload.running || upload.trace.length > 0) && <AgentTrace run={upload} title={L({ en: "Upload run", ar: "تشغيل الرفع" })} showReasoning={false} />}
            </div>
          </div>
        </Pane>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <Pane title={L({ en: "Fairness guard", ar: "حارس العدالة" })}>
          <div className="flex items-start gap-2.5">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
            <div className="text-[12px] leading-relaxed">
              {guard ? (
                <>
                  <span className="font-medium">
                    {guard.removed} {L({ en: "protected items withheld from", ar: "عنصراً محمياً حُجب من" })} {guard.cvs} CVs
                  </span>{" "}
                  · {L({ en: "leak scan", ar: "فحص التسرب" })}: {guard.leaks === 0 ? L({ en: "clean", ar: "سليم" }) : `${guard.leaks} ${L({ en: "removed", ar: "أُزيلت" })}`}
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {Object.entries(guard.totals).map(([k, v]) => (
                      <StatusPill key={k} tone="neutral" dot={false}>
                        {k} <span className="num opacity-70">{v}</span>
                      </StatusPill>
                    ))}
                  </div>
                </>
              ) : (
                <span className="text-muted-foreground">
                  {L({
                    en: "Name, nationality, gender, age/DOB, marital status, photo and religion are removed before any model call. Open a candidate to see exactly what the model saw.",
                    ar: "تُحذف بيانات الاسم والجنسية والجنس والعمر والحالة الاجتماعية والصورة والديانة قبل أي استدعاء للنموذج. افتح مرشحاً لترى بالضبط ما رآه النموذج.",
                  })}
                </span>
              )}
            </div>
          </div>
          {(evalRun.running || evalRun.trace.length > 0) && (
            <div className="scrollbar-thin mt-4 max-h-[360px] overflow-y-auto border-t border-border pt-3">
              <AgentTrace run={evalRun} title={L({ en: "Evaluation run", ar: "تشغيل التقييم" })} showReasoning={false} />
            </div>
          )}
          {stale > 0 && !evalRun.running && (
            <div className="mt-3 flex items-start gap-1.5 rounded-md bg-warning-soft px-2.5 py-2 text-[11.5px] text-warning">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
              {L({ en: `${stale} evaluations used earlier criteria wording — re-evaluate.`, ar: `${stale} تقييمات استخدمت صياغة سابقة للمعايير — أعد التقييم.` })}
            </div>
          )}
        </Pane>

        <Pane
          title={cur ? nameOf(cur) : L({ en: "Candidate", ar: "المرشح" })}
          subtitle={cur?.ev ? `${cur.score.toFixed(1)} / 100 · ${L({ en: "evaluated in", ar: "قُيّم خلال" })} ${(cur.ev.ms / 1000).toFixed(1)} s` : undefined}
          actions={
            cur?.ev && (
              <Button size="sm" variant="outline" onClick={() => setRedactOpen(true)}>
                <EyeOff />
                {L({ en: "What the model saw", ar: "ما رآه النموذج" })}
              </Button>
            )
          }
        >
          {!cur?.ev ? (
            <p className="text-[12px] text-muted-foreground">{L({ en: "Select an evaluated candidate.", ar: "اختر مرشحاً مُقيَّماً." })}</p>
          ) : (
            <div className="space-y-4">
              <p className="text-[13px] leading-relaxed" dir="auto">{cur.ev.summary}</p>
              <div className="space-y-3">
                {criteria.map((c) => {
                  const r = cur.ratings.find((x) => x.criterionId === c.id);
                  const orig = cur.ev!.ratings.find((x) => x.criterionId === c.id);
                  return (
                    <div key={c.id} className="border-t border-border pt-2.5 first:border-0 first:pt-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12px] font-medium">
                          <span className="font-mono text-[10.5px] text-muted-foreground">{c.id}</span> {L({ en: c.label, ar: c.labelAr ?? c.label })}
                        </span>
                        <span className="flex items-center gap-1.5">
                          {orig && r && orig.rating !== r.rating && (
                            <span className="num text-[10.5px] text-ai">{orig.rating}→</span>
                          )}
                          <RatingDots value={r?.rating ?? 0} />
                        </span>
                      </div>
                      {r?.evidence ? (
                        <blockquote className="mt-1.5 border-s-2 border-ai/40 ps-2 text-[11.5px] leading-relaxed text-foreground/80" dir="auto">
                          “{r.evidence}”
                          <span className={cn("ms-1.5 text-[10px]", r.evidenceFound ? "text-success" : "text-warning")}>
                            {r.evidenceFound ? L({ en: "· verified in CV", ar: "· موثّق في السيرة" }) : L({ en: "· quote not found — verify", ar: "· الاقتباس غير موجود — تحقق" })}
                          </span>
                        </blockquote>
                      ) : (
                        <div className="mt-1 text-[11.5px] text-faint">{L({ en: "No evidence in the CV", ar: "لا يوجد دليل في السيرة" })}</div>
                      )}
                      {r?.gaps && <div className="mt-1 text-[11.5px] text-muted-foreground" dir="auto">{L({ en: "Gap", ar: "النقص" })}: {r.gaps}</div>}
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-3 border-t border-border pt-3 text-[12px]">
                <div>
                  <SectionLabel className="!mb-1">{L({ en: "Strengths", ar: "نقاط القوة" })}</SectionLabel>
                  <ul className="space-y-1">{cur.ev.strengths.map((s) => <li key={s} className="leading-snug" dir="auto">— {s}</li>)}</ul>
                </div>
                <div>
                  <SectionLabel className="!mb-1">{L({ en: "Risks", ar: "المخاطر" })}</SectionLabel>
                  <ul className="space-y-1">{cur.ev.risks.map((s) => <li key={s} className="leading-snug text-muted-foreground" dir="auto">— {s}</li>)}</ul>
                </div>
              </div>
              {!!cur.ev.interviewFocus.length && (
                <div className="rounded-md border border-border bg-surface p-2.5">
                  <SectionLabel className="!mb-1">{L({ en: "Verify at interview", ar: "للتحقق في المقابلة" })}</SectionLabel>
                  <ul className="space-y-1 text-[12px]">{cur.ev.interviewFocus.map((s) => <li key={s} dir="auto">— {s}</li>)}</ul>
                </div>
              )}
            </div>
          )}
        </Pane>
      </div>

      <RedactionDialog appId={cur?.id ?? null} title={cur ? nameOf(cur) : ""} open={redactOpen} onOpenChange={setRedactOpen} />
    </div>
  );
}
