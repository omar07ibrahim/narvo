"use client";

import { useCallback, useState } from "react";
import { Activity, Headset, UsersRound } from "lucide-react";
import { useL } from "@/lib/i18n";
import { SolutionPage, type ScenarioStep } from "@/components/narvo/solution-page";
import { MetricTile } from "@/components/narvo/metric";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ApprovalSummary } from "@/lib/ai/events";
import type { ConsoleData } from "../_lib/types";
import { LiveConsole } from "./live-console";
import { AgentDesk } from "./agent-desk";
import { Supervisor } from "./supervisor";
import { fmtDuration } from "./bits";

const SCENARIO: ScenarioStep[] = [
  {
    title: { en: "A customer writes in Emirati dialect", ar: "متعامل يكتب باللهجة الإماراتية" },
    body: {
      en: "In the Contact queue, open Saeed Al Romaithi's WhatsApp message (+971 50 418 2276): «شو صار على طلب الإسكان مالي؟». The assistant recognises his registered number (one factor) and politely asks for his Emirates ID before disclosing anything — verification is enforced by the tools, not by the prompt.",
      ar: "من قائمة الانتظار افتح رسالة سعيد الرميثي على واتساب (⁦+971 50 418 2276⁩): «شو صار على طلب الإسكان مالي؟». يتعرف المساعد على رقمه المسجل (عامل واحد) ويطلب رقم الهوية بلطف قبل الإفصاح عن أي معلومة — التحقق تفرضه الأدوات وليس التعليمات.",
    },
  },
  {
    title: { en: "Verified — a precise, cited answer", ar: "بعد التحقق — إجابة دقيقة وموثّقة" },
    body: {
      en: "Click the hint with his Emirates ID. With two factors matched, the assistant reads the live case from Case Operations (05) and explains exactly what is missing: a salary certificate issued within the last 30 days (his is from 12 July) and the no-property certificate — citing Circular 9/2026. Hover the citation chips.",
      ar: "اضغط الاقتراح الذي يحتوي رقم هويته. بعد تطابق عاملين يقرأ المساعد الطلب الحي من وحدة إدارة الحالات (05) ويشرح بدقة ما ينقص: شهادة راتب صادرة خلال آخر 30 يوماً (شهادته بتاريخ 12 يوليو) وشهادة عدم الملكية — مع الاستشهاد بالتعميم 9/2026. مرّر المؤشر على أرقام المصادر.",
    },
  },
  {
    title: { en: "It acts: books an appointment", ar: "ينفّذ: يحجز موعداً" },
    body: {
      en: "Ask to hand in the documents at a centre. The assistant checks real availability (Al Waha is almost full this week), proposes slots and books one — an APT number, a persisted record and an audit entry. Actions appear in the right rail; KPIs update.",
      ar: "اطلب تسليم المستندات في أحد المراكز. يتحقق المساعد من التوفر الفعلي (الواحة شبه ممتلئ هذا الأسبوع)، ويقترح مواعيد ويحجز أحدها — برقم موعد وسجل محفوظ وقيد تدقيق. تظهر الإجراءات في العمود الأيمن وتتحدث المؤشرات.",
    },
  },
  {
    title: { en: "Switch to voice — same context", ar: "التحويل إلى الصوت — بنفس السياق" },
    body: {
      en: "Switch the channel to Voice: press the microphone and speak Arabic or English. Speech is transcribed, the dialect is detected, and the reply is read aloud. Or answer Majid Al Hammadi's call from the queue.",
      ar: "حوّل القناة إلى الصوت: اضغط الميكروفون وتحدث بالعربية أو الإنجليزية. يُفرّغ الكلام وتُكتشف اللهجة ويُقرأ الرد بصوت مسموع. أو أجب مكالمة ماجد الحمادي من القائمة.",
    },
  },
  {
    title: { en: "Handover with the full context", ar: "الإحالة مع كامل السياق" },
    body: {
      en: "Say you want to speak to a person. The assistant writes a context summary (identity, intent, what was tried, sentiment, next step). Open Agent desk: take over, press Suggest reply (grounded in records and policy), edit, send — the reply appears in the customer's conversation. Resolve to close and audit.",
      ar: "اطلب التحدث إلى موظف. يكتب المساعد ملخص السياق (الهوية، الطلب، ما تمت تجربته، المشاعر، الخطوة التالية). افتح مكتب الموظفين: تولَّ المحادثة، واضغط «اقترح رداً» (مستند إلى السجلات والسياسات)، وعدّل وأرسل — يظهر الرد في محادثة المتعامل. ثم أغلق الإحالة لتُسجل في التدقيق.",
    },
  },
  {
    title: { en: "Exceptions wait for a person", ar: "الاستثناءات بيد الإنسان" },
    body: {
      en: "Open the duplicate-payment refund chat (+971 52 471 6630) and give the Emirates ID from the hint. The assistant cannot refund on its own: it raises a request to Sara Ahmed Al Blooshi, CHC Manager. Press Approve refund inline (or approve from Approvals) — the refund record and audit entry are written only then.",
      ar: "افتح محادثة استرداد الرسوم المدفوعة مرتين (⁦+971 52 471 6630⁩) وأرسل رقم الهوية من الاقتراح. لا يستطيع المساعد الاسترداد بنفسه: يرفع طلباً إلى سارة أحمد البلوشي، مديرة مركز إسعاد المتعاملين. اعتمده من البطاقة (أو من صندوق الوارد) — ولا يُكتب سجل الاسترداد وقيد التدقيق إلا عندها.",
    },
  },
  {
    title: { en: "Supervisor: themes become knowledge", ar: "المشرف: المحاور تتحول إلى معرفة" },
    body: {
      en: "Supervisor tab: intent mix versus September's 28,940 contacts and resolution by channel. Press Find themes — the model clusters the transcripts (e.g. the 30-day salary-certificate rule), verifies quotes verbatim, and drafts a bilingual FAQ entry for approval. Approved drafts are added to the knowledge drafts.",
      ar: "تبويب المشرف: توزيع النوايا مقارنة باتصالات سبتمبر البالغة 28,940 والحل حسب القناة. اضغط «اكتشف المحاور» — يجمع النموذج المحادثات (مثل قاعدة الثلاثين يوماً لشهادة الراتب)، ويتحقق من الاقتباسات حرفياً، ويصوغ سؤالاً شائعاً ثنائي اللغة للاعتماد. تُضاف المسودات المعتمدة إلى مسودات المعرفة.",
    },
  },
];

