import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import type { Citation } from "@/lib/ai/events";
import { search } from "@/lib/retrieval";
import { addAudit, createApproval, listApprovals, type Effect } from "@/lib/store/db";
import { COL, CORPUS, SOL, getContracts, getObligations, loadKpi, setRenewal } from "@/app/solutions/13-contract-intelligence/_lib/server";
import { ORG, renewalDecision, streamText } from "@/app/solutions/13-contract-intelligence/_lib/ai";
import { TODAY, addDays, daysBetween, dueDate, fmtDate, serviceCredits } from "@/app/solutions/13-contract-intelligence/_lib/dates";
import type { RenewalBrief } from "@/app/solutions/13-contract-intelligence/_lib/types";

export const maxDuration = 300;
const CID = "MNDA-CON-2023-019";
const aed = (n: number) => `AED ${n.toLocaleString("en-US")}`;

/** Renewal decision brief for MNDA/CON/2023/019: contract terms + performance evidence → recommendation, EN/AR notice, approval. */
export async function POST(req: Request) {
  const body = await readBody(req);
  const { modelKey, lang } = getPrefs(req, body);

  return eventStream(
    req,
    async (emit) => {
      const c = getContracts().find((x) => x.id === CID);
      if (!c) throw new Error("Contract not found");
      if (listApprovals({ solution: SOL, status: "pending" }).some((a) => a.title.includes("MNDA/CON/2023/019") && /notice|إشعار/i.test(a.title))) {
        throw new Error(lang === "ar" ? "يوجد إشعار بانتظار الاعتماد" : "A renewal notice is already awaiting approval");
      }
      const ob = getObligations().find((o) => o.id === "OBL-019-01");
      const deadline = ob ? dueDate(ob.trigger, c)! : addDays(c.end, -60);
      const daysLeft = daysBetween(TODAY, deadline);

      // 1. computed evidence
      const s1 = emit.step("kpi", lang === "ar" ? "احتساب مؤشرات الأداء وخصومات الخدمة (برمجياً)" : "Computing KPIs and service credits (in code)");
      const kpi = loadKpi();
      const sc = serviceCredits(kpi);
      emit.data("kpi", sc);
      s1.done(`PPM ${sc.ppmAvg}% YTD · ${sc.below95}/9 ${lang === "ar" ? "أشهر دون 95%" : "months < 95%"} · ${aed(sc.total)} · ${daysLeft} ${lang === "ar" ? "يوماً حتى موعد الإشعار" : "days to notice deadline"}`);

      // 2. sources
      const s2 = emit.step("sources", lang === "ar" ? "جمع بنود العقد ومذكرة الأداء" : "Retrieving contract clauses and the performance memo");
      const qs = [
        "renewal option twelve months sole discretion",
        "notice of renewal or non-renewal sixty days before expiry",
        "renewal terms performance review performance improvement plan",
        "service credits PPM compliance below 95%",
        "persistent under-performance material breach three consecutive months",
        "extension other than by renewal variation",
      ];
      const seen = new Set<string>();
      const citations: Citation[] = [];
      for (const q of qs) {
        const h = search(CORPUS.contracts, q, 20).find((x) => x.docId === CID && !seen.has(x.section));
        if (h) {
          seen.add(h.section);
          citations.push({ n: citations.length + 1, docId: h.docId, title: `${c.ref} — ${c.counterparty}`, ref: c.ref, section: h.section, quote: h.text.slice(0, 900) });
        }
      }
      for (const q of ["Al Ghaf comfort complaints CH-02 trips condenser coil cleaning overdue", "options renew extension not renew tender 057", "positive aspects helpdesk other sites stable"]) {
        const h = search(CORPUS.evidence, q, 3).find((x) => !seen.has(x.section));
        if (h) {
          seen.add(h.section);
          citations.push({ n: citations.length + 1, docId: h.docId, title: h.title, ref: h.ref, section: h.section, quote: h.text.slice(0, 900) });
        }
      }
      emit.data("citations", citations);
      s2.done(`${citations.length} ${lang === "ar" ? "مقطعاً" : "passages"}`);

      const facts = [
        `Contract ${c.ref}: ${c.title.en}, ${c.counterparty}. ${aed(c.annualValue ?? 0)} per year (AED 350,000 per month). Term ${fmtDate(c.start)} – ${fmtDate(c.end)}. One optional 12-month renewal at MNDA's sole discretion; notice not less than 60 days before expiry.`,
        `Computed notice deadline: ${fmtDate(deadline)} — ${daysLeft} days from today (${fmtDate(TODAY)}). Contract owner: ${c.owner}. Notice signatory: Director, Procurement & Contracts (Rashed Ali Al Dhaheri).`,
        `PPM compliance 2026 by month: ${kpi.months.map((m) => `${m.month.slice(5)} ${m.ppm}%`).join(", ")}. Year-to-date average ${sc.ppmAvg}% vs 95% target; ${sc.below95} months below 95%; longest run below 90%: ${sc.maxRunBelow90} month(s) (material breach threshold: 3 consecutive) — material breach: ${sc.materialBreach ? "yes" : "no"}.`,
        `P1 attendance YTD ${sc.p1Avg}% (target 95%). Customer satisfaction: ${sc.csat.map((x) => `${x.month} ${x.csat}`).join(", ")} (target 4.0).`,
        `Service credits 2026 (computed per Clause 6 and Schedule 2): ${sc.rows.filter((r) => r.aed > 0).map((r) => `${r.month} ${r.pct}% = ${aed(r.aed)}`).join("; ")}. Total ${aed(sc.total)}.`,
        `Al Ghaf Community Centre: ${sc.complaints} comfort complaints Aug–Sep 2026; CH-02 high-discharge-pressure trips in September: ${kpi.alGhaf.ch02TripsSeptember}; condenser-coil cleaning overdue since ${fmtDate(kpi.alGhaf.coilCleaningOverdueSince)}; September chiller energy +${kpi.alGhaf.energySeptemberVsLastYearPct}% vs Sep 2025; job ${kpi.alGhaf.job}.`,
        "Replacement tender MNDA/PRC/2026/057 for the same facilities closes 22 Oct 2026 with contract start 1 Jan 2027; award may not be final by 31 Dec 2026.",
      ].join("\n");
      const sources = citations.map((x) => `[${x.n}] ${x.title} › ${x.section}\n${x.quote}`).join("\n\n");

      // 3. decision
      const s3 = emit.step("decide", lang === "ar" ? "تقييم الخيارات والتوصية" : "Weighing options and recommending");
      const decision = await renewalDecision({ emit, lang, modelKey }, { facts, sources });
      emit.data("decision", decision);
      s3.done(decision.headline);

      const recLabel = {
        renew_with_conditions: { en: "Renew for 12 months with conditions", ar: "التجديد لمدة 12 شهراً بشروط" },
        short_extension: { en: "Short extension by variation", ar: "تمديد قصير بموجب تعديل" },
        not_renew: { en: "Do not renew", ar: "عدم التجديد" },
      }[decision.recommendation];
      // 4. brief (streamed)
      const s4 = emit.step("brief", lang === "ar" ? "صياغة مذكرة القرار" : "Writing the decision brief");
      const briefSys = [
        `Write a decision brief for MNDA's Director, Procurement & Contracts on the renewal of ${c.ref}, in ${lang === "ar" ? "Arabic (Modern Standard, UAE government register; figures in Latin digits)" : "English"}.`,
        `The recommendation is fixed: ${recLabel[lang]} — "${decision.headline}". Conditions: ${decision.conditions.join(" | ") || "none"}.`,
        lang === "ar"
          ? "استخدم العناوين: ## التوصية · ## موقف العقد · ## أدلة الأداء · ## الخيارات المدروسة · ## الشروط والخطوات التالية."
          : "Headings: ## Recommendation · ## Contract position · ## Performance evidence · ## Options considered · ## Conditions & next steps.",
        "Cite clauses and the memo with [n]. Use the computed figures exactly. About 380 words. No signature block.",
        ORG,
      ].join("\n");
      let brief = "";
      const g1 = streamText({ emit, lang, modelKey }, { system: briefSys, user: `${facts}\n\nSOURCES:\n${sources}`, task: "renewal-brief", maxTokens: 1400 });
      while (true) {
        const n = await g1.next();
        if (n.done) break;
        brief += n.value;
        emit.text(n.value, "brief");
      }
      s4.done();

      // 5. notice letters EN + AR in parallel
      const s5 = emit.step("letters", lang === "ar" ? "صياغة خطاب الإشعار بالعربية والإنجليزية" : "Drafting the notice letter in English and Arabic");
      const letterRef = "MNDA/PRC/CON/2023/019/RN-01";
      const letterSys = (l: "en" | "ar") =>
        [
          `Draft the formal notice letter from Marsa Al Noor Development Authority (MNDA), signed by Rashed Ali Al Dhaheri, Director, Procurement & Contracts, to the General Manager, Raseen Facilities Management LLC, Raseen Building, Al Quoz Industrial 3, Dubai.`,
          `Reference ${letterRef}; date ${fmtDate(TODAY)}; served under Clause 17 in accordance with Clause 3.3 of contract ${c.ref}.`,
          "Letterhead / sender address: Marsa Al Noor Development Authority, MNDA Tower, Corniche Road, Marsa Al Noor (هيئة مرسى النور للتطوير، برج الهيئة، طريق الكورنيش، مرسى النور). Use the Raseen address only for the addressee.",
          `Decision: ${recLabel[l]} — ${decision.headline}. Conditions to state precisely: ${decision.conditions.join(" | ") || "none"}.`,
          "If renewing: the Renewal Term is 1 January 2027 – 31 December 2027 on the same terms and rates (Clause 3.4.1); require written acceptance of the performance improvement plan within 14 days (Clause 3.4.3), extension of the performance security (Clause 4.5.2) and renewed insurance certificates (Clause 8.2.2).",
          "If not renewing: confirm expiry on 31 December 2026 and exit and handover obligations (Clause 9.6). If a short extension: state that it will be documented by a variation agreement under Clause 3.5.",
          l === "ar"
            ? "Write in formal Modern Standard Arabic, UAE government correspondence style (المرجع، التاريخ، الموضوع، تحية طيبة وبعد، وتفضلوا بقبول فائق الاحترام). Use exactly these names: هيئة مرسى النور للتطوير؛ رصين لإدارة المرافق ذ.م.م؛ راشد علي الظاهري، مدير إدارة المشتريات والعقود؛ مركز الغاف المجتمعي. Write dates with Arabic month names and Latin digits (e.g. 11 أكتوبر 2026، 1 يناير 2027). Keep reference numbers in Latin characters. About 220 words. Plain text, no markdown headings."
            : "Write in formal British English correspondence style with Ref, Date, Subject lines. About 220 words. Plain text, no markdown headings.",
          ORG,
        ].join("\n");
      let letterEn = "";
      let letterAr = "";
      await Promise.all([
        (async () => {
          const g = streamText({ emit, lang, modelKey }, { system: letterSys("en"), user: facts, task: "renewal-letter-en", maxTokens: 800 });
          while (true) {
            const n = await g.next();
            if (n.done) break;
            letterEn += n.value;
            emit.text(n.value, "letter_en");
          }
        })(),
        (async () => {
          const g = streamText({ emit, lang, modelKey }, { system: letterSys("ar"), user: facts, task: "renewal-letter-ar", maxTokens: 1000 });
          while (true) {
            const n = await g.next();
            if (n.done) break;
            letterAr += n.value;
            emit.text(n.value, "letter_ar");
          }
        })(),
      ]);
      s5.done(letterRef);

      // 6. approval
      const s6 = emit.step("approval", lang === "ar" ? "إحالة الإشعار للاعتماد والتوقيع" : "Routing the notice for approval and signature");
      const label = recLabel.en;
      const labelLocal = recLabel[lang];
      const extra: Effect[] =
        decision.recommendation === "renew_with_conditions"
          ? [
              {
                type: "append",
                collection: COL.obligations,
                item: {
                  id: "OBL-019-09",
                  contractId: CID,
                  title: { en: "Raseen FM written acceptance of the performance improvement plan", ar: "قبول رصين الخطي لخطة تحسين الأداء" },
                  party: "Supplier",
                  type: "compliance",
                  owner: "Eng. Tariq Mahmoud Saleh",
                  ownerRole: "Director, Facilities & Assets",
                  trigger: { kind: "date", date: addDays(TODAY, 14) },
                  sourceClause: "3.4.3",
                  status: "open",
                  source: "ai",
                },
              },
            ]
          : decision.recommendation === "not_renew"
            ? [
                {
                  type: "append",
                  collection: COL.obligations,
                  item: {
                    id: "OBL-019-10",
                    contractId: CID,
                    title: { en: "Agree exit management and handover plan with Raseen FM", ar: "الاتفاق على خطة إدارة الخروج والتسليم مع رصين" },
                    party: "MNDA",
                    type: "deliverable",
                    owner: "Eng. Tariq Mahmoud Saleh",
                    ownerRole: "Director, Facilities & Assets",
                    trigger: { kind: "date", date: addDays(TODAY, 30) },
                    sourceClause: "9.6",
                    status: "open",
                    source: "ai",
                  },
                },
              ]
            : [
                {
                  type: "append",
                  collection: COL.obligations,
                  item: {
                    id: "OBL-019-11",
                    contractId: CID,
                    title: { en: "Execute variation agreement for the short extension", ar: "توقيع اتفاقية التعديل لتمديد قصير" },
                    party: "MNDA",
                    type: "notice",
                    owner: "Shamma Khalid Al Mansoori",
                    ownerRole: "Senior Contracts Officer",
                    trigger: { kind: "date", date: "2026-12-01" },
                    sourceClause: "3.5",
                    status: "open",
                    source: "ai",
                  },
                },
              ];
      const approval = createApproval({
        solution: SOL,
        title: lang === "ar" ? `اعتماد وتوقيع إشعار ${c.ref} — ${labelLocal}` : `Approve & sign notice — ${c.ref} — ${label}`,
        summary: `${decision.headline} ${lang === "ar" ? "الموعد النهائي للإشعار" : "Notice deadline"} ${fmtDate(deadline)} (${daysLeft} ${lang === "ar" ? "يوماً" : "days"}).`,
        actionLabel: lang === "ar" ? "اعتماد وإصدار الإشعار" : "Approve & issue notice",
        approver: { name: "Rashed Ali Al Dhaheri", title: lang === "ar" ? "مدير إدارة المشتريات والعقود" : "Director, Procurement & Contracts" },
        effects: [
          { type: "patch", collection: COL.obligations, id: "OBL-019-01", patch: { status: "done", doneAt: TODAY, action: `Notice ${letterRef} issued — ${label}. ${decision.headline}`.slice(0, 400) } },
          { type: "patch", collection: COL.contracts, id: CID, patch: { renewalDecision: { decision: label, at: Date.now(), by: "Rashed Ali Al Dhaheri" } } },
          { type: "append", collection: COL.letters, item: { id: letterRef, contractId: CID, decision: decision.recommendation, en: letterEn, ar: letterAr } },
          ...extra,
          { type: "audit", action: "Renewal notice issued to contractor", subject: `${c.ref} — ${c.counterparty}`, detail: `${label}; served ${fmtDate(TODAY)}, ${daysLeft} days before the ${fmtDate(deadline)} deadline` },
        ],
      });
      const brief0: RenewalBrief = {
        at: Date.now(),
        lang,
        recommendation: decision.recommendation,
        headline: decision.headline,
        conditions: decision.conditions,
        brief,
        letterEn,
        letterAr,
        citations,
        approvalId: approval.id,
      };
      setRenewal(brief0);
      addAudit({ solution: SOL, actor: { name: "NARVO Agent", role: "AI agent", kind: "agent" }, action: "Prepared renewal decision brief", subject: c.ref, detail: decision.headline });
      s6.waiting(approval.id);
      emit.data("renewal", brief0);
      emit.send({
        type: "approval",
        approval: { id: approval.id, title: approval.title, summary: approval.summary, solution: SOL, actionLabel: approval.actionLabel, approver: approval.approver, status: "pending", createdAt: approval.createdAt },
      });
    },
    { modelKey },
  );
}
