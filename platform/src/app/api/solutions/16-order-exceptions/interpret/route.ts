import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { generateObject } from "@/lib/ai/json";
import { addAudit } from "@/lib/store/db";
import { loadCustomerDocs, loadSnapshot, markOpened, saveProposal } from "@/app/solutions/16-order-exceptions/_lib/data";
import { ExtractionSchema } from "@/app/solutions/16-order-exceptions/_lib/schemas";
import { ORG_CONTEXT, calendarText, catalogueText, langLine, orderContext } from "@/app/solutions/16-order-exceptions/_lib/prompts";
import { buildProposal, diffForProposal, verifyQuote, type Extraction } from "@/app/solutions/16-order-exceptions/_lib/proposal";
import { SLUG } from "@/app/solutions/16-order-exceptions/_lib/rules";
import type { SalesOrder } from "@/app/solutions/16-order-exceptions/_lib/types";

export const maxDuration = 120;

function normaliseRef(r: string | null | undefined) {
  if (!r) return null;
  const m = r.match(/(?:SO[-\s]?26[-\s]?)?(1\d{4})/i);
  return m ? `SO-26-${m[1]}` : null;
}

export async function POST(req: Request) {
  const body = await readBody<{ text?: string; orderId?: string; docId?: string; docTitle?: string }>(req);
  const { modelKey, lang } = getPrefs(req, body);
  const ar = lang === "ar";
  const text = (body.text ?? "").trim();
  if (text.length < 12) return Response.json({ error: "Paste the customer's message (at least a sentence)." }, { status: 400 });
  if (text.length > 12000) return Response.json({ error: "Message too long (max 12,000 characters)." }, { status: 400 });
  const snapshot = loadSnapshot();
  if (body.orderId && !snapshot.orders.some((o) => o.id === body.orderId)) return Response.json({ error: `Order ${body.orderId} not found` }, { status: 404 });
  const sample = body.docId ? loadCustomerDocs().find((d) => d.id === body.docId) : undefined;
  const docTitle = body.docTitle || (sample ? sample.title.en : ar ? "رسالة متعامل" : "Customer message");

  return eventStream(
    req,
    async (emit) => {
      const selected = body.orderId ? snapshot.orders.find((o) => o.id === body.orderId) : undefined;

      const s1 = emit.step("read", ar ? "قراءة رسالة المتعامل واستخراج التغييرات المطلوبة" : "Reading the customer message");
      const { object } = await generateObject({
        schema: ExtractionSchema,
        name: "order_change_request",
        system: [
          ORG_CONTEXT,
          "You are the order-desk assistant. You read customer messages — WhatsApp chats in Gulf Arabic, English e-mails, PO amendments, often mixed and with typos — and extract exactly what the customer asks to change on a sales order.",
          calendarText(),
          "Rules:",
          "- Resolve relative dates ('tomorrow', 'باجر', 'Sunday', 'Monday 9:30') against the message's own date stamp using the CALENDAR above (look the weekday up — do not compute it); output YYYY-MM-DDTHH:mm (24 h, Gulf time). In the summary, name weekday and date exactly as in the calendar.",
          "- requestedDelivery.primary = what they ask for first; alternatives = fallbacks they explicitly accept.",
          "- Map items to RBM SKUs from the catalogue; rebar sizes: 12mm → RB-B500-12, 16mm → RB-B500-16 etc. Quantities in tonnes for rebar. If tiles are given in boxes, keep the number of boxes and set unit 'box'.",
          "- change_qty qty = the new total quantity for that item; add qty = quantity to add.",
          "- priceClaims: any unit price the customer insists on (with their basis). Do not judge it.",
          "- split: whether they accept a partial delivery, the minimum first drop and the date the balance is needed by.",
          "- paymentCommitment: amount and date if they promise to pay.",
          "- evidence: copy a SHORT exact fragment (≤ 100 characters) from the message in its original language — never translate or paraphrase evidence.",
          "- Do not invent anything that is not in the message. Use null / empty arrays when absent.",
          `- ${langLine(lang)} (summary and descriptions only; evidence stays verbatim).`,
          "",
          "RBM CATALOGUE",
          catalogueText(snapshot),
        ].join("\n"),
        user: [
          selected ? `Order currently open on screen:\n${orderContext(snapshot, selected)}\n` : "",
          `Customer message (${docTitle}):\n"""\n${text}\n"""`,
        ].join("\n"),
        modelKey,
        solution: SLUG,
        task: "interpret.extract",
        maxTokens: 1800,
        signal: emit.signal,
      });
      const x = object as Extraction;
      emit.data("extraction", x);
      const nChanges = (x.lineChanges?.length ?? 0) + (x.requestedDelivery?.primary ? 1 : 0) + (x.priceClaims?.length ?? 0) + (x.paymentCommitment ? 1 : 0) + (x.split ? 1 : 0);
      s1.done(ar ? `${nChanges} طلبات · لغة الرسالة: ${x.language}` : `${nChanges} requested changes · language ${x.language}`);

      const s2 = emit.step("verify", ar ? "التحقق من الاقتباسات في النص الأصلي" : "Verifying every quote against the original text");
      const quotes = [
        x.requestedDelivery?.evidence,
        ...(x.lineChanges ?? []).map((l) => l.evidence),
        ...(x.priceClaims ?? []).map((p) => p.evidence),
        x.split?.evidence,
        x.paymentCommitment?.evidence,
        ...(x.otherRequests ?? []).map((r) => r.evidence),
      ].filter((q): q is string => !!q);
      const verified = quotes.filter((q) => verifyQuote(text, q)).length;
      s2.done(ar ? `${verified} من ${quotes.length} اقتباسات موجودة حرفياً في الرسالة` : `${verified} of ${quotes.length} quotes found verbatim in the message`);

      const s3 = emit.step("match", ar ? "مطابقة الرسالة مع أمر البيع" : "Matching the message to a sales order");
      const ref = normaliseRef(x.orderRef) ?? normaliseRef(text.match(/SO[-\s]?(?:26[-\s]?)?1\d{4}/i)?.[0]);
      let order: SalesOrder | undefined = ref ? snapshot.orders.find((o) => o.id === ref) : undefined;
      let how = ref && order ? (ar ? `بالرقم ${ref}` : `by order number ${ref}`) : "";
      if (!order && x.customerPoRef) {
        const po = x.customerPoRef.replace(/\s/g, "").toUpperCase();
        order = snapshot.orders.find((o) => o.customerPo.replace(/\s/g, "").toUpperCase() === po);
        if (order) how = ar ? `برقم أمر شراء المتعامل ${order.customerPo}` : `by customer PO ${order.customerPo}`;
      }
      if (!order && selected) {
        order = selected;
        how = ar ? "الطلب المفتوح على الشاشة" : "the order open on screen";
      }
      if (!order && x.customerName) {
        const n = x.customerName.toLowerCase().split(/\s+/).filter((t) => t.length > 3);
        const cands = snapshot.orders.filter((o) => n.some((t) => o.customerName.toLowerCase().includes(t)));
        order = cands.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
        if (order) how = ar ? `باسم المتعامل (أحدث طلب مفتوح)` : `by customer name (latest open order)`;
      }
      if (!order) {
        s3.error(ar ? "لم يتم العثور على طلب مطابق" : "No matching open order");
        throw new Error(ar ? "تعذّرت مطابقة الرسالة مع أي أمر بيع مفتوح — اختر الطلب أولاً" : "Could not match the message to an open sales order — select the order first.");
      }
      s3.done(`${order.id} · ${order.customerName} · ${how}`);
      emit.data("orderId", order.id);
      markOpened(order.id);

      const s4 = emit.step("apply", ar ? "تطبيق الطلبات كتعديل مقترح على الطلب" : "Applying the requests as a proposed change");
      const proposal = buildProposal(snapshot, order, x, docTitle, text);
      saveProposal(proposal);
      emit.data("proposal", proposal);
      const applied = proposal.changes.filter((c) => c.applied).length;
      s4.done(ar ? `${applied} تعديلات مطبقة · ${proposal.changes.length - applied} للعلم فقط` : `${applied} changes applied · ${proposal.changes.length - applied} noted only`);

      const s5 = emit.step("detect", ar ? "إعادة فحص الاستثناءات على الطلب المعدّل" : "Re-running exception detection on the changed order");
      const d = diffForProposal(snapshot, order, proposal);
      emit.data("diff", {
        added: d.added,
        cleared: d.cleared,
        changed: d.changed,
        unchanged: d.unchanged,
        exposureBefore: d.exposureBefore,
        exposureAfter: d.exposureAfter,
        limit: d.after.credit.limit,
        ifPaid: d.ifPaid,
        valueBefore: d.before.openValue,
        valueAfter: d.after.openValue,
        nextSlot: d.after.window.nextSlot,
        windowOk: d.after.window.ok,
      });
      s5.done(
        ar
          ? `${d.added.length} جديد · ${d.cleared.length} أزيل · ${d.changed.length} تغيّر · ${d.unchanged.length} دون تغيير`
          : `${d.added.length} new · ${d.cleared.length} cleared · ${d.changed.length} changed · ${d.unchanged.length} unchanged`,
      );

      addAudit({
        solution: SLUG,
        actor: { name: "NARVO Agent", role: "AI agent", kind: "agent" },
        action: "Interpreted customer message",
        subject: order.id,
        detail: `${docTitle} — ${applied} change(s) proposed; ${verified}/${quotes.length} quotes verified; detection: ${d.added.length} new, ${d.cleared.length} cleared.`,
      });
    },
    { modelKey },
  );
}
