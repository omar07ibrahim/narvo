"use client";

import { useMemo, useState } from "react";
import { CalendarClock, Check, Gavel, LoaderCircle, RotateCcw, Send, Target, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Markdown } from "@/components/narvo/markdown";
import { RunButton } from "@/components/narvo/run-button";
import { ApprovalCard } from "@/components/narvo/approval-card";
import { EmptyState, ThinkingLines } from "@/components/narvo/empty";
import { StatusPill } from "@/components/narvo/status";
import type { NarvoRun } from "@/hooks/use-narvo-run";
import type { ApprovalSummary, Citation } from "@/lib/ai/events";
import { useFormat, useL, usePrefs } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { PEOPLE, REVIEW, metricById } from "../_lib/catalogue";
import { daysBetween, type ActionItem, type actionStats } from "../_lib/engine";
import { MiniStat, normCites } from "./bits";

export interface Proposal {
  title: string;
  rationale: string;
  owner: string;
  due: string;
  kpi: string;
  expectedEffect: string;
  priority: "high" | "medium";
  refs: number[];
}

type Stats = ReturnType<typeof actionStats>;

function personAr(name: string) {
  return PEOPLE.find((p) => p.name === name)?.ar ?? name;
}

function ProposalCard({
  p,
  index,
  citations,
  onCite,
  onApproved,
}: {
  p: Proposal;
  index: number;
  citations: Citation[];
  onCite: (n: number) => void;
  onApproved: () => void;
}) {
  const L = useL();
  const { lang, modelKey } = usePrefs();
  const f = useFormat();
  const [busy, setBusy] = useState(false);
  const [approval, setApproval] = useState<ApprovalSummary | null>(null);
  const kpi = p.kpi && p.kpi !== "none" ? metricById(p.kpi) : null;
  async function submit() {
    setBusy(true);
    try {
      const res = await fetch("/api/solutions/02-decision-intelligence/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...p, lang, modelKey }),
      });
      if (!res.ok) throw new Error(await res.text());
      const j = await res.json();
      setApproval(j.approval);
      toast.success(L({ en: "Sent to the Director General for approval", ar: "أُرسل إلى سعادة المدير العام للاعتماد" }), { description: j.actionId });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="num mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h4 className="text-[14px] leading-snug font-medium" dir="auto">
              {p.title}
            </h4>
            <StatusPill tone={p.priority === "high" ? "danger" : "warning"}>{p.priority === "high" ? L({ en: "High", ar: "عالية" }) : L({ en: "Medium", ar: "متوسطة" })}</StatusPill>
          </div>
          <Markdown citations={citations} onCite={onCite} className="mt-1.5 text-[12.5px] text-muted-foreground [&_p]:my-0">
            {normCites(p.rationale)}
          </Markdown>
          <div className="mt-3 grid grid-cols-3 gap-3 text-[12px] max-md:grid-cols-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <UserRound className="size-3.5" />
              <span className="truncate text-foreground">{lang === "ar" ? personAr(p.owner) : p.owner}</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <CalendarClock className="size-3.5" />
              <span className="num text-foreground">{f.date(p.due)}</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Target className="size-3.5" />
              <span className="truncate text-foreground">{kpi ? L(kpi.name) : "—"}</span>
            </div>
          </div>
          {p.expectedEffect && (
            <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground" dir="auto">
              <span className="label-caps me-1.5 !text-[9.5px]">{L({ en: "Expected effect", ar: "الأثر المتوقع" })}</span>
              {p.expectedEffect.replace(/\s*\[\d+\]/g, "")}
            </p>
          )}
          {!approval ? (
            <div className="mt-3">
              <Button size="sm" variant="outline" onClick={submit} disabled={busy}>
                {busy ? <LoaderCircle className="animate-spin" /> : <Send />}
                {L({ en: "Submit for DG approval", ar: "رفع لاعتماد المدير العام" })}
              </Button>
            </div>
          ) : (
            <ApprovalCard
              approval={approval}
              compact
              className="mt-3"
              onDecided={(s) => {
                setApproval({ ...approval, status: s });
                if (s === "approved") onApproved();
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export function ActionsTab({
  run,
  actions,
  stats,
  onPropose,
  onCite,
  refresh,
}: {
  run: NarvoRun;
  actions: ActionItem[];
  stats: Stats;
  onPropose: () => void;
  onCite: (n: number) => void;
  refresh: () => Promise<void>;
}) {
  const L = useL();
  const { lang } = usePrefs();
  const f = useFormat();
  const [filter, setFilter] = useState<"attention" | "open" | "done" | "all">("attention");
  const [busyId, setBusyId] = useState<string | null>(null);
  const proposals: Proposal[] = run.data.proposals ?? [];
  const citations: Citation[] = run.data.citations ?? [];

  const list = useMemo(() => {
    const today = REVIEW.today;
    const rows = actions.filter((a) =>
      filter === "all" ? true : filter === "done" ? a.status === "done" : filter === "open" ? a.status !== "done" : a.status !== "done" && (a.due < today || daysBetween(today, a.due) <= 7),
    );
    return rows.sort((a, b) => (a.status === "done" ? 1 : 0) - (b.status === "done" ? 1 : 0) || a.due.localeCompare(b.due));
  }, [actions, filter]);

  async function setStatus(a: ActionItem, status: "done" | "open") {
    setBusyId(a.id);
    try {
      const res = await fetch(`/api/solutions/02-decision-intelligence/actions/${a.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(await res.text());
      await refresh();
      toast.success(status === "done" ? L({ en: `${a.id} closed`, ar: `تم إغلاق ${a.id}` }) : L({ en: `${a.id} reopened`, ar: `أعيد فتح ${a.id}` }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="label-caps">{L({ en: "Decisions proposed for Monday's review", ar: "القرارات المقترحة لمراجعة يوم الاثنين" })}</h3>
          <RunButton running={run.running} onRun={onPropose} size="sm" variant={proposals.length ? "outline" : "default"} icon={<Gavel />}>
            {proposals.length ? L({ en: "Propose again", ar: "اقتراح مجدداً" }) : L({ en: "Propose decisions", ar: "اقتراح القرارات" })}
          </RunButton>
        </div>
        {run.running && !proposals.length && <ThinkingLines lines={5} />}
        {run.status === "error" && <div className="rounded-md border border-danger/25 bg-danger-soft p-3 text-[12.5px] text-danger">{run.error}</div>}
        {!run.running && !proposals.length && run.status !== "error" && (
          <EmptyState icon={<Gavel className="size-4" />} title={L({ en: "No proposals yet", ar: "لا توجد مقترحات بعد" })} className="py-8">
            {L({
              en: "The model reviews red KPIs, explicit requests in the department updates and blocked actions, and proposes decisions with an owner, a due date and the KPI they should move. Each goes to the Director General for approval.",
              ar: "يراجع النموذج المؤشرات الحمراء والطلبات الصريحة في تحديثات الإدارات والإجراءات المتعثرة، ويقترح قرارات بمسؤول وموعد ومؤشر مستهدف، وتُرفع كلها لاعتماد سعادة المدير العام.",
            })}
          </EmptyState>
        )}
        <div className="space-y-3">
          {proposals.map((p, i) => (
            <ProposalCard key={`${i}-${p.title}`} p={p} index={i} citations={citations} onCite={onCite} onApproved={refresh} />
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h3 className="label-caps">{L({ en: "Actions register", ar: "سجل الإجراءات" })}</h3>
          <ToggleGroup type="single" size="sm" variant="outline" value={filter} onValueChange={(v) => v && setFilter(v as typeof filter)}>
            <ToggleGroupItem value="attention" className="px-2.5 text-[12px]">
              {L({ en: "Needs attention", ar: "تحتاج متابعة" })}
            </ToggleGroupItem>
            <ToggleGroupItem value="open" className="px-2.5 text-[12px]">
              {L({ en: "Open", ar: "مفتوحة" })}
            </ToggleGroupItem>
            <ToggleGroupItem value="done" className="px-2.5 text-[12px]">
              {L({ en: "Closed", ar: "مغلقة" })}
            </ToggleGroupItem>
            <ToggleGroupItem value="all" className="px-2.5 text-[12px]">
              {L({ en: "All", ar: "الكل" })}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="mb-3 grid grid-cols-4 gap-4 rounded-lg border border-border bg-surface p-3.5 max-2xl:grid-cols-2">
          <MiniStat
            label={L({ en: "Action closure", ar: "إغلاق الإجراءات" })}
            value={stats.closureRate != null ? `${stats.closureRate.toFixed(0)}%` : "—"}
            sub={L({ en: `${stats.closedOnTime + stats.closedLate} of ${stats.due} due · target 83%`, ar: `${stats.closedOnTime + stats.closedLate} من ${stats.due} مستحقة · المستهدف 83%` })}
            tone={stats.closureRate != null && stats.closureRate >= 83 ? "success" : "warning"}
          />
          <MiniStat label={L({ en: "Overdue", ar: "متأخرة" })} value={stats.overdue} tone={stats.overdue ? "danger" : "success"} />
          <MiniStat label={L({ en: "Due in 7 days", ar: "مستحقة خلال 7 أيام" })} value={stats.dueSoon} />
          <MiniStat label={L({ en: "Closed on time", ar: "أُغلقت في موعدها" })} value={stats.closedOnTime} sub={L({ en: `${stats.closedLate} closed late`, ar: `${stats.closedLate} أُغلقت متأخرة` })} />
        </div>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full table-fixed text-[12.5px]">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-start">
                <th className="label-caps !text-[9.5px] px-3 py-2 text-start font-medium">{L({ en: "Action", ar: "الإجراء" })}</th>
                <th className="label-caps !text-[9.5px] w-24 px-3 py-2 text-start font-medium">{L({ en: "Due", ar: "الاستحقاق" })}</th>
                <th className="label-caps !text-[9.5px] w-28 px-3 py-2 text-start font-medium">{L({ en: "Status", ar: "الحالة" })}</th>
                <th className="w-24 px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.map((a) => {
                const overdue = a.status !== "done" && a.due < REVIEW.today;
                const late = a.status === "done" && a.closedAt && a.closedAt.slice(0, 10) > a.due;
                return (
                  <tr key={a.id} className={cn("align-top", a.source === "approved" && "bg-ai-soft/30")}>
                    <td className="min-w-0 px-3 py-2.5">
                      <div className="font-mono text-[10.5px] text-faint">{a.id}</div>
                      <div className="mt-0.5 leading-snug" dir="auto">
                        {lang === "ar" && a.titleAr ? a.titleAr : a.title}
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        <span className="text-foreground/80">{lang === "ar" ? personAr(a.owner) : a.owner}</span>
                        {" · "}
                        {a.raisedIn.replace("DG review — week", L({ en: "DG review — week", ar: "مراجعة المدير العام — الأسبوع" }))}
                        {a.kpi ? ` · ${L(metricById(a.kpi)?.name ?? { en: a.kpi, ar: a.kpi })}` : ""}
                      </div>
                    </td>
                    <td className={cn("num px-3 py-2.5 whitespace-nowrap", overdue && "text-danger")}>{f.date(a.due, { day: "numeric", month: "short" })}</td>
                    <td className="px-3 py-2.5">
                      {a.status === "done" ? (
                        <StatusPill tone={late ? "warning" : "success"}>{late ? L({ en: "Closed late", ar: "أُغلق متأخراً" }) : L({ en: "Closed", ar: "مغلق" })}</StatusPill>
                      ) : overdue ? (
                        <StatusPill tone="danger">{L({ en: `Overdue ${daysBetween(a.due, REVIEW.today)} d`, ar: `متأخر ${daysBetween(a.due, REVIEW.today)} يوم` })}</StatusPill>
                      ) : a.status === "in_progress" ? (
                        <StatusPill tone="info">{L({ en: "In progress", ar: "قيد التنفيذ" })}</StatusPill>
                      ) : (
                        <StatusPill tone="neutral">{L({ en: "Open", ar: "مفتوح" })}</StatusPill>
                      )}
                    </td>
                    <td className="px-3 py-2 text-end">
                      {a.status === "done" ? (
                        <Button size="xs" variant="ghost" className="text-muted-foreground" disabled={busyId === a.id} onClick={() => setStatus(a, "open")}>
                          {busyId === a.id ? <LoaderCircle className="animate-spin" /> : <RotateCcw />}
                          {L({ en: "Reopen", ar: "إعادة فتح" })}
                        </Button>
                      ) : (
                        <Button size="xs" variant="outline" disabled={busyId === a.id} onClick={() => setStatus(a, "done")}>
                          {busyId === a.id ? <LoaderCircle className="animate-spin" /> : <Check />}
                          {L({ en: "Close", ar: "إغلاق" })}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {list.length === 0 && <p className="p-4 text-[12.5px] text-muted-foreground">{L({ en: "Nothing in this view.", ar: "لا شيء في هذا العرض." })}</p>}
        </div>
      </section>
    </div>
  );
}
