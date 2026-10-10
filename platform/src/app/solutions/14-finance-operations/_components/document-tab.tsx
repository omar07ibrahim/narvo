"use client";

import { FileText, RefreshCw, ScanText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DocumentViewer } from "@/components/narvo/document-viewer";
import { EmptyState, ThinkingLines } from "@/components/narvo/empty";
import { FieldTable, type ExtractedField } from "@/components/narvo/field-table";
import { RunButton } from "@/components/narvo/run-button";
import { useFormat, useL } from "@/lib/i18n";
import type { NarvoRun } from "@/hooks/use-narvo-run";
import { fmt2, fmtQty } from "../_lib/three-way";
import type { FieldCompare, Invoice, StoredExtraction } from "../_lib/types";
import { CHANNEL_LABEL, errorText } from "./labels";

export function DocumentTab({
  inv,
  run,
  live,
  stored,
  storedFields,
  onRead,
}: {
  inv: Invoice;
  run: NarvoRun;
  /** true when `run` belongs to this document */
  live: boolean;
  stored?: StoredExtraction;
  storedFields?: FieldCompare[];
  onRead: (force: boolean) => void;
}) {
  const L = useL();
  const f = useFormat();
  const running = live && run.running;
  const x: StoredExtraction | undefined = (live && run.data.extraction) || stored;
  const fields: FieldCompare[] | undefined = (live && run.data.fields) || storedFields;

  if (!inv.image) {
    return (
      <div className="space-y-4">
        <EmptyState icon={<FileText className="size-4" />} title={L({ en: "Received as an electronic invoice", ar: "مستلمة كفاتورة إلكترونية" })}>
          {L({
            en: `${inv.supplierInvoiceNo} arrived via ${L(CHANNEL_LABEL[inv.channel] ?? { en: inv.channel, ar: inv.channel })} with structured data, so there is no scan to read. The three-way match uses the registered fields below.`,
            ar: `وصلت ${inv.supplierInvoiceNo} عبر ${L(CHANNEL_LABEL[inv.channel] ?? { en: inv.channel, ar: inv.channel })} ببيانات منظمة، فلا توجد صورة للقراءة. تعتمد المطابقة الثلاثية على الحقول المسجلة أدناه.`,
          })}
        </EmptyState>
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-[12px]">
            <tbody className="divide-y divide-border">
              {inv.lines.map((l) => (
                <tr key={l.lineNo}>
                  <td className="px-3 py-2 font-mono text-[11px]">{l.sku ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{l.description}</td>
                  <td className="num px-3 py-2 text-end">
                    {fmtQty(Math.abs(l.qty), l.unit)} {l.unit} × {fmt2(l.unitPrice)}
                  </td>
                  <td className="num px-3 py-2 text-end">{fmt2(l.amount)}</td>
                </tr>
              ))}
              <tr className="bg-muted/40">
                <td colSpan={3} className="px-3 py-2 text-muted-foreground">
                  {L({ en: "VAT", ar: "الضريبة" })} {fmt2(inv.vatAmount)} · TRN {inv.trnOnInvoice ?? "—"}
                </td>
                <td className="num px-3 py-2 text-end font-medium">{fmt2(inv.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const tableFields: ExtractedField[] = (fields ?? []).map((fc) => ({
    key: fc.key,
    label: L(fc.label),
    value: fc.extracted,
    confidence: fc.confidence,
    status: fc.status,
    note: [fc.status !== "ok" && fc.system ? `${L({ en: "System", ar: "النظام" })}: ${fc.system}` : null, fc.note ? L(fc.note) : null].filter(Boolean).join(" · ") || undefined,
  }));
  const agree = (fields ?? []).filter((x) => x.status === "ok").length;

  return (
    <div className="@container">
      <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <DocumentViewer src={inv.image} title={`${inv.supplierInvoiceNo} — ${inv.supplierName}`} height={620} />
        <div className="min-w-0 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="label-caps">{L({ en: "AI reading vs system record", ar: "قراءة الذكاء الاصطناعي مقابل سجل النظام" })}</div>
              {x && !running && (
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {x.model.split("/").pop()} · {(x.ms / 1000).toFixed(1)} s · {f.time(x.at)}
                </div>
              )}
            </div>
            {x && !running ? (
              <Button size="sm" variant="outline" onClick={() => onRead(true)}>
                <RefreshCw />
                {L({ en: "Read again", ar: "إعادة القراءة" })}
              </Button>
            ) : (
              <RunButton running={running} onRun={() => onRead(false)} icon={<ScanText />} size="sm">
                {L({ en: "Read with AI", ar: "القراءة بالذكاء الاصطناعي" })}
              </RunButton>
            )}
          </div>

          {running && !fields && (
            <div className="rounded-md border border-border p-4">
              <p className="mb-3 text-[12px] text-muted-foreground">
                {L({ en: "The vision model is transcribing the scan — header, lines, totals and TRN…", ar: "يقوم نموذج الرؤية بنسخ المستند — الترويسة والبنود والإجماليات والرقم الضريبي…" })}
              </p>
              <ThinkingLines lines={7} />
            </div>
          )}
          {live && run.status === "error" && (
            <div className="rounded-md border border-danger/25 bg-danger-soft p-3 text-[12px] text-danger">
              {errorText(run.error)}
              <Button size="sm" variant="outline" className="ms-3" onClick={() => onRead(true)}>
                {L({ en: "Retry", ar: "إعادة المحاولة" })}
              </Button>
            </div>
          )}
          {!x && !running && run.status !== "error" && (
            <EmptyState icon={<ScanText className="size-4" />} title={L({ en: "Not read yet", ar: "لم تُقرأ بعد" })} className="rounded-md border border-dashed border-border py-10">
              {L({
                en: "Read the supplier's scan with the on-premises vision model and compare every field with what AP registered.",
                ar: "اقرأ مسح المورد بنموذج الرؤية المحلي وقارن كل حقل بما سجّله فريق الحسابات الدائنة.",
              })}
            </EmptyState>
          )}

          {fields && (
            <>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px]">
                <span className="text-success">
                  {agree} {L({ en: "agree", ar: "مطابق" })}
                </span>
                <span className="text-warning">
                  {fields.filter((x) => x.status === "mismatch" || x.status === "check").length} {L({ en: "to check", ar: "للتحقق" })}
                </span>
                <span className="text-danger">
                  {fields.filter((x) => x.status === "missing").length} {L({ en: "missing", ar: "مفقود" })}
                </span>
              </div>
              <FieldTable fields={tableFields} dense />
            </>
          )}

          {x && (
            <div className="space-y-3">
              <div>
                <div className="label-caps mb-1.5">{L({ en: "Lines as read", ar: "البنود كما قُرئت" })}</div>
                <div className="overflow-hidden rounded-md border border-border">
                  <table className="w-full text-[11.5px]">
                    <tbody className="divide-y divide-border">
                      {x.object.lines.map((l, i) => (
                        <tr key={i} className={l.isCharge ? "bg-warning-soft/50" : undefined}>
                          <td className="px-2.5 py-1.5">
                            <div className="font-mono text-[10.5px]">{l.sku ?? (l.isCharge ? L({ en: "charge", ar: "رسوم" }) : "—")}</div>
                            <div className="text-muted-foreground" dir="auto">
                              {l.description}
                            </div>
                          </td>
                          <td className="num px-2.5 py-1.5 text-end whitespace-nowrap">
                            {l.qty ?? "?"} {l.unit ?? ""} × {l.unitPrice != null ? fmt2(l.unitPrice) : "?"}
                          </td>
                          <td className="num px-2.5 py-1.5 text-end">{l.amount != null ? fmt2(l.amount) : "?"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {x.object.observations.length > 0 && (
                <div>
                  <div className="label-caps mb-1.5">{L({ en: "Model observations", ar: "ملاحظات النموذج" })}</div>
                  <ul className="space-y-1 border-s-2 border-ai/40 ps-3 text-[12px] text-muted-foreground" dir="auto">
                    {x.object.observations.map((o, i) => (
                      <li key={i}>{o}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
