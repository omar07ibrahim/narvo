"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, History, PenLine, RefreshCw, ShieldCheck, Sparkles, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { EmptyState, ThinkingLines } from "@/components/narvo/empty";
import { StatusPill } from "@/components/narvo/status";
import { useFormat, useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  SEVERITY_RANK,
  buildVerification,
  inlineHashtags,
  openFlags,
  opForFlag,
  runComputedChecks,
  usedFactIds,
  type FixOp,
} from "../_lib/checks";
import type { BrandRules, Channel, Fact, Flag, Lang, Variant } from "../_lib/types";
import { FlagList } from "./flag-list";
import { FactChip, HighlightedCopy } from "./highlighted-copy";
import { DiffView, composeText } from "./diff-view";
import { STATUS_LABEL, STATUS_TONE } from "./labels";
import { cellStatus } from "./variant-matrix";

const PRESETS = [
  { en: "Shorter", ar: "أقصر" },
  { en: "More technical", ar: "أكثر تقنية" },
  { en: "Address villa owners", ar: "خاطب ملاك الفلل" },
  { en: "Address facility managers", ar: "خاطب مديري المرافق" },
];

function Metric({ label, value, limit, bad }: { label: string; value: string; limit?: string; bad?: boolean }) {
  return (
    <div className="min-w-0 px-3 py-2">
      <div className="label-caps truncate !text-[9.5px]">{label}</div>
      <div className={cn("num mt-0.5 text-[15px] font-light", bad && "text-danger")}>
        {value}
        {limit && <span className="ms-1 text-[11px] text-muted-foreground">/ {limit}</span>}
      </div>
    </div>
  );
}

/** Build fix operations for a set of flags — one replacement per sentence (most severe flag's fix wins). */
export function opsForFlags(flags: Flag[]): FixOp[] {
  const bySeg = new Map<string, Flag>();
  const ops: FixOp[] = [];
  for (const f of [...flags].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])) {
    const op = opForFlag(f);
    if (!op || op.type === "regenerate") continue;
    if (op.type === "replace") {
      if (!bySeg.has(op.segmentId)) {
        bySeg.set(op.segmentId, f);
        ops.push(op);
      }
    } else if (!ops.some((o) => o.type === op.type)) ops.push(op);
  }
  return ops;
}

