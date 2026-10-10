---
id: ALD-ACX350-SM-07
title: Aldara ACX-350 Air-Cooled Screw Chiller — Service Manual Section 7: Troubleshooting
title_ar: مبرّد المياه اللولبي المبرَّد بالهواء Aldara ACX-350 — دليل الخدمة، القسم 7: تشخيص الأعطال وإصلاحها
type: Manual
ref: ALD-ACX350-SM-07 Rev C
date: 2018-11-05
owner: Aldara Climate Systems (OEM) — controlled copy held by Raseen FM Engineering
classification: Internal
lang: en
---

# Aldara ACX-350 Service Manual — Section 7: Troubleshooting

| Item | Detail |
|---|---|
| Document | ALD-ACX350-SM-07 Rev C, 5 November 2018 (supersedes Rev B, March 2017) |
| Unit | ACX-350 air-cooled screw chiller, 350 TR (1,231 kW) nominal, R-134a |
| Circuits | 2 independent circuits A and B, one semi-hermetic screw compressor each; factory charge 98 kg R-134a per circuit (196 kg per unit) |
| Condenser | Copper tube / aluminium fin V-coils with factory epoxy coating, 14 fins per inch; 12 fans 910 mm, 2.2 kW (6 per circuit) |
| Design ambient | 52 °C |
| Controller | ACX-Link, firmware 4.2 or later |
| Controlled copy | Raseen FM Engineering. Text marked **RFM note** is a Raseen annotation and not part of the OEM text |

**Safety.** Only trained, authorised technicians may carry out the work in this section. Isolate and lock off the
unit before opening any electrical panel or fan guard. Refrigerant work requires a refrigerant-handling
certificate. *RFM note: apply RFM-HSE-PRO-007 (LOTO) and RFM-HSE-PRO-011 (refrigerant handling).*

## 7.1 Alarm list and controller responses

The ACX-Link controller stores the last 200 alarm and warning events with date, time, circuit and a **snapshot** of
operating values at the moment of the event: discharge and suction pressure, saturated condensing temperature (SCT),
ambient temperature, compressor load %, fan stages running and leaving chilled-water temperature (LCHWT). Always read
the snapshot before resetting anything.

| Code | Name | Trip condition | Controller action | Reset |
|---|---|---|---|---|
| W21 | HP unload (warning) | Discharge ≥ 1,790 kPa(g) | Slide valve unloads in 10% steps every 30 s; reloads when < 1,720 kPa(g) for 3 min | Automatic |
| A21 | High discharge pressure — transducer trip | Discharge ≥ 1,890 kPa(g) for 5 s | Affected circuit stops; other circuit continues | Auto-restart after 15 min; 3 trips in 60 min → lockout, manual reset |
| A22 | HP safety switch open | Mechanical switch ACX-SW-1930 opens at 1,930 kPa(g) | Compressor contactor de-energised by hardwired safety chain | Manual reset at switch, then at controller |
| A31 | Condenser fan overload / fan fail (A31-A, A31-B) | Fan MPCB auxiliary contact or motor thermal contact open | Warning only; circuit runs on remaining fans | Automatic when contact closes |
| A40 | Low suction pressure | Suction ≤ 165 kPa(g) (≈ −2.6 °C saturated) for 90 s | Circuit stops | Auto-restart once after 15 min; second trip in 60 min → lockout |
| A41 | Low LCHWT (freeze protection) | LCHWT ≤ 3.0 °C for 30 s | Both circuits stop | Manual |
| A50 | High oil filter differential | Discharge minus oil pressure > 175 kPa for 60 s (W50 warning at 140 kPa) | Compressor stops | Manual, after filter check |
| A60 | Compressor motor overtemperature | Winding thermistor module trips | Compressor stops | Manual, after 30 min cool-down |
| A70 | Chilled-water flow loss | Flow switch open for 10 s | Unit stops | Automatic when flow proven for 60 s |
| A80 | Power supply fault | Phase loss or reversal, voltage outside 360–440 V, imbalance > 2% | Unit stops | Automatic after 5 min normal supply |

