---
id: IS-POL-01
title: Information Security & Data Classification Policy
title_ar: سياسة أمن المعلومات وتصنيف البيانات
title_en: Information Security & Data Classification Policy
type: Policy
ref: MNDA/DTO/POL/IS-01
date: 2025-11-01
owner: Digital Transformation Office
classification: Internal
lang: en
---

# Information Security & Data Classification Policy (IS-POL-01)

| Item | Detail |
|---|---|
| Reference | MNDA/DTO/POL/IS-01 · Version 3.0 |
| Effective | 1 November 2025 (supersedes version 2.4 of 1 March 2024) |
| Approved by | H.E. Eng. Khalid Saif Al Mazrouei, Director General |
| Policy owner | Hessa Abdulla Al Suwaidi, Director, Digital Transformation Office |
| Operational lead | Information Security Manager, Digital Transformation Office |
| Report incidents | IT Service Desk ext. 4357 · itservicedesk@mnda.gov.ae |

Version 3.0 introduces rules for AI tools, mandatory MFA for all remote access, and the external portal as the only
channel for sharing documents with contractors.

## 1. Purpose and scope

This policy protects the confidentiality, integrity and availability of the Authority's information and sets one
classification scheme that every system, document and employee must use.

It applies to all information created, received or held by MNDA in any form — electronic records in MNDA Records
(EDRMS), Tamkeen CMS, MNDA ePermits, MNDA People, MNDA Finance and Marsa Atlas; email and Microsoft Teams; paper
files; and information processed by AI systems, including the NARVO platform. It applies to all employees, secondees,
contractors, consultants and vendors with access to MNDA information or systems.

Department directors are the information owners for their business records and decide the classification of the
information their department creates. Where a document combines information of different levels, the highest level
applies to the whole document.

## 2. Classification levels

| Level | Definition | Examples |
|---|---|---|
| **Public** | Approved for release to anyone; disclosure causes no harm | Circulars, service guides, published fees and SLAs, press releases, the MNDA Smart app content |
| **Internal** | For MNDA employees; disclosure outside MNDA would cause limited harm | Policies, procedures, handbooks, the staff directory, internal circulars, project plans |
| **Confidential** | Restricted to named roles with a need to know; disclosure would cause serious harm to MNDA or to individuals | Performance reviews before publication, tender evaluations, personal data (Emirates ID, family book, salary, health), legal opinions, management performance reports |
| **Secret** | Information of national or exceptional sensitivity | Not stored in any MNDA IT system; handled on paper by the Director General's Office only |

Unlabelled information is treated as **Internal** until its owner classifies it.

## 3. Handling rules

### 3.1 Handling rules — storage and email

| Level | Storage | Email |
|---|---|---|
| Public | Any MNDA system; may be published on mnda.gov.ae and MNDA Smart | Any recipient |
| Internal | MNDA Records (EDRMS), Teams and department sites; MNDA-managed devices only | Any @mnda.gov.ae address; external recipients only where needed for MNDA business |
| Confidential | EDRMS restricted folders or the system of record; never on personal devices or local desktop folders | @mnda.gov.ae only, with the "Confidential" sensitivity label (encrypts automatically); no forwarding outside MNDA |
| Secret | Paper only, DG's Office safe | Not permitted |

### 3.2 Handling rules — printing, contractors and AI tools

| Level | Printing | Sharing with contractors | AI tools |
|---|---|---|---|
| Public | No restriction | Permitted | Permitted, including the public MNDA assistant |
| Internal | MNDA printers, collect promptly | Only project-specific documents via the external portal, under NDA | MNDA private AI platform (NARVO) only |
| Confidential | Secure print release (badge at printer); shred after use | Not permitted without written Director approval and a named-recipient NDA | NARVO only, for users with Confidential access to that collection |
| Secret | DG's Office only | Not permitted | Not permitted |

Entering Internal or Confidential information into public AI chatbots or external AI services is prohibited
(see AI-POL-01 and IT-POL-02).

## 4. Labelling

1. Documents carry their classification in the header or footer of every page ("Public", "Internal",
   "Confidential") and in the document properties of MNDA Records (EDRMS).
