"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Markdown } from "@/components/narvo/markdown";
import { ThinkingLines } from "@/components/narvo/empty";
import { useL } from "@/lib/i18n";

interface DocPayload {
  id: string;
  title: string;
  ref?: string;
  type?: string;
  date?: string;
  body: string;
}

/** Read-only viewer for an evidence-library document or the RFP. */
export function DocDialog({ docId, onClose, endpoint }: { docId: string | null; onClose: () => void; endpoint: string }) {
  const L = useL();
  const [doc, setDoc] = useState<DocPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!docId) return;
    setDoc(null);
    setError(null);
    fetch(`${endpoint}?id=${encodeURIComponent(docId)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json();
      })
      .then(setDoc)
      .catch((e) => setError((e as Error).message));
  }, [docId, endpoint]);

  return (
    <Dialog open={!!docId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-[min(920px,94vw)] overflow-hidden p-0 sm:max-w-[min(920px,94vw)]">
        <DialogTitle className="border-b border-border px-5 py-3.5">
          <div className="label-caps">{doc?.ref ?? docId}</div>
          <div className="mt-1 text-[16px] font-light tracking-tight">{doc?.title ?? L({ en: "Loading…", ar: "جارٍ التحميل…" })}</div>
        </DialogTitle>
        <div className="scrollbar-thin max-h-[76vh] overflow-auto px-6 py-5">
          {error ? <p className="text-[12.5px] text-danger">{error}</p> : doc ? <Markdown>{doc.body}</Markdown> : <ThinkingLines lines={8} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
