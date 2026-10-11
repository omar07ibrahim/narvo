"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookA, CheckCheck, Download, FilePlus2, FileText, Languages, LoaderCircle, Printer, ScanText, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { SolutionPage, type ScenarioStep } from "@/components/narvo/solution-page";
import { MetricTile } from "@/components/narvo/metric";
import { Workbench, Pane } from "@/components/narvo/pane";
import { AgentTrace } from "@/components/narvo/agent-trace";
import { Markdown } from "@/components/narvo/markdown";
import { DocumentViewer } from "@/components/narvo/document-viewer";
import { RunButton } from "@/components/narvo/run-button";
import { StatusPill } from "@/components/narvo/status";
import { EmptyState } from "@/components/narvo/empty";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNarvoRun } from "@/hooks/use-narvo-run";
import { useFormat, useL, usePrefs } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { assemble, type Candidate, type QueueDoc, type RunResult, type Segment, type Term } from "../_lib/shared";
import { ReviewEditor } from "./review-editor";
import { QaSummary, TermPanel } from "./term-panel";
import { GlossaryTab } from "./glossary-tab";
import { ByoDialog } from "./byo-dialog";

const SCENARIO: ScenarioStep[] = [
  {
    title: { en: "The translation queue", ar: "قائمة الترجمة" },
    body: {
      en: "Seven real requests: circulars and a code amendment for Marina Quarter consultants, a technical specification with tables, a contractor letter, an administrative decision and a tender clause. Open DOC-01 — Circular 14/2026 in Arabic, needed in English.",
      ar: "سبعة طلبات حقيقية: تعاميم وتعديل كود لاستشاريي حي المارينا، ومواصفة فنية بجداول، ورسالة مقاول، وقرار إداري، وبند مناقصة. افتح DOC-01 — التعميم 14/2026 بالعربية والمطلوب بالإنجليزية.",
    },
  },
  {
    title: { en: "Translate with the glossary", ar: "ترجم وفق المسرد" },
    body: {
      en: "Press Translate Arabic → English. The trace shows segmentation (headings, lists, table rows), glossary matching, parallel glossary-constrained translation, automated checks and an AI bilingual review — in seconds, not 4 days.",
      ar: "اضغط «ترجمة من العربية إلى الإنجليزية». يعرض المسار التقسيم (عناوين وقوائم وصفوف جداول) ومطابقة المسرد والترجمة المتوازية المقيدة بالمسرد والفحوص الآلية والمراجعة ثنائية اللغة — خلال ثوانٍ لا أربعة أيام.",
    },
  },
  {
    title: { en: "Tables and numbers intact", ar: "الجداول والأرقام كما هي" },
    body: {
      en: "Open DOC-03 (EN → AR technical specification) and translate. Every table row keeps its cells; numbers, RAL codes, fire ratings and references are verified by code. Switch to Preview to see the Arabic document with its tables.",
      ar: "افتح DOC-03 (مواصفة فنية من الإنجليزية إلى العربية) وترجمها. يحتفظ كل صف جدول بخلاياه؛ وتتحقق الشيفرة من الأرقام ورموز RAL وتصنيفات الحريق والمراجع. انتقل إلى «معاينة» لرؤية المستند العربي بجداوله.",
    },
  },
  {
    title: { en: "Resolve a disputed term", ar: "حسم مصطلح خلافي" },
    body: {
      en: "Filter “Disputed”: e.g. Podium (المنصة vs الطوابق القاعدية). In the Terminology panel choose the rendering, add a rationale and send it to Mona Al Hashimi, Terminology Lead. Approve it — the glossary is updated — then apply the approved term to the translation.",
      ar: "رشّح «خلافي»: مثل Podium (المنصة مقابل الطوابق القاعدية). اختر الصيغة في لوحة المصطلحات وأضف المبرر وأرسلها إلى منى الهاشمي، رئيسة المصطلحات. اعتمدها — يتحدث المسرد — ثم طبّق المصطلح المعتمد على الترجمة.",
    },
  },
  {
    title: { en: "Human review", ar: "المراجعة البشرية" },
    body: {
      en: "Click any translation to edit it — code checks re-run instantly. Accept all clean segments in one click, review the flagged ones, accept or fix the flagged ones (✓ on each row), then Mark reviewed. Each step is audited.",
      ar: "انقر أي ترجمة لتحريرها — تُعاد الفحوص فوراً. اقبل كل المقاطع السليمة بنقرة واحدة، وراجع المقاطع المعلّمة واقبلها (✓ في كل صف)، ثم «اعتماد المراجعة». كل خطوة مسجلة.",
    },
  },
  {
    title: { en: "Export and bring your own", ar: "التصدير ومستندك الخاص" },
    body: {
      en: "Download the reviewed .md or print a clean copy with tables. Then use “Bring your own”: photograph an Arabic page — the vision model transcribes it with its table, and the same pipeline translates it.",
      ar: "نزّل ملف .md المراجَع أو اطبع نسخة نظيفة بجداولها. ثم استخدم «أضف مستندك»: صوّر صفحة عربية — يفرّغها نموذج الرؤية مع جدولها ويترجمها المسار نفسه.",
    },
  },
];

