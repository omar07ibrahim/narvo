"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { Check, FilePenLine, History, Replace, ScanSearch, Sparkles, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Markdown } from "@/components/narvo/markdown";
import { SourceList } from "@/components/narvo/sources";
import { RunButton } from "@/components/narvo/run-button";
import { StatusPill } from "@/components/narvo/status";
import { EmptyState, ThinkingLines } from "@/components/narvo/empty";
import type { NarvoRun } from "@/hooks/use-narvo-run";
import { useFormat, useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Citation } from "@/lib/ai/events";
import { pageChecks, wordCount } from "../_lib/compliance";
import { segment, replaceSentence } from "../_lib/sentences";
import type { BidSeed, Claim, Coverage, Requirement, SectionState } from "../_lib/types";

const VERDICT: Record<Claim["verdict"], { tone: "success" | "warning" | "danger"; en: string; ar: string; mark: string }> = {
  supported: { tone: "success", en: "Supported", ar: "مدعوم", mark: "" },
  partial: { tone: "warning", en: "Overstated", ar: "مبالغ فيه", mark: "bg-warning-soft decoration-warning/60" },
  unsupported: { tone: "danger", en: "Unsupported", ar: "غير مدعوم", mark: "bg-danger-soft decoration-danger/60" },
  contradicted: { tone: "danger", en: "Contradicted", ar: "متعارض مع الأدلة", mark: "bg-danger-soft decoration-danger/60" },
};

