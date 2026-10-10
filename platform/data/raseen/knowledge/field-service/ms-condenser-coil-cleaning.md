---
id: RFM-MS-HVAC-014
title: Method Statement — Condenser Coil Cleaning, Air-Cooled Chillers
title_ar: بيان طريقة العمل — تنظيف ملفات المكثفات في المبردات المبرَّدة بالهواء
type: Method Statement
ref: RFM-MS-HVAC-014 Rev 3
date: 2026-03-02
owner: Raseen FM — HVAC Engineering
classification: Internal
lang: en
---

# Method Statement — Condenser Coil Cleaning, Air-Cooled Chillers

| Item | Detail |
|---|---|
| Reference | RFM-MS-HVAC-014 Rev 3, 2 March 2026 |
| Amendment | A1, 6 October 2026 — section "Permits and approvals" updated to record HSE chemical approval CA-26-118 |
| Owner | Raseen FM — HVAC Engineering |
| Reviewed by | Raseen FM — HSE |
| Linked documents | ALD-ACX350-SM-07 §7.6 · RFM-HSE-PRO-007 (LOTO) · RFM-PPM-HVAC-001/002 · RFM-QA-STD-004 |

Rev 3 changes: pH-neutral cleaner made mandatory for all epoxy-coated coils; fan restraint step added; before/after
approach readings made an acceptance criterion.

## 1. Scope

This method statement covers cleaning of copper-tube aluminium-fin condenser coils on air-cooled chillers maintained
by Raseen FM, including the Aldara ACX-350 units CH-01 and CH-02 at Al Ghaf Community Centre (contract
MNDA/CON/2023/019). It does not cover microchannel coils or water-cooled condensers. The asset record in RFM Connect
states whether a coil is epoxy-coated; **if in doubt, treat the coil as coated**.

## 2. Responsibilities

- **Senior HVAC Technician (task leader)** — leads the work, applies LOTO as authorised person, takes all readings and
  photos, operates the wash pump, completes the service report.
- **Helper** — handles hoses, drain protection, sheeting and fan restraints under the task leader's direction.
- **HVAC Supervisor — Mohammed Rafiq (permit issuer)** — issues and closes the permit to work, confirms the chemical
  in use is approved, reviews before/after readings and closes the PPM job in RFM Connect.
- **HSE Officer** — maintains chemical approvals and safety data sheets, audits the work.
- **Client representative** — informed before work starts (at AGCC: the Centre Manager, Salem Obaid Al Remeithi).

## 3. Permits and approvals

- **Permit to work (PTW):** issued by Mohammed Rafiq, HVAC Supervisor, acting as Raseen FM site lead for roof plant.
  Valid for one shift only.
- **Roof access:** at AGCC the roof plant deck is reached by service stair S-2; the roof key is collected from the
  Security Control Room and returned at the end of the shift. Workers must hold a valid working-at-height (roof)
  certificate.
- **Chemical approval:** only cleaners approved by Raseen HSE may be used. The pH-neutral foaming cleaner
  **RFM-CHM-0112** (pH 7–8) is approved for epoxy-coated coils under **HSE chemical approval CA-26-118, dated
  6 October 2026** (Amendment A1); stock was released to the AGCC site store (room B1-07) the same day. The safety
  data sheet must be on site. **The alkaline cleaner RFM-CHM-0109 (pH 11.5) is not approved for coated coils** and
  must not be taken to the roof.
- **Isolation:** lockout/tagout per RFM-HSE-PRO-007.
- **Client notice:** at least 48 hours before the work; the chiller change-over is agreed with the client.

## 4. Tools and materials

| Item | Part no. | Qty per chiller |
|---|---|---|
| Low-pressure coil wash pump, 25 m hose, flat-fan nozzle (max 6 bar) | RFM-TL-0310 | 1 set |
| Fin comb set (8–18 fins per inch; ACX coils are 14 fpi) | RFM-TL-0301 | 1 set |
| pH-neutral foaming coil cleaner, 20 L | RFM-CHM-0112 | 1 can (diluted 1:3) |
| Digital refrigerant manifold with 2 clamp probes | RFM-TL-0405 | 1 set |
| Infrared thermometer and anemometer kit | RFM-TL-0420 | 1 set |
| Personal LOTO kit (locks, hasps, tags, 1,000 V CAT IV tester) | RFM-ELE-0701 | 1 per person |
| Polythene sheeting, tape, fan restraint straps, drain covers, absorbent booms, wet vacuum, pH strips, spill kit | — | as needed |

## 5. Personal protective equipment

- Chemical splash goggles and nitrile gauntlets **RFM-PPE-0215** while mixing, applying or rinsing cleaner.
- Half-face respirator with A2P3 cartridges **RFM-PPE-0230** while spraying foam.
- Safety helmet with chin strap, non-slip safety boots, long-sleeve coveralls, high-visibility vest.
- Hearing protection when working beside a running chiller (above 85 dB(A)).

## 6. Sequence of work

**Preparation**

1. Confirm the PPM job (RFM-PPM-HVAC-002) and the PTW. Hold a 10-minute toolbox talk covering chemicals, wet
   surfaces, rotating fans, heat and electrical hazards.
2. Collect the roof key and inform the client representative. Do not start if wind exceeds 30 km/h (spray drift) or a
   dust-storm warning is in force.
3. **Before readings:** with the chiller still running at 75% load or more, record for each circuit: ambient, discharge
   pressure, SCT, **approach**, subcooling and fan currents. Take "before" photos from fixed positions — 4 per
   circuit (A1–A4, B1–B4).