export function VariantDetail({
  id,
  channel,
  lang,
  variant,
  facts,
  rules,
  generating,
  liveDetail,
  busy,
  error,
  onGenerate,
  onVerify,
  onSaveEdit,
  onApplyOps,
  onDismiss,
}: {
  id: string;
  channel: Channel;
  lang: Lang;
  variant?: Variant;
  facts: Fact[];
  rules: BrandRules;
  generating: boolean;
  liveDetail?: string;
  busy: boolean;
  error?: string | null;
  onGenerate: (instruction?: string) => void;
  onVerify: () => void;
  onSaveEdit: (p: { headline: string | null; body: string; hashtags: string[] }) => void;
  onApplyOps: (ops: FixOp[]) => void;
  onDismiss: (f: Flag, note: string) => void;
}) {
  const L = useL();
  const fmt = useFormat();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ headline: "", body: "", hashtags: "" });
  const [instr, setInstr] = useState("");
  const [instrOpen, setInstrOpen] = useState(false);
  const [compare, setCompare] = useState<number | null>(null);

  useEffect(() => {
    setEditing(false);
    setCompare(null);
  }, [id, variant?.version]);

  const valid = useMemo(() => new Set(facts.map((f) => f.id)), [facts]);
  const st = cellStatus(variant, generating);

  // stale variants: re-run the deterministic checks against the CURRENT fact sheet, live
  const liveVerification = useMemo(() => {
    if (!variant?.stale) return null;
    const comp = runComputedChecks(variant, { channel, lang, facts, rules });
    return buildVerification(comp, null, { validFactIds: valid });
  }, [variant, channel, lang, facts, rules, valid]);

  const editCheck = useMemo(() => {
    if (!editing) return null;
    const parts = { headline: channel.headline ? draft.headline.trim() || null : null, body: draft.body, hashtags: channel.hashtags ? inlineHashtags(draft.hashtags) : [] };
    return runComputedChecks(parts, { channel, lang, facts, rules });
  }, [editing, draft, channel, lang, facts, rules]);

  if (!variant && !generating) {
    return (
      <div>
        <EmptyState
          icon={<Sparkles className="size-4" />}
          title={L({ en: `No ${channel.name.en} variant in ${lang === "ar" ? "Arabic" : "English"} yet`, ar: `لا توجد نسخة ${channel.name.ar} ${lang === "ar" ? "بالعربية" : "بالإنجليزية"} بعد` })}
          action={
            <Button onClick={() => onGenerate()} disabled={busy}>
              <Sparkles />
              {L({ en: "Generate from approved facts", ar: "إنتاج من الحقائق المعتمدة" })}
            </Button>
          }
        >
          {L({
            en: "The agent writes only from the approved fact sheet, then every sentence is verified: computed checks first, then a model judgement.",
            ar: "يكتب الوكيل من ورقة الحقائق المعتمدة فقط، ثم تُفحص كل جملة: الفحوص الحتمية أولاً ثم حكم النموذج.",
          })}
        </EmptyState>
        <ChannelSpec channel={channel} />
        {error && <ErrorBox msg={error} onRetry={() => onGenerate()} />}
      </div>
    );
  }

  if (generating && !variant?.verification) {
    return (
      <div className="space-y-4 py-2">
        <div className="flex items-center gap-2">
          <StatusPill tone="ai" pulse>
            {L(STATUS_LABEL.generating)}
          </StatusPill>
          <span className="shimmer-text text-[12.5px]">{liveDetail ?? L({ en: "Writing from approved facts…", ar: "الكتابة من الحقائق المعتمدة…" })}</span>
        </div>
        <ThinkingLines lines={7} />
        <ChannelSpec channel={channel} />
      </div>
    );
  }

  const v = variant!;
  const verification = liveVerification ?? v.verification;
  const dismissedKeys = (v.dismissed ?? []).map((d) => d.key);
  const flags = liveVerification ? liveVerification.flags : openFlags(v);
  const m = verification?.metrics;
  const limits = rules.channelLimits[channel.id];
  const used = usedFactIds(v, valid)
    .map((fid) => facts.find((f) => f.id === fid)!)
    .filter(Boolean)
    .sort((a, b) => a.id.localeCompare(b.id));
  const fixable = opsForFlags(flags);
  const prev = compare != null ? v.history.find((h) => h.version === compare) : v.history[0];

  return (
    <div className="space-y-4">
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[18px] font-light tracking-tight">{L(channel.name)}</h2>
            <span className="rounded border border-border px-1.5 py-px font-mono text-[10.5px] text-muted-foreground">{lang.toUpperCase()}</span>
            <StatusPill tone={STATUS_TONE[st]} pulse={st === "generating"}>
              {L(STATUS_LABEL[st])}
            </StatusPill>
            <span className="num text-[11.5px] text-muted-foreground">v{v.version}</span>
          </div>
          <p className="mt-1 text-[11.5px] text-muted-foreground">
            {v.author.name} · {fmt.date(v.updatedAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            {v.verification?.model && ` · ${L({ en: "verified with", ar: "تحقق بواسطة" })} ${v.verification.model.split("/").pop()}`}
          </p>
        </div>
        {!editing && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant="outline" disabled={busy} onClick={onVerify}>
              <ShieldCheck />
              {L({ en: "Verify claims", ar: "تحقق من الادعاءات" })}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setDraft({ headline: v.headline ?? "", body: v.body, hashtags: v.hashtags.join(" ") });
                setEditing(true);
              }}
            >
              <PenLine />
              {L({ en: "Edit", ar: "تعديل" })}
            </Button>
            <Popover open={instrOpen} onOpenChange={setInstrOpen}>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" disabled={busy}>
                  <RefreshCw />
                  {L({ en: "Regenerate", ar: "إعادة الإنتاج" })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-3" align="end">
                <div className="label-caps mb-2 !text-[9.5px]">{L({ en: "Optional instruction", ar: "تعليمات اختيارية" })}</div>
                <div className="mb-2 flex flex-wrap gap-1">
                  {PRESETS.map((p) => (
                    <button
                      key={p.en}
                      type="button"
                      onClick={() => setInstr(p.en)}
                      className={cn("rounded-full border px-2 py-0.5 text-[11px]", instr === p.en ? "border-ai/40 bg-ai-soft text-ai" : "border-border hover:bg-muted")}
                    >
                      {L(p)}
                    </button>
                  ))}
                </div>
                <Input value={instr} onChange={(e) => setInstr(e.target.value)} placeholder={L({ en: "e.g. lead with the warranty", ar: "مثال: ابدأ بالضمان" })} className="h-8 text-[12px]" />
                <Button
                  size="sm"
                  className="mt-2 w-full"
                  onClick={() => {
                    setInstrOpen(false);
                    onGenerate(instr.trim() || undefined);
                  }}
                >
                  <Sparkles />
                  {v.origin === "legacy" ? L({ en: "Regenerate from approved facts", ar: "إعادة الإنتاج من الحقائق المعتمدة" }) : L({ en: "Regenerate", ar: "إعادة الإنتاج" })}
                </Button>
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>

      {/* banners */}
      {v.origin === "legacy" && v.note && (
        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-[12px] leading-relaxed text-muted-foreground">
          <History className="mt-0.5 size-3.5 shrink-0" />
          <span>
            <span className="font-medium text-foreground">{L({ en: "Legacy draft", ar: "مسودة قديمة" })} · {v.author.name}</span> — {L(v.note)}
          </span>
        </div>
      )}
      {v.stale && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-warning/35 bg-warning-soft/60 px-3 py-2.5">
          <AlertTriangle className="size-4 shrink-0 text-warning" />
          <div className="min-w-0 flex-1 text-[12.5px] leading-relaxed">
            <span className="font-medium">
              {v.stale.factId} {L(v.stale.label)} {L({ en: "changed", ar: "تغيّرت" })}
            </span>
            <span className="text-muted-foreground" dir="auto">
              {" "}
              — “{v.stale.from}” → “{v.stale.to}” · {v.stale.reasons.join(" · ")}
            </span>
          </div>
          <Button size="sm" disabled={busy} onClick={() => onGenerate()}>
            <RefreshCw />
            {L({ en: "Update for new fact", ar: "حدّث وفق الحقيقة الجديدة" })}
          </Button>
        </div>
      )}
      {!v.stale && v.verification?.mode === "computed" && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2">
          <span className="min-w-0 flex-1 text-[12px] text-muted-foreground">
            {L({
              en: "Deterministic checks only. Run the full verification to add the model's sentence-by-sentence judgement and suggested fixes.",
              ar: "فحوص حتمية فقط. شغّل التحقق الكامل لإضافة حكم النموذج جملةً جملة والإصلاحات المقترحة.",
            })}
          </span>
          <Button size="sm" variant="outline" disabled={busy} onClick={onVerify}>
            <ShieldCheck />
            {L({ en: "Run full verification", ar: "تشغيل التحقق الكامل" })}
          </Button>
        </div>
      )}
      {error && <ErrorBox msg={error} onRetry={onVerify} />}

      {/* metrics */}
      {m && (
        <div className="grid grid-cols-5 divide-x divide-border rounded-md border border-border rtl:divide-x-reverse">
          <Metric label={L({ en: "Words", ar: "الكلمات" })} value={String(m.words)} limit={`${channel.words[0]}–${channel.words[1]}`} bad={m.words < channel.words[0] || m.words > channel.words[1]} />
          <Metric
            label={channel.headline ? L(channel.headline.label) : L({ en: "Headline", ar: "العنوان" })}
            value={channel.headline ? String(m.headlineChars ?? 0) : "—"}
            limit={channel.headline ? `${channel.headline.max}` : undefined}
            bad={!!channel.headline && (m.headlineChars ?? 0) > channel.headline.max}
          />
          <Metric label={L({ en: "Hashtags", ar: "الوسوم" })} value={String(m.hashtags)} limit={limits.maxHashtags != null ? String(channel.hashtags ? limits.maxHashtags : 0) : undefined} bad={limits.maxHashtags != null && m.hashtags > (channel.hashtags ? limits.maxHashtags : 0)} />
          <Metric label={L({ en: "Emoji", ar: "رموز" })} value={String(m.emoji)} limit={limits.maxEmoji != null ? String(limits.maxEmoji) : undefined} bad={limits.maxEmoji != null && m.emoji > limits.maxEmoji} />
          <Metric label="!" value={String(m.exclamations)} limit={limits.maxExclamation != null ? String(limits.maxExclamation) : undefined} bad={limits.maxExclamation != null && m.exclamations > limits.maxExclamation} />
        </div>
      )}

      {/* copy */}
      {editing ? (
        <div className="space-y-2 rounded-md border border-ai/30 p-3">
          {channel.headline && (
            <div>
              <div className="label-caps mb-1 !text-[9.5px]">
                {L(channel.headline.label)} · <span className="num">{draft.headline.length}/{channel.headline.max}</span>
              </div>
              <Input value={draft.headline} onChange={(e) => setDraft((d) => ({ ...d, headline: e.target.value }))} dir={lang === "ar" ? "rtl" : "ltr"} className="text-[13.5px]" />
            </div>
          )}
          <Textarea
            value={draft.body}
            onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
            dir={lang === "ar" ? "rtl" : "ltr"}
            className="scrollbar-thin min-h-[240px] text-[13.5px] leading-relaxed"
          />
          {channel.hashtags && (
            <Input value={draft.hashtags} onChange={(e) => setDraft((d) => ({ ...d, hashtags: e.target.value }))} placeholder="#RaseenThermaShield #رصين" dir="auto" className="text-[12.5px]" />
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={cn("text-[11.5px]", editCheck?.flags.length ? "text-warning" : "text-success")}>
              {editCheck
                ? editCheck.flags.length
                  ? L({ en: `${editCheck.flags.length} deterministic issue(s) as you type · ${editCheck.metrics.words} words`, ar: `${editCheck.flags.length} مشكلة حتمية أثناء الكتابة · ${editCheck.metrics.words} كلمة` })
                  : L({ en: `Deterministic checks pass · ${editCheck.metrics.words} words`, ar: `الفحوص الحتمية ناجحة · ${editCheck.metrics.words} كلمة` })
                : ""}
            </span>
            <div className="flex gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                <X />
                {L({ en: "Cancel", ar: "إلغاء" })}
              </Button>
              <Button
                size="sm"
                disabled={busy || !draft.body.trim()}
                onClick={() => {
                  onSaveEdit({ headline: draft.headline, body: draft.body, hashtags: inlineHashtags(draft.hashtags) });
                  setEditing(false);
                }}
              >
                <ShieldCheck />
                {L({ en: "Save & re-verify", ar: "حفظ وإعادة التحقق" })}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className={cn("rounded-md border border-border bg-surface/50 px-4 py-3.5", generating && "opacity-60")}>
          <HighlightedCopy
            parts={v}
            verification={verification}
            channel={channel}
            lang={lang}
            facts={facts}
            dismissed={dismissedKeys}
            onApply={liveVerification ? undefined : (f) => {
              const op = opForFlag(f);
              if (op && op.type !== "regenerate") onApplyOps([op]);
            }}
            busy={busy}
          />
        </div>
      )}

      {/* flags */}
      {!editing && (
        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="label-caps">
              {liveVerification ? L({ en: "Against the current fact sheet", ar: "مقابل ورقة الحقائق الحالية" }) : L({ en: "Open flags", ar: "الملاحظات المفتوحة" })}{" "}
              <span className="num">({flags.length})</span>
            </span>
            {!liveVerification && fixable.length > 1 && (
              <Button size="xs" disabled={busy} onClick={() => onApplyOps(fixable)}>
                <Wand2 />
                {L({ en: `Apply all fixes (${fixable.length})`, ar: `تطبيق كل الإصلاحات (${fixable.length})` })}
              </Button>
            )}
          </div>
          <FlagList
            flags={flags}
            segments={verification?.segments ?? []}
            facts={facts}
            lang={lang}
            busy={busy}
            onApply={liveVerification ? undefined : (f) => {
              const op = opForFlag(f);
              if (op && op.type !== "regenerate") onApplyOps([op]);
            }}
            onRegenerate={(i) => onGenerate(i)}
            onDismiss={liveVerification ? undefined : onDismiss}
            emptyText={
              v.verification?.mode === "computed"
                ? L({ en: "No deterministic issues — run the full verification for the model judgement.", ar: "لا مشكلات حتمية — شغّل التحقق الكامل لحكم النموذج." })
                : undefined
            }
          />
        </section>
      )}

      {/* facts used */}
      {used.length > 0 && (
        <section>
          <div className="label-caps mb-2">
            {L({ en: "Facts used", ar: "الحقائق المستخدمة" })} <span className="num">({used.length})</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {used.map((f) => (
              <FactChip key={f.id} fact={f} />
            ))}
          </div>
        </section>
      )}

      {/* history + diff */}
      {v.history.length > 0 && prev && (
        <section>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="label-caps">{L({ en: "Changes", ar: "التغييرات" })}</span>
            <div className="flex flex-wrap items-center gap-1">
              {v.history.map((h) => (
                <button
                  key={h.version}
                  type="button"
                  onClick={() => setCompare(h.version)}
                  className={cn(
                    "num rounded-full border px-2 py-0.5 text-[11px]",
                    prev.version === h.version ? "border-ai/40 bg-ai-soft text-ai" : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  v{h.version} → v{v.version}
                </button>
              ))}
            </div>
          </div>
          <p className="mb-2 text-[11.5px] text-muted-foreground">
            v{prev.version}: {prev.reason} · {prev.by}
            {v.instruction && ` — v${v.version}: ${v.instruction}`}
          </p>
          <DiffView before={composeText(prev)} after={composeText(v)} lang={lang} />
        </section>
      )}

      {/* resolution log */}
      {(v.flagLog?.length ?? 0) > 0 && (
        <Collapsible>
          <CollapsibleTrigger className="label-caps flex w-full items-center justify-between rounded-md border border-border px-3 py-2 hover:bg-muted/50">
            <span>
              {L({ en: "Resolved flags", ar: "الملاحظات المعالجة" })} <span className="num">({v.flagStats.resolved}/{v.flagStats.raised})</span>
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="mt-1 divide-y divide-border rounded-md border border-border">
              {v.flagLog!.slice(0, 20).map((r, i) => (
                <li key={`${r.key}-${i}`} className="flex items-center justify-between gap-2 px-3 py-1.5 text-[12px]">
                  <span className="min-w-0 truncate">
                    <span className="text-success">✓</span> {L(r.label)}
                    {r.note && <span className="text-muted-foreground"> — {r.note}</span>}
                  </span>
                  <span className="shrink-0 text-[10.5px] text-muted-foreground">
                    {r.resolution} · {fmt.time(r.at)}
                  </span>
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

export function ChannelSpec({ channel }: { channel: Channel }) {
  const L = useL();
  return (
    <div className="mt-2 rounded-md border border-border p-3">
      <div className="label-caps mb-1.5 !text-[9.5px]">
        {L({ en: "Channel rules", ar: "قواعد القناة" })} · {channel.ref}
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
        {L({ en: channel.rules.en.join("\u0001"), ar: channel.rules.ar.join("\u0001") })
          .split("\u0001")
          .map((r) => (
            <li key={r} className="flex gap-1.5">
              <span className="text-faint">·</span>
              {r}
            </li>
          ))}
      </ul>
      <p className="mt-2 text-[11.5px] text-faint">{L(channel.audience)}</p>
    </div>
  );
}

export function ErrorBox({ msg, onRetry }: { msg: string; onRetry?: () => void }) {
  const L = useL();
  return (
    <div className="mt-3 flex items-start justify-between gap-3 rounded-md border border-danger/25 bg-danger-soft p-2.5 text-[12px] text-danger">
      <span className="min-w-0 break-words">{msg}</span>
      {onRetry && (
        <Button size="xs" variant="outline" onClick={onRetry}>
          <RefreshCw />
          {L({ en: "Retry", ar: "إعادة المحاولة" })}
        </Button>
      )}
    </div>
  );
}
