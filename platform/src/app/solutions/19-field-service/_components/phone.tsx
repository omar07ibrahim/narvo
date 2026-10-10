"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { BatteryMedium, BookOpenCheck, Camera, CircleCheck, ClipboardCheck, FileText, ImagePlus, MessageCircleQuestion, Signal, Volume2, VolumeX, Wifi, X } from "lucide-react";
import { toast } from "sonner";
import { useNarvoRun, type NarvoRun } from "@/hooks/use-narvo-run";
import { Markdown } from "@/components/narvo/markdown";
import { VoiceButton, speak, stopSpeaking } from "@/components/narvo/voice";
import { RunButton } from "@/components/narvo/run-button";
import { ThinkingLines } from "@/components/narvo/empty";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useFormat, useL, usePrefs } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Citation } from "@/lib/ai/events";
import type { Asset, Completeness, Job, PartAvailability, Site, Technician } from "../_lib/types";
import { ARUN_NOTE, ASK_SUGGESTIONS } from "./samples";
import { PartsTable, type BriefData } from "./brief-view";

type Tab = "job" | "ask" | "visit";

async function toDataUrl(file: Blob, max = 1280): Promise<string> {
  const url = await new Promise<string>((r) => {
    const fr = new FileReader();
    fr.onload = () => r(fr.result as string);
    fr.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = url;
  });
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * s);
  c.height = Math.round(img.naturalHeight * s);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85);
}

