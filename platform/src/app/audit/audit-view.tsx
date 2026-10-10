"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Bot, Cpu, Download, Search, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFormat, useL } from "@/lib/i18n";
import { SOLUTIONS, getSolution, pad2, solutionPath } from "@/lib/solutions/registry";
import { cn } from "@/lib/utils";

interface Row {
  id: string;
  ts: number;
  solution: string;
  actor: { name: string; role: string; kind: "human" | "agent" | "system" };
  action: string;
  subject: string;
  detail?: string;
  approvalId?: string;
}

export function AuditView() {
  const L = useL();
  const f = useFormat();
  const [rows, setRows] = useState<Row[]>([]);
  const [live, setLive] = useState(0);
  const [kind, setKind] = useState<"all" | "agent" | "human">("all");
  const [solution, setSolution] = useState("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    const load = () =>
      fetch("/api/audit?limit=2000")
        .then((r) => r.json())
        .then((d) => {
          setRows(d.events);
          setLive(d.liveCount);
        });
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (kind === "all" || r.actor.kind === kind) &&
        (solution === "all" || r.solution === solution) &&
        (!needle || `${r.action} ${r.subject} ${r.detail ?? ""} ${r.actor.name}`.toLowerCase().includes(needle)),
    );
  }, [rows, kind, solution, q]);

  function exportCsv() {
    const header = ["timestamp", "solution", "actor", "role", "kind", "action", "subject", "detail", "approval"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const body = list.map((r) =>
      [new Date(r.ts).toISOString(), r.solution, r.actor.name, r.actor.role, r.actor.kind, r.action, r.subject, r.detail, r.approvalId].map(esc).join(","),
    );
    const blob = new Blob(["﻿" + [header.join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `narvo-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  const agents = rows.filter((r) => r.actor.kind === "agent").length;
  const humans = rows.filter((r) => r.actor.kind === "human").length;

  return (
    <div className="mx-auto w-full max-w-[1480px] px-6 pt-8 pb-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label-caps">{L({ en: "Governance", ar: "الحوكمة" })}</div>
          <h1 className="display-title mt-2 text-[38px]">{L({ en: "Audit trail", ar: "سجل التدقيق" })}</h1>
          <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">
            {L({
              en: "Every AI action and every human decision, with who, what, when and under which approval. Kept on your infrastructure; exportable for internal audit.",
              ar: "كل إجراء للذكاء الاصطناعي وكل قرار بشري: من وماذا ومتى وبأي اعتماد. يُحفظ على بنيتك التحتية وقابل للتصدير للتدقيق الداخلي.",
            })}
          </p>
        </div>
        <div className="flex gap-6 text-[12px]">
          {[
            { k: L({ en: "Events", ar: "الأحداث" }), v: rows.length },
            { k: L({ en: "This session", ar: "هذه الجلسة" }), v: live },
            { k: L({ en: "By agents", ar: "بواسطة الوكلاء" }), v: agents },
            { k: L({ en: "By people", ar: "بواسطة البشر" }), v: humans },
          ].map((x) => (
            <div key={x.k}>
              <div className="label-caps">{x.k}</div>
              <div className="num mt-1 text-[24px] font-light">{f.number(x.v)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative w-72">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L({ en: "Search actions, subjects, people", ar: "ابحث في الإجراءات والأشخاص" })} className="h-8 bg-card ps-8 text-[12.5px]" />
        </div>
        <div className="flex rounded-md bg-muted p-0.5">
          {(["all", "agent", "human"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cn("h-7 rounded px-3 text-[12px] font-medium", kind === k ? "bg-card shadow-sm" : "text-muted-foreground")}
            >
              {L({ all: { en: "All", ar: "الكل" }, agent: { en: "AI agents", ar: "الوكلاء" }, human: { en: "People", ar: "البشر" } }[k])}
            </button>
          ))}
        </div>
        <select value={solution} onChange={(e) => setSolution(e.target.value)} className="h-8 rounded-md border border-border bg-card px-2 text-[12.5px]">
          <option value="all">{L({ en: "All solutions", ar: "جميع الحلول" })}</option>
          {SOLUTIONS.map((s) => (
            <option key={s.slug} value={s.slug}>
              {pad2(s.n)} · {L(s.title)}
            </option>
          ))}
        </select>
        <Button variant="outline" size="sm" className="ms-auto" onClick={exportCsv}>
          <Download />
          {L({ en: "Export CSV", ar: "تصدير CSV" })}
        </Button>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-[12.5px]">
          <thead className="border-b border-border bg-muted/40">
            <tr>
              {[
                L({ en: "When", ar: "الوقت" }),
                L({ en: "Actor", ar: "الفاعل" }),
                L({ en: "Action", ar: "الإجراء" }),
                L({ en: "Subject", ar: "الموضوع" }),
                L({ en: "Solution", ar: "الحل" }),
              ].map((h) => (
                <th key={h} className="label-caps !text-[9.5px] px-4 py-2.5 text-start font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {list.slice(0, 400).map((r) => {
              const s = getSolution(r.solution);
              return (
                <tr key={r.id} className="align-top hover:bg-muted/30">
                  <td className="num px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                    {f.date(r.ts, { day: "numeric", month: "short" })} {f.time(r.ts)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "flex size-5 shrink-0 items-center justify-center rounded-full",
                          r.actor.kind === "agent" ? "bg-ai-soft text-ai" : r.actor.kind === "human" ? "bg-foreground text-background" : "bg-muted",
                        )}
                      >
                        {r.actor.kind === "agent" ? <Bot className="size-3" /> : r.actor.kind === "human" ? <UserRound className="size-3" /> : <Cpu className="size-3" />}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{r.actor.name}</div>
                        <div className="truncate text-[11px] text-muted-foreground">{r.actor.role}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{r.action}</div>
                    {r.detail && <div className="mt-0.5 max-w-md text-[11.5px] text-muted-foreground" dir="auto">{r.detail}</div>}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[11.5px]" dir="auto">
                    {r.subject}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                    {s ? (
                      <Link href={solutionPath(s)} className="hover:text-foreground">
                        <span className="num">{pad2(s.n)}</span> {L(s.title).split(" ").slice(0, 3).join(" ")}
                      </Link>
                    ) : (
                      r.solution
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