### A21 — High discharge pressure, transducer trip

High-pressure protection is staged: **W21 HP unload at 1,790 kPa(g)** → **A21 trip at 1,890 kPa(g) for 5 s** →
**A22 mechanical switch at 1,930 kPa(g)**. A21 is a software trip based on the discharge pressure transducer
ACX-PT-3000. The circuit restarts automatically after 15 minutes. **Three A21 trips within any rolling 60 minutes lock
out the circuit (A21-L)**; a manual reset at the controller is then required (section 7.8).

A21 events preceded by W21 unloading on hot afternoons point to a heat-rejection problem (coil, fans,
recirculation). A21 without a preceding W21 — a sudden pressure spike — points to a fan stopping, a transducer fault
or a wiring fault.

### A22 — HP safety switch open

ACX-SW-1930 is a hardwired, manual-reset switch independent of the controller. Because A21 should always act first
at 1,890 kPa(g), **an A22 without a preceding A21 means the transducer is reading low** — check it before restarting
(section 7.4.6). The switch can be reset only when pressure has fallen below 1,520 kPa(g). Never bypass the switch or
alter its setting. Test it annually on a test bench.

### A31 — Condenser fan overload or fan fail

A31 detects only an **electrical** trip (MPCB or motor thermal contact). It does **not** detect a fan running slowly,
a broken or chipped blade, or a motor with failing bearings that has not yet tripped. Always confirm visually that
every fan on the circuit is turning at full speed.

### A40 — Low suction pressure

Common causes: low refrigerant charge (leak), low chilled-water flow, electronic expansion valve fault, filter-drier
restriction (temperature drop across ACX-FD-0048 core above 2 K) or a fouled evaporator.

## 7.2 Normal operating values at full load (clean condenser coil)

Conditions: 100% load, chilled water 13.3 °C entering / 7.2 °C leaving at design flow 48.2 L/s, clean coil, all fans
running.

| Parameter | Ambient 35 °C | Ambient 46 °C | Investigate when |
|---|---|---|---|
| Discharge pressure | 1,180–1,260 kPa(g) | 1,540–1,620 kPa(g) | W21 1,790 · A21 1,890 · A22 1,930 kPa(g) |
| Saturated condensing temperature (SCT) | 48–50 °C | 58–60 °C | — |
| Condenser approach (SCT − ambient) | 12–15 K | 12–15 K | **> 18 K = airflow or coil problem** |
| Liquid subcooling | 5–8 K | 5–8 K | > 10 K suggests overcharge; < 3 K undercharge |
| Discharge superheat | 15–25 K | 15–25 K | < 10 K floodback; > 30 K undercharge or restriction |
| Suction pressure | 215–240 kPa(g) | 220–245 kPa(g) | A40 at 165 kPa(g) |
| Evaporator approach (LCHWT − saturated suction) | 3–5 K | 3–5 K | > 6 K fouled evaporator or low charge |
| Compressor current (each) | 305–335 A | 340–365 A | RLA 384 A |
| Condenser fan motor current | 4.2–4.8 A | 4.3–4.9 A | FLA 5.1 A |
| Oil filter differential | 40–90 kPa | 40–90 kPa | W50 140 · A50 175 kPa |

**Discharge pressure and SCT.** The discharge transducer sits upstream of the oil separator and reads about 35 kPa
above condenser pressure at full load. The controller subtracts 35 kPa before calculating SCT. When using a gauge,
take SCT from the liquid-header service port, or subtract 35 kPa from the discharge reading.

**R-134a pressure–temperature reference (saturated, kPa gauge):**

| °C | −3 | 0 | 3 | 5 | 45 | 48 | 50 | 55 | 58 | 60 | 63 | 65 | 67 | 70 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| kPa(g) | 161 | 192 | 225 | 249 | 1,059 | 1,151 | 1,217 | 1,391 | 1,502 | 1,581 | 1,702 | 1,789 | 1,877 | 2,016 |

