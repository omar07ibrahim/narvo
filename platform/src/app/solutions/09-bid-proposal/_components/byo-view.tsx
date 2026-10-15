"use client";

import { useState } from "react";
import { FileSearch } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FileDrop } from "@/components/narvo/file-drop";
import { RunButton } from "@/components/narvo/run-button";
import { EmptyState } from "@/components/narvo/empty";
import { MetricTile } from "@/components/narvo/metric";
import type { NarvoRun } from "@/hooks/use-narvo-run";
import { useFormat, useL } from "@/lib/i18n";
import { coverageStats } from "../_lib/compliance";
import type { ByoState, Coverage, Requirement } from "../_lib/types";
import { CoverageView } from "./coverage-view";

export function ByoView({
  byo,
  liveReqs,
  liveCoverage,
  extractRun,
  mapRun,
  onRun,
  onOpenDoc,
}: {
  byo: ByoState | null;
  liveReqs?: Requirement[];
  liveCoverage?: Record<string, Coverage>;
  extractRun: NarvoRun;
  mapRun: NarvoRun;
  onRun: (name: string, text: string) => void;
  onOpenDoc: (id: string) => void;
}) {
  const L = useL();
  const f = useFormat();
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const reqs = liveReqs ?? byo?.requirements ?? [];
  const cov = liveCoverage ?? byo?.coverage ?? {};
  const stats = coverageStats(reqs, cov);
  const busy = extractRun.running || mapRun.running;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[minmax(0,1fr)_280px] gap-4 max-lg:grid-cols-1">
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={L({ en: "Tender name or reference", ar: "اسم المناقصة أو مرجعها" })} className="h-8 text-[12.5px]" />
          </div>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={L({
              en: "Paste the text of another RFP or RFQ — NARVO extracts its requirements and maps them against the same Raseen FM evidence library.",
              ar: "الصق نص كراسة شروط أو طلب عروض أخرى — يستخرج نارفو متطلباتها ويربطها بمكتبة أدلة رصين ذاتها.",
            })}
            className="min-h-36 text-[12.5px]"
            dir="auto"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="num text-[11px] text-muted-foreground">
              {text.length.toLocaleString("en")} {L({ en: "characters", ar: "حرفاً" })}
            </span>
            <RunButton running={busy} disabled={text.trim().length < 200 || busy} onRun={() => onRun(name || L({ en: "Uploaded RFP", ar: "كراسة شروط مرفوعة" }), text)} size="sm" icon={<FileSearch />}>
              {L({ en: "Extract & map evidence", ar: "استخراج وربط الأدلة" })}
            </RunButton>
          </div>
        </div>
        <FileDrop
          accept=".txt,.md,.csv,.json"
          label={L({ en: "Drop an RFP text file", ar: "أسقط ملف نص كراسة الشروط" })}
          hint={L({ en: ".md or .txt — processed on your own servers", ar: ".md أو .txt — تتم المعالجة على خوادم الجهة" })}
          onFiles={(files) => {
            const fl = files[0];
            if (!fl?.text) {
              toast.error(L({ en: "Please use a text file (.md / .txt) or paste the text", ar: "يرجى استخدام ملف نصي أو لصق النص" }));
              return;
            }
            setText(fl.text);
            if (!name) setName(fl.name.replace(/\.[^.]+$/, ""));
          }}
          className="h-full items-start"
        />
      </div>

      {reqs.length > 0 && (
        <div className="grid grid-cols-4 gap-3 max-md:grid-cols-2">
          <MetricTile label={L({ en: "Requirements", ar: "المتطلبات" })} value={stats.total} sub={byo?.name} />
          <MetricTile label={L({ en: "Evidenced", ar: "مستوفى" })} value={`${stats.pct}%`} tone="ai" sub={`${stats.met}/${stats.total}`} />
          <MetricTile label={L({ en: "Partial", ar: "جزئي" })} value={stats.partial} tone={stats.partial ? "warning" : "default"} />
          <MetricTile
            label={L({ en: "Missing", ar: "مفقود" })}
            value={stats.missing}
            tone={stats.missing ? "danger" : "default"}
            sub={byo?.at ? f.relative(byo.at) : undefined}
          />
        </div>
      )}

      <CoverageView
        requirements={reqs}
        coverage={cov}
        running={mapRun.running}
        onOpenDoc={onOpenDoc}
        empty={
          !busy && (
            <EmptyState icon={<FileSearch className="size-4" />} title={L({ en: "Bring your own tender", ar: "أحضر مناقصتك الخاصة" })}>
              {L({
                en: "The same extraction and evidence-mapping pipeline runs on any RFP you paste or drop here.",
                ar: "يعمل مسار الاستخراج وربط الأدلة ذاته على أي كراسة شروط تلصقها أو تسقطها هنا.",
              })}
            </EmptyState>
          )
        }
      />
    </div>
  );
}
