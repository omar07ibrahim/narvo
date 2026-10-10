import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { generateObject } from "@/lib/ai/json";
import { chatStream } from "@/lib/ai/client";
import { createApproval, decideApproval, getApproval } from "@/lib/store/db";
import { DEMO_TODAY } from "@/lib/world/orgs";
import { COL_INVOICES, COL_JOURNALS, COL_OUTBOX, loadCases, matchContext, saveCase, SLUG } from "@/app/solutions/14-finance-operations/_lib/data";
import { fmt2, matchInvoice } from "@/app/solutions/14-finance-operations/_lib/three-way";
import { computeTreatment, TREATMENT_LABELS } from "@/app/solutions/14-finance-operations/_lib/treatments";
import { buildCitations, buyerEmail, caseFacts, caseSchema, supplierAsk } from "@/app/solutions/14-finance-operations/_lib/case";
import type { StoredCase } from "@/app/solutions/14-finance-operations/_lib/types";

export const maxDuration = 300;

const SHORT: Record<string, string> = {
  "SUP-NEC": "NEC",
  "SUP-SRM": "Sahara Rebar",
  "SUP-ACT": "Andalus",
  "SUP-GBP": "Gulf Bitumen",
  "SUP-AWB": "Al Waha Blocks",
  "SUP-CCI": "Coastal Coatings",
  "SUP-AKT": "Al Khaleej Transport",
  "SUP-FLL": "Fast Lane",
};

/**
 * Resolution case: deterministic match + treatment + journal + routing (code), then the model writes the
 * explanation, evidence and the supplier email; the result is queued for the approver set by the policy matrix.
 */