**What the limits mean in approach terms:** W21 (SCT ≈ 64 °C) and A21 (SCT ≈ 66.5 °C) are reached at these
approaches:

| Ambient | W21 HP unload at approach of | A21 trip at approach of |
|---|---|---|
| 44 °C | ≈ 20 K | ≈ 22.5 K |
| 46 °C | ≈ 18 K | ≈ 20.5 K |
| 48 °C | ≈ 16 K | ≈ 18.5 K |
| 52 °C | ≈ 12 K | ≈ 14.5 K |

## 7.3 High discharge pressure — diagnostic sequence

Follow the steps in order and record every reading. Do not reset a lockout until step 6 is complete.

1. **Read the alarm history.** Note each W21, A21, A22 and A31 event: time, circuit, discharge pressure, SCT, ambient
   and fan stages from the snapshot. Note whether one or both circuits are affected and whether trips cluster in the
   hottest hours.
2. **Check A22 against A21.** If A22 occurred without A21, go directly to 7.4.6 (transducer).
3. **Look at the fans** with the circuit running at 75% load or more: every fan turning, same speed, no unusual noise,
   no damaged blade. Check MPCB positions in the panel.
4. **Measure true ambient** with a shaded probe 1.5 m above the roof, 3 m upwind of the unit. Compare with the
   controller ambient reading.
5. **Measure coil inlet air temperature** 50 mm from the coil face at three heights on each coil face of the affected
   circuit. **Any point more than 3 K above ambient indicates hot-air recirculation** (7.4.3).
6. **Take refrigerant readings** after 10 minutes of stable operation at 75% load or more: discharge pressure at the
   service port (compare with the controller, tolerance ±35 kPa), liquid pressure and liquid-line temperature
   (subcooling), discharge-line temperature (discharge superheat).
7. **Calculate approach** = SCT − ambient. 12–15 K normal; 15–18 K marginal (clean at next opportunity); **above 18 K
   airflow or coil problem**.
8. **Decide:**
   - approach high, all fans running, coil inlet within 3 K of ambient → coil fouling (7.4.1);
   - approach high with one or more fans stopped or slow → fan failure (7.4.2, 7.5);
   - coil inlet more than 3 K above ambient → recirculation (7.4.3);
   - subcooling above 10 K with clean coil and all fans running → overcharge (7.4.4) or non-condensables (7.4.5);
   - controller and gauge differ by more than 35 kPa → transducer (7.4.6);
   - compressor discharge more than 70 kPa above condenser pressure → restriction (7.4.7).
9. **More than one cause is common.** In hot, dusty sites a partly fouled coil plus one failed fan plus 2–3 K of
   recirculation is the typical pattern behind afternoon A21 trips. Correct every cause found, not only the first.
10. **Verify** after correction: approach 15 K or less at full load and no W21 at ambient below 46 °C.

## 7.4 Causes of high discharge pressure — ranked for hot and dusty climates

### 7.4.1 Cause 1 — Fouled condenser coil

- **Why:** dust, sand, feathers, plastic and kitchen-exhaust grease block the fin pack and cut airflow. Grease forms a
  sticky film that traps dust quickly.
- **Signs:** approach above 18 K with all fans running and coil inlet air within 3 K of ambient; usually worse on the
  coil face exposed to the prevailing wind or dust source; visible dust mat on the entering-air face.
- **Checks:** shine a torch through the coil — light should pass through the fin pack. Measure face velocity with an
  anemometer: clean coil 2.3–2.7 m/s; below 1.8 m/s indicates blockage.
- **Remedy:** clean per section 7.6 and re-measure approach. Expect a return to 12–15 K.

### 7.4.2 Cause 2 — Condenser fan failure

- **Why:** each fan provides about **one sixth of its circuit's condenser airflow**. A stationary fan opening also
  lets warm discharge air from neighbouring fans be drawn back into the coil, so the real effect can be up to 1.5
  times the simple airflow loss.
