"use client";

import { useState } from "react";
import { Check, PenLine, Plus, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { Confidence, StatusPill } from "@/components/narvo/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { useL, usePrefs } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { REJECT_REASONS, type Finding, type Inspection, type InspectionState, type Taxonomy } from "../_lib/types";
import { SEV_COLOR, SeverityPill } from "./ui";
import { useTr } from "./names";

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/solutions/18-visual-inspection/findings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as { state: InspectionState };
}

export function FindingsPanel({
  insp,
  findings,
  tax,
  activeId,
  onHover,
  locked,
  onState,
  drawMode,
  setDrawMode,
  draft,
  setDraft,
  photo,
}: {
  insp: Inspection;
  findings: Finding[];
  tax: Taxonomy;
  activeId: string | null;
  onHover: (id: string | null) => void;
  locked: boolean;
  onState: (s: InspectionState) => void;
  drawMode: boolean;
  setDrawMode: (v: boolean) => void;
  draft: [number, number, number, number] | null;
  setDraft: (b: [number, number, number, number] | null) => void;
  photo: number;
}) {
  const L = useL();
  const tr = useTr();
  const { lang } = usePrefs();
  const [busy, setBusy] = useState<string | null>(null);
  const [addCode, setAddCode] = useState<string>("D05");
  const [addText, setAddText] = useState("");
  const visible = findings.filter((f) => f.status !== "superseded");
  const reviewer = insp.inspector.name;

  async function act(id: string, body: Record<string, unknown>) {
    setBusy(id);
    try {
      const r = await post({ ...body, reviewer });
      onState(r.state);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function addMissed() {
    setBusy("add");
    try {
      const d = tax.defects.find((x) => x.code === addCode)!;
      const r = await post({ action: "add", inspectionId: insp.id, photo, code: addCode, title: lang === "ar" ? d.name_ar : d.name, description: addText, bbox: draft, reviewer });
      onState(r.state);
      setDraft(null);
      setDrawMode(false);
      setAddText("");
      toast.success(L({ en: "Missed defect added — counted in the missed-defect KPI", ar: "أُضيف العيب الفائت — يُحتسب في مؤشر العيوب الفائتة" }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2">
      {visible.length === 0 && !drawMode && (
        <p className="py-3 text-[12px] text-muted-foreground">
          {L({ en: "No findings yet — run the vision screening or add a defect manually.", ar: "لا توجد ملاحظات بعد — شغّل الفحص البصري أو أضف عيباً يدوياً." })}
        </p>
      )}
      <ul className="space-y-2">
        {visible.map((f) => {
          const d = tax.defects.find((x) => x.code === f.code)!;
          const active = activeId === f.id;
          return (
            <li
              key={f.id}
              onMouseEnter={() => onHover(f.id)}
              onMouseLeave={() => onHover(null)}
              className={cn(
                "relative overflow-hidden rounded-md border bg-card p-3 ps-4 transition-colors",
                active ? "border-foreground/40" : "border-border",
                f.status === "rejected" && "opacity-60",
              )}
            >
              <span className="absolute inset-y-0 start-0 w-1" style={{ background: f.status === "rejected" ? "var(--border-strong)" : SEV_COLOR[d.severity] }} />
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded border border-border bg-muted px-1 font-mono text-[10.5px]">{f.code}</span>
                <HoverCard openDelay={150}>
                  <HoverCardTrigger asChild>
                    <span className="cursor-help font-mono text-[10.5px] text-muted-foreground underline decoration-dotted underline-offset-2">CSSR-2025 {d.article}</span>
                  </HoverCardTrigger>
                  <HoverCardContent className="w-96 p-3">
                    <div className="label-caps mb-1">{d.article} · {lang === "ar" ? d.name_ar : d.name}</div>
                    <p className="border-s-2 border-ai/40 ps-2 text-[12px] leading-relaxed text-muted-foreground" dir="auto">
                      {lang === "ar" ? d.requirement_ar : d.requirement}
                    </p>
                  </HoverCardContent>
                </HoverCard>
                <SeverityPill severity={d.severity} />
                {f.originalCode && <StatusPill tone="info">{L({ en: `re-coded from ${f.originalCode}`, ar: `أعيد تصنيفه من ${f.originalCode}` })}</StatusPill>}
                <span className="ms-auto">
                  {f.source === "ai" ? (
                    f.confidence != null && <Confidence value={f.confidence} />
                  ) : (
                    <StatusPill tone="ai">{L({ en: "Added by reviewer", ar: "أضافه المراجع" })}</StatusPill>
                  )}
                </span>
              </div>
              <div className="mt-1.5 text-[13px] font-medium leading-snug" dir="auto">
                {tr(f.title, f.title_ar)}
              </div>
              {f.description && (
                <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground" dir="auto">
                  {tr(f.description, f.description_ar)}
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {f.status === "proposed" && !locked && (
                  <>
                    <Button size="xs" onClick={() => act(f.id, { action: "review", id: f.id, decision: "accepted" })} disabled={!!busy}>
                      <Check /> {L({ en: "Accept", ar: "قبول" })}
                    </Button>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button size="xs" variant="outline" disabled={!!busy}>
                          <X /> {L({ en: "Reject", ar: "رفض" })}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-72 p-1.5" align="start">
                        <div className="label-caps px-2 py-1.5">{L({ en: "Reason", ar: "السبب" })}</div>
                        {REJECT_REASONS.map((r) => (
                          <button
                            key={r.code}
                            type="button"
                            onClick={() => act(f.id, { action: "review", id: f.id, decision: "rejected", reason: r.code })}
                            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-start text-[12px] hover:bg-muted"
                          >
                            <span className="font-mono text-[10.5px] text-muted-foreground">{r.code}</span>
                            {L(r)}
                          </button>
                        ))}
                      </PopoverContent>
                    </Popover>
                    <Select onValueChange={(code) => act(f.id, { action: "recode", id: f.id, code })}>
                      <SelectTrigger size="sm" className="h-6 w-auto gap-1 px-2 text-[11.5px]">
                        <PenLine className="size-3" />
                        <SelectValue placeholder={L({ en: "Change code", ar: "تغيير الرمز" })} />
                      </SelectTrigger>
                      <SelectContent>
                        {tax.defects
                          .filter((x) => x.code !== f.code)
                          .map((x) => (
                            <SelectItem key={x.code} value={x.code}>
                              {x.code} — {lang === "ar" ? x.name_ar : x.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </>
                )}
                {f.status === "accepted" && (
                  <span className="inline-flex items-center gap-1 text-[11.5px] text-success">
                    <Check className="size-3.5" /> {L({ en: "Accepted", ar: "مقبولة" })} · {tr(f.reviewer)}
                  </span>
                )}
                {f.status === "rejected" && (
                  <span className="text-[11.5px] text-muted-foreground">
                    {L({ en: "Rejected", ar: "مرفوضة" })} · {f.rejectReason} {L(REJECT_REASONS.find((r) => r.code === f.rejectReason) ?? { en: "", ar: "" })}
                  </span>
                )}
                {f.status !== "proposed" && f.source === "ai" && !locked && (
                  <Button size="xs" variant="ghost" className="ms-auto text-muted-foreground" onClick={() => act(f.id, { action: "reopen", id: f.id })} disabled={!!busy}>
                    <Undo2 /> {L({ en: "Undo", ar: "تراجع" })}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {!locked &&
        (drawMode ? (
          <div className="space-y-2 rounded-md border border-ai/30 bg-ai-soft/40 p-3">
            <div className="text-[12px] font-medium">
              {draft ? L({ en: "Box drawn — choose the code and describe it", ar: "تم رسم الإطار — اختر الرمز وصِف العيب" }) : L({ en: "Drag on the photo to box the missed defect", ar: "اسحب على الصورة لتحديد العيب الفائت" })}
            </div>
            <Select value={addCode} onValueChange={setAddCode}>
              <SelectTrigger size="sm" className="w-full text-[12px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tax.defects.map((x) => (
                  <SelectItem key={x.code} value={x.code}>
                    {x.code} — {lang === "ar" ? x.name_ar : x.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input value={addText} onChange={(e) => setAddText(e.target.value)} placeholder={L({ en: "Caption, e.g. 'timber offcuts across walkway, ground level'", ar: "وصف، مثل: «قصاصات خشب على الممر في الطابق الأرضي»" })} className="h-8 text-[12px]" />
            <div className="flex justify-end gap-1.5">
              <Button size="xs" variant="ghost" onClick={() => { setDrawMode(false); setDraft(null); }}>
                {L({ en: "Cancel", ar: "إلغاء" })}
              </Button>
              <Button size="xs" onClick={addMissed} disabled={busy === "add" || addText.trim().length < 4}>
                <Plus /> {L({ en: "Add finding", ar: "إضافة الملاحظة" })}
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" className="w-full border-dashed" onClick={() => setDrawMode(true)}>
            <Plus /> {L({ en: "Add a defect the AI missed", ar: "أضف عيباً لم يكتشفه النموذج" })}
          </Button>
        ))}
    </div>
  );
}
