---
id: RFM-PPM-HVAC-SET
title: PPM Checklists — Community Centres (MNDA/CON/2023/019)
title_ar: قوائم فحص الصيانة الوقائية المخططة — المراكز المجتمعية (العقد MNDA/CON/2023/019)
type: Checklist
ref: RFM-PPM-SET Rev 4
date: 2026-01-10
owner: Raseen FM — Maintenance Planning
classification: Internal
lang: en
---

# PPM Checklists — Community Centres (MNDA/CON/2023/019)

| Item | Detail |
|---|---|
| Reference | RFM-PPM-SET Rev 4, 10 January 2026 (supersedes Rev 3, January 2025) |
| Contract | MNDA/CON/2023/019 — FM services for MNDA community centres, 1 Jan 2024 – 31 Dec 2026 |
| Sites | Al Ghaf Community Centre (AGCC, MN-07) · Al Murjan Community Centre (AMCC, MN-02) · Al Waha Gardens Family Centre (AWFC, MN-04) · Downtown Youth & Sports Hall (DYSH, MN-01) · Al Sidr Community Majlis (ASCM, MN-06) |
| Owner | Raseen FM — Maintenance Planning |
| System | PPM jobs are generated and closed in RFM Connect |

Rev 4 changes: approach and subcooling added to chiller readings; condenser coil cleaning interval rule clarified;
jockey pump starts-per-hour limit added.

## General rules for all PPM checklists

- Each checklist generates a PPM job in RFM Connect on its due date. Readings are entered on the RFM Connect mobile
  app against the asset tag; an out-of-range reading creates a follow-up corrective job automatically.
- Permit to work and LOTO (RFM-HSE-PRO-007) apply to every item that needs a panel opened, a guard removed or a
  system drained.
- A PPM is **overdue from the day after its due date**. Overdue by more than 14 days: escalated to the discipline
  supervisor. Overdue by more than 30 days: reported to MNDA in the monthly FM report with a recovery date.
- Contract KPI: **PPM completion of at least 95% per month** across all sites.
- Every PPM visit closes with a service report meeting RFM-QA-STD-004.

## RFM-PPM-HVAC-001 — Air-cooled chiller quarterly PPM

**Applies to:** AGCC-CH-01 and AGCC-CH-02 (Aldara ACX-350, R-134a, 2 circuits); AMCC-CH-01 (Aldara ACX-120, R-410A).
**Frequency:** quarterly. **Duration:** about 4 hours per chiller. **Resource:** senior HVAC technician holding a
Raseen refrigerant handling certificate and LOTO authorisation. **Permits:** PTW, roof access, LOTO for electrical
items.

**A. Before starting**

- Download the controller alarm history since the last PPM and record the number of events by code (W21, A21, A22,
  A31, A40 and others), with date, time and circuit of each A21 or A22.
- Review BMS trends: leaving chilled-water temperature, run hours and starts per compressor.

**B. Readings per circuit** — at 75% load or more, stable for 10 minutes:

| Reading | Unit | Circuit A | Circuit B | Normal range (ACX-350, clean coil) |
|---|---|---|---|---|
| Ambient (shaded, 1.5 m above roof) | °C | | | — |
| Chilled water entering / leaving | °C | | | 13.3 / 7.2 design |
| Suction pressure | kPa(g) | | | 215–245 |
| Discharge pressure | kPa(g) | | | 1,180–1,260 at 35 °C · 1,540–1,620 at 46 °C |
| Saturated condensing temperature (SCT) | °C | | | 48–50 at 35 °C · 58–60 at 46 °C |
| Condenser approach (SCT − ambient) | K | | | 12–15; above 18 = airflow or coil problem |
| Liquid subcooling | K | | | 5–8; above 10 suggests overcharge |
| Discharge superheat | K | | | 15–25 |
| Compressor current L1 / L2 / L3 | A | | | 305–365; RLA 384 |
| Condenser fan currents (6 fans per circuit) | A | | | 4.2–4.9 each; FLA 5.1 |
| Oil filter differential (oil pressure check) | kPa | | | 40–90; warning 140 |
| Compressor load, run hours, starts | %, h, n | | | — |

**C. Mechanical checks**

- All condenser fans running at full speed; no bearing noise; vibration on each motor bracket with RFM-TL-0433 (below
  2.8 mm/s good, 2.8–7.1 monitor, above 7.1 isolate the fan).
- Fan blades and guards intact.
- Condenser coil: photo of each face; face velocity at 3 points with RFM-TL-0420 (clean coil 2.3–2.7 m/s).
- Refrigerant leak check with an electronic detector (required quarterly for 196 kg charge — RFM-HSE-PRO-011).
- Sight glass and moisture indicator; oil level; temperature drop across filter-drier ACX-FD-0048 below 2 K.
- Anti-vibration mounts, suction-line insulation, chilled-water strainer differential, flow switch.

