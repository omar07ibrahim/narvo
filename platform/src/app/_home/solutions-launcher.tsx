"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight, Clock } from "lucide-react";
import { SolutionIcon } from "@/components/narvo/icons";
import { useL } from "@/lib/i18n";
import { AREAS, SOLUTIONS, getSolution, pad2, solutionPath, type Bilingual, type OrgId } from "@/lib/solutions/registry";
import { ORGS } from "@/lib/world/orgs";
import { cn } from "@/lib/utils";

/** The recommended live demo path: what to open, in order, and what the audience will see. */
const PATH: Array<{ slug: string; see: Bilingual; minutes: number }> = [
  {
    slug: "05-case-operations",
    minutes: 4,
    see: {
      en: "Six Arabic and English scans read, Circular 9/2026 checked in code, one clarification approved by a named official.",
      ar: "قراءة ستة مستندات عربية وإنجليزية، والتحقق برمجياً وفق التعميم 9/2026، واعتماد طلب استيفاء واحد من مسؤول محدد.",
    },
  },
  {
    slug: "07-contact-operations",
    minutes: 3,
    see: {
      en: "An Emirati-dialect customer is verified, their case is read live and an appointment is booked.",
      ar: "التحقق من متعامل يتحدث باللهجة الإماراتية، وقراءة حالته مباشرة، وحجز موعد له.",
    },
  },
  {
    slug: "02-decision-intelligence",
    minutes: 2,
    see: {
      en: "The Director-General's weekly briefing, with every figure computed and traced to its source.",
      ar: "الإحاطة الأسبوعية للمدير العام، وكل رقم فيها محسوب ومرتبط بمصدره.",
    },
  },
  {
    slug: "01-ai-workspace",
    minutes: 2,
    see: {
      en: "The same question asked by two roles: restricted documents withheld, then cited.",
      ar: "السؤال نفسه من دورين مختلفين: حجب المستندات المقيدة ثم الاستشهاد بها.",
    },
  },
  {
    slug: "09-bid-proposal",
    minutes: 2,
    see: {
      en: "Forty-six tender requirements mapped to evidence; an unsupported claim is caught.",
      ar: "ربط ستة وأربعين متطلباً في المناقصة بالأدلة، ورصد ادعاء غير مدعوم.",
    },
  },
];

function OrgTag({ org }: { org: OrgId }) {
  const o = ORGS[org];
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <span className="size-1.5 rounded-full" style={{ background: o.color }} />
      {o.short}
    </span>
  );
}

