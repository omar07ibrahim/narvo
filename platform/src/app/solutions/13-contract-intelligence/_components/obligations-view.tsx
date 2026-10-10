"use client";

import { useMemo, useState } from "react";
import { BellRing, CalendarClock, CheckCircle2, ListChecks, PencilLine } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { RunButton } from "@/components/narvo/run-button";
import { StatusPill } from "@/components/narvo/status";
import { ApprovalCard } from "@/components/narvo/approval-card";
import { EmptyState, ThinkingLines } from "@/components/narvo/empty";
import type { NarvoRun } from "@/hooks/use-narvo-run";
import { useFormat, useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { TODAY, addDays, obligationView, recurrenceLabel } from "../_lib/dates";
import type { ContractState, Extraction } from "../_lib/types";
import { STATUS_TONE, STATUS_TXT } from "./register-view";

export function ObligationsView({
  state,
  extractRun,
  extractTarget,
  onAction,
  onConfirm,
  onRenewal,
  onDecided,
}: {
  state: ContractState;
  extractRun: NarvoRun;
  extractTarget: string | null;
  onAction: (id: string, action: string, close: boolean) => Promise<void>;
  onConfirm: (contractId: string, keys: string[]) => Promise<void>;
  onRenewal: () => void;
  onDecided: () => void;
}) {
  const L = useL();
  const f = useFormat();
  const views = useMemo(() => state.obligations.map((o) => obligationView(o, state.contracts)).sort((a, b) => ((a.due ?? "9999") < (b.due ?? "9999") ? -1 : 1)), [state]);
  const hero = views.find((v) => v.o.id === "OBL-019-01");
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 9 + i, 1));
    return d.toISOString().slice(0, 7);
  });
  const overdue = views.filter((v) => v.status === "overdue");
  const groups: Array<[string, typeof views]> = [
    [L({ en: "Overdue", ar: "متأخرة" }), overdue],
    [L({ en: "Due in the next 30 days", ar: "مستحقة خلال 30 يوماً" }), views.filter((v) => v.status === "due_soon")],
    [L({ en: "Later", ar: "لاحقاً" }), views.filter((v) => v.status === "upcoming")],
    [L({ en: "Done", ar: "منجزة" }), views.filter((v) => v.status === "done")],
  ];
  const extraction: Extraction | undefined = extractTarget ? state.extractions[extractTarget] : undefined;

  return (
    <div className="flex flex-col gap-5">
      {/* hero: 019 renewal notice */}
      {hero && (
        <div className={cn("flex flex-wrap items-center gap-5 rounded-lg border px-5 py-4", hero.status === "done" ? "border-success/30 bg-success-soft/40" : "border-warning/35 bg-warning-soft/50")}>
          <div className="flex items-baseline gap-2">
            <span className={cn("num text-[44px] leading-none font-light tracking-tight", hero.status === "done" ? "text-success" : "text-warning")}>{hero.status === "done" ? "✓" : hero.days}</span>
            {hero.status !== "done" && <span className="text-[12px] text-muted-foreground">{L({ en: "days left", ar: "يوماً متبقياً" })}</span>}
          </div>
          <div className="min-w-0 flex-1">
            <div className="label-caps flex items-center gap-1.5">
              <BellRing className="size-3" /> {hero.c?.ref} · {L({ en: "Clause", ar: "البند" })} {hero.o.sourceClause}
            </div>
            <div className="mt-1 text-[15px] font-medium">{L(hero.o.title)}</div>
            <div className="mt-0.5 text-[12px] text-muted-foreground">
              {L({ en: "Due", ar: "الاستحقاق" })} <span className="num font-medium text-foreground">{hero.due ? f.date(hero.due, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "—"}</span> ·{" "}
              {L({ en: "computed as expiry", ar: "محسوب من تاريخ الانتهاء" })} {hero.c ? f.date(hero.c.end) : ""} − 60 {L({ en: "days", ar: "يوماً" })} · {L({ en: "owner", ar: "المسؤول" })} {hero.o.owner}
            </div>
            {hero.o.action && <div className="mt-1 text-[12px] text-success">{hero.o.action}</div>}
          </div>
          {hero.status !== "done" && (
            <Button onClick={onRenewal}>
              <CalendarClock /> {L({ en: "Prepare renewal decision", ar: "إعداد قرار التجديد" })}
            </Button>
          )}
        </div>
      )}

      {/* six-month calendar */}
      <section>
        <div className="label-caps mb-2">{L({ en: "Obligations calendar — computed due dates", ar: "تقويم الالتزامات — تواريخ استحقاق محسوبة" })}</div>
        <div className="grid grid-cols-7 gap-2 max-lg:grid-cols-2">
          <CalCol title={L({ en: "Overdue", ar: "متأخر" })} items={overdue} danger />
          {months.map((m) => (
            <CalCol key={m} title={f.date(`${m}-01`, { month: "short", year: "numeric" })} items={views.filter((v) => v.due?.startsWith(m) && v.status !== "overdue")} />
          ))}
        </div>
      </section>

      {/* extraction proposal */}
      {(extractRun.running || extraction) && (
        <ExtractionPanel key={extraction?.at ?? "run"} extraction={extraction} running={extractRun.running} state={state} onConfirm={onConfirm} onDecided={onDecided} />
      )}

      {/* list */}
      <section className="space-y-4">
        {groups
          .filter(([, items]) => items.length)
          .map(([title, items]) => (
            <div key={title}>
              <div className="label-caps mb-1.5">
                {title} <span className="num text-faint">· {items.length}</span>
              </div>
              <div className="overflow-hidden rounded-md border border-border">
                <table className="w-full table-fixed text-[12.5px]">
                  <tbody>
                    {items.map((v) => (
                      <tr key={v.o.id} className={cn("border-b border-border align-top last:border-0", v.o.critical && v.status !== "done" && "bg-warning-soft/30")}>
                        <td className="w-[112px] px-3 py-2">
                          <div className="num font-medium">{v.due ? f.date(v.due, { day: "numeric", month: "short", year: "numeric" }) : "—"}</div>
                          <StatusPill tone={STATUS_TONE[v.status]} className="mt-1">
                            {v.status === "done" ? L(STATUS_TXT.done) : v.days! < 0 ? `${-v.days!}d ${L({ en: "late", ar: "تأخير" })}` : `${v.days}d`}
                          </StatusPill>
                        </td>
                        <td className="px-3 py-2">
                          <div className="leading-snug font-medium">{L(v.o.title)}</div>
                          <div className="mt-0.5 text-[11px] text-muted-foreground">
                            <span className="font-mono">{v.c?.ref ?? (v.o.contractName as string) ?? v.o.contractId}</span> · {L({ en: "cl.", ar: "بند" })} {v.o.sourceClause} · {L(recurrenceLabel(v.o.trigger))} · {v.o.party === "MNDA" ? "MNDA" : L({ en: "Supplier", ar: "المورد" })}
                            {v.o.source === "ai" && <span className="ms-1 text-ai">· {L({ en: "extracted by NARVO", ar: "مستخرج بواسطة نارفو" })}</span>}
                          </div>
                          {v.o.action && <div className="mt-1 text-[11.5px] text-foreground/80">↳ {v.o.action}</div>}
                        </td>
                        <td className="w-[190px] px-3 py-2 text-[12px]">
                          <div>{v.o.owner}</div>
                          <div className="text-[11px] text-muted-foreground">{v.o.ownerRole}</div>
                        </td>
                        <td className="w-[136px] px-3 py-2 text-end">{v.status !== "done" && <ActionButton onSave={(a, c) => onAction(v.o.id, a, c)} />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
      </section>
    </div>
  );
}

function CalCol({ title, items, danger }: { title: string; items: ReturnType<typeof obligationView>[]; danger?: boolean }) {
  const L = useL();
  return (
    <div className={cn("min-h-[120px] rounded-md border p-2", danger ? "border-danger/25 bg-danger-soft/30" : "border-border bg-surface")}>
      <div className={cn("label-caps !text-[9.5px] mb-1.5", danger && "text-danger")}>
        {title} <span className="num">· {items.length}</span>
      </div>
      <ul className="space-y-1">
        {items.map((v) => (
          <li key={v.o.id}>
            <HoverCard openDelay={100}>
              <HoverCardTrigger asChild>
                <div
                  className={cn(
                    "cursor-default truncate rounded border px-1.5 py-0.5 text-[10.5px]",
                    v.status === "done" ? "border-success/20 bg-success-soft text-success line-through decoration-success/40" : v.o.critical ? "border-warning/30 bg-warning-soft text-warning" : "border-border bg-card text-foreground/80",
                  )}
                >
                  <span className="num me-1">{v.due?.slice(8, 10)}</span>
                  {v.c?.ref.replace("MNDA/CON/", "") ?? ""} · {L(v.o.title)}
                </div>
              </HoverCardTrigger>
              <HoverCardContent className="w-72 p-3 text-[12px]">
                <div className="font-medium">{L(v.o.title)}</div>
                <div className="mt-1 text-muted-foreground">
                  {v.c?.ref} · {L({ en: "Clause", ar: "البند" })} {v.o.sourceClause}
                </div>
                <div className="mt-1 text-muted-foreground">
                  {v.o.owner} · {v.due}
                </div>
              </HoverCardContent>
            </HoverCard>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ActionButton({ onSave }: { onSave: (action: string, close: boolean) => Promise<void> }) {
  const L = useL();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [close, setClose] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="xs" variant="outline">
          <PencilLine /> {L({ en: "Record action", ar: "تسجيل إجراء" })}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="end">
        <div className="label-caps mb-2">{L({ en: "Agreed action", ar: "الإجراء المتفق عليه" })}</div>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={L({ en: "What was agreed or done, by whom…", ar: "ما الذي اتُّفق عليه أو أُنجز ومن قام به…" })} className="min-h-20 text-[12px]" dir="auto" />
        <label className="mt-2 flex items-center gap-2 text-[12px] text-muted-foreground">
          <Switch checked={close} onCheckedChange={setClose} /> {L({ en: "Mark obligation as done", ar: "تعليم الالتزام كمنجز" })}
        </label>
        <div className="mt-2 flex justify-end">
          <Button
            size="xs"
            disabled={busy || text.trim().length < 6}
            onClick={async () => {
              setBusy(true);
              try {
                await onSave(text, close);
                setOpen(false);
                setText("");
                toast.success(L({ en: "Action recorded in the audit trail", ar: "سُجّل الإجراء في سجل التدقيق" }));
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {L({ en: "Save", ar: "حفظ" })}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ExtractionPanel({
  extraction,
  running,
  state,
  onConfirm,
  onDecided,
}: {
  extraction?: Extraction;
  running: boolean;
  state: ContractState;
  onConfirm: (contractId: string, keys: string[]) => Promise<void>;
  onDecided: () => void;
}) {
  const L = useL();
  const f = useFormat();
  const future = (d: string | null) => !!d && d >= addDays(TODAY, -45);
  const [keys, setKeys] = useState<string[]>(() => (extraction?.items ?? []).filter((i) => future(i.due)).map((i) => i.key));
  const [busy, setBusy] = useState(false);
  const approval = extraction?.approvalId ? state.approvals.find((a) => a.id === extraction.approvalId) : undefined;
  return (
    <section className="rounded-lg border border-ai/25 bg-card">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <ListChecks className="size-4 text-ai" />
          <span className="text-[13px] font-medium">{L({ en: "Proposed obligations", ar: "الالتزامات المقترحة" })}</span>
          {extraction && <span className="text-[12px] text-muted-foreground">· {extraction.name}</span>}
        </div>
        {extraction && !approval && (
          <RunButton
            size="sm"
            running={busy}
            disabled={!keys.length}
            icon={<CheckCircle2 />}
            onRun={async () => {
              setBusy(true);
              try {
                await onConfirm(extraction.contractId, keys);
              } finally {
                setBusy(false);
              }
            }}
          >
            {L({ en: `Confirm ${keys.length} obligations`, ar: `تأكيد ${keys.length} التزامات` })}
          </RunButton>
        )}
      </header>
      {running && !extraction ? (
        <div className="p-4">
          <ThinkingLines lines={5} />
        </div>
      ) : extraction ? (
        <div className="p-3">
          {approval && <ApprovalCard key={approval.id} approval={approval} className="mb-3" onDecided={onDecided} />}
          <ul className="divide-y divide-border">
            {extraction.items.map((i) => (
              <li key={i.key} className="flex items-start gap-3 py-2">
                <input
                  type="checkbox"
                  className="mt-1 accent-[var(--ai)]"
                  checked={keys.includes(i.key)}
                  disabled={!!approval}
                  onChange={(e) => setKeys((k) => (e.target.checked ? [...k, i.key] : k.filter((x) => x !== i.key)))}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-medium leading-snug" dir="auto">
                    {i.title}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {i.party === "MNDA" ? "MNDA" : L({ en: "Supplier", ar: "المورد" })} · {L(recurrenceLabel(i.trigger))} · {L({ en: "cl.", ar: "بند" })} {i.sourceClause} · {i.owner}
                  </div>
                  {i.quote && <div className="mt-1 line-clamp-2 border-s-2 border-ai/30 ps-2 text-[11px] text-muted-foreground">“{i.quote}”</div>}
                </div>
                <div className="w-28 shrink-0 text-end">
                  <div className={cn("num text-[12.5px]", i.due && i.due < TODAY && "text-danger")}>{i.due ? f.date(i.due) : "—"}</div>
                  <div className="text-[10.5px] text-faint">{L({ en: "computed", ar: "محسوب" })}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <EmptyState title={L({ en: "No proposal", ar: "لا يوجد اقتراح" })} />
      )}
    </section>
  );
}