**D. Electrical checks** (thermal scan first, then LOTO)

- Thermal scan of the power panel at load: investigate any connection more than 15 K hotter than similar ones.
- Under LOTO: tighten terminals, inspect fan contactors (RFM-ELE-0318) for pitting, confirm fan MPCBs (RFM-ELE-0325)
  set at 5.1 A, check crankcase and oil heaters.
- Annually (Q1 visit): insulation resistance of fan motors at 500 V DC, at least 2 MΩ.

**E. Controls and safeties**

- Discharge pressure transducer against a calibrated gauge: within ±35 kPa.
- Chilled-water sensors within ±0.3 K.
- High-pressure switch ACX-SW-1930 bench test once a year at the Q1 visit, before summer.

**F. Acceptance**

- All readings within range, or a follow-up job raised with the reading attached.
- **Approach above 18 K: condenser coil cleaning scheduled within 7 days** and the cause investigated per
  ALD-ACX350-SM-07 §7.3.

## RFM-PPM-HVAC-002 — Condenser coil cleaning

**Applies to:** all air-cooled chillers on the contract. **Method:** RFM-MS-HVAC-014. **Duration:** about 3.5 hours
per chiller, 1 senior technician + 1 helper.

**Frequency for this region:**

- **every 3 months from April to October**;
- **every 6 months from November to March**.

The interval is set by the month in which the cleaning is completed: a cleaning done April–October is next due 3
months later; one done November–March is next due 6 months later. Due dates are fixed to the 15th of the month so
that both chillers on a site are cleaned in the same window.

**AGCC CH-01 / CH-02 windows for 2026:** 15 May, 15 August, 15 November.

**Checklist items:**

- Approach recorded **before** cleaning for each circuit at 75% load or more.
- Coil cleaned with **pH-neutral cleaner RFM-CHM-0112 only** — never alkaline RFM-CHM-0109 on epoxy-coated coils.
- Water pressure 6 bar or less (RFM-TL-0310), spray perpendicular to fins, at least 300 mm from the face, fan side
  outwards; foam dwell 5–10 minutes.
- Fins straightened with fin comb RFM-TL-0301; damage over 5% of a face reported.
- Approach recorded **after** cleaning; **target 15 K or less**.
- Before and after photos from fixed positions; cleaner quantity and batch number recorded.

## RFM-PPM-HVAC-010 — AHU monthly PPM

**Applies to:** AGCC-AHU-01 to AGCC-AHU-08 (Ventara). **Frequency:** monthly. **Duration:** about 1.5 hours per AHU.

**Filters**

- Record pressure drop across each filter bank.
- **G4 panel filter VEN-FLT-G4-592** (592 × 592 × 48 mm): replace at 150 Pa or every 3 months, whichever comes first.
- **F7 bag filter VEN-FLT-F7-592** (592 × 592 × 600 mm): replace at 250 Pa or every 6 months, whichever comes first.
- Replace any filter that is wet, torn or bypassing its frame; record quantities used.

**Belts and drives**

- Belt-driven units (AHU-01, -02, -03, -05, -06): check tension with a belt tension gauge, pulley alignment, cracks
  and glazing.
- **AHU-02 and AHU-03 use V-belt set VEN-BLT-SPB2120 (matched set of 3).** Always replace the full matched set,
  never a single belt.
- EC fan-array units (AHU-04, -07, -08) have no belts: check the EC controller fault log instead.

**Drain pans and coil**

- Clean drain pan; no standing water; trap primed; biocide tablet fitted; no overflow staining.
- Chilled-water coil fins clean and straight; control valve strokes fully.

**Fan and motor bearings**

- Listen for noise; bearing temperature no more than 40 K above ambient; vibration below 4.5 mm/s.
- Grease greasable bearings every 3 months per the lubrication schedule.

**Airflow and readings**

- Record supply, return and off-coil air temperatures, fan motor current and fan speed.
- Quarterly: measure supply airflow (fan inlet ring or pitot traverse); accept ±10% of design — AHU-02 and AHU-03
  16,500 L/s, AHU-05 and AHU-06 10,000 L/s, AHU-01 12,000 L/s.

## RFM-PPM-MEC-020 — Pumps quarterly PPM

**Applies to:** AGCC-CHWP-01, -02, -03 (Hydrova EN 125-250, 30 kW); AWFC-CHWP-02 (Hydrova EN 80-200, 11 kW).
**Frequency:** quarterly. **Duration:** about 1 hour per pump.

