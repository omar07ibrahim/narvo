import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { chatStream } from "@/lib/ai/client";
import { createApproval, patchRecord } from "@/lib/store/db";
import { search } from "@/lib/retrieval";
import type { Citation } from "@/lib/ai/events";
import { COL, CORPUS, DIRECTOR, getInspection, loadRegistry, loadTaxonomy } from "@/app/solutions/18-visual-inspection/_lib/data";
import { assess } from "@/app/solutions/18-visual-inspection/_lib/rules";
import type { CorrectiveTask, Notice } from "@/app/solutions/18-visual-inspection/_lib/types";

const fmtDate = (iso: string, lang: "en" | "ar", time = true) =>
  new Intl.DateTimeFormat(lang === "ar" ? "ar-AE-u-nu-latn" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(time ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
    timeZone: "Asia/Dubai",
  }).format(new Date(iso));
const aed = (n: number, lang: "en" | "ar") => (lang === "ar" ? `${n.toLocaleString("en-US")} درهم` : `AED ${n.toLocaleString("en-US")}`);

/**
 * Accepted findings → computed due dates, repeat escalation and penalties → bilingual Notice of Violation
 * (deterministic header, table and clauses; corrective-action wording drafted by the model in EN and AR in
 * parallel) → approval by the Director, Field Operations & Inspection, which creates the corrective tasks.
 */
