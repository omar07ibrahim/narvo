"use client";

import { ArrowRight, CircleCheck, CircleDashed, CircleX, CopyX, Scale, TriangleAlert } from "lucide-react";
import { useFormat, useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { fmt2, fmtQty } from "../_lib/three-way";
import type { CellTone, CheckStatus, Grn, Invoice, MatchResult, PurchaseOrder, Supplier } from "../_lib/types";
import { CHANNEL_LABEL } from "./labels";

const TONE: Record<CellTone, string> = {
  ok: "bg-success-soft/45",
  warn: "bg-warning-soft/70",
  fail: "bg-danger-soft/70 text-danger",
  na: "",
};

function StatusIcon({ s }: { s: CheckStatus }) {
  if (s === "pass") return <CircleCheck className="size-3.5 text-success" strokeWidth={1.8} />;
  if (s === "fail") return <CircleX className="size-3.5 text-danger" strokeWidth={1.8} />;
  if (s === "warn") return <TriangleAlert className="size-3.5 text-warning" strokeWidth={1.8} />;
  return <CircleDashed className="size-3.5 text-faint" strokeWidth={1.8} />;
}

function Card({ title, sub, tone, children }: { title: string; sub?: string; tone?: "fail" | "ok"; children: React.ReactNode }) {
  return (
    <div className={cn("min-w-0 rounded-md border bg-surface p-3", tone === "fail" ? "border-danger/35" : "border-border")}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="label-caps !text-[9.5px]">{title}</span>
        {sub && <span className={cn("truncate font-mono text-[10.5px]", tone === "fail" ? "text-danger" : "text-muted-foreground")}>{sub}</span>}
      </div>
      <div className="mt-2 space-y-1 text-[12px]">{children}</div>
    </div>
  );
}

function Row({ k, v, mono, danger }: { k: string; v: React.ReactNode; mono?: boolean; danger?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{k}</span>
      <span className={cn("min-w-0 truncate text-end", mono && "font-mono text-[11px]", danger && "text-danger")}>{v}</span>
    </div>
  );
}

export function MatchView({
  inv,
  match,
  po,
  grns,
  supplier,
  onOpen,
  candidateGrns = [],
}: {
  inv: Invoice;
  match: MatchResult;
  po: PurchaseOrder | undefined;
  grns: Grn[];
  supplier: Supplier | undefined;
  onOpen: (id: string) => void;
  candidateGrns?: Grn[];
}) {
  const L = useL();
  const f = useFormat();
  const fail = (id: string) => match.checks.some((c) => c.id === id && c.status === "fail");
  const poFail = fail("po");
  const quotedPo = poFail ? undefined : po;
  const grnFail = fail("qty") || fail("credit");
  const failing = match.checks.filter((c) => c.status === "fail");

  return (
    <div className="@container space-y-5">
      {/* Summary strip */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border px-3.5 py-2.5 text-[12.5px]",
          match.exception ? "border-danger/25 bg-danger-soft/50" : "border-success/25 bg-success-soft/50",
        )}
      >
        <Scale className={cn("size-4", match.exception ? "text-danger" : "text-success")} strokeWidth={1.6} />
        <span className="font-medium">
          {match.exception
            ? L({ en: `${failing.length} of ${match.checks.filter((c) => c.status !== "na").length} checks failed`, ar: `${failing.length} من ${match.checks.filter((c) => c.status !== "na").length} فحوصات غير مطابقة` })
            : L({ en: "All checks passed — auto-matched", ar: "اجتازت جميع الفحوص — مطابقة آلية" })}
        </span>
        {match.exception && (
          <span className="num text-danger">
            {L({ en: "Variance", ar: "الفرق" })} AED {fmt2(match.variance)}
          </span>
        )}
        <span className="ms-auto text-[11.5px] text-muted-foreground">RG-FIN-POL-09 rev. 4</span>
      </div>

      {/* Three documents */}
      <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-3">
        <Card title={inv.docType === "credit_note" ? L({ en: "Credit note", ar: "إشعار دائن" }) : L({ en: "Invoice", ar: "الفاتورة" })} sub={inv.supplierInvoiceNo}>
          <Row k={L({ en: "Dated", ar: "التاريخ" })} v={f.date(inv.invoiceDate)} />
          <Row k={L({ en: "Received", ar: "الاستلام" })} v={`${f.date(inv.receivedDate, { day: "numeric", month: "short" })} · ${L(CHANNEL_LABEL[inv.channel] ?? { en: inv.channel, ar: inv.channel })}`} />
          <Row k={L({ en: "PO quoted", ar: "أمر الشراء المذكور" })} v={inv.poRef || "—"} mono danger={poFail} />
          <Row k="TRN" v={inv.trnOnInvoice ?? L({ en: "not printed", ar: "غير مطبوع" })} mono danger={fail("trn")} />
          <Row k={L({ en: "Total", ar: "الإجمالي" })} v={<span className="num font-medium">AED {fmt2(inv.total)}</span>} />
          <Row k={L({ en: "Due", ar: "الاستحقاق" })} v={`${f.date(inv.dueDate)} · ${inv.paymentTermsDays}d`} />
        </Card>
        <Card title={L({ en: "Purchase order", ar: "أمر الشراء" })} sub={match.poId ?? inv.poRef} tone={poFail ? "fail" : undefined}>
          {quotedPo || (po && !poFail) ? (
            <>
              <Row k={L({ en: "Issued", ar: "الإصدار" })} v={`${f.date(po!.date)} · ${po!.buyer}`} />
              <Row k={L({ en: "Terms", ar: "الشروط" })} v={po!.kind === "service" ? L({ en: "Service order", ar: "أمر خدمة" }) : po!.deliveryTerms === "delivered" ? L({ en: "Delivered price", ar: "سعر شامل التوصيل" }) : po!.deliveryTerms} />
              <Row k={L({ en: "Lines", ar: "البنود" })} v={po!.lines.map((l) => `${l.sku} × ${fmtQty(l.qty, l.unit)}`).join(", ")} mono />
              {po!.discountPct > 0 && <Row k={L({ en: "Discount", ar: "الخصم" })} v={`${po!.discountPct}%`} />}
              <Row k={L({ en: "Net value", ar: "القيمة الصافية" })} v={<span className="num">AED {fmt2(po!.netAmount)}</span>} />
              <p className="pt-1 text-[11px] leading-snug text-muted-foreground">{po!.priceBasis}</p>
            </>
          ) : (
            <p className="text-[12px] leading-snug text-danger">{(() => { const pc = match.checks.find((c) => c.id === "po"); return pc ? L({ en: pc.actual, ar: pc.actualAr }) : null; })()}</p>
          )}
        </Card>
        <Card title={grns[0]?.kind === "service" ? L({ en: "Service confirmation", ar: "تأكيد الخدمة" }) : L({ en: "Goods receipt", ar: "إشعار الاستلام" })} sub={grns.map((g) => g.id).join(" + ") || "—"} tone={grnFail ? "fail" : undefined}>
          {grns.length ? (
            <>
              <Row k={L({ en: "Received", ar: "الاستلام" })} v={`${grns.map((g) => f.date(g.date, { day: "numeric", month: "short" })).join(", ")} · ${grns[0].warehouse === "JA" ? L({ en: "Jebel Ali", ar: "جبل علي" }) : "MN-05"}`} />
              <Row k={L({ en: "By", ar: "المستلم" })} v={grns[0].receivedBy} />
              <Row k={L({ en: "Delivery note", ar: "إشعار التسليم" })} v={grns.map((g) => g.deliveryNote).join(", ")} mono />
              {grns.some((g) => g.weighbridge?.length) && (
                <Row
                  k={L({ en: "Weighbridge", ar: "الميزان" })}
                  v={`${grns.flatMap((g) => g.weighbridge ?? []).length} ${L({ en: "tickets", ar: "تذاكر" })} · ${(grns.flatMap((g) => g.weighbridge ?? []).reduce((a, w) => a + w.netKg, 0) / 1000).toLocaleString("en-US", { minimumFractionDigits: 3 })} t`}
                />
              )}
              <p className={cn("pt-1 text-[11px] leading-snug", grnFail ? "text-foreground/80" : "text-muted-foreground")} dir="auto">
                {grns[0].remarks}
              </p>
            </>
          ) : (
            <>
              <p className="text-[12px] text-muted-foreground">{L({ en: "No receipt linked — PO not resolved.", ar: "لا يوجد استلام مرتبط — أمر الشراء غير محدد." })}</p>
              {candidateGrns.map((g) => (
                <div key={g.id} className="mt-2 rounded border border-dashed border-ai/35 px-2 py-1.5 text-[11.5px]">
                  <div className="font-mono text-[10.5px] text-ai">{g.id}</div>
                  <div className="text-muted-foreground">
                    {L({ en: "Receipt on the proposed PO", ar: "استلام على أمر الشراء المقترح" })} · {f.date(g.date, { day: "numeric", month: "short" })} ·{" "}
                    {g.lines.map((l) => `${fmtQty(l.acceptedQty, l.unit)} ${l.unit}`).join(", ")} {L({ en: "accepted", ar: "مقبولة" })}
                  </div>
                </div>
              ))}
            </>
          )}
        </Card>
      </div>

      {/* Callouts */}
      {poFail && match.candidatePo && (
        <div className="flex items-start gap-3 rounded-md border border-ai/30 bg-ai-soft/60 px-3.5 py-3">
          <ArrowRight className="mt-0.5 size-4 shrink-0 text-ai rtl:rotate-180" />
          <div className="min-w-0 text-[12.5px]">
            <div className="font-medium">
              {L({ en: "Proposed PO", ar: "أمر الشراء المقترح" })} <span className="font-mono">{match.candidatePo.id}</span>
              <span className="num ms-2 text-[11px] text-ai">{Math.round(match.candidatePo.score * 100)}% {L({ en: "fit", ar: "تطابق" })}</span>
            </div>
            <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{L(match.candidatePo.reason)}</p>
          </div>
        </div>
      )}
      {match.duplicateOf && (
        <button
          type="button"
          onClick={() => onOpen(match.duplicateOf!)}
          className="flex w-full items-start gap-3 rounded-md border border-danger/25 bg-danger-soft/50 px-3.5 py-3 text-start transition-colors hover:bg-danger-soft"
        >
          <CopyX className="mt-0.5 size-4 shrink-0 text-danger" />
          <div className="min-w-0 text-[12.5px]">
            <div className="font-medium">
              {L({ en: "Duplicate of", ar: "مكررة من" })} <span className="font-mono">{match.duplicateOf}</span>
            </div>
            <p className="mt-0.5 text-[12px] text-muted-foreground">{L(match.checks.find((c) => c.id === "duplicate")!.detail)}</p>
          </div>
          <ArrowRight className="ms-auto mt-0.5 size-4 shrink-0 text-muted-foreground rtl:rotate-180" />
        </button>
      )}

      {/* Checks */}
      <div>
        <div className="label-caps mb-2">{L({ en: "Checks", ar: "الفحوصات" })}</div>
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full table-fixed text-[12px]">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="label-caps !text-[9.5px] px-3 py-2 text-start font-medium @2xl:w-[30%]">
                  {L({ en: "Check", ar: "الفحص" })}
                  <span className="@2xl:hidden"> · {L({ en: "expected → actual", ar: "المتوقع ← الفعلي" })}</span>
                </th>
                <th className="label-caps !text-[9.5px] hidden px-3 py-2 text-start font-medium @2xl:table-cell">{L({ en: "Expected", ar: "المتوقع" })}</th>
                <th className="label-caps !text-[9.5px] hidden px-3 py-2 text-start font-medium @2xl:table-cell">{L({ en: "Actual", ar: "الفعلي" })}</th>
                <th className="label-caps !text-[9.5px] w-[92px] px-3 py-2 text-end font-medium">{L({ en: "Variance", ar: "الفرق" })}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {match.checks.map((c) => (
                <tr key={c.id} className={cn(c.status === "fail" && "bg-danger-soft/35", c.status === "na" && "text-muted-foreground")}>
                  <td className="px-3 py-2 align-top">
                    <div className="flex items-start gap-1.5">
                      <span className="mt-px">
                        <StatusIcon s={c.status} />
                      </span>
                      <div className="min-w-0">
                        <div className="font-medium">{L(c.label)}</div>
                        {L(c.detail) && <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{L(c.detail)}</div>}
                        {/* narrow pane: expected / actual under the check instead of two cramped columns */}
                        <dl className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 gap-y-0.5 text-[11.5px] leading-snug @2xl:hidden">
                          <dt className="text-faint">{L({ en: "Expected", ar: "المتوقع" })}</dt>
                          <dd className="text-muted-foreground">{L({ en: c.expected, ar: c.expectedAr })}</dd>
                          <dt className="text-faint">{L({ en: "Actual", ar: "الفعلي" })}</dt>
                          <dd className={cn(c.status === "fail" ? "text-danger" : "text-foreground/85")}>{L({ en: c.actual, ar: c.actualAr })}</dd>
                        </dl>
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-3 py-2 align-top break-words text-muted-foreground @2xl:table-cell">{L({ en: c.expected, ar: c.expectedAr })}</td>
                  <td className={cn("hidden px-3 py-2 align-top break-words @2xl:table-cell", c.status === "fail" && "text-danger")}>{L({ en: c.actual, ar: c.actualAr })}</td>
                  <td className={cn("num px-3 py-2 text-end align-top", c.status === "fail" ? "font-medium text-danger" : "text-faint")}>
                    {c.status === "fail" ? fmt2(c.variance) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-line comparison */}
      <div>
        <div className="label-caps mb-2">{L({ en: "Line by line — invoice · PO · receipt", ar: "بنداً بنداً — الفاتورة · أمر الشراء · الاستلام" })}</div>
        <div className="scrollbar-thin overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[640px] text-[12px]">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="label-caps !text-[9.5px] px-3 py-2 text-start font-medium">{L({ en: "Item", ar: "الصنف" })}</th>
                <th className="label-caps !text-[9.5px] border-s border-border px-3 py-2 text-end font-medium">{L({ en: "Invoiced", ar: "المفوتر" })}</th>
                <th className="label-caps !text-[9.5px] px-3 py-2 text-end font-medium">{L({ en: "Price", ar: "السعر" })}</th>
                <th className="label-caps !text-[9.5px] border-s border-border px-3 py-2 text-end font-medium">{L({ en: "PO qty", ar: "كمية الأمر" })}</th>
                <th className="label-caps !text-[9.5px] px-3 py-2 text-end font-medium">{L({ en: "PO price", ar: "سعر الأمر" })}</th>
                <th className="label-caps !text-[9.5px] border-s border-border px-3 py-2 text-end font-medium">{L({ en: "Delivered", ar: "المسلّم" })}</th>
                <th className="label-caps !text-[9.5px] px-3 py-2 text-end font-medium">{L({ en: "Accepted", ar: "المقبول" })}</th>
                <th className="label-caps !text-[9.5px] px-3 py-2 text-end font-medium">{L({ en: "Rejected", ar: "المرفوض" })}</th>
                <th className="label-caps !text-[9.5px] border-s border-border px-3 py-2 text-end font-medium">{L({ en: "Amount", ar: "المبلغ" })}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {match.lines.map((l) => (
                <tr key={l.lineNo}>
                  <td className={cn("px-3 py-2 align-top", l.lineTone === "fail" && l.kind === "charge" && TONE.fail)}>
                    <div className="font-mono text-[11px]">{l.sku ?? L({ en: "Charge", ar: "رسوم" })}</div>
                    <div className="max-w-[260px] truncate text-[11px] text-muted-foreground" title={l.description}>
                      {l.description}
                    </div>
                    {l.note && <div className="text-[10.5px] text-danger">{L(l.note)}</div>}
                  </td>
                  <td className={cn("num border-s border-border px-3 py-2 text-end align-top", TONE[l.qtyTone])}>
                    {fmtQty(l.inv.qty, l.unit)} <span className="text-[10.5px] text-muted-foreground">{l.unit}</span>
                  </td>
                  <td className={cn("num px-3 py-2 text-end align-top", TONE[l.priceTone])}>{fmt2(l.inv.unitPrice)}</td>
                  <td className="num border-s border-border px-3 py-2 text-end align-top text-muted-foreground">{l.po ? fmtQty(l.po.qty, l.unit) : "—"}</td>
                  <td className="num px-3 py-2 text-end align-top text-muted-foreground">{l.po ? fmt2(l.po.unitPrice) : "—"}</td>
                  <td className="num border-s border-border px-3 py-2 text-end align-top text-muted-foreground">{l.grn ? fmtQty(l.grn.delivered, l.unit) : "—"}</td>
                  <td className={cn("num px-3 py-2 text-end align-top", TONE[l.qtyTone])}>{l.grn ? fmtQty(l.grn.accepted, l.unit) : "—"}</td>
                  <td className={cn("num px-3 py-2 text-end align-top", l.grn?.rejected ? "text-warning" : "text-muted-foreground")}>{l.grn ? fmtQty(l.grn.rejected, l.unit) : "—"}</td>
                  <td className={cn("num border-s border-border px-3 py-2 text-end align-top", TONE[l.lineTone])}>{fmt2(l.inv.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-3 text-[10.5px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-success-soft ring-1 ring-success/25" />{L({ en: "agrees", ar: "مطابق" })}</span>
          <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-warning-soft ring-1 ring-warning/25" />{L({ en: "within tolerance / below PO", ar: "ضمن التفاوت" })}</span>
          <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-danger-soft ring-1 ring-danger/25" />{L({ en: "exception", ar: "استثناء" })}</span>
        </div>
      </div>

      {/* Totals */}
      <div>
        <div className="label-caps mb-2">{L({ en: "Totals — as invoiced vs recomputed", ar: "الإجماليات — كما في الفاتورة مقابل إعادة الاحتساب" })}</div>
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="label-caps !text-[9.5px] px-3 py-2 text-start font-medium" />
                <th className="label-caps !text-[9.5px] px-3 py-2 text-end font-medium">{L({ en: "Invoice", ar: "الفاتورة" })}</th>
                <th className="label-caps !text-[9.5px] px-3 py-2 text-end font-medium">{L({ en: "Recomputed", ar: "المعاد احتسابه" })}</th>
                <th className="label-caps !text-[9.5px] px-3 py-2 text-end font-medium">Δ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(
                [
                  [L({ en: "Lines", ar: "البنود" }), inv.grossAmount, match.expected.gross, 1],
                  [L({ en: "Discount", ar: "الخصم" }), inv.discount ? Math.sign(inv.total) * inv.discount.amount : 0, match.expected.discount, 1],
                  [L({ en: "Taxable", ar: "الخاضع للضريبة" }), inv.taxableAmount, match.expected.taxable, 1],
                  [L({ en: "VAT 5%", ar: "الضريبة 5%" }), inv.vatAmount, match.expected.vat, 1],
                  [L({ en: "Total", ar: "الإجمالي" }), inv.total, match.expected.total, 1],
                ] as Array<[string, number, number, number]>
              ).map(([k, a, b], idx) => {
                const d = Math.round((a - b) * 100) / 100;
                return (
                  <tr key={idx} className={cn(idx === 4 && "font-medium")}>
                    <td className="px-3 py-1.5 text-muted-foreground">{k}</td>
                    <td className="num px-3 py-1.5 text-end">{fmt2(a)}</td>
                    <td className="num px-3 py-1.5 text-end">{fmt2(b)}</td>
                    <td className={cn("num px-3 py-1.5 text-end", Math.abs(d) >= 0.01 ? "text-danger" : "text-faint")}>{Math.abs(d) >= 0.01 ? fmt2(d) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