- **Mechanical seal:** no visible leakage. A leaking seal is replaced: **HYD-MS-0035** (35 mm) fits the EN 80-200
  pumps; seals for EN 125-250 pumps are ordered against the pump serial number.
- **Vibration** at both bearing housings with RFM-TL-0433: below 2.8 mm/s good; 2.8–7.1 mm/s monitor monthly; above
  7.1 mm/s change over to the standby pump and raise a corrective job.
- **Bearings:** temperature below 80 °C; no noise; grease where nipples are fitted.
- **Coupling and alignment:** guard secure, coupling insert not worn; laser alignment check annually.
- **Hydraulics:** suction and discharge pressure, differential against the pump curve, strainer differential.
- **Motor:** current on each phase against nameplate FLA; terminal box sealed.
- **Duty/standby:** confirm weekly BMS changeover is working; standby pump run for 15 minutes.

## RFM-PPM-FLS-003 — Fire pump weekly run test

**Applies to:** AGCC-FP-01 (electric, 75 kW, 750 gpm at 8 bar), AGCC-FP-02 (diesel, 2 battery banks, 8-hour fuel
tank), AGCC-JP-01 (jockey, 3 kW); jockey pumps at other sites (e.g. AMCC-JP-01). **Frequency:** weekly.
**Resource:** fire and life safety technician.

**AGCC pressure settings:** system 9.5 bar; JP-01 starts 8.8 bar, stops 9.6 bar; FP-01 auto-starts at 8.0 bar; FP-02
auto-starts at 7.4 bar.

1. Inform the Security Control Room and the Centre Manager before the test so that pump-running alarms are expected.
2. Record system pressure and confirm all controllers are in AUTO.
3. **Start-pressure test:** open the test drain slowly and record the pressure at which JP-01, FP-01 and FP-02 start.
4. **FP-01 electric:** run 10 minutes at no flow. Record **churn pressure** (baseline 10.4 bar, accept ±5%), suction
   pressure, motor current and gland drip. Confirm the casing relief valve flows.
5. **FP-02 diesel:** run **30 minutes**. Record churn pressure (baseline 10.6 bar, ±5%), oil pressure, coolant
   temperature, engine speed, cooling-water flow and engine hours. Check exhaust for leaks.
6. **Diesel batteries:** start alternately on bank A and bank B each week; record both bank voltages (at least 24.8 V
   on charge), electrolyte level and charger status. Fuel tank not below three-quarters.
7. **Jockey pump starts per hour:** read the start counter. **More than 6 starts per hour indicates a system leak
   (passing drain valve, leaking sprinkler) or a pressure switch fault** — raise a corrective job; the replacement
   switch is **PYR-PSW-JP** (6–12 bar).
8. Return every controller to AUTO, confirm on the fire pump panel, inform Security and record in RFM Connect.

## RFM-PPM-ELE-030 — Emergency lighting monthly and annual tests

**Applies to:** all five sites, including ASCM-ELS-01 (42 self-contained luminaires and 9 exit signs, 3-hour rated).

**Monthly flick test**

- Simulate mains failure with the test key switch on each circuit.
- Every luminaire and exit sign must light; keep the test short (1–5 minutes, never more than a quarter of rated
  duration).
- Confirm charging indicators return after restoring mains; record failures by luminaire ID.

**Annual 3-hour duration test**

- Run the full **3-hour** rated duration after closing hours; the building must not be occupied for the next 24 hours
  while batteries recharge, or test alternate luminaires on separate days.
- Any luminaire that fails before 3 hours gets a new battery pack **LUM-BAT-3H** (3.6 V NiCd, 3 h) and is re-tested.
- Battery packs older than 4 years are replaced at the annual test.
- Issue the test record to the client with the luminaire list.

## RFM-PPM-LFT-001 — Lifts monthly PPM (subcontractor, RFM witness)

**Applies to:** AGCC-LIFT-01 and -02 (Elevona MRL, 1,000 kg); AMCC-LIFT-02 (Elevona MR, 630 kg). **Frequency:**
monthly, carried out by the appointed lift maintenance subcontractor and **witnessed by a Raseen FM technician**.

The RFM witness checks and records:

- subcontractor PTW issued and lift isolator locked off by the subcontractor under RFM-HSE-PRO-007;
- landing and car door operation, door safety edge or light curtain;
- levelling accuracy at every floor within ±10 mm;
- alarm button and two-way communication to the Security Control Room;
- car emergency light, car lighting and ventilation;
- pit clean and dry, with no water ingress;
- logbook entry signed by both the subcontractor technician and the RFM witness;
- defects listed with priority; any lift found unsafe is taken out of service and the client informed the same day.

The annual thorough examination certificate from the third-party inspector is kept on file for each lift.
