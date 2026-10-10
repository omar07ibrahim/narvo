import "server-only";
import { getIndex, search, type Doc, type SearchHit } from "@/lib/retrieval";
import { tokenize } from "@/lib/retrieval/arabic";
import { readJsonSafe } from "@/lib/world/data";
import { withOverlay } from "@/lib/store/db";
import type { Citation } from "@/lib/ai/events";
import {
  ROLES,
  type Attachment,
  type Classification,
  type LibraryDoc,
  type OutboxItem,
  type RoleKey,
  type ScopeKey,
  type TaskRecord,
} from "./shared";

export const SOLUTION = "01-ai-workspace";
export const CORPUS = "mnda/knowledge";
export const TASKS = `${SOLUTION}/tasks`;
export const OUTBOX = `${SOLUTION}/outbox`;

/* ───────────── Corpus with classification + scope ───────────── */

export function scopeOf(file: string): ScopeKey {
  const m = file.match(/knowledge\/([^/]+)\//);
  const s = (m?.[1] ?? "other") as ScopeKey;
  return ["circulars", "services", "policies", "hr", "it", "building-code", "strategy"].includes(s) ? s : "other";
}

export function classOf(doc: { classification?: unknown }): Classification {
  const c = String(doc.classification ?? "Internal");
  return c === "Public" || c === "Confidential" ? c : "Internal";
}

export function resolveRole(role: unknown): RoleKey {
  return role === "director" || role === "contractor" ? role : "case_officer";
}

export function allDocs(): Doc[] {
  return getIndex(CORPUS).docs;
}

export function libraryDocs(): LibraryDoc[] {
  const idx = getIndex(CORPUS);
  const counts = new Map<string, number>();
  for (const c of idx.chunks) counts.set(c.docId, (counts.get(c.docId) ?? 0) + 1);
  return idx.docs.map((d) => ({
    id: d.id,
    title: d.title,
    title_ar: d.title_ar,
    title_en: typeof d.title_en === "string" ? d.title_en : undefined,
    type: d.type,
    ref: d.ref,
    date: d.date,
    effective: typeof d.effective === "string" ? d.effective : undefined,
    owner: d.owner,
    classification: classOf(d),
    lang: d.lang,
    scope: scopeOf(d.file),
    file: d.file,
    passages: counts.get(d.id) ?? 0,
    chars: d.body.length,
  }));
}

export function corpusStats() {
  const idx = getIndex(CORPUS);
  return { documents: idx.docs.length, passages: idx.chunks.length };
}

export function canRead(role: RoleKey, doc: { classification?: unknown }) {
  return ROLES[role].access.includes(classOf(doc));
}

export interface FilteredSearch {
  hits: Array<SearchHit & { classification: Classification }>;
  withheld: Array<{ docId: string; title: string; classification: Classification }>;
}

/** BM25 search restricted to a scope and to the classification levels the role may read. */
export function searchFiltered(queries: string[], role: RoleKey, scope: ScopeKey, k = 8): FilteredSearch {
  const docs = allDocs();
  const byId = new Map(docs.map((d) => [d.id, d]));
  const raw = search(CORPUS, queries, 80);
  const withheld = new Map<string, { docId: string; title: string; classification: Classification }>();
  const seen = new Set<string>();
  const hits: FilteredSearch["hits"] = [];
  for (const h of raw) {
    const d = byId.get(h.docId);
    if (!d) continue;
    if (scope !== "all" && scopeOf(d.file) !== scope) continue;
    if (!canRead(role, d)) {
      if (hits.length < k) withheld.set(d.id, { docId: d.id, title: d.title, classification: classOf(d) });
      continue;
    }
    const key = `${h.docId}|${h.section}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({ ...h, classification: classOf(d) });
    if (hits.length >= k) break;
  }
  return { hits, withheld: [...withheld.values()] };
}

/* ───────────── User-supplied document (Ask your document) ───────────── */

export function attachmentPassages(att: Attachment, queries: string[], max = 4) {
  const text = att.text.replace(/\r/g, "").trim();
  if (!text) return [];
  // Split by headings first, then by blank-line groups of ~1,100 chars.
  const blocks: Array<{ section: string; text: string }> = [];
  let section = att.name;
  let buf: string[] = [];
  const flush = () => {
    const t = buf.join("\n").trim();
    if (t) {
      const parts = t.length > 1300 ? (t.match(/[\s\S]{1,1100}(\n|$)/g) ?? [t]) : [t];
      parts.forEach((p, i) => blocks.push({ section: parts.length > 1 ? `${section} (${i + 1})` : section, text: p.trim() }));
    }
    buf = [];
  };
  for (const line of text.split("\n")) {
    const h = line.match(/^#{1,3}\s+(.*)/);
    if (h) {
      flush();
      section = h[1].trim();
      continue;
    }
    buf.push(line);
  }
  flush();
  if (blocks.length <= max) return blocks;
  const q = new Set(queries.flatMap(tokenize));
  return blocks
    .map((b, i) => {
      const toks = tokenize(b.text);
      const score = toks.filter((t) => q.has(t)).length / Math.sqrt(toks.length + 1);
      return { b, score, i };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.b);
}

export function toCitations(
  passages: Array<{ docId: string; title: string; ref?: string; section?: string; text: string }>,
  start = 1,
): Citation[] {
  return passages.map((p, i) => ({
    n: start + i,
    docId: p.docId,
    title: p.title,
    ref: p.ref,
    section: p.section,
    quote: p.text.length > 420 ? p.text.slice(0, 420) + "…" : p.text,
  }));
}

/* ───────────── MNDA directory (task owners, email recipients) ───────────── */

export interface Person {
  name: string;
  nameAr: string;
  title: string;
  department: string;
  email: string;
  /** Director (or head) who approves work assigned to this person */
  approver: { name: string; title: string };
}

const D_PBP = { name: "Eng. Omar Yousef Al Hammadi", title: "Director, Planning & Building Permits" };
const D_HCS = { name: "Fatima Obaid Al Nuaimi", title: "Director, Housing & Community Services" };
const D_DTO = { name: "Hessa Abdulla Al Suwaidi", title: "Director, Digital Transformation Office" };
const D_DG = { name: "H.E. Eng. Khalid Saif Al Mazrouei", title: "Director General" };

export const DIRECTORY: Person[] = [
  { name: "Eng. Omar Yousef Al Hammadi", nameAr: "م. عمر يوسف الحمادي", title: "Director, Planning & Building Permits", department: "Planning & Building Permits", email: "omar.alhammadi@mnda.gov.ae", approver: D_DG },
  { name: "Eng. Layla Ahmed Al Marzooqi", nameAr: "م. ليلى أحمد المرزوقي", title: "Head, Permit Review Section", department: "Planning & Building Permits", email: "layla.almarzooqi@mnda.gov.ae", approver: D_PBP },
  { name: "Eng. Faisal Rashid Al Muhairi", nameAr: "م. فيصل راشد المهيري", title: "Senior Permit Officer, Gated Communities Desk", department: "Planning & Building Permits", email: "faisal.almuhairi@mnda.gov.ae", approver: D_PBP },
  { name: "Nadia Salem Al Dhanhani", nameAr: "نادية سالم الظنحاني", title: "Permit Officer, Marina Quarter", department: "Planning & Building Permits", email: "nadia.aldhanhani@mnda.gov.ae", approver: D_PBP },
  { name: "Fatima Obaid Al Nuaimi", nameAr: "فاطمة عبيد النعيمي", title: "Director, Housing & Community Services", department: "Housing & Community Services", email: "fatima.alnuaimi@mnda.gov.ae", approver: D_DG },
  { name: "Mariam Saeed Al Kaabi", nameAr: "مريم سعيد الكعبي", title: "Head, Housing Applications Section", department: "Housing & Community Services", email: "mariam.alkaabi@mnda.gov.ae", approver: D_HCS },
  { name: "Khalfan Mohammed Al Ali", nameAr: "خلفان محمد العلي", title: "Senior Case Officer, Housing", department: "Housing & Community Services", email: "khalfan.alali@mnda.gov.ae", approver: D_HCS },
  { name: "Sara Ahmed Al Blooshi", nameAr: "سارة أحمد البلوشي", title: "Manager, Customer Happiness Centre", department: "Customer Happiness", email: "sara.alblooshi@mnda.gov.ae", approver: D_DG },
  { name: "Hessa Abdulla Al Suwaidi", nameAr: "حصة عبدالله السويدي", title: "Director, Digital Transformation Office", department: "Digital Transformation Office", email: "hessa.alsuwaidi@mnda.gov.ae", approver: D_DG },
  { name: "Yousef Ibrahim Al Hosani", nameAr: "يوسف إبراهيم الحوسني", title: "IT Service Desk Lead", department: "Digital Transformation Office", email: "yousef.alhosani@mnda.gov.ae", approver: D_DTO },
  { name: "Dr. Amna Rashid Al Ketbi", nameAr: "د. آمنة راشد الكتبي", title: "Executive Director, Strategy & Performance Office", department: "Strategy & Performance Office", email: "amna.alketbi@mnda.gov.ae", approver: D_DG },
  { name: "Eng. Hamad Juma Al Kaabi", nameAr: "م. حمد جمعة الكعبي", title: "Director, Field Operations & Inspection", department: "Field Operations & Inspection", email: "hamad.alkaabi@mnda.gov.ae", approver: D_DG },
  { name: "Adv. Noura Khalifa Al Qubaisi", nameAr: "المحامية نورة خليفة القبيسي", title: "Head of Legal Affairs", department: "Legal Affairs", email: "noura.alqubaisi@mnda.gov.ae", approver: D_DG },
  { name: "Rashed Ali Al Dhaheri", nameAr: "راشد علي الظاهري", title: "Director, Procurement & Contracts", department: "Procurement & Contracts", email: "rashed.aldhaheri@mnda.gov.ae", approver: D_DG },
  { name: "Maryam Hassan Al Shamsi", nameAr: "مريم حسن الشامسي", title: "Director, Human Capital", department: "Human Capital", email: "maryam.alshamsi@mnda.gov.ae", approver: D_DG },
  { name: "Mona Abdelrahman Al Hashimi", nameAr: "منى عبدالرحمن الهاشمي", title: "Senior Translator & Terminology Lead", department: "Corporate Communications", email: "mona.alhashimi@mnda.gov.ae", approver: D_DG },
];

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/^(eng\.|dr\.|adv\.|h\.e\.)\s*/g, "")
    .replace(/[^a-z؀-ۿ@. ]/g, "")
    .trim();

export function findPerson(query: string): Person | undefined {
  const q = norm(query);
  if (!q) return undefined;
  return (
    DIRECTORY.find((p) => p.email === q) ??
    DIRECTORY.find((p) => norm(p.name) === q || p.nameAr === query.trim()) ??
    DIRECTORY.find((p) => norm(p.name).includes(q) || q.includes(norm(p.name))) ??
    DIRECTORY.find((p) => {
      const parts = q.split(/\s+/).filter((w) => w.length > 2 && !["al", "bin"].includes(w));
      return parts.length > 0 && parts.every((w) => norm(p.name).includes(w));
    })
  );
}

export function directoryForPrompt() {
  return DIRECTORY.map((p) => `- ${p.name} — ${p.title} (${p.department}) <${p.email}>`).join("\n");
}

/* ───────────── Tasks & outbox ───────────── */

export function loadTasks(): TaskRecord[] {
  const seed = readJsonSafe<TaskRecord[]>(`mnda/${SOLUTION}/tasks.json`, []);
  return withOverlay(TASKS, seed);
}

export function loadOutbox(): OutboxItem[] {
  const seed = readJsonSafe<OutboxItem[]>(`mnda/${SOLUTION}/outbox.json`, []);
  return withOverlay(OUTBOX, seed);
}

/** Working-day arithmetic (Mon–Fri week). */
export function addWorkingDays(from: Date, days: number) {
  const d = new Date(from);
  let left = days;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return d;
}

export const DEMO_TODAY = "2026-10-11";
