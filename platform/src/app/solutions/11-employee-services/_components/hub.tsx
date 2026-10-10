"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Headset, UserRound } from "lucide-react";
import { SolutionPage, type ScenarioStep } from "@/components/narvo/solution-page";
import { MetricTile } from "@/components/narvo/metric";
import { Workbench } from "@/components/narvo/pane";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useL, usePrefs } from "@/lib/i18n";
import type { Employee, ServiceRequest } from "../_lib/shared";
import { Assistant } from "./assistant";
import { ProfilePanel } from "./profile";
import { ServiceDesk } from "./desk";
import { Segmented } from "./segmented";

const SCENARIO: ScenarioStep[] = [
  {
    title: { en: "Ask in everyday Arabic", ar: "اسأل بلغتك اليومية" },
    body: {
      en: "Select Obaid Hamad Al Ketbi, building inspector — his own housing application is on hold. Click “أبا شهادة راتب حق طلب الإسكان…”. The assistant searches policy, cites the 30-day rule of Circular 9/2026 and prepares a salary certificate form linked to his case.",
      ar: "اختر عبيد حمد الكتبي، مفتش المباني — طلبه السكني معلّق. اضغط «أبا شهادة راتب حق طلب الإسكان…». يبحث المساعد في السياسات ويستشهد بقاعدة الثلاثين يوماً في التعميم 9/2026 ويجهّز نموذج شهادة راتب مرتبطاً بطلبه.",
    },
  },
  {
    title: { en: "Review, submit, approve", ar: "راجع وقدّم واعتمد" },
    body: {
      en: "On the right, the form is pre-filled and eligibility-checked. Adjust a field, then Submit for approval: request HRS-… is created and routed to Latifa Al Romaithi (HR Services, 1 working day). Approve it on the card — the timeline in “My requests” moves to Approved.",
      ar: "على اليمين نموذج معبأ ومتحقق من الأهلية. عدّل حقلاً ثم «تقديم للاعتماد»: يُنشأ الطلب HRS-… ويُحال إلى لطيفة الرميثي (خدمات الموارد البشرية، يوم عمل واحد). اعتمده من البطاقة — ينتقل المسار في «طلباتي» إلى «اعتُمد».",
    },
  },
  {
    title: { en: "Eligibility is computed", ar: "الأهلية محسوبة لا مُخمَّنة" },
    body: {
      en: "Ask “لابتوبي قديم وايد…” — the laptop bought in November 2021 is 4.9 years old, so replacement is eligible under the 4-year lifecycle. Then ask to work from home on Wednesday: refused with the HC-POL-07 citation, because inspection roles are field-based.",
      ar: "اسأل «لابتوبي قديم وايد…» — الجهاز المشترى في نوفمبر 2021 عمره 4.9 سنوات فيستحق الاستبدال وفق دورة السنوات الأربع. ثم اطلب العمل من البيت يوم الأربعاء: يُرفض مع الاستشهاد بسياسة HC-POL-07 لأن وظائف التفتيش ميدانية.",
    },
  },
  {
    title: { en: "Answers that close the loop", ar: "إجابات تُغني عن التذكرة" },
    body: {
      en: "Switch to Khalfan Mohammed Al Ali and ask whether unused leave carries over. A cited policy answer, no ticket — the “Deflected questions” KPI increases. Try Reem Al Marri asking for Thursday remote work: the weekly 2-day limit is checked against her approved Tuesday.",
      ar: "انتقل إلى خلفان محمد العلي واسأل عن ترحيل الإجازات. إجابة موثقة من السياسة دون تذكرة — يرتفع مؤشر «الأسئلة المُجاب عنها ذاتياً». جرّب ريم المري تطلب العمل عن بُعد يوم الخميس: يُتحقق من حد اليومين مقابل يوم الثلاثاء المعتمد.",
    },
  },
  {
    title: { en: "Service desk view", ar: "عرض مكتب الخدمة" },
    body: {
      en: "Toggle to Service desk: one HR/IT queue sorted by SLA, with live timers — Aisha's certificate is already overdue. Open Obaid's new request, Start fulfilment, then Issue certificate & complete. Every move is persisted and audited.",
      ar: "بدّل إلى «مكتب الخدمة»: قائمة موحدة للموارد البشرية وتقنية المعلومات مرتبة حسب مستوى الخدمة بعدادات مباشرة — شهادة عائشة متأخرة بالفعل. افتح طلب عبيد الجديد، ثم «بدء التنفيذ» ثم «إصدار الشهادة وإغلاق الطلب». كل خطوة محفوظة ومسجلة.",
    },
  },
  {
    title: { en: "The finished document", ar: "المستند النهائي" },
    body: {
      en: "View the issued certificate: Arabic, basic salary and allowances from payroll — salary figures never go to the model — and valid for housing for 30 days. Back in the employee view, Obaid's timeline reads Completed; the KPIs update.",
      ar: "اعرض الشهادة الصادرة: بالعربية، بالراتب الأساسي والبدلات من نظام الرواتب — لا تُرسل أرقام الرواتب إلى النموذج — وصالحة للإسكان 30 يوماً. وفي عرض الموظف يظهر مسار عبيد «اكتمل» وتتحدث المؤشرات.",
    },
  },
];

