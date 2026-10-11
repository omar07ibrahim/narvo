"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, CircleCheck, CircleDashed, FileText, Mail, MessageCircle, Quote, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, ThinkingLines } from "@/components/narvo/empty";
import { FileDrop } from "@/components/narvo/file-drop";
import { RunButton } from "@/components/narvo/run-button";
import { StatusPill } from "@/components/narvo/status";
import type { NarvoRun } from "@/hooks/use-narvo-run";
import { useFormat, useL, usePrefs } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { fmtSlot } from "../_lib/calendar";
import type { Extraction } from "../_lib/proposal";
import type { ExceptionItem, OrderAnalysis, Proposal } from "../_lib/types";
import { Caps, TypeIcon } from "./bits";

export interface CustomerDocView {
  id: string;
  title: { en: string; ar: string };
  channel: string;
  lang: string;
  from: string;
  receivedAt: string;
  orderHint: string;
  text: string;
}

interface DiffView {
  added: ExceptionItem[];
  cleared: ExceptionItem[];
  changed: Array<{ before: ExceptionItem; after: ExceptionItem }>;
  unchanged: ExceptionItem[];
  exposureBefore: number;
  exposureAfter: number;
  limit: number;
  ifPaid: { amount: number; exposure: number; underLimit: boolean } | null;
  valueBefore: number;
  valueAfter: number;
  nextSlot: string | null;
  windowOk: boolean;
}

const CH_ICON: Record<string, typeof Mail> = { whatsapp: MessageCircle, email: Mail, purchase_order: FileText };

