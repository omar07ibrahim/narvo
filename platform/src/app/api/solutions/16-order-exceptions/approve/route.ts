import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { chatStream } from "@/lib/ai/client";
import { addAudit, createApproval, type Effect } from "@/lib/store/db";
import { COL, getOptions, getProposal, loadSnapshot, markOpened } from "@/app/solutions/16-order-exceptions/_lib/data";
import { ORG_CONTEXT, approvalContext } from "@/app/solutions/16-order-exceptions/_lib/prompts";
import { applyProposal } from "@/app/solutions/16-order-exceptions/_lib/proposal";
import { analyzeWorld } from "@/app/solutions/16-order-exceptions/_lib/detect";
import { evaluateOption, impactDigest, patchedOrderFields } from "@/app/solutions/16-order-exceptions/_lib/impact";
import { fmtSlot } from "@/app/solutions/16-order-exceptions/_lib/calendar";
import { APPROVERS, SLUG, aedText, fmtNum } from "@/app/solutions/16-order-exceptions/_lib/rules";
import type { Contact } from "@/app/solutions/16-order-exceptions/_lib/types";

export const maxDuration = 180;

export async function POST(req: Request) {
  const body = await readBody<{ orderId?: string; optionId?: string }>(req);
  const { modelKey, lang } = getPrefs(req, body);
  const ar = lang === "ar";
  if (!body.orderId || !body.optionId) return Response.json({ error: "orderId and optionId are required" }, { status: 400 });
  const snapshot = loadSnapshot();
  const order0 = snapshot.orders.find((o) => o.id === body.orderId);
  if (!order0) return Response.json({ error: `Order ${body.orderId} not found` }, { status: 404 });
  const stored = getOptions(order0.id);
  const picked = stored?.options.find((o) => o.option.id === body.optionId);
  if (!stored || !picked) return Response.json({ error: `Option ${body.optionId} not found — generate options first` }, { status: 404 });

  return eventStream(
    req,
    async (emit) => {
      const s0 = emit.step("recheck", ar ? "إعادة التحقق من الخيار على البيانات الحالية" : "Re-validating the option on current data");
      const proposal = getProposal(order0.id);
      const useProposal = proposal && proposal.id === stored.proposalId ? proposal : null;
      const order = applyProposal(snapshot, order0, useProposal);
      const impact = evaluateOption(snapshot, order, picked.option, useProposal);
      if (!impact.feasible) {
        s0.error(impact.issues.filter((i) => i.level === "error").map((i) => i.text.en).join("; "));
        throw new Error(ar ? "لم يعد هذا الخيار قابلاً للتنفيذ على البيانات الحالية — أعد توليد الخيارات." : "This option is no longer feasible on current data — regenerate the options.");
      }
      emit.data("impact", impact);
      s0.done(
        ar
          ? `${impact.deliveries.length} دفعات · أول تسليم ${fmtSlot(impact.firstDelivery, "ar")} · التعرض بعد التغيير ${fmtNum(impact.exposurePctAfter * 100, 1)}%`
          : `${impact.deliveries.length} deliveries · first ${fmtSlot(impact.firstDelivery)} · exposure after ${fmtNum(impact.exposurePctAfter * 100, 1)}%`,
      );

      const digest = impactDigest(snapshot, order, picked.option, impact);
      const ctx = approvalContext(snapshot, order, digest, {
        resolved: impact.cleared,
        customerChanges: (useProposal?.changes ?? []).filter((c) => c.applied && c.kind !== "note").map((c) => c.label.en),
      });
      const viaWhatsApp = useProposal && /whatsapp|واتساب/i.test(useProposal.docTitle) && order.siteContact;
      const recipient: Contact | undefined = viaWhatsApp ? order.siteContact : order.contact;
      const channel = recipient?.channel ?? "email";
      const kam = snapshot.master.people.find((p) => p.name === order.kam);
      const commitment = snapshot.paymentCommitments.find((p) => p.customerId === order.customerId && p.date >= "2026-10-11") ?? null;

      const draft = async (channelKey: string, stepLabel: string, system: string, user: string, maxTokens: number) => {
        const st = emit.step(channelKey, stepLabel);
        let out = "";
        const gen = chatStream({ messages: [{ role: "system", content: system }, { role: "user", content: user }], modelKey, solution: SLUG, task: `approve.${channelKey}`, maxTokens, temperature: 0.3, signal: emit.signal });
        for (let n = await gen.next(); !n.done; n = await gen.next()) {
          if (n.value.content) {
            out += n.value.content;
            emit.text(n.value.content, channelKey);
          }
        }
        st.done(ar ? `${out.trim().split(/\s+/).length} كلمة` : `${out.trim().split(/\s+/).length} words`);
        return out.trim();
      };

      const handoverSys = [
        ORG_CONTEXT,
        `Write the BILLING HANDOVER NOTE from Supply Chain & Planning to Group Finance — Billing (cc Credit Controller ${APPROVERS.credit.name}) for an approved order-exception resolution.`,
        "Format: Markdown. Start with a one-line subject in bold. Then short sections: Order & customer; Lines to invoice (a compact table: line, SKU, qty, unit price, delivery slot, invoice trigger); Price correction (from → to, contract reference, value); Credit (exposure after, held balance and its release condition, or release reference); Cost recorded against margin (transfer / premium); Actions for billing (invoice each delivery on its own delivery note at the corrected price, do not invoice held lines until released).",
        "Use the engine's numbers exactly. ≤ 230 words. No greetings or signatures beyond 'Joseph Abraham, Supply Chain & Planning'.",
        ar ? "Write in Arabic (Modern Standard Arabic, professional). Keep SKUs, order numbers and amounts in Latin digits." : "Write in English.",
      ].join("\n");

      const noticeSys = (l: "en" | "ar") =>
        [
          ORG_CONTEXT,
          `Write the CUSTOMER NOTIFICATION for ${order.customerName} about the approved resolution of their order, from the Key Account Manager ${order.kam}${kam ? ` (${kam.email})` : ""}.`,
          channel === "whatsapp"
            ? `Channel: WhatsApp to ${recipient?.name} (${recipient?.role}). Plain text, warm but professional, 70–130 words, short lines, no markdown headings, no emoji.`
            : `Channel: e-mail to ${recipient?.name} (${recipient?.role}). Start with 'Subject: …' on the first line, then the body, 120–190 words, sign off with the KAM's name and 'Raseen Building Materials Trading LLC'.`,
          "Content: what will be delivered when (per delivery: quantity, item, day/date and time), the customer's requests we accepted (quantities, dates), why the plan changed — only the reasons listed for the exceptions this resolution clears — and — if a price changed — that the order is invoiced at the frame-agreement rate (state the rate and the contract reference, and that it replaces the PO price; never say the price 'remains'). Only if part of the order is held for credit: politely link its release to the payment already committed (amount and date as given; call it the scheduled payment, not 'overdue') — never disclose internal limits or percentages. Ask them to confirm the split / slot in writing if a split applies.",
          "Use only the facts given. Never promise anything not in the plan.",
          l === "ar"
            ? [
                channel === "whatsapp"
                  ? "Write in Arabic — natural, polite Gulf business tone suitable for WhatsApp (clear MSA with light Gulf courtesy such as 'حياك الله'). Keep SO/PO numbers, SKUs and figures in Latin digits."
                  : "Write in Arabic (Modern Standard Arabic, formal UAE business e-mail register). Keep SO/PO numbers, SKUs and figures in Latin digits.",
                `Use Arabic names: the company is 'رصين لتجارة مواد البناء', Sahara Rebar Mills is 'مصانع صحارى لحديد التسليح', the KAM signs as '${kam?.nameAr ?? order.kam}' with the title '${kam?.roleAr?.split(" — ")[0] ?? ""}'. Do not leave English words in the Arabic text except codes and project names.`,
              ].join(" ")
            : "Write in English.",
        ].join("\n");

      const [handover, noticeEn, noticeAr] = await Promise.all([
        draft("handover", ar ? "صياغة مذكرة التسليم لقسم الفوترة" : "Drafting the billing handover note", handoverSys, ctx, 900),
        draft("notice_en", ar ? "صياغة إشعار المتعامل (الإنجليزية)" : "Drafting the customer notification (English)", noticeSys("en"), ctx, 700),
        draft("notice_ar", ar ? "صياغة إشعار المتعامل (العربية)" : "Drafting the customer notification (Arabic)", noticeSys("ar"), ctx, 800),
      ]);
      if (!handover || !noticeEn || !noticeAr) throw new Error(ar ? "تعذّر إكمال المسودات" : "Drafting did not complete");

      const s9 = emit.step("route", ar ? "توجيه الحزمة للاعتماد" : "Routing the package for approval");
      const opened = markOpened(order0.id);
      const resolutionId = `RES-16-${Date.now().toString(36).toUpperCase()}`;
      const approver = impact.approver;
      const fields = patchedOrderFields(order, impact, snapshot);
      const shipNow = impact.deliveries.filter((d) => !d.held).sort((a, b) => (a.slot ?? "").localeCompare(b.slot ?? ""));
      const held = impact.deliveries.filter((d) => d.held);
      const valueCleared = analyzeWorld(snapshot).byId[order0.id]?.valueAtRisk ?? 0;
      const summaryEn = [
        `${picked.option.id}: ${picked.option.title}.`,
        impact.deliveries.map((d) => `${fmtNum(d.qty, 1)} ${d.sku} ${fmtSlot(d.slot)}${d.held ? " (held)" : ""}`).join(" · ") + ".",
        impact.priceRecovered ? `Price corrected (+${aedText(impact.priceRecovered, "en")}).` : "",
        `Exposure after ${aedText(impact.exposureAfter, "en")} (${fmtNum(impact.exposurePctAfter * 100, 1)}% of limit).`,
        impact.releaseAmount ? `Includes CFO temporary release ${aedText(impact.releaseAmount, "en")}.` : held.length ? `Balance held until payment / release (${aedText(impact.heldValue, "en")} incl. VAT).` : "",
        impact.extraCost ? `Extra cost ${aedText(impact.extraCost, "en")}.` : "",
        `Customer notice by ${channel} to ${recipient?.name}.`,
      ]
        .filter(Boolean)
        .join(" ");
      const summaryAr = [
        `${picked.option.id}: ${picked.option.title}.`,
        impact.deliveries.map((d) => `${fmtNum(d.qty, 1)} ${d.sku} ${fmtSlot(d.slot, "ar")}${d.held ? " (موقوفة)" : ""}`).join(" · ") + ".",
        impact.priceRecovered ? `تصحيح السعر (+${aedText(impact.priceRecovered, "ar")}).` : "",
        `التعرض بعد التغيير ${aedText(impact.exposureAfter, "ar")} (${fmtNum(impact.exposurePctAfter * 100, 1)}% من الحد).`,
        impact.releaseAmount ? `يشمل إفراجاً ائتمانياً مؤقتاً ${aedText(impact.releaseAmount, "ar")}.` : held.length ? `الرصيد موقوف حتى السداد أو الإفراج.` : "",
        impact.extraCost ? `تكلفة إضافية ${aedText(impact.extraCost, "ar")}.` : "",
      ]
        .filter(Boolean)
        .join(" ");

      const effects: Effect[] = [
        {
          type: "patch",
          collection: COL.orders,
          id: order0.id,
          patch: {
            ...fields,
            resolution: {
              optionId: picked.option.id,
              title: picked.option.title,
              summary: summaryEn,
              approvalRequestedAt: new Date().toISOString(),
              approver: approver.name,
              cleared: impact.cleared,
              heldBalance: held.length
                ? {
                    qty: impact.heldQty,
                    value: impact.heldValue,
                    condition: commitment
                      ? `committed payment ${aedText(commitment.amount, "en")} on ${commitment.date} (${commitment.id}, ${commitment.committedBy}) or CFO release`
                      : "customer payment of the overdue amount or CFO release",
                  }
                : null,
            },
          },
        },
        { type: "append", collection: COL.handovers, item: { id: `HND-${resolutionId}`, orderId: order0.id, to: "Group Finance — Billing", body: handover, lang } },
        { type: "append", collection: COL.notifications, item: { id: `NTF-${resolutionId}`, orderId: order0.id, channel, recipient: `${recipient?.name ?? ""} (${recipient?.role ?? ""})`, en: noticeEn, ar: noticeAr } },
        {
          type: "append",
          collection: COL.resolutions,
          item: {
            id: resolutionId,
            orderId: order0.id,
            customerId: order0.customerId,
            optionId: picked.option.id,
            title: picked.option.title,
            types: impact.cleared,
            openedAt: new Date(opened).toISOString(),
            effortMinutes: null,
            valueAtRiskCleared: valueCleared,
            extraCost: impact.extraCost,
            marginDelta: impact.marginDelta,
            approver: approver.name,
          },
        },
        {
          type: "audit",
          action: "Order exception resolved",
          subject: order0.id,
          detail: `${picked.option.title} — cleared ${impact.cleared.join(", ") || "none"}; ${shipNow.length} deliver(ies) released, ${held.length} held; billing handover and ${channel} notice issued.`,
        },
      ];
      const approval = createApproval({
        solution: SLUG,
        title: ar ? `اعتماد معالجة الطلب ${order0.id} — ${order0.customerName}` : `Resolve ${order0.id} — ${order0.customerName}`,
        summary: ar ? summaryAr : summaryEn,
        actionLabel: ar ? "اعتماد وتنفيذ" : "Approve & execute",
        approver,
        effects,
        payload: { orderId: order0.id, optionId: picked.option.id, impact: { deliveries: impact.deliveries, exposureAfter: impact.exposureAfter, extraCost: impact.extraCost, marginDelta: impact.marginDelta } },
        requestedBy: order0.kam,
      });
      emit.send({
        type: "approval",
        approval: {
          id: approval.id,
          title: approval.title,
          summary: approval.summary,
          solution: SLUG,
          actionLabel: approval.actionLabel,
          approver: approval.approver,
          status: "pending",
          createdAt: approval.createdAt,
        },
      });
      emit.data("package", { approvalId: approval.id, channel, recipient, handover, noticeEn, noticeAr });
      s9.waiting(ar ? `بانتظار ${approver.name} (${approver.title})` : `Waiting for ${approver.name} (${approver.title})`);
      addAudit({
        solution: SLUG,
        actor: { name: "NARVO Agent", role: "AI agent", kind: "agent" },
        action: "Drafted billing handover and customer notice",
        subject: order0.id,
        detail: `Option ${picked.option.id}; notice via ${channel} (EN + AR) to ${recipient?.name}; routed to ${approver.name}.`,
      });
    },
    { modelKey },
  );
}
