# NARVO Demo World — the bible

Every module's data must be consistent with this file. Both organisations, all people, IDs,
companies and figures are **fictional**. They must *feel* real: an executive from a UAE government
entity should recognise the texture of their own organisation.

## 0. Realism rules (read first)

- **No placeholder smell.** Never use "Lorem ipsum", "John Doe", "Acme", "Company A", "Test", "Sample 1",
  round fake numbers (100, 1000, 50%) or perfectly tidy data. Real data has odd totals (AED 17,942,600),
  partial fields, typos in customer messages, mixed Arabic/English, late documents.
- **Arabic must be native quality.** Formal documents in Modern Standard Arabic (UAE government register:
  "تعميم رقم", "يُعمل به اعتباراً من", "المتعامل"); customer messages/calls may use Gulf (Emirati) dialect
  ("أبا أعرف", "شو صار على طلبي", "لو سمحت", "مشكور"). Mixed code-switching is normal ("الـ NOC ما وصل").
- **Dates.** Data runs up to **Friday 9 October 2026**. Demo "today" is **Sunday 11 October 2026**. UAE
  workweek is Monday–Friday (Friday half-day). Summer midday work ban: 15 June – 15 September, 12:30–15:00.
  Ramadan 2026 ≈ 18 Feb – 19 Mar 2026; Eid Al Adha 2026 ≈ 26–29 May.
- **Money.** AED, VAT 5%. Format `AED 17,942,600`. Arabic: `17,942,600 درهم`.
- **Never** use real UAE government entity names as actors, real people, or real company names (except as
  generic standards bodies or test methods: ISO 41001, ISO 45001, ASTM C1549). Real UAE place names may
  appear only as general geography (Dubai, Abu Dhabi, Jebel Ali, Al Quoz).
- Identity-document lookalikes (Emirates ID copies, family book pages) must carry a visible
  **"SPECIMEN — DEMO DATA"** watermark.

### ID formats

| Thing | Format | Example |
|---|---|---|
| Emirates ID | 784-YYYY-NNNNNNN-C | 784-1988-6630417-2 |
| UAE mobile | +971 5X XXX XXXX | +971 50 418 2276 |
| Housing case | MNDA-HG-2026-NNNNNN | MNDA-HG-2026-004817 |
| Building permit application | MNDA-BP-2026-NNNNN | MNDA-BP-2026-01932 |
| Customer Happiness ticket | CHC-2026-NNNNNN | CHC-2026-118204 |
| Plot number | MN-DD-SSS-PPPP (district-sector-plot) | MN-04-117-0031 |
| MNDA tender | MNDA/PRC/2026/NNN | MNDA/PRC/2026/041 |
| MNDA contract | MNDA/CON/YYYY/NNN | MNDA/CON/2023/019 |
| MNDA circular | Circular No. N/2026 — ref MNDA/<DEPT>/CIR/NN/2026 | MNDA/HCS/CIR/09/2026 |
| Trade licence | CN-NNNNNNN | CN-2194407 |
| TRN (VAT) | 100XXXXXXXXXXXX (15 digits) | 100384920500003 |
| Raseen sales order / PO / GRN / invoice | SO-26-NNNNN / RBM-PO-26-NNNNN / GRN-26-NNNNN / supplier format | SO-26-11842 |
| Raseen FM job | JOB-RFM-26-NNNNN | JOB-RFM-26-04471 |
| Emails | firstname.lastname@mnda.gov.ae · firstname.l@raseen.ae | hessa.alsuwaidi@mnda.gov.ae |

## 1. Marsa Al Noor (مرسى النور)

A fictional planned coastal city in the UAE, established by (fictional) Law No. 4 of 2011, between Abu Dhabi
and Dubai. Population **186,400** (2026 estimate, 38% UAE nationals). Area 412 km².

