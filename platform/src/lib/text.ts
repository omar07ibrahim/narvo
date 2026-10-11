/** Shared text helpers (client + server). */

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
