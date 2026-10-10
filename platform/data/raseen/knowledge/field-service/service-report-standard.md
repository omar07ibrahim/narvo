---
id: RFM-QA-STD-004
title: Service Report — Minimum Content Standard
title_ar: تقرير الخدمة — معيار الحد الأدنى للمحتوى
type: Standard
ref: RFM-QA-STD-004 Rev 2
date: 2026-04-20
owner: Raseen FM — Quality
classification: Internal
lang: en
---

# Service Report — Minimum Content Standard

| Item | Detail |
|---|---|
| Reference | RFM-QA-STD-004 Rev 2, 20 April 2026 (supersedes Rev 1, August 2024) |
| Owner | Raseen FM — Quality |
| Applies to | Every corrective, emergency and PPM job closed in RFM Connect, by Raseen FM technicians and subcontractors |
| Linked documents | RFM-PPM-SET (PPM checklists) · RFM-HSE-PRO-007 (LOTO) · RFM-HSE-PRO-011 (refrigerant) |

Rev 2 changes: weighted completeness score introduced; first-time-fix definition aligned with the MNDA contract
report; rules added for reports drafted with the RFM Connect assistant.

## 1. Purpose and scope

A service report is the record a client, a supervisor and the next technician rely on. Reports are shared with
clients (for example MNDA under contract MNDA/CON/2023/019) and feed the first-time-fix and PPM KPIs.

Reports drafted with the help of the RFM Connect assistant (from voice notes, readings and photos) are held to the
same standard. **The technician remains responsible** for checking every reading, part and statement before signing.

## 2. Required sections of a complete service report

| No. | Element | Must contain | Weight |
|---|---|---|---|
| 1 | Job reference and asset | Job reference **JOB-RFM-26-NNNNN**, asset tag (e.g. AGCC-CH-02), site, job type | 5 |
| 2 | Arrival and departure time | Times (hh:mm) from RFM Connect check-in and check-out | 5 |
| 3 | Symptom on arrival | Fault as reported and as found; alarm codes with times; operating state | 10 |
| 4 | Readings | Readings required by the relevant PPM checklist, with units; before and after where the work changes performance | 15 |
| 5 | Work performed | What was tested, adjusted, cleaned or replaced, in order | 10 |
| 6 | Parts used | Part number, description, quantity and **source location**; parts needed but not available | 10 |
| 7 | Root cause | Cause with supporting evidence, or **"not determined"** with the reason and next diagnostic step | 10 |
| 8 | Unresolved issues and follow-ups | Each with **owner, part status and target date**, and the follow-up job number | 10 |
| 9 | Safety | LOTO applied (isolation points), **permit number**, other permits, any incident or near miss | 10 |
| 10 | Photos | Before and after photos with captions | 5 |
| 11 | Customer sign-off | Name, role, date and time — or the reason it was not obtained | 5 |
| 12 | Technician declaration | Name, staff ID, certificate number where relevant, signed declaration | 5 |
| | **Total** | | **100** |

## 3. Guidance on key elements

### 3.1 Readings

Use the reading table of the PPM checklist for the asset type — for air-cooled chillers, RFM-PPM-HVAC-001 per
circuit (ambient, chilled water entering/leaving, suction and discharge pressure, SCT, approach, subcooling,
superheat, compressor and fan currents, oil pressure, alarm history). A reading without a unit or circuit counts as
missing.

### 3.2 Parts used

Each line shows part number, quantity and source location as held in RFM Connect — for example
"RFM-ELE-0325 × 1 — VAN-117" or "RFM-CHM-0112 × 1 can — SITE-AGCC". Parts used must match the stock issues
recorded in RFM Connect. Parts needed but not available are listed under element 8.

### 3.3 Root cause

State the cause and the evidence (e.g. "approach 22 K at 44 °C ambient, coil face velocity 1.5 m/s — coil fouled").
"Not determined" is acceptable only with the reason (e.g. fault not present on arrival) and the next step. Resetting
an alarm is not a root cause.

### 3.4 Unresolved issues and follow-ups

Every open issue needs an owner (named person), part status (in stock / ordered with PO number and ETA / to be
ordered) and a target date, and must have its own follow-up job in RFM Connect.

### 3.5 Safety

Record whether LOTO was applied under RFM-HSE-PRO-007, the isolation points and the permit-to-work number. Record
roof access and chemical approvals where used, and any refrigerant added or recovered (form RF-01).

## 4. Completeness scoring rule

- Each element is scored **Full** (100% of its weight), **Partial** (50%) or **Missing** (0).
- The completeness score is the sum of the twelve elements, out of 100.
- **A report scoring below 80% is returned by the supervisor** to the technician with comments and must be resubmitted
  within 1 working day.
- Regardless of score, a report is also returned if:
  - the safety element is missing on a job that needed LOTO or a permit;
  - readings are missing on a PPM job;
  - parts used do not match the stock issues in RFM Connect.

**Example:** a chiller corrective report with no readings (0 of 15), a root cause written as "dirty" with no evidence
(Partial, 5 of 10) and before photos only (Partial, 2.5 of 5) scores **77.5% → returned**.

## 5. First-time fix (FTF)

- **Definition:** a corrective job is first-time fixed when it is **closed without a follow-up visit for the same fault
  on the same asset within 30 days**.
- "Same fault" means the same symptom or alarm code, or the same failed component.
- FTF is measured 30 days after job closure. PPM jobs are excluded.
- A second visit needed because a part was not available counts as **not** first-time fixed; it is reported
  separately as a "parts-related repeat".
- Example: a chiller circuit reset after an A21 trip without a root cause, returning 9 days later with the same alarm,
  is not first-time fixed.
- Target for HVAC corrective jobs on contract MNDA/CON/2023/019: **85% or higher**.

## 6. Supervisor review duties

- **HVAC reports are reviewed by Mohammed Rafiq, HVAC Supervisor**; other disciplines by their discipline supervisor.
- Review within **2 working days** of submission.
- The supervisor checks:
  - the completeness score and gate rules;
  - that readings are plausible against normal ranges (e.g. chiller approach 12–15 K, subcooling 5–8 K);
  - that parts reconcile with stock issues;
  - that the root cause is supported by evidence;
  - that every follow-up exists in RFM Connect with owner, part status and target date;
  - that LOTO and permit records are complete.
- The supervisor then approves, or returns with comments. Safety deviations are referred to HSE the same day. Where a
  criticality A asset (e.g. a chiller) has an unresolved issue, the client is informed the same day.
- Approved reports are shared with the client within 3 working days.
- Monthly, Quality audits a 10% sample of approved reports and publishes the average completeness score and FTF rate
  per technician.