type Summary = RunResult["metrics"] & { accepted: number; total: number; createdAt: string };

export function DocOps({ initialDocs, initialSummaries, initialTerms }: { initialDocs: QueueDoc[]; initialSummaries: Record<string, Summary>; initialTerms: Term[] }) {
  const L = useL();
  const fmt = useFormat();
  const { lang } = usePrefs();
  const pipeline = useNarvoRun();
  const [tab, setTab] = useState("desk");
  const [docs, setDocs] = useState(initialDocs);
  const [summaries, setSummaries] = useState(initialSummaries);
  const [terms, setTerms] = useState(initialTerms);
  const [selected, setSelected] = useState(initialDocs[0]?.id ?? "");
  const [docText, setDocText] = useState("");
  const [run, setRun] = useState<RunResult | null>(null);
  const [loading, setLoading] = useState(!!initialDocs[0]);
  const [view, setView] = useState<"review" | "source" | "preview">("review");
  const [filter, setFilter] = useState<"all" | "flagged" | "disputed" | "pending">("all");
  const [byo, setByo] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [runningDoc, setRunningDoc] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const doc = docs.find((d) => d.id === selected);
  const termMap = useMemo(() => new Map(terms.map((t) => [t.id, t])), [terms]);

  const refreshQueue = useCallback(async () => {
    const res = await fetch("/api/solutions/06-arabic-documents/documents");
    if (!res.ok) return;
    const j = (await res.json()) as { docs: QueueDoc[]; summaries: Record<string, Summary> };
    setDocs(j.docs);
    setSummaries(j.summaries);
  }, []);

  const refreshGlossary = useCallback(async () => {
    const res = await fetch("/api/solutions/06-arabic-documents/glossary");
    if (res.ok) setTerms((await res.json()).terms);
  }, []);

  useEffect(() => {
    if (!selected) return;
    let alive = true;
    setLoading(true);
    fetch(`/api/solutions/06-arabic-documents/documents?id=${encodeURIComponent(selected)}`)
      .then((r) => r.json())
      .then((j: { text: string; run: RunResult | null }) => {
        if (!alive) return;
        setDocText(j.text);
        setRun(j.run);
        setFilter("all");
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [selected]);

  // Pipeline finished → adopt the persisted run.
  useEffect(() => {
    if (pipeline.status !== "done" || !pipeline.data.run) return;
    const r = pipeline.data.run as RunResult;
    if (r.docId === selected) setRun(r);
    refreshQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipeline.status, pipeline.data.run]);

  const live = pipeline.running && runningDoc === selected;
  const segments: Segment[] = live ? ((pipeline.data.segments as Segment[]) ?? []) : (run?.segments ?? []);
  const candidates: Candidate[] = live ? ((pipeline.data.candidates as Candidate[]) ?? []) : (run?.candidates ?? []);
  const metrics = !live ? run?.metrics : undefined;
  const trans = segments.filter((s) => s.kind !== "table-sep");
  const accepted = trans.filter((s) => s.status !== "pending").length;

  function translate() {
    if (!doc) return;
    setRunningDoc(doc.id);
    setView("review");
    setFilter("all");
    pipeline.start("/api/solutions/06-arabic-documents/translate", { docId: doc.id });
  }

  async function review(body: Record<string, unknown>) {
    const res = await fetch("/api/solutions/06-arabic-documents/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ docId: selected, ...body }),
    });
    if (!res.ok) throw new Error(await res.text());
    const j = await res.json();
    if (j.run) setRun(j.run);
    return j;
  }

  async function act(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function exportMd() {
    if (!run || !doc) return;
    const body = assemble(run.segments, "target");
    const header =
      doc.target === "en"
        ? `<!-- ${doc.id} · ${doc.ref ?? ""} · English translation of the Arabic original · MNDA glossary applied (${run.metrics.compliancePct ?? 100}% compliance) · reviewed ${accepted}/${trans.length} segments -->`
        : `<!-- ${doc.id} · ${doc.ref ?? ""} · الترجمة العربية للنص الإنجليزي · وفق مسرد الهيئة (${run.metrics.compliancePct ?? 100}%) · روجع ${accepted}/${trans.length} مقطعاً -->`;
    const blob = new Blob([`${header}\n\n${body}\n`], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${doc.id}-${doc.target.toUpperCase()}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function print() {
    const html = printRef.current?.innerHTML;
    if (!html || !doc) return;
    const w = window.open("", "_blank", "width=960,height=1200");
    if (!w) return;
    const rtl = doc.target === "ar";
    w.document.write(`<!doctype html><html dir="${rtl ? "rtl" : "ltr"}" lang="${doc.target}"><head><meta charset="utf-8"><title>${doc.id} — ${doc.target.toUpperCase()}</title>
<style>body{font-family:${rtl ? "'Noto Naskh Arabic','Segoe UI',Tahoma" : "'Segoe UI',Inter,Arial"},sans-serif;margin:56px 64px;color:#161513;font-size:13.5px;line-height:1.7}
h1{font-size:20px;font-weight:600;margin:0 0 12px}h2{font-size:15.5px;margin:22px 0 8px}h3{font-size:14px}table{border-collapse:collapse;width:100%;margin:12px 0;font-size:12.5px}
th,td{border:1px solid #cfcac0;padding:6px 8px;text-align:${rtl ? "right" : "left"};vertical-align:top}th{background:#f3f1ec}.meta{color:#6c6860;font-size:11px;border-bottom:1px solid #e2ded6;padding-bottom:10px;margin-bottom:18px}</style></head>
<body><div class="meta">Marsa Al Noor Development Authority · ${doc.id}${doc.ref ? ` · ${doc.ref}` : ""} · ${doc.target === "en" ? "English translation — MNDA glossary applied" : "ترجمة عربية — وفق مسرد الهيئة"}</div>${html}</body></html>`);
    w.document.close();
    w.focus();
    w.print();
  }

  const dueTone = (d: QueueDoc) => {
    const days = (new Date(`${d.due}T15:00:00+04:00`).getTime() - new Date("2026-10-11T09:00:00+04:00").getTime()) / 86400000;
    return days < 1 ? "text-danger" : days < 3 ? "text-warning" : "text-muted-foreground";
  };

  return (
    <SolutionPage slug="06-arabic-documents" scenario={SCENARIO}>
      <div className="grid grid-cols-5 gap-3 max-xl:grid-cols-3 max-md:grid-cols-2">
        <MetricTile
          label={L({ en: "Segments", ar: "المقاطع" })}
          value={metrics?.segments ?? (live ? trans.length : "—")}
          sub={trans.length ? L({ en: `${accepted}/${trans.length} reviewed`, ar: `روجع ${accepted}/${trans.length}` }) : L({ en: "select & translate", ar: "اختر وترجم" })}
        />
        <MetricTile
          label={L({ en: "Glossary compliance", ar: "الالتزام بالمسرد" })}
          value={metrics?.compliancePct != null ? `${metrics.compliancePct}%` : "—"}
          tone={metrics?.compliancePct != null ? (metrics.compliancePct >= 95 ? "success" : "warning") : "default"}
          sub={metrics ? L({ en: `${metrics.termCompliant}/${metrics.termOccurrences} term uses · ${metrics.disputed} disputed`, ar: `${metrics.termCompliant}/${metrics.termOccurrences} استخدام · ${metrics.disputed} خلافي` }) : L({ en: `${terms.length} terms in glossary`, ar: `${terms.length} مصطلحاً في المسرد` })}
        />
        <MetricTile
          label={L({ en: "QA flags", ar: "ملاحظات الجودة" })}
          value={metrics?.flags ?? "—"}
          tone={metrics ? (metrics.highFlags ? "danger" : metrics.flags ? "warning" : "success") : "default"}
          sub={metrics ? L({ en: `${metrics.highFlags} high severity`, ar: `${metrics.highFlags} عالية الخطورة` }) : L({ en: "numbers · refs · tables · meaning", ar: "أرقام · مراجع · جداول · معنى" })}
        />
        <MetricTile
          label={L({ en: "Words translated", ar: "الكلمات المترجمة" })}
          value={metrics ? fmt.number(metrics.words) : "—"}
          sub={doc ? `${doc.source.toUpperCase()} → ${doc.target.toUpperCase()}` : ""}
        />
        <MetricTile
          label={L({ en: "Turnaround", ar: "زمن الإنجاز" })}
          value={metrics ? <span dir="auto">{L({ en: `${(metrics.ms / 1000).toFixed(1)} s`, ar: `${(metrics.ms / 1000).toFixed(1)} ث` })}</span> : live ? L({ en: "running", ar: "جارٍ" }) : "—"}
          tone={metrics ? "ai" : "default"}
          sub={L({ en: "baseline 4 days per document", ar: "خط الأساس 4 أيام للمستند" })}
        />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <div className="flex items-center justify-between border-b border-border">
          <TabsList variant="line" className="h-9">
            <TabsTrigger value="desk" className="px-3 text-[13px]">
              <Languages className="size-3.5" /> {L({ en: "Translation desk", ar: "مكتب الترجمة" })}
            </TabsTrigger>
            <TabsTrigger value="glossary" className="px-3 text-[13px]">
              <BookA className="size-3.5" /> {L({ en: "Glossary", ar: "المسرد" })}
              <span className="num text-[11px] text-muted-foreground">{terms.length}</span>
            </TabsTrigger>
          </TabsList>
          <Button variant="outline" size="sm" className="mb-1.5" onClick={() => setByo(true)}>
            <FilePlus2 /> {L({ en: "Bring your own", ar: "أضف مستندك" })}
          </Button>
        </div>

        <TabsContent value="desk">
          <Workbench cols="var(--ad-cols)" className="[--ad-cols:320px_minmax(0,1fr)_360px] max-2xl:[--ad-cols:264px_minmax(0,1fr)_296px]">
            <Pane title={L({ en: "Translation queue", ar: "قائمة الترجمة" })} subtitle={L({ en: `${docs.filter((d) => d.status !== "reviewed").length} open · MNDA glossary governs every job`, ar: `${docs.filter((d) => d.status !== "reviewed").length} مفتوحة · مسرد الهيئة يحكم كل مهمة` })} flush>
              <ul className="scrollbar-thin max-h-[780px] divide-y divide-border overflow-y-auto">
                {docs.map((d) => {
                  const s = summaries[d.id];
                  return (
                    <li key={d.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(d.id);
                          setView("review");
                        }}
                        className={cn("w-full px-4 py-3 text-start transition-colors hover:bg-muted/50", selected === d.id && "bg-ai-soft/50 hover:bg-ai-soft/60")}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[10.5px] text-muted-foreground">{d.id}</span>
                          <span className="rounded border border-border bg-card px-1.5 font-mono text-[10px]">
                            {d.source.toUpperCase()} → {d.target.toUpperCase()}
                          </span>
                        </div>
                        <div className="mt-1 line-clamp-2 text-[12.5px] leading-snug font-medium" dir="auto">
                          {lang === "ar" ? d.title_ar : d.title}
                        </div>
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          {lang === "ar" ? (d.type_ar ?? d.type) : d.type} · {lang === "ar" ? (d.requestedBy_ar ?? d.requestedBy) : d.requestedBy}
                        </div>
                        <div className="mt-1.5 flex items-center justify-between gap-2">
                          {d.status === "reviewed" ? (
                            <StatusPill tone="success">{L({ en: "Reviewed", ar: "مُراجع" })}</StatusPill>
                          ) : d.status === "in_review" ? (
                            <StatusPill tone="ai">{L({ en: "In review", ar: "قيد المراجعة" })}</StatusPill>
                          ) : (
                            <StatusPill tone={d.priority === "high" ? "warning" : "neutral"}>{d.priority === "high" ? L({ en: "Queued · high", ar: "بالانتظار · عاجل" }) : L({ en: "Queued", ar: "بالانتظار" })}</StatusPill>
                          )}
                          <span className={cn("num text-[10.5px]", dueTone(d))}>
                            {L({ en: "due", ar: "الاستحقاق" })} {fmt.date(d.due, { day: "numeric", month: "short" })}
                          </span>
                        </div>
                        {s && (
                          <div className="mt-1.5 text-[10.5px] text-muted-foreground">
                            <span className="num">{s.compliancePct ?? 100}%</span> {L({ en: "glossary", ar: "مسرد" })} · <span className="num">{s.flags}</span> {L({ en: "flags", ar: "ملاحظات" })} · <span className="num">{s.accepted}/{s.total}</span> {L({ en: "reviewed", ar: "روجع" })}
                          </div>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Pane>

            <Pane
              title={doc ? <span className="font-mono normal-case tracking-normal">{doc.id}{doc.ref ? ` · ${doc.ref}` : ""}</span> : L({ en: "Document", ar: "المستند" })}
              actions={
                doc && (
                  <div className="inline-flex items-center rounded-lg border border-border bg-surface p-0.5">
                    {(["review", "source", "preview"] as const).map((v) => (
                      <button key={v} type="button" onClick={() => setView(v)} className={cn("h-7 rounded-md px-2.5 text-[12px] font-medium", view === v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>
                        {v === "review" ? L({ en: "Review", ar: "المراجعة" }) : v === "source" ? L({ en: "Source", ar: "الأصل" }) : L({ en: "Preview", ar: "المعاينة" })}
                      </button>
                    ))}
                  </div>
                )
              }
              flush
              bodyClassName="flex flex-col"
              footer={
                run && !live ? (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-48 flex-1 items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full bg-success transition-all" style={{ width: `${trans.length ? (accepted / trans.length) * 100 : 0}%` }} />
                      </div>
                      <span className="num text-[11px] text-muted-foreground">
                        {accepted}/{trans.length}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Button size="sm" variant="outline" onClick={exportMd}>
                        <Download /> .md
                      </Button>
                      <Button size="sm" variant="outline" onClick={print}>
                        <Printer /> {L({ en: "Print", ar: "طباعة" })}
                      </Button>
                      <Button
                        size="sm"
                        disabled={accepted < trans.length || doc?.status === "reviewed" || busy === "complete"}
                        onClick={() =>
                          act("complete", async () => {
                            await review({ action: "complete" });
                            await refreshQueue();
                            toast.success(L({ en: "Review completed — ready to issue", ar: "اكتملت المراجعة — جاهز للإصدار" }));
                          })
                        }
                      >
                        {busy === "complete" ? <LoaderCircle className="animate-spin" /> : <ShieldCheck />}
                        {doc?.status === "reviewed" ? L({ en: "Reviewed", ar: "تمت المراجعة" }) : L({ en: "Mark reviewed", ar: "اعتماد المراجعة" })}
                      </Button>
                    </div>
                  </div>
                ) : undefined
              }
            >
              {!doc ? (
                <EmptyState icon={<FileText className="size-4" />} title={L({ en: "Select a document", ar: "اختر مستنداً" })} />
              ) : (
                <>
                  <div className="border-b border-border px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 max-w-2xl">
                        <h2 className="text-[17px] leading-snug font-light tracking-tight" dir="auto">
                          {lang === "ar" ? doc.title_ar || doc.title : doc.title}
                        </h2>
                        {doc.title_ar && doc.title_ar !== doc.title && (
                          <p className="mt-0.5 text-[13px] text-muted-foreground" dir={lang === "ar" ? "ltr" : "rtl"}>
                            {lang === "ar" ? doc.title : doc.title_ar}
                          </p>
                        )}
                        <p className="mt-1.5 text-[11.5px] text-muted-foreground" dir="auto">
                          {lang === "ar" ? (doc.requestedBy_ar ?? doc.requestedBy) : doc.requestedBy}
                          {doc.requestedByTitle ? (lang === "ar" ? `، ${doc.requestedByTitle_ar ?? doc.requestedByTitle}` : `, ${doc.requestedByTitle}`) : ""} · {lang === "ar" ? doc.purpose_ar || doc.purpose : doc.purpose}
                        </p>
                      </div>
                      {(run || live) && (
                        <RunButton running={live} onRun={translate} onStop={pipeline.abort} disabled={loading || !docText || (pipeline.running && !live)} icon={<Languages />}>
                          {run ? L({ en: "Re-translate", ar: "إعادة الترجمة" }) : L({ en: "Translate", ar: "ترجمة" })}
                        </RunButton>
                      )}
                    </div>
                    {(run || live) && view === "review" && (
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="inline-flex items-center rounded-lg border border-border bg-surface p-0.5">
                          {(
                            [
                              ["all", L({ en: "All", ar: "الكل" }), trans.length],
                              ["flagged", L({ en: "Flagged", ar: "معلّمة" }), trans.filter((s) => s.flags.some((f) => f.severity === "high" || f.severity === "medium")).length],
                              ["disputed", L({ en: "Disputed", ar: "خلافية" }), trans.filter((s) => s.flags.some((f) => f.kind === "disputed")).length],
                              ["pending", L({ en: "Pending", ar: "بانتظار المراجعة" }), trans.filter((s) => s.status === "pending").length],
                            ] as const
                          ).map(([k, label, n]) => (
                            <button key={k} type="button" onClick={() => setFilter(k)} className={cn("h-7 rounded-md px-2.5 text-[12px] font-medium", filter === k ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>
                              {label} <span className="num opacity-70">{n}</span>
                            </button>
                          ))}
                        </div>
                        {!live && run && (
                          <div className="flex items-center gap-1.5">
                            <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => act("recheck", async () => { await review({ action: "recheck" }); toast.success(L({ en: "Re-checked against the current glossary", ar: "أُعيد الفحص وفق المسرد الحالي" })); })} disabled={!!busy}>
                              {busy === "recheck" ? <LoaderCircle className="animate-spin" /> : <ScanText />} {L({ en: "Re-check", ar: "إعادة الفحص" })}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => act("accept", async () => { const j = await review({ action: "accept_clean" }); toast.success(L({ en: `${j.accepted} clean segments accepted`, ar: `قُبل ${j.accepted} مقطعاً سليماً` })); })} disabled={!!busy}>
                              {busy === "accept" ? <LoaderCircle className="animate-spin" /> : <CheckCheck />} {L({ en: "Accept all clean", ar: "قبول كل السليمة" })}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="scrollbar-thin h-[640px] overflow-y-auto">
                    {loading ? (
                      <div className="flex h-full items-center justify-center text-muted-foreground">
                        <LoaderCircle className="size-4 animate-spin" />
                      </div>
                    ) : view === "source" ? (
                      <div className="p-4">
                        <DocumentViewer markdown={docText} title={doc.title} height={600} className="bg-card" />
                      </div>
                    ) : view === "preview" ? (
                      run ? (
                        <div className="p-5">
                          <article className="mx-auto max-w-[760px] rounded-md border border-border bg-white/60 px-10 py-8 dark:bg-card">
                            <Markdown>{assemble(run.segments, "target")}</Markdown>
                          </article>
                        </div>
                      ) : (
                        <EmptyState icon={<FileText className="size-4" />} title={L({ en: "No translation yet", ar: "لا توجد ترجمة بعد" })} />
                      )
                    ) : segments.length ? (
                      <ReviewEditor
                        segments={segments}
                        source={doc.source}
                        target={doc.target}
                        terms={termMap}
                        streaming={live}
                        filter={filter}
                        onSave={async (id, patch) => {
                          try {
                            await review({ action: "segment", segmentId: id, ...patch });
                          } catch (e) {
                            toast.error((e as Error).message);
                          }
                        }}
                      />
                    ) : (
                      <EmptyState
                        icon={<Languages className="size-4" />}
                        title={L({ en: "Ready to translate", ar: "جاهز للترجمة" })}
                        action={
                          <RunButton running={false} onRun={translate} disabled={!docText || pipeline.running} icon={<Languages />}>
                            {L({ en: `Translate ${doc.source === "ar" ? "Arabic → English" : "English → Arabic"}`, ar: `ترجمة ${doc.source === "ar" ? "من العربية إلى الإنجليزية" : "من الإنجليزية إلى العربية"}` })}
                          </RunButton>
                        }
                      >
                        {L({
                          en: `${docText.length.toLocaleString()} characters. Headings, lists and tables are kept as structure; ${terms.length} glossary terms constrain the translation; numbers, dates and references are verified automatically.`,
                          ar: `${docText.length.toLocaleString()} حرفاً. تُحفظ العناوين والقوائم والجداول كبنية؛ ويقيد ${terms.length} مصطلحاً من المسرد الترجمة؛ وتُتحقق الأرقام والتواريخ والمراجع آلياً.`,
                        })}
                      </EmptyState>
                    )}
                  </div>
                  {run && (
                    <div ref={printRef} className="hidden">
                      <Markdown>{assemble(run.segments, "target")}</Markdown>
                    </div>
                  )}
                </>
              )}
            </Pane>

            <Pane title={L({ en: "Pipeline & terminology", ar: "المسار والمصطلحات" })} bodyClassName="scrollbar-thin max-h-[860px] space-y-5 overflow-y-auto">
              <AgentTrace
                run={pipeline}
                title={L({ en: "Translation pipeline", ar: "مسار الترجمة" })}
                emptyHint={
                  run
                    ? L({ en: `Last run ${fmt.date(run.createdAt, { day: "numeric", month: "short" })} ${fmt.time(run.createdAt)} · ${run.model?.split("/").pop() ?? ""}`, ar: `آخر تشغيل ${fmt.date(run.createdAt, { day: "numeric", month: "short" })} ${fmt.time(run.createdAt)} · ${run.model?.split("/").pop() ?? ""}` })
                    : L({ en: "Segment → match glossary → translate in parallel batches → automated checks → AI bilingual review.", ar: "التقسيم ← مطابقة المسرد ← الترجمة على دفعات متوازية ← الفحوص الآلية ← المراجعة ثنائية اللغة." })
                }
              />
              {segments.some((s) => s.target) && <QaSummary segments={segments} />}
              {doc && segments.length > 0 && (
                <TermPanel
                  key={doc.id}
                  docId={doc.id}
                  segments={segments}
                  candidates={candidates}
                  source={doc.source}
                  target={doc.target}
                  terms={termMap}
                  onGlossaryChanged={async () => {
                    await refreshGlossary();
                  }}
                  onApplyTerm={async (from, to) => {
                    try {
                      const j = await review({ action: "apply_term", from, to });
                      toast.success(L({ en: `Applied to ${j.changed} segment(s)`, ar: `طُبّق على ${j.changed} مقطعاً` }));
                      return j.changed as number;
                    } catch (e) {
                      toast.error((e as Error).message);
                      return 0;
                    }
                  }}
                />
              )}
            </Pane>
          </Workbench>
        </TabsContent>

        <TabsContent value="glossary">
          <GlossaryTab terms={terms} onTerms={setTerms} />
        </TabsContent>
      </Tabs>

      <ByoDialog
        open={byo}
        onOpenChange={setByo}
        onAdded={async (d) => {
          await refreshQueue();
          setSelected(d.id);
          setTab("desk");
          toast.success(L({ en: `${d.id} added to the queue`, ar: `أُضيف ${d.id} إلى القائمة` }));
        }}
      />
    </SolutionPage>
  );
}