export function DemoPath() {
  const L = useL();
  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="label-caps">{L({ en: "Recommended demo path", ar: "مسار العرض المقترح" })}</div>
          <h2 className="display-title mt-1.5 text-[26px]">{L({ en: "Fifteen minutes, five live pilots", ar: "خمس عشرة دقيقة، خمس تجارب حية" })}</h2>
        </div>
        <span className="text-[12px] text-muted-foreground">
          {L({ en: "Each solution also has its own demo script — top right of its page.", ar: "لكل حل سيناريو عرض خاص به — أعلى يمين صفحته." })}
        </span>
      </div>
      <ol className="grid grid-cols-5 gap-3 max-2xl:grid-cols-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
        {PATH.map((p, i) => {
          const s = getSolution(p.slug)!;
          return (
            <li key={p.slug} className="min-w-0">
              <Link
                href={solutionPath(s)}
                className="group flex h-full flex-col rounded-lg border border-border bg-card p-4 transition-all hover:border-border-strong hover:shadow-[0_2px_16px_rgba(0,0,0,0.05)]"
              >
                <div className="flex items-center justify-between">
                  <span className="flex size-6 items-center justify-center rounded-full bg-foreground text-[11px] font-medium text-background">{i + 1}</span>
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Clock className="size-3" />
                    {p.minutes} {L({ en: "min", ar: "د" })}
                  </span>
                </div>
                <div className="mt-4 flex items-center gap-2 text-muted-foreground">
                  <SolutionIcon name={s.icon} className="size-4" />
                  <span className="num text-[11px]">{pad2(s.n)}</span>
                </div>
                <div className="mt-1.5 text-[14px] leading-snug font-medium">{L(s.title)}</div>
                <p className="mt-1.5 flex-1 text-[12px] leading-relaxed text-muted-foreground">{L(p.see)}</p>
                <div className="mt-3 flex items-center justify-between border-t border-border pt-2.5">
                  <OrgTag org={s.org} />
                  <ArrowUpRight className="size-3.5 text-faint transition-colors group-hover:text-foreground rtl:-scale-x-100" />
                </div>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

type OrgFilter = "all" | OrgId;

export function SolutionsLauncher() {
  const L = useL();
  const [area, setArea] = useState<number | "all">("all");
  const [org, setOrg] = useState<OrgFilter>("all");

  const list = useMemo(
    () => SOLUTIONS.filter((s) => (area === "all" || s.area === area) && (org === "all" || s.org === org)),
    [area, org],
  );

  const chip = (active: boolean) =>
    cn(
      "h-7 shrink-0 rounded-full border px-3 text-[12px] transition-colors",
      active ? "border-foreground bg-foreground text-background" : "border-border bg-card text-muted-foreground hover:text-foreground",
    );

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="label-caps">{L({ en: "Find your starting point", ar: "اختر نقطة البداية" })}</div>
          <h2 className="display-title mt-1.5 text-[26px]">{L({ en: "Twenty solutions, one private core", ar: "عشرون حلاً، نواة خاصة واحدة" })}</h2>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-muted p-0.5">
          {(["all", "mnda", "raseen"] as const).map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => setOrg(o)}
              className={cn(
                "h-7 rounded-full px-3 text-[12px] transition-colors",
                org === o ? "bg-card font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {o === "all" ? L({ en: "All clients", ar: "جميع العملاء" }) : o === "mnda" ? L({ en: "Government · MNDA", ar: "حكومي · الهيئة" }) : L({ en: "Enterprise · Raseen", ar: "خاص · رصين" })}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        <button type="button" className={chip(area === "all")} onClick={() => setArea("all")}>
          {L({ en: "All areas", ar: "جميع المجالات" })} <span className="num opacity-60">{SOLUTIONS.length}</span>
        </button>
        {AREAS.map((a) => (
          <button key={a.id} type="button" className={chip(area === a.id)} onClick={() => setArea(a.id)}>
            {L(a.short)} <span className="num opacity-60">{SOLUTIONS.filter((s) => s.area === a.id).length}</span>
          </button>
        ))}
      </div>

      <div className="grid auto-rows-fr grid-cols-4 gap-3 max-2xl:grid-cols-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
        {list.map((s) => {
          const a = AREAS.find((x) => x.id === s.area)!;
          return (
            <Link
              key={s.slug}
              href={solutionPath(s)}
              className="group relative flex min-w-0 flex-col rounded-lg border border-border bg-card p-4 transition-all hover:border-border-strong hover:shadow-[0_2px_16px_rgba(0,0,0,0.05)]"
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  className={cn(
                    "flex size-9 items-center justify-center rounded-md",
                    s.hero ? "bg-ai-soft text-ai" : "bg-muted text-foreground/75",
                  )}
                >
                  <SolutionIcon name={s.icon} className="size-[18px]" />
                </span>
                <span className="num text-[11px] text-faint">{pad2(s.n)}</span>
              </div>
              <div className="label-caps mt-3 truncate !text-[9.5px]">{L(a.short)}</div>
              <div className="mt-1 line-clamp-2 text-[14px] leading-snug font-medium">{L(s.title)}</div>
              <p className="mt-1 line-clamp-2 flex-1 text-[12px] leading-relaxed text-muted-foreground">{L(s.promise)}</p>
              <div className="mt-3 flex items-center justify-between gap-2">
                <OrgTag org={s.org} />
                <span className="flex items-center gap-2">
                  {s.hero && (
                    <span className="rounded-full border border-ai/25 bg-ai-soft px-1.5 py-px text-[9.5px] font-medium tracking-[0.08em] text-ai uppercase">
                      {L({ en: "Pilot", ar: "تجربة" })}
                    </span>
                  )}
                  <ArrowUpRight className="size-3.5 text-faint transition-colors group-hover:text-foreground rtl:-scale-x-100" />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
