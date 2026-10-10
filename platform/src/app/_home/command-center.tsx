"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { ArrowUpRight, Bot, Cloud, Cpu, Hand, ShieldCheck, UserRound, WifiOff } from "lucide-react";
import { NarvoMark } from "@/components/brand/logo";
import { SolutionIcon } from "@/components/narvo/icons";
import { StatusPill } from "@/components/narvo/status";
import { formatBytes, usePlatformStatus } from "@/components/shell/privacy-status";
import { useFormat, useL, usePrefs } from "@/lib/i18n";
import { AREAS, SOLUTIONS, pad2, solutionPath } from "@/lib/solutions/registry";
import { ORGS } from "@/lib/world/orgs";
import { cn } from "@/lib/utils";

interface AuditRow {
  id: string;
  ts: number;
  solution: string;
  actor: { name: string; role: string; kind: "human" | "agent" | "system" };
  action: string;
  subject: string;
  detail?: string;
}

interface ApprovalRow {
  id: string;
  solution: string;
  title: string;
  approver: { name: string; title: string };
  createdAt: number;
  status: string;
}

function greeting(lang: "en" | "ar") {
  const h = new Date().getHours();
  if (lang === "ar") return h < 12 ? "صباح الخير" : "مساء الخير";
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function CommandCenter() {
  const L = useL();
  const f = useFormat();
  const { lang } = usePrefs();
  const status = usePlatformStatus(3000);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [allApprovals, setAllApprovals] = useState<ApprovalRow[]>([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [a, p, all] = await Promise.all([
        fetch("/api/audit?limit=60").then((r) => r.json()),
        fetch("/api/approvals?status=pending").then((r) => r.json()),
        fetch("/api/approvals").then((r) => r.json()),
      ]);
      if (!alive) return;
      setAudit(a.events);
      setApprovals(p.approvals);
      setAllApprovals(all.approvals);
    };
    load();
    const t = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const local = status?.provider === "local";
  const executed = allApprovals.filter((a) => a.status === "approved").length;
  const persona = ORGS.mnda.persona;
  const bySolution = useMemo(() => Object.fromEntries(SOLUTIONS.map((s) => [s.slug, s])), []);

  return (
    <div className="mx-auto w-full max-w-[1680px] px-6 pt-8 pb-14">
      {/* Hero */}
      <section className="grid grid-cols-[minmax(0,1fr)_420px] gap-8 max-xl:grid-cols-1">
        <div>
          <div className="label-caps">
            {greeting(lang)}, {lang === "ar" ? persona.nameAr.split(" ")[0] : persona.name.split(" ")[0]} · {f.date(Date.now(), { weekday: "long", day: "numeric", month: "long" })}
          </div>
          <h1 className="display-title mt-4 text-[52px] leading-[1.02] max-md:text-[36px]">
            {L({ en: "Private intelligence,", ar: "ذكاء خاص،" })}
            <br />
            <span className="text-muted-foreground">{L({ en: "running inside your walls.", ar: "يعمل داخل جدرانك." })}</span>
          </h1>
          <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            {L({
              en: "Twenty AI solutions on one private core — reading Arabic documents, answering from policy, acting through agents and asking people before anything changes. Open-weight models, your data, your hardware.",
              ar: "عشرون حلاً للذكاء الاصطناعي على نواة خاصة واحدة — تقرأ المستندات العربية، وتجيب من السياسات، وتنفذ عبر الوكلاء، وتستأذن البشر قبل أي تغيير. نماذج مفتوحة، وبياناتك، وأجهزتك.",
            })}
          </p>
          <div className="mt-7 flex flex-wrap gap-2">
            <Link
              href="/solutions/05-case-operations"
              className="inline-flex h-9 items-center gap-2 rounded-md bg-foreground px-4 text-[13px] font-medium text-background transition-opacity hover:opacity-90"
            >
              {L({ en: "Start with a live case", ar: "ابدأ بحالة حية" })}
              <ArrowUpRight className="size-3.5 rtl:-scale-x-100" />
            </Link>
            <Link
              href="/stack"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border-strong bg-card px-4 text-[13px] font-medium transition-colors hover:bg-muted"
            >
              {L({ en: "How it runs on-device", ar: "كيف تعمل على الجهاز" })}
            </Link>
          </div>
        </div>

        {/* Privacy card */}
        <div className="relative overflow-hidden rounded-xl bg-sidebar p-6 text-sidebar-foreground">
          <NarvoMark className="absolute -end-6 -bottom-8 h-56 text-white/[0.04]" />
          <div className="flex items-center gap-2.5">
            <span className={cn("flex size-8 items-center justify-center rounded-full", local ? "bg-[#5fb8ad]/15 text-[#5fb8ad]" : "bg-[#c98a2b]/15 text-[#e0a64a]")}>
              {local ? <ShieldCheck className="size-4" /> : <Cloud className="size-4" />}
            </span>
            <div>
              <div className="text-[14px] font-medium text-white">
                {local ? L({ en: "Private mode — on this device", ar: "الوضع الخاص — على هذا الجهاز" }) : L({ en: "Development mode", ar: "وضع التطوير" })}
              </div>
              <div className="text-[11.5px] text-sidebar-muted">{status ? `${status.modelLabel} · ${status.host}` : "…"}</div>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-4">
            {[
              { k: L({ en: "Data egress", ar: "البيانات الخارجة" }), v: status ? formatBytes(status.egressBytes) : "—", accent: local },
              { k: L({ en: "AI calls", ar: "استدعاءات" }), v: status ? f.number(status.calls) : "—" },
              { k: L({ en: "Avg. latency", ar: "متوسط الزمن" }), v: status?.avgMs ? `${(status.avgMs / 1000).toFixed(1)} s` : "—" },
            ].map((x) => (
              <div key={x.k}>
                <div className="text-[10px] tracking-[0.14em] text-sidebar-muted uppercase">{x.k}</div>
                <div className={cn("num mt-1 text-[24px] font-light", x.accent ? "text-[#5fb8ad]" : "text-white")}>{x.v}</div>
              </div>
            ))}
          </div>
          <div className="mt-6 flex items-start gap-2.5 rounded-lg border border-sidebar-border bg-white/[0.03] p-3 text-[12px] leading-relaxed text-sidebar-foreground/80">
            <WifiOff className="mt-0.5 size-3.5 shrink-0 text-sidebar-muted" />
            {local
              ? L({ en: "Disconnect the network — every solution keeps working. Nothing leaves this machine.", ar: "افصل الشبكة — تستمر جميع الحلول بالعمل. لا شيء يغادر هذا الجهاز." })
              : L({ en: "Same open-weight models as on-device, served remotely for development. Switch NARVO_PROVIDER=local to run fully private.", ar: "النماذج المفتوحة نفسها كما على الجهاز، تُخدَّم عن بُعد للتطوير. بدّل إلى الوضع المحلي للتشغيل الخاص بالكامل." })}
          </div>
        </div>
      </section>

      {/* KPI band */}
      <section className="mt-10 grid grid-cols-5 divide-x divide-border overflow-hidden rounded-lg border border-border bg-card rtl:divide-x-reverse max-lg:grid-cols-2 max-lg:divide-x-0">
        {[
          { k: L({ en: "Solutions live", ar: "حلول تعمل" }), v: `${SOLUTIONS.length}`, s: L({ en: "6 areas of work", ar: "6 مجالات عمل" }) },
          { k: L({ en: "Client workspaces", ar: "مساحات العملاء" }), v: "2", s: "MNDA · Raseen Group" },
          { k: L({ en: "Awaiting approval", ar: "بانتظار الاعتماد" }), v: `${approvals.length}`, s: L({ en: "people decide, AI prepares", ar: "البشر يقررون، والذكاء يجهّز" }), warn: approvals.length > 0 },
          { k: L({ en: "Actions executed", ar: "إجراءات منفذة" }), v: `${executed}`, s: L({ en: "after human approval", ar: "بعد الاعتماد البشري" }) },
          { k: L({ en: "Models available", ar: "النماذج المتاحة" }), v: "4", s: "Qwen · Gemma · Falcon · Jais" },
        ].map((x) => (
          <div key={x.k} className="px-5 py-4">
            <div className="label-caps">{x.k}</div>
            <div className={cn("num mt-2 text-[30px] leading-none font-light", x.warn && "text-warning")}>{x.v}</div>
            <div className="mt-2 text-[11.5px] text-muted-foreground">{x.s}</div>
          </div>
        ))}
      </section>

      <section className="mt-10 grid grid-cols-[minmax(0,1fr)_400px] gap-8 max-xl:grid-cols-1">
        {/* Solutions map */}
        <div>
          <div className="mb-4 flex items-end justify-between">
            <div>
              <div className="label-caps">{L({ en: "Find your starting point", ar: "اختر نقطة البداية" })}</div>
              <h2 className="display-title mt-1.5 text-[26px]">{L({ en: "Twenty solutions, one private core", ar: "عشرون حلاً، نواة خاصة واحدة" })}</h2>
            </div>
            <Link href="/solutions" className="text-[12.5px] text-muted-foreground hover:text-foreground">
              {L({ en: "Catalogue view →", ar: "عرض الكتالوج ←" })}
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-7 max-lg:grid-cols-1">
            {AREAS.map((area) => (
              <div key={area.id}>
                <div className="flex items-baseline gap-3 border-b border-border pb-2">
                  <span className="num text-[22px] font-light text-muted-foreground">{pad2(area.id)}</span>
                  <span className="text-[14.5px] font-medium">{L(area.title)}</span>
                </div>
                <ul className="mt-1">
                  {SOLUTIONS.filter((s) => s.area === area.id).map((s) => (
                    <li key={s.slug}>
                      <Link
                        href={solutionPath(s)}
                        className="group flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-card"
                      >
                        <span className="num w-5 text-[11px] text-faint">{pad2(s.n)}</span>
                        <SolutionIcon name={s.icon} className="size-4 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2 text-[13.5px] font-medium">
                            <span className="truncate">{L(s.title)}</span>
                            {s.hero && <span className="size-1.5 shrink-0 rounded-full bg-ai" />}
                          </span>
                          <span className="block truncate text-[12px] text-muted-foreground">{L(s.promise)}</span>
                        </span>
                        <span
                          className="hidden rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white group-hover:inline-block"
                          style={{ background: ORGS[s.org].color }}
                        >
                          {ORGS[s.org].short}
                        </span>
                        <ArrowUpRight className="size-3.5 text-faint opacity-0 transition-opacity group-hover:opacity-100 rtl:-scale-x-100" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Right rail: approvals + live activity */}
        <div className="space-y-6">
          <div className="rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="label-caps">{L({ en: "Waiting for a decision", ar: "بانتظار قرار" })}</span>
              <Link href="/inbox" className="text-[12px] text-muted-foreground hover:text-foreground">
                {L({ en: "Open inbox", ar: "فتح الصندوق" })}
              </Link>
            </div>
            {approvals.length === 0 ? (
              <p className="px-4 py-5 text-[12.5px] text-muted-foreground">
                {L({ en: "Nothing pending. Run any solution — every action the agents propose lands here first.", ar: "لا شيء معلق. شغّل أي حل — كل إجراء يقترحه الوكلاء يصل هنا أولاً." })}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {approvals.slice(0, 5).map((a) => (
                  <li key={a.id} className="flex items-start gap-3 px-4 py-3">
                    <Hand className="mt-0.5 size-3.5 shrink-0 text-warning" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12.5px] font-medium">{a.title}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {a.approver.name} · {f.relative(a.createdAt)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="label-caps">{L({ en: "Live activity", ar: "النشاط المباشر" })}</span>
              <StatusPill tone="ai" pulse>
                {L({ en: "Live", ar: "مباشر" })}
              </StatusPill>
            </div>
            <ul className="scrollbar-thin max-h-[560px] divide-y divide-border overflow-y-auto">
              {audit.slice(0, 30).map((e, i) => {
                const s = bySolution[e.solution];
                return (
                  <motion.li key={e.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 10) * 0.02 }} className="flex gap-3 px-4 py-3">
                    <span
                      className={cn(
                        "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
                        e.actor.kind === "agent" ? "bg-ai-soft text-ai" : e.actor.kind === "human" ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {e.actor.kind === "agent" ? <Bot className="size-3.5" /> : e.actor.kind === "human" ? <UserRound className="size-3.5" /> : <Cpu className="size-3.5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] leading-snug">
                        <span className="font-medium">{e.action}</span>
                        <span className="text-muted-foreground"> · {e.subject}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className="truncate">{e.actor.name}</span>
                        {s && (
                          <>
                            <span className="text-faint">·</span>
                            <Link href={solutionPath(s)} className="num shrink-0 hover:text-foreground">
                              {pad2(s.n)}
                            </Link>
                          </>
                        )}
                        <span className="ms-auto shrink-0">{f.relative(e.ts)}</span>
                      </div>
                    </div>
                  </motion.li>
                );
              })}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
