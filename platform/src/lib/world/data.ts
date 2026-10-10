import "server-only";
import fs from "node:fs";
import path from "node:path";

/** Read-only access to the seed data set in /data. */

export const DATA_DIR = path.join(process.cwd(), "data");
export const PUBLIC_DIR = path.join(process.cwd(), "public");

export function dataPath(rel: string) {
  return path.join(DATA_DIR, rel);
}

export function readJson<T = unknown>(rel: string): T {
  return JSON.parse(fs.readFileSync(dataPath(rel), "utf8")) as T;
}

export function readJsonSafe<T = unknown>(rel: string, fallback: T): T {
  try {
    return readJson<T>(rel);
  } catch {
    return fallback;
  }
}

export function readText(rel: string): string {
  return fs.readFileSync(dataPath(rel), "utf8");
}

export function exists(rel: string) {
  return fs.existsSync(dataPath(rel));
}

export function listFiles(relDir: string, ext?: string): string[] {
  const dir = dataPath(relDir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => !ext || f.endsWith(ext))
    .sort();
}

/** Parse a CSV file with a header row into objects (handles quoted fields). */
export function readCsv(rel: string): Record<string, string>[] {
  const text = readText(rel).replace(/\r/g, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((r) => r.length > 1 || r[0]);
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

/** Read an image from /public and return a data URL for vision models. */
export function publicImageDataUrl(publicRelPath: string): string {
  const p = path.join(PUBLIC_DIR, publicRelPath.replace(/^\//, ""));
  const buf = fs.readFileSync(p);
  const ext = path.extname(p).slice(1).toLowerCase();
  const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";
  return `data:${mime};base64,${buf.toString("base64")}`;
}
