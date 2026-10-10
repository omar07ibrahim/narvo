"use client";

import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Copy, FileText, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RunButton } from "@/components/narvo/run-button";
import { ThinkingLines } from "@/components/narvo/empty";
import { StatusPill } from "@/components/narvo/status";
import type { NarvoRun } from "@/hooks/use-narvo-run";
import { useFormat, useL } from "@/lib/i18n";
import { applyOps, opForFlag } from "../_lib/checks";
import { CHANNEL_ORDER, type ByoCheck, type Channel, type ChannelId, type Fact, type Flag } from "../_lib/types";
import { FlagList } from "./flag-list";
import { HighlightedCopy } from "./highlighted-copy";
import { DiffView, composeText } from "./diff-view";
import { ErrorBox } from "./variant-detail";

const EXAMPLES: Array<{ label: { en: string; ar: string }; channel: ChannelId; text: string }> = [
  {
    label: { en: "Distributor LinkedIn post (AR)", ar: "منشور لينكدإن من موزّع (عربي)" },
    channel: "linkedin",
    text: "يسرّنا الإعلان عن طرح طلاء ثيرماشيلد من رصين، الحل الأفضل لحماية الأسطح في الإمارات. يجعل الطلاء الغرف أبرد بـ18 درجة مئوية، ويوفر ما يصل إلى 35% من فاتورة الكهرباء. المنتج معتمد من الجهات الحكومية ويأتي بضمان 12 سنة. السعر 385 درهم فقط للسطل. للطلب تواصلوا معنا عبر www.gulfroofing-deals.ae\n#ثيرماشيلد #أسطح #الإمارات",
  },
  {
    label: { en: "Reseller Instagram caption (EN)", ar: "تعليق إنستغرام من موزّع (إنجليزي)" },
    channel: "instagram",
    text: "Beat the heat this summer! Raseen Thermashield reflects 92% of sunlight and keeps your home up to 15 °C cooler. Government-approved formula that lasts 20 years with zero maintenance. Grab yours now — special launch offer AED 349!\n#heatproof #roofgoals #dubai",
  },
];