- **Signs:** approach rises by about 2.5–3 K on the affected circuit for one failed fan, about 6 K for two. **At
  ambient above 44 °C the circuit may trip on A21**, particularly if the coil is also partly fouled.
- **Typical failures:** motor winding or bearings, fan contactor, MPCB trip, damaged or loose blade ACX-FB-0910.
  *RFM note: Raseen stock items are contactor RFM-ELE-0318 (3-pole 18 A, 230 V coil) and MPCB RFM-ELE-0325 (4–6.3 A).*
- **Remedy:** see section 7.5.

### 7.4.3 Cause 3 — Hot-air recirculation

- **Why:** warm discharge air is drawn back into the coils when the unit is close to walls or parapets, when wind
  pushes the discharge plume down, or when adjacent exhausts (kitchen extract, generator exhaust, AHU relief air)
  discharge near the coil.
- **Signs:** **coil inlet air more than 3 K above ambient**; one side of the unit worse than the other; worse in
  particular wind directions.
- **Required clearances:** 2.0 m from coil faces to walls up to unit height; 3.0 m where the wall is solid and higher
  than the unit; 3.0 m between parallel units; nothing within 4 m above the fan deck; no exhaust within 5 m upwind.
- **Remedies:** relocate or extend exhausts, fit discharge cowls (raise plume about 1 m), replace solid parapet
  sections with louvred panels of at least 50% free area, fit wind baffles.

### 7.4.4 Cause 4 — Refrigerant overcharge

- **Why:** surplus liquid backs up into the condenser and reduces the surface available for condensing.
- **Signs:** **subcooling above 10 K** with high approach, clean coil and all fans running.
- **Remedy:** recover refrigerant in steps of 1–2 kg into a recovery cylinder, waiting 10 minutes between steps,
  until subcooling is 5–8 K. Overcharge usually results from "topping up" on sight-glass bubbles at part load.

### 7.4.5 Cause 5 — Non-condensable gases

- **Why:** air or nitrogen left in the circuit after it was opened and not properly evacuated.
- **Check:** stop the compressor and run the condenser fans for 15 minutes so the coil settles at ambient. Measure
  condenser pressure and liquid-line temperature. **If the standing pressure is more than 40 kPa above the saturation
  pressure for the measured temperature**, non-condensables are present.
- **Remedy:** recover the circuit charge, evacuate to 500 microns or below, recharge by weight (98 kg per circuit).
  Purging to atmosphere is not permitted.

### 7.4.6 Cause 6 — Faulty discharge pressure transducer ACX-PT-3000

- **Signs:** controller reading differs from a calibrated gauge by more than **±35 kPa**; A21 trips with a normal
  measured approach; erratic readings; A22 without a preceding A21 (transducer reading low — unsafe).
- **Check:** compare with a gauge at the discharge service port at steady state. Check the 4–20 mA signal: mA = 4 +
  P ÷ 187.5 (P in kPa(g)); 1,500 kPa(g) = 12.00 mA; 1,890 kPa(g) = 14.08 mA. Check the connector for moisture.
- **Remedy:** replace ACX-PT-3000 (0–3,000 kPa, 4–20 mA) with the circuit stopped and isolated; it is mounted on a
  valve-core fitting. Re-zero in controller service menu 7-3.

### 7.4.7 Cause 7 — Restriction or partly closed discharge service valve

- **Signs:** compressor discharge pressure more than 70 kPa above condenser pressure (normal about 35 kPa); discharge
  superheat above 30 K; high compressor current.
- **Checks:** discharge service valve fully back-seated and capped; discharge check valve free; no kinked or crushed
  discharge line; oil separator element not blocked.

### 7.4.8 Cause 8 — Operation above the 52 °C design ambient

- At about 50 °C ambient a clean unit enters HP unload; at 52 °C it runs continuously in W21 at about 82% of nominal
  capacity; above 52 °C, A21 trips are expected.
