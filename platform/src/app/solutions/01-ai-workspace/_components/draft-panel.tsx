"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Download, FileText, Lock, PenLine, Search, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Workbench, Pane, SectionLabel } from "@/components/narvo/pane";
import { AgentTrace } from "@/components/narvo/agent-trace";
import { Markdown } from "@/components/narvo/markdown";
import { SourceList } from "@/components/narvo/sources";
import { EmptyState, ThinkingLines } from "@/components/narvo/empty";
import { RunButton } from "@/components/narvo/run-button";
import { StatusPill } from "@/components/narvo/status";
import { useNarvoRun } from "@/hooks/use-narvo-run";
import { useL, usePrefs } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Citation } from "@/lib/ai/events";
import { DRAFT_KINDS, ROLES, type LibraryDoc, type RoleKey, type ScopeKey } from "../_lib/shared";
import { AttachmentSlot, useAttachment } from "./attachment";
import { ClassBadge, Segmented, downloadText } from "./ui-bits";

type Kind = (typeof DRAFT_KINDS)[number]["key"];

const PRESETS: Array<{ kind: Kind; title: { en: string; ar: string }; instructions: { en: string; ar: string }; audience?: { en: string; ar: string }; docs: string[] }> = [
  {
    kind: "briefing",
    title: { en: "DG briefing — NOC delays", ar: "إحاطة للمدير العام — تأخر شهادات عدم الممانعة" },
    instructions: {
      en: "Brief the Director General on how Circular 14/2026 is affecting building permits in gated communities, especially Marina Quarter, and recommend actions for the 15 October meeting with master developers.",
      ar: "أعدّ إحاطة للمدير العام حول أثر التعميم 14/2026 على رخص البناء في المجتمعات المسوّرة، وخاصة حي المارينا، مع توصيات لاجتماع 15 أكتوبر مع المطورين الرئيسيين.",
    },
    audience: { en: "H.E. Eng. Khalid Saif Al Mazrouei, Director General", ar: "سعادة المهندس خالد سيف المزروعي، المدير العام" },
    docs: [],
  },
  {
    kind: "reply_letter",
    title: { en: "Reply to a contractor", ar: "رد على مقاول" },
    instructions: {
      en: "Gulf Crest Builders ask whether the NOC issued for revision B of Marina Quarter Tower B (plot MN-08-214-0007) is still acceptable now that drawings are at revision C, and how long the application can stay on hold. Reply clearly.",
      ar: "تسأل شركة جلف كرست للمقاولات عمّا إذا كانت شهادة عدم الممانعة الصادرة للمراجعة B لبرج المارينا B (قطعة MN-08-214-0007) لا تزال مقبولة بعد تحديث المخططات إلى المراجعة C، وما المدة التي يمكن أن يبقى فيها الطلب معلقاً. اكتب رداً واضحاً.",
    },
    audience: { en: "Samir Nabil Haddad, Project Director, Gulf Crest Builders LLC", ar: "سمير نبيل حداد، مدير المشروع، جلف كرست للمقاولات ذ.م.م" },
    docs: ["MNDA-CIR-2026-14-EN", "MNDA-SVC-101"],
  },
  {
    kind: "faq",
    title: { en: "CHC FAQ — housing documents", ar: "أسئلة شائعة — مستندات الإسكان" },
    instructions: {
      en: "FAQ for Customer Happiness Centre agents on the new housing application documents: salary certificate validity, Certificate of No Property Ownership, spouse Emirates ID, bank statements.",
      ar: "أسئلة شائعة لموظفي مراكز إسعاد المتعاملين حول مستندات طلبات الإسكان الجديدة: صلاحية شهادة الراتب، وشهادة عدم ملكية عقار، وهوية الزوج/الزوجة، وكشوف الحساب البنكية.",
    },
    docs: ["MNDA-CIR-2026-09-EN", "MNDA-SVC-201"],
  },
  {
    kind: "email",
    title: { en: "Email — staff salary certificates", ar: "بريد — شهادات رواتب الموظفين" },
    instructions: {
      en: "Email to all Housing & Community Services staff who are themselves housing applicants: request salary certificates through HR Services, issued within 1 working day, and remember the 30-day validity.",
      ar: "رسالة إلى موظفي إدارة الإسكان وخدمات المجتمع المتقدمين بطلبات سكنية: اطلبوا شهادة الراتب عبر خدمات الموارد البشرية، وتصدر خلال يوم عمل واحد، مع مراعاة صلاحية 30 يوماً.",
    },
    docs: [],
  },
];