export async function POST(req: Request) {
  const body = await readBody<{ inspectionId?: string }>(req);
  const { modelKey, lang } = getPrefs(req, body);
  const ar = lang === "ar";
  const { state, insp } = getInspection(body.inspectionId ?? "");
  if (!insp) return new Response("Inspection not found", { status: 404 });
  if (insp.status === "notice_issued" || insp.status === "closed") return new Response("A notice has already been issued for this inspection", { status: 409 });
  const accepted = state.findings.filter((f) => f.inspectionId === insp.id && f.status === "accepted");
  if (!accepted.length) return new Response(ar ? "لا توجد ملاحظات معتمدة" : "No accepted findings — review the AI flags first", { status: 400 });
  const pendingFlags = state.findings.filter((f) => f.inspectionId === insp.id && f.status === "proposed").length;

  return eventStream(
    req,
    async (emit) => {
      const tax = loadTaxonomy();
      const reg = loadRegistry();
      const contractor = reg.contractors.find((c) => c.name === insp.contractor);
      const servedAt = Date.now();

      const s1 = emit.step("rules", ar ? "احتساب المواعيد النهائية والغرامات وفحص التكرار (المادة 31)" : "Computing due dates, penalties and repeat check (Art. 31)");
      const items = accepted.map((f) => assess(f, insp, state, tax, servedAt));
      const order = { critical: 0, major: 1, minor: 2 } as const;
      items.sort((a, b) => order[a.severity] - order[b.severity]);
      const total = items.reduce((s, x) => s + x.penaltyAed, 0);
      const critical = items.filter((x) => x.severity === "critical").length;
      emit.data(
        "assessment",
        items.map((x) => ({ findingId: x.finding.id, code: x.finding.code, severity: x.severity, baseSeverity: x.baseSeverity, article: x.article, dueAt: x.dueAt, penaltyAed: x.penaltyAed, repeat: x.repeat })),
      );
      s1.done(
        ar
          ? `${items.length} ملاحظات · ${critical} حرجة · إجمالي الغرامات ${aed(total, "ar")}${items.some((x) => x.repeat.escalated) ? " · تصعيد بسبب التكرار" : ""}${pendingFlags ? ` · ${pendingFlags} غير مراجعة مستبعدة` : ""}`
          : `${items.length} findings · ${critical} critical · penalties ${aed(total, "en")}${items.some((x) => x.repeat.escalated) ? " · repeat escalation applied" : ""}${pendingFlags ? ` · ${pendingFlags} unreviewed flag(s) excluded` : ""}`,
      );

      const s2 = emit.step("sources", ar ? "استرجاع نصوص المواد من اللائحة" : "Retrieving the cited articles from CSSR-2025");
      const hits = [
        ...new Map(
          [...items.map((x) => x.article), "Art. 31", "Art. 32"]
            .flatMap((a) => search(CORPUS, [`${a} CSSR-2025`, a.replace("Art.", "المادة")], 2))
            .map((h) => [`${h.docId}|${h.section}`, h] as const),
        ).values(),
      ].slice(0, 10);
      const citations: Citation[] = hits.map((h, i) => ({ n: i + 1, docId: h.docId, title: h.title, ref: h.ref, section: h.section, quote: h.text.slice(0, 420) }));
      emit.data("citations", citations);
      s2.done(ar ? `${hits.length} مقاطع من ${new Set(hits.map((h) => h.docId)).size} مستندات` : `${hits.length} passages from ${new Set(hits.map((h) => h.docId)).size} documents`);

      const noticeId = `MNDA-VN-2026-0${1377 + state.notices.length + 1}`;
      const inspDate = (l: "en" | "ar") => fmtDate(insp.date, l);
      const header = (l: "en" | "ar") => {
        const sev = (s: string) => (l === "ar" ? tax.severities[s as "critical"].ar : tax.severities[s as "critical"].en);
        const rows = items
          .map((x, i) => {
            const d = tax.defects.find((dd) => dd.code === x.finding.code)!;
            const sevTxt =
              x.repeat.escalated && x.severity !== x.baseSeverity
                ? `${sev(x.severity)} (${l === "ar" ? "تصعيد — تكرار خلال 90 يوماً" : "escalated — repeat within 90 days"})`
                : x.repeat.prior
                  ? `${sev(x.severity)} (${l === "ar" ? `تكرار خلال ${x.repeat.prior.days} يوماً` : `repeat within ${x.repeat.prior.days} days`})`
                  : sev(x.severity);
            const titleIsAr = /[؀-ۿ]/.test(x.finding.title);
            const title = (l === "ar") === titleIsAr ? `: ${x.finding.title}` : "";
            return `| ${i + 1} | ${d.code} — ${l === "ar" ? d.name_ar : d.name}${title} | ${l === "ar" ? x.article.replace("Art.", "المادة") : x.article} | ${sevTxt} | ${fmtDate(x.dueAt, l)} | ${aed(x.penaltyAed, l)}${x.repeat.doubled ? (l === "ar" ? " (مضاعفة)" : " (doubled)") : ""} |`;
          })
          .join("\n");
        if (l === "ar")
          return [
            `## إشعار مخالفة رقم ${noticeId}`,
            `**هيئة مرسى النور للتطوير — إدارة العمليات الميدانية والتفتيش**`,
            "",
            `- **مرجع التفتيش:** ${insp.id} — ${inspDate("ar")}`,
            `- **رقم القطعة:** ${insp.plot} · **رخصة البناء:** ${insp.permit}`,
            `- **المقاول الرئيسي:** ${contractor?.name_ar ?? insp.contractor} (${contractor?.licence ?? "—"})`,
            `- **الاستشاري:** ${insp.consultant}`,
            "",
            `بالإشارة إلى التفتيش على السلامة الذي أُجري في الموقع بتاريخ ${fmtDate(insp.date, "ar", false)}، ثبتت المخالفات التالية للائحة السلامة في مواقع البناء (CSSR-2025) بعد مراجعتها واعتمادها من المفتش المخوّل:`,
            "",
            "| م | الرمز والملاحظة | المادة | الدرجة | موعد التصحيح | الغرامة |",
            "|---|---|---|---|---|---|",
            rows,
            "",
            `**إجمالي الغرامات:** ${aed(total, "ar")}`,
            "",
            "### الإجراءات التصحيحية المطلوبة",
            "",
          ].join("\n");
        return [
          `## Notice of Violation ${noticeId}`,
          `**Marsa Al Noor Development Authority — Field Operations & Inspection Department**`,
          "",
          `- **Inspection reference:** ${insp.id} — ${inspDate("en")}`,
          `- **Plot:** ${insp.plot} · **Building permit:** ${insp.permit}`,
          `- **Main contractor:** ${insp.contractor} (${contractor?.licence ?? "—"})`,
          `- **Consultant:** ${insp.consultant}`,
          "",
          `Further to the site safety inspection carried out on ${fmtDate(insp.date, "en", false)}, the following violations of the MNDA Construction Site Safety Regulation (CSSR-2025) were confirmed by the authorised inspector:`,
          "",
          "| No. | Code and finding | Article | Severity | Due | Penalty |",
          "|---|---|---|---|---|---|",
          rows,
          "",
          `**Total penalties:** ${aed(total, "en")}`,
          "",
          "### Required corrective actions",
          "",
        ].join("\n");
      };
      const footer = (l: "en" | "ar") => {
        const stop = critical > 0;
        if (l === "ar")
          return [
            "",
            "",
            "### أحكام عامة",
            stop ? `- **إيقاف العمل في المناطق المتأثرة:** يسري فوراً على مواقع الملاحظات الحرجة اعتباراً من ${fmtDate(new Date(servedAt).toISOString(), "ar")} ولحين التحقق من التصحيح (المادة 31.2).` : "",
            "- **التحقق من الإغلاق:** بإعادة التفتيش أو بمراجعة صور مؤرخة من الزاوية نفسها تُرفع عبر الخدمات الإلكترونية للهيئة (المادة 31.5).",
            "- **حق الاعتراض:** خلال 10 أيام عمل إلى مدير إدارة العمليات الميدانية والتفتيش، ولا يوقف الاعتراض سريان المواعيد أو أوامر الإيقاف (المادة 32.5).",
            "- **عدم التصحيح في الموعد:** تُفرض غرامة إضافية مساوية لغرامة الفئة (الملحق ب.4).",
            "",
            `صدر بتفويض من مدير إدارة العمليات الميدانية والتفتيش — م. حمد جمعة الكعبي.  `,
            `المفتش المخوّل: ${insp.inspector.name_ar} (${insp.inspector.id}).  `,
            "يُعتد بالنص العربي عند الاختلاف.",
          ]
            .filter(Boolean)
            .join("\n");
        return [
          "",
          "",
          "### General provisions",
          stop ? `- **Area stop-work:** effective immediately at the location of each Critical finding from ${fmtDate(new Date(servedAt).toISOString(), "en")} until the corrective action is verified (Art. 31.2).` : "",
          "- **Verification of closure:** by re-inspection or review of timestamped photographs from the same viewpoint, submitted through MNDA e-services (Art. 31.5).",
          "- **Right of objection:** within 10 working days to the Director, Field Operations & Inspection; an objection does not suspend timescales or stop-work (Art. 32.5).",
          "- **Failure to rectify by the due date:** an additional penalty equal to the class penalty applies (Annex B.4).",
          "",
          `Issued under the authority of the Director, Field Operations & Inspection — Eng. Hamad Juma Al Kaabi.  `,
          `Authorised inspector: ${insp.inspector.name} (${insp.inspector.id}).  `,
          "The Arabic text prevails.",
        ]
          .filter(Boolean)
          .join("\n");
      };

      const s3 = emit.step("draft", ar ? "صياغة الإجراءات التصحيحية بالعربية والإنجليزية" : "Drafting corrective actions in English and Arabic");
      const facts = items
        .map((x, i) => {
          const d = tax.defects.find((dd) => dd.code === x.finding.code)!;
          return `${i + 1}. ${d.code} ${d.name} — ${x.article} (${x.severity}${x.repeat.escalated ? ", escalated repeat" : ""}); due ${fmtDate(x.dueAt, "en")}.\n   Observed: ${x.finding.title}. ${x.finding.description}\n   Requirement: ${d.requirement}`;
        })
        .join("\n");
      const sources = hits.map((h, i) => `[${i + 1}] ${h.title} — ${h.section}\n${h.text.slice(0, 700)}`).join("\n\n");
      async function draft(l: "en" | "ar") {
        emit.text(header(l), l);
        const gen = chatStream({
          messages: [
            {
              role: "system",
              content: [
                "You draft the 'Required corrective actions' section of an MNDA Notice of Violation (formal regulatory register).",
                "Write a numbered list with exactly one item per finding, in the same order. Each item: bold lead with the code and a 3–6 word title, then 1–2 sentences stating precisely what the contractor must do to comply with the cited article (concrete, measurable, from the requirement text), and end with the due date exactly as given.",
                "For Critical findings add the interim measure required immediately (e.g. barricade and stop access). Do not add penalties, preamble, headings or closing text. Do not invent facts.",
                l === "ar"
                  ? "Write in formal Modern Standard Arabic (UAE government register: «يلتزم المقاول بـ…»). Keep codes (D01) and article numbers in Latin digits."
                  : "Write in English.",
              ].join("\n"),
            },
            { role: "user", content: `Findings:\n${facts}\n\nRegulation excerpts:\n${sources}` },
          ],
          modelKey,
          temperature: 0.2,
          maxTokens: 1100,
          solution: "18-visual-inspection",
          task: `notice.${l}`,
          signal: emit.signal,
        });
        let text = "";
        for (let n = await gen.next(); !n.done; n = await gen.next()) {
          if (n.value.content) {
            text += n.value.content;
            emit.text(n.value.content, l);
          }
        }
        emit.text(footer(l), l);
        return header(l) + text + footer(l);
      }
      const [textEn, textAr] = await Promise.all([draft("en"), draft("ar")]);
      s3.done();

      const s4 = emit.step("verify", ar ? "التحقق من اكتمال الإشعار (المادة 32.2)" : "Checking notice completeness (Art. 32.2)");
      const checks = items.map((x) => {
        const code = x.finding.code;
        return { code, en: textEn.split("### Required corrective actions")[1]?.includes(code) ?? false, ar: textAr.split("### الإجراءات التصحيحية المطلوبة")[1]?.includes(code) ?? false };
      });
      const missing = checks.filter((c) => !c.en || !c.ar);
      emit.data("checks", checks);
      s4.done(
        missing.length
          ? ar
            ? `تحذير: ${missing.map((m) => m.code).join(", ")} غير مذكورة في قسم الإجراءات`
            : `Warning: ${missing.map((m) => m.code).join(", ")} not addressed in the actions section`
          : ar
            ? "كل ملاحظة لها إجراء تصحيحي بالعربية والإنجليزية · الرؤوس والجدول محسوبة آلياً"
            : "Every finding has a corrective action in both languages · header and table computed",
      );

      const s5 = emit.step("approval", ar ? "إحالة الإشعار للاعتماد" : "Routing the notice for approval");
      const baseTask = 30410 + state.tasks.length;
      const tasks: CorrectiveTask[] = items.map((x, i) => ({
        id: `CT-2026-${baseTask + i + 1}`,
        inspectionId: insp.id,
        findingId: x.finding.id,
        noticeId,
        code: x.finding.code,
        severity: x.severity,
        escalated: x.repeat.escalated,
        title: x.finding.title,
        owner: insp.contractor,
        plot: insp.plot,
        dueAt: x.dueAt,
        penaltyAed: x.penaltyAed,
        status: "open",
        createdAt: servedAt,
      }));
      const notice: Notice = {
        id: noticeId,
        inspectionId: insp.id,
        contractor: insp.contractor,
        plot: insp.plot,
        issuedAt: servedAt,
        approvedBy: DIRECTOR.name,
        textEn,
        textAr,
        penaltyTotal: total,
        stopWork: critical > 0,
        findingIds: items.map((x) => x.finding.id),
      };
      patchRecord(COL.inspections, insp.id, { status: "notice_pending" });
      const approval = createApproval({
        solution: "18-visual-inspection",
        title: `Issue Notice of Violation ${noticeId} — ${insp.contractor}`,
        summary: `${insp.id} · plot ${insp.plot}: ${items.length} finding(s) (${critical} critical) — ${items.map((x) => `${x.finding.code} due ${fmtDate(x.dueAt, "en")}`).join("; ")}. Penalties ${aed(total, "en")}.${critical ? " Area stop-work applies." : ""} Creates ${tasks.length} corrective task(s) owned by ${insp.contractor}.`,
        actionLabel: "Approve & serve notice",
        approver: DIRECTOR,
        requestedBy: insp.inspector.name,
        payload: { noticeId, inspectionId: insp.id },
        effects: [
          { type: "append", collection: COL.notices, item: notice as unknown as Record<string, unknown> & { id: string } },
          ...tasks.map((t) => ({ type: "append" as const, collection: COL.tasks, item: t as unknown as Record<string, unknown> & { id: string } })),
          { type: "patch", collection: COL.inspections, id: insp.id, patch: { status: "notice_issued", noticeId } },
          { type: "audit", action: "Served Notice of Violation via e-services", subject: `${noticeId} → ${insp.contractor}`, detail: `${contractor?.email ?? ""} · copies to owner and ${insp.consultant}` },
          { type: "audit", action: "Created corrective tasks", subject: tasks.map((t) => t.id).join(", "), detail: `Owner ${insp.contractor}; earliest due ${fmtDate(tasks[0].dueAt, "en")}` },
        ],
      });
      emit.send({
        type: "approval",
        approval: {
          id: approval.id,
          title: approval.title,
          summary: approval.summary,
          solution: approval.solution,
          actionLabel: approval.actionLabel,
          approver: approval.approver,
          status: "pending",
          createdAt: approval.createdAt,
        },
      });
      s5.waiting(ar ? `بانتظار ${DIRECTOR.name}` : `Awaiting ${DIRECTOR.name}`);
    },
    { modelKey },
  );
}