| Code | District | Character |
|---|---|---|
| MN-01 | Downtown (وسط المدينة) | MNDA Tower, Corniche Road, offices |
| MN-02 | Al Murjan (المرجان) | older villas, citizens' housing |
| MN-03 | Al Lulu Island (جزيرة اللؤلؤ) | **gated**, master developer: Lulu Island Developments PJSC |
| MN-04 | Al Waha Gardens (حدائق الواحة) | citizens' housing, new plots |
| MN-05 | Ras Al Marsa Industrial (رأس المرسى الصناعية) | warehouses, Raseen depot |
| MN-06 | Al Sidr Residential (السدر السكنية) | **gated**, master developer: Sidr Communities LLC |
| MN-07 | Al Ghaf Community (مجتمع الغاف) | Al Ghaf Community Centre |
| MN-08 | Marina Quarter (حي المارينا) | **gated**, high-rise, master developer: Marina Quarter Properties LLC |

## 2. MNDA — Marsa Al Noor Development Authority (هيئة مرسى النور للتطوير)

Government authority for planning, building permits, housing, community services, facilities and
municipal field operations. ~**1,240 employees**. HQ: MNDA Tower, Corniche Road, MN-01.
Hotline **800 6632 ("800 MNDA")**, app "MNDA Smart", WhatsApp +971 50 663 2000, three Customer Happiness
Centres (Downtown, Al Murjan, Al Waha).

### People

| Name | Arabic | Role |
|---|---|---|
| H.E. Eng. Khalid Saif Al Mazrouei | سعادة المهندس خالد سيف المزروعي | Director General |
| Dr. Amna Rashid Al Ketbi | د. آمنة راشد الكتبي | Executive Director, Strategy & Performance Office |
| Hessa Abdulla Al Suwaidi | حصة عبدالله السويدي | Director, Digital Transformation Office (demo persona) |
| Eng. Omar Yousef Al Hammadi | م. عمر يوسف الحمادي | Director, Planning & Building Permits |
| Fatima Obaid Al Nuaimi | فاطمة عبيد النعيمي | Director, Housing & Community Services |
| Mariam Saeed Al Kaabi | مريم سعيد الكعبي | Head, Housing Applications Section (approver for cases) |
| Khalfan Mohammed Al Ali | خلفان محمد العلي | Senior Case Officer, Housing |
| Sara Ahmed Al Blooshi | سارة أحمد البلوشي | Manager, Customer Happiness Centre |
| Rashed Ali Al Dhaheri | راشد علي الظاهري | Director, Procurement & Contracts |
| Shamma Khalid Al Mansoori | شما خالد المنصوري | Senior Contracts Officer |
| Vikram Menon | فيكرام مينون | Chief Financial Officer |
| Maryam Hassan Al Shamsi | مريم حسن الشامسي | Director, Human Capital |
| Eng. Tariq Mahmoud Saleh | م. طارق محمود صالح | Director, Facilities & Assets |
| Eng. Hamad Juma Al Kaabi | م. حمد جمعة الكعبي | Director, Field Operations & Inspection |
| Adv. Noura Khalifa Al Qubaisi | المحامية نورة خليفة القبيسي | Head of Legal Affairs |
| Yousef Ibrahim Al Hosani | يوسف إبراهيم الحوسني | IT Service Desk Lead |

### Services (selected)

| Code | Service | SLA | Fee |
|---|---|---|---|
| MNDA-SVC-101 | Building Permit — New Construction (رخصة بناء جديدة) | 15 working days | AED 1,500 + AED 3/m² GFA |
| MNDA-SVC-102 | Fit-out Permit (رخصة تشطيبات داخلية) | 5 working days | AED 800 |
| MNDA-SVC-103 | Building Completion Certificate (شهادة إنجاز مبنى) | 10 working days | AED 1,000 |
| MNDA-SVC-201 | Housing Grant & Loan Programme (برنامج المنح والقروض السكنية) — UAE nationals | 12 working days to decision | free |
| MNDA-SVC-202 | Housing Maintenance Grant (منحة صيانة المسكن) | 15 working days | free |
| MNDA-SVC-301 | Community Event Permit (تصريح فعالية مجتمعية) | 3 working days | AED 300 |
| MNDA-SVC-501 | Complaint / Suggestion (شكوى / مقترح) | response 2 working days | — |
| MNDA-SVC-502 | Municipal Maintenance Request (طلب صيانة بلدية) | 3 working days | — |

