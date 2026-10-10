import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { chatStream } from "@/lib/ai/client";
import { extractFromImage } from "@/app/solutions/05-case-operations/_lib/extract";
import { daysBetween, RULES } from "@/app/solutions/05-case-operations/_lib/rules";
import { addAudit } from "@/lib/store/db";

export const maxDuration = 120;

/**
 * Bring-your-own document: identify it, extract its fields and check it against Circular 9/2026.
 * Works on any image the officer drops in — nothing pre-computed.
 */
export async function POST(req: Request) {
  const body = await readBody<{ dataUrl: string; name?: string }>(req);
  const { modelKey, lang } = getPrefs(req, body);
  const ar = lang === "ar";
  return eventStream(
    req,
    async (emit) => {
      if (!body.dataUrl?.startsWith("data:image")) throw new Error(ar ? "يرجى رفع صورة لمستند" : "Please upload an image of a document");
      const s1 = emit.step("read", ar ? "التعرّف على المستند وقراءته" : "Identifying and reading the document", body.name);
      const { object: x, ms } = await extractFromImage({ dataUrl: body.dataUrl, modelKey, task: "extract.upload" });
      emit.data("extraction", x);
      s1.done(`${x.title} · ${Math.round(x.confidence * 100)}% · ${(ms / 1000).toFixed(1)} s`);

      const s2 = emit.step("rules", ar ? "التحقق من صلاحية المستند" : "Checking validity rules");
      const today = new Date();
      const findings: string[] = [];
      if (x.docType === "salary_certificate" && x.issueDate) {
        const age = daysBetween(x.issueDate, today);
        findings.push(
          age <= RULES.salaryCertMaxAgeDays
            ? `Salary certificate is ${age} days old — within the 30-day limit (Circular 9/2026 §4.4).`
            : `Salary certificate is ${age} days old — exceeds the 30-day limit and would be treated as missing (Circular 9/2026 §4.4, §6.1).`,
        );
      }
      if (x.expiryDate) {
        const left = daysBetween(today, x.expiryDate);
        findings.push(left < 0 ? `Document expired ${-left} days ago (${x.expiryDate}).` : `Valid until ${x.expiryDate} (${left} days left).`);
      }
      if (x.docType === "no_property_certificate" && x.issueDate) {
        const age = daysBetween(x.issueDate, today);
        findings.push(age <= RULES.noPropertyMaxAgeDays ? `No-property certificate issued ${age} days ago — valid (60 days).` : `No-property certificate is ${age} days old — expired (60-day validity).`);
      }
      if (x.specimenWatermark) findings.push("Carries a SPECIMEN watermark — demo document.");
      emit.data("findings", findings);
      s2.done(findings.length ? `${findings.length}` : ar ? "لا توجد قواعد تاريخية لهذا النوع" : "No date rules for this document type");

      const s3 = emit.step("explain", ar ? "كتابة ملاحظة للموظف" : "Writing a note for the officer");
      const gen = chatStream({
        messages: [
          {
            role: "system",
            content: `You assist a housing case officer at MNDA. In ${ar ? "Arabic" : "English"}, write 3–5 short bullet points: what the document is, the key facts extracted, whether it satisfies Circular No. 9/2026 for a housing application, and what (if anything) the applicant must provide. Use only the data given.`,
          },
          { role: "user", content: JSON.stringify({ extraction: x, computedFindings: findings }) },
        ],
        modelKey,
        maxTokens: 500,
        solution: "05-case-operations",
        task: "inspect.note",
        signal: emit.signal,
      });
      for (let n = await gen.next(); !n.done; n = await gen.next()) if (n.value.content) emit.text(n.value.content, "note");
      s3.done();
      addAudit({
        solution: "05-case-operations",
        actor: { name: "NARVO Agent", role: "AI agent", kind: "agent" },
        action: "Inspected uploaded document",
        subject: body.name ?? x.title,
        detail: `${x.docType} · confidence ${Math.round(x.confidence * 100)}%`,
      });
    },
    { modelKey },
  );
}