export function DraftStudio({
  seed,
  sections,
  requirements,
  coverage,
  draftRun,
  claimRun,
  onDraft,
  onCheck,
  onSave,
  onOpenDoc,
  draftSection,
  checkSection,
}: {
  draftSection: string | null;
  checkSection: string | null;
  seed: BidSeed;
  sections: Record<string, SectionState>;
  requirements: Requirement[];
  coverage: Record<string, Coverage>;
  draftRun: NarvoRun;
  claimRun: NarvoRun;
  onDraft: (sectionId: string, lang: "en" | "ar") => void;
  onCheck: (sectionId: string) => void;
  onSave: (sectionId: string, text: string, note?: string) => Promise<void>;
  onOpenDoc: (docId: string) => void;
}) {
  const L = useL();
  const f = useFormat();
  const [sel, setSel] = useState(seed.sections[0].id);
  const [mode, setMode] = useState<"read" | "claims" | "edit">("read");
  const [draftLang, setDraftLang] = useState<"en" | "ar">("en");
  const [viewV, setViewV] = useState<number | null>(null);
  const [edit, setEdit] = useState("");
  const [focusClaim, setFocusClaim] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const section = seed.sections.find((s) => s.id === sel)!;
  const st = sections[sel];
  const latest = st?.versions.at(-1);
  const shown = viewV != null ? st?.versions.find((v) => v.v === viewV) : latest;
  const pages = useMemo(() => pageChecks(seed, sections), [seed, sections]);
  const pc = pages.find((p) => p.sectionId === sel)!;
  const check = st?.check;
  const checkFresh = !!(check && latest && check.version === latest.v);
  const flagged = checkFresh ? check!.claims.filter((c) => c.verdict !== "supported") : [];

  const drafting = draftRun.running && draftSection === sel;
  const checking = claimRun.running && checkSection === sel;
  const liveCitations = (draftRun.data.citations as Citation[] | undefined) ?? [];

  useEffect(() => {
    setViewV(null);
    setFocusClaim(null);
  }, [sel]);
  useEffect(() => {
    if (drafting) setMode("read");
  }, [drafting]);
  useEffect(() => {
    if (claimRun.status === "done" && checkSection === sel) setMode("claims");
  }, [claimRun.status, checkSection, sel]);

  async function save(text: string, note?: string) {
    setSaving(true);
    try {
      await onSave(sel, text, note);
      toast.success(L({ en: "Saved as a new revision", ar: "حُفظت كمراجعة جديدة" }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const reqChips = section.requirements.map((id) => ({ id, c: coverage[id], r: requirements.find((x) => x.id === id) }));

  return (
    <div className="grid grid-cols-[230px_minmax(0,1fr)] gap-4 max-lg:grid-cols-1">
      {/* section list */}
      <ol className="flex flex-col gap-1">
        {seed.sections.map((s) => {
          const p = pages.find((x) => x.sectionId === s.id)!;
          const sst = sections[s.id];
          const lv = sst?.versions.at(-1);
          const fresh = sst?.check && lv && sst.check.version === lv.v;
          const nFlag = fresh ? sst!.check!.claims.filter((c) => c.verdict === "unsupported" || c.verdict === "contradicted").length : 0;
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setSel(s.id)}
                className={cn(
                  "w-full rounded-md border px-3 py-2.5 text-start transition-colors",
                  sel === s.id ? "border-border-strong bg-card" : "border-transparent hover:bg-muted/50",
                )}
              >
                <div className="flex items-start gap-2">
                  <span className="num mt-px text-[11px] text-faint">{String(s.no).padStart(2, "0")}</span>
                  <span className="min-w-0 flex-1 text-[12.5px] font-medium leading-snug">{L(s.title)}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-2 ps-6 text-[11px] text-muted-foreground">
                  {!lv ? (
                    <span className="text-faint">{L({ en: "Not drafted", ar: "لم يُصَغ" })}</span>
                  ) : (
                    <>
                      <span className={cn("num", p.status === "critical" && "text-danger")}>
                        {p.pages}/{s.pageLimit} {L({ en: "pp", ar: "ص" })}
                      </span>
                      <span className="text-faint">·</span>
                      <span>{lv.label}</span>
                      {fresh && (nFlag ? <span className="text-danger">· {nFlag} {L({ en: "flags", ar: "ملاحظات" })}</span> : <Check className="size-3 text-success" />)}
                    </>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ol>

      {/* editor */}
      <div className="min-w-0 rounded-lg border border-border bg-card">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <div className="label-caps">
              {L({ en: "Section", ar: "القسم" })} {section.no} · {L({ en: "limit", ar: "الحد" })} {section.pageLimit} {L({ en: "pages", ar: "صفحات" })}
            </div>
            <h3 className="mt-1 text-[17px] font-light tracking-tight">{L(section.title)}</h3>
            <div className="mt-2 flex flex-wrap gap-1">
              {reqChips.map(({ id, c, r }) => (
                <span
                  key={id}
                  title={r?.title}
                  className={cn(
                    "rounded border px-1.5 py-px font-mono text-[10.5px]",
                    !c ? "border-border text-faint" : c.status === "met" ? "border-success/25 text-success" : c.status === "partial" ? "border-warning/30 text-warning" : "border-danger/25 text-danger",
                  )}
                >
                  {id}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="inline-flex rounded-md border border-border p-0.5" title={L({ en: "Draft language", ar: "لغة المسودة" })}>
              {(["en", "ar"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setDraftLang(l)}
                  className={cn("rounded px-2 py-0.5 text-[11px] font-medium", draftLang === l ? "bg-foreground text-background" : "text-muted-foreground")}
                >
                  {l === "en" ? "EN" : "ع"}
                </button>
              ))}
            </div>
            <RunButton running={drafting} onRun={() => onDraft(sel, draftLang)} onStop={draftRun.abort} size="sm" icon={<Sparkles />} disabled={!requirements.length || draftRun.running}>
              {latest ? L({ en: "Redraft with AI", ar: "إعادة الصياغة" }) : L({ en: "Draft with AI", ar: "صياغة بالذكاء الاصطناعي" })}
            </RunButton>
            <RunButton running={checking} onRun={() => onCheck(sel)} size="sm" variant="outline" icon={<ScanSearch />} disabled={!latest || claimRun.running || drafting}>
              {L({ en: "Check claims", ar: "تحقق من الادعاءات" })}
            </RunButton>
          </div>
        </div>

        {/* toolbar */}
        {latest && !drafting && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
            <div className="inline-flex rounded-md bg-muted p-0.5">
              {(
                [
                  ["read", { en: "Read", ar: "قراءة" }],
                  ["claims", { en: "Claim check", ar: "فحص الادعاءات" }],
                  ["edit", { en: "Edit", ar: "تحرير" }],
                ] as const
              ).map(([k, lbl]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    if (k === "edit") setEdit(latest.text);
                    setViewV(null);
                    setMode(k);
                  }}
                  className={cn("rounded px-2.5 py-1 text-[12px]", mode === k ? "bg-card font-medium shadow-sm" : "text-muted-foreground")}
                >
                  {L(lbl)}
                  {k === "claims" && checkFresh && flagged.length > 0 && <span className="num ms-1 text-danger">{flagged.length}</span>}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3 text-[11.5px] text-muted-foreground">
              <span className="num">
                {wordCount(shown?.text ?? "")} {L({ en: "words", ar: "كلمة" })} · {pc.pages}/{pc.limit} {L({ en: "pages", ar: "صفحات" })}
              </span>
              <Select value={String(viewV ?? latest.v)} onValueChange={(v) => setViewV(Number(v) === latest.v ? null : Number(v))}>
                <SelectTrigger size="sm" className="h-7 w-auto gap-1.5 text-[11.5px]">
                  <History className="size-3" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[...st!.versions].reverse().map((v) => (
                    <SelectItem key={v.v} value={String(v.v)} className="text-[12px]">
                      {v.label} · {v.author} · {typeof v.at === "number" ? f.time(v.at) : f.date(v.at)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <div className="px-5 py-4">
          {drafting ? (
            draftRun.text.draft ? (
              <Markdown citations={liveCitations} streaming onCite={() => {}}>
                {draftRun.text.draft}
              </Markdown>
            ) : (
              <ThinkingLines lines={6} />
            )
          ) : !latest ? (
            <EmptyState
              icon={<FilePenLine className="size-4" />}
              title={L({ en: "No draft yet", ar: "لا توجد مسودة بعد" })}
              action={
                <Button size="sm" onClick={() => onDraft(sel, draftLang)} disabled={!requirements.length || draftRun.running}>
                  <Sparkles /> {L({ en: "Draft with AI", ar: "صياغة بالذكاء الاصطناعي" })}
                </Button>
              }
            >
              {requirements.length
                ? L({
                    en: "NARVO retrieves approved evidence for this section's requirements and drafts a sourced response. Unevidenced points are marked as gaps, never invented.",
                    ar: "يجلب نارفو الأدلة المعتمدة لمتطلبات هذا القسم ويصوغ رداً موثقاً. تُعلَّم النقاط غير الموثقة كفجوات ولا تُختلق.",
                  })
                : L({ en: "Extract the tender requirements first.", ar: "استخرج متطلبات المناقصة أولاً." })}
            </EmptyState>
          ) : mode === "edit" ? (
            <div className="space-y-2">
              <Textarea value={edit} onChange={(e) => setEdit(e.target.value)} className="min-h-[420px] font-mono text-[12.5px] leading-relaxed" dir="auto" />
              <div className="flex items-center justify-end gap-2">
                <span className="num me-auto text-[11.5px] text-muted-foreground">
                  {wordCount(edit)} {L({ en: "words", ar: "كلمة" })} · {Math.round((wordCount(edit) / seed.wordsPerPage) * 10) / 10} {L({ en: "pages", ar: "صفحات" })}
                </span>
                <Button size="sm" variant="ghost" onClick={() => setMode("read")}>
                  {L({ en: "Cancel", ar: "إلغاء" })}
                </Button>
                <Button size="sm" disabled={saving || edit === latest.text} onClick={() => save(edit).then(() => setMode("read"))}>
                  {L({ en: "Save revision", ar: "حفظ المراجعة" })}
                </Button>
              </div>
            </div>
          ) : mode === "claims" && !viewV ? (
            checking ? (
              <ThinkingLines lines={6} />
            ) : !checkFresh ? (
              <EmptyState icon={<ScanSearch className="size-4" />} title={check ? L({ en: "Check is out of date", ar: "الفحص غير محدّث" }) : L({ en: "Claims not checked yet", ar: "لم تُفحص الادعاءات بعد" })}>
                {L({
                  en: "Every sentence is checked against the approved evidence library; unsupported or contradicted claims are flagged with a grounded replacement.",
                  ar: "تُفحص كل جملة مقابل مكتبة الأدلة المعتمدة، وتُرصد الادعاءات غير المدعومة أو المتعارضة مع بديل موثق.",
                })}
              </EmptyState>
            ) : (
              <ClaimsView text={latest.text} claims={check!.claims} focus={focusClaim} onFocus={setFocusClaim} onReplace={(c) => save(replaceSentence(latest.text, c.i, c.suggestion!), `“${c.text.slice(0, 120)}” → “${c.suggestion!.slice(0, 120)}”`)} saving={saving} onOpenDoc={onOpenDoc} />
            )
          ) : (
            <Markdown citations={shown?.citations} onCite={() => {}}>
              {shown?.text ?? ""}
            </Markdown>
          )}
        </div>

        {(drafting ? liveCitations.length > 0 : !!shown?.citations?.length) && mode !== "edit" && (
          <div className="border-t border-border px-4 py-3">
            <div className="label-caps mb-2">{L({ en: "Sources cited", ar: "المصادر المستشهد بها" })}</div>
            <SourceList citations={drafting ? liveCitations : shown!.citations!} usedOnly text={drafting ? draftRun.text.draft : shown!.text} className="grid grid-cols-2 gap-2 space-y-0 max-md:grid-cols-1" />
          </div>
        )}
      </div>
    </div>
  );
}

function ClaimsView({
  text,
  claims,
  focus,
  onFocus,
  onReplace,
  saving,
  onOpenDoc,
}: {
  text: string;
  claims: Claim[];
  focus: number | null;
  onFocus: (i: number | null) => void;
  onReplace: (c: Claim) => void;
  saving: boolean;
  onOpenDoc: (docId: string) => void;
}) {
  const L = useL();
  const segs = segment(text);
  const flagged = claims.filter((c) => c.verdict !== "supported");
  const counts = {
    supported: claims.filter((c) => c.verdict === "supported").length,
    partial: claims.filter((c) => c.verdict === "partial").length,
    bad: claims.filter((c) => c.verdict === "unsupported" || c.verdict === "contradicted").length,
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <StatusPill tone="success">
          {counts.supported} {L({ en: "supported", ar: "مدعوم" })}
        </StatusPill>
        <StatusPill tone="warning">
          {counts.partial} {L({ en: "overstated", ar: "مبالغ فيه" })}
        </StatusPill>
        <StatusPill tone="danger">
          {counts.bad} {L({ en: "unsupported / contradicted", ar: "غير مدعوم / متعارض" })}
        </StatusPill>
      </div>
      <div className="rounded-md border border-border bg-surface p-4 text-[13.5px] leading-[1.75] whitespace-pre-wrap" dir="auto">
        {segs.map((s, k) => {
          const c = s.idx != null ? claims.find((x) => x.i === s.idx) : undefined;
          const display = s.text.replace(/\*\*/g, "").replace(/^#{1,6}\s+/, "");
          if (!c || c.verdict === "supported") return <span key={k} className={cn(/^#{1,6}\s/.test(s.text.trim()) && "font-medium")}>{display}</span>;
          return (
            <span
              key={k}
              role="button"
              tabIndex={0}
              onClick={() => onFocus(c.i)}
              className={cn("cursor-pointer rounded-[3px] underline decoration-2 underline-offset-[3px] transition-shadow", VERDICT[c.verdict].mark, focus === c.i && "ring-2 ring-ai/40")}
            >
              {display}
            </span>
          );
        })}
      </div>
      {flagged.length === 0 ? (
        <div className="flex items-center gap-2 rounded-md border border-success/25 bg-success-soft/60 px-3 py-2.5 text-[12.5px] text-success">
          <Check className="size-4" /> {L({ en: "Every claim in this section is backed by approved evidence.", ar: "كل ادعاء في هذا القسم مدعوم بأدلة معتمدة." })}
        </div>
      ) : (
        <ul className="space-y-2">
          {flagged.map((c) => (
            <motion.li
              key={c.i}
              layout
              onClick={() => onFocus(c.i)}
              className={cn("rounded-md border bg-card p-3 transition-colors", focus === c.i ? "border-ai/40" : "border-border")}
            >
              <div className="flex items-start gap-2">
                <TriangleAlert className={cn("mt-0.5 size-3.5 shrink-0", VERDICT[c.verdict].tone === "danger" ? "text-danger" : "text-warning")} />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill tone={VERDICT[c.verdict].tone}>{L(VERDICT[c.verdict])}</StatusPill>
                    {c.source && (
                      <button type="button" onClick={() => onOpenDoc(c.source!.docId)} className="truncate text-[11px] text-muted-foreground hover:text-foreground">
                        {c.source.ref ?? c.source.docId} · § {c.source.section}
                      </button>
                    )}
                  </div>
                  <p className="text-[12.5px] leading-relaxed text-muted-foreground line-through decoration-faint/70" dir="auto">
                    {c.text}
                  </p>
                  <p className="text-[12.5px] leading-relaxed" dir="auto">
                    {c.note}
                  </p>
                  {c.source && (
                    <p className="border-s-2 border-ai/40 ps-2 text-[11.5px] leading-relaxed text-muted-foreground" dir="auto">
                      “{c.source.quote}”
                    </p>
                  )}
                  {c.suggestion && (
                    <div className="mt-1 rounded-md bg-ai-soft/70 p-2.5">
                      <div className="label-caps !text-[9.5px] mb-1 text-ai">{L({ en: "Grounded replacement", ar: "بديل موثق" })}</div>
                      <p className="text-[12.5px] leading-relaxed" dir="auto">
                        {c.suggestion}
                      </p>
                      <Button
                        size="xs"
                        className="mt-2"
                        disabled={saving}
                        onClick={(e) => {
                          e.stopPropagation();
                          onReplace(c);
                        }}
                      >
                        <Replace /> {L({ en: "Replace in draft", ar: "استبدل في المسودة" })}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}
