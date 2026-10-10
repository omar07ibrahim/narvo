"use client";

import { motion } from "motion/react";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { CaseCheck } from "../_lib/types";

const ICON = {
  pass: <CircleCheck className="size-4 text-success" />,
  fail: <CircleAlert className="size-4 text-danger" />,
  warn: <TriangleAlert className="size-4 text-warning" />,
  info: <Info className="size-4 text-info" />,
};

export function CheckList({ checks }: { checks: CaseCheck[] }) {
  const L = useL();
  const order = { fail: 0, warn: 1, info: 2, pass: 3 } as const;
  const sorted = [...checks].sort((a, b) => order[a.status] - order[b.status]);
  const fails = checks.filter((c) => c.status === "fail").length;
  const warns = checks.filter((c) => c.status === "warn").length;
  const passes = checks.filter((c) => c.status === "pass").length;
  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div className="bg-success" style={{ width: `${(passes / checks.length) * 100}%` }} />
          <div className="bg-warning" style={{ width: `${(warns / checks.length) * 100}%` }} />
          <div className="bg-danger" style={{ width: `${(fails / checks.length) * 100}%` }} />
        </div>
        <span className="num shrink-0 text-[11px] text-muted-foreground">
          {passes}/{checks.length} {L({ en: "passed", ar: "مستوفاة" })}
        </span>
      </div>
      <ul className="divide-y divide-border rounded-md border border-border">
        {sorted.map((c, i) => (
          <motion.li
            key={c.id}
            initial={{ opacity: 1, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className={cn("flex gap-3 px-3 py-2.5", c.status === "fail" && "bg-danger-soft/35", c.status === "warn" && "bg-warning-soft/35")}
          >
            <span className="mt-0.5 shrink-0">{ICON[c.status]}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[13px] font-medium">{L(c.label)}</span>
                {c.policyRef && <span className="font-mono text-[10px] text-muted-foreground">{c.policyRef}</span>}
              </div>
              <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{L(c.detail)}</p>
            </div>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
