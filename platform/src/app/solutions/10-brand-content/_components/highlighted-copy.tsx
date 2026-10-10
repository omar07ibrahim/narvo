"use client";

import { Fragment, type ReactNode } from "react";
import { Wand2 } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/narvo/status";
import { useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { worstCategory } from "../_lib/checks";
import type { Channel, Fact, Flag, Lang, Segment, SegmentResult, Verification } from "../_lib/types";
import { SOURCE_LABEL, VERDICT_LABEL, segmentClass } from "./labels";

export function FactChip({ fact, compact, className }: { fact: Fact; compact?: boolean; className?: string }) {
  const L = useL();
  return (
    <HoverCard openDelay={120} closeDelay={60}>
      <HoverCardTrigger asChild>
        <span
          className={cn(
            "inline-flex h-[18px] cursor-default items-center gap-1 rounded-[4px] border border-ai/25 bg-ai-soft px-1.5 font-mono text-[10px] text-ai",
            className,
          )}
        >
          {fact.id}
          {!compact && <span className="font-sans text-[10.5px] text-ai/80">{L(fact.label)}</span>}
        </span>
      </HoverCardTrigger>
      <HoverCardContent className="w-80 p-3" side="top">
        <div className="label-caps mb-1 !text-[9.5px]">
          {fact.id} · v{fact.version} · {fact.source}
        </div>
        <div className="text-[12.5px] font-medium">{L(fact.label)}</div>
        <p className="mt-1.5 border-s-2 border-ai/40 ps-2 text-[12px] leading-relaxed" dir="auto">
          <Bidi text={L({ en: fact.value, ar: fact.valueAr })} />
        </p>
        {(fact.qualifier || fact.qualifierAr) && (
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground" dir="auto">
            {L({ en: fact.qualifier ?? "", ar: fact.qualifierAr ?? fact.qualifier ?? "" })}
          </p>
        )}
        <div className="mt-2 text-[10.5px] text-faint">
          {L({ en: "Approved by", ar: "اعتمدها" })} {fact.approvedBy} · {fact.approvedOn}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function markMatches(text: string, flags: Flag[]): ReactNode {
  const ranges: Array<[number, number, Flag]> = [];
  for (const f of flags) {
    if (!f.match) continue;
    const i = text.indexOf(f.match);
    if (i >= 0) ranges.push([i, i + f.match.length, f]);
  }
  if (!ranges.length) return <Bidi text={text} />;
  ranges.sort((a, b) => a[0] - b[0]);
  // merge overlapping matches; the more severe category wins the colour
  const rank = (f: Flag) => (f.category === "forbidden" ? 3 : f.category === "channel" || f.category === "terminology" ? 1 : 2);
  const merged: Array<[number, number, Flag]> = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) {
      last[1] = Math.max(last[1], r[1]);
      if (rank(r[2]) > rank(last[2])) last[2] = r[2];
    } else merged.push([...r]);
  }
  const out: ReactNode[] = [];
  let cur = 0;
  merged.forEach(([s, e, f], k) => {
    if (s > cur) out.push(<Bidi key={`t${k}`} text={text.slice(cur, s)} />);
    out.push(
      <mark
        key={k}
        className={cn(
          "rounded-[2px] px-px",
          f.category === "forbidden" ? "bg-danger/15 text-danger" : f.category === "channel" || f.category === "terminology" ? "bg-info/10 text-info" : "bg-warning/20 text-warning",
        )}
      >
        <Bidi text={text.slice(s, e)} />
      </mark>,
    );
    cur = e;
  });
  if (cur < text.length) out.push(<Bidi key="tail" text={text.slice(cur)} />);
  return out;
}

const UNIT_RUN = /(\d+(?:\.\d+)?(?:\s?[–-]\s?\d+(?:\.\d+)?)?\s?(?:°\s?C|ºC|m²\/L|m²|L(?![A-Za-z])|%))/g;

/** In Arabic text, isolate number + Latin unit runs ("18 °C", "1.2–1.5 m²") so they don't render as "C° 18". */
export function Bidi({ text }: { text: string }) {
  if (!/[؀-ۿ]/.test(text)) return <>{text}</>;
  const parts = text.split(UNIT_RUN);
  return <>{parts.map((p, i) => (i % 2 ? <bdi key={i} dir="ltr">{p}</bdi> : p))}</>;
}

function SegmentSpan({
  seg,
  flags,
  result,
  facts,
  lang,
  onApply,
  busy,
  big,
}: {
  seg: Segment;
  flags: Flag[];
  result?: SegmentResult;
  facts: Fact[];
  lang: Lang;
  onApply?: (f: Flag) => void;
  busy?: boolean;
  big?: boolean;
}) {
  const L = useL();
  const worst = worstCategory(flags);
  const cls = segmentClass(worst, result?.verdict);
  const fixFlag = flags.find((f) => f.fix?.type === "replaceSegment");
  const fixText = fixFlag?.fix?.type === "replaceSegment" ? fixFlag.fix.text : null;
  const sourceFacts = (result?.factIds ?? []).map((id) => facts.find((f) => f.id === id)).filter(Boolean) as Fact[];
  const verdict = result?.verdict ?? "pending";
  const computedOverrode = flags.some((f) => f.source === "computed") && result?.modelVerdict && (result.modelVerdict === "supported" || result.modelVerdict === "no_claim");
  const tone = verdict === "forbidden" ? "danger" : verdict === "unsupported" || verdict === "needs_qualifier" ? "warning" : verdict === "supported" ? "success" : "neutral";

  return (
    <HoverCard openDelay={150} closeDelay={80}>
      <HoverCardTrigger asChild>
        <span className={cn("cursor-default rounded-[3px] transition-colors", cls, big && "text-[19px] font-light leading-snug")}>{markMatches(seg.text, flags)}</span>
      </HoverCardTrigger>
      <HoverCardContent className="w-[380px] p-0" side="top" align="start">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <StatusPill tone={flags.length ? (worst === "forbidden" ? "danger" : worst === "channel" || worst === "terminology" ? "info" : "warning") : tone}>
            {flags.length && !(worst === "channel" || worst === "terminology") ? L(VERDICT_LABEL[verdict]) : flags.length ? L({ en: "Brand rule", ar: "قاعدة العلامة" }) : L(VERDICT_LABEL[verdict])}
          </StatusPill>
          <span className="font-mono text-[10px] text-faint">{seg.id}</span>
        </div>
        <div className="space-y-2 px-3 py-2.5">
          {flags.map((f) => (
            <div key={f.key} className="text-[12px] leading-relaxed">
              <span className="me-1.5 rounded-[3px] border border-border bg-muted px-1 py-px font-mono text-[9.5px] text-muted-foreground">
                {L(SOURCE_LABEL[f.source])}
              </span>
              {L(f.reason)}
            </div>
          ))}
          {result?.reason && (!flags.length || flags.every((f) => f.source === "computed")) && (
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              <span className="me-1.5 rounded-[3px] border border-ai/25 bg-ai-soft px-1 py-px font-mono text-[9.5px] text-ai">{L(SOURCE_LABEL.model)}</span>
              {result.reason}
            </p>
          )}
          {computedOverrode && (
            <p className="text-[11px] text-faint">
              {L({ en: "The model judged this supported — the deterministic check overrides it.", ar: "رأى النموذج أنها مدعومة — والفحص الحتمي يتقدّم عليه." })}
            </p>
          )}
          {fixText && (
            <div className="rounded-md border border-ai/25 bg-ai-soft/50 p-2">
              <div className="label-caps mb-1 !text-[9.5px] text-ai">{L({ en: "Suggested fix", ar: "الإصلاح المقترح" })}</div>
              <p className="text-[12px] leading-relaxed" dir={lang === "ar" ? "rtl" : "ltr"}>
                <Bidi text={fixText} />
              </p>
              {onApply && fixFlag && (
                <Button size="xs" className="mt-2" disabled={busy} onClick={() => onApply(fixFlag)}>
                  <Wand2 />
                  {L({ en: "Apply fix", ar: "تطبيق الإصلاح" })}
                </Button>
              )}
            </div>
          )}
          {sourceFacts.length > 0 && (
            <div>
              <div className="label-caps mb-1 !text-[9.5px]">{L({ en: "Source facts", ar: "الحقائق المصدر" })}</div>
              <ul className="space-y-1">
                {sourceFacts.map((f) => (
                  <li key={f.id} className="flex items-start gap-1.5 text-[11.5px] leading-snug">
                    <span className="font-mono text-[10px] text-ai">{f.id}</span>
                    <span className="min-w-0 flex-1" dir="auto">
                      <Bidi text={L({ en: f.value, ar: f.valueAr })} />
                      <span className="text-faint"> · {f.source}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

/** Variant text with sentence-level highlights: hover = verdict, reasons, suggested fix and source facts. */
export function HighlightedCopy({
  parts,
  verification,
  channel,
  lang,
  facts,
  dismissed,
  onApply,
  busy,
}: {
  parts: { headline: string | null; body: string; hashtags: string[] };
  verification: Verification | null | undefined;
  channel: Channel;
  lang: Lang;
  facts: Fact[];
  dismissed?: string[];
  onApply?: (f: Flag) => void;
  busy?: boolean;
}) {
  const L = useL();
  const dis = new Set(dismissed ?? []);
  const flags = (verification?.flags ?? []).filter((f) => !dis.has(f.key));
  const segs = verification?.segments ?? [];
  const resultOf = (id: string) => verification?.results.find((r) => r.segmentId === id);
  const headSeg = segs.find((s) => s.part === "headline");
  const bodySegs = segs.filter((s) => s.part === "body").sort((a, b) => a.start - b.start);
  const consistent = bodySegs.every((s) => parts.body.slice(s.start, s.end) === s.text);
  const tagFlags = flags.filter((f) => f.segmentId === "t");

  const bodyNodes: ReactNode[] = [];
  if (consistent && bodySegs.length) {
    let cur = 0;
    bodySegs.forEach((s) => {
      if (s.start > cur) bodyNodes.push(<Fragment key={`g${s.id}`}>{parts.body.slice(cur, s.start)}</Fragment>);
      bodyNodes.push(
        <SegmentSpan key={s.id} seg={s} flags={flags.filter((f) => f.segmentId === s.id)} result={resultOf(s.id)} facts={facts} lang={lang} onApply={onApply} busy={busy} />,
      );
      cur = s.end;
    });
    if (cur < parts.body.length) bodyNodes.push(<Fragment key="tail">{parts.body.slice(cur)}</Fragment>);
  } else bodyNodes.push(parts.body);

  return (
    <div dir={lang === "ar" ? "rtl" : "ltr"} className={cn("text-start", lang === "ar" && "font-arabic")}>
      {channel.headline && (
        <div className="mb-3">
          <div className="label-caps mb-1 !text-[9.5px]">{L(channel.headline.label)}</div>
          {parts.headline && headSeg ? (
            <SegmentSpan seg={headSeg} flags={flags.filter((f) => f.segmentId === "h")} result={resultOf("h")} facts={facts} lang={lang} onApply={onApply} busy={busy} big />
          ) : (
            <span className="text-[19px] font-light leading-snug">{parts.headline ?? "—"}</span>
          )}
        </div>
      )}
      <div className="text-[14px] leading-[1.85] whitespace-pre-wrap">{bodyNodes}</div>
      {parts.hashtags.length > 0 && (
        <div className={cn("mt-3 flex flex-wrap gap-1.5", tagFlags.length && "rounded-md border border-dashed border-info/40 p-1.5")}>
          {parts.hashtags.map((h) => (
            <span key={h} className="rounded-full border border-border bg-surface px-2 py-0.5 text-[12px] text-muted-foreground">
              {h}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
