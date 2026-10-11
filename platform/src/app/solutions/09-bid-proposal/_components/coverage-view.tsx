"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight, FileText, Search, ShieldAlert, UserRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { StatusPill, Confidence } from "@/components/narvo/status";
import { useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { CATEGORIES, CATEGORY_LABEL, type BidTask, type Coverage, type CoverageStatus, type EvidenceRef, type Requirement } from "../_lib/types";

export const STATUS_TONE: Record<CoverageStatus, "success" | "warning" | "danger"> = { met: "success", partial: "warning", missing: "danger" };
export const STATUS_LABEL: Record<CoverageStatus, { en: string; ar: string }> = {
  met: { en: "Evidenced", ar: "مستوفى" },
  partial: { en: "Partial", ar: "جزئي" },
  missing: { en: "Missing", ar: "مفقود" },
};

export function EvidenceChip({ e, onOpen }: { e: EvidenceRef; onOpen?: (docId: string) => void }) {
  const isAnswer = e.docId.startsWith("ANSWER-");
  return (
    <HoverCard openDelay={120} closeDelay={60}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          onClick={() => !isAnswer && onOpen?.(e.docId)}
          className={cn(
            "inline-flex max-w-full items-center gap-1 rounded border px-1.5 py-0.5 text-start text-[11px] transition-colors",
            isAnswer ? "border-ai/25 bg-ai-soft text-ai" : "border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground",
          )}
        >
          {isAnswer ? <UserRound className="size-3 shrink-0" /> : <FileText className="size-3 shrink-0" />}
          <span className="truncate">{isAnswer ? e.title : (e.ref ?? e.docId)}</span>
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="w-96 p-3" side="top">
        <div className="label-caps mb-1">{e.ref ?? e.docId}</div>
        <div className="text-[12.5px] font-medium leading-snug">{e.title}</div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">§ {e.section}</div>
        <p className="mt-2 border-s-2 border-ai/40 ps-2 text-[11.5px] leading-relaxed text-muted-foreground" dir="auto">
          “{e.quote}”
        </p>
      </HoverCardContent>
    </HoverCard>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .filter((p) => !/^(al|bin)$/i.test(p))
    .slice(0, 2)
    .map((p) => p[0])
    .join("");
}

export function CoverageView({
  requirements,
  coverage,
  tasks = [],
  running,
  onOpenDoc,
  rowActions,
  empty,
}: {
  requirements: Requirement[];
  coverage: Record<string, Coverage>;
  tasks?: BidTask[];
  running?: boolean;
  onOpenDoc?: (docId: string) => void;
  rowActions?: (r: Requirement, c: Coverage | undefined) => ReactNode;
  empty?: ReactNode;
}) {
  const L = useL();
  const [cat, setCat] = useState<string>("all");
  const [status, setStatus] = useState<"all" | CoverageStatus | "pending">("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c = { all: requirements.length, met: 0, partial: 0, missing: 0, pending: 0 };
    for (const r of requirements) {
      const s = coverage[r.id]?.status;
      if (!s) c.pending++;
      else c[s]++;
    }
    return c;
  }, [requirements, coverage]);

  const byCat = useMemo(
    () =>
      CATEGORIES.map((k) => {
        const rs = requirements.filter((r) => r.category === k);
        const met = rs.filter((r) => coverage[r.id]?.status === "met").length;
        const partial = rs.filter((r) => coverage[r.id]?.status === "partial").length;
        const missing = rs.filter((r) => coverage[r.id]?.status === "missing").length;
        return { k, total: rs.length, met, partial, missing };
      }).filter((x) => x.total > 0),
    [requirements, coverage],
  );

  const rows = requirements.filter((r) => {
    if (cat !== "all" && r.category !== cat) return false;
    const s = coverage[r.id]?.status ?? "pending";
    if (status !== "all" && s !== status) return false;
    if (q) {
      const t = `${r.id} ${r.title} ${r.text}`.toLowerCase();
      if (!t.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  const taskFor = (id: string) => tasks.filter((t) => t.reqId === id).sort((a, b) => b.createdAt - a.createdAt)[0];

  if (!requirements.length) return <>{empty}</>;

  return (
    <div className="flex flex-col gap-4">
      {/* coverage by category */}
      <div className="grid grid-cols-4 gap-x-6 gap-y-3 max-md:grid-cols-2">
        {byCat.map((c) => (
          <button
            key={c.k}
            type="button"
            onClick={() => setCat((v) => (v === c.k ? "all" : c.k))}
            className={cn("group text-start", cat !== "all" && cat !== c.k && "opacity-45")}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[11.5px] text-muted-foreground group-hover:text-foreground">{L(CATEGORY_LABEL[c.k])}</span>
              <span className="num text-[11px] text-muted-foreground">
                {c.met}/{c.total}
              </span>
            </div>
            <div className="mt-1.5 flex h-1 overflow-hidden rounded-full bg-muted">
              <span className="bg-success" style={{ width: `${(c.met / c.total) * 100}%` }} />
              <span className="bg-warning" style={{ width: `${(c.partial / c.total) * 100}%` }} />
              <span className="bg-danger/80" style={{ width: `${(c.missing / c.total) * 100}%` }} />
            </div>
          </button>
        ))}
      </div>

      {/* filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border border-border bg-surface p-0.5">
          {(["all", "met", "partial", "missing", "pending"] as const)
            .filter((k) => k !== "pending" || counts.pending > 0)
            .map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setStatus(k)}
                className={cn(
                  "rounded px-2.5 py-1 text-[12px] transition-colors",
                  status === k ? "bg-card font-medium text-foreground shadow-[0_0_0_1px_var(--border)]" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {k === "all" ? L({ en: "All", ar: "الكل" }) : k === "pending" ? L({ en: "Not mapped", ar: "غير مربوط" }) : L(STATUS_LABEL[k])}
                <span className="num ms-1.5 text-[11px] text-faint">{counts[k]}</span>
              </button>
            ))}
        </div>
        <Select value={cat} onValueChange={setCat}>
          <SelectTrigger size="sm" className="h-8 w-[190px] text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{L({ en: "All categories", ar: "كل الفئات" })}</SelectItem>
            {CATEGORIES.map((k) => (
              <SelectItem key={k} value={k}>
                {L(CATEGORY_LABEL[k])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative ms-auto w-56 max-md:w-full">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L({ en: "Search requirements…", ar: "ابحث في المتطلبات…" })} className="h-8 ps-8 text-[12px]" />
        </div>
      </div>

      {/* table */}
      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full table-fixed border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-border-strong bg-surface">
              <th className="label-caps !text-[9.5px] w-[64px] px-3 py-2 text-start font-medium">{L({ en: "Code", ar: "الرمز" })}</th>
              <th className="label-caps !text-[9.5px] px-3 py-2 text-start font-medium">{L({ en: "Requirement", ar: "المتطلب" })}</th>
              <th className="label-caps !text-[9.5px] w-[112px] px-3 py-2 text-start font-medium">{L({ en: "Coverage", ar: "التغطية" })}</th>
              <th className="label-caps !text-[9.5px] w-[30%] px-3 py-2 text-start font-medium max-md:hidden">{L({ en: "Evidence", ar: "الدليل" })}</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const c = coverage[r.id];
              const t = taskFor(r.id);
              const isOpen = open === r.id;
              return (
                <Fragment key={r.id}>
                  <tr
                    onClick={() => setOpen(isOpen ? null : r.id)}
                    className={cn("cursor-pointer border-b border-border align-top transition-colors hover:bg-muted/40", isOpen && "bg-muted/40")}
                  >
                    <td className="px-3 py-2.5">
                      <span className="font-mono text-[11px] font-medium">{r.id}</span>
                      {r.mandatory && <div className="mt-1 text-[9.5px] uppercase tracking-wider text-danger/80">{L({ en: "Pass/fail", ar: "إلزامي" })}</div>}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium leading-snug" dir="auto">
                        {r.title}
                      </div>
                      <div className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-muted-foreground" dir="auto">
                        {r.text}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      {c ? (
                        <div className="flex flex-col items-start gap-1">
                          <StatusPill tone={STATUS_TONE[c.status]}>{L(STATUS_LABEL[c.status])}</StatusPill>
                          {c.check && c.check.status !== "ok" && (
                            <span className={cn("inline-flex items-center gap-1 text-[10.5px]", c.check.status === "critical" ? "text-danger" : "text-warning")}>
                              <ShieldAlert className="size-3" />
                              {L({ en: "Computed check", ar: "فحص محسوب" })}
                            </span>
                          )}
                          {c.source === "contributor" && <span className="text-[10.5px] text-ai">{L({ en: "Contributor evidence", ar: "دليل من مساهم" })}</span>}
                        </div>
                      ) : running ? (
                        <span className="inline-block h-4 w-20 animate-pulse rounded bg-muted" />
                      ) : (
                        <span className="text-[11.5px] text-faint">{L({ en: "Not mapped", ar: "غير مربوط" })}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 max-md:hidden">
                      <div className="flex flex-wrap gap-1">
                        {c?.evidence.slice(0, 2).map((e, i) => (
                          <span key={i} onClick={(ev) => ev.stopPropagation()} className="max-w-full">
                            <EvidenceChip e={e} onOpen={onOpenDoc} />
                          </span>
                        ))}
                        {c && !c.evidence.length && <span className="text-[11.5px] text-faint">{L({ en: "No approved evidence", ar: "لا يوجد دليل معتمد" })}</span>}
                      </div>
                      {t && (
                        <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span className="flex size-4 items-center justify-center rounded-full bg-foreground text-[8px] font-medium text-background">{initials(t.owner)}</span>
                          <span className="truncate">{t.owner}</span>
                          <span className={cn("text-[10.5px]", t.status === "answered" ? "text-success" : "text-warning")}>
                            · {t.status === "answered" ? L({ en: "answered", ar: "أُجيبت" }) : L({ en: "task open", ar: "مهمة مفتوحة" })}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-3 text-faint">
                      <ChevronRight className={cn("size-3.5 transition-transform rtl:rotate-180", isOpen && "rotate-90 rtl:rotate-90")} />
                    </td>
                  </tr>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <tr className="border-b border-border bg-surface/70">
                        <td colSpan={5} className="p-0">
                          <motion.div initial={{ height: 0, opacity: 1 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6 px-4 py-4 max-md:grid-cols-1">
                              <div className="space-y-3">
                                <div>
                                  <div className="label-caps mb-1">{r.ref}</div>
                                  <p className="text-[12.5px] leading-relaxed" dir="auto">
                                    {r.text}
                                  </p>
                                </div>
                                <div>
                                  <div className="label-caps mb-1">{L({ en: "Evidence that satisfies it", ar: "الدليل المطلوب" })}</div>
                                  <p className="text-[12.5px] leading-relaxed text-muted-foreground" dir="auto">
                                    {r.evidenceNeeded}
                                  </p>
                                </div>
                                {rowActions?.(r, c)}
                              </div>
                              <div className="space-y-3">
                                {c ? (
                                  <>
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="label-caps">{L({ en: "AI judgement", ar: "تقييم الذكاء الاصطناعي" })}</span>
                                      <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                        {L(STATUS_LABEL[c.aiStatus])} <Confidence value={c.confidence} />
                                      </span>
                                    </div>
                                    <p className="text-[12.5px] leading-relaxed" dir="auto">
                                      {c.rationale}
                                    </p>
                                    {c.gap && (
                                      <p className="rounded-md border border-warning/25 bg-warning-soft/60 px-2.5 py-2 text-[12px] leading-relaxed text-foreground/85" dir="auto">
                                        <span className="font-medium">{L({ en: "Gap: ", ar: "الفجوة: " })}</span>
                                        {c.gap}
                                      </p>
                                    )}
                                    {c.check && (
                                      <p
                                        className={cn(
                                          "rounded-md border px-2.5 py-2 text-[12px] leading-relaxed",
                                          c.check.status === "critical" ? "border-danger/25 bg-danger-soft/60" : c.check.status === "warning" ? "border-warning/25 bg-warning-soft/50" : "border-success/20 bg-success-soft/50",
                                        )}
                                      >
                                        <span className="font-medium">{L({ en: "Computed check: ", ar: "فحص محسوب: " })}</span>
                                        {c.check.note}
                                      </p>
                                    )}
                                    {c.evidence.map((e, i) => (
                                      <blockquote key={i} className="border-s-2 border-ai/40 ps-3 text-[12px] leading-relaxed text-muted-foreground">
                                        <div className="mb-0.5 text-[11px] font-medium text-foreground/80">
                                          {e.title} <span className="font-normal text-faint">· § {e.section}</span>
                                        </div>
                                        <span dir="auto">“{e.quote}”</span>
                                      </blockquote>
                                    ))}
                                  </>
                                ) : (
                                  <p className="text-[12px] text-muted-foreground">{L({ en: "Run evidence mapping to judge this requirement.", ar: "شغّل ربط الأدلة لتقييم هذا المتطلب." })}</p>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        </td>
                      </tr>
                    )}
                  </AnimatePresence>
                </Fragment>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-[12.5px] text-muted-foreground">
                  {L({ en: "No requirements match these filters.", ar: "لا توجد متطلبات مطابقة لهذه المرشحات." })}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
