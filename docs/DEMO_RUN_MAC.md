# NARVO — recorded demo run on the Mac (fully private, ~7 minutes)

Measured on this Mac (Apple M4 Max, 36 GB) on 11 Oct 2026 with LM Studio serving **qwen/qwen3.8-27b only**
(context 65 536, parallel 4, no TTL), narvo built with `npm run build` and served by `npm start`.
Timings are wall-clock from click to the last line on screen with the GPU otherwise idle. Arabic benchmark at
that time: first token 1.1 s, **24 tokens/s**. Data egress counter after the whole run: **0 B**.

## Before you record (10 minutes)

1. Only one model may be loaded. `~/.local/bin/lms ps` must show `qwen/qwen3.8-27b`, CONTEXT `65536`,
   no TTL. If it shows 8192 or a TTL, it was JIT-reloaded: `lms unload --all` then
   `lms load qwen/qwen3.8-27b --context-length 65536 --parallel 4`. Never load a second large model
   (36 GB runs out of memory and macOS kills the NARVO processes).
2. Speech server: `cd ~/Projects/narvo/platform && PATH="$HOME/.local/bin:$PATH" .venv-stt/bin/python tools/stt_server.py`
   (needs ffmpeg on PATH; loads Whisper from the local cache, no network).
3. App: `cd ~/Projects/narvo/platform && npm start` → http://localhost:3000 (already running after the build).
4. Nothing else may use the model while recording (other apps, captioning, QA scripts): every concurrent
   request slows the demo 2–5×.
5. ⌘K → **Reset all demo data** (or the *Reset* button on 05 and 07).
6. Warm the model: `/solutions/04-private-ai-platform` → *Models* → **Run Arabic benchmark** once.
7. Browser window 1440×900, zoom 100 %. Language toggle (top bar, `EN | ع`) set to **EN** to start.

## The run

| # | Time on screen | URL | Click, in this order | Model time (measured) | Say |
|---|---|---|---|---|---|
| 1 | 0:00–0:35 | `http://localhost:3000/` | Nothing — let the dark privacy card load (it shows *Private mode — on this device*, `Qwen3.8 27B · 127.0.0.1:1234`, Data egress **0 B**). Hover the five demo-path cards. | none | "Twenty AI solutions on one private core. The model, the documents and the answers stay on this Mac — the counter shows the bytes that left the machine: zero." |
| 2 | 0:35–1:10 | `/stack` | Scroll once to the layers (Solutions → NARVO core → Model runtime → Open-weight model → hardware). | none | "Open-weight Qwen3.8 27B, served by MLX/LM Studio on Apple silicon; the same code runs on a GPU server." |
| 3 | 1:10–1:40 | `/solutions/04-private-ai-platform` | Tab **Models** → **Run Arabic benchmark** on the Qwen3.8 27B card. Then tab **Telemetry**. | **4.5 s** (first token 1.1 s, 24 tok/s) | "Measured live: first token in a second, 24 tokens per second, in formal Arabic. Every call is logged — tokens, latency, and zero egress." |
| 4 | 1:40–4:10 | `/solutions/05-case-operations` | Click case **MNDA-HG-2026-005203** (Obaid Hamad Al Ketbi) in the list → **Run completeness review**. Watch the Agent trace (right). When it finishes, scroll the *AI review* tab (Circular 9/2026 checks: salary certificate 39 days old, income difference 6.1 %), then press the approval button **Approve & send** on the Arabic clarification. Show the *Correspondence* tab. | **257 s** for the review (six scans read by the vision model 50–133 s each, three in parallel, then three agent steps ~20 s each). Approve: instant. | "It reads six Arabic and English scans — IDs, family book, salary certificate — with the private vision model. The rules are computed in code, not guessed. The agent pulls the no-property certificate itself because consent is on the form. One Arabic clarification waits for a named official — I approve it, and the case, SLA clock and audit trail update." **Cut or speed up 4× in editing between the click and the last trace step** (about 3½ minutes of reading). |
| 5 | 4:10–6:10 | `/solutions/07-contact-operations` | Switch the top-bar language to **ع** first (the whole UI turns RTL). In *Contact queue* click the WhatsApp contact **+971 50 418 2276** (Saeed: «شو صار على طلب الإسكان مالي؟»). Then click the hint chips under the composer in order: **رقم هويتي 784-…** → **أبا أحجز موعد عشان أسلّم الأوراق** → type «تمام، احجز لي أول موعد متاح لو سمحت» + Enter → **أبا أكلم موظف لو سمحت**. | **29 s** (greeting + asks for ID), **31 s** (verified, reads the live case, cites the circular), **30 s** (offers real slots), **35 s** (books an APT), **51 s** (handover with summary) | "Emirati dialect on WhatsApp. It asks for the Emirates ID before disclosing anything, then reads his live housing case, cites the circular, books a real appointment and hands over to a person with the full context." Optional: cut the waits to ~5 s each. |
| 6 | 6:10–6:50 | `/solutions/02-decision-intelligence` | Switch back to **EN**. Tab **Ask the data** → type *How has the housing backlog developed since July compared with decisions issued?* → Enter. | **32 s** (query spec 19 s + cited answer 11 s; the chart is computed in code) | "The model only writes a validated query; the numbers and the chart are computed from the scorecard, and the answer cites them." |
| 7 | 6:50–7:20 | `/inbox`, then `/audit` | Show the approval executed in step 4 under *Approved*, then the audit trail entries (AI and people). Finish on the sidebar card: **On-device · Private · 0 B**. | none | "People decide, AI prepares — and every action is in an audit trail on your own infrastructure." |

