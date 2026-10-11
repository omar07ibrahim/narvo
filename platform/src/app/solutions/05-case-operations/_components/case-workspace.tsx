"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, Languages, Landmark, Mail, MessageSquare, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SolutionPage, type ScenarioStep } from "@/components/narvo/solution-page";
import { Pane, Workbench } from "@/components/narvo/pane";
import { AgentTrace } from "@/components/narvo/agent-trace";
import { ApprovalCard } from "@/components/narvo/approval-card";
import { SourceList } from "@/components/narvo/sources";
import { Markdown } from "@/components/narvo/markdown";
import { MetricTile } from "@/components/narvo/metric";
import { RunButton } from "@/components/narvo/run-button";
import { StatusPill } from "@/components/narvo/status";
import { EmptyState, ThinkingLines } from "@/components/narvo/empty";
import { DocumentViewer } from "@/components/narvo/document-viewer";
import { useNarvoRun } from "@/hooks/use-narvo-run";
import { useFormat, useL, usePrefs } from "@/lib/i18n";
import type { ApprovalSummary, Citation } from "@/lib/ai/events";
import { cn } from "@/lib/utils";
import type { CaseCheck, CaseMessage, CaseReview, ExtractedDocument, HousingCase } from "../_lib/types";
import { STATUS } from "./labels";
import { CaseList } from "./case-list";
import { CheckList } from "./checks";
import { ExtractionList } from "./extractions";
import { InspectDialog, SweepSheet } from "./side-tools";

const SLUG = "05-case-operations";

const SCENARIO: ScenarioStep[] = [
  {
    title: { en: "Open the newest application", ar: "افتح أحدث طلب" },
    body: {
      en: "Select MNDA-HG-2026-005203 — Obaid Hamad Al Ketbi, a housing-grant application submitted through MNDA Smart with six scanned documents.",
      ar: "اختر MNDA-HG-2026-005203 — عبيد حمد الكتبي، طلب منحة سكنية مقدّم عبر تطبيق MNDA Smart مع ستة مستندات ممسوحة.",
    },
  },
  {
    title: { en: "Run the completeness review", ar: "شغّل مراجعة الاكتمال" },
    body: {
      en: "NARVO reads every scan — Arabic and English, IDs, family book, salary certificate — with the private vision model. Watch each document being read in the trace.",
      ar: "يقرأ نارفو كل مستند ممسوح — بالعربية والإنجليزية — باستخدام نموذج الرؤية الخاص. تابع قراءة كل مستند في مسار العمل.",
    },
  },
  {
    title: { en: "Rules, not guesses", ar: "قواعد لا تخمين" },
    body: {
      en: "The checks are computed from Circular 9/2026: the salary certificate is 39 days old (limit 30) and declared income differs by 6.1% (limit 5%). Each finding links to the circular text.",
      ar: "تُحتسب الفحوص وفق التعميم 9/2026: عمر شهادة الراتب 39 يوماً (الحد 30) وفرق الدخل 6.1% (الحد 5%). كل ملاحظة مرتبطة بنص التعميم.",
    },
  },
  {
    title: { en: "No repeated request to the citizen", ar: "لا طلبات متكررة من المتعامل" },
    body: {
      en: "Consent is on the form, so the agent retrieves the no-property certificate from the Land Registry itself instead of asking the applicant.",
      ar: "الموافقة مؤشرة في النموذج، فيستخرج الوكيل شهادة عدم الملكية من سجل الأراضي بنفسه بدلاً من مطالبة المتقدم.",
    },
  },
  {
    title: { en: "One clarification — approved by a person", ar: "طلب استيفاء واحد — باعتماد بشري" },
    body: {
      en: "The Arabic message lists every item at once. Approve it as Mariam Al Kaabi: the status, SLA clock, correspondence and audit trail update instantly. The AI never decides eligibility.",
      ar: "تسرد الرسالة العربية جميع البنود دفعة واحدة. اعتمدها باسم مريم الكعبي: تتحدث الحالة ومدة الخدمة والمراسلات وسجل التدقيق فوراً. لا يقرر الذكاء الاصطناعي الأهلية.",
    },
  },
  {
    title: { en: "Compare with a complete file", ar: "قارن بملف مكتمل" },
    body: {
      en: "Open MNDA-HG-2026-005231 (loan track, eight documents) — everything checks out and NARVO proposes moving it to verification. Then 005219 shows an income above the grant ceiling.",
      ar: "افتح MNDA-HG-2026-005231 (مسار القرض، ثمانية مستندات) — كل شيء مستوفٍ ويقترح نارفو تحويلها للتحقق. ثم تُظهر 005219 دخلاً يتجاوز سقف المنحة.",
    },
  },
  {
    title: { en: "Bring your own document", ar: "أحضر مستندك" },
    body: {
      en: "Use “Inspect a document” with any photo — e.g. a printed salary certificate from your phone. It is identified, extracted and checked live.",
      ar: "استخدم «فحص مستند» مع أي صورة — مثل شهادة راتب مطبوعة من هاتفك. يتم التعرف عليها واستخراجها والتحقق منها مباشرة.",
    },
  },
];