export function Phone({
  job,
  site,
  asset,
  tech,
  brief,
  briefRun,
  onRunBrief,
  onReviewed,
  onCheckIn,
  reportRun,
  onGenerate,
  samplePhotos,
}: {
  job: Job;
  site: Site;
  asset: Asset;
  tech: Technician;
  brief?: BriefData;
  briefRun: NarvoRun;
  onRunBrief: () => void;
  onReviewed: (minutes: number) => void;
  onCheckIn: () => void;
  reportRun: NarvoRun;
  onGenerate: (notes: string, photos: Array<{ dataUrl: string; caption: string; phase: string }>) => void;
  samplePhotos: Array<{ src: string; caption: string; phase: string }>;
}) {
  const L = useL();
  const [tab, setTab] = useState<Tab>("job");
  const [clock, setClock] = useState("07:42");
  const [briefDoneAt, setBriefDoneAt] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setClock(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai" }).format(new Date()));
    tick();
    const t = setInterval(tick, 30000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (briefRun.status === "done") setBriefDoneAt(Date.now());
  }, [briefRun.status]);
  useEffect(() => setTab("job"), [job.id]);

  return (
    <div className="mx-auto w-[372px] max-w-full">
      <div className="relative rounded-[46px] border-[9px] border-[#161513] bg-[#161513] shadow-[0_18px_40px_-18px_rgba(0,0,0,0.45)]">
        <div className="absolute top-2 left-1/2 z-20 h-[22px] w-[96px] -translate-x-1/2 rounded-full bg-[#161513]" />
        <div className="relative flex h-[780px] flex-col overflow-hidden rounded-[37px] bg-background">
          {/* status bar */}
          <div className="flex h-10 shrink-0 items-center justify-between px-7 pt-1 text-[12px] font-semibold" dir="ltr">
            <span className="num">{clock}</span>
            <span className="flex items-center gap-1 text-foreground/80">
              <Signal className="size-3.5" />
              <Wifi className="size-3.5" />
              <BatteryMedium className="size-4" />
            </span>
          </div>
          {/* app header */}
          <div className="shrink-0 border-b border-border px-4 pb-2.5">
            <div className="label-caps !text-[9px]">RFM Connect · {L({ en: "Field", ar: "ميداني" })}</div>
            <div className="mt-0.5 flex items-center justify-between gap-2">
              <span className="font-mono text-[12px] font-medium">{job.id}</span>
              <span className="text-[11px] text-muted-foreground">{tech.name}</span>
            </div>
          </div>
          {/* content */}
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
            {tab === "job" && (
              <JobTab
                job={job}
                site={site}
                asset={asset}
                brief={brief}
                briefRun={briefRun}
                onRunBrief={onRunBrief}
                onReviewed={() => {
                  const genMs = brief?.ms ?? 0;
                  const reviewMs = briefDoneAt ? Date.now() - briefDoneAt : 3 * 60000;
                  onReviewed(Math.max(1, Math.round((genMs + reviewMs) / 60000)));
                }}
                onCheckIn={onCheckIn}
              />
            )}
            {tab === "ask" && <AskTab job={job} />}
            {tab === "visit" && <VisitTab job={job} reportRun={reportRun} onGenerate={onGenerate} samplePhotos={samplePhotos} />}
          </div>
          {/* bottom nav */}
          <nav className="grid shrink-0 grid-cols-3 border-t border-border bg-card px-2 pt-1.5 pb-5">
            {(
              [
                { id: "job", icon: <BookOpenCheck className="size-[18px]" />, label: L({ en: "Job", ar: "المهمة" }) },
                { id: "ask", icon: <MessageCircleQuestion className="size-[18px]" />, label: L({ en: "Ask", ar: "اسأل" }) },
                { id: "visit", icon: <ClipboardCheck className="size-[18px]" />, label: L({ en: "Visit", ar: "الزيارة" }) },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn("flex flex-col items-center gap-0.5 rounded-md py-1 text-[10.5px] transition-colors", tab === t.id ? "text-ai" : "text-muted-foreground hover:text-foreground")}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </nav>
          <div className="absolute bottom-1.5 left-1/2 h-1 w-28 -translate-x-1/2 rounded-full bg-foreground/80" />
        </div>
      </div>
      <p className="mt-2 text-center text-[11px] text-faint">{L({ en: "Technician app — live, same APIs as the desktop", ar: "تطبيق الفني — مباشر، بنفس واجهات سطح المكتب" })}</p>
    </div>
  );
}

function Section({ title, children, className }: { title: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("border-b border-border px-4 py-3", className)}>
      <div className="label-caps mb-1.5 !text-[9px]">{title}</div>
      {children}
    </div>
  );
}

function JobTab({
  job,
  site,
  asset,
  brief,
  briefRun,
  onRunBrief,
  onReviewed,
  onCheckIn,
}: {
  job: Job;
  site: Site;
  asset: Asset;
  brief?: BriefData;
  briefRun: NarvoRun;
  onRunBrief: () => void;
  onReviewed: () => void;
  onCheckIn: () => void;
}) {
  const L = useL();
  const f = useFormat();
  const { lang } = usePrefs();
  const live = briefRun.status !== "idle";
  const text = live ? (briefRun.text.main ?? "") : (brief?.text ?? "");
  const parts = ((live ? briefRun.data.parts : brief?.parts) as PartAvailability[]) ?? [];
  const citations = ((live ? briefRun.data.citations : brief?.citations) as Citation[]) ?? [];
  const reviewed = job.prepMode === "ai" && job.prepMinutes != null;
  return (
    <div>
      <Section title={L({ en: "Today", ar: "اليوم" })}>
        <div className="text-[13.5px] leading-snug font-medium" dir="auto">
          {lang === "ar" ? job.title_ar : job.title}
        </div>
        <div className="mt-1 text-[11.5px] text-muted-foreground">
          {lang === "ar" ? site.name_ar : site.name} · {f.date(job.scheduledFor, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {job.priority}
        </div>
        <p className="mt-2 text-[12px] leading-relaxed" dir="auto">
          {lang === "ar" ? job.symptom_ar : job.symptom}
        </p>
        <div className="mt-2 font-mono text-[10.5px] text-muted-foreground">
          {asset.id} · {asset.model} · {asset.location}
        </div>
      </Section>
      <Section title={L({ en: "Brief", ar: "الملخص" })}>
        {!text && !briefRun.running ? (
          <RunButton size="sm" running={briefRun.running} onRun={onRunBrief} className="w-full">
            {L({ en: "Prepare my brief", ar: "أعدّ ملخصي" })}
          </RunButton>
        ) : text ? (
          <Markdown citations={citations} streaming={briefRun.running} className="text-[12px] [&_h3]:!text-[12.5px]">
            {text}
          </Markdown>
        ) : (
          <ThinkingLines lines={5} />
        )}
      </Section>
      {parts.length > 0 && (
        <Section title={L({ en: "Bring", ar: "أحضر معك" })}>
          <PartsTable parts={parts} compact />
        </Section>
      )}
      {text && !briefRun.running && (
        <div className="space-y-2 px-4 py-3">
          <Button size="sm" variant={reviewed ? "outline" : "default"} className="w-full" disabled={reviewed} onClick={onReviewed}>
            <CircleCheck />
            {reviewed ? L({ en: `Brief reviewed · ${job.prepMinutes} min prep`, ar: `تمت المراجعة · ${job.prepMinutes} دقيقة تحضير` }) : L({ en: "Mark brief reviewed", ar: "تمت مراجعة الملخص" })}
          </Button>
          <Button size="sm" variant="outline" className="w-full" disabled={job.status === "in_progress" || job.status === "awaiting_review" || job.status === "completed"} onClick={onCheckIn}>
            {job.status === "in_progress" ? L({ en: "Checked in on site", ar: "تم تسجيل الوصول" }) : L({ en: "Check in on site", ar: "تسجيل الوصول للموقع" })}
          </Button>
        </div>
      )}
    </div>
  );
}

function AskTab({ job }: { job: Job }) {
  const L = useL();
  const { lang } = usePrefs();
  const run = useNarvoRun();
  const [turns, setTurns] = useState<Array<{ q: string; a: string; citations: Citation[] }>>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [voiceOut, setVoiceOut] = useState(true);
  const [typed, setTyped] = useState("");
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (run.status === "done" && pending) {
      const a = run.text.main ?? "";
      setTurns((t) => [...t, { q: pending, a, citations: (run.data.citations as Citation[]) ?? [] }]);
      setPending(null);
      if (voiceOut && a) speak(a, /[؀-ۿ]/.test(a) ? "ar" : "en");
    }
  }, [run.status, run.text.main, run.data.citations, pending, voiceOut]);
  useEffect(() => () => stopSpeaking(), []);
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [turns.length, run.text.main]);

  function ask(q: string) {
    if (!q.trim() || run.running) return;
    stopSpeaking();
    setPending(q.trim());
    run.start("/api/solutions/19-field-service/ask", {
      question: q.trim(),
      jobId: job.id,
      history: turns.slice(-2).flatMap((t) => [
        { role: "user", content: t.q },
        { role: "assistant", content: t.a },
      ]),
    });
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex-1 space-y-3 px-4 py-3">
        {turns.length === 0 && !pending && (
          <div className="space-y-2">
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              {L({ en: "Hands busy? Tap the mic and ask. Answers come only from approved manuals and procedures, with sources.", ar: "يداك مشغولتان؟ اضغط الميكروفون واسأل. الإجابات من الأدلة والإجراءات المعتمدة فقط، مع المصادر." })}
            </p>
            {ASK_SUGGESTIONS.map((s) => (
              <button key={s.en} type="button" onClick={() => ask(L(s))} className="block w-full rounded-lg border border-border px-3 py-2 text-start text-[12px] hover:border-ai/40" dir="auto">
                {L(s)}
              </button>
            ))}
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className="space-y-1.5">
            <div className="ms-auto w-fit max-w-[85%] rounded-2xl rounded-ee-sm bg-foreground px-3 py-2 text-[12.5px] text-background" dir="auto">
              {t.q}
            </div>
            <div className="max-w-[95%] rounded-2xl rounded-es-sm border border-border bg-card px-3 py-2">
              <Markdown citations={t.citations} className="text-[12.5px]">
                {t.a}
              </Markdown>
              <button type="button" onClick={() => speak(t.a, /[؀-ۿ]/.test(t.a) ? "ar" : "en")} className="mt-1 inline-flex items-center gap-1 text-[10.5px] text-muted-foreground hover:text-ai">
                <Volume2 className="size-3" /> {L({ en: "Play", ar: "تشغيل" })}
              </button>
            </div>
          </div>
        ))}
        {pending && (
          <div className="space-y-1.5">
            <div className="ms-auto w-fit max-w-[85%] rounded-2xl rounded-ee-sm bg-foreground px-3 py-2 text-[12.5px] text-background" dir="auto">
              {pending}
            </div>
            <div className="max-w-[95%] rounded-2xl rounded-es-sm border border-border bg-card px-3 py-2">
              {run.text.main ? (
                <Markdown citations={(run.data.citations as Citation[]) ?? []} streaming={run.running} className="text-[12.5px]">
                  {run.text.main}
                </Markdown>
              ) : run.status === "error" ? (
                <span className="text-[12px] text-danger">{run.error}</span>
              ) : (
                <span className="shimmer-text text-[12px]">{run.trace.filter((x) => x.status === "running").map((x) => x.label).pop() ?? L({ en: "Searching manuals…", ar: "البحث في الأدلة…" })}</span>
              )}
            </div>
          </div>
        )}
        <div ref={end} />
      </div>
      <div className="sticky bottom-0 space-y-2 border-t border-border bg-background/95 px-4 pt-3 pb-3 backdrop-blur">
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => setVoiceOut((v) => !v)} className="flex items-center gap-1 text-[11px] text-muted-foreground">
            {voiceOut ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
            {voiceOut ? L({ en: "Read answers aloud", ar: "قراءة الإجابات بصوت" }) : L({ en: "Muted", ar: "صامت" })}
          </button>
          <span className="text-[10.5px] text-faint">{lang === "ar" ? "AR" : "EN"}</span>
        </div>
        <VoiceButton size="md" disabled={run.running} onTranscript={(t) => ask(t.text)} onError={(m) => toast.error(m)} />
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            ask(typed);
            setTyped("");
          }}
        >
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={L({ en: "or type…", ar: "أو اكتب…" })} className="h-8 text-[12px]" />
          <Button size="sm" type="submit" disabled={!typed.trim() || run.running}>
            {L({ en: "Ask", ar: "اسأل" })}
          </Button>
        </form>
      </div>
    </div>
  );
}

