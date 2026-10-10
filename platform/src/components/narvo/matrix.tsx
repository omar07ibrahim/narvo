"use client";

import { Fragment, type ReactNode } from "react";
import { motion } from "motion/react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";

/**
 * Criteria × options comparison matrix with evidence on hover.
 * Used by bids, procurement, recruitment and any "compare against criteria" solution.
 */

export type CellStatus = "met" | "partial" | "missing" | "clarify" | "na";

export interface MatrixCell {
  status: CellStatus;
  value?: string;
  score?: number;
  evidence?: string;
  source?: string;
}

export interface MatrixRow {
  id: string;
  label: string;
  group?: string;
  weight?: number;
  cells: Record<string, MatrixCell>;
}

const CELL: Record<CellStatus, string> = {
  met: "bg-success-soft text-success border-success/20",
  partial: "bg-warning-soft text-warning border-warning/25",
  missing: "bg-danger-soft text-danger border-danger/20",
  clarify: "bg-info-soft text-info border-info/20",
  na: "bg-muted text-faint border-border",
};

const LABEL: Record<CellStatus, string> = {
  met: "Evidenced",
  partial: "Partial",
  missing: "Missing",
  clarify: "Clarify",
  na: "n/a",
};

export function ComparisonMatrix({
  columns,
  rows,
  className,
  statusLabels,
  footer,
}: {
  columns: Array<{ id: string; label: ReactNode; sub?: ReactNode }>;
  rows: MatrixRow[];
  className?: string;
  statusLabels?: Partial<Record<CellStatus, string>>;
  footer?: ReactNode;
}) {
  const labels = { ...LABEL, ...statusLabels };
  const groups = Array.from(new Set(rows.map((r) => r.group ?? "")));
  return (
    <div className={cn("overflow-auto rounded-md border border-border scrollbar-thin", className)}>
      <table className="w-full min-w-[560px] border-collapse text-[12.5px]">
        <thead className="sticky top-0 z-10 bg-card">
          <tr className="border-b border-border-strong">
            <th className="label-caps !text-[9.5px] w-[34%] px-3 py-2.5 text-start font-medium">Criterion</th>
            {columns.map((c) => (
              <th key={c.id} className="px-3 py-2.5 text-start align-bottom">
                <div className="text-[12.5px] font-medium leading-tight">{c.label}</div>
                {c.sub && <div className="mt-0.5 text-[11px] font-normal text-muted-foreground">{c.sub}</div>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <Fragment key={g || "_"}>
              {g && (
                <tr className="bg-muted/50">
                  <td colSpan={columns.length + 1} className="label-caps !text-[9.5px] px-3 py-1.5">
                    {g}
                  </td>
                </tr>
              )}
              {rows
                .filter((r) => (r.group ?? "") === g)
                .map((r, i) => (
                  <motion.tr
                    key={r.id}
                    initial={false}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-3 py-2 align-top">
                      <div className="leading-snug" dir="auto">{r.label}</div>
                      {r.weight != null && <div className="num mt-0.5 text-[10.5px] text-muted-foreground">weight {r.weight}%</div>}
                    </td>
                    {columns.map((c) => {
                      const cell = r.cells[c.id];
                      if (!cell) return <td key={c.id} className="px-3 py-2 text-faint">—</td>;
                      const inner = (
                        <div className={cn("inline-flex max-w-full flex-col rounded-md border px-2 py-1", CELL[cell.status])}>
                          <span className="text-[10.5px] font-medium">
                            {labels[cell.status]}
                            {cell.score != null && <span className="num ms-1 opacity-80">· {cell.score}</span>}
                          </span>
                          {cell.value && (
                            <span className="line-clamp-2 text-[11px] leading-snug text-foreground/80" dir="auto">
                              {cell.value}
                            </span>
                          )}
                        </div>
                      );
                      return (
                        <td key={c.id} className="px-3 py-2 align-top">
                          {cell.evidence || cell.source ? (
                            <HoverCard openDelay={100}>
                              <HoverCardTrigger asChild>
                                <button type="button" className="max-w-full text-start">
                                  {inner}
                                </button>
                              </HoverCardTrigger>
                              <HoverCardContent className="w-80 p-3">
                                {cell.source && <div className="label-caps mb-1">{cell.source}</div>}
                                <p className="text-[12px] leading-relaxed text-muted-foreground" dir="auto">
                                  {cell.evidence}
                                </p>
                              </HoverCardContent>
                            </HoverCard>
                          ) : (
                            inner
                          )}
                        </td>
                      );
                    })}
                  </motion.tr>
                ))}
            </Fragment>
          ))}
        </tbody>
        {footer && (
          <tfoot>
            <tr className="border-t border-border-strong bg-muted/40">{footer}</tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
