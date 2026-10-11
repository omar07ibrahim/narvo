"use client";

import { useMemo, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FileSpreadsheet } from "lucide-react";
import { useNarvoRun } from "@/hooks/use-narvo-run";
import { AgentTrace } from "@/components/narvo/agent-trace";
import { FileDrop } from "@/components/narvo/file-drop";
import { Markdown } from "@/components/narvo/markdown";
import { Pane } from "@/components/narvo/pane";
import { EmptyState, ThinkingLines } from "@/components/narvo/empty";
import { CHART, ChartTooltip, axisProps, gridProps } from "@/components/narvo/chart";
import { Button } from "@/components/ui/button";
import { useFormat, useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { ByoResult } from "../_lib/forecast";
import { Segmented, fmtPct } from "./bits";

export function ByoView() {
  const L = useL();
  const run = useNarvoRun();
  const [file, setFile] = useState<string | null>(null);
  const [pick, setPick] = useState(0);
  const result = run.data.byo as { fileName: string; series: Array<{ key: string } & ByoResult>; totalSeries: number } | undefined;

  function go(text: string, name: string) {
    setFile(name);
    setPick(0);
    run.start("/api/solutions/17-demand-planning/byo", { csv: text, fileName: name });
  }
  async function sample() {
    const res = await fetch("/demo/17-demand-planning/al-noor-branch-daily-sales.csv");
    go(await res.text(), "al-noor-branch-daily-sales.csv");
  }

  const s = result?.series[pick];
  return (
    <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <Pane title={L({ en: "Your data", ar: "بياناتك" })}>
          <FileDrop
            accept=".csv,.txt"
            label={L({ en: "Upload a CSV — date, value[, sku]", ar: "حمّل ملف CSV — التاريخ، القيمة[، الصنف]" })}
            hint={L({ en: "Daily, weekly or monthly; up to 4 series are forecast. Processed on this machine.", ar: "يومي أو أسبوعي أو شهري؛ حتى 4 سلاسل. تتم المعالجة على هذا الجهاز." })}
            onFiles={(files) => {
              const f0 = files[0];
              if (f0?.text) go(f0.text, f0.name);
            }}
          />
          <div className="mt-3 flex items-center justify-between gap-2 text-[11.5px] text-muted-foreground">
            <span>{L({ en: "No file to hand?", ar: "لا يوجد ملف؟" })}</span>
            <Button size="xs" variant="outline" onClick={sample} disabled={run.running}>
              <FileSpreadsheet /> {L({ en: "Al Noor branch daily sales (sample)", ar: "مبيعات فرع النور اليومية (عينة)" })}
            </Button>
          </div>
        </Pane>
        <Pane title={L({ en: "Pipeline", ar: "مسار المعالجة" })}>
          <AgentTrace run={run} emptyHint={L({ en: "Parse → detect frequency → fit Holt-Winters → backtest vs naive → planner notes.", ar: "قراءة ← تحديد التكرار ← ملاءمة هولت-وينترز ← اختبار رجعي مقابل النموذج البسيط ← ملاحظات المخطِّط." })} />
        </Pane>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        {!result && !run.running && run.status !== "error" && (
          <div className="rounded-lg border border-border bg-card">
            <EmptyState icon={<FileSpreadsheet className="size-4" />} title={L({ en: "Forecast any series in seconds", ar: "توقّع أي سلسلة خلال ثوانٍ" })}>
              {L({
                en: "The same engine that plans RBM's 24 SKU-warehouse series fits your data, backtests it against a naive baseline and shows the P10–P90 range.",
                ar: "المحرك نفسه الذي يخطط لسلاسل رصين الـ24 يلائم بياناتك، ويختبرها رجعياً مقابل نموذج بسيط، ويعرض نطاق P10–P90.",
              })}
            </EmptyState>
          </div>
        )}
        {run.running && !result && (
          <Pane title={file ?? ""}>
            <ThinkingLines lines={6} />
          </Pane>
        )}
        {run.status === "error" && !result && (
          <div className="rounded-lg border border-danger/25 bg-danger-soft p-4 text-[12.5px] text-danger">{run.error}</div>
        )}
        {result && s && (
          <>
            <Pane
              title={result.fileName}
              subtitle={`${L({
                en: s.method,
                ar: s.seasonLength > 1 ? `هولت-وينترز (ضربي، اتجاه مخمَّد، موسم ${s.seasonLength})` : "هولت باتجاه مخمَّد (السلسلة أقصر من أن تُظهر موسمية)",
              })} · ${s.periods} ${L({ en: s.frequency === "weekly" ? "weeks" : "months", ar: s.frequency === "weekly" ? "أسبوعاً" : "شهراً" })}${result.totalSeries > result.series.length ? ` · ${L({ en: `top ${result.series.length} of ${result.totalSeries} series`, ar: `أعلى ${result.series.length} من ${result.totalSeries} سلسلة` })}` : ""}`}
              actions={
                result.series.length > 1 && (
                  <Segmented value={pick} onChange={setPick} options={result.series.map((x, i) => ({ value: i, label: x.key }))} />
                )
              }
            >
              <ByoChart r={s} />
              <div className="mt-3 grid grid-cols-3 gap-2 rounded-md border border-border bg-surface p-2.5 text-center">
                <Stat label="NARVO MAPE" value={fmtPct(s.mape)} good={s.mape < s.naiveMape} />
                <Stat label={L({ en: "Naive MAPE", ar: "خطأ النموذج البسيط" })} value={fmtPct(s.naiveMape)} />
                <Stat label={L({ en: "P10–P90 coverage", ar: "تغطية P10–P90" })} value={fmtPct(s.coverage, 0)} />
              </div>
            </Pane>
            <Pane title={L({ en: "Planner notes", ar: "ملاحظات المخطِّط" })}>
              {run.text.main ? <Markdown streaming={run.running}>{run.text.main}</Markdown> : <ThinkingLines lines={3} />}
            </Pane>
          </>
        )}
      </div>
    </div>
  );

  function Stat({ label, value, good }: { label: string; value: string; good?: boolean }) {
    return (
      <div>
        <div className="label-caps !text-[9px]">{label}</div>
        <div className={cn("num mt-1 text-[18px] font-light", good && "text-ai")}>{value}</div>
      </div>
    );
  }
}

function ByoChart({ r }: { r: ByoResult }) {
  const f = useFormat();
  const L = useL();
  const data = useMemo(() => {
    const bt = new Map(r.backtest.map((b) => [b.t, b]));
    const hist = r.history.slice(-104).map((h) => ({ t: h.t, actual: h.v, bt: bt.get(h.t)?.model }));
    const last = hist[hist.length - 1];
    return [
      ...hist.slice(0, -1),
      { ...last, p50: last.actual, band: [last.actual, last.actual] },
      ...r.forecast.map((x) => ({ t: x.t, p50: x.p50, band: [x.p10, x.p90] })),
    ];
  }, [r]);
  return (
    <div className="h-[280px]" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="t" {...axisProps} tickFormatter={(t) => f.date(t, { month: "short", year: "2-digit" })} minTickGap={40} />
          <YAxis {...axisProps} width={52} tickFormatter={(v) => (v >= 10000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)))} />
          <Tooltip
            content={({ active, payload, label }) => (
              <ChartTooltip
                active={active}
                label={label ? f.date(String(label)) : undefined}
                payload={(payload ?? []).filter((p) => !Array.isArray(p.value)).map((p) => ({ name: String(p.name), value: p.value as number, color: p.color as string }))}
                format={(v) => f.number(Number(v), { maximumFractionDigits: 1 })}
              />
            )}
          />
          <Area dataKey="band" stroke="none" fill={CHART.ai} fillOpacity={0.14} isAnimationActive={false} />
          <Line dataKey="actual" name={L({ en: "Actual", ar: "فعلي" })} stroke={CHART.ink} strokeWidth={1.2} dot={false} isAnimationActive={false} />
          <Line dataKey="bt" name={L({ en: "Backtest", ar: "اختبار رجعي" })} stroke={CHART.ai} strokeWidth={1.3} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
          <Line dataKey="p50" name="P50" stroke={CHART.ai} strokeWidth={1.8} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
