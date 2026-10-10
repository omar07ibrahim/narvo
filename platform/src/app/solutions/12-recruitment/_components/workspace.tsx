/* eslint-disable react-hooks/set-state-in-effect -- effects react to streamed AI runs and server refreshes (external sources). */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClipboardList, Filter, ListOrdered, Users } from "lucide-react";
import { useNarvoRun } from "@/hooks/use-narvo-run";
import { useL } from "@/lib/i18n";
import { SolutionPage, type ScenarioStep } from "@/components/narvo/solution-page";
import { MetricTile } from "@/components/narvo/metric";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { effectiveRatings, weightedScore, type Criterion, type Evaluation, type RecruitmentState } from "../_lib/types";
import { traceabilityOf } from "./trace";
import { RequisitionTab } from "./requisition-tab";
import { ScreeningTab } from "./screening-tab";
import { ComparisonTab } from "./comparison-tab";
import { FinalistsTab } from "./finalists-tab";
import type { Row } from "./rows";

const SCENARIO: ScenarioStep[] = [
  {
    title: { en: "The requisition and its criteria", ar: "طلب التوظيف ومعاييره" },
    body: {
      en: "MNDA-HR-REQ-2026-077, Senior Planning Engineer — Building Permits (EN/AR). Seven job-related criteria with weights agreed by Eng. Omar Al Hammadi and HR. Weights are editable; every change is audited and the ranking updates instantly.",
      ar: "طلب التوظيف MNDA-HR-REQ-2026-077 لوظيفة مهندس تخطيط أول — رخص البناء (عربي/إنجليزي). سبعة معايير مرتبطة بالوظيفة بأوزان اتفق عليها م. عمر الحمادي والموارد البشرية. الأوزان قابلة للتعديل وكل تغيير يُسجل ويُعاد الترتيب فوراً.",
    },
  },
  {
    title: { en: "86 applications → 24, by rules", ar: "من 86 طلباً إلى 24 — بالقواعد" },
    body: {
      en: "Screening tab: the five minimum requirements are checked deterministically — no AI. 62 applications are screened out, each with the exact reason (degree, years, permit-review experience, registration, missing documents).",
      ar: "تبويب الفرز: تُفحص المتطلبات الخمسة الدنيا بقواعد ثابتة — دون ذكاء اصطناعي. يُستبعد 62 طلباً مع السبب الدقيق لكل منها (المؤهل، سنوات الخبرة، خبرة مراجعة الرخص، التسجيل، المستندات الناقصة).",
    },
  },
  {
    title: { en: "Fairness guard, then AI comparison", ar: "حارس العدالة ثم المقارنة الذكية" },
    body: {
      en: "AI comparison: press Evaluate. Each CV first passes the fairness guard — name, nationality, gender, age, marital status, photo and religion are removed and a leak scan runs. Then 24 CVs are rated in parallel against every criterion. Open “What the model saw”.",
      ar: "المقارنة الذكية: اضغط «تقييم». تمر كل سيرة أولاً بحارس العدالة — يُحذف الاسم والجنسية والجنس والعمر والحالة الاجتماعية والصورة والديانة ويُجرى فحص للتسرب. ثم تُقيّم 24 سيرة بالتوازي مقابل كل معيار. افتح «ما رآه النموذج».",
    },
  },
  {
    title: { en: "Evidence behind every rating", ar: "دليل وراء كل تقييم" },
    body: {
      en: "Select a candidate: each rating carries a verbatim quote, verified against the CV text (traceability KPI), plus the gap. The reasoned priority list is written from anonymised results — names stay hidden until HR chooses to show them.",
      ar: "اختر مرشحاً: لكل تقييم اقتباس حرفي يُتحقق منه مقابل نص السيرة (مؤشر قابلية التتبع) مع النقص. وتُكتب قائمة الأولويات المعللة من نتائج مجهّلة — وتبقى الأسماء مخفية حتى تقرر الموارد البشرية إظهارها.",
    },
  },
  {
    title: { en: "HR selects — the hiring manager approves", ar: "الموارد البشرية تختار — ومدير التوظيف يعتمد" },
    body: {
      en: "Tick six finalists, open Finalists: the comparison matrix shows criteria × finalists with evidence on hover. Request shortlist approval — Eng. Omar Al Hammadi approves inline or from the Inbox.",
      ar: "حدّد ستة مرشحين نهائيين وافتح تبويب المرشحين النهائيين: تعرض المصفوفة المعايير مقابل المرشحين مع الدليل عند التمرير. اطلب اعتماد القائمة — يعتمدها م. عمر الحمادي من البطاقة أو من صندوق الوارد.",
    },
  },
  {
    title: { en: "An interview updates the comparison", ar: "المقابلة تحدّث المقارنة" },
    body: {
      en: "Choose Candidate 0041, load the consented interview record and apply it. The interview clarifies the candidate's master-developer NOC and tower-review experience — ratings move with a visible before → after and the quote that justifies each change.",
      ar: "اختر المرشح 0041 وحمّل سجل المقابلة الموافق عليه وطبّقه. توضّح المقابلة خبرته في تنسيق شهادات عدم الممانعة مع المطور الرئيسي ومراجعة الأبراج — فتتغير التقييمات مع عرض قبل ← بعد والاقتباس المبرر لكل تغيير.",
    },
  },
  {
    title: { en: "Policy and invitations stay with people", ar: "السياسة والدعوات بيد الإنسان" },
    body: {
      en: "Emiratisation (HC-POL-03) is a separate HR switch applied after the evaluation — never by the AI. Draft interview invitations: the model writes a bilingual template without seeing names; Maryam Al Shamsi approves before anything is sent.",
      ar: "التوطين (HC-POL-03) مفتاح منفصل تطبقه الموارد البشرية بعد التقييم — وليس الذكاء الاصطناعي. صِغ دعوات المقابلة: يكتب النموذج قالباً ثنائي اللغة دون رؤية الأسماء، وتعتمده مريم الشامسي قبل إرسال أي شيء.",
    },
  },
];