2. Emails and Teams files use the Microsoft 365 sensitivity labels of the same names. The default label is Internal.
3. Confidential documents also carry the owning department and the words "Not for distribution outside MNDA".
4. Datasets, reports and dashboards are labelled at the level of the most sensitive field they contain; a report
   containing names with Emirates ID numbers is Confidential even if the rest is Internal.
5. Downgrading a classification (for example publishing a report) requires the information owner's approval and
   is recorded in EDRMS.

## 5. Access control and least privilege

1. Access to systems is granted on the principle of **least privilege**: only the functions and data needed for the
   role. Requests go through the MNDA Service Portal and require **line manager approval and system owner approval**.
2. Privileged and administrator accounts are separate from day-to-day accounts and are reviewed monthly.
3. System owners complete a **quarterly access review** for their system; access not confirmed is removed.
4. Human Capital notifies the DTO of movers and leavers through MNDA People; access is removed on the last working
   day for leavers and within 5 working days of a role change for movers.
5. Generic or shared user accounts are not permitted, except shared mailboxes with named members.

## 6. Authentication and MFA

1. **Multi-factor authentication (MFA)** is mandatory for all remote access, VPN, Microsoft 365, the MNDA Service
   Portal, MNDA People and every system holding Confidential information.
2. Passwords have at least 14 characters, are not reused across the last 10 passwords, and are never shared or
   written down. Self-service password reset in the MNDA Service Portal requires MFA.
3. Accounts lock after 5 failed attempts for 15 minutes.
4. Devices lock automatically after 10 minutes of inactivity; laptops use full-disk encryption.
5. The Service Desk will never ask for a password or an MFA code by phone, email or Teams; any such request must be
   reported as a phishing attempt.

## 7. Clean desk and clear screen

1. Lock your screen (Windows key + L) whenever you leave your workstation.
2. At the end of the day, Confidential paper documents are locked in a cabinet; desks hold no case files, contract
   papers or printed personal data.
3. Confidential paper documents are never taken home, including on remote work days (HC-POL-07).
4. Whiteboards and meeting screens are cleared after meetings; visitors are escorted on office floors.
5. Confidential waste goes in the locked shredding consoles on every floor; it is never placed in ordinary bins.
6. Facilities & Assets carries out unannounced clean-desk checks each quarter and reports results to directors.

## 8. Incident reporting

Report any suspected incident **immediately** to the IT Service Desk (ext. 4357, itservicedesk@mnda.gov.ae) — lost
or stolen devices, phishing, malware, unauthorised access, data sent to the wrong recipient, or disclosure of
Confidential information.

| Security priority | Examples | Report within |
|---|---|---|
| **P1 — Critical** | Suspected breach of Confidential or personal data, ransomware, compromised privileged account | **1 hour** of discovery, by phone and email |
| P2 — High | Lost or stolen MNDA laptop or phone, email sent to the wrong external recipient | 4 hours |
| P3 — Medium | Phishing email clicked without data entered, policy breach without data loss | Same working day |

Do not investigate, delete evidence or contact the suspected party yourself. Incidents involving AI systems are also
reported to ai.governance@mnda.gov.ae (AI-POL-01). The Head of Legal Affairs decides on any external notification.

## 9. Contractor and third-party access

1. Contractors and consultants sign the MNDA **non-disclosure agreement** before any access is granted; their
   company signs the information security schedule of the contract.
2. They may access **Public** information and **project-specific Internal** documents only. Confidential information
   is not shared unless a Director approves in writing for a named recipient.
3. Documents are shared exclusively through the **MNDA external portal** (partners.mnda.gov.ae), with access expiring
   at the end of the engagement or after 90 days, whichever is earlier, and renewed by the MNDA project manager.
4. Contractor accounts use MFA and are reviewed monthly by the sponsoring department.
5. Contractors may not connect personal or company devices to the MNDA internal network.

## 10. Compliance and exceptions

Compliance is monitored by the Digital Transformation Office and audited annually by Internal Audit. Breaches are
handled under the Authority's disciplinary procedures and, for contractors, under the contract.

Exceptions must be requested in the MNDA Service Portal with a business justification, approved by the Information
Security Manager and the requesting Director, and are valid for a maximum of 6 months.

Related documents: AI-POL-01 Responsible AI; IT-POL-02 Acceptable Use; RM-POL-02 Records Management & Retention;
HC-POL-07 Remote & Flexible Work.
