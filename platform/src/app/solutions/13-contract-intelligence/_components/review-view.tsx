"use client";

import { useState } from "react";
import { Check, ChevronDown, FileText, Gavel, ScrollText, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { RunButton } from "@/components/narvo/run-button";
import { StatusPill } from "@/components/narvo/status";
import { FileDrop } from "@/components/narvo/file-drop";
import { ApprovalCard } from "@/components/narvo/approval-card";
import { EmptyState, ThinkingLines } from "@/components/narvo/empty";
import type { NarvoRun } from "@/hooks/use-narvo-run";
import { useFormat, useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { ContractState, Finding, Playbook, Review } from "../_lib/types";

const RISK = { high: "danger", medium: "warning", low: "neutral" } as const;

export function ReviewView({
  state,
  playbook,
  target,
  byoTargets,
  onTarget,
  run,
  onRun,
  onRunText,
  onDecide,
  onSendRedlines,
  onExtract,
  onOpenDoc,
  onDecided,
}: {
  state: ContractState;
  playbook: Playbook;
  target: string;
  byoTargets: Array<{ id: string; name: string }>;
  onTarget: (id: string) => void;
  run: NarvoRun;
  onRun: (id: string) => void;
  onRunText: (name: string, text: string) => void;
  onDecide: (contractId: string, positionId: string, decision: Finding["decision"] | null) => Promise<void>;
  onSendRedlines: (contractId: string) => Promise<void>;
  onExtract: (id: string) => void;
  onOpenDoc: (id: string) => void;
  onDecided: () => void;
}) {
  const L = useL();
  const f = useFormat();
  const [filter, setFilter] = useState<"all" | "dev" | "high">("dev");
  const [byo, setByo] = useState(false);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const withText = state.contracts.filter((c) => c.file);
  const review: Review | undefined = state.reviews[target];
  const findings = (review?.findings ?? []).filter((x) => (filter === "all" ? true : filter === "high" ? x.status !== "compliant" && x.risk === "high" : x.status !== "compliant"));
  const devs = review?.findings.filter((x) => x.status !== "compliant") ?? [];
  const accepted = devs.filter((x) => x.decision === "accepted").length;
  const decided = devs.filter((x) => x.decision).length;
  const approval = review?.approvalId ? state.approvals.find((a) => a.id === review.approvalId) : undefined;
  const reviewing = run.running;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={target} onValueChange={onTarget}>
          <SelectTrigger size="sm" className="h-8 w-[360px] max-w-full text-[12.5px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {withText.map((c) => (
              <SelectItem key={c.id} value={c.id} className="text-[12.5px]">
                {c.ref} — {c.counterparty}
              </SelectItem>
            ))}
            {byoTargets.map((b) => (
              <SelectItem key={b.id} value={b.id} className="text-[12.5px]">
                {L({ en: "Uploaded", ar: "مرفوع" })} — {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <RunButton size="sm" running={reviewing} onRun={() => onRun(target)} icon={<ScrollText />}>
          {review ? L({ en: "Re-run review", ar: "إعادة المراجعة" }) : L({ en: "Review against playbook", ar: "مراجعة مقابل دليل المواقف" })}
        </RunButton>
        <Button size="sm" variant="ghost" onClick={() => onOpenDoc(target)}>
          <FileText /> {L({ en: "Open text", ar: "فتح النص" })}
        </Button>
        <Button size="sm" variant={byo ? "secondary" : "ghost"} className="ms-auto" onClick={() => setByo((v) => !v)}>
          <Upload /> {L({ en: "Review your own contract", ar: "راجع عقدك الخاص" })}
        </Button>
      </div>

      {byo && (
        <div className="grid grid-cols-[minmax(0,1fr)_260px] gap-3 rounded-lg border border-dashed border-border-strong bg-surface p-3 max-lg:grid-cols-1">
          <div className="space-y-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={L({ en: "Contract name", ar: "اسم العقد" })} className="h-8 bg-card text-[12.5px]" />
            <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={L({ en: "Paste the full contract text…", ar: "الصق نص العقد كاملاً…" })} className="min-h-28 bg-card text-[12px]" dir="auto" />
            <div className="flex justify-end">
              <RunButton size="sm" running={reviewing} disabled={text.trim().length < 400} onRun={() => onRunText(name || L({ en: "Uploaded contract", ar: "عقد مرفوع" }), text)}>
                {L({ en: "Review & keep for obligations", ar: "مراجعة وحفظ لاستخراج الالتزامات" })}
              </RunButton>
            </div>
          </div>
          <FileDrop
            accept=".txt,.md"
            label={L({ en: "Drop a contract (.md / .txt)", ar: "أسقط عقداً (.md / .txt)" })}
            onFiles={(fs) => {
              if (!fs[0]?.text) return toast.error(L({ en: "Use a text file or paste the text", ar: "استخدم ملفاً نصياً أو الصق النص" }));
              setText(fs[0].text);
              if (!name) setName(fs[0].name.replace(/\.[^.]+$/, ""));
            }}
            className="items-start"
          />
        </div>
      )}

      {reviewing && !review ? (
        <div className="rounded-lg border border-border p-5">
          <ThinkingLines lines={8} />
        </div>
      ) : !review ? (
        <EmptyState icon={<Gavel className="size-4" />} title={L({ en: "Compare the agreement with approved positions", ar: "قارن الاتفاقية بالمواقف المعتمدة" })}>
          {L({
            en: `Every clause is checked against the ${playbook.positions.length} positions of ${playbook.ref}; each flag links to the exact clause text, carries a risk level and a proposed redline. A qualified reviewer accepts or rejects each one.`,
            ar: `تُفحص البنود مقابل ${playbook.positions.length} موقفاً في ${playbook.ref}؛ وكل ملاحظة مرتبطة بنص البند الدقيق مع مستوى الخطورة وتعديل مقترح، ويقبلها أو يرفضها مراجع مؤهل.`,
          })}
        </EmptyState>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-card px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium">{review.name}</div>
              <div className="text-[11.5px] text-muted-foreground">
                {review.summary} · {f.relative(review.at)}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {(["high", "medium", "low"] as const).map((r) => (
                <StatusPill key={r} tone={RISK[r]}>
                  {devs.filter((x) => x.risk === r).length} {r === "high" ? L({ en: "high", ar: "عالية" }) : r === "medium" ? L({ en: "medium", ar: "متوسطة" }) : L({ en: "low", ar: "منخفضة" })}
                </StatusPill>
              ))}
            </div>
            <div className="inline-flex rounded-md bg-muted p-0.5">
              {(
                [
                  ["dev", { en: "Flags", ar: "الملاحظات" }],
                  ["high", { en: "High risk", ar: "عالية الخطورة" }],
                  ["all", { en: "All positions", ar: "كل المواقف" }],
                ] as const
              ).map(([k, t]) => (
                <button key={k} type="button" onClick={() => setFilter(k)} className={cn("rounded px-2 py-0.5 text-[11.5px]", filter === k ? "bg-card font-medium shadow-sm" : "text-muted-foreground")}>
                  {L(t)}
                </button>
              ))}
            </div>
          </div>

          <ul className="space-y-2.5">
            {findings.map((x) => (
              <FindingCard key={x.positionId} x={x} playbook={playbook} disabled={!!approval && approval.status !== "rejected"} onDecide={(d) => onDecide(review.contractId, x.positionId, d)} onOpen={() => onOpenDoc(review.contractId)} />
            ))}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface px-4 py-3">
            <span className="text-[12.5px] text-muted-foreground">
              {decided}/{devs.length} {L({ en: "flags decided", ar: "ملاحظات محسومة" })} · {accepted} {L({ en: "redlines accepted", ar: "تعديلات مقبولة" })}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => onExtract(review.contractId)}>
                {L({ en: "Extract obligations", ar: "استخراج الالتزامات" })}
              </Button>
              {!approval || approval.status === "rejected" ? (
                <Button
                  size="sm"
                  disabled={!accepted || sending}
                  onClick={async () => {
                    setSending(true);
                    try {
                      await onSendRedlines(review.contractId);
                    } finally {
                      setSending(false);
                    }
                  }}
                >
                  <Gavel /> {L({ en: "Send accepted redlines to Legal", ar: "إرسال التعديلات المقبولة إلى الشؤون القانونية" })}
                </Button>
              ) : null}
            </div>
          </div>
          {approval && <ApprovalCard key={approval.id} approval={approval} onDecided={onDecided} />}
        </>
      )}
    </div>
  );
}

function FindingCard({ x, playbook, disabled, onDecide, onOpen }: { x: Finding; playbook: Playbook; disabled: boolean; onDecide: (d: Finding["decision"] | null) => Promise<void>; onOpen: () => void }) {
  const L = useL();
  const [busy, setBusy] = useState(false);
  const pos = playbook.positions.find((p) => p.id === x.positionId)!;
  const decide = async (d: Finding["decision"] | null) => {
    setBusy(true);
    try {
      await onDecide(d);
    } finally {
      setBusy(false);
    }
  };
  return (
    <li
      className={cn(
        "rounded-lg border bg-card",
        x.decision === "accepted" ? "border-success/30" : x.decision === "rejected" ? "border-border opacity-70" : x.status !== "compliant" && x.risk === "high" ? "border-danger/25" : "border-border",
      )}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="font-mono text-[11px] text-muted-foreground">{x.positionId}</span>
        <span className="text-[13px] font-medium">{L(pos.topic)}</span>
        {x.status === "compliant" ? (
          <StatusPill tone="success">{L({ en: "Compliant", ar: "متوافق" })}</StatusPill>
        ) : (
          <>
            <StatusPill tone={RISK[x.risk]}>
              {x.risk === "high" ? L({ en: "High risk", ar: "خطورة عالية" }) : x.risk === "medium" ? L({ en: "Medium risk", ar: "خطورة متوسطة" }) : L({ en: "Low risk", ar: "خطورة منخفضة" })}
            </StatusPill>
            <StatusPill tone="neutral" dot={false}>
              {x.status === "missing" ? L({ en: "Clause missing", ar: "بند مفقود" }) : L({ en: "Deviation", ar: "انحراف" })}
            </StatusPill>
            {x.fallbackOk && <StatusPill tone="info" dot={false}>{L({ en: "Within fallback", ar: "ضمن البديل المقبول" })}</StatusPill>}
          </>
        )}
        {x.clauseRef !== "—" && (
          <button type="button" onClick={onOpen} className="ms-auto truncate font-mono text-[11px] text-ai hover:underline" title={x.clauseTitle}>
            {L({ en: "Clause", ar: "البند" })} {x.clauseRef} · {x.clauseTitle.replace(/^(Clause\s+)?\d+(\.\d+)*\s*[—–-]?\s*/i, "").slice(0, 48)}
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4 px-4 py-3 max-lg:grid-cols-1">
        <div className="space-y-2">
          <p className="text-[12.5px] leading-relaxed" dir="auto">
            {x.summary}
          </p>
          {x.quote && (
            <blockquote className="border-s-2 border-danger/40 ps-3 text-[12px] leading-relaxed text-muted-foreground">
              “{x.quote}”
            </blockquote>
          )}
          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground">
              <ChevronDown className="size-3" /> {L({ en: "Approved position & fallback", ar: "الموقف المعتمد والبديل" })}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-1.5 space-y-1 rounded-md bg-surface p-2.5 text-[11.5px] leading-relaxed">
                <p>
                  <span className="font-medium">{L({ en: "Position: ", ar: "الموقف: " })}</span>
                  {pos.position}
                </p>
                <p className="text-muted-foreground">
                  <span className="font-medium">{L({ en: "Fallback: ", ar: "البديل: " })}</span>
                  {pos.fallback}
                </p>
                <p className="text-muted-foreground">
                  <span className="font-medium">{L({ en: "Escalation: ", ar: "التصعيد: " })}</span>
                  {pos.escalation}
                </p>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
        {x.redline ? (
          <div className="flex flex-col gap-2">
            <div className="rounded-md border border-ai/20 bg-ai-soft/50 p-2.5">
              <div className="label-caps !text-[9.5px] mb-1 text-ai">{L({ en: "Proposed redline", ar: "التعديل المقترح" })}</div>
              <p className="text-[12px] leading-relaxed" dir="auto">
                {x.redline}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {x.decision ? (
                <>
                  <StatusPill tone={x.decision === "accepted" ? "success" : "neutral"}>
                    {x.decision === "accepted" ? L({ en: "Accepted", ar: "مقبول" }) : L({ en: "Rejected", ar: "مرفوض" })} · {x.decidedBy}
                  </StatusPill>
                  {!disabled && (
                    <Button size="xs" variant="ghost" disabled={busy} onClick={() => decide(null)}>
                      {L({ en: "Undo", ar: "تراجع" })}
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <Button size="xs" disabled={busy || disabled} onClick={() => decide("accepted")}>
                    <Check /> {L({ en: "Accept redline", ar: "قبول التعديل" })}
                  </Button>
                  <Button size="xs" variant="outline" disabled={busy || disabled} onClick={() => decide("rejected")}>
                    <X /> {L({ en: "Reject", ar: "رفض" })}
                  </Button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="text-[12px] text-muted-foreground">{L({ en: "No change required.", ar: "لا يلزم تعديل." })}</div>
        )}
      </div>
    </li>
  );
}