- Check the true ambient: roof surfaces can raise local air temperature 3–6 K above the meteorological reading, and a
  sun-exposed ambient sensor reads high.
- Water spray onto the coil to reduce head pressure is **not approved**: it deposits scale and chlorides and voids the
  coating warranty.

## 7.5 Condenser fans — checks, currents, bearing noise and replacement

### 7.5.1 Fan checks and running currents

- **Staging:** fans run in 3 stages of 2 per circuit, starting at SCT 38, 41 and 45 °C. Above 45 °C SCT all 6 fans of
  the circuit must run.
- **Current:** clamp each phase. Normal 4.2–4.9 A. **Above the 5.1 A FLA** = overload (bearing drag, low voltage,
  wrong blade). Phase imbalance above 5% = winding or connection fault.
- **Protection:** MPCB set to 5.1 A; never set higher.
- **Insulation:** 500 V DC phase-to-earth with the motor disconnected; at least 2 MΩ (new motor above 100 MΩ).
- **Blade:** no cracks or chips; tip clearance to shroud 8–15 mm; hub set screws tight.
- **Vibration** on the motor bracket: below 2.8 mm/s RMS good; 2.8–7.1 mm/s monitor; **above 7.1 mm/s isolate**.

### 7.5.2 Noisy fan-motor bearings

ACX-FM-0922 motors (2.2 kW, 400 V, FLA 5.1 A, 6-pole, 950 rpm, IP55) have **sealed bearings that are not serviceable
in the field**. Do not attempt to re-grease or replace bearings: **replace the complete motor assembly** with its
bracket.

Until the motor is replaced, a noisy fan **may be run but must be monitored** — check noise, current and vibration at
least weekly, and daily in summer. **If vibration exceeds 7.1 mm/s RMS, current exceeds 5.1 A, or the motor seizes,
isolate that fan** (MPCB off and locked) **and accept reduced capacity**: the circuit runs on 5 fans with about
2.5–3 K higher approach and will enter HP unload sooner on hot afternoons.

Bearing failure typically progresses from a low growl to a whine or squeal and then knocking; in summer heat the
final stage can be quick.

### 7.5.3 Fan motor replacement

1. Isolate and lock off the fan MPCB and the unit; restrain the blade against wind rotation.
2. Remove the fan guard ACX-FG-0910 and the blade (use a puller; mark hub position).
3. Unbolt the motor and bracket — about 34 kg, two-person lift.
4. Fit the new ACX-FM-0922; refit the blade at the marked position (tip clearance 8–15 mm). Replace the blade
   ACX-FB-0910 if chipped or cracked.
5. Refit the guard, restore power, check rotation (air upwards), current (4.2–4.9 A) and vibration (below 2.8 mm/s).

Typical time 1.5 hours per fan for two technicians. *RFM note: ACX-FM-0922 is not normally stocked; lead time about
6 days from Gulf HVAC Spares FZE. Check RFM Connect for current stock.*

## 7.6 Condenser coil care — epoxy-coated coils

- **Cleaner:** pH-neutral cleaner only (**pH 6–9**). **Never use alkaline or acid cleaners on coated coils** — they
  damage the epoxy coating, cause blistering and fin corrosion, and **void the coating warranty**. *RFM note: approved
  cleaner RFM-CHM-0112 (pH-neutral foaming, pH 7–8). Never use RFM-CHM-0109 (alkaline, pH 11.5) on ACX coils.*
- **Water pressure:** **6 bar maximum**, flat-fan nozzle (*RFM note: RFM-TL-0310 low-pressure pump*). High-pressure
  washers flatten fins.
- **Technique:** spray **perpendicular to the fins**, **at least 300 mm from the face**, **from the fan side outwards
  where accessible** so dirt is pushed out the way it came in. Work top to bottom.
