# NARVO platform — notes for Claude Code

This repo is a demo-grade but fully working private AI platform for NARVO (Abu Dhabi). The founders
demo it to UAE government and enterprise executives. Standards: everything real (no mocked AI, no
canned answers), calm premium design matching the NARVO catalogue, bilingual EN/AR with RTL.

## Where things are
- App: `platform/` (Next.js 16.4, React 19.3, Tailwind v4, shadcn/radix). Read `platform/AGENTS.md`:
  this Next.js version is newer than most training data — check `node_modules/next/dist/docs/`.
- Contract for solutions: `platform/MODULE_GUIDE.md`. Data bible: `platform/WORLD.md`.
- AI core: `platform/src/lib/ai/*` — `client.ts` (OpenAI-compatible fetch client + telemetry),
  `json.ts` (zod structured output), `agent.ts` (tools + approval gates), `rag.ts`, `stream.ts` (SSE).
- Model/provider config: `platform/src/lib/ai/config.ts` + `.env.local` (`NARVO_PROVIDER=openrouter|local`).
- Runtime state: `platform/data/runtime/db.json` (gitignored). "Reset" in each solution clears its part.

## Commands
- `cd platform && npm run dev` — dev server on :3000
- `npx tsc --noEmit -p .` — type-check (run `npx next typegen` first if route types are missing)
- `npm run build && npm start` — production (faster for demos)

## Rules
- Never commit `.env*` files or API keys.
- Keep solution code inside its own folders; shared changes go in `src/lib`, `src/components`.
- Numbers are computed in code; models read, explain and draft. State changes go through approvals.

## On the Mac
Follow `MAC_SETUP.md` end to end, then run the verification list in section 7.
