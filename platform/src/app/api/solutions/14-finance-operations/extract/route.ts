import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { addAudit, kvGet } from "@/lib/store/db";
import { publicImageDataUrl } from "@/lib/world/data";
import { kvUploadKey, loadExtractions, matchContext, saveExtraction, SLUG } from "@/app/solutions/14-finance-operations/_lib/data";
import { extractInvoiceImage } from "@/app/solutions/14-finance-operations/_lib/extract";
import { compareExtraction } from "@/app/solutions/14-finance-operations/_lib/compare";
import { matchInvoice } from "@/app/solutions/14-finance-operations/_lib/three-way";

export const maxDuration = 300;

/** Read a supplier invoice image with the vision model and compare every field with the registered record. */
export async function POST(req: Request) {
  const body = await readBody<{ invoiceId?: string; force?: boolean }>(req);
  const { modelKey, lang } = getPrefs(req, body);
  const ar = lang === "ar";
  const ctx = matchContext();
  const inv = ctx.invoices.find((i) => i.id === body.invoiceId);
  if (!inv) return Response.json({ error: "Unknown document" }, { status: 404 });
  if (!inv.image) return Response.json({ error: "This document was received electronically — there is no image to read" }, { status: 400 });
  const dataUrl = inv.image.startsWith("/api/") ? kvGet<string>(kvUploadKey(inv.id)) : publicImageDataUrl(inv.image);
  if (!dataUrl) return Response.json({ error: "Image not found" }, { status: 404 });
  const supplier = ctx.suppliers.find((s) => s.id === inv.supplierId);

  return eventStream(
    req,
    async (emit) => {
      const s0 = emit.step("load", ar ? "تحميل صورة المستند" : "Loading the scanned document", `${inv.supplierInvoiceNo} · ${inv.image}`);
      s0.done(ar ? `${inv.supplierName} · مستلمة ${inv.receivedDate}` : `${inv.supplierName} · received ${inv.receivedDate} via ${inv.channel}`);

      const cached = body.force ? undefined : loadExtractions()[inv.id];
      let x = cached;
      if (cached) {
        const s = emit.step("read", ar ? "استخدام القراءة المحفوظة" : "Using the saved reading");
        s.done(ar ? `قُرئت سابقاً بواسطة ${cached.model.split("/").pop()} في ${new Date(cached.at).toLocaleTimeString("en-GB")}` : `Read earlier by ${cached.model.split("/").pop()} at ${new Date(cached.at).toLocaleTimeString("en-GB")} — use “Read again” for a fresh pass`);
      } else {
        const s = emit.step("read", ar ? "قراءة الفاتورة بنموذج الرؤية" : "Reading the invoice with the vision model");
        const r = await extractInvoiceImage({ dataUrl, products: ctx.master.products, modelKey, lang, task: "extract.invoice" });
        x = { at: Date.now(), ms: r.ms, model: r.model, object: r.object };
        saveExtraction(inv.id, x);
        s.done(
          ar
            ? `${r.object.lines.length} بنود · الإجمالي ${r.object.total ?? "؟"} · ${(r.ms / 1000).toFixed(1)} ث`
            : `${r.object.lines.length} line${r.object.lines.length === 1 ? "" : "s"} · total ${r.object.total?.toLocaleString("en-US", { minimumFractionDigits: 2 }) ?? "?"} · ${(r.ms / 1000).toFixed(1)} s`,
        );
      }
      emit.data("extraction", x);

      const s2 = emit.step("compare", ar ? "مقارنة الحقول مع سجل النظام" : "Comparing every field with the system record");
      const match = matchInvoice(inv, ctx);
      const fields = compareExtraction(x!.object, inv, supplier, ctx.master.company.trn, match);
      emit.data("fields", fields);
      const bad = fields.filter((f) => f.status === "mismatch").length;
      const missing = fields.filter((f) => f.status === "missing").length;
      s2.done(
        ar
          ? `${fields.length} حقلاً · ${fields.length - bad - missing} مطابق · ${bad} مختلف · ${missing} مفقود`
          : `${fields.length} fields · ${fields.length - bad - missing} agree · ${bad} differ · ${missing} missing`,
      );
      if (!cached)
        addAudit({
          solution: SLUG,
          actor: { name: "NARVO Agent", role: "AI agent", kind: "agent" },
          action: "Invoice image read and compared",
          subject: `${inv.id} · ${inv.supplierInvoiceNo}`,
          detail: `${fields.length} fields · ${bad} differ · ${missing} missing`,
          model: x!.model,
        });
    },
    { modelKey },
  );
}
