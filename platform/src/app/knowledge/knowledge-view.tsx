"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Markdown } from "@/components/narvo/markdown";
import { EmptyState } from "@/components/narvo/empty";
import { StatusPill } from "@/components/narvo/status";
import { useFormat, useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface DocMeta {
  id: string;
  title: string;
  title_ar?: string;
  type?: string;
  ref?: string;
  date?: string;
  owner?: string;
  classification?: string;
  lang?: string;
  file: string;
}
interface Corpus {
  id: string;
  documents: number;
  passages: number;
  terms: number;
  docs: DocMeta[];
}
interface Hit {
  docId: string;
  title: string;
  ref?: string;
  section: string;
  text: string;
  score: number;
  corpus: string;
}

const CORPUS_LABEL: Record<string, { en: string; ar: string }> = {
  "mnda/knowledge": { en: "Marsa Al Noor Development Authority", ar: "هيئة مرسى النور للتطوير" },
  "raseen/knowledge": { en: "Raseen Group", ar: "مجموعة رصين" },
};

export function KnowledgeView() {
  const L = useL();
  const f = useFormat();
  const [corpora, setCorpora] = useState<Corpus[]>([]);
  const [active, setActive] = useState("mnda/knowledge");
  const [doc, setDoc] = useState<(DocMeta & { body: string }) | null>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [ms, setMs] = useState(0);
  const [type, setType] = useState("all");

  useEffect(() => {
    fetch("/api/knowledge")
      .then((r) => r.json())
      .then((d) => setCorpora(d.corpora));
  }, []);

  useEffect(() => {
    if (!q.trim()) {
      setHits(null);
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/knowledge?corpus=${encodeURIComponent(active)}&q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((d) => {
          setHits(d.hits);
          setMs(d.ms);
        });
    }, 200);
    return () => clearTimeout(t);
  }, [q, active]);

  const current = corpora.find((c) => c.id === active);
  const types = useMemo(() => Array.from(new Set(current?.docs.map((d) => d.type ?? "Document"))).sort(), [current]);
  const docs = (current?.docs ?? []).filter((d) => type === "all" || (d.type ?? "Document") === type);

  async function open(id: string, corpus = active) {
    const d = await fetch(`/api/knowledge?corpus=${encodeURIComponent(corpus)}&id=${encodeURIComponent(id)}`).then((r) => r.json());
    setDoc(d);
  }

  return (
    <div className="mx-auto w-full max-w-[1580px] px-6 pt-8 pb-14">
      <div className="label-caps">{L({ en: "Your data, indexed on your own servers", ar: "بياناتك، مفهرسة على خوادم الجهة" })}</div>
      <h1 className="display-title mt-2 text-[38px]">{L({ en: "Knowledge sources", ar: "مصادر المعرفة" })}</h1>

      <div className="mt-6 grid grid-cols-2 gap-4 max-md:grid-cols-1">
        {corpora.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => {
              setActive(c.id);
              setDoc(null);
              setType("all");
            }}
            className={cn(
              "rounded-lg border p-5 text-start transition-colors",
              active === c.id ? "border-foreground/60 bg-card" : "border-border bg-card/60 hover:bg-card",
            )}
          >
            <div className="text-[15px] font-medium">{L(CORPUS_LABEL[c.id] ?? { en: c.id, ar: c.id })}</div>
            <div className="mt-3 flex gap-8">
              {[
                { k: L({ en: "Documents", ar: "المستندات" }), v: c.documents },
                { k: L({ en: "Passages", ar: "المقاطع" }), v: c.passages },
                { k: L({ en: "Index terms", ar: "مصطلحات الفهرس" }), v: c.terms },
              ].map((x) => (
                <div key={x.k}>
                  <div className="label-caps">{x.k}</div>
                  <div className="num mt-1 text-[22px] font-light">{f.number(x.v)}</div>
                </div>
              ))}
            </div>
          </button>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-[440px_minmax(0,1fr)] gap-4 max-lg:grid-cols-1">
        <div className="flex min-h-[620px] flex-col rounded-lg border border-border bg-card">
          <div className="space-y-2 border-b border-border p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={L({ en: "Search in Arabic or English…", ar: "ابحث بالعربية أو الإنجليزية…" })}
                className="h-8 bg-surface ps-8 text-[12.5px]"
              />
            </div>
            {!hits && (
              <select value={type} onChange={(e) => setType(e.target.value)} className="h-8 w-full rounded-md border border-border bg-surface px-2 text-[12.5px]">
                <option value="all">{L({ en: "All document types", ar: "جميع الأنواع" })}</option>
                {types.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            )}
            {hits && (
              <div className="text-[11.5px] text-muted-foreground">
                {hits.length} {L({ en: "passages", ar: "مقاطع" })} · {ms} ms · {L({ en: "on-device index", ar: "فهرس محلي" })}
              </div>
            )}
          </div>
          <ul className="scrollbar-thin max-h-[640px] flex-1 divide-y divide-border overflow-y-auto">
            {hits
              ? hits.map((h, i) => (
                  <li key={`${h.docId}-${i}`}>
                    <button type="button" onClick={() => open(h.docId, h.corpus)} className="w-full px-4 py-3 text-start hover:bg-muted/40">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[12.5px] font-medium">{h.title}</span>
                        <span className="num shrink-0 text-[10.5px] text-faint">{h.score.toFixed(1)}</span>
                      </div>
                      <div className="mt-0.5 truncate font-mono text-[10.5px] text-muted-foreground">§ {h.section}</div>
                      <p className="mt-1 line-clamp-2 text-[11.5px] text-muted-foreground" dir="auto">
                        {h.text.replace(/[#*|]/g, " ")}
                      </p>
                    </button>
                  </li>
                ))
              : docs.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => open(d.id)}
                      className={cn("flex w-full items-start gap-3 px-4 py-3 text-start hover:bg-muted/40", doc?.id === d.id && "bg-ai-soft/50")}
                    >
                      <FileText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12.5px] font-medium" dir="auto">
                          {d.title}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[10.5px] text-muted-foreground">
                          <span className="font-mono">{d.ref ?? d.id}</span>
                          {d.lang && <span className="uppercase">{d.lang}</span>}
                          {d.date && <span>{d.date}</span>}
                        </div>
                      </div>
                      {d.classification && (
                        <StatusPill tone={d.classification === "Public" ? "neutral" : d.classification === "Internal" ? "info" : "warning"} dot={false}>
                          {d.classification}
                        </StatusPill>
                      )}
                    </button>
                  </li>
                ))}
          </ul>
        </div>

        <div className="min-h-[620px] rounded-lg border border-border bg-card">
          {!doc ? (
            <EmptyState icon={<FileText className="size-4" />} title={L({ en: "Select a document", ar: "اختر مستنداً" })}>
              {L({
                en: "These are the sources the solutions answer from — every citation in the platform points into this index.",
                ar: "هذه هي المصادر التي تجيب منها الحلول — كل استشهاد في المنصة يشير إلى هذا الفهرس.",
              })}
            </EmptyState>
          ) : (
            <div className="flex h-full flex-col">
              <div className="border-b border-border px-6 py-4">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="font-mono">{doc.ref ?? doc.id}</span>
                  {doc.type && <span>· {doc.type}</span>}
                  {doc.owner && <span>· {doc.owner}</span>}
                  {doc.date && <span>· {doc.date}</span>}
                  {doc.classification && <StatusPill tone="neutral">{doc.classification}</StatusPill>}
                </div>
                <h2 className="mt-1.5 text-[20px] font-light tracking-tight" dir="auto">
                  {doc.title}
                </h2>
                {doc.title_ar && (
                  <div className="text-[14px] text-muted-foreground" dir="rtl">
                    {doc.title_ar}
                  </div>
                )}
              </div>
              <div className="scrollbar-thin max-h-[720px] overflow-y-auto px-6 py-5">
                <Markdown>{doc.body}</Markdown>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
