/** Word-level diff (LCS over word tokens, whitespace preserved). Pure — used client-side. */

export interface DiffPart {
  type: "same" | "add" | "del";
  text: string;
}

function tokenize(s: string): string[] {
  return s.match(/\s+|[^\s]+/g) ?? [];
}

export function wordDiff(a: string, b: string): DiffPart[] {
  const A = tokenize(a);
  const B = tokenize(b);
  const n = A.length;
  const m = B.length;
  // LCS table (fine for launch-copy sizes: a few hundred tokens)
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffPart[] = [];
  const push = (type: DiffPart["type"], text: string) => {
    const last = out[out.length - 1];
    if (last && last.type === type) last.text += text;
    else out.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      push("same", A[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      push("del", A[i++]);
    } else {
      push("add", B[j++]);
    }
  }
  while (i < n) push("del", A[i++]);
  while (j < m) push("add", B[j++]);
  // whitespace-only changes are noise: fold them into "same"
  return out.map((p) => (p.type !== "same" && !p.text.trim() ? { ...p, type: "same" as const } : p));
}

export function diffStats(parts: DiffPart[]) {
  const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
  return {
    added: parts.filter((p) => p.type === "add").reduce((a, p) => a + words(p.text), 0),
    removed: parts.filter((p) => p.type === "del").reduce((a, p) => a + words(p.text), 0),
  };
}