export function RecruitmentWorkspace({ initial }: { initial: RecruitmentState }) {
  const L = useL();
  const evalRun = useNarvoRun();
  const [state, setState] = useState(initial);
  const [criteria, setCriteria] = useState<Criterion[]>(initial.requisition.criteria);
  const [shortlist, setShortlist] = useState<string[]>(initial.shortlist);
  const [reveal, setReveal] = useState(false);
  const [tab, setTab] = useState(Object.keys(initial.evaluations).length ? "compare" : "requisition");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/solutions/12-recruitment/data", { cache: "no-store" });
    if (res.ok) {
      const s = (await res.json()) as RecruitmentState;
      setState(s);
      setCriteria(s.requisition.criteria);
    }
  }, []);

  useEffect(() => {
    if (evalRun.status === "done" || evalRun.status === "error") refresh();
  }, [evalRun.status, refresh]);

  const toggleShortlist = useCallback((id: string) => {
    setShortlist((cur) => {
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        fetch("/api/solutions/12-recruitment/shortlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "save", shortlist: next }),
        });
      }, 400);
      return next;
    });
  }, []);

  const evaluations: Record<string, Evaluation> = useMemo(
    () => ({ ...state.evaluations, ...((evalRun.data.evaluations as Record<string, Evaluation> | undefined) ?? {}) }),
    [state.evaluations, evalRun.data.evaluations],
  );

  const rows: Row[] = useMemo(() => {
    const mk = (id: string, name: string, headline: string, source: Row["source"], nationality?: string, nameAr?: string, blindHeadline?: string): Row => {
      const ev = evaluations[id];
      const ratings = ev ? effectiveRatings(ev, state.interviews[id]) : [];
      return {
        id,
        name,
        nameAr,
        headline,
        blindHeadline: blindHeadline ?? headline,
        source,
        ev,
        ratings,
        score: ev ? weightedScore(ratings, criteria) : -1,
        trace: ev ? traceabilityOf(ev.ratings) : 0,
        interviews: state.interviews[id]?.length ?? 0,
        nationality,
      };
    };
    const list = [
      ...state.applications
        .filter((a) => a.pass)
        .map((a) =>
          mk(
            a.id,
            a.candidate.name,
            a.headline,
            "application",
            a.candidate.nationality,
            a.candidate.nameAr,
            `${(a.profile.currentRole ?? "").split(/,| — | at /)[0]} · ${a.profile.yearsExperience} ${L({ en: "yrs experience", ar: "سنة خبرة" })} · ${a.profile.yearsPermitReview} ${L({ en: "in permit review", ar: "في مراجعة الرخص" })}`,
          ),
        ),
      ...state.uploads.map((u) => mk(u.id, u.label, L({ en: "Uploaded CV — outside the application window", ar: "سيرة مرفوعة — خارج فترة التقديم" }), "upload")),
    ];
    return list.sort((a, b) => b.score - a.score);
  }, [state.applications, state.uploads, state.interviews, evaluations, criteria, L]);

  const passing = state.applications.filter((a) => a.pass).length;
  const evaluatedApps = rows.filter((r) => r.ev && r.source === "application");
  const avgMs = evaluatedApps.length ? evaluatedApps.reduce((a, r) => a + r.ev!.ms, 0) / evaluatedApps.length : 0;
  const allRatings = rows.filter((r) => r.ev).flatMap((r) => r.ev!.ratings);
  const trace = allRatings.length ? traceabilityOf(allRatings) : null;
  const progress = evalRun.data.progress as { done: number; total: number } | undefined;

  return (
    <SolutionPage slug="12-recruitment" scenario={SCENARIO}>
      <div className="grid grid-cols-6 gap-3 max-xl:grid-cols-3 max-md:grid-cols-2">
        <MetricTile label={L({ en: "Applications", ar: "الطلبات" })} value={state.applications.length} sub={L({ en: "7–28 Sep 2026", ar: "7–28 سبتمبر 2026" })} />
        <MetricTile
          label={L({ en: "Meet minimums", ar: "استوفوا الحد الأدنى" })}
          value={passing}
          sub={`${state.applications.length - passing} ${L({ en: "screened out by rules", ar: "مستبعد بالقواعد" })}`}
        />
        <MetricTile
          label={L({ en: "Evaluated", ar: "تم تقييمهم" })}
          value={`${evaluatedApps.length}/${passing}`}
          tone="ai"
          sub={evalRun.running && progress ? `${L({ en: "running", ar: "جارٍ" })} ${progress.done}/${progress.total}` : L({ en: "against 7 criteria", ar: "مقابل 7 معايير" })}
        />
        <MetricTile
          label={L({ en: "Shortlist", ar: "القائمة المختصرة" })}
          value={shortlist.length}
          sub={
            state.requisition.stage === "invitations_sent"
              ? L({ en: "invitations sent", ar: "أُرسلت الدعوات" })
              : state.requisition.stage === "shortlist_approved"
                ? L({ en: "approved by hiring manager", ar: "معتمدة من مدير التوظيف" })
                : L({ en: "selected by HR", ar: "تختارها الموارد البشرية" })
          }
        />
        <MetricTile
          label={L({ en: "Avg evaluation time", ar: "متوسط زمن التقييم" })}
          value={avgMs ? `${(avgMs / 1000).toFixed(1)} s` : "—"}
          sub={L({ en: "per CV · 6 in parallel", ar: "لكل سيرة · 6 بالتوازي" })}
        />
        <MetricTile
          label={L({ en: "Evidence traceability", ar: "قابلية تتبع الأدلة" })}
          value={trace == null ? "—" : `${Math.round(trace * 100)}%`}
          tone={trace == null ? "default" : trace >= 0.98 ? "success" : "warning"}
          sub={L({ en: "ratings with a verified CV quote", ar: "تقييمات باقتباس موثّق من السيرة" })}
        />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <TabsList variant="line" className="h-9 w-full justify-start rounded-none border-b border-border pb-0">
          <TabsTrigger value="requisition" className="flex-none gap-1.5 px-3 text-[13px]">
            <ClipboardList className="size-3.5" />
            {L({ en: "Requisition & criteria", ar: "الطلب والمعايير" })}
          </TabsTrigger>
          <TabsTrigger value="screening" className="flex-none gap-1.5 px-3 text-[13px]">
            <Filter className="size-3.5" />
            {L({ en: "Screening", ar: "الفرز" })}
            <span className="num ms-1 text-[11px] text-muted-foreground">{state.applications.length}</span>
          </TabsTrigger>
          <TabsTrigger value="compare" className="flex-none gap-1.5 px-3 text-[13px]">
            <ListOrdered className="size-3.5" />
            {L({ en: "AI comparison", ar: "المقارنة الذكية" })}
            <span className="num ms-1 text-[11px] text-muted-foreground">{passing}</span>
          </TabsTrigger>
          <TabsTrigger value="finalists" className="flex-none gap-1.5 px-3 text-[13px]">
            <Users className="size-3.5" />
            {L({ en: "Finalists", ar: "المرشحون النهائيون" })}
            {shortlist.length > 0 && <span className="num ms-1 rounded-full bg-ai-soft px-1.5 text-[10.5px] text-ai">{shortlist.length}</span>}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="requisition">
          <RequisitionTab
            requisition={{ ...state.requisition, criteria }}
            onSaved={(c) => {
              setCriteria(c);
              refresh();
            }}
          />
        </TabsContent>
        <TabsContent value="screening">
          <ScreeningTab applications={state.applications} requisition={state.requisition} />
        </TabsContent>
        <TabsContent value="compare" forceMount className="data-[state=inactive]:hidden">
          <ComparisonTab
            state={state}
            criteria={criteria}
            rows={rows}
            evalRun={evalRun}
            shortlist={shortlist}
            toggleShortlist={toggleShortlist}
            reveal={reveal}
            setReveal={setReveal}
            refresh={refresh}
          />
        </TabsContent>
        <TabsContent value="finalists">
          <FinalistsTab state={state} criteria={criteria} rows={rows} shortlist={shortlist} toggleShortlist={toggleShortlist} reveal={reveal} refresh={refresh} />
        </TabsContent>
      </Tabs>
    </SolutionPage>
  );
}
