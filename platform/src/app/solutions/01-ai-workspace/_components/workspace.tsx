"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, Library, ListChecks, MessageSquareText, PenLine, Zap } from "lucide-react";
import { SolutionPage, type ScenarioStep } from "@/components/narvo/solution-page";
import { MetricTile } from "@/components/narvo/metric";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useL } from "@/lib/i18n";
import { ROLES, SCOPES, type LibraryDoc, type Mode, type OutboxItem, type RoleKey, type ScopeKey, type TaskRecord } from "../_lib/shared";
import { AccessChip, Segmented } from "./ui-bits";
import { AskPanel } from "./ask-panel";
import { DraftPanel } from "./draft-panel";
import { ActPanel } from "./act-panel";
import { TasksTab } from "./tasks-tab";
import { LibraryTab } from "./library-tab";

const buildScenario = (n: number): ScenarioStep[] => [
  {
    title: { en: "Ask, with sources", ar: "اسأل مع المصادر" },
    body: {
      en: "Role: Case officer. Ask “Which plots need a master-developer NOC, and how long is an NOC valid?”. Hover the citation chips — each claim points to the exact passage of Circular 14/2026. Ask a follow-up to show the conversation keeps context.",
      ar: "الدور: موظف معالجة. اسأل «ما قطع الأراضي التي تحتاج إلى شهادة عدم ممانعة من المطور الرئيسي، وما مدة صلاحيتها؟». مرّر المؤشر على أرقام المصادر — كل معلومة تشير إلى المقطع الدقيق من التعميم 14/2026. اطرح سؤال متابعة لإظهار احتفاظ المحادثة بالسياق.",
    },
  },
  {
    title: { en: "Access follows the role", ar: "الصلاحية تتبع الدور" },
    body: {
      en: "Switch to Contractor (external) and ask “How is Circular 14/2026 affecting permit cycle times in gated communities?”. The confidential Q3 review is withheld server-side. Switch to Director and ask again — now the answer cites 27.9 vs 16.8 days and the 9.2-day NOC wait.",
      ar: "بدّل إلى «مقاول (جهة خارجية)» واسأل «كيف يؤثر التعميم 14/2026 على مدة إصدار الرخص في المجتمعات المسوّرة؟». تُحجب مراجعة الربع الثالث السرية من الخادم. بدّل إلى «مدير إدارة» واسأل مجدداً — تستشهد الإجابة الآن بـ 27.9 مقابل 16.8 يوماً و9.2 يوم انتظار.",
    },
  },
  {
    title: { en: "Ask your own document", ar: "اسأل مستندك" },
    body: {
      en: "Drop a .md/.txt file or a photo of a page (e.g. a contractor letter) into “Ask your document”. The vision model reads it on the platform; ask “Is what this contractor requests allowed under Circular 14/2026?” — the answer cites both the letter and the circular.",
      ar: "أضف ملف .md/.txt أو صورة صفحة (مثل رسالة مقاول) في «اسأل مستندك». يقرأها نموذج الرؤية على المنصة؛ اسأل «هل ما يطلبه المقاول مسموح وفق التعميم 14/2026؟» — تستشهد الإجابة بالرسالة والتعميم معاً.",
    },
  },
  {
    title: { en: "Draft from knowledge", ar: "صياغة من المعرفة" },
    body: {
      en: "Open Draft, choose “Reply to a contractor” and generate. The letter streams with citations; the citation check confirms every marker resolves. Switch to Edit, adjust a sentence, and download the .md with its source list.",
      ar: "افتح «صياغة» واختر «رد على مقاول» ثم أنشئ المسودة. تظهر الرسالة تدريجياً مع المصادر؛ ويؤكد فحص الإسناد صحة كل إشارة. انتقل إلى «تحرير» وعدّل جملة ثم نزّل ملف .md مع قائمة المصادر.",
    },
  },
  {
    title: { en: "From briefing to tasks", ar: "من الإحاطة إلى المهام" },
    body: {
      en: "Open Act as Director and run “Brief me on how Circular 14/2026 affects Marina Quarter permits and create review tasks for the permit team”. Watch the trace: searches, document reads, then 2–3 proposed tasks routed to Eng. Omar Al Hammadi. Approve them inline.",
      ar: "افتح «تنفيذ» بصفة مدير وشغّل «أعطني إحاطة حول أثر التعميم 14/2026 على رخص حي المارينا، وأنشئ مهام مراجعة لفريق الرخص». تابع المسار: عمليات البحث وقراءة المستندات ثم 2–3 مهام مقترحة تُحال إلى م. عمر الحمادي. اعتمدها مباشرة.",
    },
  },
  {
    title: { en: "Work that is really done", ar: "عمل منجز فعلاً" },
    body: {
      en: "Open Tasks: the approved tasks appear with owner, due date and evidence references. Expand one and press Mark done — it is persisted and recorded in the audit trail together with the approvals.",
      ar: "افتح «المهام»: تظهر المهام المعتمدة مع المسؤول وتاريخ الاستحقاق ومراجع الأدلة. افتح إحداها واضغط «تعليم كمنجزة» — يُحفظ ذلك ويُسجّل في سجل التدقيق مع الاعتمادات.",
    },
  },
  {
    title: { en: "One governed library", ar: "مكتبة واحدة محوكمة" },
    body: {
      en: `Open Library as Case officer: browse all ${n} documents, switch to Search passages and search in Arabic, then open the Q3 performance review — it is locked for this role. All of it runs on the Authority's own infrastructure.`,
      ar: `افتح «المكتبة» بصفة موظف معالجة: تصفّح المستندات الـ ${n}، وانتقل إلى «بحث في المقاطع» وابحث بالعربية، ثم افتح مراجعة أداء الربع الثالث — إنها مقفلة لهذا الدور. وكل ذلك يعمل على البنية التحتية الخاصة بالهيئة.`,
    },
  },
];