type Data = ConsoleData & { approvals?: ApprovalSummary[] };

export function ContactConsole({ initial }: { initial: Data }) {
  const L = useL();
  const [data, setData] = useState<Data>(initial);
  const [tab, setTab] = useState("live");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/solutions/07-contact-operations/data", { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } catch {}
  }, []);

  const liveConvs = data.conversations.filter((c) => c.live);
  const n = liveConvs.length;
  const noHandoff = liveConvs.filter((c) => !c.handoffId).length;
  const aht = n ? liveConvs.reduce((a, c) => a + c.durationSec, 0) / n : 0;
  const actions =
    data.appointments.filter((a) => a.live).length + data.tickets.filter((t) => t.live).length + data.exceptions.length;
  const liveHandoffs = data.handoffs.filter((h) => h.live).length;
  const waiting = data.handoffs.filter((h) => h.status === "waiting").length;

  return (
    <SolutionPage slug="07-contact-operations" scenario={SCENARIO}>
      <div className="grid grid-cols-5 gap-3 max-lg:grid-cols-3 max-md:grid-cols-2">
        <MetricTile
          label={L({ en: "Contacts handled", ar: "الاتصالات المعالجة" })}
          value={n}
          sub={L({ en: "this demo session", ar: "في جلسة العرض" })}
          icon={<Activity className="size-3.5" />}
        />
        <MetricTile
          label={L({ en: "Resolved without handoff", ar: "حُلّت دون إحالة" })}
          value={n ? `${Math.round((noHandoff / n) * 100)}%` : "—"}
          tone="ai"
          sub={L({ en: "Sept FCR baseline 61%", ar: "خط الأساس لسبتمبر 61%" })}
        />
        <MetricTile label={L({ en: "Avg handle time", ar: "متوسط مدة المعالجة" })} value={n ? fmtDuration(aht) : "—"} sub={L({ en: "Sept phone wait alone 6:40", ar: "انتظار الهاتف وحده 6:40 في سبتمبر" })} />
        <MetricTile label={L({ en: "Actions executed", ar: "الإجراءات المنفذة" })} value={actions} sub={L({ en: "bookings · tickets · approved exceptions", ar: "حجوزات · بلاغات · استثناءات معتمدة" })} />
        <MetricTile
          label={L({ en: "Handoffs", ar: "الإحالات" })}
          value={liveHandoffs}
          sub={`${waiting} ${L({ en: "waiting in Agent desk", ar: "بانتظار مكتب الموظفين" })}`}
          tone={waiting > 2 ? "warning" : "default"}
        />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <TabsList variant="line" className="h-9 border-b border-border w-full justify-start rounded-none pb-0">
          <TabsTrigger value="live" className="flex-none gap-1.5 px-3 text-[13px]">
            <Headset className="size-3.5" />
            {L({ en: "Live console", ar: "وحدة التحكم المباشرة" })}
          </TabsTrigger>
          <TabsTrigger value="desk" className="flex-none gap-1.5 px-3 text-[13px]">
            <UsersRound className="size-3.5" />
            {L({ en: "Agent desk", ar: "مكتب الموظفين" })}
            {waiting > 0 && (
              <span className="num ms-1 rounded-full bg-warning-soft px-1.5 text-[10.5px] text-warning">{waiting}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="supervisor" className="flex-none gap-1.5 px-3 text-[13px]">
            <Activity className="size-3.5" />
            {L({ en: "Supervisor", ar: "المشرف" })}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="live" forceMount className="data-[state=inactive]:hidden">
          <LiveConsole data={data} refresh={refresh} />
        </TabsContent>
        <TabsContent value="desk">
          <AgentDesk data={data} refresh={refresh} />
        </TabsContent>
        <TabsContent value="supervisor">
          <Supervisor data={data} refresh={refresh} />
        </TabsContent>
      </Tabs>
    </SolutionPage>
  );
}
