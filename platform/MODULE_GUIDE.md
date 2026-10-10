# NARVO Module Guide — how every solution is built

You are building one or more of the 20 solutions of the **NARVO Private Intelligence Platform** — a local,
private AI platform that a UAE AI company will demo to government and enterprise executives. Each solution
must work as a **stand-alone, fully functional, beautiful demo**. Read `WORLD.md` (the data bible) first.

## 1. Quality bar (non-negotiable)

**Everything is real.** No stubs, no canned AI answers, no fake progress, no `setTimeout` pretending to think.
Every AI output comes from a live model call on the module's data. Every action changes persisted state.
What is fictional is only the organisations' data (see WORLD.md) — and the user can always bring their own input
(upload a document/photo, type, or speak) and the module works on it too.

**Rich functionality.** Each module needs, at minimum:
1. **Two or more distinct AI capabilities** (e.g. extract + check + draft; compare + explain + ask follow-up).
2. **A working record set** (inbox/list/table of cases, accounts, invoices…) with selection, filters or tabs,
   and a detail view — the screen should feel like a real operational tool, not a chatbot.
3. **An agent or pipeline trace** (`<AgentTrace>`) showing the real steps/tools as they run.
4. **Human-in-the-loop**: anything that changes a record or sends something goes through an approval
   (`approval` tools or `createApproval`) — approving applies the effect, writes the audit trail, and the UI updates.
5. **Bring-your-own input**: a `<FileDrop>`, free-text box or voice button that runs the same AI on user input.
6. **Sources / evidence**: show where each AI claim came from (citations, field sources, evidence on hover).
7. **Measurable result**: KPI tiles computed from the module's data (counts, times, amounts) — not hardcoded.
8. **Bilingual** EN/AR UI (`useL()`), RTL-safe layout, and AI output language following the UI language.
9. **Demo script**: 5–7 bilingual steps passed as `scenario` to `<SolutionPage>` so a presenter can follow it.
10. **States**: empty, running (streaming), done, error — all designed.

**Aesthetic: calm, precise, premium.** It must look like the printed NARVO catalogue: warm stone background,
generous white space, hairline borders, light large headings, small uppercase letter-spaced labels, one accent
(teal `ai`) used sparingly for AI moments. Restraint over decoration.
- No gradients, glows, emoji, drop-shadow-heavy cards, rainbow charts or cartoon illustrations.
- Use existing tokens/classes: `bg-card`, `bg-surface`, `bg-muted`, `border-border`, `text-muted-foreground`,
  `text-faint`, `text-ai`, `bg-ai-soft`, `text-success|warning|danger|info` + `-soft` backgrounds,
  `label-caps` (micro labels), `display-title`, `num` (tabular numbers), `prose-narvo` (via `<Markdown>`).
- Typography: body 13–13.5px, secondary 11.5–12px, panel headers via `<Pane title>` (label-caps), page title is
  already provided by `<SolutionPage>`. Icons: lucide, `strokeWidth` 1.5–2, size 14–16px.
- Spacing: panes `gap-4`, inner padding `p-4`, lists with `divide-y divide-border`. Rounded `rounded-md/lg`.
- RTL-safe: use logical classes (`ms-/me-/ps-/pe-/start-/end-/text-start/text-end`), never `ml/mr/pl/pr/left/right`.
  Directional icons (chevrons/arrows) get `rtl:rotate-180`.
- Charts: Recharts with `CHART`, `axisProps`, `gridProps`, `ChartTooltip` from `@/components/narvo/chart`.
  Mostly teal + ink + one warning colour. Thin lines, no 3D, no heavy fills.
- Motion: subtle (`motion/react` fade/slide 150–250 ms). Never bouncy.

## 2. Files you own

For solution `NN-slug` (see `src/lib/solutions/registry.ts`):

```
src/app/solutions/NN-slug/page.tsx              ← route (server component; may load seed data and pass props)
src/app/solutions/NN-slug/_components/*.tsx     ← client UI
src/app/solutions/NN-slug/_lib/*.ts             ← server helpers: data loaders, zod schemas, prompts, tools
src/app/api/solutions/NN-slug/<action>/route.ts ← API routes (SSE for AI runs, JSON for data)
data/<org>/NN-slug/**                           ← seed data (JSON / CSV / Markdown)
data/<org>/NN-slug/audit-seed.json              ← 10–25 historical audit events (shown in the Audit trail)
data/<org>/knowledge/<topic>/*.md               ← you may ADD knowledge documents your module needs
public/demo/NN-slug/**                          ← images (scans, photos) served at /demo/NN-slug/...
```