export function InterpretPanel({
  oa,
  docs,
  run,
  runOrderId,
  activeProposal,
  onRun,
  onDiscard,
  onGenerate,
}: {
  oa: OrderAnalysis;
  docs: CustomerDocView[];
  run: NarvoRun;
  runOrderId: string | null;
  activeProposal: Proposal | null;
  onRun: (text: string, docId: string | null, docTitle: string | null) => void;
  onDiscard: () => Promise<void>;
  onGenerate: () => void;
}) {
  const L = useL();
  const f = useFormat();
  const { lang } = usePrefs();
  const forOrder = docs.find((d) => d.orderHint === oa.order.id);
  const [docId, setDocId] = useState<string | null>(forOrder?.id ?? null);
  const [text, setText] = useState(forOrder?.text ?? "");
  const [title, setTitle] = useState<string | null>(forOrder ? forOrder.title.en : null);

  useEffect(() => {
    const d = docs.find((x) => x.orderHint === oa.order.id);
    setDocId(d?.id ?? null);
    setText(d?.text ?? "");
    setTitle(d ? d.title.en : null);
  }, [oa.order.id, docs]);

  const mine = runOrderId === oa.order.id || (run.data.orderId && run.data.orderId === oa.order.id);
  const x = mine ? (run.data.extraction as Extraction | undefined) : undefined;
  const proposal = mine ? (run.data.proposal as Proposal | undefined) : undefined;
  const diff = mine ? (run.data.diff as DiffView | undefined) : undefined;
  const matched = run.data.orderId as string | undefined;
  const shownProposal = proposal ?? activeProposal ?? undefined;

  return (
    <div className="space-y-4">
      {/* samples */}
      <div>
        <Caps className="mb-2">{L({ en: "Customer messages — pick one or paste your own", ar: "رسائل المتعاملين — اختر واحدة أو الصق رسالتك" })}</Caps>
        <div className="grid grid-cols-2 gap-2 max-md:grid-cols-1">
          {docs.map((d) => {
            const I = CH_ICON[d.channel] ?? FileText;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => {
                  setDocId(d.id);
                  setText(d.text);
                  setTitle(d.title.en);
                }}
                className={cn(
                  "flex items-start gap-2.5 rounded-md border px-3 py-2 text-start transition-colors hover:bg-muted/50",
                  docId === d.id ? "border-ai/40 bg-ai-soft/50" : "border-border bg-card",
                )}
              >
                <I className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-medium">{L(d.title)}</span>
                  <span className="block truncate text-[10.5px] text-muted-foreground">
                    {d.orderHint} · {d.lang === "ar" ? L({ en: "Arabic", ar: "عربي" }) : d.lang === "mixed" ? L({ en: "Arabic + English", ar: "عربي + إنجليزي" }) : L({ en: "English", ar: "إنجليزي" })}
                    {d.orderHint === oa.order.id && <span className="text-ai"> · {L({ en: "this order", ar: "هذا الطلب" })}</span>}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <Textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setDocId(null);
            setTitle(null);
          }}
          dir="auto"
          placeholder={L({ en: "Paste a customer PO, e-mail or WhatsApp chat (Arabic or English)…", ar: "الصق أمر شراء أو بريداً إلكترونياً أو محادثة واتساب (عربي أو إنجليزي)…" })}
          className="min-h-[150px] bg-surface font-[inherit] text-[12.5px] leading-relaxed"
        />
        <div className="flex items-center gap-2">
          <FileDrop
            compact
            accept=".txt,.eml,.md,.csv,.json"
            className="min-w-0 flex-1"
            label={L({ en: "Or drop a .txt / .eml export", ar: "أو أسقط ملف ‎.txt / .eml" })}
            hint={L({ en: "WhatsApp chat exports and saved e-mails work", ar: "تصدير محادثات واتساب أو رسائل البريد المحفوظة" })}
            onFiles={(fs) => {
              const t = fs[0]?.text;
              if (!t) return toast.error(L({ en: "Only text files can be read here", ar: "يمكن قراءة الملفات النصية فقط" }));
              setText(t.slice(0, 12000));
              setDocId(null);
              setTitle(fs[0].name);
            }}
          />
          <RunButton
            running={run.running}
            disabled={text.trim().length < 12}
            icon={<Sparkles className="size-4" />}
            onRun={() => onRun(text, docId, title)}
          >
            {L({ en: "Interpret & re-check", ar: "تفسير وإعادة الفحص" })}
          </RunButton>
        </div>
      </div>

      {run.running && mine && !x && (
        <div className="rounded-md border border-border p-4">
          <Caps className="mb-3">{L({ en: "Reading the message…", ar: "جارٍ قراءة الرسالة…" })}</Caps>
          <ThinkingLines lines={5} />
        </div>
      )}
      {run.status === "error" && mine && (
        <div className="flex items-start justify-between gap-3 rounded-md border border-danger/25 bg-danger-soft p-3 text-[12.5px] text-danger">
          <span>{run.error}</span>
          <Button size="sm" variant="outline" onClick={() => onRun(text, docId, title)}>
            {L({ en: "Retry", ar: "إعادة المحاولة" })}
          </Button>
        </div>
      )}

      {x && (
        <motion.div initial={{ opacity: 1 }} animate={{ opacity: 1 }} className="space-y-4">
          <div className="rounded-md border border-ai/20 bg-ai-soft/40 p-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <Sparkles className="size-3.5 text-ai" />
              <span className="label-caps !text-[9.5px] text-ai">{L({ en: "What the customer is asking", ar: "ما يطلبه المتعامل" })}</span>
              {matched && (
                <StatusPill tone="ai" className="ms-auto">
                  {L({ en: "Matched", ar: "مطابق" })} {matched}
                </StatusPill>
              )}
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed" dir="auto">
              {x.summary}
            </p>
          </div>

          <div>
            <Caps className="mb-2">{L({ en: "Extracted requests — each with its quote", ar: "الطلبات المستخرجة — مع الاقتباس الداعم" })}</Caps>
            <div className="divide-y divide-border overflow-hidden rounded-md border border-border">
              {x.requestedDelivery?.primary && (
                <Row
                  k={L({ en: "Requested delivery", ar: "موعد التسليم المطلوب" })}
                  v={[fmtSlot(x.requestedDelivery.primary, lang), ...(x.requestedDelivery.alternatives ?? []).map((a) => `${L({ en: "or", ar: "أو" })} ${fmtSlot(a, lang)}`)].join(" ")}
                  ev={x.requestedDelivery.evidence}
                  proposal={shownProposal}
                />
              )}
              {x.lineChanges.map((lc, i) => (
                <Row
                  key={i}
                  k={lc.action === "add" ? L({ en: "Add item", ar: "إضافة صنف" }) : lc.action === "remove" ? L({ en: "Remove item", ar: "حذف صنف" }) : L({ en: "Change quantity", ar: "تعديل الكمية" })}
                  v={`${lc.sku ?? "?"} · ${lc.qty ?? "—"} ${lc.unit ?? ""} — ${lc.description}`}
                  ev={lc.evidence}
                  proposal={shownProposal}
                />
              ))}
              {x.priceClaims.map((pc, i) => (
                <Row key={i} k={L({ en: "Price claim", ar: "مطالبة بالسعر" })} v={`${pc.sku ?? ""} AED ${pc.claimedPrice.toLocaleString("en-US", { minimumFractionDigits: 2 })} — ${pc.basis}`} ev={pc.evidence} proposal={shownProposal} />
              ))}
              {x.split && (
                <Row
                  k={L({ en: "Split terms", ar: "شروط التجزئة" })}
                  v={[
                    x.split.accepted === false ? L({ en: "split not accepted", ar: "لا يقبل التجزئة" }) : L({ en: "split accepted", ar: "يقبل التجزئة" }),
                    x.split.minFirstDropQty ? `${L({ en: "first drop ≥", ar: "الدفعة الأولى ≥" })} ${x.split.minFirstDropQty}` : "",
                    x.split.balanceByDate ? `${L({ en: "balance by", ar: "الباقي قبل" })} ${x.split.balanceByDate}` : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  ev={x.split.evidence}
                  proposal={shownProposal}
                />
              )}
              {x.paymentCommitment && (
                <Row k={L({ en: "Payment commitment", ar: "التزام بالسداد" })} v={`${f.aed(x.paymentCommitment.amount)}${x.paymentCommitment.date ? ` · ${x.paymentCommitment.date}` : ""}`} ev={x.paymentCommitment.evidence} proposal={shownProposal} />
              )}
              {x.contacts.map((c, i) => (
                <Row key={`c${i}`} k={L({ en: "Contact", ar: "جهة الاتصال" })} v={[c.name, c.role, c.phone, c.email].filter(Boolean).join(" · ")} />
              ))}
              {x.otherRequests.map((r, i) => (
                <Row key={`o${i}`} k={L({ en: "Other", ar: "أخرى" })} v={r.text} ev={r.evidence} proposal={shownProposal} />
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {shownProposal && (
        <div className="rounded-md border border-border p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Caps>{L({ en: "Proposed change set — not yet in the ERP", ar: "مجموعة التعديلات المقترحة — لم تُطبّق في النظام بعد" })}</Caps>
            <span className="text-[11px] text-muted-foreground">{shownProposal.docTitle}</span>
          </div>
          <ul className="mt-2 space-y-1.5">
            {shownProposal.changes.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-[12.5px]">
                {c.applied ? <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-ai" /> : <CircleDashed className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />}
                <span className="min-w-0 flex-1">{L(c.label)}</span>
                <StatusPill tone={c.applied ? "ai" : "neutral"} dot={false}>
                  {c.applied ? L({ en: "applied", ar: "مطبّق" }) : L({ en: "noted", ar: "للعلم" })}
                </StatusPill>
              </li>
            ))}
          </ul>

          {diff && (
            <div className="mt-3.5 border-t border-border pt-3">
              <Caps className="mb-2">{L({ en: "Detection re-run on the changed order", ar: "إعادة فحص الاستثناءات على الطلب المعدّل" })}</Caps>
              <div className="space-y-1.5">
                {diff.cleared.map((e) => (
                  <DiffRow key={e.key} tone="cleared" e={e} label={L({ en: "Cleared", ar: "أزيل" })} />
                ))}
                {diff.added.map((e) => (
                  <DiffRow key={e.key} tone="new" e={e} label={L({ en: "New", ar: "جديد" })} />
                ))}
                {diff.changed.map((c) => (
                  <DiffRow key={c.after.key} tone="changed" e={c.after} label={L({ en: "Changed", ar: "تغيّر" })} />
                ))}
                {diff.unchanged.map((e) => (
                  <DiffRow key={e.key} tone="same" e={e} label={L({ en: "Still open", ar: "ما زال قائماً" })} />
                ))}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-[11.5px] max-md:grid-cols-1">
                <div className="rounded border border-border bg-surface px-2.5 py-1.5">
                  <Caps>{L({ en: "Order value", ar: "قيمة الطلب" })}</Caps>
                  <div className="num mt-0.5">
                    {f.aed(diff.valueBefore)} <ArrowRight className="inline size-3 text-faint rtl:rotate-180" /> <span className="font-medium">{f.aed(diff.valueAfter)}</span>
                  </div>
                </div>
                <div className="rounded border border-border bg-surface px-2.5 py-1.5">
                  <Caps>{L({ en: "Credit exposure", ar: "التعرض الائتماني" })}</Caps>
                  <div className="num mt-0.5">
                    {f.aed(diff.exposureBefore)} <ArrowRight className="inline size-3 text-faint rtl:rotate-180" />{" "}
                    <span className={cn("font-medium", diff.exposureAfter > diff.limit && "text-danger")}>{f.aed(diff.exposureAfter)}</span>
                  </div>
                </div>
                <div className="rounded border border-border bg-surface px-2.5 py-1.5">
                  <Caps>{diff.ifPaid ? L({ en: "If payment arrives", ar: "عند استلام الدفعة" }) : L({ en: "Next valid slot", ar: "أقرب موعد صالح" })}</Caps>
                  <div className={cn("num mt-0.5 font-medium", diff.ifPaid && (diff.ifPaid.underLimit ? "text-success" : "text-danger"))}>
                    {diff.ifPaid ? `${f.aed(diff.ifPaid.exposure)} ${diff.ifPaid.underLimit ? "✓" : ""}` : fmtSlot(diff.nextSlot, lang)}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={onGenerate}>
              <Sparkles />
              {L({ en: "Generate options with this change", ar: "توليد الخيارات مع هذا التعديل" })}
            </Button>
            <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => onDiscard()}>
              <Trash2 />
              {L({ en: "Discard proposal", ar: "تجاهل المقترح" })}
            </Button>
          </div>
        </div>
      )}

      {!x && !run.running && !shownProposal && (
        <EmptyState icon={<MessageCircle className="size-4" />} title={L({ en: "Bring the customer's own words", ar: "استخدم كلمات المتعامل نفسها" })}>
          {L({
            en: "WhatsApp in Gulf Arabic, e-mails, PO amendments — NARVO extracts every requested change with its quote, applies it as a proposal and re-runs the exception checks.",
            ar: "واتساب باللهجة الخليجية، رسائل البريد، تعديلات أوامر الشراء — يستخرج نارفو كل تعديل مطلوب مع الاقتباس الداعم، ويطبّقه كمقترح ثم يعيد فحص الاستثناءات.",
          })}
        </EmptyState>
      )}
    </div>
  );
}

function Row({ k, v, ev, proposal }: { k: string; v: string; ev?: string | null; proposal?: Proposal }) {
  const L = useL();
  const verified = ev ? proposal?.changes.find((c) => c.evidence === ev)?.verified : undefined;
  return (
    <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-3 px-3 py-2 text-[12.5px] max-md:grid-cols-1">
      <span className="text-muted-foreground">{k}</span>
      <div className="min-w-0">
        <div className="font-medium break-words" dir="auto">
          {v}
        </div>
        {ev && (
          <div className="mt-1 flex items-start gap-1.5 text-[11.5px] text-muted-foreground">
            <Quote className="mt-0.5 size-3 shrink-0" />
            <span className="min-w-0 border-s-2 border-ai/30 ps-2 italic" dir="auto">
              {ev}
            </span>
            {verified !== undefined && (
              <span className={cn("ms-auto shrink-0 text-[10.5px] not-italic", verified ? "text-success" : "text-warning")} title={verified ? "Quote found verbatim" : "Quote not found verbatim"}>
                {verified ? L({ en: "✓ verified", ar: "✓ موثّق" }) : L({ en: "⚠ paraphrased", ar: "⚠ غير حرفي" })}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DiffRow({ e, tone, label }: { e: ExceptionItem; tone: "cleared" | "new" | "changed" | "same"; label: string }) {
  const L = useL();
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded border px-2.5 py-1.5 text-[12px]",
        tone === "cleared" && "border-success/25 bg-success-soft/50",
        tone === "new" && "border-warning/30 bg-warning-soft/50",
        tone === "changed" && "border-info/25 bg-info-soft/50",
        tone === "same" && "border-border bg-surface",
      )}
    >
      {tone === "new" ? <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" /> : <TypeIcon t={e.type} className="mt-0.5 shrink-0 text-muted-foreground" />}
      <span className="min-w-0 flex-1">
        <span className={cn("font-medium", tone === "cleared" && "line-through decoration-success/60")}>{L(e.title)}</span>
        <span className="block text-[11px] leading-snug text-muted-foreground">{L(e.detail)}</span>
      </span>
      <span
        className={cn(
          "shrink-0 text-[10.5px] font-medium uppercase tracking-wide",
          tone === "cleared" ? "text-success" : tone === "new" ? "text-warning" : tone === "changed" ? "text-info" : "text-faint",
        )}
      >
        {label}
      </span>
    </div>
  );
}
