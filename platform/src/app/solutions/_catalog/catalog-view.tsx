"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "motion/react";
import { ArrowUpRight } from "lucide-react";
import { SolutionIcon } from "@/components/narvo/icons";
import { useL } from "@/lib/i18n";
import { AREAS, SOLUTIONS, pad2, solutionPath } from "@/lib/solutions/registry";
import { ORGS } from "@/lib/world/orgs";
import { cn } from "@/lib/utils";

export function CatalogView() {
  const L = useL();
  const [org, setOrg] = useState<"all" | "mnda" | "raseen">("all");
  const [onlyHero, setOnlyHero] = useState(false);
  return (
    <div className="mx-auto w-full max-w-[1580px] px-6 pt-8 pb-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label-caps">{L({ en: "AI solutions · 2026", ar: "حلول الذكاء الاصطناعي · 2026" })}</div>
          <h1 className="display-title mt-3 text-[46px] leading-none">{L({ en: "Find your starting point.", ar: "اختر نقطة البداية." })}</h1>
          <p className="mt-3 text-[14px] text-muted-foreground">
            {L({ en: "Twenty solutions across six areas of work — every one of them running live on this platform.", ar: "عشرون حلاً في ستة مجالات عمل — جميعها تعمل مباشرة على هذه المنصة." })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md bg-muted p-0.5">
            {(["all", "mnda", "raseen"] as const).map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setOrg(o)}
                className={cn("h-7 rounded px-3 text-[12px] font-medium", org === o ? "bg-card shadow-sm" : "text-muted-foreground")}
              >
                {o === "all" ? L({ en: "All clients", ar: "جميع العملاء" }) : ORGS[o].short}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setOnlyHero((v) => !v)}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-md border px-3 text-[12px] font-medium",
              onlyHero ? "border-ai/40 bg-ai-soft text-ai" : "border-border bg-card text-muted-foreground",
            )}
          >
            <span className="size-1.5 rounded-full bg-ai" />
            {L({ en: "Capability-programme pilots", ar: "تجارب برنامج القدرات" })}
          </button>
        </div>
      </div>

      <div className="mt-10 space-y-12">
        {AREAS.map((area) => {
          const items = SOLUTIONS.filter((s) => s.area === area.id && (org === "all" || s.org === org) && (!onlyHero || s.hero));
          if (!items.length) return null;
          return (
            <section key={area.id}>
              <div className="flex items-baseline gap-4 border-b border-border pb-3">
                <span className="num text-[34px] font-light text-muted-foreground">{pad2(area.id)}</span>
                <h2 className="text-[20px] font-medium tracking-tight">{L(area.title)}</h2>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-4 max-xl:grid-cols-2 max-md:grid-cols-1">
                {items.map((s, i) => (
                  <motion.div key={s.slug} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                    <Link
                      href={solutionPath(s)}
                      className="group flex h-full flex-col rounded-lg border border-border bg-card p-5 transition-all hover:border-border-strong hover:shadow-[0_2px_18px_rgba(0,0,0,0.05)]"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <span className="num text-[12px] text-muted-foreground">{pad2(s.n)}</span>
                          {s.featured && (
                            <span className="rounded-[3px] bg-foreground px-1.5 py-0.5 text-[9px] tracking-[0.14em] text-background uppercase">
                              {L({ en: "Featured", ar: "مميز" })}
                            </span>
                          )}
                          {s.hero && <span className="rounded-[3px] border border-ai/30 bg-ai-soft px-1.5 py-0.5 text-[9px] tracking-[0.12em] text-ai uppercase">Pilot</span>}
                        </div>
                        <SolutionIcon name={s.icon} className="size-6 text-muted-foreground" strokeWidth={1.25} />
                      </div>
                      <h3 className="display-title mt-4 text-[22px] leading-tight">{L(s.title)}</h3>
                      <p className="mt-2 text-[13.5px] font-medium">{L(s.promise)}</p>
                      <p className="mt-1.5 flex-1 text-[12.5px] leading-relaxed text-muted-foreground">{L(s.summary)}</p>
                      <div className="mt-4 flex flex-wrap gap-1">
                        {s.engines.map((e) => (
                          <span key={e} className="rounded border border-border bg-surface px-1.5 py-0.5 text-[10.5px] text-muted-foreground">
                            {e}
                          </span>
                        ))}
                      </div>
                      <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                        <span className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
                          <span className="rounded px-1.5 py-0.5 text-[9.5px] font-semibold tracking-wide text-white" style={{ background: ORGS[s.org].color }}>
                            {ORGS[s.org].short}
                          </span>
                          {L({ en: "Measures:", ar: "المقاييس:" })} {s.measures.map((m) => L(m.label)).join(" / ")}
                        </span>
                        <ArrowUpRight className="size-4 shrink-0 text-faint transition-colors group-hover:text-foreground rtl:-scale-x-100" />
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