**Housing programme rules (after Circular 9/2026):** Grant up to **AED 600,000** (household income ≤ AED 30,000 /
month); interest-free Loan up to **AED 900,000** over 25 years (income ≤ AED 60,000). Required documents:
Emirates ID of applicant **and spouse**; complete Family Book copy (all pages incl. children); salary certificate
issued **within the last 30 days** (was 90 days); **Certificate of No Property Ownership** from the Marsa Al Noor
Land Registry (new); 6-month bank statement (loan track only, new); plot allocation letter or purchase
contract; marriage certificate where the family book is not yet updated.

## 3. MNDA storylines (canonical numbers — reuse exactly)

**S1 — Housing surge after Circular 9/2026.** Issued 18 Aug 2026, effective 1 Sep 2026. Applications: Aug 443,
**Sep 612 (+38%)**, 1–9 Oct 214. **41% of September applications incomplete at first review (251 of 612)**.
Missing items among incomplete files: salary certificate older than 30 days 39%, no-property certificate 31%,
spouse Emirates ID 17%, family book pages 13%. Open backlog on 9 Oct: **1,184 cases**. Average resolution time
(September closures) **19.4 days** vs 12-day SLA. Repeat handling **2.3 touches** per case. 14 case officers.

**S2 — Permit delays in gated communities (Circular 14/2026).** Issued 2 Jul 2026, effective 15 Jul 2026:
master-developer NOC mandatory in MN-03, MN-06, MN-08. Q3 2026: **1,047** permit applications, median cycle
**21.6 days** (target 15); gated **27.9** vs non-gated **16.8 days**. "Awaiting master-developer NOC" averages
**9.2 days**. Rework (returned to applicant) **27%**; return reasons: NOC missing/expired 46%, structural calcs not
stamped 18%, site-plan version mismatch 14%, other 22%. Throughput **312 permits issued / month**.
Lulu Island Developments PJSC is the slowest NOC issuer (12.4 days average).

**S3 — Integrated FM tender MNDA/PRC/2026/041** "Integrated Facilities Management Services — MNDA Headquarters &
Customer Happiness Centres (36 months)". Estimated AED 18.6M. Published 18 Aug 2026, closed **30 Sep 2026 14:00**.
Evaluation 70% technical / 30% commercial; ICV ≥ 25%; mandatory ISO 41001, ISO 45001, CAFM, 24/7 helpdesk,
Emiratisation plan. Bids: **Raseen Facilities Management LLC AED 17,942,600**; **Al Bahar Integrated Services LLC
AED 16,718,400** (ISO 41001 certificate expired 14 Aug 2026 → clarification needed); **Crescent FM Solutions LLC
AED 19,846,000** (strongest technical). Committee chair: Rashed Ali Al Dhaheri.

**S3b — Tender MNDA/PRC/2026/057** "Facilities Management Services — Al Ghaf Community Centre & Four Satellite
Community Facilities (24 months)". Estimated AED 5.4M. Published 22 Sep 2026, clarifications closed 8 Oct, closes
**22 Oct 2026**. Raseen FM is preparing its response (solution 09).

