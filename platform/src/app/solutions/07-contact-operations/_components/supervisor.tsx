"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BookOpenCheck, Lightbulb, Quote, Radar, Search } from "lucide-react";
import { useNarvoRun } from "@/hooks/use-narvo-run";
import { useFormat, useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { ApprovalSummary, Citation } from "@/lib/ai/events";
import { Pane } from "@/components/narvo/pane";
import { AgentTrace } from "@/components/narvo/agent-trace";
import { Markdown } from "@/components/narvo/markdown";
import { ApprovalCard } from "@/components/narvo/approval-card";
import { MetricTile } from "@/components/narvo/metric";
import { StatusPill } from "@/components/narvo/status";
import { RunButton } from "@/components/narvo/run-button";
import { EmptyState, ThinkingLines } from "@/components/narvo/empty";
import { CHART, ChartTooltip, axisProps, gridProps } from "@/components/narvo/chart";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { INTENT_LABEL, SEPTEMBER_BASELINE, type ConsoleData, type Conversation, type Intent } from "../_lib/types";
import { ChannelIcon, channelLabel, fmtDuration } from "./bits";

interface Theme {
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  conversationIds: string[];
  count: number;
  quotes: Array<{ conversationId: string; quote: string; verified?: boolean }>;
  rootCause: string;
  impact: "high" | "medium" | "low";
  recommendation: string;
  knowledgeGap: boolean;
  handoffs: number;
  negative: number;
}
interface Article {
  title: string;
  titleAr: string;
  question: string;
  questionAr: string;
  answerEn: string;
  answerAr: string;
  rationale: string;
  placement: string;
  theme?: string;
}
interface ThemesCache {
  at: string;
  headline: string;
  themes: Theme[];
  analysed: number;
  article: Article;
  citations: Citation[];
  approvalId: string;
}

const INTENTS: Intent[] = ["housing_status", "permit_status", "documents", "appointment", "complaint", "maintenance", "other"];

export function Supervisor({ data, refresh }: { data: ConsoleData & { approvals?: Array<ApprovalSummary & { effects?: unknown }> }; refresh: () => void }) {
  const L = useL();
  const f = useFormat();
  const run = useNarvoRun();
  const [cache, setCache] = useState<ThemesCache | null>(null);
  const [open, setOpen] = useState<Conversation | null>(null);
  const [q, setQ] = useState("");
  const [fChannel, setFChannel] = useState("all");
  const [fIntent, setFIntent] = useState("all");
  const [fOutcome, setFOutcome] = useState("all");
  const [artLang, setArtLang] = useState<"en" | "ar">("en");

  useEffect(() => {
    fetch("/api/solutions/07-contact-operations/themes", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => j && setCache(j))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (run.status === "done") {
      refresh();
      fetch("/api/solutions/07-contact-operations/themes", { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => j && setCache(j))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.status]);

  const convs = data.conversations;
  const stats = useMemo(() => {
    const n = convs.length || 1;
    const ai = convs.filter((c) => c.handledBy === "ai" && (c.outcome === "resolved" || c.outcome === "in_progress")).length;
    const ho = convs.filter((c) => c.outcome.startsWith("handoff")).length;
    const ab = convs.filter((c) => c.outcome === "abandoned").length;
    const dur = convs.reduce((a, c) => a + c.durationSec, 0) / n;
    const rated = convs.filter((c) => c.csat != null);
    const csat = rated.reduce((a, c) => a + (c.csat ?? 0), 0) / (rated.length || 1);
    const neg = convs.filter((c) => c.sentiment === "negative").length;
    const intents = INTENTS.map((k) => {
      const count = convs.filter((c) => c.intent === k).length;
      return { key: k, label: L(INTENT_LABEL[k]), log: Math.round((count / n) * 1000) / 10, september: SEPTEMBER_BASELINE.intents[k], count };
    });
    const channels = (["phone", "whatsapp", "app_chat", "email"] as const).map((ch) => {
      const cs = convs.filter((c) => c.channel === ch);
      return {
        key: ch,
        label: channelLabel(ch, L),
        ai: cs.filter((c) => c.handledBy === "ai" && c.outcome !== "abandoned").length,
        handoff: cs.filter((c) => c.outcome.startsWith("handoff")).length,
        abandoned: cs.filter((c) => c.outcome === "abandoned").length,
      };
    });
    return { n: convs.length, ai, ho, ab, dur, csat, rated: rated.length, neg, intents, channels };
  }, [convs, L]);

  const filtered = convs.filter(
    (c) =>
      (fChannel === "all" || c.channel === fChannel) &&
      (fIntent === "all" || c.intent === fIntent) &&
      (fOutcome === "all" || c.outcome.startsWith(fOutcome)) &&
      (!q || `${c.id} ${c.summary} ${c.transcript.map((t) => t.text).join(" ")}`.toLowerCase().includes(q.toLowerCase())),
  );

  const themes: Theme[] = (run.data.themes as { themes: Theme[] } | undefined)?.themes ?? (run.running ? [] : (cache?.themes ?? []));
  const headline = (run.data.themes as { headline: string } | undefined)?.headline ?? (run.running ? "" : cache?.headline);
  const analysed = (run.data.themes as { analysed: number } | undefined)?.analysed ?? cache?.analysed ?? 0;
  const article = (run.data.article as Article | undefined) ?? (run.running ? undefined : cache?.article);
  const citations = (run.data.citations as Citation[] | undefined) ?? cache?.citations ?? [];
  const pendingApproval: ApprovalSummary | undefined =
    run.approvals[0] ?? (cache?.approvalId ? (data.approvals?.find((a) => a.id === cache.approvalId) as ApprovalSummary | undefined) : undefined);

  const openConv = (id: string) => {
    const c = convs.find((x) => x.id === id);
    if (c) setOpen(c);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-6 gap-3 max-xl:grid-cols-3 max-md:grid-cols-2">
        <MetricTile label={L({ en: "Contacts in log", ar: "الاتصالات في السجل" })} value={f.number(stats.n)} sub={L({ en: "5–9 Oct + live", ar: "5–9 أكتوبر + المباشر" })} />
        <MetricTile
          label={L({ en: "Resolved by AI", ar: "حُلّت بالذكاء الاصطناعي" })}
          value={`${Math.round((stats.ai / Math.max(stats.n, 1)) * 100)}%`}
          tone="ai"
          sub={L({ en: `vs ${SEPTEMBER_BASELINE.fcr}% FCR in Sept`, ar: `مقابل ${SEPTEMBER_BASELINE.fcr}% في سبتمبر` })}
        />
        <MetricTile label={L({ en: "Handed to agents", ar: "أحيلت لموظفين" })} value={`${Math.round((stats.ho / Math.max(stats.n, 1)) * 100)}%`} sub={`${stats.ho} ${L({ en: "contacts", ar: "اتصالات" })}`} />
        <MetricTile label={L({ en: "Avg handle time", ar: "متوسط مدة المعالجة" })} value={fmtDuration(stats.dur)} sub={L({ en: "minutes", ar: "دقائق" })} />
        <MetricTile label={L({ en: "CSAT", ar: "رضا المتعاملين" })} value={stats.csat.toFixed(2)} sub={`/ 5 · ${stats.rated} ${L({ en: "rated", ar: "تقييم" })}`} />
        <MetricTile
          label={L({ en: "Negative sentiment", ar: "مشاعر سلبية" })}
          value={`${Math.round((stats.neg / Math.max(stats.n, 1)) * 100)}%`}
          tone={stats.neg / Math.max(stats.n, 1) > 0.25 ? "warning" : "default"}
          sub={`${stats.neg} ${L({ en: "contacts", ar: "اتصالات" })}`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 rounded-lg border border-border bg-surface px-4 py-2.5 text-[12px] text-muted-foreground">
        <span className="label-caps">{L({ en: "September 2026 baseline", ar: "خط الأساس — سبتمبر 2026" })}</span>
        <span>
          <span className="num font-medium text-foreground">{f.number(SEPTEMBER_BASELINE.contacts)}</span> {L({ en: "contacts", ar: "اتصال" })}{" "}
          <span className="text-danger">+{SEPTEMBER_BASELINE.growth}%</span> {L({ en: "vs August", ar: "عن أغسطس" })}
        </span>
        <span>{L({ en: "Phone wait", ar: "انتظار الهاتف" })} <span className="num font-medium text-foreground">{SEPTEMBER_BASELINE.phoneWait}</span></span>
        <span>{L({ en: "Abandonment", ar: "الاتصالات المتروكة" })} <span className="num font-medium text-foreground">{SEPTEMBER_BASELINE.abandonment}%</span></span>
        <span>{L({ en: "Repeat within 7 days", ar: "التكرار خلال 7 أيام" })} <span className="num font-medium text-foreground">{SEPTEMBER_BASELINE.repeat7d}%</span></span>
        <span>{L({ en: "Cost per contact", ar: "تكلفة الاتصال" })} <span className="num font-medium text-foreground">AED {SEPTEMBER_BASELINE.costPerContact.toFixed(2)}</span></span>
      </div>

      <div className="grid grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-4 max-lg:grid-cols-1">
        <Pane title={L({ en: "Intent mix — contact log vs September", ar: "توزيع النوايا — السجل مقابل سبتمبر" })}>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.intents} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 0 }} barGap={2}>
                <CartesianGrid {...gridProps} horizontal={false} vertical />
                <XAxis type="number" {...axisProps} unit="%" />
                <YAxis type="category" dataKey="label" {...axisProps} width={150} />
                <Tooltip content={<ChartTooltip format={(v) => `${v}%`} />} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
                <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="log" name={L({ en: "This log", ar: "هذا السجل" })} fill={CHART.ai} radius={[0, 3, 3, 0]} barSize={8} />
                <Bar dataKey="september" name={L({ en: "September (28,940)", ar: "سبتمبر (28,940)" })} fill={CHART.faint} radius={[0, 3, 3, 0]} barSize={8} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Pane>
        <Pane title={L({ en: "Resolution by channel", ar: "الحل حسب القناة" })}>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.channels} margin={{ left: -16, right: 8, top: 4, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis {...axisProps} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
                <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="ai" stackId="a" name={L({ en: "Resolved by AI", ar: "حلها الذكاء الاصطناعي" })} fill={CHART.ai} barSize={26} />
                <Bar dataKey="handoff" stackId="a" name={L({ en: "Handoff to agent", ar: "إحالة لموظف" })} fill={CHART.ink} barSize={26} />
                <Bar dataKey="abandoned" stackId="a" name={L({ en: "Abandoned", ar: "متروك" })} fill={CHART.warning} radius={[3, 3, 0, 0]} barSize={26} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Pane>
      </div>

      {/* Theme discovery */}
      <Pane
        title={L({ en: "Emerging themes", ar: "المحاور الناشئة" })}
        subtitle={
          cache && !run.running
            ? `${L({ en: "Last analysis", ar: "آخر تحليل" })} ${f.date(cache.at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · ${analysed} ${L({ en: "transcripts", ar: "محادثة" })}`
            : L({ en: "The model clusters recent transcripts; counts and quotes are verified against the log", ar: "يجمّع النموذج المحادثات الأخيرة؛ ويُتحقق من الأعداد والاقتباسات مقابل السجل" })
        }
        actions={
          <RunButton running={run.running} onRun={() => run.start("/api/solutions/07-contact-operations/themes", {})} onStop={run.abort} icon={<Radar />} size="sm">
            {L({ en: "Find themes", ar: "اكتشف المحاور" })}
          </RunButton>
        }
      >
        <div className="grid grid-cols-[minmax(0,1fr)_400px] gap-5 max-xl:grid-cols-1">
          <div className="min-w-0">
            {headline && (
              <p className="mb-3 text-[15px] font-light leading-snug tracking-tight" dir="auto">
                {headline}
              </p>
            )}
            {!themes.length && !run.running && (
              <EmptyState icon={<Lightbulb className="size-4" />} title={L({ en: "No analysis yet", ar: "لا يوجد تحليل بعد" })}>
                {L({
                  en: "Find themes reads every transcript in the log (Arabic, English, mixed), groups recurring confusions and proposes a knowledge update for approval.",
                  ar: "تقرأ ميزة اكتشاف المحاور كل محادثة في السجل (عربي وإنجليزي ومختلط)، وتجمع أوجه الالتباس المتكررة، وتقترح تحديثاً للمعرفة للاعتماد.",
                })}
              </EmptyState>
            )}
            {run.running && !themes.length && <ThinkingLines lines={6} />}
            <div className="grid grid-cols-2 gap-3 max-lg:grid-cols-1">
              {themes.map((t, i) => (
                <div key={t.title} className="rounded-lg border border-border bg-surface p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-medium leading-snug">{L({ en: t.title, ar: t.titleAr })}</div>
                      <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                        <span className="num font-medium text-foreground">{t.count}</span> / {analysed} {L({ en: "conversations", ar: "محادثة" })}
                        {t.handoffs > 0 && ` · ${t.handoffs} ${L({ en: "handoffs", ar: "إحالات" })}`}
                        {t.negative > 0 && ` · ${t.negative} ${L({ en: "negative", ar: "سلبية" })}`}
                      </div>
                    </div>
                    <StatusPill tone={t.impact === "high" ? "danger" : t.impact === "medium" ? "warning" : "neutral"}>{t.impact}</StatusPill>
                  </div>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                    <div className={cn("h-full rounded-full", i === 0 ? "bg-ai" : "bg-foreground/60")} style={{ width: `${Math.min(100, (t.count / Math.max(analysed, 1)) * 100 * 2.5)}%` }} />
                  </div>
                  <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground" dir="auto">
                    {L({ en: t.description, ar: t.descriptionAr })}
                  </p>
                  {t.quotes.slice(0, 2).map((qq) => (
                    <button
                      key={qq.quote}
                      type="button"
                      onClick={() => openConv(qq.conversationId)}
                      className="mt-2 flex w-full items-start gap-1.5 rounded-md border-s-2 border-ai/40 bg-card px-2 py-1.5 text-start text-[12px] hover:bg-muted/60"
                    >
                      <Quote className="mt-0.5 size-3 shrink-0 text-faint" />
                      <span className="min-w-0 flex-1" dir="auto">
                        {qq.quote}
                        <span className="ms-1.5 font-mono text-[10px] text-faint">{qq.conversationId}</span>
                      </span>
                    </button>
                  ))}
                  <div className="mt-2.5 text-[11.5px]">
                    <span className="text-muted-foreground">{L({ en: "Root cause", ar: "السبب الجذري" })}: </span>
                    {t.rootCause}
                  </div>
                  <div className="mt-1 text-[11.5px]">
                    <span className="text-muted-foreground">{L({ en: "Recommendation", ar: "التوصية" })}: </span>
                    {t.recommendation}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="min-w-0 space-y-4">
            {(run.running || run.trace.length > 0) && <AgentTrace run={run} title={L({ en: "Analysis trace", ar: "مسار التحليل" })} />}
            {article ? (
              <div className="rounded-lg border border-ai/25 bg-card p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="label-caps flex items-center gap-1.5 !text-ai">
                    <BookOpenCheck className="size-3.5" />
                    {L({ en: "Proposed FAQ update", ar: "تحديث مقترح للأسئلة الشائعة" })}
                  </span>
                  <ToggleGroup type="single" size="sm" variant="outline" value={artLang} onValueChange={(v) => v && setArtLang(v as "en" | "ar")}>
                    <ToggleGroupItem value="en" className="px-2 text-[11px]">EN</ToggleGroupItem>
                    <ToggleGroupItem value="ar" className="px-2 text-[11px]">ع</ToggleGroupItem>
                  </ToggleGroup>
                </div>
                <div className="mt-2 text-[14px] font-medium leading-snug" dir={artLang === "ar" ? "rtl" : "ltr"}>
                  {artLang === "ar" ? article.questionAr : article.question}
                </div>
                <Markdown citations={citations} className="mt-1.5" streaming={run.running && !run.approvals.length}>
                  {artLang === "ar" ? article.answerAr : article.answerEn}
                </Markdown>
                <div className="mt-3 space-y-1 border-t border-border pt-2.5 text-[11.5px] text-muted-foreground">
                  <div>
                    <span className="font-medium text-foreground">{L({ en: "Why", ar: "السبب" })}: </span>
                    {article.rationale}
                  </div>
                  <div>
                    <span className="font-medium text-foreground">{L({ en: "Publish to", ar: "مكان النشر" })}: </span>
                    {article.placement}
                  </div>
                </div>
                {pendingApproval && (
                  <ApprovalCard
                    key={pendingApproval.id}
                    approval={pendingApproval}
                    className="mt-3"
                    onDecided={(st) => {
                      run.markApproval(pendingApproval.id, st);
                      refresh();
                    }}
                  />
                )}
              </div>
            ) : run.running ? (
              <div className="rounded-lg border border-border p-3.5">
                <ThinkingLines lines={5} />
              </div>
            ) : null}
            {data.kbDrafts.length > 0 && (
              <div>
                <div className="label-caps mb-2">{L({ en: "Knowledge drafts", ar: "مسودات المعرفة" })}</div>
                <ul className="space-y-2">
                  {data.kbDrafts.map((d) => (
                    <li key={d.id} className="rounded-md border border-success/25 bg-success-soft/50 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12.5px] font-medium">{L({ en: d.title, ar: d.titleAr ?? d.title })}</span>
                        <span className="font-mono text-[10px] text-faint">{d.id}</span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-success">{d.status}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </Pane>

      {/* Contact log */}
      <Pane
        title={L({ en: "Contact log", ar: "سجل الاتصالات" })}
        subtitle={`${filtered.length} / ${convs.length}`}
        flush
        actions={
          <div className="flex items-center gap-1.5">
            <div className="relative">
              <Search className="absolute start-2 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L({ en: "Search transcripts", ar: "ابحث في المحادثات" })} className="h-7 w-44 ps-7 text-[12px]" />
            </div>
            <MiniSelect value={fChannel} onChange={setFChannel} options={[["all", L({ en: "All channels", ar: "كل القنوات" })], ["phone", channelLabel("phone", L)], ["whatsapp", "WhatsApp"], ["app_chat", channelLabel("app_chat", L)], ["email", channelLabel("email", L)]]} />
            <MiniSelect value={fIntent} onChange={setFIntent} options={[["all", L({ en: "All intents", ar: "كل النوايا" })], ...INTENTS.map((k) => [k, L(INTENT_LABEL[k])] as [string, string])]} />
            <MiniSelect value={fOutcome} onChange={setFOutcome} options={[["all", L({ en: "All outcomes", ar: "كل النتائج" })], ["resolved", L({ en: "Resolved", ar: "تم الحل" })], ["handoff", L({ en: "Handoff", ar: "إحالة" })], ["abandoned", L({ en: "Abandoned", ar: "متروك" })], ["in_progress", L({ en: "Live", ar: "مباشر" })]]} />
          </div>
        }
      >
        <div className="scrollbar-thin max-h-[440px] overflow-auto">
          <table className="w-full text-[12.5px]">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border text-start">
                {[
                  L({ en: "Contact", ar: "الاتصال" }),
                  L({ en: "When", ar: "الوقت" }),
                  L({ en: "Intent", ar: "النية" }),
                  L({ en: "Summary", ar: "الملخص" }),
                  L({ en: "Lang", ar: "اللغة" }),
                  L({ en: "Outcome", ar: "النتيجة" }),
                  L({ en: "Duration", ar: "المدة" }),
                  "CSAT",
                ].map((h) => (
                  <th key={h} className="label-caps !text-[9.5px] px-3 py-2 text-start font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} onClick={() => setOpen(c)} className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/40">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <ChannelIcon channel={c.channel} className="text-muted-foreground" />
                      <span className="font-mono text-[11px]">{c.id}</span>
                      {c.live && <StatusPill tone="ai" dot>{L({ en: "live", ar: "مباشر" })}</StatusPill>}
                    </div>
                  </td>
                  <td className="num px-3 py-2 whitespace-nowrap text-muted-foreground">{f.date(c.startedAt, { weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{L(INTENT_LABEL[c.intent] ?? INTENT_LABEL.other)}</td>
                  <td className="max-w-[340px] px-3 py-2">
                    <span className="line-clamp-1 text-muted-foreground" dir="auto">{c.summary}</span>
                  </td>
                  <td className="px-3 py-2 uppercase text-muted-foreground">{c.language}</td>
                  <td className="px-3 py-2">
                    <StatusPill tone={c.outcome === "resolved" ? "success" : c.outcome.startsWith("handoff") ? "info" : c.outcome === "abandoned" ? "warning" : "ai"}>
                      {c.outcome === "resolved"
                        ? c.handledBy === "ai"
                          ? L({ en: "AI resolved", ar: "حلها الذكاء الاصطناعي" })
                          : L({ en: "Resolved", ar: "تم الحل" })
                        : c.outcome === "handoff_resolved"
                          ? L({ en: "Agent resolved", ar: "حلها موظف" })
                          : c.outcome === "handoff_open"
                            ? L({ en: "With agent", ar: "لدى موظف" })
                            : c.outcome === "abandoned"
                              ? L({ en: "Abandoned", ar: "متروك" })
                              : L({ en: "In progress", ar: "جارٍ" })}
                    </StatusPill>
                  </td>
                  <td className="num px-3 py-2 text-muted-foreground">{fmtDuration(c.durationSec)}</td>
                  <td className="num px-3 py-2">{c.csat ?? <span className="text-faint">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Pane>

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent side="right" className="w-[520px] sm:max-w-[520px]">
          {open && (
            <>
              <SheetHeader className="border-b border-border">
                <div className="label-caps flex items-center gap-1.5">
                  <ChannelIcon channel={open.channel} />
                  {channelLabel(open.channel, L)} · {open.id}
                </div>
                <SheetTitle className="text-base font-light tracking-tight" dir="auto">{open.summary}</SheetTitle>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <StatusPill tone="neutral" dot={false}>{L(INTENT_LABEL[open.intent] ?? INTENT_LABEL.other)}</StatusPill>
                  <StatusPill tone={open.sentiment === "negative" ? "danger" : open.sentiment === "positive" ? "success" : "neutral"}>{open.sentiment}</StatusPill>
                  <StatusPill tone="neutral" dot={false}>{fmtDuration(open.durationSec)}</StatusPill>
                  {open.csat != null && <StatusPill tone="neutral" dot={false}>CSAT {open.csat}/5</StatusPill>}
                </div>
              </SheetHeader>
              <div className="scrollbar-thin flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
                {open.transcript.map((t, i) =>
                  t.role === "system" ? (
                    <div key={i} className="text-center text-[11px] text-muted-foreground">{t.text}</div>
                  ) : (
                    <div key={i} className={cn("flex", t.role === "customer" ? "justify-start" : "justify-end")}>
                      <div className={cn("max-w-[85%] rounded-lg px-3 py-2 text-[12.5px] leading-relaxed", t.role === "customer" ? "bg-muted" : t.role === "agent" ? "border border-info/20 bg-info-soft" : "border border-border bg-card")}>
                        <div className={cn("mb-0.5 text-[10px]", t.role === "assistant" ? "text-ai" : t.role === "agent" ? "text-info" : "text-muted-foreground")}>
                          {t.role === "customer" ? L({ en: "Customer", ar: "المتعامل" }) : t.role === "assistant" ? L({ en: "AI assistant", ar: "المساعد الذكي" }) : (t.author ?? L({ en: "Agent", ar: "الموظف" }))}
                        </div>
                        <p className="whitespace-pre-wrap" dir="auto">{t.text.replace(/\[\d+\]/g, "")}</p>
                      </div>
                    </div>
                  ),
                )}
                {!!open.actions.length && (
                  <div className="rounded-md border border-border p-2.5">
                    <div className="label-caps mb-1">{L({ en: "Actions", ar: "الإجراءات" })}</div>
                    {open.actions.map((a) => (
                      <div key={a} className="text-[12px] text-muted-foreground">— {a}</div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function MiniSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: Array<[string, string]> }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" className="h-7 w-auto min-w-28 text-[12px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(([v, l]) => (
          <SelectItem key={v} value={v} className="text-[12.5px]">
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
