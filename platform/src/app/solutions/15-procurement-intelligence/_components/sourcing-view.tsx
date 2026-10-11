"use client";

import { useState } from "react";
import { ClipboardList, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RunButton } from "@/components/narvo/run-button";
import { VoiceButton } from "@/components/narvo/voice";
import { SourceList } from "@/components/narvo/sources";
import { StatusPill } from "@/components/narvo/status";
import { EmptyState, ThinkingLines } from "@/components/narvo/empty";
import type { NarvoRun } from "@/hooks/use-narvo-run";
import { useFormat, useL } from "@/lib/i18n";
import { procurementMethod } from "../_lib/scoring";
import type { Rfq } from "../_lib/types";

const EXAMPLES = [
  { en: "Pest control for the five community centres, monthly treatments, 2 years", ar: "مكافحة الآفات للمراكز المجتمعية الخمسة، معالجة شهرية، لمدة سنتين", estimate: 186000 },
  { en: "صيانة أنظمة الإنذار من الحريق في مراكز سعادة المتعاملين الثلاثة لمدة سنة", ar: "صيانة أنظمة الإنذار من الحريق في مراكز سعادة المتعاملين الثلاثة لمدة سنة", estimate: 74500 },
];

export function SourcingView({ run, rfqs, onRun, onSave }: { run: NarvoRun; rfqs: Rfq[]; onRun: (need: string, estimate: number | null) => void; onSave: (rfq: Rfq) => Promise<void> }) {
  const L = useL();
  const f = useFormat();
  const [need, setNeed] = useState("");
  const [est, setEst] = useState("");
  const [saving, setSaving] = useState(false);
  const estimate = est ? Number(est.replace(/[^\d.]/g, "")) : null;
  const method = procurementMethod(estimate);
  const rfq = run.data.rfq as Rfq | undefined;

  return (
    <div className="@container">
    <div className="grid grid-cols-1 gap-5 @4xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="label-caps mb-2">{L({ en: "Business need", ar: "الاحتياج" })}</div>
          <div className="flex gap-2">
            <Textarea
              value={need}
              onChange={(e) => setNeed(e.target.value)}
              placeholder={L({ en: "Describe what you need to buy, in Arabic or English…", ar: "صف ما تحتاج إلى شرائه بالعربية أو الإنجليزية…" })}
              className="min-h-20 text-[13px]"
              dir="auto"
            />
            <VoiceButton size="md" onTranscript={(t) => setNeed((n) => (n ? `${n} ${t.text}` : t.text))} onError={(m) => toast.error(m)} />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {EXAMPLES.map((e, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setNeed(i === 1 ? e.ar : L(e));
                  setEst(String(e.estimate));
                }}
                className="rounded-full border border-border px-2.5 py-1 text-[11.5px] text-muted-foreground hover:border-border-strong hover:text-foreground"
                dir="auto"
              >
                {i === 1 ? e.ar : L(e)}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div>
              <div className="mb-1 text-[11.5px] text-muted-foreground">{L({ en: "Estimated value (AED, excl. VAT)", ar: "القيمة التقديرية (درهم، دون الضريبة)" })}</div>
              <Input value={est} onChange={(e) => setEst(e.target.value)} inputMode="numeric" placeholder="186,000" className="num h-8 w-44 text-[12.5px]" />
            </div>
            <div className="min-w-[220px] flex-1 text-[12px]">
              {method ? (
                <div>
                  <span className="font-medium">{L(method.label)}</span> <span className="text-muted-foreground">· {L(method.rule)}</span>
                  <div className="text-[11px] text-muted-foreground">
                    {L({ en: "Approval", ar: "الاعتماد" })}: {L(method.approver)}
                  </div>
                </div>
              ) : (
                <span className="text-muted-foreground">{L({ en: "Method is computed from the estimate (Manual Art. 10).", ar: "تُحسب طريقة الشراء من القيمة التقديرية (المادة 10)." })}</span>
              )}
            </div>
            <RunButton running={run.running} disabled={need.trim().length < 8} onRun={() => onRun(need, estimate)} icon={<ClipboardList />}>
              {L({ en: "Draft RFQ", ar: "صياغة طلب العروض" })}
            </RunButton>
          </div>
        </div>

        {run.running && !rfq ? (
          <div className="rounded-lg border border-border bg-card p-5">
            <ThinkingLines lines={8} />
          </div>
        ) : rfq ? (
          <article className="rounded-lg border border-border bg-card">
            <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div className="min-w-0">
                <div className="label-caps">{L({ en: "RFQ draft", ar: "مسودة طلب عروض" })}</div>
                <h3 className="mt-1 text-[17px] font-light tracking-tight" dir="auto">
                  {rfq.title}
                </h3>
                <p className="mt-1 text-[12.5px] text-muted-foreground" dir="auto">
                  {rfq.objective}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                {rfq.method ? <StatusPill tone="ai">{L(rfq.method.label)}</StatusPill> : <StatusPill>{L({ en: "Method not set", ar: "الطريقة غير محددة" })}</StatusPill>}
                {rfq.estimate && <span className="num text-[11.5px] text-muted-foreground">{f.aed(rfq.estimate)}</span>}
                <Button
                  size="sm"
                  disabled={saving}
                  onClick={async () => {
                    setSaving(true);
                    try {
                      await onSave(rfq);
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  <Save /> {L({ en: "Save to sourcing register", ar: "حفظ في سجل التوريد" })}
                </Button>
              </div>
            </header>
            <div className="grid grid-cols-1 gap-5 px-5 py-4 @2xl:grid-cols-2">
              <Block title={L({ en: "Scope of services", ar: "نطاق الخدمات" })}>
                <ul className="list-disc space-y-1 ps-4">{rfq.scope.map((x, i) => <li key={i} dir="auto">{x}</li>)}</ul>
              </Block>
              <Block title={L({ en: "Requirements", ar: "المتطلبات" })}>
                <ul className="space-y-1">
                  {rfq.requirements.map((r) => (
                    <li key={r.id} className="flex gap-2" dir="auto">
                      <span className="font-mono text-[10.5px] text-muted-foreground">{r.id}</span>
                      <span className="flex-1">{r.text}</span>
                      {r.mandatory && <span className="text-[9.5px] uppercase tracking-wider text-danger/80">{L({ en: "Mandatory", ar: "إلزامي" })}</span>}
                    </li>
                  ))}
                </ul>
              </Block>
              <Block title={L({ en: "Evaluation criteria (weights normalised to 100)", ar: "معايير التقييم (الأوزان معايرة إلى 100)" })}>
                <ul className="space-y-1.5">
                  {rfq.criteria.map((c, i) => (
                    <li key={i}>
                      <div className="flex items-center gap-2">
                        <span className="flex-1 font-medium" dir="auto">{c.name}</span>
                        <span className="num">{c.weight}%</span>
                      </div>
                      <div className="mt-0.5 h-1 rounded-full bg-muted">
                        <div className="h-1 rounded-full bg-ai/70" style={{ width: `${c.weight}%` }} />
                      </div>
                      <div className="mt-0.5 text-[11.5px] text-muted-foreground" dir="auto">{c.description}</div>
                    </li>
                  ))}
                </ul>
              </Block>
              <Block title={L({ en: "Submission documents & KPIs", ar: "مستندات التقديم ومؤشرات الأداء" })}>
                <ul className="list-disc space-y-1 ps-4">{rfq.submission.map((x, i) => <li key={i} dir="auto">{x}</li>)}</ul>
                <ul className="mt-2 list-disc space-y-1 ps-4 text-muted-foreground">{rfq.kpis.map((x, i) => <li key={i} dir="auto">{x}</li>)}</ul>
                <p className="mt-2 text-muted-foreground" dir="auto">
                  {L({ en: "Term", ar: "المدة" })}: {rfq.term}
                </p>
              </Block>
            </div>
          </article>
        ) : (
          <EmptyState icon={<ClipboardList className="size-4" />} title={L({ en: "From a sentence to sourcing material", ar: "من جملة إلى وثائق توريد" })}>
            {L({
              en: "Describe a need — NARVO drafts scope, measurable requirements and weighted evaluation criteria grounded in the Procurement Manual. The procurement method and approver are computed from the estimate.",
              ar: "صف الاحتياج — يصوغ نارفو النطاق والمتطلبات القابلة للقياس ومعايير التقييم الموزونة استناداً إلى دليل المشتريات. وتُحسب طريقة الشراء وجهة الاعتماد من القيمة التقديرية.",
            })}
          </EmptyState>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <div>
          <div className="label-caps mb-2">{L({ en: "Manual excerpts used", ar: "مقتطفات الدليل المستخدمة" })}</div>
          <SourceList citations={(run.data.citations as Rfq["citations"]) ?? []} />
        </div>
        <div>
          <div className="label-caps mb-2">{L({ en: "Sourcing register", ar: "سجل التوريد" })}</div>
          {rfqs.length ? (
            <ul className="divide-y divide-border rounded-md border border-border">
              {rfqs.map((r) => (
                <li key={r.id} className="px-3 py-2 text-[12px]">
                  <div className="font-mono text-[10.5px] text-muted-foreground">{r.id}</div>
                  <div className="font-medium leading-snug" dir="auto">{r.title}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {r.method ? L(r.method.label) : "—"}
                    {r.estimate ? ` · ${f.aed(r.estimate)}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12px] text-muted-foreground">{L({ en: "Saved RFQ drafts appear here.", ar: "تظهر مسودات طلبات العروض المحفوظة هنا." })}</p>
          )}
        </div>
      </div>
    </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="text-[12.5px] leading-relaxed">
      <div className="label-caps mb-1.5">{title}</div>
      {children}
    </section>
  );
}
