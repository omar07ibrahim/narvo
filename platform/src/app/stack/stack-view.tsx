"use client";

import { motion } from "motion/react";
import { Check, Cloud, Cpu, HardDrive, Lock, ShieldCheck, Server } from "lucide-react";
import { NarvoMark } from "@/components/brand/logo";
import { formatBytes, usePlatformStatus } from "@/components/shell/privacy-status";
import { MODEL_OPTIONS } from "@/lib/ai/models";
import { useL } from "@/lib/i18n";
import { AREAS, SOLUTIONS } from "@/lib/solutions/registry";
import { cn } from "@/lib/utils";

const CORE = [
  { en: "Agent runtime", ar: "تشغيل الوكلاء", d: { en: "Tool use, multi-step plans, human approval gates", ar: "استخدام الأدوات، خطط متعددة الخطوات، بوابات الاعتماد البشري" } },
  { en: "Retrieval", ar: "الاسترجاع", d: { en: "Arabic-aware search, query planning, numbered citations", ar: "بحث يفهم العربية، تخطيط الاستعلام، استشهادات مرقمة" } },
  { en: "Rules engine", ar: "محرك القواعد", d: { en: "Policies computed in code — never guessed by a model", ar: "السياسات تُحتسب برمجياً — لا تخمين من النموذج" } },
  { en: "Document vision", ar: "قراءة المستندات", d: { en: "Scans, handwriting, IDs, invoices — Arabic & English", ar: "المسوحات والخط اليدوي والهويات والفواتير — عربي وإنجليزي" } },
  { en: "Speech", ar: "الكلام", d: { en: "Whisper transcription, local Arabic voices", ar: "تفريغ Whisper وأصوات عربية محلية" } },
  { en: "Analytics", ar: "التحليلات", d: { en: "Forecasting, process mining, simulation", ar: "التنبؤ وتنقيب العمليات والمحاكاة" } },
  { en: "Governance", ar: "الحوكمة", d: { en: "Audit trail, roles, telemetry, data egress meter", ar: "سجل التدقيق والأدوار والقياس وعداد البيانات الخارجة" } },
];

const HARDWARE = [
  {
    icon: HardDrive,
    title: { en: "Demo workstation", ar: "محطة العرض" },
    spec: "Apple M4 Max · 32 GB unified memory · MLX",
    body: {
      en: "One 27B model in 4-bit (~16 GB) plus speech and retrieval. Runs every solution offline for briefings and pilots.",
      ar: "نموذج 27B بدقة 4-بت (~16 جيجابايت) مع الكلام والاسترجاع. يشغّل جميع الحلول دون اتصال للعروض والتجارب.",
    },
  },
  {
    icon: Server,
    title: { en: "Departmental server", ar: "خادم إداري" },
    spec: "2× NVIDIA L40S · vLLM · on-premises",
    body: {
      en: "Several models resident, ~50 concurrent users, sub-second first token. Typical for a pilot that goes live.",
      ar: "عدة نماذج مقيمة، ~50 مستخدماً متزامناً، أول رمز في أقل من ثانية. نموذجي لتجربة تنتقل للتشغيل.",
    },
  },
  {
    icon: Cloud,
    title: { en: "Sovereign / air-gapped", ar: "سحابة سيادية / معزولة" },
    spec: "H100/H200 cluster · UAE data centre · no internet",
    body: {
      en: "Entity-wide deployment with isolation per department, model evaluation and recovery runbooks.",
      ar: "نشر على مستوى الجهة مع عزل لكل إدارة وتقييم للنماذج وخطط استعادة.",
    },
  },
];

const GUARANTEES = [
  { en: "Data never leaves your infrastructure", ar: "البيانات لا تغادر بنيتك التحتية" },
  { en: "No training on your data — open-weight models you can inspect", ar: "لا تدريب على بياناتك — نماذج مفتوحة قابلة للفحص" },
  { en: "Every model call metered: latency, tokens, bytes out", ar: "كل استدعاء مقاس: الزمن والرموز والبيانات الخارجة" },
  { en: "People approve every action that changes a record", ar: "البشر يعتمدون كل إجراء يغيّر سجلاً" },
  { en: "Swap models without changing solutions — no vendor lock-in", ar: "استبدل النماذج دون تغيير الحلول — لا ارتهان لمورّد" },
  { en: "Arabic-first: documents, speech, UI and answers", ar: "العربية أولاً: المستندات والكلام والواجهة والإجابات" },
];