export function ByoCheckPanel({
  channels,
  facts,
  run,
  recent,
  onDone,
}: {
  channels: Channel[];
  facts: Fact[];
  run: NarvoRun;
  recent: ByoCheck[];
  onDone: () => void;
}) {
  const L = useL();
  const fmt = useFormat();
  const [channelId, setChannelId] = useState<ChannelId>("linkedin");
  const [headline, setHeadline] = useState("");
  const [text, setText] = useState("");
  const [result, setResult] = useState<ByoCheck | null>(null);
  const [edited, setEdited] = useState(false);
  const [mode, setMode] = useState<"check" | "rewrite">("check");
  const channel = channels.find((c) => c.id === channelId)!;

  useEffect(() => {
    const c = run.data.check as ByoCheck | undefined;
    if (c) {
      setResult(c);
      setEdited(false);
      onDone();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.data.check]);
  useEffect(() => {
    const r = run.data.rewrite as (ByoCheck["rewrite"] & { checkId: string }) | undefined;
    if (r) {
      setResult((cur) => (cur && cur.id === r.checkId ? { ...cur, rewrite: r } : cur));
      onDone();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.data.rewrite]);

  const resultChannel = result ? channels.find((c) => c.id === result.channel)! : channel;
  const flags = result?.verification.flags ?? [];
  const checking = run.running && mode === "check";
  const rewriting = run.running && mode === "rewrite";

  function check() {
    setResult(null);
    setMode("check");
    run.start("/api/solutions/10-brand-content/check", { text, headline: headline || null, channel: channelId });
  }

  function applyFix(f: Flag) {
    if (!result) return;
    const op = opForFlag(f);
    if (!op || op.type === "regenerate") return;
    const next = applyOps({ headline: result.headline, body: result.body, hashtags: result.hashtags }, [op]);
    setText([next.body, next.hashtags.join(" ")].filter(Boolean).join("\n"));
    if (next.headline) setHeadline(next.headline);
    setEdited(true);
    toast.success(L({ en: "Fix applied to your copy — run the check again", ar: "طُبّق الإصلاح على نصك — أعد الفحص" }));
  }

  const rewriteText = useMemo(() => (result?.rewrite ? composeText(result.rewrite) : ""), [result?.rewrite]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[18px] font-light tracking-tight">{L({ en: "Check your own copy", ar: "افحص نصك الخاص" })}</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
          {L({
            en: "Paste any ThermaShield copy — from an agency, a distributor or a colleague, in English or Arabic. The same engine checks it against the approved facts and brand rules.",
            ar: "الصق أي نص عن ثيرماشيلد — من وكالة أو موزّع أو زميل، بالعربية أو الإنجليزية. يفحصه المحرك نفسه مقابل الحقائق المعتمدة وقواعد العلامة.",
          })}
        </p>
      </div>

      <div className="space-y-2 rounded-md border border-border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="label-caps !text-[9.5px]">{L({ en: "Channel", ar: "القناة" })}</span>
          <Select value={channelId} onValueChange={(v) => setChannelId(v as ChannelId)}>
            <SelectTrigger size="sm" className="h-7 min-w-44 text-[12px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHANNEL_ORDER.map((id) => (
                <SelectItem key={id} value={id} className="text-[12px]">
                  {L(channels.find((c) => c.id === id)!.name)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="ms-auto flex flex-wrap gap-1">
            {EXAMPLES.map((e) => (
              <Button
                key={e.label.en}
                size="xs"
                variant="ghost"
                className="text-muted-foreground"
                onClick={() => {
                  setText(e.text);
                  setChannelId(e.channel);
                  setHeadline("");
                  setResult(null);
                }}
              >
                <FileText />
                {L(e.label)}
              </Button>
            ))}
          </span>
        </div>
        {channel.headline && (
          <Input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder={`${L(channel.headline.label)} (${L({ en: "optional", ar: "اختياري" })})`} dir="auto" className="h-8 text-[12.5px]" />
        )}
        <Textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setEdited(true);
          }}
          dir="auto"
          placeholder={L({ en: "Paste copy here… hashtags on the last line are read as hashtags.", ar: "الصق النص هنا… تُقرأ الوسوم في السطر الأخير كوسوم." })}
          className="scrollbar-thin min-h-[150px] text-[13px] leading-relaxed"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">{L({ en: "Language is detected automatically.", ar: "تُكتشف اللغة تلقائياً." })}</span>
          <RunButton running={checking} onRun={check} disabled={!text.trim()} icon={<ClipboardCheck />} size="sm">
            {L({ en: "Check compliance", ar: "افحص المطابقة" })}
          </RunButton>
        </div>
      </div>

      {run.status === "error" && <ErrorBox msg={run.error ?? "Error"} onRetry={text.trim() ? check : undefined} />}
      {checking && <ThinkingLines lines={5} />}

      {result && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="label-caps">{L({ en: "Result", ar: "النتيجة" })}</span>
              <StatusPill tone={flags.length ? "danger" : "success"}>
                {flags.length ? L({ en: `${flags.length} issue(s)`, ar: `${flags.length} مشكلة` }) : L({ en: "Compliant", ar: "مطابق" })}
              </StatusPill>
              <span className="text-[11.5px] text-muted-foreground">
                {L(resultChannel.name)} · {result.lang.toUpperCase()} · {result.verification.summary.supported}/{result.verification.summary.sentences}{" "}
                {L({ en: "sentences supported", ar: "جمل مدعومة" })}
              </span>
              {edited && <StatusPill tone="warning">{L({ en: "Edited — re-check", ar: "عُدّل — أعد الفحص" })}</StatusPill>}
            </div>
            {flags.length > 0 && (
              <RunButton
                size="sm"
                variant="outline"
                running={rewriting}
                disabled={run.running}
                onRun={() => {
                  setMode("rewrite");
                  run.start("/api/solutions/10-brand-content/check", { rewriteOf: result.id });
                }}
                icon={<Sparkles />}
              >
                {L({ en: "Rewrite compliantly", ar: "أعد الصياغة بشكل مطابق" })}
              </RunButton>
            )}
          </div>
          <div className="rounded-md border border-border bg-surface/50 px-4 py-3.5">
            <HighlightedCopy parts={result} verification={result.verification} channel={resultChannel} lang={result.lang} facts={facts} onApply={applyFix} />
          </div>
          <FlagList flags={flags} segments={result.verification.segments} facts={facts} lang={result.lang} onApply={applyFix} />

          {rewriting && <ThinkingLines lines={4} />}
          {result.rewrite && !rewriting && (
            <div className="space-y-2 rounded-md border border-ai/30 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="label-caps text-ai">{L({ en: "Compliant rewrite", ar: "صياغة مطابقة" })}</span>
                <span className="flex items-center gap-2">
                  <StatusPill tone={result.rewrite.verification.flags.length ? "warning" : "success"}>
                    {result.rewrite.verification.flags.length
                      ? L({ en: `${result.rewrite.verification.flags.length} remaining`, ar: `${result.rewrite.verification.flags.length} متبقية` })
                      : L({ en: "Deterministic checks pass", ar: "الفحوص الحتمية ناجحة" })}
                  </StatusPill>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => {
                      void navigator.clipboard?.writeText(rewriteText);
                      toast.success(L({ en: "Copied", ar: "نُسخ" }));
                    }}
                  >
                    <Copy />
                    {L({ en: "Copy", ar: "نسخ" })}
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => {
                      setText([result.rewrite!.body, result.rewrite!.hashtags.join(" ")].filter(Boolean).join("\n"));
                      if (result.rewrite!.headline) setHeadline(result.rewrite!.headline);
                      setEdited(true);
                    }}
                  >
                    <Wand2 />
                    {L({ en: "Use as input", ar: "استخدمه كمدخل" })}
                  </Button>
                </span>
              </div>
              <HighlightedCopy parts={result.rewrite} verification={result.rewrite.verification} channel={resultChannel} lang={result.lang} facts={facts} />
              <DiffView before={composeText(result)} after={rewriteText} lang={result.lang} />
            </div>
          )}
        </div>
      )}

      {recent.length > 0 && (
        <div>
          <div className="label-caps mb-2">{L({ en: "Recent checks", ar: "الفحوص الأخيرة" })}</div>
          <ul className="divide-y divide-border rounded-md border border-border">
            {recent.slice(0, 6).map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    setResult(c);
                    setText([c.body, c.hashtags.join(" ")].filter(Boolean).join("\n"));
                    setChannelId(c.channel);
                    setEdited(false);
                  }}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-start hover:bg-muted/50"
                >
                  <span className="min-w-0 truncate text-[12px]" dir="auto">
                    {c.body.slice(0, 90)}
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-[10.5px] text-muted-foreground">
                    {L(channels.find((x) => x.id === c.channel)!.short)} · {c.lang.toUpperCase()}
                    <StatusPill tone={c.verification.flags.length ? "danger" : "success"}>{c.verification.flags.length}</StatusPill>
                    {fmt.time(c.at)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
