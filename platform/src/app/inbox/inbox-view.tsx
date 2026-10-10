"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Inbox } from "lucide-react";
import { ApprovalCard } from "@/components/narvo/approval-card";
import { EmptyState } from "@/components/narvo/empty";
import { useFormat, useL } from "@/lib/i18n";
import { SOLUTIONS, getSolution, pad2, solutionPath } from "@/lib/solutions/registry";
import type { ApprovalSummary } from "@/lib/ai/events";
import { cn } from "@/lib/utils";

type Row = ApprovalSummary & { decidedAt?: number; decidedBy?: string; comment?: string };

export function InboxView() {
  const L = useL();
  const f = useFormat();
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [solution, setSolution] = useState<string>("all");

  const load = useCallback(() => {
    fetch("/api/approvals")
      .then((r) => r.json())
      .then((d) => setRows(d.approvals));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  const counts = useMemo(
    () => ({
      pending: rows.filter((r) => r.status === "pending").length,
      approved: rows.filter((r) => r.status === "approved").length,
      rejected: rows.filter((r) => r.status === "rejected").length,
      all: rows.length,
    }),
    [rows],
  );
  const solutionsWith = Array.from(new Set(rows.map((r) => r.solution))).filter((s) => getSolution(s));
  const list = rows.filter((r) => (status === "all" || r.status === status) && (solution === "all" || r.solution === solution));

  return (
    <div className="mx-auto w-full max-w-[1280px] px-6 pt-8 pb-14">
      <div className="label-caps">{L({ en: "Human in the loop", ar: "الإنسان في الحلقة" })}</div>
      <h1 className="display-title mt-2 text-[38px]">{L({ en: "Approvals", ar: "الاعتمادات" })}</h1>
      <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">
        {L({
          en: "Agents prepare; people decide. Every state-changing action proposed by any solution waits here for the named approver — approving executes it and writes the audit trail.",
          ar: "الوكلاء يجهّزون والبشر يقررون. كل إجراء يغيّر البيانات يقترحه أي حل ينتظر هنا المعتمِد المحدد — والاعتماد ينفذه ويسجله في سجل التدقيق.",
        })}
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="flex rounded-md bg-muted p-0.5">
          {(["pending", "approved", "rejected", "all"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded px-3 text-[12px] font-medium",
                status === s ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {L(
                {
                  pending: { en: "Pending", ar: "معلقة" },
                  approved: { en: "Approved", ar: "معتمدة" },
                  rejected: { en: "Rejected", ar: "مرفوضة" },
                  all: { en: "All", ar: "الكل" },
                }[s],
              )}
              <span className="num text-faint">{counts[s]}</span>
            </button>
          ))}
        </div>
        <select
          value={solution}
          onChange={(e) => setSolution(e.target.value)}
          className="h-8 rounded-md border border-border bg-card px-2 text-[12.5px]"
        >
          <option value="all">{L({ en: "All solutions", ar: "جميع الحلول" })}</option>
          {SOLUTIONS.filter((s) => solutionsWith.includes(s.slug)).map((s) => (
            <option key={s.slug} value={s.slug}>
              {pad2(s.n)} · {L(s.title)}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-6 space-y-3">
        {list.length === 0 && (
          <div className="rounded-lg border border-border bg-card">
            <EmptyState icon={<Inbox className="size-4" />} title={L({ en: "Nothing here", ar: "لا شيء هنا" })}>
              {L({ en: "Run a solution — proposed actions appear here for approval.", ar: "شغّل أي حل — تظهر الإجراءات المقترحة هنا للاعتماد." })}
            </EmptyState>
          </div>
        )}
        {list.map((a) => {
          const s = getSolution(a.solution);
          return (
            <div key={a.id}>
              <div className="mb-1.5 flex items-center gap-2 text-[11.5px] text-muted-foreground">
                {s ? (
                  <Link href={solutionPath(s)} className="hover:text-foreground">
                    <span className="num">{pad2(s.n)}</span> · {L(s.title)}
                  </Link>
                ) : (
                  <span>{a.solution}</span>
                )}
                <span className="ms-auto">{f.date(a.createdAt)} {f.time(a.createdAt)}</span>
              </div>
              <ApprovalCard approval={a} onDecided={() => setTimeout(load, 200)} />
              {a.status !== "pending" && a.decidedAt && (
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {a.status === "approved" ? L({ en: "Approved", ar: "اعتُمد" }) : L({ en: "Rejected", ar: "رُفض" })} {L({ en: "by", ar: "بواسطة" })} {a.decidedBy} ·{" "}
                  {f.date(a.decidedAt)} {f.time(a.decidedAt)}
                  {a.comment ? ` — “${a.comment}”` : ""}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
