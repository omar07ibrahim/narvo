"use client";

import { useEffect, useState } from "react";
import { Bot, Cog, User } from "lucide-react";
import { AgentTrace } from "@/components/narvo/agent-trace";
import { ApprovalCard } from "@/components/narvo/approval-card";
import { SourceList } from "@/components/narvo/sources";
import type { NarvoRun } from "@/hooks/use-narvo-run";
import type { ApprovalSummary, Citation } from "@/lib/ai/events";
import { useFormat, useL } from "@/lib/i18n";
import { SLUG } from "../_lib/rules";
import { Caps } from "./bits";

interface AuditRow {
  id: string;
  ts: number;
  actor: { name: string; role: string; kind: "human" | "agent" | "system" };
  action: string;
  subject: string;
  detail?: string;
}

export function Rail({
  run,
  runTitle,
  pending,
  citations,
  refreshKey,
  onDecided,
}: {
  run: NarvoRun;
  runTitle: string;
  pending: ApprovalSummary[];
  citations: Citation[];
  refreshKey: number;
  onDecided: (id: string, status: "approved" | "rejected") => void;
}) {
  const L = useL();
  const f = useFormat();
  const [audit, setAudit] = useState<AuditRow[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/audit?solution=${SLUG}&limit=14`)
      .then((r) => r.json())
      .then((j) => !cancelled && setAudit(j.events ?? []))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return (
    <div className="scrollbar-thin h-full space-y-5 overflow-y-auto p-4">
      <AgentTrace
        run={run}
        title={runTitle}
        emptyHint={L({
          en: "Interpret a customer message, generate options or approve one — every step (model calls, quote checks, stock allocation, impact maths, routing) appears here.",
          ar: "فسّر رسالة متعامل أو ولّد الخيارات أو اعتمد أحدها — تظهر هنا كل خطوة (استدعاءات النموذج، التحقق من الاقتباسات، تخصيص المخزون، حساب الأثر، التوجيه).",
        })}
      />

      {pending.length > 0 && (
        <div>
          <Caps className="mb-2">{L({ en: "Awaiting approval", ar: "بانتظار الاعتماد" })}</Caps>
          <div className="space-y-2">
            {pending.map((a) => (
              <ApprovalCard key={a.id} approval={a} compact onDecided={(s) => onDecided(a.id, s)} />
            ))}
          </div>
        </div>
      )}

      <div>
        <Caps className="mb-2">{L({ en: "Sources — policy & contract clauses", ar: "المصادر — بنود السياسات والعقود" })}</Caps>
        <SourceList citations={citations} />
      </div>

      <div>
        <Caps className="mb-2">{L({ en: "Audit trail", ar: "سجل التدقيق" })}</Caps>
        <ol className="space-y-2.5">
          {audit.map((e) => (
            <li key={e.id} className="flex gap-2.5 text-[11.5px]">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground">
                {e.actor.kind === "agent" ? <Bot className="size-3 text-ai" /> : e.actor.kind === "system" ? <Cog className="size-3" /> : <User className="size-3" />}
              </span>
              <div className="min-w-0">
                <div className="leading-snug">
                  <span className="font-medium">{e.action}</span> <span className="text-muted-foreground">· {e.subject}</span>
                </div>
                {e.detail && <div className="line-clamp-2 leading-snug text-muted-foreground">{e.detail}</div>}
                <div className="mt-0.5 text-[10.5px] text-faint">
                  {e.actor.name} · {f.date(e.ts, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