function addWorkingDays(start: string, n: number) {
  const d = new Date(start);
  let added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) added++;
  }
  return d;
}

function Fact({ k, v }: { k: React.ReactNode; v: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="label-caps !text-[9.5px]">{k}</div>
      <div className="mt-0.5 truncate text-[12.5px] font-medium" title={typeof v === "string" ? v : undefined}>
        {v}
      </div>
    </div>
  );
}

interface Detail {
  case: HousingCase;
  messages: CaseMessage[];
  review: CaseReview | null;
  approvals: Array<ApprovalSummary & { status: string }>;
}

interface AuditRow {
  id: string;
  ts: number;
  actor: { name: string; role: string; kind: string };
  action: string;
  subject: string;
  detail?: string;
}

export function CaseWorkspace({ initialCases }: { initialCases: HousingCase[] }) {
  const L = useL();
  const f = useFormat();
  const { lang } = usePrefs();
  const run = useNarvoRun();
  const [cases, setCases] = useState(initialCases);
  const [selected, setSelected] = useState<string | null>("MNDA-HG-2026-005203");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [tab, setTab] = useState("review");
  const [viewer, setViewer] = useState<{ file: string; label: string } | null>(null);
  const [history, setHistory] = useState<AuditRow[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [translation, setTranslation] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [highlight, setHighlight] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    const [list, pend] = await Promise.all([
      fetch(`/api/solutions/${SLUG}/cases`).then((r) => r.json()),
      fetch(`/api/approvals?solution=${SLUG}&status=pending`).then((r) => r.json()),
    ]);
    setCases(list.cases);
    setPendingCount(pend.approvals.length);
    if (selected) {
      const d = await fetch(`/api/solutions/${SLUG}/cases?id=${selected}`).then((r) => (r.ok ? r.json() : null));
      setDetail(d);
    }
    const audit = await fetch(`/api/audit?solution=${SLUG}&limit=400`).then((r) => r.json());
    setHistory(audit.events);
  }, [selected]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    run.reset();
    setTranslation(null);
    setTab("review");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  useEffect(() => {
    if (run.status === "done") refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.status]);

  const c = detail?.case ?? cases.find((x) => x.id === selected) ?? null;
  const live = run.status !== "idle";
  const checks = (run.data.checks as CaseCheck[] | undefined) ?? (!live ? detail?.review?.checks : undefined);
  const extractions = (run.data.extractions as ExtractedDocument[] | undefined) ?? (!live ? detail?.review?.extractions : undefined);
  const citations = (run.data.citations as Citation[] | undefined) ?? [];
  const draft = run.data.draft as { language: "ar" | "en"; items: string[]; message: string } | undefined;
  const registry = run.data.registry as { reference: string; result: string; issued: string } | undefined;
  const caseApprovals: ApprovalSummary[] = live
    ? run.approvals
    : ((detail?.approvals ?? []).filter((a) => a.status === "pending") as ApprovalSummary[]);

  const kpi = useMemo(() => {
    const open = cases.filter((x) => !["approved", "not_approved"].includes(x.status));
    const now = Date.now();
    const avgAge = open.reduce((a, x) => a + (now - new Date(x.submittedAt).getTime()) / 86400000, 0) / Math.max(open.length, 1);
    return {
      fresh: cases.filter((x) => x.status === "submitted").length,
      waiting: cases.filter((x) => x.status === "incomplete").length,
      progress: cases.filter((x) => ["under_review", "verification", "decision_pending"].includes(x.status)).length,
      avgAge,
    };
  }, [cases]);

  const caseHistory = history.filter((h) => c && (h.subject?.includes(c.id) || h.detail?.includes(c.id)));
  const scanned = c?.documents.filter((d) => d.file) ?? [];
  const due = c ? addWorkingDays(c.submittedAt, c.slaDays) : null;

  async function translate() {
    if (!draft) return;
    setTranslating(true);
    try {
      const r = await fetch(`/api/solutions/${SLUG}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: draft.message, to: draft.language === "ar" ? "en" : "ar" }),
      }).then((x) => x.json());
      setTranslation(r.text);
    } finally {
      setTranslating(false);
    }
  }

  return (
    <SolutionPage slug={SLUG} scenario={SCENARIO} actions={<InspectDialog />}>
      <div className="grid grid-cols-4 gap-4 max-lg:grid-cols-2">
        <MetricTile label={L({ en: "New — awaiting review", ar: "جديدة — بانتظار المراجعة" })} value={kpi.fresh} sub={L({ en: "in this queue", ar: "في قائمة العمل" })} tone="ai" />
        <MetricTile label={L({ en: "Awaiting applicant", ar: "بانتظار المتعامل" })} value={kpi.waiting} sub={L({ en: "SLA clock paused", ar: "مدة الخدمة متوقفة" })} />
        <MetricTile label={L({ en: "Verification & decision", ar: "التحقق والقرار" })} value={kpi.progress} sub={L({ en: "with officers", ar: "لدى الموظفين" })} />
        <MetricTile
          label={L({ en: "Approvals pending", ar: "اعتمادات معلقة" })}
          value={pendingCount}
          sub={L({ en: `avg. open case age ${kpi.avgAge.toFixed(1)} days`, ar: `متوسط عمر الحالة ${kpi.avgAge.toFixed(1)} يوماً` })}
          tone={pendingCount ? "warning" : "default"}
        />
      </div>

      <Workbench cols="330px minmax(0,1fr) 370px" className="min-h-[760px]">
        <Pane title={L({ en: "Applications", ar: "الطلبات" })} actions={<SweepSheet onChanged={refresh} />} flush>
          <CaseList cases={cases} selected={selected} onSelect={setSelected} />
        </Pane>

        <Pane flush className="overflow-hidden">
          {!c ? (
            <EmptyState icon={<FileText className="size-4" />} title={L({ en: "Select a case", ar: "اختر حالة" })} />
          ) : (
            <div className="flex h-full flex-col">
              {/* Case header */}
              <div className="border-b border-border p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11.5px] text-muted-foreground">{c.id}</span>
                      <StatusPill tone={STATUS[c.status].tone}>{L(STATUS[c.status])}</StatusPill>
                      {c.clockStopped && <StatusPill tone="neutral">{L({ en: "Clock paused", ar: "المدة متوقفة" })}</StatusPill>}
                    </div>
                    <h2 className="mt-2 text-[22px] leading-tight font-light tracking-tight">{lang === "ar" ? c.applicant.nameAr : c.applicant.name}</h2>
                    <div className="mt-0.5 text-[13px] text-muted-foreground" dir={lang === "ar" ? "ltr" : "rtl"}>
                      {lang === "ar" ? c.applicant.name : c.applicant.nameAr}
                    </div>
                  </div>
                  <div className="text-end">
                    <div className="label-caps">{c.track === "grant" ? L({ en: "Housing grant", ar: "منحة سكنية" }) : L({ en: "Housing loan", ar: "قرض سكني" })}</div>
                    <div className="num mt-1 text-[22px] font-light">{f.aed(c.amountRequested)}</div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-4 gap-x-6 gap-y-3 max-xl:grid-cols-2">
                  <Fact k={L({ en: "Emirates ID", ar: "الهوية" })} v={<span className="font-mono text-[11.5px]">{c.applicant.emiratesId}</span>} />
                  <Fact k={L({ en: "District · plot", ar: "المنطقة · الأرض" })} v={`${c.district.split(" ")[0]}${c.plot ? ` · ${c.plot.split("-").slice(2).join("-")}` : ""}`} />
                  <Fact k={L({ en: "Submitted", ar: "تاريخ التقديم" })} v={f.date(c.submittedAt)} />
                  <Fact
                    k={L({ en: "SLA due", ar: "موعد الإنجاز" })}
                    v={c.clockStopped ? L({ en: "Paused — awaiting applicant", ar: "متوقف — بانتظار المتعامل" }) : due ? f.date(due) : "—"}
                  />
                  <Fact k={L({ en: "Channel", ar: "القناة" })} v={c.channel} />
                  <Fact
                    k={L({ en: "Household", ar: "الأسرة" })}
                    v={`${L({
                      en: c.applicant.maritalStatus.charAt(0).toUpperCase() + c.applicant.maritalStatus.slice(1),
                      ar: ({ married: "متزوج", widowed: "أرمل", divorced: "مطلق", single: "أعزب" } as Record<string, string>)[c.applicant.maritalStatus] ?? c.applicant.maritalStatus,
                    })} · ${c.applicant.dependents} ${L({ en: c.applicant.dependents === 1 ? "child" : "children", ar: "أبناء" })}`}
                  />
                  <Fact k={L({ en: "Declared income", ar: "الدخل المصرّح" })} v={<span className="num">{f.aed(c.applicant.monthlyIncomeDeclared)}</span>} />
                  <Fact k={L({ en: "Officer", ar: "الموظف" })} v={c.officer ?? L({ en: "Unassigned", ar: "غير مسند" })} />
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <RunButton
                    running={run.running}
                    onStop={run.abort}
                    disabled={!scanned.length}
                    onRun={() => {
                      setTab("review");
                      setTranslation(null);
                      run.start(`/api/solutions/${SLUG}/review`, { caseId: c.id });
                    }}
                    icon={<Sparkles />}
                  >
                    {detail?.review ? L({ en: "Re-run completeness review", ar: "إعادة مراجعة الاكتمال" }) : L({ en: "Run completeness review", ar: "تشغيل مراجعة الاكتمال" })}
                  </RunButton>
                  {!scanned.length && (
                    <span className="text-[12px] text-muted-foreground">
                      {L({ en: "Documents for this case are in the archive DMS — open a case with scans (005203, 005219, 005231).", ar: "مستندات هذه الحالة في الأرشيف — افتح حالة لها مستندات ممسوحة (005203، 005219، 005231)." })}
                    </span>
                  )}
                  {detail?.review && !live && (
                    <span className="text-[11.5px] text-muted-foreground">
                      {L({ en: "Last reviewed", ar: "آخر مراجعة" })} {f.relative(detail.review.at)}
                    </span>
                  )}
                </div>
              </div>

              <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col gap-0">
                <TabsList variant="line" className="h-10 w-full justify-start rounded-none border-b border-border bg-transparent px-5">
                  <TabsTrigger value="review">{L({ en: "AI review", ar: "مراجعة الذكاء الاصطناعي" })}</TabsTrigger>
                  <TabsTrigger value="documents">
                    {L({ en: "Documents", ar: "المستندات" })} <span className="num text-faint">{c.documents.length}</span>
                  </TabsTrigger>
                  <TabsTrigger value="messages">
                    {L({ en: "Correspondence", ar: "المراسلات" })} <span className="num text-faint">{detail?.messages.length ?? 0}</span>
                  </TabsTrigger>
                  <TabsTrigger value="history">{L({ en: "History", ar: "السجل" })}</TabsTrigger>
                </TabsList>

                <TabsContent value="review" className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-5">
                  {!checks && !extractions?.length && !run.running && (
                    <EmptyState icon={<ShieldCheck className="size-4" />} title={L({ en: "No AI review yet", ar: "لا توجد مراجعة بعد" })}>
                      {L({
                        en: "Run the review: every scan is read, Circular 9/2026 checks are computed, and the next actions are prepared for approval.",
                        ar: "شغّل المراجعة: تُقرأ كل المستندات وتُحتسب فحوص التعميم 9/2026 وتُجهّز الإجراءات التالية للاعتماد.",
                      })}
                    </EmptyState>
                  )}
                  <div className="space-y-6">
                    {run.running && !extractions?.length && <ThinkingLines lines={5} />}

                    {checks && (
                      <section>
                        <div className="label-caps mb-2">{L({ en: "Circular 9/2026 checks", ar: "فحوص التعميم 9/2026" })}</div>
                        <CheckList checks={checks} />
                      </section>
                    )}

                    {registry && (
                      <section className="flex items-start gap-3 rounded-md border border-ai/25 bg-ai-soft/40 p-3.5">
                        <Landmark className="mt-0.5 size-4 text-ai" />
                        <div className="text-[12.5px] leading-relaxed">
                          <div className="font-medium">{L({ en: "Retrieved from the Land Registry — no request to the applicant", ar: "مستخرجة من سجل الأراضي — دون مطالبة المتقدم" })}</div>
                          <div className="text-muted-foreground">
                            {registry.reference} · {registry.result === "none" ? L({ en: "No residential property registered", ar: "لا توجد عقارات سكنية مسجلة" }) : L({ en: "Property found", ar: "عقار مسجل" })} · {registry.issued}
                          </div>
                        </div>
                      </section>
                    )}

                    {draft && (
                      <section>
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="label-caps">{L({ en: "Clarification request — draft", ar: "طلب الاستيفاء — مسودة" })}</span>
                          <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={translate} disabled={translating}>
                            <Languages />
                            {translation
                              ? L({ en: "Translated", ar: "مترجم" })
                              : draft.language === "ar"
                                ? L({ en: "Translate to English for review", ar: "ترجمة إلى الإنجليزية" })
                                : L({ en: "Translate to Arabic", ar: "ترجمة إلى العربية" })}
                          </Button>
                        </div>
                        <div className={cn("grid gap-3", translation && "grid-cols-2 max-xl:grid-cols-1")}>
                          <div className="rounded-md border border-border bg-surface p-4 text-[13.5px] leading-[1.9] whitespace-pre-wrap" dir={draft.language === "ar" ? "rtl" : "ltr"}>
                            {draft.message}
                          </div>
                          {translation && (
                            <div className="rounded-md border border-dashed border-border p-4 text-[13px] leading-[1.8] whitespace-pre-wrap text-muted-foreground" dir="auto">
                              {translation}
                            </div>
                          )}
                        </div>
                      </section>
                    )}

                    {run.text.summary && (
                      <section className="rounded-md border border-border p-4">
                        <div className="label-caps mb-1.5 flex items-center gap-1.5">
                          <UserRound className="size-3" />
                          {L({ en: "Summary for the case officer", ar: "ملخص لموظف الحالة" })}
                        </div>
                        <Markdown streaming={run.running}>{run.text.summary}</Markdown>
                      </section>
                    )}

                    {extractions && extractions.length > 0 && (
                      <section>
                        <div className="label-caps mb-2">
                          {L({ en: "Read from the documents", ar: "المقروء من المستندات" })} · {extractions.length}/{scanned.length}
                        </div>
                        <ExtractionList items={extractions} onView={(file, label) => setViewer({ file, label })} />
                      </section>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="documents" className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-5">
                  <div className="grid grid-cols-3 gap-3 max-xl:grid-cols-2">
                    {c.documents.map((d) => (
                      <button
                        key={d.label}
                        type="button"
                        disabled={!d.file}
                        onClick={() => d.file && setViewer({ file: d.file, label: d.label })}
                        className="group overflow-hidden rounded-md border border-border bg-surface text-start transition-colors hover:border-border-strong disabled:cursor-default"
                      >
                        <div className="flex aspect-[1100/1000] items-start justify-center overflow-hidden bg-muted/60">
                          {d.file ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={d.file} alt={d.label} className="w-full object-cover object-top transition-transform group-hover:scale-[1.02]" />
                          ) : (
                            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
                              <Landmark className="size-6" />
                              <span className="text-[11px]">{d.source === "land_registry" ? "Land Registry" : "Archive DMS"}</span>
                            </div>
                          )}
                        </div>
                        <div className="border-t border-border px-3 py-2 text-[12px] font-medium">{d.label}</div>
                      </button>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="messages" className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-5">
                  {!detail?.messages.length ? (
                    <EmptyState icon={<Mail className="size-4" />} title={L({ en: "No messages sent yet", ar: "لم تُرسل رسائل بعد" })}>
                      {L({ en: "Approved clarifications and reminders appear here.", ar: "تظهر هنا طلبات الاستيفاء والتذكيرات المعتمدة." })}
                    </EmptyState>
                  ) : (
                    <ul className="space-y-3">
                      {detail.messages.map((m) => (
                        <li key={m.id} className="rounded-md border border-border p-4">
                          <div className="mb-2 flex flex-wrap items-center gap-2 text-[11.5px] text-muted-foreground">
                            <MessageSquare className="size-3.5" />
                            <span className="font-medium text-foreground">{m.kind === "clarification" ? L({ en: "Clarification request", ar: "طلب استيفاء" }) : L({ en: "Reminder", ar: "تذكير" })}</span>
                            {m.channels.map((ch) => (
                              <span key={ch} className="rounded border border-border px-1.5">
                                {ch}
                              </span>
                            ))}
                            <span className="ms-auto">
                              {f.date(m.sentAt)} {f.time(m.sentAt)} · {m.sentBy}
                            </span>
                          </div>
                          <p className="text-[13px] leading-[1.85] whitespace-pre-wrap" dir={m.language === "ar" ? "rtl" : "ltr"}>
                            {m.body}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </TabsContent>

                <TabsContent value="history" className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-5">
                  {!caseHistory.length ? (
                    <EmptyState title={L({ en: "No recorded activity yet", ar: "لا يوجد نشاط مسجل بعد" })} />
                  ) : (
                    <ol className="relative space-y-4 before:absolute before:start-[5px] before:top-1 before:bottom-1 before:w-px before:bg-border">
                      {caseHistory.map((h) => (
                        <li key={h.id} className="relative ps-6">
                          <span
                            className={cn(
                              "absolute start-0 top-1.5 size-[11px] rounded-full border-2 border-card",
                              h.actor.kind === "agent" ? "bg-ai" : h.actor.kind === "human" ? "bg-foreground" : "bg-faint",
                            )}
                          />
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <span className="text-[13px] font-medium">{h.action}</span>
                            <span className="text-[11px] text-muted-foreground">
                              {f.date(h.ts)} {f.time(h.ts)}
                            </span>
                          </div>
                          <div className="text-[12px] text-muted-foreground">
                            {h.actor.name} · {h.actor.role}
                            {h.detail ? ` — ${h.detail}` : ""}
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          )}
        </Pane>

        <div className="flex min-h-0 flex-col gap-4">
          <Pane>
            <AgentTrace run={run} />
          </Pane>
          {caseApprovals.length > 0 && (
            <div className="space-y-3">
              {caseApprovals.map((a) => (
                <ApprovalCard
                  key={a.id}
                  approval={a}
                  onDecided={(s) => {
                    run.markApproval(a.id, s);
                    setTimeout(refresh, 300);
                  }}
                />
              ))}
            </div>
          )}
          {citations.length > 0 && (
            <Pane title={L({ en: "Policy sources", ar: "مصادر السياسة" })}>
              <SourceList citations={citations} highlight={highlight} />
              <button type="button" className="hidden" onClick={() => setHighlight(null)} />
            </Pane>
          )}
        </div>
      </Workbench>

      <Dialog open={!!viewer} onOpenChange={(o) => !o && setViewer(null)}>
        <DialogContent className="max-h-[92vh] overflow-hidden p-0 sm:max-w-[920px]">
          <DialogTitle className="border-b border-border px-4 py-3 text-sm font-medium">{viewer?.label}</DialogTitle>
          {viewer && <DocumentViewer src={viewer.file} title={viewer.label} height={760} className="rounded-none border-0" />}
        </DialogContent>
      </Dialog>
    </SolutionPage>
  );
}