**Do not edit shared files** (`src/lib/**`, `src/components/**`, `src/hooks/**`, `src/app/layout.tsx`, other
modules, `WORLD.md`). If you truly need a shared change, describe it in your final report instead.
Runtime collections and kv keys must be namespaced: collection `"NN-slug/cases"`, kv key `"NN-slug:brief"` —
that is what makes **Reset** work for your module.

## 3. Next.js 16.4 notes (this is newer than your training data)

- App Router. `params` is a **Promise**: `const { id } = await ctx.params`. Route handler context type:
  `RouteContext<"/api/solutions/05-case-operations/cases/[id]">`.
- `cacheComponents` is **off** — classic dynamic rendering. Pages that read runtime state must add
  `export const dynamic = "force-dynamic";`.
- Client components need `"use client"`. Server helpers import `"server-only"`.
- Do not run `next build` (shared `.next` folder). A dev server is already running at **http://localhost:3000** —
  test your pages and API routes there (`curl`, or fetch the page HTML). Type-check with
  `npx tsc --noEmit -p . 2>&1 | grep -E "solutions/NN-slug|api/solutions/NN-slug"` (only fix your own files).

## 4. Server toolkit

```ts
import { eventStream, readBody } from "@/lib/ai/stream";       // SSE response + emitter
import { getPrefs } from "@/lib/ai/request";                   // { modelKey, lang } from body/cookies
import { chat, chatStream, complete, type ContentPart } from "@/lib/ai/client";
import { generateObject } from "@/lib/ai/json";                // zod-validated structured output
import { runAgent, defineTool } from "@/lib/ai/agent";         // tool-using agent with approvals
import { answerWithCitations } from "@/lib/ai/rag";            // plan → BM25 search → cited streamed answer
import { search, getIndex, getDoc, listDocs } from "@/lib/retrieval";
import { readJson, readJsonSafe, readCsv, readText, publicImageDataUrl } from "@/lib/world/data";
import { withOverlay, patchRecord, appendRecord, createApproval, addAudit, kvGet, kvSet, getPatch } from "@/lib/store/db";
```

### A streaming AI route (pattern)

```ts
// src/app/api/solutions/05-case-operations/process/route.ts
import { z } from "zod";
import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { generateObject } from "@/lib/ai/json";
import { chatStream } from "@/lib/ai/client";

export async function POST(req: Request) {
  const body = await readBody<{ caseId: string }>(req);
  const { modelKey, lang } = getPrefs(req, body);
  return eventStream(req, async (emit) => {
    const s1 = emit.step("extract", lang === "ar" ? "استخراج بيانات الطلب" : "Extracting application data");
    const { object } = await generateObject({
      schema: z.object({ applicantName: z.string(), emiratesId: z.string().nullable() /* … */ }),
      name: "application", system: "…", user: [{ type: "text", text: "…" }, { type: "image_url", image_url: { url: dataUrl } }],
      modelKey, solution: "05-case-operations", task: "extract",
    });
    emit.data("fields", object);           // client reads run.data.fields
    s1.done("14 fields extracted");

    const s2 = emit.step("draft", "Drafting clarification");
    const gen = chatStream({ messages: [...], modelKey, solution: "05-case-operations", task: "draft", signal: emit.signal });
    for (let n = await gen.next(); !n.done; n = await gen.next()) if (n.value.content) emit.text(n.value.content, "draft");
    s2.done();
  }, { modelKey });
}
```

### Agent with tools and a human approval gate

```ts
const lookup = defineTool({
  name: "get_case", description: "Fetch a housing case by id",
  parameters: z.object({ caseId: z.string() }),
  label: (a) => `Looking up ${a.caseId}`,
  execute: async (a) => getCase(a.caseId),                // read-only → runs immediately
});
const send = defineTool({
  name: "send_clarification", description: "Send the clarification request to the applicant",
  parameters: z.object({ caseId: z.string(), message: z.string() }),
  label: (a) => `Send clarification for ${a.caseId}`,
  approval: (a) => ({                                       // state-changing → needs a human
    title: `Send clarification request — ${a.caseId}`,
    summary: a.message.slice(0, 280),
    actionLabel: "Approve & send",
    approver: { name: "Mariam Saeed Al Kaabi", title: "Head, Housing Applications" },
    effects: [
      { type: "patch", collection: "05-case-operations/cases", id: a.caseId, patch: { status: "awaiting_applicant" } },
      { type: "append", collection: "05-case-operations/messages", item: { id: crypto.randomUUID(), caseId: a.caseId, body: a.message } },
      { type: "audit", action: "Clarification sent to applicant", subject: a.caseId },
    ],
  }),
});
await runAgent({ system, messages: [{ role: "user", content: "…" }], tools: [lookup, send], emit, solution: "05-case-operations", modelKey });
```

