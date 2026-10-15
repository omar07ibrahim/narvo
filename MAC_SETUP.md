# NARVO on the Mac — fully private setup

Target: **Apple Silicon Mac, 32 GB unified memory** (M4 Max / M4 Pro). Everything below runs offline
after the first download. Expected total download: ~22 GB (models) + ~1 GB (tooling).

> This file is written for Claude Code running on the Mac. Work through it top to bottom, verify each
> step, and fix anything that does not match. The app is in `platform/`.

## 1. Tooling

```bash
xcode-select --install                 # if git/clang are missing
brew install node@22 git gh python@3.12
brew install --cask lm-studio          # model server with the MLX engine
```

## 2. Get the code

```bash
gh auth login
gh repo clone <owner>/narvo ~/narvo     # private repo created from Windows
cd ~/narvo/platform
npm ci
```

## 3. Models (LM Studio → MLX)

Open LM Studio once, then use its CLI (`lms`, installed from LM Studio → Settings → CLI):

```bash
lms get qwen3.8-27b@4bit        # the only model (Apache 2.0, multimodal: text + vision + tools) ~16 GB — pick the MLX build
lms ls                          # shows the exact model id
lms server start --port 1234    # OpenAI-compatible API at http://127.0.0.1:1234/v1
lms load qwen/qwen3.8-27b --context-length 65536 --parallel 4   # load it explicitly, no TTL
```

Load the model explicitly as above and keep it loaded. Several flows send 8–11K-token prompts; a model
that LM Studio loads "just in time" gets its default 8 192-token context and a 1 h TTL, and those flows
then fail or are truncated (`lms ps` must show CONTEXT 65536 and no TTL). Do not load a second large model
next to it: on 32–36 GB the Mac runs out of memory and macOS kills the NARVO processes.

## 4. Speech (Whisper on MLX)

```bash
cd ~/narvo/platform
python3.12 -m venv .venv-stt && source .venv-stt/bin/activate
pip install mlx-whisper fastapi uvicorn python-multipart
python tools/stt_server.py      # http://127.0.0.1:8090/v1 — first run downloads whisper-large-v3-turbo (~1.6 GB)
```

Arabic text-to-speech uses the macOS system voices (System Settings → Accessibility → Spoken Content →
System Voice → add **Majed** / Arabic). The browser picks them up automatically and works offline.

## 5. Configure private mode

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```
NARVO_PROVIDER=local
LOCAL_BASE_URL=http://127.0.0.1:1234/v1
LOCAL_API_KEY=lm-studio
LOCAL_STT_BASE_URL=http://127.0.0.1:8090/v1
# Map catalogue keys to the ids printed by `lms ls` / GET http://127.0.0.1:1234/v1/models
NARVO_LOCAL_MODEL_MAP={"qwen3.8-27b":"<id of the Qwen build>"}
```

## 6. Run

```bash
npm run build      # needs internet once (fonts are downloaded and self-hosted at build time)
npm start          # http://localhost:3000
```

## 7. Verify (do all of these)

1. Top-left status card says **On-device · Private** and the host is `127.0.0.1:1234`.
2. `/solutions/04-private-ai-platform` → Models: Qwen shows **Available**; run the Arabic benchmark.
3. Same page → Evaluation → **Run suite** — expect ≥ 90%.
4. `/solutions/05-case-operations` → case 005203 → **Run completeness review** — all six scans are read,
   the clarification is drafted in Arabic, approve it.
5. `/solutions/07-contact-operations` → hold the mic button and speak Arabic → transcript + spoken reply.
6. **Turn Wi-Fi off** and repeat 4 and 5. The data-egress counter must stay at **0 B**.

## 8. Performance notes

- Qwen3.8 27B (dense, 4-bit) on M4 Max: roughly 15–25 tokens/s; M4 Pro about half. Vision reading of a
  document page takes several seconds — the review runs three documents in parallel.
- Keep reasoning off (default). Close other memory-heavy apps before the demo.

## 9. Troubleshooting

| Symptom | Fix |
|---|---|
| "Model provider error 404 model not found" | Fix `NARVO_LOCAL_MODEL_MAP` with the exact id from `lms ls` |
| Very slow first answer | Model is loading (JIT). Warm it up by running the benchmark once |
| Voice: "Local speech server error" | Start `tools/stt_server.py` (ffmpeg must be on `PATH`); check `LOCAL_STT_BASE_URL` |
| Out-of-memory / swap, NARVO processes killed | Only Qwen3.8 27B may be loaded (`lms ps`); close other memory-heavy apps; if still tight, reload with `--context-length 32768` |
| "Model unloaded" / long prompts fail | The model was JIT-reloaded with an 8 192 context: `lms unload --all` then the `lms load … --context-length 65536 --parallel 4` line from section 3 |
| Fonts look wrong offline | Run `npm run build` once while online |