const STACK = ["Next.js 16", "React 19", "TypeScript", "Tailwind CSS 4", "Qwen3.8 27B", "LM Studio", "MLX", "vLLM", "Whisper", "OpenAI-compatible API", "Zod-validated structured output", "Server-Sent Events"];

export function StackView() {
  const L = useL();
  const s = usePlatformStatus(3000);
  const local = s?.provider === "local";
  return (
    <div className="mx-auto w-full max-w-[1480px] px-6 pt-8 pb-16">
      <div className="label-caps">{L({ en: "Architecture", ar: "البنية" })}</div>
      <h1 className="display-title mt-3 max-w-4xl text-[46px] leading-[1.05]">
        {L({ en: "Customizable, private and intelligent —", ar: "قابل للتخصيص، خاص، وذكي —" })}
        <span className="text-muted-foreground">{L({ en: " on hardware you control.", ar: " على أجهزة تتحكم بها." })}</span>
      </h1>

      {/* Live status */}
      <div className="mt-8 grid grid-cols-4 divide-x divide-border overflow-hidden rounded-lg border border-border bg-card rtl:divide-x-reverse max-lg:grid-cols-2 max-lg:divide-x-0">
        {[
          { k: L({ en: "Mode", ar: "الوضع" }), v: !s ? "—" : local ? L({ en: "On-premises", ar: "داخل الجهة" }) : L({ en: "Development", ar: "تطوير" }), icon: s && !local ? Cloud : ShieldCheck },
          { k: L({ en: "Serving", ar: "الخادم" }), v: s?.host ?? "—", icon: Cpu },
          { k: L({ en: "Active model", ar: "النموذج النشط" }), v: s?.modelLabel ?? "—", icon: Lock },
          { k: L({ en: "Bytes that left the machine", ar: "البيانات التي غادرت الجهاز" }), v: s ? formatBytes(s.egressBytes) : "—", icon: HardDrive },
        ].map((x) => (
          <div key={x.k} className="flex items-center gap-3 px-5 py-4">
            <x.icon className="size-4 text-muted-foreground" />
            <div>
              <div className="label-caps">{x.k}</div>
              <div className="mt-1 text-[15px] font-medium">
                <bdi>{x.v}</bdi>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Layered architecture */}
      <section className="mt-10 grid grid-cols-[minmax(0,1fr)_360px] gap-8 max-xl:grid-cols-1">
        <div className="space-y-3">
          <Layer n="05" title={L({ en: "Solutions", ar: "الحلول" })} sub={L({ en: `${SOLUTIONS.length} solutions across ${AREAS.length} areas of work`, ar: `${SOLUTIONS.length} حلاً في ${AREAS.length} مجالات عمل` })} delay={0}>
            <div className="grid grid-cols-6 gap-1.5 max-lg:grid-cols-3">
              {AREAS.map((a) => (
                <div key={a.id} className="rounded-md border border-border bg-surface px-2.5 py-2">
                  <div className="text-[11.5px] font-medium leading-tight">{L(a.title)}</div>
                  <div className="num mt-1 text-[10.5px] text-muted-foreground">
                    {SOLUTIONS.filter((x) => x.area === a.id).length} {L({ en: "solutions", ar: "حلول" })}
                  </div>
                </div>
              ))}
            </div>
          </Layer>
          <Layer n="04" title={L({ en: "NARVO Core", ar: "نواة نارفو" })} sub={L({ en: "One private core shared by every solution", ar: "نواة خاصة واحدة تشترك فيها جميع الحلول" })} delay={0.05} dark>
            <div className="grid grid-cols-4 gap-1.5 max-lg:grid-cols-2">
              {CORE.map((c) => (
                <div key={c.en} className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2.5">
                  <div className="text-[12.5px] font-medium text-white">{L(c)}</div>
                  <div className="mt-0.5 text-[11px] leading-snug text-white/55">{L(c.d)}</div>
                </div>
              ))}
            </div>
          </Layer>
          <Layer n="03" title={L({ en: "Model runtime", ar: "تشغيل النماذج" })} sub={L({ en: "OpenAI-compatible — the same code on a laptop or a GPU cluster", ar: "متوافق مع OpenAI — الشيفرة نفسها على حاسوب محمول أو عنقود GPU" })} delay={0.1}>
            <div className="flex flex-wrap gap-1.5">
              {["MLX · Apple Silicon", "LM Studio", "vLLM · NVIDIA", "llama.cpp", "Ollama"].map((x) => (
                <span key={x} className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12px]">
                  {x}
                </span>
              ))}
            </div>
          </Layer>
          <Layer n="02" title={L({ en: "Open-weight models", ar: "نماذج مفتوحة الأوزان" })} sub={L({ en: "Open weights, served on your own servers", ar: "أوزان مفتوحة تعمل على خوادم الجهة" })} delay={0.15}>
            <div className="grid gap-1.5">
              {MODEL_OPTIONS.map((m) => (
                <div key={m.key} className="rounded-md border border-border bg-surface px-3 py-2.5">
                  <div className="text-[12.5px] font-medium">{m.label}</div>
                  <div className="text-[11px] text-muted-foreground">{m.publisher}</div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <span className="rounded border border-border px-1 text-[10px] text-muted-foreground">{m.params}</span>
                    <span className="rounded border border-border px-1 text-[10px] text-muted-foreground">{m.licence}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11.5px] text-muted-foreground">
              <span className="rounded-md border border-dashed border-border px-2 py-1">Whisper large-v3-turbo · speech (MLX)</span>
              <span className="rounded-md border border-dashed border-border px-2 py-1">Cohere Transcribe Arabic · speech</span>
              <span className="rounded-md border border-dashed border-border px-2 py-1">Chronos-2 · forecasting</span>
            </div>
          </Layer>
          <Layer n="01" title={L({ en: "Your hardware", ar: "أجهزتك" })} sub={L({ en: "From a workstation to a sovereign cluster", ar: "من محطة عمل إلى عنقود سيادي" })} delay={0.2}>
            <div className="grid grid-cols-3 gap-1.5 max-lg:grid-cols-1">
              {HARDWARE.map((h) => (
                <div key={h.spec} className="rounded-md border border-border bg-surface p-3">
                  <h.icon className="size-4 text-muted-foreground" />
                  <div className="mt-2 text-[12.5px] font-medium">{L(h.title)}</div>
                  <div className="font-mono text-[10.5px] text-muted-foreground">{h.spec}</div>
                  <p className="mt-1.5 text-[11.5px] leading-snug text-muted-foreground">{L(h.body)}</p>
                </div>
              ))}
            </div>
          </Layer>
        </div>

        <div className="space-y-6">
          <div className="relative overflow-hidden rounded-xl bg-sidebar p-6 text-sidebar-foreground">
            <NarvoMark className="absolute -end-4 -bottom-6 h-40 text-white/[0.05]" />
            <div className="label-caps !text-sidebar-muted">{L({ en: "Guarantees", ar: "الضمانات" })}</div>
            <ul className="mt-4 space-y-3">
              {GUARANTEES.map((g) => (
                <li key={g.en} className="flex gap-2.5 text-[13px] leading-snug">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-[#5fb8ad]" />
                  <span>{L(g)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="label-caps">{L({ en: "Built with", ar: "مبني باستخدام" })}</div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {STACK.map((x) => (
                <span key={x} className="rounded-md border border-border bg-surface px-2 py-1 text-[11.5px]">
                  {x}
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-5 text-[12.5px] leading-relaxed text-muted-foreground">
            <div className="label-caps mb-2">{L({ en: "Switching to private mode", ar: "التحويل إلى الوضع الخاص" })}</div>
            <code className="block rounded-md bg-muted px-3 py-2 font-mono text-[11.5px] text-foreground">NARVO_PROVIDER=local</code>
            <p className="mt-2">
              {L({
                en: "One setting. The same solutions, prompts and approvals run against the model server on your own servers; the egress meter stays at zero.",
                ar: "إعداد واحد. تعمل الحلول والتعليمات والاعتمادات نفسها على خادم النماذج على خوادم الجهة، ويبقى عداد البيانات الخارجة عند الصفر.",
              })}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function Layer({
  n,
  title,
  sub,
  children,
  delay,
  dark,
}: {
  n: string;
  title: string;
  sub: string;
  children: React.ReactNode;
  delay: number;
  dark?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 1, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
      className={cn("grid grid-cols-[180px_minmax(0,1fr)] gap-5 rounded-lg border p-4 max-md:grid-cols-1", dark ? "border-transparent bg-sidebar" : "border-border bg-card")}
    >
      <div>
        <div className={cn("num text-[22px] font-light", dark ? "text-white/40" : "text-faint")}>{n}</div>
        <div className={cn("mt-1 text-[15px] font-medium", dark && "text-white")}>{title}</div>
        <div className={cn("mt-0.5 text-[11.5px] leading-snug", dark ? "text-white/50" : "text-muted-foreground")}>{sub}</div>
      </div>
      <div>{children}</div>
    </motion.div>
  );
}
