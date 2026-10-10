import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { addAudit, appendRecord, kvSet } from "@/lib/store/db";
import { DEMO_TODAY } from "@/lib/world/orgs";
import { COL_INVOICES, kvUploadKey, matchContext, saveExtraction, SLUG } from "@/app/solutions/14-finance-operations/_lib/data";
import { extractInvoiceImage } from "@/app/solutions/14-finance-operations/_lib/extract";
import { compareExtraction } from "@/app/solutions/14-finance-operations/_lib/compare";
import { findCandidatePo, fmt2, matchInvoice, r2 } from "@/app/solutions/14-finance-operations/_lib/three-way";
import type { Invoice, InvoiceLine, Supplier } from "@/app/solutions/14-finance-operations/_lib/types";

export const maxDuration = 300;

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/l\.l\.c|llc|fzco|co\.|pjsc|trading|services|\./g, " ")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);

function identifySupplier(suppliers: Supplier[], trn: string | null, name: string | null): { supplier: Supplier | null; by: "trn" | "name" | null } {
  const t = (trn ?? "").replace(/\D/g, "");
  if (t) {
    const s = suppliers.find((x) => x.trn === t);
    if (s) return { supplier: s, by: "trn" };
  }
  if (name) {
    const w = words(name);
    let best: { s: Supplier; score: number } | null = null;
    for (const s of suppliers) {
      const sw = words(s.name);
      const score = sw.filter((x) => w.includes(x)).length / Math.max(1, sw.length);
      if (!best || score > best.score) best = { s, score };
    }
    if (best && best.score >= 0.5) return { supplier: best.s, by: "name" };
  }
  return { supplier: null, by: null };
}

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Bring your own invoice: read it, identify supplier / PO / GRN, register it in the AP queue and run the same checks. */
export async function POST(req: Request) {
  const body = await readBody<{ dataUrl?: string; fileName?: string }>(req);
  const { modelKey, lang } = getPrefs(req, body);
  const ar = lang === "ar";
  if (typeof body.dataUrl !== "string" || !/^data:image\/(png|jpe?g|webp);base64,/.test(body.dataUrl))
    return Response.json({ error: "Send an invoice image (PNG, JPG or WebP) as a data URL" }, { status: 400 });
  if (body.dataUrl.length > 14_000_000) return Response.json({ error: "Image too large (max ~10 MB)" }, { status: 413 });
  const dataUrl = body.dataUrl;

  return eventStream(
    req,
    async (emit) => {
      const ctx = matchContext();
      const s1 = emit.step("read", ar ? "قراءة المستند المرفوع بنموذج الرؤية" : "Reading the uploaded document with the vision model", body.fileName);
      const r = await extractInvoiceImage({ dataUrl, products: ctx.master.products, modelKey, lang, task: "byo.extract" });
      const x = r.object;
      emit.data("extraction", { at: Date.now(), ms: r.ms, model: r.model, object: x });
      s1.done(`${x.supplierName ?? "?"} · ${x.invoiceNo ?? "?"} · ${x.total != null ? `AED ${fmt2(x.total)}` : "?"}`);

      const s2 = emit.step("supplier", ar ? "تحديد المورد من دليل الموردين" : "Identifying the supplier in the approved directory");
      const { supplier, by } = identifySupplier(ctx.suppliers, x.supplierTrn, x.supplierName);
      if (supplier) s2.done(`${supplier.name} · ${by === "trn" ? `TRN ${supplier.trn}` : ar ? "بالاسم (لا رقم ضريبي مطابق)" : "by name (no matching TRN)"}`);
      else s2.error(ar ? "المورد غير موجود في الدليل المعتمد" : "Supplier not in the approved directory");

      // Build the document record from what was read.
      const s3 = emit.step("register", ar ? "تسجيل المستند وتحديد أمر الشراء" : "Registering the document and locating the PO");
      const n = ctx.invoices.filter((i) => i.source === "upload").length + 1;
      const id = `AP-26-10-U${String(n).padStart(2, "0")}`;
      const isCredit = x.documentType === "credit_note";
      const lines: InvoiceLine[] = x.lines.map((l, i) => {
        const qty = Math.abs(l.qty ?? 0);
        const unitPrice = Math.abs(l.unitPrice ?? (l.amount != null && qty ? l.amount / qty : 0));
        const amount = Math.abs(l.amount ?? r2(qty * unitPrice));
        return {
          lineNo: i + 1,
          kind: l.isCharge ? "charge" : "item",
          sku: l.isCharge ? null : (l.sku ?? null),
          description: l.description,
          qty: isCredit ? -qty : qty,
          unit: l.unit?.toLowerCase() === "m2" ? "m²" : (l.unit ?? "").toLowerCase() || "unit",
          unitPrice,
          amount: isCredit ? -amount : amount,
        };
      });
      const gross = x.grossAmount ?? r2(lines.reduce((a, l) => a + Math.abs(l.amount), 0));
      const disc = x.discountAmount ?? 0;
      const taxable = x.taxableAmount ?? r2(gross - disc);
      const vat = x.vatAmount ?? 0;
      const total = x.total ?? r2(taxable + vat);
      const itemGross = lines.filter((l) => l.kind === "item").reduce((a, l) => a + Math.abs(l.amount), 0);
      const sgn = isCredit ? -1 : 1;
      const invoiceDate = x.invoiceDate && /^\d{4}-\d{2}-\d{2}$/.test(x.invoiceDate) ? x.invoiceDate : DEMO_TODAY;
      const refs = x.deliveryRefs ?? [];
      const draft: Invoice = {
        id,
        docType: isCredit ? "credit_note" : "invoice",
        supplierId: supplier?.id ?? "SUP-UNKNOWN",
        supplierName: supplier?.name ?? x.supplierName ?? "Unknown supplier",
        supplierInvoiceNo: x.invoiceNo ?? `UNNUMBERED-${n}`,
        invoiceDate,
        receivedDate: DEMO_TODAY,
        channel: "upload",
        poRef: (x.poRef ?? "").toUpperCase().replace(/\s+/g, ""),
        grnRefs: refs.filter((r) => /^GRN-/i.test(r)).map((r) => r.toUpperCase()),
        deliveryNoteRefs: refs.filter((r) => !/^GRN-/i.test(r)),
        lines,
        grossAmount: gross * sgn,
        discount: disc ? { label: "Discount", pct: itemGross ? r2((disc / itemGross) * 100) : 0, amount: disc } : null,
        taxableAmount: taxable * sgn,
        vatRate: ctx.vatRate,
        vatAmount: vat * sgn,
        total: total * sgn,
        currency: "AED",
        trnOnInvoice: x.supplierTrn,
        image: `/api/solutions/${SLUG}/upload/${id}`,
        dueDate: addDays(invoiceDate, supplier?.paymentTermsDays ?? 30),
        paymentTermsDays: supplier?.paymentTermsDays ?? 30,
        relatedInvoiceNo: null,
        reason: null,
        note: null,
        status: "received",
        source: "upload",
      };
      const quotedOk = !!ctx.pos.find((p) => p.id === draft.poRef && p.supplierId === draft.supplierId);
      const candidate = !quotedOk && supplier ? findCandidatePo(draft, { ...ctx, invoices: ctx.invoices }) : null;
      kvSet(kvUploadKey(id), dataUrl);
      appendRecord(COL_INVOICES, draft as unknown as Record<string, unknown> & { id: string });
      s3.done(
        quotedOk
          ? `${id} · ${draft.poRef}`
          : candidate
            ? `${id} · ${draft.poRef || (ar ? "لا يوجد رقم أمر شراء" : "no PO quoted")} → ${ar ? "المرشح" : "candidate"} ${candidate.id}`
            : `${id} · ${draft.poRef || (ar ? "لا يوجد رقم أمر شراء" : "no PO quoted")} — ${ar ? "لا يوجد أمر شراء مطابق" : "no matching PO"}`,
      );

      const s4 = emit.step("match", ar ? "المطابقة الثلاثية وفق RG-FIN-POL-09" : "Three-way match under RG-FIN-POL-09 rev. 4");
      const all = [draft, ...ctx.invoices];
      const match = matchInvoice(draft, { ...ctx, invoices: all });
      const fields = compareExtraction(x, draft, supplier ?? undefined, ctx.master.company.trn, match);
      saveExtraction(id, { at: Date.now(), ms: r.ms, model: r.model, object: x });
      emit.data("match", match);
      emit.data("fields", fields);
      emit.data("registered", { id, exception: match.exception, primary: match.primary, variance: match.variance, invoiceNo: draft.supplierInvoiceNo, supplier: draft.supplierName, total: draft.total });
      const fails = match.checks.filter((c) => c.status === "fail");
      s4.done(
        fails.length
          ? ar
            ? `${fails.length} فحوصات غير مطابقة · الفرق ${fmt2(match.variance)} درهم — يمكن فتح ملف معالجة`
            : `${fails.length} failed (${fails.map((c) => c.label.en.toLowerCase()).join(", ")}) · variance AED ${fmt2(match.variance)} — ready for a resolution case`
          : ar
            ? "مطابقة كاملة — جاهزة للسداد في تاريخ الاستحقاق"
            : "Clean match — ready for payment on the due date",
      );
      addAudit({
        solution: SLUG,
        actor: { name: "NARVO Agent", role: "AI agent", kind: "agent" },
        action: "Uploaded invoice read, registered and matched",
        subject: `${id} · ${draft.supplierInvoiceNo} · ${draft.supplierName}`,
        detail: fails.length ? `${fails.length} checks failed · variance AED ${fmt2(match.variance)}` : "Clean three-way match",
        model: r.model,
      });
    },
    { modelKey },
  );
}
