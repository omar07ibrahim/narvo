---
id: RFM-HSE-PRO-007
title: Lockout / Tagout (LOTO) Procedure
title_ar: إجراء القفل والتعليم (LOTO) لعزل مصادر الطاقة
type: Procedure
ref: RFM-HSE-PRO-007 Rev 5
date: 2025-09-14
owner: Raseen FM — HSE
classification: Internal
lang: en
---

# Lockout / Tagout (LOTO) Procedure

| Item | Detail |
|---|---|
| Reference | RFM-HSE-PRO-007 Rev 5, 14 September 2025 (supersedes Rev 4, May 2023) |
| Owner | Raseen FM — HSE |
| Applies to | All Raseen FM employees and subcontractors on every site, including the MNDA community centres under contract MNDA/CON/2023/019 |
| Linked documents | RFM-HSE-PRO-011 (refrigerant handling) · RFM-MS-HVAC-014 · form LOTO-F-03 (removal of an absent person's lock) |

Rev 5 changes: chiller-specific notes added (section 5); shift-handover rule tightened so that there is never a gap
in personal locks.

## 1. Purpose and scope

This procedure protects people from unexpected energisation, start-up or release of stored energy while equipment is
serviced. It covers electrical, mechanical, hydraulic, pneumatic, thermal, gravity and refrigerant-pressure energy.

## 2. LOTO principles

- **Zero energy before work.** Every energy source is isolated, locked, released and verified before anyone touches
  the equipment.
- **One person, one lock, one key.** Everyone who works on the equipment fits their own personal lock. The key never
  leaves that person.
- **Controls are not isolation.** A controller "off", a BMS command, an emergency stop or a VFD stop is never a
  substitute for a lockable isolator.
- **Isolate at a physical break** — an isolator, MPCB or valve that can be locked in the off or closed position.
- **Personal locks** are the red, uniquely numbered padlocks in the personal LOTO kit **RFM-ELE-0701**. Tags show name,
  mobile number, date, job number (JOB-RFM-YY-NNNNN) and reason.
- **Only the person who fitted a lock removes it**, except under section 8.

## 3. Authorised and affected persons

- **Authorised person** — trained and assessed to apply LOTO and listed as "LOTO authorised person" in the RFM Connect
  competency register. Refresher every 2 years. Only authorised persons may isolate equipment and work on it.
- **Affected person** — anyone who operates or works near the equipment but does not apply LOTO: centre staff,
  security, cleaners, BMS operators, client representatives. They must be told about the isolation and must never
  operate an isolated device or remove a lock or tag.
- **Permit issuer** — the supervisor who issues the permit to work and checks the isolation list for high-risk work
  (for HVAC: Mohammed Rafiq, HVAC Supervisor).

## 4. The eight LOTO steps

1. **Prepare.** Identify every energy source from the asset record, single-line drawings and OEM manual. List each
   isolation point on the permit. Bring the LOTO kit, voltage tester and proving unit.
2. **Notify.** Tell the affected persons, the client representative and the BMS operator what will be isolated and
   for how long. Post a notice at the panel.
3. **Shut down.** Stop the equipment normally through its controls so that isolators are not opened under load.
4. **Isolate.** Open the isolator for every energy source — main supply, control supply, UPS feeds, heaters, VFDs —
   and close valves on water or refrigerant lines where the work requires.
5. **Lock and tag.** Fit a hasp, personal lock and tag at every isolation point. Use a group lock box where there are
   several points or several workers (section 6).
6. **Release stored energy.** Wait for capacitors to discharge, restrain fans, bleed pressure, block or chain parts
   that can move under gravity, and let hot parts cool.
7. **Verify — prove-test-prove.** Prove the tester on the proving unit; test every phase phase-to-phase, phase-to-earth
   and phase-to-neutral at the point of work; prove the tester again. Then, with everyone clear, try to start the
   equipment at its local control and return the control to off.
8. **Restore.** When work is finished: tools removed, guards refitted, everyone clear and informed. Each person
   removes only their own lock. Re-energise in a controlled order, test-run, inform the affected persons and close the
   permit.

## 5. Chiller-specific LOTO notes

- **Separate control and UPS feed.** On chillers such as the Aldara ACX-350 the controller and BMS interface can be
  fed from a separate 230 V UPS circuit. Opening the main isolator does **not** de-energise the control panel. Isolate
  and lock both when working in the panel.
- **Compressor and oil heaters.** Crankcase and oil-separator heaters are often supplied from the control circuit and
  stay live after the main isolator is opened. Isolate them before touching heater terminals.
- **VFD and capacitor discharge.** Where compressors or fans are VFD-driven, **wait 15 minutes after isolation**, then
  verify the DC bus is below 50 V before touching any terminal.
- **Fans windmilling.** Wind can turn isolated condenser fans, and a turning fan motor generates voltage at its
  terminals. **Strap the blades to the guard** before working on fans, fan motors or coils, and treat fan terminals as
  live until the blade is restrained.
- **Refrigerant pressure is stored energy.** An ACX-350 circuit stands at about 600–1,600 kPa(g) when stopped,
  depending on ambient. Never loosen a fitting on a pressurised circuit. Isolate with service valves and recover
  refrigerant per RFM-HSE-PRO-011 before opening the circuit. Pressure transducers sit on valve-core fittings — wear
  face protection when removing them.
- **Automatic restart.** Lead/lag sequencing can command an isolated chiller to start. Set the chiller to "local off"
  at its controller and flag it "out of service" on the BMS — in addition to, never instead of, the lock.
- **Chilled-water side.** Close and lock isolating valves and vent to zero pressure before opening strainers or
  flanges; system pressure is typically 300–400 kPa.
- **Hot surfaces.** Compressor discharge lines can reach 90 °C; allow them to cool before working.

## 6. Group lockout

- Used where more than two people work on the same equipment or there are more than two isolation points.
- The lead authorised person isolates each point and fits a yellow **isolation lock**, then places all isolation keys
  in a **group lock box**.
- Each worker fits a personal lock to the box before starting and may verify the isolation personally.
- The isolation list is attached to the permit and signed by the lead authorised person and the permit issuer.
- Subcontractors (for example the lift contractor) also lock onto the box.
- Isolation locks are removed only after every personal lock is off the box.

## 7. Shift handover

- **There must never be a moment without a personal lock on an isolated system.** The incoming worker fits a
  personal lock on the box **before** the outgoing worker removes theirs.
- Isolation status is handed over on the permit, signed by both workers and the permit issuer. The incoming worker
  re-verifies the isolation.
- Where work stops overnight, isolation locks stay in place, the permit issuer fits a supervisor's lock to the box,
  and the equipment is tagged "Out of service".

## 8. Removal of an absent person's lock

A personal lock may be removed by someone else **only** when its owner cannot be reached and only as follows:

1. **Confirm absence.** The permit issuer calls the lock owner at least twice over 30 minutes, checks the site sign-in
   record and the van location.
2. **Walk down the equipment.** Confirm that work is complete or made safe, guards are fitted and nobody is working
   on it.
3. **Authorise.** The discipline supervisor and the HSE Officer both sign form **LOTO-F-03** in RFM Connect, recording
   reasons, times and a witness.
4. **Remove.** The lock is removed with the HSE master key or bolt cutters, in the presence of the witness.
5. **Inform the owner** before they start their next shift; they acknowledge in writing.
6. **Record** the removal as a LOTO deviation; deviations are reviewed at the monthly HSE meeting.

## 9. Training, audit and discipline

- Authorised-person training: 1 day theory and practical assessment; refresher every 2 years.
- Supervisors carry out at least 4 field LOTO audits per contract each month and record them in RFM Connect.
- Working on isolated equipment without a personal lock, or removing another person's lock outside section 8, is
  gross misconduct.
