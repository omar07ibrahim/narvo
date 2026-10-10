"use client";

import { useState } from "react";
import { ChevronRight, LoaderCircle, Plus, Replace } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/narvo/pane";
import { ApprovalCard } from "@/components/narvo/approval-card";
import { useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { ApprovalSummary } from "@/lib/ai/events";
import { FLAG_LABEL, type Candidate, type FlagKind, type Lang, type Segment, type Term } from "../_lib/shared";
import { ResolveTerm } from "./resolve-term";

export function QaSummary({ segments }: { segments: Segment[] }) {
  const L = useL();
  const flags = segments.flatMap((s) => s.flags).filter((f) => f.kind !== "disputed");
  const kinds: FlagKind[] = ["number", "reference", "date", "table", "glossary", "length", "omission", "addition", "meaning", "terminology", "grammar"];
  const rows = kinds
    .map((k) => ({ k, n: flags.filter((f) => f.kind === k).length, high: flags.some((f) => f.kind === k && f.severity === "high"), model: flags.some((f) => f.kind === k && f.by === "model") }))
    .filter((r) => r.n > 0);
  const checks: FlagKind[] = ["number", "reference", "date", "table", "glossary"];
  return (
    <div>
      <SectionLabel>{L({ en: "Quality checks", ar: "فحوص الجودة" })}</SectionLabel>
      <div className="grid grid-cols-5 gap-1">
        {checks.map((k) => {
          const n = flags.filter((f) => f.kind === k).length;
          return (
            <div key={k} className={cn("rounded-md border px-1.5 py-1.5 text-center", n ? "border-warning/30 bg-warning-soft/50" : "border-success/25 bg-success-soft/50")}>
              <div className={cn("num text-[15px] font-light", n ? "text-warning" : "text-success")}>{n || "✓"}</div>
              <div className="truncate text-[9.5px] text-muted-foreground">{L(FLAG_LABEL[k])}</div>
            </div>
          );
        })}
      </div>
      {rows.filter((r) => !checks.includes(r.k)).length > 0 && (
        <ul className="mt-2 space-y-1 text-[11.5px]">
          {rows
            .filter((r) => !checks.includes(r.k))
            .map((r) => (
              <li key={r.k} className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {L(FLAG_LABEL[r.k])}
                  {r.model && <span className="text-faint"> · AI review</span>}
                </span>
                <span className={cn("num font-medium", r.high ? "text-danger" : "text-warning")}>{r.n}</span>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

export function TermPanel({
  docId,
  segments,
  candidates,
  source,
  target,
  terms,
  onGlossaryChanged,
  onApplyTerm,
}: {
  docId: string;
  segments: Segment[];
  candidates: Candidate[];
  source: Lang;
  target: Lang;
  terms: Map<string, Term>;
  onGlossaryChanged: () => Promise<void>;
  onApplyTerm: (from: string, to: string) => Promise<number>;
}) {
  const L = useL();
  const [open, setOpen] = useState<string | null>(null);
  const [resolved, setResolved] = useState<Record<string, { from: { en: string; ar: string }; to: { en: string; ar: string }; applied?: number }>>({});
  const [proposals, setProposals] = useState<Record<string, ApprovalSummary>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const found = new Map<string, number>();
  for (const s of segments) for (const id of s.terms) found.set(id, (found.get(id) ?? 0) + 1);
  const disputed = [...found.keys()].filter((id) => terms.get(id)?.status === "disputed" || resolved[id]);
  const approvedCount = [...found.keys()].filter((id) => terms.get(id)?.status === "approved").length;

  async function propose(c: Candidate) {
    setBusy(c.term);
    try {
      const res = await fetch("/api/solutions/06-arabic-documents/glossary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "propose",
          docId,
          term: source === "ar" ? { ar: c.term, en: c.proposed, domain: c.domain, rationale: c.rationale } : { en: c.term, ar: c.proposed, domain: c.domain, rationale: c.rationale },
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const j = (await res.json()) as { approval: ApprovalSummary };
      setProposals((p) => ({ ...p, [c.term]: j.approval }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>
          {L({ en: "Terminology", ar: "المصطلحات" })} <span className="num normal-case tracking-normal text-faint">· {found.size} {L({ en: "glossary terms", ar: "مصطلحاً من المسرد" })}</span>
        </SectionLabel>
        <div className="mb-2 flex gap-1.5 text-[11px]">
          <span className="rounded-full border border-ai/25 bg-ai-soft px-2 py-0.5 text-ai">
            {approvedCount} {L({ en: "approved", ar: "معتمد" })}
          </span>
          <span className="rounded-full border border-warning/30 bg-warning-soft px-2 py-0.5 text-warning">
            {disputed.length} {L({ en: "disputed", ar: "خلافي" })}
          </span>
        </div>
        {disputed.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">{L({ en: "No disputed terms in this document.", ar: "لا توجد مصطلحات خلافية في هذا المستند." })}</p>
        ) : (
          <ul className="space-y-1.5">
            {disputed.map((id) => {
              const t = terms.get(id)!;
              const r = resolved[id];
              const isOpen = open === id;
              return (
                <li key={id} className={cn("rounded-md border", r ? "border-success/30 bg-success-soft/40" : "border-warning/30 bg-warning-soft/30")}>
                  <button type="button" onClick={() => setOpen(isOpen ? null : id)} className="flex w-full items-center gap-2 px-2.5 py-2 text-start">
                    <ChevronRight className={cn("size-3.5 shrink-0 text-faint transition-transform rtl:rotate-180", isOpen && "rotate-90 rtl:rotate-90")} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-medium" dir="auto">
                        {source === "ar" ? t.ar : t.en} → {r ? (target === "ar" ? r.to.ar : r.to.en) : target === "ar" ? t.ar : t.en}
                      </span>
                      <span className="text-[10.5px] text-muted-foreground">
                        {t.id} · {t.domain} · {found.get(id)}× {r ? `· ${L({ en: "approved", ar: "اعتُمد" })}` : ""}
                      </span>
                    </span>
                  </button>
                  {isOpen && (
                    <div className="px-2.5 pb-2.5">
                      {r ? (
                        <div className="space-y-2 text-[12px]">
                          <p className="text-muted-foreground">
                            {L({ en: "Approved by the terminology specialist and saved to the glossary.", ar: "اعتمدته أخصائية المصطلحات وحُفظ في المسرد." })}
                          </p>
                          {(target === "ar" ? r.from.ar : r.from.en) !== (target === "ar" ? r.to.ar : r.to.en) && r.applied == null && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full"
                              disabled={busy === id}
                              onClick={async () => {
                                setBusy(id);
                                const n = await onApplyTerm(target === "ar" ? r.from.ar : r.from.en, target === "ar" ? r.to.ar : r.to.en);
                                setResolved((x) => ({ ...x, [id]: { ...r, applied: n } }));
                                setBusy(null);
                              }}
                            >
                              {busy === id ? <LoaderCircle className="animate-spin" /> : <Replace />}
                              {L({ en: "Apply approved term to the translation", ar: "تطبيق المصطلح المعتمد على الترجمة" })}
                            </Button>
                          )}
                          {r.applied != null && (
                            <p className="text-success">{L({ en: `Updated ${r.applied} segment(s) and re-checked`, ar: `حُدّث ${r.applied} مقطعاً وأُعيد الفحص` })}</p>
                          )}
                        </div>
                      ) : (
                        <ResolveTerm
                          term={t}
                          docId={docId}
                          onApproved={async (from, to) => {
                            setResolved((x) => ({ ...x, [id]: { from, to } }));
                            await onGlossaryChanged();
                          }}
                        />
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {candidates.length > 0 && (
        <div>
          <SectionLabel>{L({ en: "New term candidates", ar: "مصطلحات مرشحة جديدة" })}</SectionLabel>
          <ul className="space-y-1.5">
            {candidates.map((c) => (
              <li key={c.term} className="rounded-md border border-border bg-surface p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 text-[12.5px]">
                    <span className="font-medium" dir="auto">
                      {c.term}
                    </span>
                    <span className="text-faint"> → </span>
                    <span dir="auto">{c.proposed}</span>
                  </div>
                  {!proposals[c.term] && (
                    <Button size="xs" variant="outline" onClick={() => propose(c)} disabled={busy === c.term}>
                      {busy === c.term ? <LoaderCircle className="animate-spin" /> : <Plus />}
                      {L({ en: "Propose", ar: "اقتراح" })}
                    </Button>
                  )}
                </div>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground" dir="auto">
                  {c.domain} · {c.segmentIds.join(", ")} — {c.rationale}
                </p>
                {proposals[c.term] && (
                  <ApprovalCard
                    className="mt-2"
                    compact
                    approval={proposals[c.term]}
                    onDecided={(s) => {
                      if (s === "approved") onGlossaryChanged();
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