- **Foam dwell:** **5–10 minutes**; never let foam dry on the coil — mist with water if it starts to dry.
- **Fins:** straighten bent fins with a 14 fpi fin comb (*RFM note: RFM-TL-0301*).
- **Records:** measure **approach before and after** at full load; target **15 K or less** after cleaning.
- **Coating:** report blistering or coating loss over 5% of a coil face to Aldara service.
- **Frequency in hot, dusty or coastal climates:** **every 3 months from April to October and every 6 months from
  November to March**; more often near kitchen exhausts, construction sites or bird roosts.

## 7.7 Refrigerant charge checks

- **Nameplate charge:** 98 kg R-134a per circuit, 196 kg per unit.
- **Method:** load 75% or more, stable 15 minutes, SCT 45–55 °C. Measure liquid pressure and liquid-line temperature
  before the filter-drier. Subcooling = SCT − liquid temperature; **correct charge gives 5–8 K**.
- **Sight glass:** clear at full load. Bubbles at part load or during fan staging are normal — **never charge on the
  sight glass alone**.
- **Undercharge:** subcooling below 3 K, low suction pressure, A40 trips, discharge superheat above 30 K.
- **Overcharge:** subcooling above 10 K, high approach with clean coil and all fans running.
- **Never add refrigerant to cure high head pressure** without first checking subcooling and coil condition — adding
  charge to a unit with a dirty coil makes the head pressure worse.
- **Any refrigerant loss means a leak:** find and repair it before recharging. Charge liquid into the liquid-line
  charging port with the compressor running, by weight, in steps of no more than 2 kg, waiting 10 minutes between
  steps. *RFM note: record every kilogram on form RF-01 in RFM Connect (RFM-HSE-PRO-011).*

## 7.8 Resetting a lockout safely

1. **Never reset without a diagnosis.** Read the event snapshot and complete section 7.3 for any A21-L or A22.
2. **Before reset confirm:** all fans on the circuit run freely and their MPCBs are on; the coil is not visibly
   blocked; the discharge service valve is fully open; the transducer agrees with a gauge within ±35 kPa.
3. **A22:** reset the switch button only when pressure is below 1,520 kPa(g), then reset at the controller.
4. **After reset:** stay with the unit for at least 30 minutes at load. If discharge pressure reaches 1,790 kPa(g)
   (W21) at ambient below 46 °C, stop the circuit and investigate further.
5. **One reset only** without finding the cause. If it locks out again, keep the circuit off.
   *RFM note: run the standby chiller as lead and inform the HVAC Supervisor.*
6. **Never jumper or bypass** the A22 switch or alter the A21 set point; set points are locked at Aldara level 3.
7. Record the reset, the cause and the readings in the service report.

## 7.9 Recommended spares

Recommended site holding for a plant of two ACX-350 units in a hot climate:

| Part no. | Description | Qty | RFM note — typical lead time |
|---|---|---|---|
| ACX-PT-3000 | Discharge pressure transducer 0–3,000 kPa, 4–20 mA | 1 | 7 days |
| ACX-SW-1930 | High-pressure safety switch, manual reset, 1,930 kPa | 1 | 7 days |
| ACX-FM-0922 | Condenser fan motor 2.2 kW, 6-pole, 950 rpm, IP55, with bracket | 2 | 6 days (Gulf HVAC Spares FZE) |
| ACX-FB-0910 | Condenser fan blade 910 mm, 5-blade, composite | 1 | 10 days (Gulf HVAC Spares FZE) |
| ACX-FG-0910 | Fan guard 910 mm | 1 | 10 days |
| ACX-FD-0048 | Filter-drier core 48 cu.in | 4 | 5 days |
| RFM-ELE-0318 | Fan contactor 3-pole 18 A, 230 V coil (RFM stock equivalent) | 2 | 1 day |
| RFM-ELE-0325 | Fan MPCB 4–6.3 A (RFM stock equivalent) | 2 | 1 day |
| RFM-REF-0134 | R-134a, 13.6 kg cylinder (RFM stock) | as required | 1 day |