**Change-over and isolation**

4. **Lead/lag change-over at the BMS** so that **one chiller always runs**: make the other chiller lead and confirm it
   holds leaving chilled water within 1 K of set point for 10 minutes before stopping the unit to be cleaned. If one
   chiller cannot carry the building load, clean only before 11:00.
5. Stop the chiller at its controller (normal stop) and wait for both compressors to stop.
6. Apply **LOTO per RFM-HSE-PRO-007**: main isolator, the separate 230 V control/UPS feed and the fan MPCBs. Prove
   dead with prove-test-prove. Fit personal locks and tags.
7. **Restrain the fans against windmilling:** strap each fan blade of the circuit being cleaned to its guard. Wind
   turns isolated fans, and spray must never strike a moving blade.
8. **Cover the control panel**, compressor and fan-motor terminal boxes, the ambient sensor and the pressure
   transducers with polythene sheeting, taped closed.
9. **Protect the drains:** cover roof storm outlets within 10 m of the plinth and place booms to direct runoff to the
   foul-drain gully.

**Cleaning**

10. Remove feathers, plastic and loose debris by hand and with a soft brush.
11. **Pre-rinse** with clean water at **6 bar or less** using RFM-TL-0310: flat-fan nozzle, **perpendicular to the
    fins**, **at least 300 mm from the face**, **from the fan side outwards where accessible**, top to bottom.
12. **Foam:** apply RFM-CHM-0112 diluted 1 part to 3 parts water, from the bottom up. **Dwell 5–10 minutes**; never
    let the foam dry — mist with water if it starts to dry (reduce dwell to 5 minutes in summer).
13. **Rinse** top to bottom, fan side outwards first, until runoff is clear and foam-free (at least twice the
    application time). Check runoff with a pH strip: 6–9.
14. **Fin comb:** straighten bent fins with RFM-TL-0301 (14 fpi head). Record any area of damage over 5% of a coil
    face.
15. **Inspect** coating (blistering, chips), corrosion and oil stains (possible leak — check with an electronic
    detector). Take "after" photos from the same fixed positions.

**Restore and check**

16. Remove sheeting, fan restraints and drain covers; check that no tools or hoses remain and fan guards are secure.
17. Remove LOTO per RFM-HSE-PRO-007 once everyone is clear.
18. Restart the chiller and return to the agreed lead/lag sequence. Run at 75% load or more for 30 minutes.
19. **Performance check:** repeat the readings from step 3 for each circuit and calculate approach.
20. Close the PTW with the HVAC Supervisor, return the roof key and update RFM Connect.

## 7. Environmental controls

- Runoff contains dust, grease and diluted cleaner. **It goes to the foul drain only, never to storm drains** — roof
  storm outlets discharge to the storm network.
- Where no foul gully is within reach, collect runoff with a wet vacuum and empty it into a foul drain.
- Keep a spill kit at the work area; report any spill to the HSE Officer the same day.
- Return empty cleaner cans to the Central Store for licensed disposal. Water use is about 1,100 L per chiller.

## 8. Heat-stress controls

- In hot months (May to October) **work on the roof before 11:00**; start at 07:00.
- **Outdoor midday work ban: no roof work between 12:30 and 15:00 from 15 June to 15 September.**
- Drink at least 250 mL of water every 15–20 minutes; take a 10-minute shaded rest every hour above 40 °C.
- Never work alone on the roof. The task leader stops work if the WBGT exceeds 32 °C or anyone shows signs of heat
  illness (dizziness, confusion, cramps, stopped sweating).
- Roof deck surfaces exceed 70 °C in summer — do not kneel without a mat.

## 9. Duration and resources

**About 3.5 hours per chiller, with 1 senior HVAC technician and 1 helper.**

| Stage | Time |
|---|---|
| Permit, briefing, key, before readings and photos | 40 min |
| Change-over, LOTO, fan restraint, covers, drain protection | 35 min |
| Dry clean and pre-rinse | 35 min |
| Foam, dwell and rinse | 45 min |
| Fin comb, inspection, after photos | 30 min |
| Restore, restart, after readings and close-out (30 min run overlaps with packing up) | 25 min |

In hot months only one chiller can be cleaned per morning; the second unit is cleaned the next working morning.
From November to April both units may be cleaned on the same day.

## 10. Acceptance criteria

- **Approach 15 K or less** at 75% load or more on each circuit (when ambient is 30 °C or higher). Below 30 °C ambient,
  use face velocity of at least 2.3 m/s at 3 points per coil face.
- Coil faces visibly clean; torchlight passes through the fin pack.
- Bent fins straightened; damage over 5% of a face reported.
- Runoff pH 6–9; no cleaner residue.
- **If approach remains above 15 K after cleaning**, do not record the PPM as compliant: raise a follow-up job to
  investigate fans and hot-air recirculation per ALD-ACX350-SM-07 §7.3 and inform the HVAC Supervisor.

## 11. Records

Recorded in RFM Connect against the PPM job:

- before and after readings for each circuit (ambient, discharge pressure, SCT, approach, subcooling, fan currents);
- before and after photos from the same fixed positions (at least 8 of each);
- cleaner part number, quantity used and batch number;
- PTW number and LOTO confirmation;
- defects found (fan noise, coating damage, oil stains) with follow-up job numbers;
- a service report meeting RFM-QA-STD-004.