export function DraftPanel({ role, scope, docs, onDrafted }: { role: RoleKey; scope: ScopeKey; docs: LibraryDoc[]; onDrafted: (ms: number) => void }) {
  const L = useL();
  const { lang } = usePrefs();
  const run = useNarvoRun();
  const att = useAttachment();
  const [kind, setKind] = useState<Kind>("briefing");
  const [instructions, setInstructions] = useState("");
  const [audience, setAudience] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [text, setText] = useState("");
  const [view, setView] = useState<"preview" | "edit">("preview");
  const [copied, setCopied] = useState(false);
  const [highlight, setHighlight] = useState<number | null>(null);
  const access = ROLES[role].access;

  // Keep the editable text in sync while streaming; freeze when done so the user can edit.
  useEffect(() => {
    if (run.running) setText(run.text.draft ?? "");
  }, [run.running, run.text.draft]);
  useEffect(() => {
    if (run.status === "done" && run.text.draft) {
      setText(run.text.draft);
      onDrafted(run.ms ?? 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.status]);

  const visibleDocs = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return docs
      .filter((d) => scope === "all" || d.scope === scope)
      .filter((d) => !f || `${d.title} ${d.title_ar ?? ""} ${d.title_en ?? ""} ${d.ref ?? ""} ${d.id}`.toLowerCase().includes(f));
  }, [docs, filter, scope]);

  const citations: Citation[] = (run.data.citations as Citation[]) ?? [];
  const check = run.data.check as
    | { markers: number; sourcesUsed: number; sourcesAvailable: number; invalid: number[]; uncitedParagraphs: number }
    | undefined;

  function generate() {
    if (!instructions.trim()) return;
    setView("preview");
    setHighlight(null);
    run.start("/api/solutions/01-ai-workspace/draft", {
      kind,
      instructions,
      audience,
      docIds: selected,
      role,
      scope,
      attachment: att.attachment,
    });
  }

  function exportMd() {
    const refs = citations
      .map((c) => `[${c.n}] ${c.title}${c.ref ? ` (${c.ref})` : ""}${c.section ? ` — § ${c.section}` : ""}`)
      .join("\n");
    const out = `${text.trim()}\n\n---\n\n**${lang === "ar" ? "المصادر" : "Sources"}**\n\n${refs}\n\n_${lang === "ar" ? "أُعدّت المسودة بمساعدة NARVO على البنية التحتية للهيئة — تتطلب مراجعة بشرية قبل الإرسال." : "Drafted with NARVO on MNDA infrastructure — requires human review before release."}_\n`;
    const k = DRAFT_KINDS.find((d) => d.key === kind)!;
    downloadText(`MNDA-${k.label.en.replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.md`, out);
  }

  const kindMeta = DRAFT_KINDS.find((d) => d.key === kind)!;

  return (
    <Workbench cols="360px minmax(0,1fr) 360px">
      <Pane title={L({ en: "Brief", ar: "التكليف" })} bodyClassName="space-y-4">
        <div>
          <SectionLabel>{L({ en: "Start from", ar: "ابدأ من" })}</SectionLabel>
          <div className="grid grid-cols-2 gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.title.en}
                type="button"
                onClick={() => {
                  setKind(p.kind);
                  setInstructions(L(p.instructions));
                  setAudience(p.audience ? L(p.audience) : "");
                  setSelected(p.docs.filter((id) => docs.some((d) => d.id === id)));
                }}
                className="rounded-md border border-border bg-surface px-2.5 py-2 text-start text-[11.5px] leading-snug transition-colors hover:border-ai/40 hover:bg-ai-soft/40"
              >
                {L(p.title)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <SectionLabel>{L({ en: "Document type", ar: "نوع المستند" })}</SectionLabel>
          <div className="grid grid-cols-2 gap-1.5">
            {DRAFT_KINDS.map((k) => (
              <button
                key={k.key}
                type="button"
                onClick={() => setKind(k.key)}
                className={cn(
                  "rounded-md border px-2.5 py-2 text-start transition-colors",
                  kind === k.key ? "border-foreground bg-card" : "border-border bg-surface hover:border-border-strong",
                )}
              >
                <div className="text-[12.5px] font-medium">{L(k.label)}</div>
                <div className="mt-0.5 line-clamp-2 text-[10.5px] leading-snug text-muted-foreground">{L(k.hint)}</div>
              </button>
            ))}
          </div>
        </div>
        <div>
          <SectionLabel>{L({ en: "Audience / recipient", ar: "الجمهور / المرسل إليه" })}</SectionLabel>
          <Input value={audience} onChange={(e) => setAudience(e.target.value)} dir="auto" className="h-8 text-[12.5px]" placeholder={L({ en: "Optional", ar: "اختياري" })} />
        </div>
        <div>
          <SectionLabel>{L({ en: "What should it say?", ar: "ماذا يجب أن يتضمن؟" })}</SectionLabel>
          <Textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            dir="auto"
            rows={5}
            className="text-[12.5px]"
            placeholder={L({ en: "Describe the purpose, key points and tone…", ar: "صف الغرض والنقاط الرئيسية والأسلوب…" })}
          />
        </div>
        <div>
          <SectionLabel>
            {L({ en: "Sources", ar: "المصادر" })}{" "}
            <span className="normal-case tracking-normal text-faint">
              · {selected.length ? L({ en: `${selected.length} selected`, ar: `${selected.length} مختارة` }) : L({ en: "automatic retrieval", ar: "استرجاع تلقائي" })}
            </span>
          </SectionLabel>
          <div className="relative">
            <Search className="pointer-events-none absolute start-2.5 top-2 size-3.5 text-faint" />
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} className="h-7 ps-8 text-[12px]" placeholder={L({ en: "Filter documents", ar: "تصفية المستندات" })} />
          </div>
          <div className="scrollbar-thin mt-1.5 max-h-48 divide-y divide-border overflow-y-auto rounded-md border border-border">
            {visibleDocs.map((d) => {
              const locked = !access.includes(d.classification);
              const on = selected.includes(d.id);
              return (
                <label
                  key={d.id}
                  className={cn("flex cursor-pointer items-start gap-2 px-2.5 py-1.5 text-[11.5px]", locked && "cursor-not-allowed opacity-50", on && "bg-ai-soft/50")}
                >
                  <input
                    type="checkbox"
                    disabled={locked}
                    checked={on}
                    onChange={() => setSelected((s) => (on ? s.filter((x) => x !== d.id) : [...s, d.id].slice(0, 8)))}
                    className="mt-0.5 accent-[var(--ai)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1 leading-snug" dir="auto">
                      {d.title}
                    </span>
                    <span className="font-mono text-[10px] text-faint">{d.ref ?? d.id}</span>
                  </span>
                  {locked ? <Lock className="mt-0.5 size-3 text-warning" /> : d.classification !== "Public" && <ClassBadge value={d.classification} className="mt-0.5" />}
                </label>
              );
            })}
          </div>
        </div>
        <AttachmentSlot state={att} />
        <RunButton running={run.running} onRun={generate} onStop={run.abort} disabled={!instructions.trim() || !!att.busy} icon={<Sparkles />} className="w-full">
          {L({ en: `Draft ${kindMeta.label.en.toLowerCase()}`, ar: `صياغة ${kindMeta.label.ar}` })}
        </RunButton>
      </Pane>

      <Pane
        title={L(kindMeta.label)}
        subtitle={text ? L({ en: `${text.split(/\s+/).filter(Boolean).length} words · editable`, ar: `${text.split(/\s+/).filter(Boolean).length} كلمة · قابلة للتحرير` }) : undefined}
        actions={
          text && !run.running ? (
            <>
              <Segmented
                value={view}
                onChange={setView}
                items={[
                  { value: "preview", label: L({ en: "Preview", ar: "معاينة" }), icon: <FileText className="size-3.5" /> },
                  { value: "edit", label: L({ en: "Edit", ar: "تحرير" }), icon: <PenLine className="size-3.5" /> },
                ]}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  navigator.clipboard.writeText(text);
                  setCopied(true);
                  toast.success(L({ en: "Copied to clipboard", ar: "تم النسخ" }));
                  setTimeout(() => setCopied(false), 1500);
                }}
                aria-label="Copy"
              >
                {copied ? <Check /> : <Copy />}
              </Button>
              <Button variant="outline" size="sm" onClick={exportMd}>
                <Download /> .md
              </Button>
            </>
          ) : null
        }
        bodyClassName="scrollbar-thin h-[720px] overflow-y-auto"
      >
        {!text && !run.running && run.status !== "error" && (
          <EmptyState icon={<PenLine className="size-4" />} title={L({ en: "A sourced first draft in seconds", ar: "مسودة أولى موثقة خلال ثوانٍ" })}>
            {L({
              en: "Pick a starting point or describe what you need. NARVO drafts only from the Authority's documents and marks every fact with its source; you edit and approve.",
              ar: "اختر نقطة بداية أو صف ما تحتاجه. يصوغ NARVO من مستندات الهيئة فقط ويُسند كل معلومة إلى مصدرها، وأنت تحرر وتعتمد.",
            })}
          </EmptyState>
        )}
        {run.running && !text && <ThinkingLines lines={8} className="p-2" />}
        {run.status === "error" && !text && (
          <div className="rounded-md border border-danger/25 bg-danger-soft p-3 text-[12.5px] text-danger">{run.error}</div>
        )}
        {text &&
          (view === "edit" && !run.running ? (
            <Textarea value={text} onChange={(e) => setText(e.target.value)} dir="auto" className="h-full min-h-[640px] resize-none font-mono text-[12.5px] leading-relaxed" />
          ) : (
            <article className="mx-auto max-w-[720px] rounded-md border border-border bg-white/60 px-8 py-7 dark:bg-card">
              <Markdown citations={citations} streaming={run.running} onCite={setHighlight}>
                {text}
              </Markdown>
            </article>
          ))}
      </Pane>

      <Pane title={L({ en: "Trace & evidence", ar: "المسار والأدلة" })} bodyClassName="scrollbar-thin max-h-[780px] overflow-y-auto">
        <AgentTrace run={run} title={L({ en: "Drafting trace", ar: "مسار الصياغة" })} />
        {check && (
          <div className="mt-4 rounded-md border border-border bg-surface p-3">
            <SectionLabel className="!mb-1.5">{L({ en: "Citation check", ar: "فحص الإسناد" })}</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              <StatusPill tone={check.invalid.length ? "danger" : "success"}>
                {check.invalid.length ? L({ en: `${check.invalid.length} invalid markers`, ar: `${check.invalid.length} إشارات غير صالحة` }) : L({ en: "All markers resolve", ar: "كل الإشارات صحيحة" })}
              </StatusPill>
              <StatusPill tone="neutral">{L({ en: `${check.sourcesUsed}/${check.sourcesAvailable} sources used`, ar: `${check.sourcesUsed}/${check.sourcesAvailable} مصادر مستخدمة` })}</StatusPill>
              {check.uncitedParagraphs > 0 ? (
                <StatusPill tone="warning">{L({ en: `${check.uncitedParagraphs} paragraph(s) without a source`, ar: `${check.uncitedParagraphs} فقرات دون مصدر` })}</StatusPill>
              ) : (
                <StatusPill tone="success">{L({ en: "Every paragraph sourced", ar: "كل فقرة موثقة" })}</StatusPill>
              )}
            </div>
          </div>
        )}
        <div className="mt-5">
          <SectionLabel>{L({ en: "Sources", ar: "المصادر" })}</SectionLabel>
          <SourceList citations={citations} highlight={highlight} text={text} />
        </div>
        {selected.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1">
            {selected.map((id) => (
              <span key={id} className="inline-flex items-center gap-1 rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                {id}
                <button type="button" onClick={() => setSelected((s) => s.filter((x) => x !== id))} aria-label="Remove">
                  <X className="size-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}
      </Pane>
    </Workbench>
  );
}
