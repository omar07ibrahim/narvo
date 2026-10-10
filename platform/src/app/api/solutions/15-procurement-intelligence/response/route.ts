import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { addAudit, patchRecord } from "@/lib/store/db";
import { COL, SOL, getClarifications, getEvals, getSuppliers, loadTender, putEval } from "@/app/solutions/15-procurement-intelligence/_lib/server";
import { applyResponse } from "@/app/solutions/15-procurement-intelligence/_lib/ai";

export const maxDuration = 120;

/** A supplier's clarification response is evaluated; the comparison matrix and gates update. */
export async function POST(req: Request) {
  const body = await readBody<{ supplierId: string; text: string }>(req);
  const { modelKey, lang } = getPrefs(req, body);
  if (!body.text || body.text.trim().length < 40) return new Response(lang === "ar" ? "نص الرد قصير جداً" : "Response text is too short", { status: 400 });

  return eventStream(
    req,
    async (emit) => {
      const tender = loadTender();
      const supplier = getSuppliers().find((s) => s.id === body.supplierId);
      if (!supplier) throw new Error("Unknown supplier");
      const ev = getEvals()[supplier.id];
      if (!ev) throw new Error(lang === "ar" ? "قيّم العرض أولاً" : "Evaluate the submission first");
      const clar = getClarifications().find((c) => c.supplierId === supplier.id);

      const s1 = emit.step("read", lang === "ar" ? `قراءة رد ${supplier.short}${clar ? ` على ${clar.ref}` : ""}` : `Reading ${supplier.short}'s response${clar ? ` to ${clar.ref}` : ""}`);
      s1.done(`${body.text.split(/\s+/).length} ${lang === "ar" ? "كلمة" : "words"}`);

      const s2 = emit.step("update", lang === "ar" ? "تحديث التقييم للبنود التي تناولها الرد فقط" : "Updating only the items the response addresses");
      const res = await applyResponse({ emit, lang, modelKey }, { tender, supplier, ev, clar, response: body.text });
      s2.done(res.changes.map((c) => `${c.id}: ${c.from} → ${c.to}`).join(" · ") || (lang === "ar" ? "لا تغييرات" : "no changes"));

      if (res.priceChange) {
        const s = emit.step("price", lang === "ar" ? "تنبيه: الرد يحاول تعديل السعر — لم يُعتدّ به (المادة 29)" : "Flag: response attempts a price change — not credited (Art. 29)");
        s.error();
      }

      if (res.certificate?.expiry && /^\d{4}-\d{2}-\d{2}$/.test(res.certificate.expiry)) {
        const s3 = emit.step("register", lang === "ar" ? "تحديث سجل شهادات المورد" : "Updating the supplier's certificate register");
        const std = res.certificate.standard.replace(/[^0-9]/g, "");
        const certs = supplier.certificates.map((c) =>
          c.standard.replace(/[^0-9]/g, "") === std ? { ...c, number: res.certificate!.number, expiry: res.certificate!.expiry, updatedBy: clar?.ref ?? "clarification response", note: `Previously ${c.number}, expiry ${c.expiry}` } : c,
        );
        patchRecord(COL.suppliers, supplier.id, { certificates: certs });
        res.changes.push({ at: Date.now(), kind: "certificate", id: res.certificate.standard, from: supplier.certificates.find((c) => c.standard.replace(/[^0-9]/g, "") === std)?.expiry ?? "—", to: res.certificate.expiry, note: res.certificate.number });
        res.next.history = [...res.next.history, res.changes.at(-1)!];
        s3.done(`${res.certificate.standard} ${res.certificate.number} → ${res.certificate.expiry}`);
      }

      putEval(res.next);
      if (clar) patchRecord(COL.clar, clar.id, { status: "answered", answeredAt: Date.now(), responseExcerpt: body.text.slice(0, 600), priceChangeAttempt: res.priceChange });
      addAudit({
        solution: SOL,
        actor: { name: "Shamma Khalid Al Mansoori", role: "Committee secretary", kind: "human" },
        action: "Recorded clarification response",
        subject: `${clar?.ref ?? tender.ref} — ${supplier.name}`,
        detail: `${res.summary} ${res.changes.map((c) => `${c.id}: ${c.from} → ${c.to}`).join("; ")}`.slice(0, 400),
      });
      emit.data(`eval:${supplier.id}`, res.next);
      emit.data("changes", { supplierId: supplier.id, changes: res.changes, summary: res.summary, priceChange: res.priceChange });
      emit.data("suppliers", getSuppliers());
    },
    { modelKey },
  );
}
