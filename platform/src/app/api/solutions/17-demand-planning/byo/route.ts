import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { chatStream } from "@/lib/ai/client";
import { addAudit } from "@/lib/store/db";
import { forecastByo, type ByoResult } from "@/app/solutions/17-demand-planning/_lib/forecast";

/** Bring-your-own CSV: parse → detect frequency → Holt-Winters fit → backtest → AI commentary on the computed results. */

function splitLine(line: string) {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if ((ch === "," || ch === ";" || ch === "\t") && !q) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function toIsoDate(s: string): string | null {
  const t = s.trim().replace(/^"|"$/g, "");
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  if (/^\d{4}-\d{2}$/.test(t)) return `${t}-01`;
  const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); // dd/mm/yyyy (UAE convention)
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const d = Date.parse(t);
  return Number.isNaN(d) ? null : new Date(d).toISOString().slice(0, 10);
}

function parseCsv(text: string) {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (lines.length < 2) throw new Error("The file has no data rows.");
  const first = splitLine(lines[0]).map((h) => h.toLowerCase());
  const hasHeader = first.some((h) => /date|week|month|period|time|value|qty|quantity|units|sales|demand|sku|item|product/.test(h)) || !toIsoDate(first[0]);
  const header = hasHeader ? first : ["date", "value", "sku"];
  const find = (re: RegExp, fallback: number) => {
    const i = header.findIndex((h) => re.test(h));
    return i >= 0 ? i : fallback;
  };
  const di = find(/date|week|month|period|time|day/, 0);
  const vi = find(/value|qty|quantity|units|sales|sold|demand|volume|amount|tonnes|count/, di === 0 ? 1 : 0);
  const si = header.findIndex((h) => /sku|item|product|series|code|name/.test(h));
  const rows = (hasHeader ? lines.slice(1) : lines).map(splitLine);
  const groups = new Map<string, Array<{ t: string; v: number }>>();
  let skipped = 0;
  for (const r of rows) {
    const t = toIsoDate(r[di] ?? "");
    const v = Number(String(r[vi] ?? "").replace(/[, ]/g, ""));
    if (!t || !Number.isFinite(v)) {
      skipped++;
      continue;
    }
    const key = si >= 0 ? r[si] || "series" : "series";
    const arr = groups.get(key) ?? [];
    arr.push({ t, v });
    groups.set(key, arr);
  }
  return { groups, skipped, columns: { date: header[di], value: header[vi], sku: si >= 0 ? header[si] : null }, rows: rows.length };
}