const STATS_KEY = "narvo-01-session";

export function Workspace({
  docs,
  initialTasks,
  initialOutbox,
}: {
  docs: LibraryDoc[];
  initialTasks: TaskRecord[];
  initialOutbox: OutboxItem[];
}) {
  const L = useL();
  const [tab, setTab] = useState("workspace");
  const [mode, setMode] = useState<Mode>("ask");
  const [role, setRole] = useState<RoleKey>("case_officer");
  const [scope, setScope] = useState<ScopeKey>("all");
  const [tasks, setTasks] = useState(initialTasks);
  const [outbox, setOutbox] = useState(initialOutbox);
  const [stats, setStats] = useState<{ answers: number; totalMs: number }>({ answers: 0, totalMs: 0 });

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STATS_KEY);
      if (raw) setStats(JSON.parse(raw));
    } catch {}
  }, []);

  const recordAnswer = useCallback((ms: number) => {
    setStats((s) => {
      const next = { answers: s.answers + 1, totalMs: s.totalMs + (ms || 0) };
      try {
        sessionStorage.setItem(STATS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const refreshTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/solutions/01-ai-workspace/tasks");
      const j = (await res.json()) as { tasks: TaskRecord[]; outbox: OutboxItem[] };
      setTasks(j.tasks);
      setOutbox(j.outbox);
    } catch {}
  }, []);

  const passages = useMemo(() => docs.reduce((a, d) => a + d.passages, 0), [docs]);
  const scopes = useMemo(() => SCOPES.filter((s) => s.key === "all" || docs.some((d) => d.scope === s.key)), [docs]);
  const accessible = docs.filter((d) => ROLES[role].access.includes(d.classification)).length;
  const created = tasks.filter((t) => t._createdAt).length;
  const open = tasks.filter((t) => t.status === "open").length;
  const avg = stats.answers ? stats.totalMs / stats.answers / 1000 : null;
  const scenario = useMemo(() => buildScenario(docs.length), [docs.length]);

  return (
    <SolutionPage slug="01-ai-workspace" scenario={scenario}>
      <div className="grid grid-cols-5 gap-3 max-xl:grid-cols-3 max-md:grid-cols-2">
        <MetricTile
          label={L({ en: "Documents indexed", ar: "المستندات المفهرسة" })}
          value={docs.length}
          sub={L({ en: `${accessible} readable as ${ROLES[role].label.en.toLowerCase()}`, ar: `${accessible} متاحة لدور ${ROLES[role].label.ar}` })}
        />
        <MetricTile label={L({ en: "Passages", ar: "المقاطع" })} value={passages.toLocaleString()} sub={L({ en: "Arabic + English, BM25", ar: "عربي + إنجليزي" })} />
        <MetricTile
          label={L({ en: "Answers this session", ar: "إجابات هذه الجلسة" })}
          value={stats.answers}
          tone={stats.answers ? "ai" : "default"}
          sub={L({ en: "ask · draft · act", ar: "سؤال · صياغة · تنفيذ" })}
        />
        <MetricTile
          label={L({ en: "Avg answer time", ar: "متوسط زمن الإجابة" })}
          value={avg != null ? <span dir="auto">{L({ en: `${avg.toFixed(1)} s`, ar: `${avg.toFixed(1)} ث` })}</span> : "—"}
          sub={L({ en: "end-to-end, incl. retrieval", ar: "من البداية للنهاية مع البحث" })}
        />
        <MetricTile
          label={L({ en: "Tasks created", ar: "المهام المنشأة" })}
          value={created}
          tone={created ? "success" : "default"}
          sub={L({ en: `${open} open across teams`, ar: `${open} مفتوحة لدى الفرق` })}
        />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border">
          <TabsList variant="line" className="h-9">
            <TabsTrigger value="workspace" className="px-3 text-[13px]">
              <MessageSquareText className="size-3.5" /> {L({ en: "Workspace", ar: "مساحة العمل" })}
            </TabsTrigger>
            <TabsTrigger value="tasks" className="px-3 text-[13px]">
              <ListChecks className="size-3.5" /> {L({ en: "Tasks", ar: "المهام" })}
              <span className="num text-[11px] text-muted-foreground">{open}</span>
            </TabsTrigger>
            <TabsTrigger value="library" className="px-3 text-[13px]">
              <Library className="size-3.5" /> {L({ en: "Library", ar: "المكتبة" })}
            </TabsTrigger>
          </TabsList>
          <div className="flex flex-wrap items-center gap-2 pb-1.5">
            <Select value={scope} onValueChange={(v) => setScope(v as ScopeKey)}>
              <SelectTrigger size="sm" className="min-w-36 bg-card text-[12.5px]">
                <span className="label-caps !text-[9px] me-1">{L({ en: "Scope", ar: "النطاق" })}</span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {scopes.map((s) => (
                  <SelectItem key={s.key} value={s.key} className="text-[12.5px]">
                    {L(s.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={role} onValueChange={(v) => setRole(v as RoleKey)}>
              <SelectTrigger size="sm" className="min-w-44 bg-card text-[12.5px]">
                <span className="label-caps !text-[9px] me-1">{L({ en: "Role", ar: "الدور" })}</span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(ROLES).map((r) => (
                  <SelectItem key={r.key} value={r.key} className="text-[12.5px]">
                    {L(r.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <AccessChip role={role} />
          </div>
        </div>

        <TabsContent value="workspace" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented
              value={mode}
              onChange={setMode}
              items={[
                { value: "ask", label: L({ en: "Ask", ar: "اسأل" }), icon: <MessageSquareText className="size-3.5" /> },
                { value: "draft", label: L({ en: "Draft", ar: "صياغة" }), icon: <PenLine className="size-3.5" /> },
                { value: "act", label: L({ en: "Act", ar: "تنفيذ" }), icon: <Bot className="size-3.5" /> },
              ]}
            />
            <span className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
              <Zap className="size-3.5 text-ai" />
              {mode === "ask"
                ? L({ en: "Cited answers in Arabic or English, with follow-ups", ar: "إجابات موثقة بالعربية أو الإنجليزية مع أسئلة متابعة" })
                : mode === "draft"
                  ? L({ en: "Briefings, letters, FAQs and emails grounded in selected sources", ar: "إحاطات ورسائل وأسئلة شائعة مبنية على مصادر مختارة" })
                  : L({ en: "Research → briefing → tasks and emails behind human approval", ar: "بحث ← إحاطة ← مهام ورسائل بعد اعتماد بشري" })}
            </span>
          </div>
          {/* Panels stay mounted so a running answer is not lost when switching modes. */}
          <div className={mode === "ask" ? "" : "hidden"}>
            <AskPanel role={role} scope={scope} onAnswered={recordAnswer} />
          </div>
          <div className={mode === "draft" ? "" : "hidden"}>
            <DraftPanel role={role} scope={scope} docs={docs} onDrafted={recordAnswer} />
          </div>
          <div className={mode === "act" ? "" : "hidden"}>
            <ActPanel role={role} scope={scope} onActed={recordAnswer} onApproved={refreshTasks} />
          </div>
        </TabsContent>

        <TabsContent value="tasks">
          <TasksTab tasks={tasks} outbox={outbox} role={role} onChange={setTasks} />
        </TabsContent>

        <TabsContent value="library">
          <LibraryTab docs={docs} role={role} scope={scope} />
        </TabsContent>
      </Tabs>
    </SolutionPage>
  );
}
