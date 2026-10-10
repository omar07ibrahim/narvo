import "server-only";
import fs from "node:fs";
import path from "node:path";
import { tokenize } from "./arabic";

/**
 * Knowledge corpus + BM25 retrieval.
 *
 * Documents are Markdown files with a small front-matter block:
 *
 *   ---
 *   id: MNDA-CIR-2026-09
 *   title: Circular No. 9/2026 — Updated Requirements for Housing Grant Applications
 *   title_ar: تعميم رقم 9/2026 ...
 *   type: Circular
 *   ref: MNDA/HCS/CIR/09/2026
 *   date: 2026-08-18
 *   owner: Housing & Community Services
 *   classification: Internal
 *   lang: en
 *   ---
 *
 * Chunks follow headings (## / ###) so citations point to a real section.
 */

export interface DocMeta {
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
  [key: string]: unknown;
}

export interface Doc extends DocMeta {
  body: string;
}

export interface Chunk {
  key: string;
  docId: string;
  title: string;
  ref?: string;
  section: string;
  text: string;
  tokens: string[];
}

export interface SearchHit {
  docId: string;
  title: string;
  ref?: string;
  section: string;
  text: string;
  score: number;
  classification?: string;
  lang?: string;
  type?: string;
}

const DATA_DIR = path.join(process.cwd(), "data");

export function parseFrontMatter(raw: string): { meta: Record<string, string>; body: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i === -1) continue;
    meta[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return { meta, body: raw.slice(m[0].length) };
}

/** Load every .md document in a data folder (recursively). */
export function loadDocs(relDir: string): Doc[] {
  const dir = path.join(DATA_DIR, relDir);
  if (!fs.existsSync(dir)) return [];
  const files: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".md")) files.push(p);
    }
  };
  walk(dir);
  return files.sort().map((file) => {
    const raw = fs.readFileSync(file, "utf8");
    const { meta, body } = parseFrontMatter(raw);
    const rel = path.relative(DATA_DIR, file).replace(/\\/g, "/");
    return {
      ...meta,
      id: meta.id || path.basename(file, ".md"),
      title: meta.title || path.basename(file, ".md"),
      file: rel,
      body,
    } as Doc;
  });
}

function chunkDoc(doc: Doc): Chunk[] {
  const lines = doc.body.split(/\r?\n/);
  const chunks: Chunk[] = [];
  let section = "Overview";
  let buf: string[] = [];
  const flush = () => {
    const text = buf.join("\n").trim();
    if (text.length > 20) {
      // Split very long sections into ~1400 char windows.
      const parts = text.length > 1600 ? text.match(/[\s\S]{1,1400}(\n|$)/g) ?? [text] : [text];
      parts.forEach((p, i) => {
        const t = p.trim();
        if (!t) return;
        chunks.push({
          key: `${doc.id}#${chunks.length}`,
          docId: doc.id,
          title: doc.title,
          ref: doc.ref,
          section: parts.length > 1 ? `${section} (${i + 1})` : section,
          text: t,
          tokens: tokenize(`${doc.title} ${section} ${t}`),
        });
      });
    }
    buf = [];
  };
  for (const line of lines) {
    const h = line.match(/^#{1,3}\s+(.*)/);
    if (h) {
      flush();
      section = h[1].trim();
      continue;
    }
    buf.push(line);
  }
  flush();
  return chunks;
}

interface Index {
  docs: Doc[];
  chunks: Chunk[];
  df: Map<string, number>;
  avgLen: number;
}

const g = globalThis as unknown as { __narvoIndexes?: Map<string, Index> };
const cache = (g.__narvoIndexes ??= new Map());

export function getIndex(relDir: string): Index {
  const hit = cache.get(relDir);
  if (hit && process.env.NODE_ENV === "production") return hit;
  const docs = loadDocs(relDir);
  const signature = docs.map((d) => d.file + d.body.length).join("|");
  if (hit && (hit as Index & { sig?: string }).sig === signature) return hit;
  const chunks = docs.flatMap(chunkDoc);
  const df = new Map<string, number>();
  for (const c of chunks) for (const t of new Set(c.tokens)) df.set(t, (df.get(t) ?? 0) + 1);
  const avgLen = chunks.reduce((a, c) => a + c.tokens.length, 0) / Math.max(chunks.length, 1);
  const idx = Object.assign({ docs, chunks, df, avgLen }, { sig: signature });
  cache.set(relDir, idx);
  return idx;
}

/** BM25 search over a corpus folder. `queries` may contain several phrasings (e.g. Arabic + English). */
export function search(
  relDir: string,
  queries: string | string[],
  k = 8,
  opts: { docIds?: string[]; classifications?: string[] } = {},
): SearchHit[] {
  const idx = getIndex(relDir);
  const allowedDocs = opts.docIds ? new Set(opts.docIds) : null;
  const allowedClass = opts.classifications ? new Set(opts.classifications) : null;
  const docMeta = new Map(idx.docs.map((d) => [d.id, d]));
  const allowed = (docId: string) =>
    (!allowedDocs || allowedDocs.has(docId)) && (!allowedClass || allowedClass.has(String(docMeta.get(docId)?.classification ?? "Public")));
  const qTokens = (Array.isArray(queries) ? queries : [queries]).flatMap(tokenize);
  if (!qTokens.length) return [];
  const N = idx.chunks.length;
  const k1 = 1.4;
  const b = 0.72;
  const scores = idx.chunks.map((c) => {
    const tf = new Map<string, number>();
    for (const t of c.tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    let s = 0;
    for (const q of new Set(qTokens)) {
      const f = tf.get(q);
      if (!f) continue;
      const n = idx.df.get(q) ?? 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      s += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * c.tokens.length) / idx.avgLen)));
    }
    return s;
  });
  return idx.chunks
    .map((c, i) => ({ c, s: scores[i] }))
    .filter((x) => x.s > 0 && allowed(x.c.docId))
    .sort((a, b) => b.s - a.s)
    .slice(0, k)
    .map(({ c, s }) => {
      const meta = idx.docs.find((d) => d.id === c.docId);
      return {
        docId: c.docId,
        title: c.title,
        ref: c.ref,
        section: c.section,
        text: c.text,
        score: Number(s.toFixed(3)),
        classification: meta?.classification,
        lang: meta?.lang,
        type: meta?.type,
      };
    });
}

export function getDoc(relDir: string, docId: string): Doc | undefined {
  return getIndex(relDir).docs.find((d) => d.id === docId);
}

export function listDocs(relDir: string): DocMeta[] {
  return getIndex(relDir).docs.map(({ body: _b, ...meta }) => meta);
}

/** Turn a Markdown passage into clean quotable text (tables → "a — b" lines, no emphasis markers). */
export function cleanQuote(text: string, max = 520): string {
  const lines = text
    .split(/\r?\n/)
    .filter((l) => !/^\s*\|?\s*:?-{2,}/.test(l))
    .map((l) =>
      l.trim().startsWith("|")
        ? l
            .split("|")
            .map((c) => c.trim())
            .filter(Boolean)
            .join(" — ")
        : l,
    )
    .map((l) => l.replace(/\*\*|__|`/g, "").replace(/^#+\s*/, "").trim())
    .filter(Boolean);
  const out = lines.join("\n");
  return out.length > max ? out.slice(0, max).trimEnd() + "…" : out;
}
