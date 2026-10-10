---
id: RFM-LIB-012
title: Method Statement — Helpdesk (RFM Care Centre)
title_ar: بيان المنهجية — مكتب المساعدة (مركز رعاية رصين)
type: Method statement
ref: RFM/BID/LIB/012
date: 2026-04-02
owner: Raseen FM — RFM Care Centre
classification: Commercial in confidence
lang: en
---

# Method Statement — Helpdesk (RFM Care Centre)

Document RFM-OPS-MS-012, revision 3.

## 1. RFM Care Centre overview

| Item | Detail |
|---|---|
| Name | RFM Care Centre (مركز رعاية رصين) |
| Location | Raseen Building, Al Quoz Industrial 3, Dubai |
| Hours | 24 hours a day, 7 days a week, 365 days a year |
| Languages | Arabic and English |
| Access | Single toll-free number 800 72736 for all clients and sites; email; client portal |
| Agents | 18 helpdesk agents across three shifts |
| Supervisor | Aisha Rashid Al Zaabi, Helpdesk Supervisor |
| System | RFM Connect CAFM (helpdesk module) with integrated telephony |
| Call recording | All inbound and outbound calls recorded; recordings retained for 12 months |

## 2. Access channels

- **Telephone:** one toll-free number for all RFM clients. The interactive voice menu offers Arabic or English first, then routes the caller to the next available agent. P1 emergencies bypass the menu with a single key press.
- **Client portal and app:** client staff can raise requests, attach photographs and follow job status in RFM Connect.
- **Email:** monitored mailbox, with every email converted to a request within 15 minutes during all shifts.
- **Automatic requests:** BMS alarms and technician-logged faults create requests directly in RFM Connect.

## 3. Staffing and shift pattern

| Shift | Hours | Agents on duty (typical) |
|---|---|---|
| Morning | 06:00 – 14:00 | 6 |
| Evening | 14:00 – 22:00 | 5 |
| Night | 22:00 – 06:00 | 3 |

The 18 agents include relief cover for leave and training. Every shift has at least one Arabic-speaking and one English-speaking agent; most agents are fluent in both. A shift leader is on duty at all times and the Helpdesk Supervisor is on call out of hours.

## 4. Request handling process

1. **Receive and identify** — the agent confirms the caller, site and location using the RFM Connect site hierarchy.
2. **Log** — the request is logged with a fault code from the standard library and a job number is issued.
3. **Prioritise** — the priority (P1–P4) is set from the fault code and the agent's questions, following the reactive maintenance method statement (RFM-LIB-011).
4. **Dispatch** — the job is assigned to the technician or subcontractor; P1 and P2 jobs are confirmed by phone.
5. **Monitor** — agents monitor live response clocks on the Care Centre dashboard and escalate according to the escalation matrix.
6. **Close and confirm** — on completion the requester is notified and can reopen the job within 48 hours.

## 5. Call recording and quality assurance

- All calls are recorded automatically by the telephony platform integrated with RFM Connect; each recording is linked to its job number.
- Recordings are retained for **12 months** and then deleted automatically. They are stored in the same UAE data centre as RFM Connect.
- The Helpdesk Supervisor reviews at least 10 recorded calls per agent per month against a quality checklist (greeting, identification, correct priority, clear expectation of response time, courtesy).
- Clients may request specific recordings related to complaints or incidents.

## 6. Helpdesk performance 2025

| Measure | 2025 result |
|---|---|
| Total requests handled | 148,320 |
| Average speed of answer (telephone) | 21 seconds |
| Call abandonment rate | 2.9% |
| Requests by channel | Telephone 62%, portal/app 21%, email 9%, BMS/technician-logged 8% |

## 7. Complaints handling

Complaints about RFM's service (as distinct from fault reports) are logged as a separate request type, acknowledged within 1 hour, investigated by the relevant Operations Manager and closed with a written response within 2 working days. Complaints are reported monthly to each client with root cause and actions.

## 8. Business continuity

- A standby helpdesk position with six workstations is maintained at the Ras Al Marsa Industrial depot (MN-05). If the Al Quoz office is unavailable, calls are re-routed to the depot or to agents working remotely through the cloud telephony platform.
- The continuity arrangements are tested twice a year; the last test on 18 March 2026 re-routed calls within 11 minutes.