function VisitTab({
  job,
  reportRun,
  onGenerate,
  samplePhotos,
}: {
  job: Job;
  reportRun: NarvoRun;
  onGenerate: (notes: string, photos: Array<{ dataUrl: string; caption: string; phase: string }>) => void;
  samplePhotos: Array<{ src: string; caption: string; phase: string }>;
}) {
  const L = useL();
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<Array<{ dataUrl: string; caption: string; phase: string }>>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const draft = reportRun.data.draft as { completeness: Completeness; followUps: Array<{ description: string; partStatus: string; targetDate: string }> } | undefined;
  useEffect(() => {
    setNotes("");
    setPhotos([]);
  }, [job.id]);

  async function addSample(p: { src: string; caption: string; phase: string }) {
    const blob = await (await fetch(p.src)).blob();
    const dataUrl = await toDataUrl(blob);
    setPhotos((x) => [...x, { dataUrl, caption: p.caption, phase: p.phase }].slice(0, 4));
  }

  return (
    <div className="space-y-0">
      <Section title={L({ en: "Visit notes", ar: "ملاحظات الزيارة" })}>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={L({ en: "Dictate or type what you found, readings, what you did, parts used, what is still open…", ar: "أملِ أو اكتب ما وجدته والقراءات وما نفذته والقطع المستخدمة وما بقي مفتوحاً…" })} className="min-h-[150px] text-[12px]" dir="auto" />
        <div className="mt-2 flex items-center justify-between gap-2">
          <VoiceButton size="md" onTranscript={(t) => setNotes((n) => (n ? `${n}\n${t.text}` : t.text))} onError={(m) => toast.error(m)} />
          <Button size="xs" variant="outline" onClick={() => setNotes(ARUN_NOTE)}>
            <FileText /> {L({ en: "Arun's dictated note", ar: "ملاحظة أرون المسجلة" })}
          </Button>
        </div>
      </Section>
      <Section title={L({ en: "Photos", ar: "الصور" })}>
        <div className="grid grid-cols-4 gap-1.5">
          {photos.map((p, i) => (
            <div key={i} className="group relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.dataUrl} alt="" className="aspect-square w-full rounded object-cover" />
              <span className="absolute start-1 bottom-1 rounded bg-foreground/70 px-1 text-[9px] text-background">{p.phase}</span>
              <button type="button" onClick={() => setPhotos((x) => x.filter((_, k) => k !== i))} className="absolute end-0.5 top-0.5 rounded-full bg-foreground/70 p-0.5 text-background">
                <X className="size-2.5" />
              </button>
            </div>
          ))}
          {photos.length < 4 && (
            <button type="button" onClick={() => fileInput.current?.click()} className="flex aspect-square flex-col items-center justify-center gap-1 rounded border border-dashed border-border-strong text-[10px] text-muted-foreground hover:border-ai/50">
              <Camera className="size-4" />
              {L({ en: "Add", ar: "إضافة" })}
            </button>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            const dataUrl = await toDataUrl(file);
            setPhotos((x) => [...x, { dataUrl, caption: file.name.replace(/\.[^.]+$/, ""), phase: x.length === 0 ? "before" : "after" }].slice(0, 4));
          }}
        />
        {samplePhotos.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {samplePhotos.map((p) => (
              <button key={p.src} type="button" onClick={() => addSample(p)} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10.5px] text-muted-foreground hover:border-ai/40 hover:text-foreground">
                <ImagePlus className="size-3" />
                {p.caption}
              </button>
            ))}
          </div>
        )}
      </Section>
      <div className="space-y-2 px-4 py-3">
        <RunButton running={reportRun.running} onRun={() => onGenerate(notes, photos)} disabled={notes.trim().length < 20} className="w-full">
          {L({ en: "Create service report", ar: "إنشاء تقرير الخدمة" })}
        </RunButton>
        <p className="text-[10.5px] leading-snug text-faint">
          {L({ en: "By sending, you sign the technician declaration. Your supervisor reviews before anything is shared with the client.", ar: "بالإرسال توقّع إقرار الفني. يراجع المشرف التقرير قبل مشاركته مع العميل." })}
        </p>
        {reportRun.running && (
          <div className="space-y-1">
            {reportRun.trace.map((t) => (
              <div key={t.id} className={cn("text-[11px]", t.status === "running" ? "shimmer-text" : "text-muted-foreground")}>
                {t.status === "done" ? "✓ " : "· "}
                {t.label}
              </div>
            ))}
          </div>
        )}
        {reportRun.status === "error" && <div className="rounded-md bg-danger-soft p-2 text-[11.5px] text-danger">{reportRun.error}</div>}
        {draft && (
          <div className="space-y-2 rounded-lg border border-border bg-card p-3">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium">{L({ en: "Sent to supervisor", ar: "أُرسل إلى المشرف" })}</span>
              <span className={cn("num text-[15px] font-light", draft.completeness.pass ? "text-success" : "text-warning")}>{draft.completeness.total}%</span>
            </div>
            {draft.followUps.map((u, i) => (
              <div key={i} className="rounded-md border border-warning/30 bg-warning-soft/60 p-2 text-[11.5px]">
                <div className="font-medium text-warning">{L({ en: "Still open", ar: "ما زال مفتوحاً" })}</div>
                <div dir="auto">{u.description}</div>
                <div className="text-muted-foreground">
                  {u.partStatus} · {L({ en: "target", ar: "المستهدف" })} {u.targetDate}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
