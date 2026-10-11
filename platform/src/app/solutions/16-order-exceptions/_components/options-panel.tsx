"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, Ban, Check, ChevronDown, CircleAlert, FileText, Info, Mail, MessageCircle, Sparkles, Star, Truck, TriangleAlert, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ApprovalCard } from "@/components/narvo/approval-card";
import { EmptyState, ThinkingLines } from "@/components/narvo/empty";
import { Markdown } from "@/components/narvo/markdown";
import { RunButton } from "@/components/narvo/run-button";
import { StatusPill } from "@/components/narvo/status";
import type { NarvoRun } from "@/hooks/use-narvo-run";
import type { Citation } from "@/lib/ai/events";
import { useFormat, useL, usePrefs } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { fmtSlot } from "../_lib/calendar";
import { fmtNum, TYPE_LABEL } from "../_lib/rules";
import type { Bi, OptionAction, OptionImpact, OrderAnalysis, Proposal, ProposedOption } from "../_lib/types";
import { Caps, TypeChip } from "./bits";

export interface StoredOptionsView {
  options: Array<{ option: ProposedOption; impact: OptionImpact }>;
  recommended: string | null;
  recommendedReason: string;
  citations: Citation[];
  brief?: string;
  createdAt: number;
}

function actionText(a: OptionAction, L: (b: Bi) => string) {
  switch (a.type) {
    case "split_delivery":
      return L({
        en: `split · now ${fmtNum(a.nowQty, 1)} ${a.nowWarehouse ?? ""} · later ${fmtNum(a.laterQty, 1)} via ${a.laterSource.replace("_", " ")}${a.laterPoRef ? ` ${a.laterPoRef}` : ""}`,
        ar: `تجزئة · الآن ${fmtNum(a.nowQty, 1)} ${a.nowWarehouse ?? ""} · لاحقاً ${fmtNum(a.laterQty, 1)} عبر ${a.laterSource === "inbound_po" ? "أمر وارد" : a.laterSource === "transfer" ? "تحويل" : "مورد بديل"}${a.laterPoRef ? ` ${a.laterPoRef}` : ""}`,
      });
    case "transfer_stock":
      return L({ en: `transfer · ${fmtNum(a.qty, 1)} from ${a.fromWarehouse}`, ar: `تحويل · ${fmtNum(a.qty, 1)} من ${a.fromWarehouse}` });
    case "alternative_supplier":
      return L({ en: `alt. supplier · ${fmtNum(a.qty, 1)} at +AED ${a.premiumPerT}/t`, ar: `مورد بديل · ${fmtNum(a.qty, 1)} بعلاوة ${a.premiumPerT} درهم/طن` });
    case "correct_price":
      return L({ en: `correct price → ${a.to === "contract" ? "contract rate" : "allowed list price"}${a.sku ? ` (${a.sku})` : ""}`, ar: `تصحيح السعر ← ${a.to === "contract" ? "سعر العقد" : "سعر القائمة المسموح"}${a.sku ? ` (${a.sku})` : ""}` });
    case "reschedule":
      return L({ en: `reschedule → ${fmtSlot(a.slot)}`, ar: `إعادة جدولة ← ${fmtSlot(a.slot, "ar")}` });
    case "partial_credit_release":
      return L({ en: `CFO release · AED ${fmtNum(a.amount)}`, ar: `إفراج ائتماني · ${fmtNum(a.amount)} درهم` });
    case "hold_for_payment":
      return L({ en: `hold balance until payment · AED ${fmtNum(a.amount)}`, ar: `إيقاف الرصيد حتى السداد · ${fmtNum(a.amount)} درهم` });
  }
}

