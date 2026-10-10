"use client";

import { useMemo } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { motion } from "motion/react";
import { useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { REVIEW, type MetricDef } from "../_lib/catalogue";
import { addDays, compute, fmtDelta, fmtValue, isoWeek, weekRange, type Dataset } from "../_lib/engine";
import { RagDot, Sparkline, ragLabel } from "./bits";

export interface KpiSnapshot {
  def: MetricDef;
  value: number | null;
  prev: number | null;
  target: number | null;
  rag: ReturnType<typeof compute>["rag"];
  spark: Array<number | null>;
  partial: boolean;
}

export function useSnapshots(ds: Dataset, defs: MetricDef[]): KpiSnapshot[] {
  return useMemo(() => {
    const [w0] = weekRange(REVIEW.week);
    const [p0, p1] = weekRange(REVIEW.previousWeek);
    const to = REVIEW.dataTo;
    return defs.map((def) => {
      const cur = compute(ds, def, w0, to);
      const isFlow = def.unit === "count" && def.agg.kind !== "stock";
      // flows in a partial week compare with the same weekdays of the previous week
      const prev = compute(ds, def, p0, isFlow ? addDays(p0, 4) : p1);
      const spark: Array<number | null> = [];
      for (let k = 13; k >= 1; k--) {
        const [a, b] = weekRange(isoWeek(addDays(w0, -7 * k)));
        spark.push(compute(ds, def, a, b).value);
      }
      spark.push(isFlow ? null : cur.value);
      return { def, value: cur.value, prev: prev.value, target: cur.target, rag: cur.rag, spark, partial: isFlow };
    });
  }, [ds, defs]);
}

export function KpiCard({ s, active, onClick, index = 0 }: { s: KpiSnapshot; active?: boolean; onClick?: () => void; index?: number }) {
  const L = useL();
  const { def } = s;
  const delta = s.value != null && s.prev != null ? s.value - s.prev : null;
  const good = delta == null || def.better === "none" ? null : def.better === "down" ? delta <= 0 : delta >= 0;
  const flat = delta != null && Math.abs(delta) < 1e-9;
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.025 }}
      className={cn(
        "group flex min-w-0 flex-col rounded-lg border bg-card p-3.5 text-start transition-colors",
        active ? "border-foreground/40" : "border-border hover:border-border-strong",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="label-caps line-clamp-2 min-h-[26px] !text-[9.5px] !leading-[1.35]" title={L(def.name)}>
          {L(def.name)}
        </span>
        <span className="mt-0.5 flex items-center" title={ragLabel(s.rag, L)}>
          <RagDot rag={s.rag} />
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="num text-[26px] leading-none font-light tracking-tight">{fmtValue(def, s.value, "en").replace(/ days$/, "")}</span>
        {def.unit === "days" && <span className="text-[12px] text-muted-foreground">{L({ en: "days", ar: "يوم" })}</span>}
      </div>
      <div
        className="mt-1.5 flex min-h-4 items-center gap-1.5 overflow-hidden text-[11px] whitespace-nowrap text-muted-foreground"
        title={s.partial ? L({ en: "Week 41 Monday–Friday compared with the same days of week 40", ar: "الأسبوع 41 (الاثنين–الجمعة) مقارنة بالأيام نفسها من الأسبوع 40" }) : undefined}
      >
        {delta != null && (
          <span className={cn("inline-flex items-center gap-0.5 font-medium", flat ? "text-muted-foreground" : good ? "text-success" : "text-danger")}>
            {flat ? <Minus className="size-3" /> : delta > 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
            <bdi dir="ltr">{fmtDelta(def, delta).replace(" pts", " pt")}</bdi>
          </span>
        )}
        <span className="truncate">
          {L({ en: "vs W40", ar: "مقابل أ40" })}
        </span>
      </div>
      <Sparkline values={s.spark} target={s.target != null && !s.partial ? s.target : null} className="mt-2.5" tone={s.rag === "red" ? "danger" : "ink"} />
      <div className="mt-1.5 flex items-center justify-between gap-2 overflow-hidden text-[10.5px] whitespace-nowrap text-faint">
        <span>{L({ en: "13 wk", ar: "13 أسبوعاً" })}</span>
        {s.target != null && (
          <span className="num truncate" dir="ltr">
            {def.better === "down" ? "≤" : "≥"} {fmtValue(def, s.target, "en").replace(/ days$/, " d")}
          </span>
        )}
      </div>
    </motion.button>
  );
}
