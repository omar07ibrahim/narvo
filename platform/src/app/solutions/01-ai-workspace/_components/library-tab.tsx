"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, Lock, LoaderCircle, Search, TextSearch } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Workbench, Pane, KeyValue } from "@/components/narvo/pane";
import { DocumentViewer } from "@/components/narvo/document-viewer";
import { EmptyState } from "@/components/narvo/empty";
import { useFormat, useL, usePrefs } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { CLASS_LABEL, ROLES, SCOPES, accessLabel, type Classification, type LibraryDoc, type RoleKey, type ScopeKey } from "../_lib/shared";
import { ClassBadge, Segmented } from "./ui-bits";

interface Hit {
  docId: string;
  title: string;
  ref?: string;
  section: string;
  text: string;
  score: number;
  classification: Classification;
}

export function LibraryTab({ docs, role, scope }: { docs: LibraryDoc[]; role: RoleKey; scope: ScopeKey }) {
  const L = useL();
  const fmt = useFormat();
  const { lang } = usePrefs();
  const [mode, setMode] = useState<"browse" | "passages">("browse");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string>(docs[0]?.id ?? "");
  const [doc, setDoc] = useState<{ body?: string; restricted?: Classification; loading: boolean; error?: string }>({ loading: false });
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const access = ROLES[role].access;

  const filtered = useMemo(() => {
    const f = q.trim().toLowerCase();
    return docs
      .filter((d) => scope === "all" || d.scope === scope)
      .filter((d) => !f || mode === "passages" || `${d.title} ${d.title_ar ?? ""} ${d.title_en ?? ""} ${d.ref ?? ""} ${d.id} ${d.owner ?? ""}`.toLowerCase().includes(f));
  }, [docs, q, scope, mode]);

  const groups = useMemo(() => {
    const g = new Map<ScopeKey, LibraryDoc[]>();
    for (const d of filtered) g.set(d.scope, [...(g.get(d.scope) ?? []), d]);
    return SCOPES.filter((s) => g.has(s.key)).map((s) => ({ scope: s, docs: g.get(s.key)! }));
  }, [filtered]);

  const meta = docs.find((d) => d.id === selected);

  useEffect(() => {
    if (!selected) return;
    let alive = true;
    setDoc({ loading: true });
    fetch(`/api/solutions/01-ai-workspace/library?id=${encodeURIComponent(selected)}&role=${role}`)
      .then(async (res) => {
        if (res.status === 403) {
          const j = await res.json();
          if (alive) setDoc({ loading: false, restricted: j.classification });
          return;
        }
        if (!res.ok) throw new Error(await res.text());
        const j = (await res.json()) as { body: string };
        if (alive) setDoc({ loading: false, body: j.body });
      })
      .catch((e) => alive && setDoc({ loading: false, error: (e as Error).message }));
    return () => {
      alive = false;
    };
  }, [selected, role]);

  useEffect(() => {
    if (mode !== "passages" || q.trim().length < 3) {
      setHits(null);
      return;
    }
    const t = setTimeout(() => {
      setSearching(true);
      fetch(`/api/solutions/01-ai-workspace/library?q=${encodeURIComponent(q)}&role=${role}&scope=${scope}`)
        .then((r) => r.json())
        .then((j) => setHits(j.hits))
        .finally(() => setSearching(false));
    }, 280);
    return () => clearTimeout(t);
  }, [q, mode, role, scope]);

  return (
    <Workbench cols="400px minmax(0,1fr)">
      <Pane
        title={L({ en: "Knowledge library", ar: "مكتبة المعرفة" })}
        subtitle={L({
          en: `${docs.length} documents · ${docs.reduce((a, d) => a + d.passages, 0)} passages · your access: ${accessLabel(access, "en")}`,
          ar: `${docs.length} مستنداً · ${docs.reduce((a, d) => a + d.passages, 0)} مقطعاً · صلاحيتك: ${accessLabel(access, "ar")}`,
        })}
        flush
        bodyClassName="flex flex-col"
      >
        <div className="space-y-2 border-b border-border p-3">
          <Segmented
            value={mode}
            onChange={setMode}
            className="w-full [&>button]:flex-1 [&>button]:justify-center"
            items={[
              { value: "browse", label: L({ en: "Browse", ar: "تصفّح" }), icon: <FileText className="size-3.5" /> },
              { value: "passages", label: L({ en: "Search passages", ar: "بحث في المقاطع" }), icon: <TextSearch className="size-3.5" /> },
            ]}
          />
          <div className="relative">
            <Search className="pointer-events-none absolute start-2.5 top-2.5 size-3.5 text-faint" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              dir="auto"
              className="h-8 ps-8 text-[12.5px]"
              placeholder={
                mode === "browse"
                  ? L({ en: "Filter by title, reference or owner", ar: "تصفية حسب العنوان أو المرجع أو الجهة" })
                  : L({ en: "Full-text search, Arabic or English (BM25)", ar: "بحث نصي كامل بالعربية أو الإنجليزية" })
              }
            />
          </div>
        </div>
        <div className="scrollbar-thin h-[640px] overflow-y-auto">
          {mode === "browse" &&
            groups.map((g) => (
              <div key={g.scope.key}>
                <div className="label-caps sticky top-0 z-[1] border-b border-border bg-card/95 px-4 py-1.5 !text-[9.5px] backdrop-blur">
                  {L(g.scope.label)} <span className="num text-faint">· {g.docs.length}</span>
                </div>
                <ul className="divide-y divide-border">
                  {g.docs.map((d) => {
                    const locked = !access.includes(d.classification);
                    return (
                      <li key={d.id}>
                        <button
                          type="button"
                          onClick={() => setSelected(d.id)}
                          className={cn(
                            "w-full px-4 py-2.5 text-start transition-colors hover:bg-muted/50",
                            selected === d.id && "bg-ai-soft/50 hover:bg-ai-soft/60",
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className={cn("line-clamp-2 text-[12.5px] leading-snug font-medium", locked && "text-muted-foreground")} dir="auto">
                              {d.title}
                            </span>
                            {locked ? <Lock className="mt-0.5 size-3.5 shrink-0 text-warning" /> : <ClassBadge value={d.classification} className="shrink-0" />}
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-[10.5px] text-muted-foreground">
                            <span className="truncate font-mono">{d.ref ?? d.id}</span>
                            <span className="text-faint">·</span>
                            <span className="shrink-0 uppercase">{d.lang ?? "en"}</span>
                            {d.date && (
                              <>
                                <span className="text-faint">·</span>
                                <span className="num shrink-0">{fmt.date(d.date, { month: "short", year: "numeric" })}</span>
                              </>
                            )}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          {mode === "passages" && (
            <div className="p-3">
              {searching && (
                <div className="flex items-center gap-2 p-2 text-[12px] text-muted-foreground">
                  <LoaderCircle className="size-3.5 animate-spin" /> {L({ en: "Searching…", ar: "جارٍ البحث…" })}
                </div>
              )}
              {!hits && !searching && (
                <p className="p-2 text-[12px] text-muted-foreground">
                  {L({ en: "Type at least 3 characters. Results respect your access level.", ar: "اكتب 3 أحرف على الأقل. النتائج تراعي صلاحيتك." })}
                </p>
              )}
              {hits && hits.length === 0 && !searching && <p className="p-2 text-[12px] text-muted-foreground">{L({ en: "No passages found.", ar: "لا توجد مقاطع." })}</p>}
              <ul className="space-y-2">
                {hits?.map((h, i) => (
                  <li key={`${h.docId}-${i}`}>
                    <button
                      type="button"
                      onClick={() => setSelected(h.docId)}
                      className="w-full rounded-md border border-border bg-surface p-2.5 text-start hover:border-ai/40"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[12px] font-medium" dir="auto">
                          {h.title}
                        </span>
                        <span className="num shrink-0 font-mono text-[10px] text-faint">{h.score.toFixed(1)}</span>
                      </div>
                      <div className="mt-0.5 truncate text-[10.5px] text-muted-foreground" dir="auto">
                        § {h.section}
                      </div>
                      <p className="mt-1 line-clamp-3 text-[11.5px] leading-relaxed text-muted-foreground" dir="auto">
                        {h.text}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Pane>

      <Pane
        title={meta ? <span dir="auto">{meta.ref ?? meta.id}</span> : L({ en: "Document", ar: "المستند" })}
        actions={meta ? <ClassBadge value={meta.classification} /> : null}
      >
        {!meta ? (
          <EmptyState icon={<FileText className="size-4" />} title={L({ en: "Select a document", ar: "اختر مستنداً" })} />
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)_260px] gap-5 max-xl:grid-cols-1">
            <div className="min-w-0">
              <h2 className="display-title text-[22px] leading-snug" dir="auto">
                {meta.title}
              </h2>
              {(lang === "ar" ? meta.title_en : meta.title_ar) && (meta.title_ar !== meta.title || meta.title_en) && (
                <p className="mt-1 text-[13px] text-muted-foreground" dir="auto">
                  {meta.lang === "ar" ? meta.title_en : meta.title_ar}
                </p>
              )}
              <div className="mt-4">
                {doc.loading ? (
                  <div className="flex h-[560px] items-center justify-center text-muted-foreground">
                    <LoaderCircle className="size-4 animate-spin" />
                  </div>
                ) : doc.restricted ? (
                  <div className="flex h-[560px] flex-col items-center justify-center rounded-md border border-dashed border-warning/40 bg-warning-soft/30 text-center">
                    <Lock className="size-5 text-warning" />
                    <div className="mt-3 text-[14px] font-medium">
                      {L({ en: "Restricted document", ar: "مستند مقيّد" })} — {L(CLASS_LABEL[doc.restricted])}
                    </div>
                    <p className="mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-muted-foreground">
                      {L({
                        en: `The ${ROLES[role].label.en.toLowerCase()} role is cleared for ${accessLabel(access, "en")}. The content is not sent to this browser and NARVO will not use it in answers for this role.`,
                        ar: `دور «${ROLES[role].label.ar}» مصرّح له بمستوى ${accessLabel(access, "ar")}. لا يُرسل المحتوى إلى هذا المتصفح ولن يستخدمه NARVO في إجابات هذا الدور.`,
                      })}
                    </p>
                  </div>
                ) : doc.error ? (
                  <p className="text-[12.5px] text-danger">{doc.error}</p>
                ) : (
                  <DocumentViewer markdown={doc.body ?? ""} title={meta.title} height={560} className="bg-card" />
                )}
              </div>
            </div>
            <div className="rounded-md border border-border bg-surface p-3">
              <div className="label-caps mb-1">{L({ en: "Front-matter", ar: "البيانات الوصفية" })}</div>
              <KeyValue k={L({ en: "Id", ar: "المعرّف" })} v={<span className="font-mono text-[11.5px]">{meta.id}</span>} />
              {meta.type && <KeyValue k={L({ en: "Type", ar: "النوع" })} v={meta.type} />}
              {meta.ref && <KeyValue k={L({ en: "Reference", ar: "المرجع" })} v={<span className="font-mono text-[11.5px]">{meta.ref}</span>} />}
              {meta.date && <KeyValue k={L({ en: "Issued", ar: "تاريخ الإصدار" })} v={<span className="num">{fmt.date(meta.date)}</span>} />}
              {meta.effective && <KeyValue k={L({ en: "Effective", ar: "تاريخ النفاذ" })} v={<span className="num">{fmt.date(meta.effective)}</span>} />}
              {meta.owner && <KeyValue k={L({ en: "Owner", ar: "الجهة المالكة" })} v={<span dir="auto">{meta.owner}</span>} />}
              <KeyValue k={L({ en: "Classification", ar: "التصنيف" })} v={<ClassBadge value={meta.classification} />} />
              <KeyValue k={L({ en: "Language", ar: "اللغة" })} v={meta.lang === "ar" ? "العربية" : "English"} />
              <KeyValue k={L({ en: "Passages indexed", ar: "المقاطع المفهرسة" })} v={<span className="num">{meta.passages}</span>} />
              <KeyValue k={L({ en: "Size", ar: "الحجم" })} v={<span className="num">{fmt.number(meta.chars)} {L({ en: "chars", ar: "حرف" })}</span>} />
              <div className="mt-2 border-t border-border pt-2 font-mono text-[10px] break-all text-faint">{meta.file}</div>
            </div>
          </div>
        )}
      </Pane>
    </Workbench>
  );
}