Total: ~7 min 20 s with the 05 reading phase compressed (≈ 11 min uncut).

## Voice (optional, between steps 5 and 6)

Speech-to-text runs on the Mac (Whisper large-v3-turbo on MLX): a 29-second Arabic clip transcribes in
**2.0 s** through `/api/voice/transcribe`. In 07 switch the conversation to **Voice** and hold the
microphone button; replies are read aloud with the macOS Arabic voice (add *Majed* under System Settings →
Accessibility → Spoken Content). Test the microphone permission in the browser before recording.

## Keep out of the video (work, but too slow on one local GPU)

Measured under load during QA (single-user is roughly 3–5× faster, still too long on camera):

- **02** *Generate briefing* and *Propose decisions* (10–10.5K-token prompts, ~1 000 output tokens; 350 s under load).
  *Figure check* is fine to show if pre-run (two parallel extractions, ~290 s under load).
- **03** *Explain the delays* (182 s under load) and *Draft change memo* (294 s under load) — pre-run, then show results.
- **06** full *Translate* of a document (32 segments, 357 s under load) and *Bring your own* photo OCR (one page, 324 s under load) — pre-run.
- **07** Supervisor → *Find themes* (3 200 + 2 000-token JSON generations).
- **08** brief, conflicts, handover (10–11.4K-token prompts, 4–9 min under load).
- **09** *Extract + map* (8 large JSON calls in parallel), **10** *Generate missing* (9 variants),
  **12** *Evaluate all 24 CVs*, **13** playbook review and obligation extraction (8–12K prompts) — pre-run only.
- **14** live first read of the invoice scan (228 s under load), **15** *Compare submissions* and the evaluation report, **16** *Generate options*, **18** before/after closure check, **19** *Create service report* — pre-run only. **20** was not verified.
- Avoid running **13 Renewal** twice without approving (it reports "already awaiting approval").

Good short alternatives if you want a different pilot (times measured under heavy load; expect 3–5× faster alone): **18 Visual Inspection** → *Screen photo* (vision model boxes 4 findings on the photo, 86 s) → Accept/Reject → *Draft notice* EN+AR (72 s) → Approve; **17 Demand Planning** what-if buttons (instant, computed in code) → *Explain trade-offs* (179 s) → approve plan C; **11 Employee Services** salary-certificate chat in Arabic
→ form → submit → approve (about 1 min under load), **13** *Ask a contract* suggestion chip (cited answer,
80 s under load), **01** *Ask* (cited answer; 200 s under load).

## If something goes wrong

- A step shows "Model unloaded" or "did not start responding within 180 s": another client is using or
  reloading the model — check `lms ps` (see *Before you record*, step 1) and click the button again.
- Reset a solution with its *Reset* button (top right) and reload the page.
