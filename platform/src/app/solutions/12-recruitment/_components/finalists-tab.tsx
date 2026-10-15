/* eslint-disable react-hooks/set-state-in-effect -- effects react to streamed AI runs and server refreshes (external sources). */
"use client";

import { useEffect, useState } from "react";
import { ArrowRight, CalendarClock, FileText, Flag, Mail, MessageSquareQuote, ShieldCheck, Send, UserCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { useNarvoRun } from "@/hooks/use-narvo-run";
import { useFormat, useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { ApprovalSummary } from "@/lib/ai/events";
import { Pane, SectionLabel } from "@/components/narvo/pane";
import { ComparisonMatrix, type CellStatus, type MatrixRow } from "@/components/narvo/matrix";
import { AgentTrace } from "@/components/narvo/agent-trace";
import { ApprovalCard } from "@/components/narvo/approval-card";
import { RunButton } from "@/components/narvo/run-button";
import { StatusPill } from "@/components/narvo/status";
import { EmptyState } from "@/components/narvo/empty";
import { FileDrop } from "@/components/narvo/file-drop";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { type Criterion, type Invitation, type InterviewUpdate, type RecruitmentState } from "../_lib/types";
import { Checkbox } from "./checkbox";
import { RatingDots, type Row } from "./rows";
import { codeOf } from "./rows";

const statusOf = (r: number): CellStatus => (r >= 3 ? "met" : r === 2 ? "partial" : r === 1 ? "clarify" : "missing");

export function FinalistsTab({
  state,
  criteria,
  rows,
  shortlist,
  toggleShortlist,
  reveal,
  refresh,
}: {
  state: RecruitmentState;
  criteria: Criterion[];
  rows: Row[];
  shortlist: string[];
  toggleShortlist: (id: string) => void;
  reveal: boolean;
  refresh: () => void;
}) {
  const L = useL();
  const f = useFormat();
  const interview = useNarvoRun();
  const invites = useNarvoRun();
  const [target, setTarget] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [consent, setConsent] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [shortlistApproval, setShortlistApproval] = useState<ApprovalSummary | null>(null);
  const [invView, setInvView] = useState<string | null>(null);
  const [invLang, setInvLang] = useState<"en" | "ar">("en");
  const [policy, setPolicy] = useState(state.policyApplied);

  const finalists = rows.filter((r) => shortlist.includes(r.id) && r.ev).sort((a, b) => b.score - a.score);
  const nameOf = (r: Row) => (reveal ? r.name : r.source === "upload" ? r.id : codeOf(r.id, L));
  const req = state.requisition;

  useEffect(() => {
    if (!target && finalists[0]) setTarget(finalists[0].id);
  }, [target, finalists]);
  useEffect(() => {
    const latest = state.approvals.filter((a) => a.title.startsWith("Approve shortlist")).sort((a, b) => b.createdAt - a.createdAt)[0];
    if (latest) setShortlistApproval(latest as ApprovalSummary);
  }, [state.approvals]);
  useEffect(() => {
    if (interview.status === "done") {
      refresh();
      setConsent(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interview.status]);
  useEffect(() => {
    if (invites.status === "done") refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invites.status]);

  async function requestApproval() {
    setRequesting(true);
    try {
      const res = await fetch("/api/solutions/12-recruitment/shortlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request_approval", shortlist }),
      });
      if (!res.ok) throw new Error(await res.text());
      const j = await res.json();
      setShortlistApproval(j.approval);
      toast.success(L({ en: "Shortlist sent to the hiring manager for approval", ar: "أُرسلت القائمة المختصرة لمدير التوظيف للاعتماد" }));
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRequesting(false);
    }
  }

  async function togglePolicy(v: boolean) {
    setPolicy(v);
    await fetch("/api/solutions/12-recruitment/policy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ applied: v }) });
    refresh();
  }

  async function loadRecord(id: string) {
    const res = await fetch(`/api/solutions/12-recruitment/interview?appId=${id}`, { cache: "no-store" });
    if (res.ok) {
      const j = await res.json();
      setNotes(j.text);
      toast.message(L({ en: "Consented interview record loaded", ar: "حُمّل سجل المقابلة الموافق عليه" }));
    }
  }

  // Matrix
  const columns = finalists.map((r) => {
    const flagged = policy && r.nationality === "UAE";
    return {
      id: r.id,
      label: (
        <span className="inline-flex items-center gap-1.5">
          {nameOf(r)}
          {r.interviews > 0 && <MessageSquareQuote className="size-3.5 text-ai" />}
        </span>
      ),
      sub: (
        <span className="inline-flex items-center gap-1.5">
          <span className="num font-medium text-foreground">{r.score.toFixed(1)}</span>
          {flagged && <StatusPill tone="info" dot={false}>HC-POL-03</StatusPill>}
        </span>
      ),
    };
  });
  const matrixRows: MatrixRow[] = criteria.map((c) => ({
    id: c.id,
    label: L({ en: c.label, ar: c.labelAr ?? c.label }),
    weight: c.weight,
    cells: Object.fromEntries(
      finalists.map((r) => {
        const cur = r.ratings.find((x) => x.criterionId === c.id);
        const orig = r.ev!.ratings.find((x) => x.criterionId === c.id);
        const updates = state.interviews[r.id] ?? [];
        const changed = updates.flatMap((u) => u.changes.map((ch) => ({ ...ch, date: u.date }))).filter((ch) => ch.criterionId === c.id).at(-1);
        return [
          r.id,
          {
            status: statusOf(cur?.rating ?? 0),
            score: cur?.rating ?? 0,
            value: changed ? `${orig?.rating ?? 0} → ${cur?.rating} · ${L({ en: "interview", ar: "مقابلة" })}` : undefined,
            evidence: `${cur?.evidence ? `“${cur.evidence}”` : L({ en: "No evidence.", ar: "لا يوجد دليل." })}${cur?.gaps ? `\n\n${L({ en: "Gap", ar: "النقص" })}: ${cur.gaps}` : ""}${changed ? `\n\n${L({ en: "Interview", ar: "المقابلة" })}: ${changed.reason}` : ""}`,
            source: changed ? `${L({ en: "Interview record", ar: "سجل المقابلة" })}${changed.date ? ` · ${changed.date}` : ""}` : L({ en: "CV (redacted)", ar: "السيرة (محجوبة)" }),
          },
        ];
      }),
    ),
  }));

  // HR policy step (HC-POL-03) — deterministic, transparent, separate from AI scores.
  const evaluatedRows = rows.filter((r) => r.ev && r.source === "application");
  const ref = (finalists[0] ?? evaluatedRows[0])?.score ?? 0;
  const flagged = evaluatedRows.filter((r) => r.nationality === "UAE" && r.score >= ref - 5);

  const lastUpdate: (InterviewUpdate & { scoreBefore?: number; scoreAfter?: number }) | undefined =
    (interview.data.update as (InterviewUpdate & { scoreBefore: number; scoreAfter: number }) | undefined) ?? undefined;
  const history = target ? (state.interviews[target] ?? []) : [];
  const invList = (invites.data.invitations as Invitation[] | undefined) ?? [];
  const sent = state.invitations;
  const pendingInv = state.approvals
    .filter((a) => a.title.startsWith("Send interview invitations"))
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  const pendingDrafts = ((pendingInv?.payload as { invitations?: Invitation[] } | undefined)?.invitations ?? []).filter((i) => typeof i === "object");
  const invShown = invList.length ? invList : sent.length ? sent : pendingDrafts;
  const invApprovals: ApprovalSummary[] = invites.approvals.length
    ? invites.approvals
    : pendingInv && pendingInv.status === "pending"
      ? [pendingInv as ApprovalSummary]
      : [];
  const invCur = invShown.find((i) => i.appId === invView) ?? invShown[0];

  if (!finalists.length)
    return (
      <div className="rounded-lg border border-border bg-card">
        <EmptyState icon={<Users className="size-4" />} title={L({ en: "No shortlist yet", ar: "لا توجد قائمة مختصرة بعد" })}>
          {L({
            en: "In AI comparison, tick the candidates HR wants to take forward. The finalist comparison, interview evidence and invitations appear here.",
            ar: "في تبويب المقارنة الذكية، حدّد المرشحين الذين تريد الموارد البشرية المضي بهم. تظهر هنا مقارنة المرشحين النهائيين وأدلة المقابلات والدعوات.",
          })}
        </EmptyState>
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <UserCheck className="size-4 text-muted-foreground" />
        <div className="text-[13px]">
          <span className="font-medium">
            {finalists.length} {L({ en: "finalists selected by HR", ar: "مرشحين نهائيين اختارتهم الموارد البشرية" })}
          </span>
          <span className="text-muted-foreground"> · {L({ en: "stage", ar: "المرحلة" })}: </span>
          <StatusPill tone={req.stage === "invitations_sent" ? "success" : req.stage === "shortlist_approved" ? "ai" : "neutral"}>
            {req.stage === "invitations_sent"
              ? L({ en: "Invitations sent", ar: "أُرسلت الدعوات" })
              : req.stage === "shortlist_approved"
                ? L({ en: "Shortlist approved", ar: "القائمة معتمدة" })
                : L({ en: "Shortlist in preparation", ar: "القائمة قيد الإعداد" })}
          </StatusPill>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={requestApproval} disabled={requesting || finalists.length < 2 || shortlistApproval?.status === "pending"}>
            <ShieldCheck />
            {L({ en: "Request shortlist approval", ar: "طلب اعتماد القائمة المختصرة" })}
          </Button>
          <RunButton size="sm" running={invites.running} onRun={() => invites.start("/api/solutions/12-recruitment/invitations", {})} onStop={invites.abort} icon={<Mail />}>
            {L({ en: "Draft interview invitations", ar: "صياغة دعوات المقابلة" })}
          </RunButton>
        </div>
      </div>

      {shortlistApproval && (
        <ApprovalCard
          key={shortlistApproval.id + shortlistApproval.status}
          approval={shortlistApproval}
          onDecided={(st) => {
            setShortlistApproval({ ...shortlistApproval, status: st });
            refresh();
          }}
        />
      )}

      <Pane
        title={L({ en: "Finalist comparison", ar: "مقارنة المرشحين النهائيين" })}
        subtitle={L({ en: "Hover a cell for the evidence and its source · interview updates show before → after", ar: "مرّر على الخلية لرؤية الدليل ومصدره · تحديثات المقابلات تظهر قبل ← بعد" })}
        flush
      >
        <ComparisonMatrix
          columns={columns}
          rows={matrixRows}
          className="rounded-none border-0"
          statusLabels={{
            met: L({ en: "Strong", ar: "قوي" }),
            partial: L({ en: "Partial", ar: "جزئي" }),
            clarify: L({ en: "Limited", ar: "محدود" }),
            missing: L({ en: "No evidence", ar: "لا دليل" }),
          }}
          footer={
            <>
              <td className="label-caps !text-[9.5px] px-3 py-2.5">{L({ en: "Weighted score", ar: "الدرجة الموزونة" })}</td>
              {finalists.map((r) => (
                <td key={r.id} className="px-3 py-2.5">
                  <span className="num text-[15px] font-light">{r.score.toFixed(1)}</span>
                  <span className="text-[11px] text-muted-foreground"> / 100</span>
                </td>
              ))}
            </>
          }
        />
      </Pane>

      <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-4 max-lg:grid-cols-1">
        <Pane
          title={L({ en: "Interview evidence", ar: "أدلة المقابلة" })}
          subtitle={L({ en: "Consented records only · redacted before the model reads them", ar: "سجلات بموافقة المرشح فقط · تُحجب قبل أن يقرأها النموذج" })}
        >
          <div className="flex flex-wrap gap-1.5">
            {finalists.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  setTarget(r.id);
                  setNotes("");
                  interview.reset();
                }}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[12px] transition-colors",
                  target === r.id ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted",
                )}
              >
                {nameOf(r)}
                {state.interviewSamples.includes(r.id) && <FileText className="ms-1 inline size-3 opacity-70" />}
              </button>
            ))}
          </div>
          {target && (
            <div className="mt-3 space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                {state.interviewSamples.includes(target) && (
                  <Button size="sm" variant="outline" onClick={() => loadRecord(target)}>
                    <FileText />
                    {L({ en: "Load consented record on file", ar: "تحميل سجل المقابلة المحفوظ" })}
                  </Button>
                )}
                <FileDrop
                  compact
                  accept=".md,.txt"
                  className="flex-1"
                  label={L({ en: "Or drop interview notes (.md/.txt)", ar: "أو أسقط ملاحظات المقابلة (.md/.txt)" })}
                  hint={L({ en: "Kept on your own servers", ar: "تبقى على خوادم الجهة" })}
                  onFiles={(fs) => fs[0]?.text && setNotes(fs[0].text)}
                />
              </div>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={L({ en: "Paste the panel's interview notes…", ar: "الصق ملاحظات لجنة المقابلة…" })}
                className="min-h-40 bg-surface text-[12.5px]"
                dir="auto"
              />
              <label className="flex items-start gap-2 text-[12px]">
                <Checkbox checked={consent} onChange={() => setConsent((c) => !c)} label="consent" />
                <span className="leading-snug">
                  {L({
                    en: "The candidate consented to note-taking and to the use of these notes in this evaluation (form HC-F-22).",
                    ar: "وافق المرشح على تدوين الملاحظات واستخدامها في هذا التقييم (النموذج HC-F-22).",
                  })}
                </span>
              </label>
              <RunButton
                running={interview.running}
                disabled={!consent || notes.trim().length < 80}
                onRun={() => interview.start("/api/solutions/12-recruitment/interview", { appId: target, notes, consent })}
                onStop={interview.abort}
                icon={<ArrowRight className="rtl:rotate-180" />}
              >
                {L({ en: "Apply interview evidence", ar: "تطبيق أدلة المقابلة" })}
              </RunButton>
              {interview.status === "error" && <p className="text-[12px] text-danger">{interview.error}</p>}
            </div>
          )}
        </Pane>

        <Pane title={L({ en: "Comparison update", ar: "تحديث المقارنة" })}>
          {interview.running || interview.trace.length ? <AgentTrace run={interview} showReasoning={false} className="mb-4" /> : null}
          {(() => {
            const u: (InterviewUpdate & { scoreBefore?: number; scoreAfter?: number }) | undefined = lastUpdate ?? history.at(-1);
            if (!u)
              return (
                <p className="text-[12px] text-muted-foreground">
                  {L({ en: "Apply a consented interview record to see which ratings change, with the quote that justifies each change.", ar: "طبّق سجل مقابلة بموافقة المرشح لترى التقييمات التي تتغير مع الاقتباس المبرر لكل تغيير." })}
                </p>
              );
            return (
              <div className="space-y-3">
                {u.scoreBefore != null && u.scoreAfter != null && (
                  <div className="flex items-baseline gap-2">
                    <span className="num text-[13px] text-muted-foreground line-through decoration-faint/60">{u.scoreBefore}</span>
                    <ArrowRight className="size-3.5 text-faint rtl:rotate-180" />
                    <span className="num text-[24px] font-light tracking-tight text-ai">{u.scoreAfter}</span>
                    <span className="text-[12px] text-muted-foreground">/ 100 · {codeOf(u.appId, L)}</span>
                  </div>
                )}
                <p className="text-[12.5px] leading-relaxed" dir="auto">{u.summary}</p>
                <ul className="space-y-2.5">
                  {u.changes.map((ch) => {
                    const c = criteria.find((x) => x.id === ch.criterionId);
                    return (
                      <li key={ch.criterionId} className="rounded-md border border-border p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[12px] font-medium">
                            <span className="font-mono text-[10.5px] text-muted-foreground">{ch.criterionId}</span> {c ? L({ en: c.label, ar: c.labelAr ?? c.label }) : ""}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <RatingDots value={ch.before} className="opacity-50" />
                            <ArrowRight className="size-3 text-faint rtl:rotate-180" />
                            <RatingDots value={ch.after} />
                          </span>
                        </div>
                        {ch.evidence && (
                          <blockquote className="mt-1.5 border-s-2 border-ai/40 ps-2 text-[11.5px] leading-relaxed text-foreground/80" dir="auto">
                            “{ch.evidence}”
                          </blockquote>
                        )}
                        <div className="mt-1 text-[11.5px] text-muted-foreground" dir="auto">{ch.reason}</div>
                      </li>
                    );
                  })}
                  {!u.changes.length && <li className="text-[12px] text-muted-foreground">{L({ en: "No rating changes — the interview confirmed the CV evidence.", ar: "لا تغييرات — أكدت المقابلة أدلة السيرة." })}</li>}
                </ul>
                {!!u.concerns.length && (
                  <div>
                    <SectionLabel className="!mb-1">{L({ en: "Concerns raised", ar: "ملاحظات مثارة" })}</SectionLabel>
                    <ul className="space-y-1 text-[12px]">{u.concerns.map((x) => <li key={x} dir="auto">— {x}</li>)}</ul>
                  </div>
                )}
                <div className="text-[11px] text-muted-foreground">
                  <ShieldCheck className="me-1 inline size-3 text-success" />
                  {u.consent}
                </div>
              </div>
            );
          })()}
        </Pane>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-4 max-lg:grid-cols-1">
        <Pane
          title={L({ en: "Emiratisation — HR policy step", ar: "التوطين — خطوة سياسة الموارد البشرية" })}
          subtitle={`${req.emiratisationPolicy?.ref ?? "HC-POL-03"} · ${L({ en: "applied by Human Capital, never by the AI", ar: "تطبقه إدارة رأس المال البشري وليس الذكاء الاصطناعي" })}`}
          actions={<Switch checked={policy} onCheckedChange={togglePolicy} />}
        >
          <p className="text-[12px] leading-relaxed text-muted-foreground" dir="auto">
            {L({ en: req.emiratisationPolicy?.rule ?? "", ar: req.emiratisationPolicy?.ruleAr ?? req.emiratisationPolicy?.rule ?? "" })}
          </p>
          {policy ? (
            <div className="mt-3 space-y-2">
              <div className="text-[11.5px] text-muted-foreground">
                {L({ en: "Reference score", ar: "الدرجة المرجعية" })} <span className="num font-medium text-foreground">{ref.toFixed(1)}</span> ·{" "}
                {L({ en: "threshold", ar: "الحد" })} <span className="num font-medium text-foreground">{(ref - 5).toFixed(1)}</span>
              </div>
              {flagged.length ? (
                <ul className="divide-y divide-border rounded-md border border-border">
                  {flagged.map((r) => (
                    <li key={r.id} className="flex items-center gap-2 px-3 py-2 text-[12px]">
                      <Flag className="size-3.5 text-info" />
                      <span className="font-medium">{nameOf(r)}</span>
                      <span className="text-muted-foreground">· {L({ en: "UAE national", ar: "مواطن" })} · <span className="num">{r.score.toFixed(1)}</span></span>
                      {shortlist.includes(r.id) ? (
                        <StatusPill tone="success" className="ms-auto">{L({ en: "In shortlist", ar: "ضمن القائمة" })}</StatusPill>
                      ) : (
                        <Button size="xs" variant="outline" className="ms-auto" onClick={() => toggleShortlist(r.id)}>
                          {L({ en: "Advance to interview", ar: "ترشيح للمقابلة" })}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[12px] text-muted-foreground">{L({ en: "No UAE national within 5 points of the reference score.", ar: "لا يوجد مواطن ضمن 5 نقاط من الدرجة المرجعية." })}</p>
              )}
              <p className="text-[11px] text-muted-foreground">{L({ en: "AI scores are unchanged; this step is recorded in the audit trail.", ar: "درجات الذكاء الاصطناعي لا تتغير؛ وتُسجل هذه الخطوة في سجل التدقيق." })}</p>
            </div>
          ) : (
            <p className="mt-3 text-[12px] text-muted-foreground">{L({ en: "Off — nationality is not shown or used anywhere in the evaluation.", ar: "متوقفة — لا تُعرض الجنسية ولا تُستخدم في أي جزء من التقييم." })}</p>
          )}
        </Pane>

        <Pane
          title={L({ en: "Interview invitations", ar: "دعوات المقابلة" })}
          subtitle={sent.length ? `${sent.length} ${L({ en: "sent after HR Director approval", ar: "أُرسلت بعد اعتماد مديرة الموارد البشرية" })}` : L({ en: "Bilingual drafts · sent only after approval", ar: "مسودات ثنائية اللغة · لا تُرسل إلا بعد الاعتماد" })}
        >
          {invites.running || invites.trace.length ? <AgentTrace run={invites} showReasoning={false} className="mb-3" /> : null}
          {invApprovals.map((a) => (
            <ApprovalCard key={a.id} approval={a} className="mb-3" onDecided={(st) => { invites.markApproval(a.id, st); refresh(); }} />
          ))}
          {invShown.length ? (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                {invShown.map((i) => (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => setInvView(i.appId)}
                    className={cn("rounded-full border px-2.5 py-1 text-[11.5px]", invCur?.id === i.id ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted")}
                  >
                    {reveal ? rows.find((r) => r.id === i.appId)?.name : codeOf(i.appId, L)}
                  </button>
                ))}
                <ToggleGroup type="single" size="sm" variant="outline" value={invLang} onValueChange={(v) => v && setInvLang(v as "en" | "ar")} className="ms-auto">
                  <ToggleGroupItem value="en" className="px-2 text-[11px]">EN</ToggleGroupItem>
                  <ToggleGroupItem value="ar" className="px-2 text-[11px]">ع</ToggleGroupItem>
                </ToggleGroup>
              </div>
              {invCur && (
                <div className="mt-3 rounded-md border border-border bg-surface p-3" dir={invLang === "ar" ? "rtl" : "ltr"}>
                  <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
                    <CalendarClock className="size-3.5" />
                    <span className="num">{f.date(invCur.slot.replace(" ", "T") + ":00+04:00", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    {sent.some((s) => s.id === invCur.id) && <StatusPill tone="success" className="ms-auto"><Send className="size-3" />{L({ en: "Sent", ar: "أُرسلت" })}</StatusPill>}
                  </div>
                  <div className="mt-2 text-[13px] font-medium">{invLang === "ar" ? invCur.subjectAr : invCur.subjectEn}</div>
                  <p className="mt-2 text-[12.5px] leading-relaxed whitespace-pre-wrap">{invLang === "ar" ? invCur.bodyAr : invCur.bodyEn}</p>
                </div>
              )}
            </>
          ) : (
            !invites.running && <p className="text-[12px] text-muted-foreground">{L({ en: "Draft invitations once the shortlist is ready. The model writes a template — candidate names are filled in by the system, never seen by the model.", ar: "صِغ الدعوات عند جاهزية القائمة. يكتب النموذج قالباً — ويملأ النظام أسماء المرشحين دون أن يراها النموذج." })}</p>
          )}
        </Pane>
      </div>
    </div>
  );
}
