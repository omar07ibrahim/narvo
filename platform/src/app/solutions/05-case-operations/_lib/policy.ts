import "server-only";
import { getIndex, cleanQuote } from "@/lib/retrieval";
import type { Citation } from "@/lib/ai/events";
import type { CaseCheck } from "./types";

/**
 * Map a check's policy reference ("Circular 9/2026 §4.4 · §6.1") to the exact passages of the
 * circular in the knowledge base, so every finding links to the source text.
 */
const SECTION_PREFIX: Record<string, { en: string; ar: string }> = {
  "3": { en: "3. Eligibility", ar: "ثالثاً" },
  "4": { en: "4. Required documents", ar: "رابعاً" },
  "5": { en: "5. Incomplete applications", ar: "خامساً" },
  "6": { en: "6. Verification", ar: "سادساً" },
  "7": { en: "7. Decisions", ar: "سابعاً" },
};

export function policyCitations(checks: CaseCheck[], lang: "en" | "ar"): Citation[] {
  const idx = getIndex("mnda/knowledge");
  const docId = lang === "ar" ? "MNDA-CIR-2026-09-AR" : "MNDA-CIR-2026-09-EN";
  const sections = new Set<string>(["5"]);
  for (const c of checks) {
    if (c.status === "pass" || !c.policyRef) continue;
    for (const m of c.policyRef.matchAll(/§(\d)/g)) sections.add(m[1]);
  }
  const out: Citation[] = [];
  for (const s of Array.from(sections).sort()) {
    const prefix = SECTION_PREFIX[s]?.[lang];
    const chunk = idx.chunks.find((ch) => ch.docId === docId && prefix && ch.section.startsWith(prefix));
    if (!chunk) continue;
    out.push({
      n: out.length + 1,
      docId,
      title: chunk.title,
      ref: chunk.ref,
      section: chunk.section,
      quote: cleanQuote(chunk.text, 640),
    });
  }
  return out;
}
