# NARVO — demo script

Every solution also has its own step-by-step **Demo script** button (top right of each page).
This file is the presenter's overview: what to open, in which order, and the moment to pause on.

## Before the meeting (10 minutes)

1. Start the platform (`npm start` in `platform/`) and the model server (private mode: see MAC_SETUP.md).
2. Press **⌘K → Reset all demo data**. Approvals, audit and records return to their starting state.
3. Warm the model: `/solutions/04-private-ai-platform` → Models → **Run Arabic benchmark** once.
4. Optional pre-runs for slow steps (results are kept until Reset): 12 Recruitment → **Evaluate all 24 CVs** (~2 min);
   09 Bid → **Extract + map** (~1 min).
5. Close other apps; set the browser to full screen.

## The 15-minute tour

| Min | Where | Say / show |
|---|---|---|
| 0–2 | **Command Center** `/` | Twenty solutions on one private core. Point at the dark privacy card: model, host, bytes that left the machine. |
| 2–7 | **05 Case operations** → case 005203 → *Run completeness review* | Six Arabic/English scans read live. Circular 9/2026 checks are computed (salary certificate 39 days old, income difference 6.1%). The agent pulls the no-property certificate from the Land Registry because consent is on the form. One Arabic clarification waits for **Mariam Al Kaabi** — approve it, then show Correspondence and History. |
| 7–10 | **07 Contact operations** | Speak or type in Emirati Arabic: «شو صار على طلب الإسكان مالي؟». The assistant verifies identity first, then reads the case status live — the one you just changed in 05. Book an appointment; show the handoff with full context. |
| 10–12 | **02 Decision intelligence** → *Generate briefing*, then *Figure check* | The Director-General's weekly briefing with every figure computed and traced; the figure check catches the six wrong numbers in department notes. |
| 12–15 | **How it runs** `/stack`, then **turn Wi-Fi off** | Open-weight models, their hardware, our audit trail. Re-run anything — it still works; the egress counter stays at 0 B. |

## Twenty solutions — the moment to show in each

| # | Solution | The moment |
|---|---|---|
| 01 | Enterprise AI Workspace | Switch role Contractor → Director and ask the same question: restricted documents are withheld, then cited. Ask the agent for a Marina Quarter briefing with review tasks, approve one, see it in Tasks. |
| 02 | Decision Intelligence | Briefing with 31 traced figures; figure check catches the planted discrepancies; *Ask the data* answers with a computed chart. |
| 03 | Process Intelligence | The process map of 1,047 permits; root cause quotes officer notes; simulate the NOC intake check (21.6 → 18.9 days, 27% → 13% rework). |
| 04 | Private AI Platform | Telemetry of every call; Arabic benchmark Qwen vs Gemma; evaluation suite scored in code (10/10); access matrix per role. |
| 05 | Case Operations | See the tour above. Then 005231 (complete loan file → move to verification) and 005219 (income above the grant ceiling). *Inspect a document* with any photo. |
| 06 | Arabic Documents | Translate Circular 14/2026 AR → EN with 100% glossary compliance; the EN spec keeps its tables; a disputed term goes to the terminology lead. |
| 07 | Contact Operations | See the tour. Supervisor → *Find themes* clusters 50 conversations and drafts an FAQ update. |
| 08 | Sales Intelligence | Gulf Crest OPP-2026-0418: conflicts between quote, draft PO and frame agreement; handover pack for the new account manager; approve the follow-up → CRM updates. |
| 09 | Bid & Proposal | 46 requirements extracted from the MNDA tender; evidence matrix; the claim check flags "100% PPM compliance" (records say 94.1%). |
| 10 | Brand Content | Generate ThermaShield variants in EN/AR from approved facts; change the warranty 10 → 12 years and exactly the affected variants regenerate. |
| 11 | Employee Services | As Obaid Al Ketbi ask for a salary certificate in Arabic; approve, fulfil, complete — status timeline updates. |
| 12 | Recruitment | Fairness guard shows what the model never sees; ranked 24 CVs with quoted evidence; paste interview notes → the finalist comparison updates. |
| 13 | Contracts | Review the incoming vendor draft against the 16-position playbook; renewal brief for contract 019 with service credits computed. |
| 14 | Finance Operations | Read the Sahara invoice scan; 3-way match shows the short receipt; resolution routes to the CFO above AED 50,000; journal recorded. |
| 15 | Procurement | Compare three FM bids; send clarification questions; paste Al Bahar's response → scores and certificate update; ranking computed. |
| 16 | Order Exceptions | SO-26-11842: 120 t requested, 64 t available; the split option keeps the customer within credit; approve → order and notice updated. |
| 17 | Demand Planning | Forecast with uncertainty and a real backtest; compare plans against storage limits; add +15% Marina Quarter demand and recompute. |
| 18 | Visual Inspection | Analyse a site photo: findings boxed on the image; accept/reject; bilingual violation notice for approval. Try the live camera. |
| 19 | Field Service | Job brief for the CH-02 chiller trip with 14 sources; ask the manual by voice in Arabic; the visit report keeps the missing part open as a follow-up job. |
| 20 | Facility Intelligence | Chiller trips line up with 44 °C afternoons and an overdue coil cleaning; approve the work order; verification passes on post-fix data. |

## If something goes wrong

- A step seems stuck: the model may be loading. Wait 20 s or switch to Gemma 4 in the top bar.
- Data looks "used": ⌘K → Reset all demo data (or *Reset* on the solution page).
- Voice does not respond: check the speech server (private mode) or type instead — the flow is identical.

All organisations, people and figures in the demo are fictional (see `platform/WORLD.md`).