export async function POST(req: Request) {
  const body = await readBody<{ csv?: string; fileName?: string }>(req);
  const { modelKey, lang } = getPrefs(req, body);
  const ar = lang === "ar";
  if (!body.csv || body.csv.length < 10) return new Response("csv text required", { status: 400 });
  if (body.csv.length > 3_000_000) return new Response("File too large (max 3 MB)", { status: 413 });

  return eventStream(
    req,
    async (emit) => {
      const s1 = emit.step("parse", ar ? "قراءة الملف والتحقق من الأعمدة" : "Reading the file and detecting columns");
      const parsed = parseCsv(body.csv!);
      const series = Array.from(parsed.groups.entries())
        .map(([k, v]) => ({ k, v, total: v.reduce((a, b) => a + b.v, 0) }))
        .sort((a, b) => b.total - a.total);
      if (!series.length) throw new Error(ar ? "لم يتم العثور على صفوف بتاريخ وقيمة صالحين." : "No rows with a valid date and value were found.");
      const used = series.slice(0, 4);
      s1.done(
        ar
          ? `${parsed.rows} صفاً · ${series.length} سلسلة · الأعمدة: ${parsed.columns.date} / ${parsed.columns.value}${parsed.columns.sku ? ` / ${parsed.columns.sku}` : ""}${parsed.skipped ? ` · تم تجاهل ${parsed.skipped}` : ""}`
          : `${parsed.rows} rows · ${series.length} series · columns: ${parsed.columns.date} / ${parsed.columns.value}${parsed.columns.sku ? ` / ${parsed.columns.sku}` : ""}${parsed.skipped ? ` · ${parsed.skipped} skipped` : ""}`,
      );

      const s2 = emit.step("fit", ar ? "ملاءمة نموذج هولت-وينترز والاختبار الرجعي" : "Fitting Holt-Winters and backtesting");
      const t0 = Date.now();
      const results: Array<{ key: string } & ByoResult> = [];
      for (const s of used) {
        try {
          results.push({ key: s.k, ...forecastByo(s.v) });
        } catch (e) {
          if (used.length === 1) throw e;
        }
      }
      if (!results.length) throw new Error(ar ? "البيانات غير كافية للتوقع (8 قيم على الأقل)." : "Not enough data to forecast (need at least 8 values).");
      emit.data("byo", { fileName: body.fileName ?? "upload.csv", series: results, totalSeries: series.length });
      s2.done(
        results
          .map((r) => `${r.key}: MAPE ${(r.mape * 100).toFixed(1)}% vs ${(r.naiveMape * 100).toFixed(1)}%`)
          .join(" · ") + ` · ${Date.now() - t0} ms`,
      );

      const s3 = emit.step("comment", ar ? "قراءة النتائج وكتابة ملاحظات المخطِّط" : "Writing planner notes on the results");
      const facts = results
        .map((r) => {
          const h = r.history.map((x) => x.v);
          const last = h.slice(-8).reduce((a, b) => a + b, 0) / Math.min(8, h.length);
          const prev = h.slice(-16, -8).reduce((a, b) => a + b, 0) / Math.max(1, Math.min(8, h.length - 8));
          const next = r.forecast.slice(0, r.frequency === "weekly" ? 13 : 3);
          return [
            `Series "${r.key}": ${r.periods} ${r.frequency} periods from ${r.history[0].t} to ${r.history[r.history.length - 1].t}; method ${r.method}${r.params ? ` (alpha ${r.params.alpha}, beta ${r.params.beta}, gamma ${r.params.gamma}, phi ${r.params.phi})` : ""}.`,
            `Range ${Math.min(...h).toFixed(1)}–${Math.max(...h).toFixed(1)}; last-8 average ${last.toFixed(1)} vs previous-8 ${prev.toFixed(1)} (${prev ? (((last - prev) / prev) * 100).toFixed(1) : "n/a"}%).`,
            `Backtest on last ${r.backtest.length} periods: MAPE ${(r.mape * 100).toFixed(1)}% vs naive ${(r.naiveMape * 100).toFixed(1)}%; P10–P90 coverage ${(r.coverage * 100).toFixed(0)}%.`,
            `Next ${next.length} periods P50 total ${next.reduce((a, b) => a + b.p50, 0).toFixed(0)} (P10 sum ${next.reduce((a, b) => a + b.p10, 0).toFixed(0)}, P90 sum ${next.reduce((a, b) => a + b.p90, 0).toFixed(0)}).`,
          ].join(" ");
        })
        .join("\n");
      const gen = chatStream({
        messages: [
          {
            role: "system",
            content:
              "You are a demand-planning analyst. Comment on an uploaded time series using ONLY the computed statistics given. " +
              "Explain in plain language: the pattern (trend/seasonality), whether the model beats the naive baseline and by how much, what the P10–P90 range means for stock decisions, and data caveats (length, gaps, outliers). " +
              "Do not invent numbers. 90–170 words, short bullets. " +
              (ar ? "Write in Arabic (Modern Standard Arabic)." : "Write in English."),
          },
          { role: "user", content: facts },
        ],
        modelKey,
        temperature: 0.25,
        maxTokens: 600,
        solution: "17-demand-planning",
        task: "byo.comment",
        signal: emit.signal,
      });
      for (let n = await gen.next(); !n.done; n = await gen.next()) if (n.value.content) emit.text(n.value.content);
      s3.done();
      addAudit({
        solution: "17-demand-planning",
        actor: { name: "Joseph Abraham", role: "Supply Chain & Planning Manager", kind: "human" },
        action: "Forecast uploaded series",
        subject: body.fileName ?? "upload.csv",
        detail: results.map((r) => `${r.key}: ${r.periods} ${r.frequency} pts, MAPE ${(r.mape * 100).toFixed(1)}%`).join(" · "),
      });
    },
    { modelKey },
  );
}
