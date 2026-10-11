"use client";

import { motion } from "motion/react";
import { ArrowRight, ClipboardList, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFormat, useL, usePrefs } from "@/lib/i18n";
import type { NarvoRun } from "@/hooks/use-narvo-run";
import type { Citation } from "@/lib/ai/events";
import { Markdown } from "@/components/narvo/markdown";
import { RunButton } from "@/components/narvo/run-button";
import { StatusPill, type Tone } from "@/components/narvo/status";
import { EmptyState, ThinkingLines } from "@/components/narvo/empty";
import { Avatar, Block, ErrorBox, normCites, SourceChips, timeAgoLabel, personName } from "./bits";
import { shortName } from "./pipeline";
import type { Account, CachedResult, Handover, HandoverAnalysis, Interaction, Opportunity } from "../_lib/types";

const STATUS_TONE: Record<string, Tone> = { open: "info", disputed: "danger", overdue: "warning", expired: "neutral", fulfilled: "success" };
const STATUS_LABEL: Record<string, { en: string; ar: string }> = {
  open: { en: "Open", ar: "مفتوح" },
  disputed: { en: "Disputed", ar: "متنازع عليه" },
  overdue: { en: "Overdue", ar: "متأخر" },
  expired: { en: "Expired", ar: "منتهٍ" },
  fulfilled: { en: "Done", ar: "منجز" },
};

