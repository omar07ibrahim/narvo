/**
 * Deterministic sentence segmentation shared by the claim checker (server) and the
 * claim highlighter (client). Joining all segments reproduces the original text exactly,
 * so claim indexes map back to the exact characters the reviewer sees.
 */

export interface Segment {
  text: string;
  idx: number | null;
}

const GAP_LINE = /^\**\[(?:Evidence needed|يلزم دليل|دليل مطلوب)/i;

export function segment(text: string): Segment[] {
  const out: Segment[] = [];
  let idx = 0;
  for (const line of text.split(/(\n)/)) {
    if (line === "") continue;
    if (line === "\n") {
      out.push({ text: line, idx: null });
      continue;
    }
    const trimmed = line.trim();
    if (!trimmed || /^#{1,6}\s/.test(trimmed) || /^\|/.test(trimmed) || GAP_LINE.test(trimmed)) {
      out.push({ text: line, idx: null });
      continue;
    }
    const parts = line.split(/((?<=[.!?؟])\s+(?=[A-Z؀-ۿ"“(*]))/);
    for (const p of parts) {
      if (!p) continue;
      if (/^\s+$/.test(p)) {
        out.push({ text: p, idx: null });
        continue;
      }
      const bare = bareSentence(p);
      if (bare.length < 25 || !/[A-Za-z؀-ۿ]/.test(bare)) {
        out.push({ text: p, idx: null });
        continue;
      }
      out.push({ text: p, idx: idx++ });
    }
  }
  return out;
}

/** Sentence without citation markers / markdown, for model input and display. */
export function bareSentence(s: string) {
  return s
    .replace(/\[\d+\]/g, "")
    .replace(/\*\*/g, "")
    .replace(/^\s*[-*•]\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function claimSentences(text: string) {
  return segment(text)
    .filter((s) => s.idx != null)
    .map((s) => ({ i: s.idx as number, text: s.text, bare: bareSentence(s.text) }));
}

/** Replace the sentence with index `i` and return the new full text. */
export function replaceSentence(text: string, i: number, replacement: string) {
  return segment(text)
    .map((s) => {
      if (s.idx !== i) return s.text;
      const lead = s.text.match(/^\s*(?:[-*•]\s+)?/)?.[0] ?? "";
      return lead + replacement.trim();
    })
    .join("");
}