interface Stats {
  period: string;
  questions: number;
  deflected: number;
  live: { questions: number; deflected: number };
}

export function EmployeeHub({ employees, initialRequests, initialStats }: { employees: Employee[]; initialRequests: ServiceRequest[]; initialStats: Stats }) {
  const L = useL();
  const { lang } = usePrefs();
  const [view, setView] = useState<"employee" | "desk">("employee");
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? "");
  const [requests, setRequests] = useState(initialRequests);
  const [stats, setStats] = useState(initialStats);
  const employee = employees.find((e) => e.id === employeeId) ?? employees[0];
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/solutions/11-employee-services/requests");
      if (!res.ok) return;
      const j = (await res.json()) as { requests: ServiceRequest[]; stats: Stats };
      setRequests(j.requests);
      setStats(j.stats);
    } catch {}
  }, []);

  // Approvals can also be decided from the global Inbox — keep the view current.
  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now());
      if (document.visibilityState === "visible") refresh();
    }, 8000);
    return () => clearInterval(t);
  }, [refresh]);

  const kpi = useMemo(() => {
    const open = requests.filter((r) => !["completed", "rejected"].includes(r.status));
    const today = new Date(now).toDateString();
    const completedToday = requests.filter((r) => r.completedAt && new Date(r.completedAt).toDateString() === today).length;
    const done = requests.filter((r) => r.completedAt);
    const avgH = done.length ? done.reduce((a, r) => a + (Date.parse(r.completedAt!) - Date.parse(r.submittedAt)), 0) / done.length / 3600000 : 0;
    const overdue = open.filter((r) => Date.parse(r.dueAt) < now).length;
    return { open: open.length, overdue, completedToday, avgH, done: done.length };
  }, [requests, now]);

  const pct = stats.questions ? Math.round((stats.deflected / stats.questions) * 100) : 0;

  return (
    <SolutionPage slug="11-employee-services" scenario={SCENARIO}>
      <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2">
        <MetricTile
          label={L({ en: "Open requests", ar: "الطلبات المفتوحة" })}
          value={kpi.open}
          tone={kpi.overdue ? "warning" : "default"}
          sub={kpi.overdue ? L({ en: `${kpi.overdue} past SLA`, ar: `${kpi.overdue} تجاوزت مستوى الخدمة` }) : L({ en: "all within SLA", ar: "جميعها ضمن مستوى الخدمة" })}
        />
        <MetricTile
          label={L({ en: "Completed today", ar: "المكتملة اليوم" })}
          value={kpi.completedToday}
          tone={kpi.completedToday ? "success" : "default"}
          sub={L({ en: `${kpi.done} completed in total`, ar: `${kpi.done} مكتملة إجمالاً` })}
        />
        <MetricTile
          label={L({ en: "Avg handling time", ar: "متوسط زمن المعالجة" })}
          value={kpi.avgH >= 24 ? `${(kpi.avgH / 24).toFixed(1)} d` : `${kpi.avgH.toFixed(1)} h`}
          sub={L({ en: "submitted → completed", ar: "من التقديم إلى الإكمال" })}
        />
        <MetricTile
          label={L({ en: "Deflected questions", ar: "أسئلة أُجيبت ذاتياً" })}
          value={stats.deflected}
          tone="ai"
          sub={L({ en: `${pct}% of ${stats.questions} · since 1 Oct`, ar: `${pct}% من ${stats.questions} · منذ 1 أكتوبر` })}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {view === "employee" ? (
            <>
              <span className="label-caps">{L({ en: "Signed in as", ar: "مسجّل الدخول باسم" })}</span>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger className="h-9 min-w-72 bg-card text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id} className="text-[13px]">
                      <span className="font-medium">{lang === "ar" ? e.nameAr : e.name}</span>
                      <span className="text-muted-foreground"> · {lang === "ar" ? e.titleAr : e.title}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          ) : (
            <span className="text-[12.5px] text-muted-foreground">
              {L({ en: "Signed in as HR Services & IT Service Desk", ar: "مسجّل الدخول بصفة خدمات الموارد البشرية ومكتب خدمة تقنية المعلومات" })}
            </span>
          )}
        </div>
        <Segmented
          value={view}
          onChange={(v) => {
            setView(v);
            refresh();
          }}
          items={[
            { value: "employee", label: L({ en: "Employee", ar: "الموظف" }), icon: <UserRound className="size-3.5" /> },
            { value: "desk", label: L({ en: "Service desk", ar: "مكتب الخدمة" }), icon: <Headset className="size-3.5" /> },
          ]}
        />
      </div>

      {view === "employee" && employee ? (
        <Workbench cols="300px minmax(0,1fr) 400px">
          <ProfilePanel employee={employee} requests={requests} />
          <Assistant employee={employee} onRequestsChanged={refresh} />
        </Workbench>
      ) : (
        <ServiceDesk requests={requests} employees={employees} onRequests={(r) => { setRequests(r); refresh(); }} />
      )}
    </SolutionPage>
  );
}
