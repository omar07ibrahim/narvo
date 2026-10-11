"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { CircleCheck, ChevronDown, FileText, MessageSquareText, ShieldCheck, TriangleAlert } from "lucide-react";
import { Markdown } from "@/components/narvo/markdown";
import { StatusPill } from "@/components/narvo/status";
import { useFormat, useL, usePrefs } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { fmtDay, fmtSlot } from "../_lib/calendar";
import { sourceLabel, supplyTimeline } from "../_lib/detect";
import { WH_LABEL, ZONE_AR, fmtNum, productOf } from "../_lib/rules";
import type { Bi, ExceptionType, OrderAnalysis, Snapshot, WorldAnalysis } from "../_lib/types";
import { Caps, ExposureBar, STATUS_LABEL, SeverityPill, TypeIcon } from "./bits";
import { StockChart } from "./stock-chart";

export function OrderDetail({ oa, snapshot, world }: { oa: OrderAnalysis; snapshot: Snapshot; world: WorldAnalysis }) {
  const L = useL();
  const f = useFormat();
  const { lang } = usePrefs();
  const o = oa.order;
  const m = snapshot.master;
  const st = STATUS_LABEL[o.status] ?? STATUS_LABEL.open;
  const byType = (t: ExceptionType) => oa.exceptions.filter((e) => e.type === t);

  const okText: Record<ExceptionType, Bi> = {
    stock: { en: `All open lines covered from ${WH_LABEL[o.shipFrom].en} or planned sources`, ar: `جميع البنود المفتوحة مغطاة من ${WH_LABEL[o.shipFrom].ar} أو مصادر مخططة` },
    price: {
      en: oa.customer.contractId ? `Prices match ${oa.customer.contractId} Q4 rates` : `Within the Tier ${oa.customer.tier} desk discount`,
      ar: oa.customer.contractId ? `الأسعار مطابقة لأسعار الربع الرابع في ${oa.customer.contractId}` : `ضمن خصم المكتب المسموح للفئة ${oa.customer.tier}`,
    },
    window: { en: `Slot fits ${oa.window.rule?.days ?? ""} ${oa.window.effectiveWindow}`, ar: `الموعد ضمن النافذة ${oa.window.effectiveWindow}` },
    credit: {
      en: `Exposure ${f.aed(oa.credit.exposure)} — ${fmtNum(oa.credit.pct * 100, 1)}% of limit`,
      ar: `التعرض ${f.aed(oa.credit.exposure)} — ${fmtNum(oa.credit.pct * 100, 1)}% من الحد`,
    },
  };
  const cardTitle: Record<ExceptionType, Bi> = {
    stock: { en: "Stock", ar: "المخزون" },
    price: { en: "Contract price", ar: "سعر العقد" },
    window: { en: "Site window", ar: "نافذة الموقع" },
    credit: { en: "Credit", ar: "الائتمان" },
  };

  const chartLine = useMemo(() => oa.lines.find((l) => l.short > 0) ?? oa.lines.find((l) => productOf(m, l.sku)?.category === "Steel"), [oa, m]);
  const chart = useMemo(() => (chartLine ? supplyTimeline(world, o.id, chartLine.lineNo) : []), [world, o.id, chartLine]);
  const chartUnit = chartLine ? productOf(m, chartLine.sku)?.unit ?? "" : "";
  const handovers = snapshot.handovers.filter((h) => h.orderId === o.id);
  const notices = snapshot.notifications.filter((n) => n.orderId === o.id);
  const cr = oa.credit;
  const limitEff = cr.limit + cr.release;

  return (
    <div className="@container space-y-5">
      {/* header */}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11.5px] text-muted-foreground">{o.id}</span>
          <StatusPill tone={st.tone}>{L(st)}</StatusPill>
          <SeverityPill s={oa.severity} />
          {o.resolution && (
            <StatusPill tone="success">
              {L({ en: "Resolution approved", ar: "المعالجة معتمدة" })} · {o.resolution.optionId}
            </StatusPill>
          )}
        </div>
        <h2 className="mt-1.5 text-[22px] leading-tight font-light tracking-tight" dir="auto">
          {lang === "ar" ? oa.customer.nameAr : o.customerName}
        </h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          {o.project} · {o.site}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border @2xl:grid-cols-4">
          {[
            [{ en: "Requested", ar: "الموعد المطلوب" }, fmtSlot(o.requestedDelivery, lang)],
            [{ en: "Promise", ar: "الموعد الملتزم" }, fmtDay(o.promiseDate, lang)],
            [{ en: "Zone · ships from", ar: "المنطقة · الشحن من" }, `${lang === "ar" ? ZONE_AR[o.zone] ?? o.zone : o.zone} · ${o.shipFrom}`],
            [{ en: "KAM · customer PO", ar: "مدير الحساب · أمر الشراء" }, `${o.kam} · ${o.customerPo}`],
          ].map(([k, v], i) => (
            <div key={i} className="bg-card px-3 py-2">
              <Caps>{L(k as Bi)}</Caps>
              <div className="mt-0.5 truncate text-[12.5px] font-medium" title={String(v)}>
                {String(v)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* four checks */}
      <div className="grid grid-cols-1 gap-2.5 @xl:grid-cols-2">
        {(["stock", "price", "window", "credit"] as ExceptionType[]).map((t) => {
          const ex = byType(t);
          const bad = ex.length > 0;
          return (
            <motion.div
              key={t}
              initial={{ opacity: 1, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={cn("rounded-md border p-3", bad ? (t === "credit" || t === "stock" ? "border-danger/25 bg-danger-soft/50" : "border-warning/30 bg-warning-soft/50") : "border-border bg-surface")}
            >
              <div className="flex items-center gap-1.5">
                <TypeIcon t={t} className={bad ? (t === "credit" || t === "stock" ? "text-danger" : "text-warning") : "text-muted-foreground"} />
                <Caps>{L(cardTitle[t])}</Caps>
                <span className="ms-auto">{bad ? <TriangleAlert className="size-3.5 text-warning" /> : <CircleCheck className="size-3.5 text-success" />}</span>
              </div>
              {bad ? (
                ex.map((e) => (
                  <div key={e.key} className="mt-1.5">
                    <div className="text-[12.5px] font-medium">{L(e.title)}</div>
                    <p className="mt-0.5 text-[11.5px] leading-relaxed text-foreground/75">{L(e.detail)}</p>
                  </div>
                ))
              ) : (
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">{L(okText[t])}</p>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* lines */}
      <div>
        <Caps className="mb-2">{L({ en: "Order lines — checks inline", ar: "بنود الطلب — مع نتائج الفحص" })}</Caps>
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                {[
                  { en: "#", ar: "#" },
                  { en: "Item", ar: "الصنف" },
                  { en: "Open", ar: "المفتوح" },
                  { en: "Entered", ar: "المُدخل" },
                  { en: "Reference", ar: "المرجعي" },
                  { en: "Stock", ar: "المخزون" },
                  { en: "Value", ar: "القيمة" },
                ].map((h, i) => (
                  <th key={i} className={cn("label-caps px-2.5 py-2 !text-[9.5px] font-medium", i >= 2 ? "text-end" : "text-start")}>
                    {L(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {oa.lines.map((l) => {
                const p = productOf(m, l.sku);
                const ol = o.lines.find((x) => x.lineNo === l.lineNo);
                return (
                  <tr key={l.lineNo} className="border-b border-border align-top last:border-0">
                    <td className="num px-2.5 py-2 text-muted-foreground">{l.lineNo}</td>
                    <td className="px-2.5 py-2">
                      <div className="font-mono text-[11px]">{l.sku}</div>
                      <div className="text-[11px] text-muted-foreground" dir="auto">
                        {lang === "ar" ? p?.nameAr : p?.name}
                      </div>
                      {(ol?.promiseDate || ol?.source || ol?.creditHold) && (
                        <div className="mt-1 flex flex-wrap items-center gap-1 text-[10.5px]">
                          <span className="rounded border border-border bg-surface px-1 py-px">{L(sourceLabel(l.source, snapshot))}</span>
                          {ol?.slot && <span className="rounded border border-ai/25 bg-ai-soft px-1 py-px text-ai">{fmtSlot(ol.slot, lang)}</span>}
                          {ol?.creditHold && <span className="rounded border border-warning/30 bg-warning-soft px-1 py-px text-warning">{L({ en: "Held — payment / CFO release", ar: "موقوف — بانتظار السداد أو الإفراج" })}</span>}
                        </div>
                      )}
                    </td>
                    <td className="num px-2.5 py-2 text-end whitespace-nowrap">
                      {fmtNum(l.openQty, Number.isInteger(l.openQty) ? 0 : 1)} <span className="text-muted-foreground">{lang === "ar" ? p?.unitAr : p?.unit}</span>
                    </td>
                    <td className={cn("num px-2.5 py-2 text-end", l.price.status !== "ok" && "font-medium text-warning")}>{fmtNum(l.unitPrice, 2)}</td>
                    <td className="num px-2.5 py-2 text-end text-muted-foreground">
                      {fmtNum(l.price.reference, 2)}
                      <div className="text-[10px] text-faint">{l.price.kind === "contract" ? l.price.contractId : L({ en: `list −${fmtNum((l.price.allowedDiscountPct ?? 0) * 100, 1)}%`, ar: `قائمة −${fmtNum((l.price.allowedDiscountPct ?? 0) * 100, 1)}%` })}</div>
                    </td>
                    <td className="num px-2.5 py-2 text-end whitespace-nowrap">
                      {l.short > 0 ? (
                        <span className="text-danger">
                          {fmtNum(l.allocated, 1)} / {fmtNum(l.openQty, 1)}
                          <div className="text-[10px]">{L({ en: `short ${fmtNum(l.short, 1)}`, ar: `نقص ${fmtNum(l.short, 1)}` })}</div>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-success">
                          <CircleCheck className="size-3" />
                          <span className="text-[11px]">{l.readyDate ? fmtDay(l.readyDate, lang).split(" ").slice(1).join(" ") : "✓"}</span>
                        </span>
                      )}
                    </td>
                    <td className="num px-2.5 py-2 text-end">{f.aed(l.openQty * l.unitPrice)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* credit + window */}
      <div className="grid grid-cols-1 gap-3 @3xl:grid-cols-2">
        <div className="rounded-md border border-border p-3.5">
          <div className="flex items-baseline justify-between gap-3">
            <Caps>{L({ en: "Customer credit — RBM-FIN-POL-04", ar: "ائتمان المتعامل — RBM-FIN-POL-04" })}</Caps>
            <span className={cn("num text-[20px] font-light", cr.over ? "text-danger" : "text-foreground")}>{fmtNum(cr.pct * 100, 1)}%</span>
          </div>
          <ExposureBar
            className="mt-3"
            limit={limitEff}
            max={limitEff * 1.12}
            segments={[
              { value: cr.ar, className: "bg-foreground/70", label: "AR" },
              { value: cr.priorOpen + cr.laterOpen, className: "bg-foreground/30", label: "Other open orders" },
              { value: cr.thisOrder, className: cr.over ? "bg-danger/70" : "bg-ai/70", label: "This order" },
            ]}
          />
          <div className="mt-3 space-y-1 text-[12px]">
            {[
              [{ en: "Approved limit", ar: "الحد المعتمد" }, f.aed(cr.limit) + (cr.release ? ` + ${f.aed(cr.release)}` : "")],
              [{ en: "AR outstanding", ar: "الذمم القائمة" }, `${f.aed(cr.ar)}${cr.overdue30 ? ` · ${L({ en: "overdue", ar: "متأخر" })} ${f.aed(cr.overdue30)}` : ""}`],
              [{ en: "Other open orders (incl. VAT)", ar: "طلبات مفتوحة أخرى (شاملة الضريبة)" }, f.aed(cr.priorOpen + cr.laterOpen)],
              [{ en: "This order (incl. VAT)", ar: "هذا الطلب (شامل الضريبة)" }, f.aed(cr.thisOrder) + (cr.heldValue ? ` · ${L({ en: "held", ar: "موقوف" })} ${f.aed(cr.heldValue)}` : "")],
            ].map(([k, v], i) => (
              <div key={i} className="flex justify-between gap-3">
                <span className="text-muted-foreground">{L(k as Bi)}</span>
                <span className="num text-end">{String(v)}</span>
              </div>
            ))}
            <div className="flex justify-between gap-3 border-t border-border pt-1.5 font-medium">
              <span>{cr.over ? L({ en: "Over limit by", ar: "تجاوز الحد بمقدار" }) : L({ en: "Headroom", ar: "الهامش المتاح" })}</span>
              <span className={cn("num", cr.over ? "text-danger" : "text-success")}>{f.aed(cr.over ? cr.overAmount : limitEff - cr.exposure)}</span>
            </div>
            {cr.commitment && (
              <div className="mt-1.5 rounded border border-info/25 bg-info-soft/50 px-2 py-1.5 text-[11.5px] leading-snug">
                <span className="font-medium">{L({ en: "Payment commitment", ar: "التزام بالسداد" })} {cr.commitment.id}:</span> {f.aed(cr.commitment.amount)} · {fmtDay(cr.commitment.date, lang)} · {cr.commitment.committedBy}
                <span className="block text-muted-foreground">
                  {L({ en: `Exposure after payment ${f.aed(cr.exposure - cr.commitment.amount)}`, ar: `التعرض بعد السداد ${f.aed(cr.exposure - cr.commitment.amount)}` })}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-md border border-border p-3.5">
          <Caps>{L({ en: "Site window — RBM-OPS-POL-11", ar: "نافذة الموقع — RBM-OPS-POL-11" })}</Caps>
          <div className="mt-2 text-[14px] font-light">{lang === "ar" ? ZONE_AR[o.zone] ?? o.zone : o.zone}</div>
          <div className="mt-2 space-y-1 text-[12px]">
            {[
              [{ en: "Days · window", ar: "الأيام · النافذة" }, `${lang === "ar" ? daysAr(oa.window.rule?.days ?? "—") : (oa.window.rule?.days ?? "—")} · ${oa.window.effectiveWindow}`],
              [{ en: "Gate", ar: "البوابة" }, oa.window.rule?.gate ?? "—"],
              [{ en: "Vehicle", ar: "المركبة" }, oa.window.rule?.maxVehicle ?? "—"],
              [{ en: "Gate permit", ar: "تصريح البوابة" }, o.gatePermit ? `${o.gatePermit.ref} · ${fmtDay(o.gatePermit.date, lang)}` : L({ en: "Not booked", ar: "غير محجوز" })],
            ].map(([k, v], i) => (
              <div key={i} className="flex justify-between gap-3">
                <span className="shrink-0 text-muted-foreground">{L(k as Bi)}</span>
                <span className="text-end">{String(v)}</span>
              </div>
            ))}
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <div className={cn("rounded border px-2 py-1.5", oa.window.ok ? "border-border bg-surface" : "border-warning/30 bg-warning-soft/60")}>
              <Caps>{L({ en: "Requested", ar: "المطلوب" })}</Caps>
              <div className="num mt-0.5 text-[12.5px] font-medium">{fmtSlot(oa.window.perLine?.[0]?.slot ?? o.requestedDelivery, lang)}</div>
            </div>
            <div className="rounded border border-ai/25 bg-ai-soft/60 px-2 py-1.5">
              <Caps>{L({ en: "Next valid slot", ar: "أقرب موعد صالح" })}</Caps>
              <div className="num mt-0.5 text-[12.5px] font-medium text-ai">{fmtSlot(oa.window.nextSlot, lang)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* stock chart */}
      {chartLine && chart.length > 0 && (
        <div className="rounded-md border border-border p-3.5">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <Caps>
              {L({ en: `Available vs required — ${chartLine.sku} for this order`, ar: `المتاح مقابل المطلوب — ${chartLine.sku} لهذا الطلب` })}
            </Caps>
            <span className="text-[11px] text-muted-foreground">
              {L({ en: "Allocated by promise date; inbound deliverable the day after receipt", ar: "التخصيص حسب الموعد؛ الوارد قابل للتسليم في اليوم التالي للاستلام" })}
            </span>
          </div>
          <StockChart data={chart} unit={chartUnit} maintenanceEnd="2026-10-19" showTransfer={chartLine.coverage.some((c) => c.kind === "transfer")} />
          {chartLine.coverage.length > 0 && (
            <ul className="mt-3 divide-y divide-border rounded border border-border text-[11.5px]">
              {chartLine.coverage.map((c, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-2.5 py-1.5">
                  <span className="min-w-0 truncate" title={L(c.label)}>
                    {L(c.label)}
                  </span>
                  <span className="num shrink-0 text-muted-foreground">
                    {L({ en: "from", ar: "من" })} {fmtDay(c.deliverableFrom, lang)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* resolution record */}
      {o.resolution && (
        <div className="rounded-md border border-success/30 bg-success-soft/40 p-3.5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-success" />
            <span className="text-[13px] font-medium">
              {L({ en: "Approved resolution", ar: "المعالجة المعتمدة" })} — {o.resolution.optionId}: {o.resolution.title}
            </span>
          </div>
          <p className="mt-1.5 text-[12px] leading-relaxed text-foreground/80">{o.resolution.summary}</p>
          {o.creditRelease && (
            <p className="mt-1 text-[12px] text-foreground/80">
              {L({ en: "Temporary credit release", ar: "إفراج ائتماني مؤقت" })} {o.creditRelease.ref}: {f.aed(o.creditRelease.amount)} · {L({ en: "valid until", ar: "صالح حتى" })} {fmtDay(o.creditRelease.validUntil, lang)} · {o.creditRelease.approvedBy}
            </p>
          )}
          <div className="mt-2.5 space-y-2">
            {handovers.map((h) => (
              <Record key={h.id} icon={<FileText className="size-3.5" />} title={L({ en: `Billing handover → ${h.to}`, ar: `مذكرة تسليم للفوترة ← ${h.to}` })} body={h.body} />
            ))}
            {notices.map((n) => (
              <Record
                key={n.id}
                icon={<MessageSquareText className="size-3.5" />}
                title={L({ en: `Customer notice (${n.channel === "whatsapp" ? "WhatsApp" : "e-mail"}) → ${n.recipient}`, ar: `إشعار المتعامل (${n.channel === "whatsapp" ? "واتساب" : "بريد"}) ← ${n.recipient}` })}
                body={lang === "ar" ? n.ar : n.en}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Record({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded border border-border bg-card">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-2.5 py-2 text-start text-[12px]">
        <span className="text-muted-foreground">{icon}</span>
        <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
        <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="border-t border-border px-3 py-2.5">
          <Markdown className="!text-[12.5px]">{body}</Markdown>
        </div>
      )}
    </div>
  );
}

const DAY_AR: Record<string, string> = { Mon: "الإثنين", Tue: "الثلاثاء", Wed: "الأربعاء", Thu: "الخميس", Fri: "الجمعة", Sat: "السبت", Sun: "الأحد" };
/** "Mon–Sat" → "الإثنين–السبت" (site rules are kept in English in the master data). */
function daysAr(s: string): string {
  return s.replace(/(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/g, (d) => DAY_AR[d] ?? d);
}