export function OptionsPanel({
  oa,
  run,
  approveRun,
  mine,
  approveMine,
  stored,
  proposal,
  useProposal,
  setUseProposal,
  onGenerate,
  onApprove,
  onDecided,
}: {
  oa: OrderAnalysis;
  run: NarvoRun;
  approveRun: NarvoRun;
  mine: boolean;
  approveMine: boolean;
  stored: StoredOptionsView | null;
  proposal: Proposal | null;
  useProposal: boolean;
  setUseProposal: (v: boolean) => void;
  onGenerate: () => void;
  onApprove: (optionId: string) => void;
  onDecided: (status: "approved" | "rejected") => void;
}) {
  const L = useL();
  const f = useFormat();
  const { lang } = usePrefs();
  const live = mine && (run.running || run.data.options);
  const options: Array<{ option: ProposedOption; impact: OptionImpact }> = (live ? run.data.options : stored?.options) ?? [];
  const rec = (live ? run.data.recommended : stored ? { id: stored.recommended, reason: stored.recommendedReason } : null) as { id: string; reason: string } | null;
  const brief = (live ? run.text.brief : stored?.brief) ?? "";
  const citations = ((live ? run.data.citations : stored?.citations) ?? []) as Citation[];
  const [open, setOpen] = useState<string | null>(null);
  const resolved = !!oa.order.resolution && !oa.exceptions.length;
  const approvingId = approveMine ? (approveRun.data.package?.approvalId as string | undefined) : undefined;
  const cols = options.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-xl">
          <div className="text-[14px] font-medium">{L({ en: "Resolution options", ar: "خيارات المعالجة" })}</div>
          <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
            {L({
              en: "The model proposes typed actions; RBM's planning engine validates every parameter and computes promise per line, cost, margin vs standard cost, credit exposure and approvals — then re-runs detection to prove what clears.",
              ar: "يقترح النموذج إجراءات محددة؛ ويتحقق محرك التخطيط من كل معامل ويحسب الموعد لكل بند والتكلفة والهامش والتعرض الائتماني والموافقات — ثم يعيد الفحص لإثبات ما تتم إزالته.",
            })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {proposal && (
            <label className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
              <Switch size="sm" checked={useProposal} onCheckedChange={setUseProposal} />
              {L({ en: "Include customer's message", ar: "تضمين رسالة المتعامل" })}
            </label>
          )}
          <RunButton running={run.running && mine} disabled={resolved || (run.running && !mine)} icon={<Workflow className="size-4" />} onRun={onGenerate}>
            {options.length ? L({ en: "Regenerate", ar: "إعادة التوليد" }) : L({ en: "Generate options", ar: "توليد الخيارات" })}
          </RunButton>
        </div>
      </div>

      {resolved && (
        <div className="rounded-md border border-success/30 bg-success-soft/50 px-3 py-2 text-[12.5px]">
          {L({ en: "This order's exceptions are resolved — see the approved plan on the Order tab.", ar: "تمت معالجة استثناءات هذا الطلب — راجع الخطة المعتمدة في تبويب الطلب." })}
        </div>
      )}

      {mine && run.status === "error" && (
        <div className="flex items-start justify-between gap-3 rounded-md border border-danger/25 bg-danger-soft p-3 text-[12.5px] text-danger">
          <span>{run.error}</span>
          <Button size="sm" variant="outline" onClick={onGenerate}>
            {L({ en: "Retry", ar: "إعادة المحاولة" })}
          </Button>
        </div>
      )}

      {!options.length && run.running && mine && (
        <div className="rounded-md border border-border p-4">
          <Caps className="mb-3">{L({ en: "Planning options against stock, POs, site window and credit…", ar: "تخطيط الخيارات وفق المخزون والوارد ونافذة الموقع والائتمان…" })}</Caps>
          <ThinkingLines lines={6} />
        </div>
      )}

      {!options.length && !run.running && !resolved && (
        <EmptyState icon={<Workflow className="size-4" />} title={L({ en: "No options generated yet", ar: "لم تُولَّد خيارات بعد" })}>
          {L({
            en: "Generate 3–4 options — e.g. split delivery, transfer from Jebel Ali, alternative supplier — each with computed promise dates, cost, margin and credit exposure.",
            ar: "ولّد 3–4 خيارات — مثل التسليم على دفعات أو التحويل من جبل علي أو مورد بديل — مع مواعيد وتكلفة وهامش وتعرض ائتماني محسوبة لكل خيار.",
          })}
        </EmptyState>
      )}

      {options.length > 0 && (
        <motion.div initial={{ opacity: 1 }} animate={{ opacity: 1 }} className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[620px] text-[12px]">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="label-caps w-[150px] px-3 py-2 text-start !text-[9.5px] font-medium">{L({ en: "Computed impact", ar: "الأثر المحسوب" })}</th>
                {options.map(({ option, impact }) => (
                  <th key={option.id} className={cn("px-3 py-2 text-start align-top font-medium", rec?.id === option.id && "bg-ai-soft/60")}>
                    <div className="flex items-center gap-1.5">
                      <span className="flex size-5 items-center justify-center rounded-full bg-foreground text-[10.5px] text-background">{option.id}</span>
                      {rec?.id === option.id && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-medium uppercase tracking-wide text-ai">
                          <Star className="size-3" />
                          {L({ en: "Recommended", ar: "موصى به" })}
                        </span>
                      )}
                      {!impact.feasible && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-medium uppercase tracking-wide text-danger">
                          <Ban className="size-3" />
                          {L({ en: "Not feasible", ar: "غير قابل للتنفيذ" })}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-[12.5px] leading-snug" dir="auto">
                      {option.title}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="[&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_tr]:border-b [&_tr]:border-border [&_tr:last-child]:border-0">
              <MRow label={L({ en: "Deliveries · promise per line", ar: "الدفعات · الموعد لكل بند" })} options={options} rec={rec?.id}>
                {(i) => (
                  <ul className="space-y-1">
                    {i.deliveries.map((d, k) => (
                      <li key={k} className={cn("leading-snug", d.held && "text-warning")}>
                        <span className="num font-medium">{fmtNum(d.qty, 1)}</span> <span className="font-mono text-[10.5px]">{d.sku.replace("RB-B500-", "Ø")}</span>{" "}
                        <span className="num">{fmtSlot(d.slot, lang)}</span>
                        <span className="block text-[10.5px] text-muted-foreground">
                          {d.source.kind === "stock" ? L({ en: `stock ${d.source.warehouse}`, ar: `مخزون ${d.source.warehouse}` }) : d.source.kind === "transfer" ? L({ en: `transfer ${d.source.from}→${d.source.to}`, ar: `تحويل ${d.source.from}←${d.source.to}` }) : d.source.kind === "inbound" ? d.source.poRef : L({ en: "Al Dhafra", ar: "الظفرة" })}
                          {d.held ? ` · ${L({ en: "held (credit)", ar: "موقوف (ائتمان)" })}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </MRow>
              <MRow label={L({ en: "Extra cost", ar: "التكلفة الإضافية" })} options={options} rec={rec?.id}>
                {(i) => <span className={cn("num", i.extraCost > 0 && "font-medium")}>{f.aed(i.extraCost)}</span>}
              </MRow>
              <MRow label={L({ en: "Margin vs std cost", ar: "الهامش مقابل التكلفة المعيارية" })} options={options} rec={rec?.id}>
                {(i) => (
                  <span className="num">
                    {f.aed(i.margin)} <span className="text-muted-foreground">({fmtNum(i.marginPct * 100, 1)}%)</span>
                    <span className={cn("block text-[10.5px]", i.marginDelta >= 0 ? "text-success" : "text-danger")}>
                      {i.marginDelta >= 0 ? "+" : "−"}
                      {f.aed(Math.abs(i.marginDelta))} {L({ en: "vs as entered", ar: "مقابل المُدخل" })}
                    </span>
                  </span>
                )}
              </MRow>
              <MRow label={L({ en: "Credit exposure after", ar: "التعرض بعد التغيير" })} options={options} rec={rec?.id}>
                {(i) => (
                  <span className="num">
                    <span className={cn("font-medium", i.exposurePctAfter > 1 ? (i.releaseAmount ? "text-warning" : "text-danger") : "text-success")}>{fmtNum(i.exposurePctAfter * 100, 1)}%</span>{" "}
                    <span className="text-muted-foreground">{f.aed(i.exposureAfter)}</span>
                    {i.heldValue > 0 && <span className="block text-[10.5px] text-warning">{L({ en: `held ${f.aed(i.heldValue)}`, ar: `موقوف ${f.aed(i.heldValue)}` })}</span>}
                    {i.releaseAmount > 0 && <span className="block text-[10.5px] text-muted-foreground">{L({ en: `CFO release ${f.aed(i.releaseAmount)}`, ar: `إفراج ${f.aed(i.releaseAmount)}` })}</span>}
                  </span>
                )}
              </MRow>
              <MRow label={L({ en: "Approvals", ar: "الموافقات" })} options={options} rec={rec?.id}>
                {(i) => (
                  <ul className="space-y-0.5">
                    {i.approvals.map((a) => (
                      <li key={a.name} className="leading-snug">
                        {a.name}
                        <span className="block text-[10.5px] text-muted-foreground">{a.title}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </MRow>
              <MRow label={L({ en: "Customer constraints", ar: "قيود المتعامل" })} options={options} rec={rec?.id}>
                {(i) =>
                  i.constraints.length ? (
                    <span className={cn("num", i.constraints.every((c) => c.ok) ? "text-success" : "text-warning")}>
                      {i.constraints.filter((c) => c.ok).length}/{i.constraints.length} {L({ en: "met", ar: "مستوفاة" })}
                    </span>
                  ) : (
                    <span className="text-faint">—</span>
                  )
                }
              </MRow>
              <MRow label={L({ en: "Exceptions cleared", ar: "الاستثناءات المزالة" })} options={options} rec={rec?.id}>
                {(i) => (
                  <div className="flex flex-wrap gap-1">
                    {i.cleared.map((t) => (
                      <span key={t} className="inline-flex items-center gap-0.5 rounded bg-success-soft px-1 text-[10.5px] text-success">
                        <Check className="size-2.5" />
                        {L(TYPE_LABEL[t])}
                      </span>
                    ))}
                    {i.remaining.map((t) => (
                      <span key={t} className="inline-flex items-center gap-0.5 rounded bg-danger-soft px-1 text-[10.5px] text-danger">
                        <CircleAlert className="size-2.5" />
                        {L(TYPE_LABEL[t])}
                      </span>
                    ))}
                  </div>
                )}
              </MRow>
            </tbody>
          </table>
        </motion.div>
      )}

      {(brief || (run.running && mine && options.length > 0)) && (
        <div className="rounded-md border border-ai/20 bg-ai-soft/30 p-3.5">
          <div className="mb-1.5 flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-ai" />
            <span className="label-caps !text-[9.5px] text-ai">{L({ en: "Planner's brief", ar: "ملخص المخطط" })}</span>
          </div>
          {brief ? <Markdown citations={citations} streaming={run.running && mine}>{brief}</Markdown> : <ThinkingLines lines={3} />}
        </div>
      )}

      {options.map(({ option, impact }) => {
        const isOpen = open === option.id || (open === null && rec?.id === option.id);
        return (
          <div key={option.id} className={cn("rounded-md border", rec?.id === option.id ? "border-ai/30" : "border-border")}>
            <button type="button" onClick={() => setOpen(isOpen ? "" : option.id)} className="flex w-full items-start gap-2.5 px-3.5 py-3 text-start">
              <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[10.5px] text-background">{option.id}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium" dir="auto">
                  {option.title}
                </span>
                <span className="mt-0.5 block text-[12px] leading-relaxed text-muted-foreground" dir="auto">
                  {option.summary}
                </span>
              </span>
              <ChevronDown className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
            </button>
            {isOpen && (
              <div className="space-y-3 border-t border-border px-3.5 py-3">
                <div>
                  <Caps className="mb-1.5">{L({ en: "Typed actions (model) — validated by code", ar: "الإجراءات المقترحة (النموذج) — متحقق منها برمجياً" })}</Caps>
                  <div className="flex flex-wrap gap-1.5">
                    {option.actions.map((a, k) => (
                      <span key={k} className="inline-flex items-center gap-1 rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10.5px]">
                        <span className="text-ai">{a.type}</span>
                        <span className="text-muted-foreground">{actionText(a, L)}</span>
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <Caps className="mb-1.5">{L({ en: "Delivery plan", ar: "خطة التسليم" })}</Caps>
                  <ol className="space-y-1">
                    {[...impact.deliveries]
                      .sort((a, b) => (a.slot ?? "").localeCompare(b.slot ?? ""))
                      .map((d, k) => (
                        <li key={k} className={cn("flex items-center gap-2 rounded border px-2.5 py-1.5 text-[12px]", d.held ? "border-warning/30 bg-warning-soft/40" : "border-border bg-card")}>
                          <Truck className="size-3.5 shrink-0 text-muted-foreground" />
                          <span className="num w-[132px] shrink-0 font-medium">{fmtSlot(d.slot, lang)}</span>
                          <span className="min-w-0 flex-1 truncate">{L(d.label)}</span>
                          <span className="num shrink-0 text-[11px] text-muted-foreground">
                            {d.trucks} {L({ en: d.trucks === 1 ? "truck" : "trucks", ar: "شاحنة" })}
                          </span>
                          {d.held && <StatusPill tone="warning">{L({ en: "held", ar: "موقوف" })}</StatusPill>}
                        </li>
                      ))}
                  </ol>
                </div>
                {option.rationale && (
                  <div>
                    <Caps className="mb-1">{L({ en: "Rationale", ar: "المبررات" })}</Caps>
                    <Markdown citations={citations} className="!text-[12.5px]">
                      {option.rationale}
                    </Markdown>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
                  <div>
                    <Caps className="mb-1">{L({ en: "Customer impact", ar: "الأثر على المتعامل" })}</Caps>
                    <p className="text-[12px] leading-relaxed text-foreground/80" dir="auto">
                      {option.customerImpact}
                    </p>
                  </div>
                  <div>
                    <Caps className="mb-1">{L({ en: "Risks", ar: "المخاطر" })}</Caps>
                    <p className="text-[12px] leading-relaxed text-foreground/80" dir="auto">
                      {option.risks}
                    </p>
                  </div>
                </div>
                {(impact.constraints.length > 0 || impact.issues.length > 0 || impact.otherOrders.length > 0) && (
                  <ul className="space-y-1 rounded border border-border bg-surface p-2.5 text-[11.5px]">
                    {impact.constraints.map((c, k) => (
                      <li key={`c${k}`} className="flex items-start gap-1.5">
                        {c.ok ? <Check className="mt-0.5 size-3 shrink-0 text-success" /> : <TriangleAlert className="mt-0.5 size-3 shrink-0 text-warning" />}
                        {L(c.label)}
                      </li>
                    ))}
                    {impact.issues.map((x, k) => (
                      <li key={`i${k}`} className={cn("flex items-start gap-1.5", x.level === "error" && "text-danger")}>
                        {x.level === "error" ? <Ban className="mt-0.5 size-3 shrink-0" /> : x.level === "warn" ? <TriangleAlert className="mt-0.5 size-3 shrink-0 text-warning" /> : <Info className="mt-0.5 size-3 shrink-0 text-muted-foreground" />}
                        {L(x.text)}
                      </li>
                    ))}
                    {impact.otherOrders.map((x, k) => (
                      <li key={`o${k}`} className="flex items-start gap-1.5 text-info">
                        <ArrowRight className="mt-0.5 size-3 shrink-0 rtl:rotate-180" />
                        {x.orderId} ({x.customer}): {L(x.change)}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11.5px] text-muted-foreground">
                    {L({ en: "Routes to", ar: "يُوجَّه إلى" })} <span className="font-medium text-foreground">{impact.approver.name}</span> · {impact.approver.title}
                  </span>
                  <Button size="sm" disabled={!impact.feasible || approveRun.running || resolved || !!approvingId} onClick={() => onApprove(option.id)}>
                    <FileText />
                    {L({ en: `Choose ${option.id} — draft handover & notice`, ar: `اختيار ${option.id} — صياغة المذكرة والإشعار` })}
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {approveMine && (approveRun.running || approveRun.text.handover || approveRun.status === "error") && (
        <ApprovalPackage run={approveRun} onDecided={onDecided} />
      )}
    </div>
  );
}

function MRow({
  label,
  options,
  rec,
  children,
}: {
  label: string;
  options: Array<{ option: ProposedOption; impact: OptionImpact }>;
  rec?: string;
  children: (i: OptionImpact) => React.ReactNode;
}) {
  return (
    <tr>
      <td className="text-[11.5px] text-muted-foreground">{label}</td>
      {options.map(({ option, impact }) => (
        <td key={option.id} className={cn(rec === option.id && "bg-ai-soft/30", !impact.feasible && "opacity-60")}>
          {children(impact)}
        </td>
      ))}
    </tr>
  );
}

function ApprovalPackage({ run, onDecided }: { run: NarvoRun; onDecided: (s: "approved" | "rejected") => void }) {
  const L = useL();
  const pkg = run.data.package as { channel: string; recipient?: { name: string; role: string } } | undefined;
  const channel = pkg?.channel ?? (run.data.impact ? undefined : undefined);
  return (
    <motion.div initial={{ opacity: 1, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-3 rounded-md border border-border bg-surface/60 p-3.5">
      <div className="flex items-center gap-2">
        <FileText className="size-4 text-muted-foreground" />
        <span className="text-[13px] font-medium">{L({ en: "Approval package", ar: "حزمة الاعتماد" })}</span>
        {pkg?.recipient && (
          <span className="ms-auto text-[11.5px] text-muted-foreground">
            {channel === "whatsapp" ? <MessageCircle className="inline size-3" /> : <Mail className="inline size-3" />} {pkg.recipient.name} · {pkg.recipient.role}
          </span>
        )}
      </div>
      {run.status === "error" && <div className="rounded border border-danger/25 bg-danger-soft p-2.5 text-[12px] text-danger">{run.error}</div>}
      <Doc title={L({ en: "Billing handover → Group Finance", ar: "مذكرة تسليم ← قسم الفوترة" })} text={run.text.handover} running={run.running} />
      <div className="grid grid-cols-2 gap-3 max-lg:grid-cols-1">
        <Doc title={L({ en: "Customer notice — English", ar: "إشعار المتعامل — الإنجليزية" })} text={run.text.notice_en} running={run.running} />
        <Doc title={L({ en: "Customer notice — Arabic", ar: "إشعار المتعامل — العربية" })} text={run.text.notice_ar} running={run.running} rtl />
      </div>
      {run.approvals.map((a) => (
        <ApprovalCard
          key={a.id}
          approval={a}
          onDecided={(s) => {
            run.markApproval(a.id, s);
            onDecided(s);
          }}
        />
      ))}
    </motion.div>
  );
}

function Doc({ title, text, running, rtl }: { title: string; text?: string; running: boolean; rtl?: boolean }) {
  return (
    <div className="rounded border border-border bg-card p-3">
      <Caps className="mb-1.5">{title}</Caps>
      {text ? (
        <div dir={rtl ? "rtl" : undefined}>
          <Markdown className="!text-[12.5px]" streaming={running}>
            {text}
          </Markdown>
        </div>
      ) : running ? (
        <ThinkingLines lines={4} />
      ) : null}
    </div>
  );
}

export { TypeChip };