export async function POST(req: Request) {
  const body = await readBody<{ invoiceId?: string }>(req);
  const { modelKey, lang } = getPrefs(req, body);
  const ar = lang === "ar";
  const ctx = matchContext();
  const inv = ctx.invoices.find((i) => i.id === body.invoiceId);
  if (!inv) return Response.json({ error: "Unknown document" }, { status: 404 });
  if (inv.status !== "received") return Response.json({ error: `Already resolved (${inv.status})` }, { status: 409 });
  const match = matchInvoice(inv, ctx);
  if (!match.exception) return Response.json({ error: "This document matched cleanly — there is nothing to resolve" }, { status: 400 });
  const supplier = ctx.suppliers.find((s) => s.id === inv.supplierId);

  return eventStream(
    req,
    async (emit) => {
      const at = Date.now();
      // 1 — Documents
      const s1 = emit.step("docs", ar ? "تجميع الفاتورة وأمر الشراء وإشعار الاستلام" : "Assembling invoice, purchase order and goods receipt");
      s1.done(
        `${inv.supplierInvoiceNo} · ${match.poId ?? `${inv.poRef} (${ar ? "غير صالح" : "invalid"})`} · ${match.grnIds.join(", ") || (inv.grnRefs.join(", ") || "—")}`,
      );

      // 2 — Match
      const s2 = emit.step("match", ar ? "المطابقة الثلاثية وفق RG-FIN-POL-09" : "Three-way match under RG-FIN-POL-09 rev. 4");
      emit.data("match", match);
      const fails = match.checks.filter((c) => c.status === "fail");
      s2.done(
        ar
          ? `${match.checks.filter((c) => c.status !== "na").length} فحوصات · ${fails.length} غير مطابق · الفرق ${fmt2(match.variance)} درهم`
          : `${match.checks.filter((c) => c.status !== "na").length} checks · ${fails.length} failed (${fails.map((c) => c.label.en.toLowerCase()).join(", ")}) · variance AED ${fmt2(match.variance)}`,
      );

      // 3 — Wrong PO: look for the right one
      if (fails.some((c) => c.id === "po")) {
        const s3 = emit.step("po", ar ? "البحث عن أمر الشراء الصحيح" : "Searching purchasing for the right PO");
        if (match.candidatePo) s3.done(`${match.candidatePo.id} — ${ar ? match.candidatePo.reason.ar : match.candidatePo.reason.en}`);
        else s3.error(ar ? "لم يُعثر على أمر شراء مطابق — يلزم تأكيد المشتري" : "No matching PO found — buyer confirmation needed");
      }

      // 4 — Treatment (code)
      const s4 = emit.step("treat", ar ? "احتساب المعالجة والقيد ومسار الاعتماد" : "Computing treatment, journal and approval route");
      const t = computeTreatment(inv, match, ctx);
      emit.data("treatment", t);
      s4.done(
        ar
          ? `${TREATMENT_LABELS[t.kind].ar} · يُدفع الآن ${fmt2(t.payableNow)} · معلّق ${fmt2(t.toSuspense)} · ← ${t.approver.name}`
          : `${TREATMENT_LABELS[t.kind].en} · pay ${fmt2(t.payableNow)} now · ${fmt2(t.toSuspense)} to suspense · → ${t.approver.name}`,
      );

      // 5 — Evidence
      const s5 = emit.step("evidence", ar ? "جمع الأدلة والسياسة وإشعارات الموردين" : "Collecting evidence, policy and supplier notices");
      const citations = buildCitations(inv, match, t, ctx);
      emit.data("citations", citations);
      const policyN = citations.filter((c) => !/^(AP-|RBM-PO|GRN-|EXC-|SUP-)/.test(c.docId)).length;
      s5.done(ar ? `${citations.length} مصادر · ${policyN} مقاطع من السياسات` : `${citations.length} sources · ${policyN} policy / notice passages`);

      // 6 — Case (model)
      const s6 = emit.step("case", ar ? "صياغة ملف المعالجة للمعتمِد" : "Writing the case for the approver");
      const facts = caseFacts(inv, match, t, supplier);
      const sources = citations.map((c) => `[${c.n}] ${c.title}${c.section ? ` — ${c.section}` : ""}\n${c.quote}`).join("\n\n");
      const { object: ai, model } = await generateObject({
        schema: caseSchema,
        name: "resolution_case",
        system: [
          "You are the NARVO finance-operations agent for Raseen Group, preparing an AP exception for approval.",
          `The reviewer is Deepak Menon (AP Supervisor); the approver is ${t.approver.name}, ${t.approver.title}.`,
          "Deterministic code has already matched the documents and computed the treatment, amounts, journal and approver. These are FINAL: copy figures exactly as given (AED with two decimals), never recompute, round or invent numbers, dates or references.",
          "Explain the discrepancy plainly, list the evidence, and confirm whether the computed treatment follows policy RG-FIN-POL-09. Cite every fact with the source markers [n] given below — documents and policy alike. Only cite numbers that exist in the sources.",
          "Never claim more than a source says (e.g. 'certificate not on file' does not mean 'not VAT-registered'). Use the resolution history and supplier notices when they are among the sources. In evidence items put the markers only in `cites`, not in `text`.",
          ar
            ? "LANGUAGE: every text field — headline included — must be in formal Modern Standard Arabic (keep company names, document numbers, codes and amounts in Latin script/digits). Do not write the headline in English."
            : "LANGUAGE: write every text field in English.",
          "recommendation.treatment must be one of the allowed values; set agrees=false only if the policy clearly requires a different treatment, and say why.",
        ].join("\n"),
        user: `FACTS (computed):\n${JSON.stringify(facts, null, 2)}\n\nSOURCES:\n${sources}`,
        modelKey,
        solution: SLUG,
        task: "resolve.case",
        maxTokens: 1600,
        temperature: 0.2,
      });
      emit.data("case", ai);
      s6.done(ai.headline);

      // 7 — Supplier email (model, streamed)
      const s7 = emit.step("email", ar ? "صياغة رسالة المورد" : "Drafting the supplier email");
      const po = ctx.pos.find((p) => p.id === (t.correctedPoRef ?? match.poId));
      const to = supplier?.email ?? "";
      const cc = [buyerEmail(po), "deepak.m@raseen.ae"].filter(Boolean).join(", ");
      const asks = supplierAsk(inv, match, t, ctx);
      const contactFirst = supplier?.contact.split(",")[0] ?? "";
      const gen = chatStream({
        messages: [
          {
            role: "system",
            content: [
              "You draft supplier correspondence for the Accounts Payable team of Raseen Building Materials Trading LLC (RBM), Raseen Group, Dubai.",
              "Write in English, professional and courteous, 130–220 words. Plain text, no markdown headings or bullet symbols other than simple '-' lines for figures.",
              "First line exactly: 'Subject: ' followed by a specific subject quoting the supplier invoice number and our PO. Then a blank line, then the body.",
              "Open the body with the Arabic courtesy line 'تحية طيبة وبعد،' on its own line, then the English greeting to the named contact.",
              "State the facts and the action required EXACTLY as listed under REQUIRED CONTENT — same figures, references and dates. Do not add amounts, dates, references or commitments that are not given.",
              "Close with 'مع الشكر والتقدير،' on its own line, then: Deepak Menon / AP Supervisor, Group Finance / Raseen Group / deepak.m@raseen.ae",
            ].join("\n"),
          },
          {
            role: "user",
            content: `Supplier: ${inv.supplierName} — contact ${contactFirst} <${to}>\nOur PO: ${t.correctedPoRef ?? match.poId ?? inv.poRef}\nDocument: ${inv.docType === "credit_note" ? "credit note" : "invoice"} ${inv.supplierInvoiceNo} dated ${inv.invoiceDate}, total AED ${fmt2(inv.total)}\nGoods receipt / delivery refs: ${[...match.grnIds, ...inv.deliveryNoteRefs].join(", ") || "—"}\n\nREQUIRED CONTENT:\n${asks.map((a) => `- ${a}`).join("\n")}`,
          },
        ],
        modelKey,
        temperature: 0.3,
        maxTokens: 900,
        solution: SLUG,
        task: "resolve.email",
        signal: emit.signal,
      });
      let email = "";
      for (let n = await gen.next(); !n.done; n = await gen.next()) {
        if (n.value.content) {
          email += n.value.content;
          emit.text(n.value.content, "email");
        }
      }
      const subjMatch = email.match(/^\s*Subject:\s*(.+)$/im);
      const subject = subjMatch?.[1].trim() ?? `${inv.supplierInvoiceNo} — ${TREATMENT_LABELS[t.kind].en}`;
      const emailBody = email.replace(/^\s*Subject:.*\n+/i, "").trim();
      s7.done(subject);

      // 8 — Approval routed by the policy matrix
      const s8 = emit.step("route", ar ? "توجيه للاعتماد وفق مصفوفة الصلاحيات" : "Routing for approval per the authority matrix");
      const prev = loadCases()[inv.id]?.approval;
      if (prev && getApproval(prev.id)?.status === "pending") decideApproval(prev.id, "rejected", "Superseded by a rebuilt resolution case");

      const short = SHORT[inv.supplierId] ?? inv.supplierName;
      const jvId = `JV-${inv.id}`;
      const patch: Record<string, unknown> = {
        status: t.newStatus,
        payableAmount: t.payableNow,
        treatment: t.kind,
        caseOpenedAt: at,
        resolutionNote: ai.headline,
      };
      if (t.correctedPoRef) patch.poRefCorrected = t.correctedPoRef;
      const summaryEn =
        t.kind === "reject_duplicate"
          ? `Reject duplicate ${inv.supplierInvoiceNo} (AED ${fmt2(t.invoiceTotal)}) — original ${match.duplicateOf} stays scheduled. No posting. Email to ${to}.`
          : t.kind === "apply_credit_note"
            ? `Apply credit note AED ${fmt2(t.invoiceTotal)} against ${inv.relatedInvoiceNo}; request a further credit of AED ${fmt2(t.recover)}. ${jvId}: Dr 2100 / Cr 2190. Email to ${to}.`
            : t.newStatus === "on_hold"
              ? `Hold ${inv.supplierInvoiceNo} — nothing released. Book AED ${fmt2(t.invoiceTotal - t.toSuspense)} and park AED ${fmt2(t.toSuspense)} in AP suspense 2190 until a valid tax invoice arrives. ${jvId} balanced. Email to ${to}. ${t.approver.rule}.`
              : `Pay AED ${fmt2(t.payableNow)} now${t.toSuspense ? `; AED ${fmt2(t.toSuspense)} to AP suspense 2190` : ""}${t.correctedPoRef ? `; PO corrected to ${t.correctedPoRef}` : ""}. ${jvId} balanced. Email to ${to}. ${t.approver.rule}.`;
      const summaryAr =
        t.kind === "reject_duplicate"
          ? `رفض الفاتورة المكررة ${inv.supplierInvoiceNo} (${fmt2(t.invoiceTotal)} درهم) — تبقى الفاتورة الأصلية ${match.duplicateOf} مجدولة. لا قيد. رسالة إلى ${to}.`
          : t.kind === "apply_credit_note"
            ? `تطبيق إشعار دائن بقيمة ${fmt2(t.invoiceTotal)} درهم على ${inv.relatedInvoiceNo}؛ وطلب إشعار إضافي بقيمة ${fmt2(t.recover)} درهم. القيد ${jvId}. رسالة إلى ${to}.`
            : t.newStatus === "on_hold"
              ? `تعليق ${inv.supplierInvoiceNo} — لا سداد الآن. قيد ${fmt2(t.invoiceTotal - t.toSuspense)} درهم وتحويل ${fmt2(t.toSuspense)} درهم إلى الحساب المعلّق 2190 حتى ورود فاتورة ضريبية صحيحة. القيد ${jvId} متوازن. رسالة إلى ${to}.`
              : `سداد ${fmt2(t.payableNow)} درهم الآن${t.toSuspense ? `؛ و${fmt2(t.toSuspense)} درهم إلى الحساب المعلّق 2190` : ""}${t.correctedPoRef ? `؛ تصحيح أمر الشراء إلى ${t.correctedPoRef}` : ""}. القيد ${jvId} متوازن. رسالة إلى ${to}.`;
      const approval = createApproval({
        solution: SLUG,
        title: ar ? `${TREATMENT_LABELS[t.kind].ar} — ${inv.supplierInvoiceNo} (${short})` : `${TREATMENT_LABELS[t.kind].en} — ${inv.supplierInvoiceNo} (${short})`,
        summary: ar ? summaryAr : summaryEn,
        actionLabel: ar ? "اعتماد وترحيل وإرسال" : "Approve, post & send",
        approver: { name: t.approver.name, title: t.approver.title },
        requestedBy: "NARVO Agent (prepared for Deepak Menon)",
        payload: { invoiceId: inv.id, treatment: t.kind, payableNow: t.payableNow, toSuspense: t.toSuspense },
        effects: [
          { type: "patch", collection: COL_INVOICES, id: inv.id, patch },
          {
            type: "append",
            collection: COL_JOURNALS,
            item: {
              id: jvId,
              invoiceId: inv.id,
              supplierInvoiceNo: inv.supplierInvoiceNo,
              supplierId: inv.supplierId,
              date: DEMO_TODAY,
              memo: t.journal.memo,
              lines: t.journal.lines,
              treatment: t.kind,
              approvedBy: t.approver.name,
            },
          },
          { type: "append", collection: COL_OUTBOX, item: { id: `OUT-${inv.id}`, invoiceId: inv.id, to, cc, subject, body: emailBody, status: "sent" } },
          {
            type: "audit",
            action: `${TREATMENT_LABELS[t.kind].en} — posted and supplier notified`,
            subject: `${inv.id} · ${inv.supplierInvoiceNo} · ${inv.supplierName}`,
            detail: `Status ${t.newStatus}; payable now AED ${fmt2(t.payableNow)}; suspense AED ${fmt2(t.toSuspense)}; ${jvId}; email to ${to}`,
          },
        ],
      });
      const summary = {
        id: approval.id,
        title: approval.title,
        summary: approval.summary,
        solution: SLUG,
        actionLabel: approval.actionLabel,
        approver: approval.approver,
        status: "pending" as const,
        createdAt: approval.createdAt,
      };
      emit.send({ type: "approval", approval: summary });
      const stored: StoredCase = { invoiceId: inv.id, at, lang, treatment: t, ai, citations, email: { to, cc, subject, body: emailBody }, approval: summary, model };
      saveCase(stored);
      emit.data("stored", stored);
      s8.waiting(ar ? `بانتظار ${t.approver.name} — ${t.approver.title}` : `Awaiting ${t.approver.name}, ${t.approver.title}`);
    },
    { modelKey },
  );
}
