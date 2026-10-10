# NARVO — Private Intelligence Platform

Twenty AI solutions from the NARVO catalogue running on **one private core**: open-weight models
(Qwen3.8 27B by default), Arabic-first, agents with human approval gates, a full audit trail and a
data-egress meter. Built to be demonstrated live — and fully offline on an Apple Silicon Mac.

```
platform/            Next.js 16 app (UI + API + AI core)
  src/lib/ai/        model client, structured output, agent runtime, RAG, SSE streaming, telemetry
  src/lib/store/     runtime state: approvals, audit trail, record overlays
  src/components/    design system (NARVO catalogue style) + shell
  src/app/solutions/ the 20 solutions (one folder each) — API routes under src/app/api/solutions/
  data/              fictional demo world: MNDA (government) and Raseen Group (private)
  WORLD.md           the data bible — every module's data follows it
  MODULE_GUIDE.md    how a solution is built
docs/                meeting brief and demo material
MAC_SETUP.md         private on-device setup (LM Studio + MLX + Whisper)
```

## Run (development)

```bash
cd platform
cp .env.example .env.local   # add an OpenRouter key for development, or configure local mode
npm install
npm run dev                  # http://localhost:3000
```

## Run privately on a Mac

See [MAC_SETUP.md](MAC_SETUP.md). One setting switches every solution to the on-device model server:
`NARVO_PROVIDER=local`.

## Demo organisations

The **Marsa Al Noor Development Authority (MNDA)** and **Raseen Group** are fictional. All people,
identifiers, documents and figures are synthetic and consistent with `platform/WORLD.md`. Identity-document
lookalikes carry a SPECIMEN watermark.
