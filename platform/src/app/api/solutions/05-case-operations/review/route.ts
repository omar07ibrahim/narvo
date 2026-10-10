import { z } from "zod";
import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { runAgent, defineTool } from "@/lib/ai/agent";
import { kvGet, kvSet, patchRecord, addAudit } from "@/lib/store/db";
import { getCase, landRegistryLookup, SLUG, COL_CASES, COL_MESSAGES } from "@/app/solutions/05-case-operations/_lib/data";
import { extractFromImage, type Extraction } from "@/app/solutions/05-case-operations/_lib/extract";
import { runChecks, addWorkingDays, RULES } from "@/app/solutions/05-case-operations/_lib/rules";
import { policyCitations } from "@/app/solutions/05-case-operations/_lib/policy";
import type { CaseReview, ExtractedDocument } from "@/app/solutions/05-case-operations/_lib/types";

export const maxDuration = 300;

const APPROVER = { name: "Mariam Saeed Al Kaabi", title: "Head, Housing Applications Section" };
const OFFICER = "Khalfan Mohammed Al Ali";

interface RegistryCert {
  issued: string;
  result: "none" | "owns";
  reference: string;
  properties: unknown[];
}

async function pool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

export async function POST(req: Request) {
  const body = await readBody<{ caseId: string; reuse?: boolean }>(req);
  const { modelKey, lang } = getPrefs(req, body);
  const ar = lang === "ar";

  return eventStream(
    req,
    async (emit) => {
      const c = getCase(body.caseId);
      if (!c) throw new Error(`Case ${body.caseId} not found`);

      const s0 = emit.step("load", ar ? "تحميل ملف الحالة" : "Opening the case file", c.id);
      const docs = c.documents.filter((d) => d.file && d.source !== "land_registry");
      s0.done(ar ? `${docs.length} مستندات مرفقة · مقدَّم عبر ${c.channel}` : `${docs.length} documents attached · submitted via ${c.channel}`);
      if (!docs.length) throw new Error(ar ? "لا توجد مستندات ممسوحة لهذه الحالة" : "This case has no scanned documents to review");

      // 1 — Read every document with the vision model (in parallel).
      const extractions: ExtractedDocument[] = [];
      const results = await pool(docs, 3, async (d) => {
        const st = emit.step(`read:${d.type}`, ar ? `قراءة: ${d.label}` : `Reading ${d.label}`);
        const cacheKey = `${SLUG}:x:${c.id}:${d.type}`;
        const cached = body.reuse ? kvGet<{ object: Extraction; ms: number }>(cacheKey) : undefined;
        try {
          const r = cached ?? (await extractFromImage({ file: d.file!, hint: d.label, modelKey, task: `extract.${d.type}` }));
          if (!cached) kvSet(cacheKey, r);
          const x = r.object;
          // Bidi-isolate each fact so Arabic names and Latin IDs render cleanly on one line.
          const keyFacts = [
            ar ? (x.holderNameAr ?? x.holderName) : (x.holderName ?? x.holderNameAr),
            x.emiratesId,
            x.issueDate,
            x.totalMonthlySalary ? `AED ${x.totalMonthlySalary.toLocaleString("en-US")}` : null,
          ]
            .filter(Boolean)
            .map((p) => `⁨${p}⁩`)
            .join(" · ");
          st.done(`${keyFacts || x.title} · ${Math.round(x.confidence * 100)}%`);
          const ed: ExtractedDocument = { docType: d.type, file: d.file, label: d.label, fields: x as unknown as Record<string, unknown>, confidence: x.confidence, ms: r.ms };
          extractions.push(ed);
          emit.data("extractions", [...extractions]);
          return { type: d.type, label: d.label, x };
        } catch (e) {
          st.error((e as Error).message);
          return { type: d.type, label: d.label, x: undefined };
        }
      });

      // 2 — Deterministic Circular 9/2026 checks.
      const s2 = emit.step("checks", ar ? "التحقق وفق التعميم رقم 9/2026" : "Checking against Circular No. 9/2026");
      let registryCert = kvGet<RegistryCert>(`${SLUG}:registry:${c.id}`) ?? null;
      let ruleResult = runChecks({ c, docs: results, registryCertificate: registryCert });
      emit.data("checks", ruleResult.checks);
      const fails = ruleResult.checks.filter((x) => x.status === "fail").length;
      const warns = ruleResult.checks.filter((x) => x.status === "warn").length;
      s2.done(ar ? `${ruleResult.checks.length} فحصاً · ${fails} غير مستوفٍ · ${warns} للتنبيه` : `${ruleResult.checks.length} checks · ${fails} failed · ${warns} to note`);

      const s3 = emit.step("policy", ar ? "ربط الملاحظات بنصوص التعميم" : "Linking findings to the circular");
      const citations = policyCitations(ruleResult.checks, lang);
      emit.data("citations", citations);
      s3.done(citations.map((x) => `§${x.section}`).join(" · "));

      // 3 — Agent decides the next actions (all state changes need a human).
      const deadline = addWorkingDays(new Date(), RULES.clarificationWorkingDays);
      const deadlineStr = deadline.toISOString().slice(0, 10);
      const applicantLang = c.applicant.preferredLanguage;

      const queryRegistry = defineTool({
        name: "query_land_registry",
        description:
          "Retrieve the Certificate of No Property Ownership directly from the Marsa Al Noor Land Registry for the applicant (and spouse). Only allowed when the applicant has given consent (Circular 9/2026 §6.3).",
        parameters: z.object({ caseId: z.string() }),
        label: () => (ar ? "الاستعلام من سجل الأراضي بموافقة المتقدم" : "Querying the Land Registry (consent on file)"),
        execute: async () => {
          if (!c.landRegistryConsent) return { error: "No consent on file — the certificate must be requested from the applicant." };
          const eids = [c.applicant.emiratesId, results.find((r) => r.type === "emirates_id_spouse")?.x?.emiratesId].filter(Boolean) as string[];
          const props = eids.flatMap((e) => landRegistryLookup(e).residentialProperties.map((p) => ({ ...p, owner: e })));
          const cert: RegistryCert = {
            issued: new Date().toISOString().slice(0, 10),
            result: props.length ? "owns" : "none",
            reference: `LR-NPC-2026-${String(78000 + Math.floor(Math.random() * 900)).padStart(6, "0")}`,
            properties: props,
          };
          kvSet(`${SLUG}:registry:${c.id}`, cert);
          registryCert = cert;
          patchRecord(COL_CASES, c.id, {
            documents: [
              ...c.documents.filter((d) => d.source !== "land_registry"),
              { type: "no_property_certificate", label: `Certificate of No Property Ownership — ${cert.reference}`, source: "land_registry", addedAt: new Date().toISOString() },
            ],
          });
          addAudit({
            solution: SLUG,
            actor: { name: "NARVO Agent", role: "AI agent", kind: "agent" },
            action: "Retrieved Land Registry certificate (with consent)",
            subject: c.id,
            detail: `${cert.reference} — ${cert.result === "none" ? "no residential property registered" : "residential property found"}`,
          });
          emit.data("registry", cert);
          return { certificate: cert.reference, result: cert.result === "none" ? "No residential property registered for applicant or spouse" : "Residential property registered", properties: props };
        },
      });

      const sendClarification = defineTool({
        name: "send_clarification",
        description:
          "Prepare ONE clarification request to the applicant listing ALL missing or invalid items (Circular 9/2026 §5.4). It is sent only after the Section Head approves.",
        parameters: z.object({
          caseId: z.string(),
          language: z.enum(["ar", "en"]),
          items: z.array(z.string()).min(1).describe("Each missing/invalid item, one line each"),
          message: z.string().describe("The full message to the applicant, formal UAE government tone"),
        }),
        label: (a) => (ar ? `إعداد طلب استيفاء (${a.items.length} بنود) للاعتماد` : `Prepare clarification request (${a.items.length} items) for approval`),
        approval: (a) => {
          emit.data("draft", { language: a.language, items: a.items, message: a.message });
          return {
            title: ar ? `إرسال طلب استيفاء — ${c.id}` : `Send clarification request — ${c.id}`,
            summary: a.message,
            actionLabel: ar ? "اعتماد وإرسال" : "Approve & send",
            approver: APPROVER,
            effects: [
              {
                type: "patch",
                collection: COL_CASES,
                id: c.id,
                patch: {
                  status: "incomplete",
                  officer: c.officer ?? OFFICER,
                  missing: a.items,
                  clockStopped: true,
                  clarificationSentAt: new Date().toISOString(),
                  summary: `Clarification sent — awaiting applicant until ${deadlineStr}.`,
                },
              },
              {
                type: "append",
                collection: COL_MESSAGES,
                item: {
                  id: crypto.randomUUID(),
                  caseId: c.id,
                  kind: "clarification",
                  channels: ["SMS", "Email", "MNDA Smart"],
                  language: a.language,
                  body: a.message,
                  sentAt: new Date().toISOString(),
                  sentBy: APPROVER.name,
                },
              },
              { type: "audit", action: "Clarification request sent to applicant", subject: c.id, detail: `${a.items.length} items · SLA clock stopped until ${deadlineStr}` },
            ],
          };
        },
      });

      const forward = defineTool({
        name: "forward_to_verification",
        description: "When the file is complete and consistent, move the case to eligibility verification. Requires Section Head approval.",
        parameters: z.object({ caseId: z.string(), note: z.string().describe("Short note for the verification team") }),
        label: () => (ar ? "تحويل الحالة إلى مرحلة التحقق للاعتماد" : "Move case to verification (for approval)"),
        approval: (a) => ({
          title: ar ? `تحويل إلى التحقق — ${c.id}` : `Move to verification — ${c.id}`,
          summary: a.note,
          actionLabel: ar ? "اعتماد التحويل" : "Approve & move",
          approver: APPROVER,
          effects: [
            { type: "patch", collection: COL_CASES, id: c.id, patch: { status: "verification", officer: c.officer ?? OFFICER, clockStopped: false, summary: a.note } },
            { type: "audit", action: "File complete — moved to verification", subject: c.id, detail: a.note },
          ],
        }),
      });

      const facts = {
        caseId: c.id,
        track: c.track,
        amountRequested: c.amountRequested,
        submittedAt: c.submittedAt,
        applicant: {
          name: c.applicant.name,
          nameAr: c.applicant.nameAr,
          preferredLanguage: applicantLang,
          maritalStatus: c.applicant.maritalStatus,
          dependents: c.applicant.dependents,
          spouseName: results.find((r) => r.type === "emirates_id_spouse")?.x?.holderName ?? c.applicant.spouse ?? null,
          spouseNameAr: results.find((r) => r.type === "emirates_id_spouse")?.x?.holderNameAr ?? null,
        },
        organisation: { en: "Marsa Al Noor Development Authority (MNDA) — Housing Applications Section", ar: "هيئة مرسى النور للتطوير — قسم الطلبات السكنية" },
        circular: { en: "Circular No. 9/2026 on updated requirements for housing grant & loan applications", ar: "التعميم رقم (9) لسنة 2026 بشأن تحديث متطلبات طلبات المنح والقروض السكنية" },
        landRegistryConsent: c.landRegistryConsent ?? false,
        checks: ruleResult.checks.map((x) => ({ check: x.label.en, status: x.status, detail: x.detail.en, policy: x.policyRef })),
        itemsToRequest: ruleResult.missing,
        responseDeadline: deadlineStr,
      };

      await runAgent({
        solution: SLUG,
        modelKey,
        emit,
        channel: "summary",
        maxSteps: 5,
        tools: [queryRegistry, sendClarification, forward],
        system: `You are the NARVO case assistant inside the Housing Applications Section of the Marsa Al Noor Development Authority (MNDA).
You prepare work for human case officers; you NEVER approve or reject applications (MNDA Responsible AI Policy AI-POL-01, Circular 9/2026 §7).

Decide the next actions from the computed checks:
1. If the Certificate of No Property Ownership is not attached but landRegistryConsent is true, call query_land_registry first (do not ask the applicant for it).
2. If any check failed (or the income ceiling is exceeded), call send_clarification ONCE listing every item the applicant must provide or clarify, in the applicant's preferred language (${applicantLang === "ar" ? "Arabic — formal Modern Standard Arabic, UAE government register" : "English"}). The message must: open with a proper salutation using the exact name from the facts (Arabic: "السيد/ <nameAr> المحترم" or "السيدة/ <nameAr> المحترمة"; English: "Dear Mr/Ms <name>,"), quote the case number, list each item clearly (e.g. a salary certificate issued within the last 30 days; clarification of the income difference), mention Circular No. 9/2026, state the response deadline ${deadlineStr} (15 working days) and that the service clock is paused meanwhile, and give the contact 800 6632. Refer to the regulation exactly as "circular" (the Arabic is "التعميم رقم (9) لسنة 2026" — never call it a ministerial decision) and sign with the organisation's exact name from the facts. Spell every person's name exactly as given in the facts. In Arabic say the service period is paused as "ويتوقف احتساب مدة إنجاز الخدمة خلال هذه الفترة". If the household income exceeds the grant ceiling but fits the loan ceiling, explain that the applicant may request to switch to the loan track — do not decide it.
3. If no check failed, call forward_to_verification with a short note.
Finally, write a concise summary for the case officer in ${ar ? "Arabic" : "English"} (4–6 bullet points: what was found, what you prepared, what awaits approval). Do not repeat the full message.`,
        messages: [{ role: "user", content: `Case facts and computed checks:\n${JSON.stringify(facts, null, 2)}` }],
      });

      // 4 — Re-evaluate after any Land Registry retrieval.
      if (registryCert) {
        ruleResult = runChecks({ c, docs: results, registryCertificate: registryCert });
        emit.data("checks", ruleResult.checks);
      }

      const review: CaseReview = {
        at: Date.now(),
        caseId: c.id,
        extractions,
        checks: ruleResult.checks,
        summary: "",
        approvals: [],
      };
      kvSet(`${SLUG}:review:${c.id}`, review);
      if (c.status === "submitted") patchRecord(COL_CASES, c.id, { officer: c.officer ?? OFFICER });
      addAudit({
        solution: SLUG,
        actor: { name: "NARVO Agent", role: "AI agent", kind: "agent" },
        action: "Completeness review completed",
        subject: c.id,
        detail: `${extractions.length} documents read · ${ruleResult.checks.length} checks · ${ruleResult.checks.filter((x) => x.status === "fail").length} failed`,
      });
    },
    { modelKey },
  );
}