export function HandoverTab({
  opp,
  handover,
  note,
  accounts,
  run,
  cached,
  onRun,
  onCite,
}: {
  opp: Opportunity;
  handover: Handover | null;
  note: Interaction | null;
  accounts: Account[];
  run: NarvoRun;
  cached?: CachedResult;
  onRun: () => void;
  onCite: (n: number) => void;
}) {
  const L = useL();
  const f = useFormat();
  const { lang } = usePrefs();
  const live = run.status !== "idle";
  const analysis = (live ? run.data.analysis : cached?.data) as HandoverAnalysis | undefined;
  const text = live ? (run.text.pack ?? "") : (cached?.text ?? "");
  const citations = (live ? run.data.citations : cached?.citations) as Citation[] | undefined;
  const moved = handover ? accounts.filter((a) => handover.accountIds.includes(a.id)) : [];

  return (
    <div className="space-y-4">
      {handover ? (
        <Block label={L({ en: `Ownership change · ${handover.id}`, ar: `تغيير المسؤول · ${handover.id}` })}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Avatar name={handover.from} tone="muted" className="size-8 text-[11px]" />
              <div className="text-[12.5px] leading-tight">
                <div className="font-medium">{personName(handover.from, L)}</div>
                <div className="text-[11px] text-muted-foreground">{L({ en: "Outgoing KAM", ar: "المسؤول السابق" })}</div>
              </div>
            </div>
            <ArrowRight className="size-4 text-faint rtl:rotate-180" />
            <div className="flex items-center gap-2">
              <Avatar name={handover.to} className="size-8 text-[11px]" />
              <div className="text-[12.5px] leading-tight">
                <div className="font-medium">{personName(handover.to, L)}</div>
                <div className="text-[11px] text-muted-foreground">{L({ en: "Incoming KAM", ar: "المسؤولة الجديدة" })}</div>
              </div>
            </div>
            <div className="ms-auto text-end text-[11.5px] text-muted-foreground">
              <div>
                {L({ en: "Effective", ar: "اعتباراً من" })} <span className="num text-foreground">{f.date(handover.effective)}</span>
              </div>
              <div>
                {L({ en: "Approved by", ar: "اعتمده" })} <span className="text-foreground">{personName(handover.approvedBy, L)}</span>
              </div>
            </div>
          </div>
          <p className="mt-3 text-[12px] text-muted-foreground">{L({ en: handover.reason, ar: handover.reasonAr ?? handover.reason })}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {moved.map((a) => (
              <span key={a.id} className={cn("rounded border border-border px-1.5 py-0.5 text-[11px]", a.id === opp.accountId ? "border-ai/40 bg-ai-soft text-ai" : "text-muted-foreground")} dir="auto">
                {shortName(L({ en: a.name, ar: a.nameAr }))}
              </span>
            ))}
          </div>
          {note && (
            <div className="mt-3 rounded-md border border-dashed border-border-strong bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="label-caps !text-[9.5px]">{L({ en: "Handover note as submitted", ar: "مذكرة التسليم كما قُدمت" })}</span>
                <StatusPill tone="warning">{L({ en: "Incomplete", ar: "ناقصة" })}</StatusPill>
              </div>
              <p className="mt-1.5 text-[12.5px] leading-relaxed whitespace-pre-line" dir="auto">
                {note.body}
              </p>
              <div className="mt-1.5 text-[11px] text-muted-foreground">
                {note.from} · <span className="num">{f.date(note.at)}</span>
              </div>
            </div>
          )}
        </Block>
      ) : (
        <Block label={L({ en: "Ownership", ar: "المسؤولية" })}>
          <p className="text-[12.5px] text-muted-foreground">
            {L({
              en: `No ownership change on this account — ${opp.owner} has owned it throughout. A coverage pack can still be prepared (e.g. for leave cover).`,
              ar: `لا يوجد تغيير في المسؤول عن هذا الحساب — ${personName(opp.owner, L)} مسؤول عنه منذ البداية. يمكن مع ذلك إعداد حزمة تغطية (مثلاً أثناء الإجازة).`,
            })}
          </p>
        </Block>
      )}

      <Block
        label={L({ en: "Handover pack", ar: "حزمة التسليم" })}
        actions={
          <RunButton running={run.running} onRun={onRun} onStop={run.abort} size="sm" icon={<Sparkles className="size-3.5" />} variant={analysis ? "outline" : "default"}>
            {analysis ? L({ en: "Rebuild", ar: "إعادة الإعداد" }) : L({ en: "Build handover pack", ar: "إعداد حزمة التسليم" })}
          </RunButton>
        }
      >
        {run.status === "error" && <ErrorBox message={run.error} onRetry={onRun} />}
        {!analysis && run.running && <ThinkingLines lines={6} />}
        {!analysis && !run.running && run.status !== "error" && (
          <EmptyState icon={<ClipboardList className="size-4" />} title={L({ en: "What must the new owner know?", ar: "ما الذي يجب أن يعرفه المسؤول الجديد؟" })}>
            {L({
              en: "NARVO reconstructs every promise, hint and deadline from the record, shows what the handover note left out, and writes a pack the new owner can act on.",
              ar: "يعيد نارفو بناء كل وعد وتلميح وموعد من السجل، ويبيّن ما أغفلته مذكرة التسليم، ويكتب حزمة يمكن للمسؤول الجديد العمل بها.",
            })}
          </EmptyState>
        )}
        {analysis && (
          <motion.div initial={{ opacity: 1 }} animate={{ opacity: 1 }} className="space-y-4">
            <div>
              <div className="label-caps mb-2 !text-[9.5px]">{L({ en: `Commitments on record · ${analysis.commitments.length}`, ar: `الالتزامات في السجل · ${analysis.commitments.length}` })}</div>
              <div className="overflow-hidden rounded-md border border-border">
                <table className="w-full text-[12.5px]">
                  <tbody>
                    {analysis.commitments.map((c, i) => (
                      <tr key={i} className="border-b border-border align-top last:border-0">
                        <td className="w-[92px] px-3 py-2">
                          <StatusPill tone={STATUS_TONE[c.status] ?? "neutral"}>{L(STATUS_LABEL[c.status] ?? { en: c.status, ar: c.status })}</StatusPill>
                        </td>
                        <td className="px-3 py-2">
                          <div dir="auto">
                            {c.commitment} <SourceChips ids={c.sources} onClick={onCite} />
                          </div>
                          <div className="mt-0.5 text-[11px] text-muted-foreground" dir="auto">
                            {c.madeBy} → {c.madeTo} · <span className="num">{c.date}</span>
                          </div>
                          {c.risk && (
                            <div className="mt-0.5 text-[11.5px] text-warning" dir="auto">
                              {c.risk}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 max-lg:grid-cols-1">
              <div className="rounded-md border border-danger/20 bg-danger-soft/40 p-3">
                <div className="label-caps mb-1.5 !text-[9.5px]">{L({ en: "Missing from the handover note", ar: "ما أغفلته مذكرة التسليم" })}</div>
                <ul className="space-y-1.5 text-[12.5px]">
                  {analysis.gaps.map((g, i) => (
                    <li key={i} className="flex gap-1.5" dir="auto">
                      <span className="mt-1.5 size-1 shrink-0 rounded-full bg-danger" />
                      <span>
                        {g.gap} <SourceChips ids={g.sources} onClick={onCite} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-md border border-border p-3">
                <div className="label-caps mb-1.5 !text-[9.5px]">{L({ en: "Critical dates", ar: "المواعيد الحاسمة" })}</div>
                <ol className="relative space-y-2 ps-4 before:absolute before:start-[3px] before:top-1 before:bottom-1 before:w-px before:bg-border">
                  {analysis.deadlines.map((d, i) => (
                    <li key={i} className="relative text-[12.5px]">
                      <span className="absolute -start-4 top-1.5 size-[7px] rounded-full border border-border-strong bg-card" />
                      <span className="num font-medium">{/^\d{4}-\d{2}-\d{2}$/.test(d.date) ? f.date(d.date, { day: "numeric", month: "short" }) : d.date}</span>
                      <span className="text-muted-foreground" dir="auto">
                        {" "}
                        — {d.what}
                      </span>{" "}
                      <SourceChips ids={d.sources} onClick={onCite} />
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </motion.div>
        )}
        {(text || (run.running && analysis)) && (
          <div className="mt-4 border-t border-border pt-4">
            {text ? <Markdown citations={citations} onCite={onCite} streaming={run.running}>{normCites(text)}</Markdown> : <ThinkingLines lines={5} />}
          </div>
        )}
        {!live && cached && <div className="mt-3 text-[11px] text-muted-foreground">{timeAgoLabel(cached.at, lang)}</div>}
      </Block>
    </div>
  );
}