Approvals appear inline (client gets an `approval` event → render `<ApprovalCard>`) **and** in the global Inbox.
Approving runs the effects; your GET data route returns `withOverlay("05-case-operations/cases", seed)` so the UI
reflects it. You can also call `createApproval(...)` directly from a non-agent route.

### Models

Default model: **Qwen3.8 27B** (multimodal: pass images as `image_url` data URLs; use `publicImageDataUrl("/demo/…png")`).
Keep `maxTokens` sensible (≤ 1500 for prose, ≤ 3000 for big JSON). Reasoning is off by default (fast); pass
`reasoning: true` only where thinking visibly helps. Budget is limited — test each endpoint a few times, don't loop.
Always pass `solution: "NN-slug"` and a `task` name (telemetry powers the platform console).
Prompts: tell the model the organisation, the user's role, the language (`lang`), and to rely only on given data.

## 5. Client toolkit

```tsx
"use client";
import { useNarvoRun, useNarvoFetch } from "@/hooks/use-narvo-run";
import { useL, useFormat, usePrefs } from "@/lib/i18n";
import { SolutionPage, type ScenarioStep } from "@/components/narvo/solution-page";
import { Workbench, Pane, SectionLabel, KeyValue, Divider } from "@/components/narvo/pane";
import { AgentTrace } from "@/components/narvo/agent-trace";
import { Markdown } from "@/components/narvo/markdown";             // renders [n] as hover citation chips
import { SourceList } from "@/components/narvo/sources";
import { ApprovalCard } from "@/components/narvo/approval-card";
import { FieldTable, type ExtractedField } from "@/components/narvo/field-table";
import { ComparisonMatrix, type MatrixRow } from "@/components/narvo/matrix";
import { MetricTile, MeasureStrip } from "@/components/narvo/metric";
import { StatusPill, Dot, Confidence, Kbd } from "@/components/narvo/status";
import { RunButton } from "@/components/narvo/run-button";
import { DocumentViewer } from "@/components/narvo/document-viewer";
import { FileDrop, type DroppedFile } from "@/components/narvo/file-drop";
import { VoiceButton, speak, stopSpeaking } from "@/components/narvo/voice";
import { EmptyState, ThinkingLines } from "@/components/narvo/empty";
import { CHART, axisProps, gridProps, ChartTooltip } from "@/components/narvo/chart";
// shadcn/ui (radix): Button, Badge, Tabs, Dialog, Sheet, Select, Input, Textarea, Table, Tooltip, HoverCard,
// DropdownMenu, ScrollArea, Separator, Switch, Progress, Skeleton, Avatar, Popover, ToggleGroup, Collapsible
// from "@/components/ui/<name>". Toasts: import { toast } from "sonner".

const run = useNarvoRun();
run.start("/api/solutions/05-case-operations/process", { caseId });   // adds modelKey + lang automatically
run.running; run.status; run.trace; run.text.draft; run.data.fields; run.approvals; run.error; run.markApproval(id, s)
```

Page skeleton:

```tsx
// src/app/solutions/05-case-operations/page.tsx
export const dynamic = "force-dynamic";
import { CaseWorkspace } from "./_components/case-workspace";
import { loadCases } from "./_lib/data";
export default function Page() { return <CaseWorkspace initialCases={loadCases()} />; }

// _components/case-workspace.tsx
"use client";
export function CaseWorkspace({ initialCases }) {
  return (
    <SolutionPage slug="05-case-operations" scenario={SCENARIO}>
      <div className="grid grid-cols-4 gap-4">{/* KPI MetricTiles computed from data */}</div>
      <Workbench cols="340px minmax(0,1fr) 380px">
        <Pane title={L({ en: "Incoming", ar: "الوارد" })} flush>…list…</Pane>
        <Pane title="…">…main work area…</Pane>
        <Pane title="…"><AgentTrace run={run} />…approvals/sources…</Pane>
      </Workbench>
    </SolutionPage>
  );
}
```

Generating realistic "scanned" documents: write the document as an HTML file with inline CSS (A4 1240×1754 px,
letterhead, stamp, signature as SVG path, slight `transform: rotate(-0.4deg)`, subtle grain via CSS) and render
it with headless Chrome:
`"C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --disable-gpu --hide-scrollbars --window-size=1240,1754 --screenshot="C:\...\public\demo\NN-slug\file.png" "file:///C:/.../file.html"`
Keep the HTML sources next to the data (`data/<org>/NN-slug/scans-src/`).

## 6. Final report

When done, report: files created, API routes (with one-line purpose), what you tested end-to-end (and the actual
model outputs you saw), known limitations, and any shared change you'd like the lead to make.
