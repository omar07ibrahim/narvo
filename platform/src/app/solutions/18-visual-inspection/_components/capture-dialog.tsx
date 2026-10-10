"use client";

import { useState } from "react";
import { Camera } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useL, usePrefs } from "@/lib/i18n";
import type { Contractor, Inspection, InspectionState } from "../_lib/types";
import { PhotoInput } from "./photo-input";

export function CaptureDialog({ contractors, plots, onCreated }: { contractors: Contractor[]; plots: string[]; onCreated: (insp: Inspection, state: InspectionState) => void }) {
  const L = useL();
  const { lang } = usePrefs();
  const [open, setOpen] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [plot, setPlot] = useState("");
  const [contractor, setContractor] = useState(contractors[0]?.name ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const plotOk = !plot || /^MN-\d{2}-\d{3}-\d{4}$/i.test(plot.trim());

  async function create() {
    setBusy(true);
    try {
      const res = await fetch("/api/solutions/18-visual-inspection/inspections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photo, plot, contractor, note, caption: note || "Field capture" }),
      });
      if (!res.ok) throw new Error(await res.text());
      const j = await res.json();
      onCreated(j.inspection, j.state);
      setOpen(false);
      setPhoto(null);
      setNote("");
      toast.success(L({ en: "Inspection created — run the vision screening", ar: "أُنشئ التفتيش — شغّل الفحص البصري" }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Camera /> {L({ en: "Capture", ar: "التقاط" })}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-medium">{L({ en: "New field capture", ar: "التقاط ميداني جديد" })}</DialogTitle>
          <DialogDescription className="text-[12px]">
            {L({ en: "Take a photo with the device camera or upload one. The image stays on this platform.", ar: "التقط صورة بكاميرا الجهاز أو حمّلها. تبقى الصورة داخل المنصة." })}
          </DialogDescription>
        </DialogHeader>
        {open && <PhotoInput value={photo} onChange={setPhoto} />}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="label-caps !text-[9.5px]">{L({ en: "Plot", ar: "القطعة" })}</span>
            <Input list="ins-plots" value={plot} onChange={(e) => setPlot(e.target.value.toUpperCase())} placeholder="MN-08-204-0012" className="h-8 font-mono text-[12px]" aria-invalid={!plotOk} />
            <datalist id="ins-plots">
              {plots.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </label>
          <label className="space-y-1">
            <span className="label-caps !text-[9.5px]">{L({ en: "Main contractor", ar: "المقاول الرئيسي" })}</span>
            <Select value={contractor} onValueChange={setContractor}>
              <SelectTrigger size="sm" className="w-full text-[12px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {contractors.map((c) => (
                  <SelectItem key={c.name} value={c.name}>
                    {lang === "ar" ? c.name_ar : c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="label-caps !text-[9.5px]">{L({ en: "Location / note", ar: "الموقع / ملاحظة" })}</span>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={L({ en: "e.g. Level 3 east perimeter, facing north", ar: "مثال: الطابق الثالث، المحيط الشرقي، باتجاه الشمال" })} className="h-8 text-[12px]" />
          </label>
        </div>
        <div className="flex justify-end">
          <Button onClick={create} disabled={!photo || !plotOk || busy}>
            {L({ en: "Create inspection", ar: "إنشاء التفتيش" })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