**S4 — Al Ghaf Community Centre comfort complaints.** Built 2019, GFA 14,200 m², two air-cooled screw chillers
CH-01/CH-02 (350 TR each), 8 AHUs. Aug–Sep 2026: **23 comfort complaints** (Multipurpose Hall, Ladies' Fitness).
CH-02 high-discharge-pressure trips: **11 in September**, all 13:00–16:00 with ambient > 44 °C. Condenser-coil
cleaning PPM **overdue since 15 Aug 2026**. September chiller energy +17% vs September 2025.
FM contractor: Raseen FM under **contract MNDA/CON/2023/019** (community centres FM, AED 4,200,000 / year,
1 Jan 2024 – 31 Dec 2026; one-year renewal option; renewal/non-renewal notice due 60 days before expiry →
**1 Nov 2026**).

**S5 — Customer Happiness Centre load.** September 2026: **28,940 contacts (+31% vs August 22,090)** — phone 61%,
WhatsApp 24%, app chat 11%, email 4%. Intents: housing application status 34%, permit status 18%, document
requirements 14%, appointments 9%, complaints 8%, maintenance requests 7%, other 10%. Phone wait 6:40, abandonment
14.2%, first-contact resolution 61%, repeat contacts within 7 days 34%, cost per contact AED 18.40.

**S6 — Hiring.** Requisition MNDA-HR-REQ-2026-077 "Senior Planning Engineer — Building Permits", posted 7 Sep,
closed 28 Sep 2026, **86 applications**, 6 finalists. Hiring manager Eng. Omar Al Hammadi; HR Maryam Al Shamsi.
AI may never score on nationality, gender, age, marital status or photo; Emiratisation policy is applied by HR as
a separate, explicit step.

**S7 — Site inspections.** Q3 2026: **2,316** inspections, **412** violations. Top categories: missing edge
protection, PPE non-compliance, unsafe scaffolding (no guardrails/toe boards), unprotected rebar starters, poor
housekeeping/material storage, damaged hoarding/missing signage, open excavation without barriers, missing fire
extinguishers.

**S8 — Employee services.** IT Service Desk and HR requests; most common: salary certificates (many staff are
themselves housing applicants!), leave balance, remote-work requests (policy HC-POL-07), laptop replacement.

**S9 — Terminology.** International consultants on Marina Quarter need English versions of Arabic circulars and the
building code; MNDA glossary governs translation.

## 4. Raseen Group (مجموعة رصين)

Family-owned group founded **1996** by Saeed Abdulrahman Al Falasi (Chairman). HQ: Raseen Building, Al Quoz
Industrial 3, Dubai. Group revenue ~AED 1.1bn.

| Person | Role |
|---|---|
| Saeed Abdulrahman Al Falasi | Chairman |
| Abdulrahman Saeed Al Falasi | Group CEO |
| Karim Haddad | Chief Operating Officer (demo persona) |
| Priya Raghavan | Group CFO |
| Tariq Nasser | General Manager, Raseen Building Materials |
| Fadi Khoury | Sales Director, RBM |
| Ahmed Soliman / Rania Mansour / Vishal Kapoor | Key Account Managers, RBM |
| Hana Yousef | Marketing & Brand Manager |
| Deepak Menon | AP Supervisor, Group Finance |
| Joseph Abraham | Supply Chain & Planning Manager |
| Leena Mattar | Bid Manager, Raseen FM |
| Mohammed Rafiq | HVAC Supervisor, Raseen FM |
| Arun Pillai | Senior HVAC Technician, Raseen FM (11 yrs) |

**Raseen Building Materials Trading LLC (RBM)** — distributor; warehouses Jebel Ali (18,000 pallet positions, rebar
yard 4,200 t) and Ras Al Marsa Industrial MN-05 (6,500 pallet positions). ~1,850 active trade accounts.

SKUs: `CEM-OPC-50` OPC 42.5N cement 50 kg bag · `CEM-SRC-50` sulphate-resisting cement 50 kg · `RB-B500-12/16/20/25`
rebar B500B (tonnes) · `BLK-HOL-20` hollow block 20 cm · `TIL-POR-60120` porcelain tile 60×120 matt (m²) ·
`TIL-CER-3060` ceramic wall tile (m²) · `SAN-WC-WH` wall-hung WC set · `WPF-BIT-4` bitumen membrane 4 mm (roll) ·
`PNT-TS-20` **Raseen ThermaShield** heat-reflective roof coating 20 L (new product, launch 1 Nov 2026).

Customers (contractors): Bin Hilal Contracting LLC · Gulf Crest Builders LLC · Arabian Peninsula Construction Co.
(APCC) · Al Marsa Engineering & Contracting LLC · Emerald Line Construction LLC · Saqr Al Noor Contracting LLC.
Suppliers: Northern Emirates Cement Co. · Sahara Rebar Mills LLC (planned mill maintenance **5–19 Oct 2026**) ·
Andalus Ceramics Trading LLC · Gulf Bitumen Products FZCO · Al Waha Blocks Factory LLC.

**Raseen Facilities Management LLC (RFM)** — ~1,100 staff; ISO 41001, ISO 45001, ISO 9001; CAFM "Maximo-like" in-house
system "RFM Connect"; incumbent FM for MNDA community centres (contract MNDA/CON/2023/019).

## 5. Raseen storylines

**R1 — Stalled key account.** Opportunity OPP-2026-0418 "Marina Quarter Tower B — structural materials package",
Gulf Crest Builders LLC, **AED 3,420,000**, stage Negotiation, stalled 23 days. Conflicts: quote Q-2026-0918 rebar
AED 2,780/t valid to 30 Sep vs customer draft PO at AED 2,690/t; payment terms quoted 60 days vs requested 90; KAM
changed from Ahmed Soliman to Rania Mansour on 1 Oct 2026 (handover).

**R2 — Bid for MNDA/PRC/2026/057** (see S3b). Bid manager Leena Mattar; 46 requirements.

**R3 — ThermaShield launch.** Approved facts: solar reflectance 0.88, SRI 110, roof surface up to 18 °C cooler (lab
report RBM-LAB-26-112, tested at 46 °C ambient per ASTM C1549 / ASTM E1980), water-based acrylic, 2 coats at
1.2–1.5 m²/L, 10-year warranty when applied by a Raseen-certified applicator, AED 385 per 20 L pail. Forbidden
claims: "eliminates the need for air conditioning", "100% leak-proof", any government certification.

**R4 — September AP exceptions.** 46 supplier invoices, 9 exceptions: short receipt (GRN 18 t vs invoice 20 t
RB-B500-16), un-agreed cement surcharge AED 1.20/bag, duplicate invoice re-sent with new date, VAT computed on wrong
base, freight not on PO, wrong PO reference, price variance after expired quote, missing TRN, partial credit note.

**R5 — Order exceptions.** SO-26-11842 Gulf Crest Builders: RB-B500-16 120 t requested, 64 t available (Sahara mill
maintenance); Marina Quarter delivery window Mon–Sat 09:00–16:00 only; contract price list mismatch; credit exposure
AED 2.1M vs limit AED 2.0M.

**R6 — Demand.** Weekly sales history Oct 2023 – Oct 2026 for the 12 SKUs, with Ramadan dips, summer midday-ban
slowdown and Q4 peaks; capacity limits from section 4.

**R7 — Field job.** JOB-RFM-26-04471 "CH-02 high discharge pressure trip — Al Ghaf Community Centre", technician Arun
Pillai, supervisor Mohammed Rafiq. Links to S4.

## 6. Cross-links (use them — they make the world feel connected)

- The housing backlog (S1) drives CHC calls (S5), the DG briefing (02) and staff salary-certificate requests (S8).
- Circular 14/2026 (S2) is the root cause found by process intelligence (03) and appears in the DG briefing (02).
- Raseen FM bids for 057 (09) while MNDA evaluates 041 (15); Raseen FM is the incumbent under MNDA/CON/2023/019 whose
  renewal notice deadline is 1 Nov 2026 (13); its chiller job at Al Ghaf (19) is the cause of complaints (20).
- Sahara Rebar Mills maintenance (R5) shows up in order exceptions (16), demand planning (17) and finance (14).
