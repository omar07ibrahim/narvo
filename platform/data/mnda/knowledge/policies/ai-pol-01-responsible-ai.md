---
id: AI-POL-01
title: Responsible Artificial Intelligence Policy
title_ar: سياسة الذكاء الاصطناعي المسؤول
title_en: Responsible Artificial Intelligence Policy
type: Policy
ref: MNDA/DTO/POL/AI-01
date: 2026-03-15
owner: Digital Transformation Office
classification: Internal
lang: en
---

# Responsible Artificial Intelligence Policy (AI-POL-01)

| Item | Detail |
|---|---|
| Reference | MNDA/DTO/POL/AI-01 · Version 1.2 |
| Effective | 15 March 2026 (supersedes version 1.1 of 1 October 2025) |
| Approved by | H.E. Eng. Khalid Saif Al Mazrouei, Director General |
| Policy owner | Hessa Abdulla Al Suwaidi, Director, Digital Transformation Office |
| Oversight | AI Governance Committee, chaired by Dr. Amna Rashid Al Ketbi |
| Next review | March 2027, or earlier after a major AI incident |
| Contact | ai.governance@mnda.gov.ae |

Version 1.2 adds the data residency rules (section 6), separate Arabic evaluation thresholds (section 9) and the
explicit link to Circular No. 9/2026.

## 1. Purpose and scope

This policy sets the rules under which the Marsa Al Noor Development Authority (MNDA) designs, procures, deploys and
uses artificial intelligence. Its purpose is to let the Authority benefit from AI in serving customers and running
its operations while keeping every decision that affects a person's rights with an accountable employee.

The policy applies to:

- every AI system used by or for MNDA, whether built in-house, procured, or embedded in a vendor product —
  including generative AI assistants, document extraction and OCR, classification, forecasting, process mining
  and retrieval-based question answering;
- the NARVO private AI platform and any AI features in Tamkeen CMS, MNDA ePermits, MNDA People and the MNDA
  Service Portal;
- all employees, secondees, contractors, consultants and vendors who operate AI on the Authority's behalf.

Rule-based automation without a learning component is governed by IT change management, but where it changes the
status of a customer case it is also subject to section 3.

## 2. Principles

All AI use at MNDA must observe the following eight principles. Where they conflict, human accountability and the
protection of personal data take precedence.

1. **Human accountability** — a named employee is answerable for every outcome an AI system contributes to.
2. **Lawfulness and fairness** — AI must comply with UAE law and must not disadvantage any person or group.
3. **Transparency** — people know when AI is involved and can see the sources behind an answer.
4. **Privacy and data residency** — personal data stays on MNDA-controlled infrastructure in the UAE.
5. **Security** — AI systems meet IS-POL-01 like any other information system.
6. **Measured reliability** — no AI capability goes live without passing a documented evaluation.
7. **Bilingual parity** — Arabic and English outputs are held to the same quality standard.
8. **Proportionality** — controls are scaled to risk; higher-risk use cases need Committee approval.

## 3. Human decision rule

AI may **prepare, summarise, draft, translate, extract, check and recommend**. It may **never approve or reject**:

- a housing grant or loan application, or any other customer application;
- a building, fit-out, completion or event permit;
- a grant, payment, refund or invoice;
- a hiring, promotion or disciplinary decision;
- the closure of a complaint.

Every state-changing action — a status change in Tamkeen CMS or MNDA ePermits, an official letter, a write to a
system of record, or a payment release — requires a **named human approver** who holds the delegated authority for
that action. The log records the approver, the time, and the AI output they reviewed. Bulk approval of AI-prepared
actions is not permitted for high-risk (Tier 3) use cases.

This rule is applied in Circular No. 9/2026, section 7: housing eligibility decisions are taken by the Head of the
Housing Applications Section or an authorised deputy, and automated tools may not approve or reject an application.

## 4. Use-case risk tiers and approval

Each AI use case is registered with the Digital Transformation Office (DTO) and classified before development starts.

| Tier | Typical use cases | Approval to go live |
|---|---|---|
| Tier 1 — Internal productivity | Drafting, summarising internal documents, translation drafts, IT and HR self-service answers | DTO Director |
| Tier 2 — Customer-facing information and case preparation | CHC assistant answers, document completeness checks, permit file pre-checks | AI Governance Committee |
| Tier 3 — Influences decisions about individuals | Eligibility checks, candidate screening support, inspection findings | AI Governance Committee and Director General |
| Prohibited | See section 10 | Not permitted |

A use case moves up a tier if its scope changes. The register is reviewed quarterly by the Committee.

## 5. Transparency

1. **Labelling.** AI-generated or AI-assisted content is labelled "Prepared with AI assistance" (Arabic: "أُعدّ
   بمساعدة الذكاء الاصطناعي") together with the name of the employee who reviewed it.
2. **Citations.** Every factual answer must cite the source documents it relies on (document ID and section). If no
   approved source supports the answer, the assistant must say it cannot confirm and refer the user to a person.
3. **Customer notice.** Customers are told at the start of the conversation, in Arabic and English, that they are
   interacting with an AI assistant, and can ask for a Customer Happiness Centre agent at any time.
4. **Official correspondence** sent to customers remains signed by the responsible employee, never by an AI system.

## 6. Data residency and protection

1. All AI models — language, embedding, OCR and speech — run on **MNDA-controlled infrastructure in the UAE**
   (MNDA private cloud: primary data centre and disaster-recovery site, both inside the UAE).
2. **No customer or employee personal data** may be sent to an external AI service. This covers prompts, uploaded
   files, screenshots and copied text, and also applies to Internal and Confidential information.
3. Development and test environments use **synthetic data only**. Copying production data into a development
   environment is prohibited. Synthetic identity documents carry the watermark "SPECIMEN — DEMO DATA".
4. Vendor contracts prohibit training on MNDA data; model weights used in production are hosted by MNDA.
5. AI components retrieve only the data needed for the task in hand (data minimisation).

## 7. Access control

AI answers follow the user's classification access under IS-POL-01. Retrieval filters documents by classification
and by the user's system permissions **before** an answer is generated, so an assistant can never reveal content
the user could not open directly.

| User group | Classification visible through AI assistants |
|---|---|
| Customers and the public | Public |
| Contractors, consultants and other external parties | Public only |
| MNDA employees | Public and Internal |
| Named roles with need-to-know | Public, Internal and the Confidential collections assigned to the role |

Project-specific Internal documents shared with contractors under IS-POL-01 are provided through the external
portal, not through AI assistants. Secret information is never processed by AI systems.

## 8. Logging and audit

Every AI run is logged: the user, timestamp, model and prompt version, documents and sections retrieved, tool calls
(target system and parameters), the output, and the human approval or rejection that followed. Logs are written to
tamper-evident storage, classified **Confidential**, and retained for **5 years** under RM-POL-02.

Logs are available to Internal Audit, the AI Governance Committee and the DTO platform team. System owners receive a
monthly extract for their use cases. Any request to view logs for an individual employee requires approval from the
Director of Human Capital and the Head of Legal Affairs.

## 9. Evaluation and monitoring

1. **Pre-deployment.** Each use case is tested against a documented test set (minimum 200 cases, built with the
   business owner). The pass mark is **at least 92% accuracy**, measured on answer correctness and citation
   correctness. **Arabic is evaluated separately** and must also reach 92%; an English pass does not cover Arabic.
2. **Safety tests** cover prompt injection, data leakage across classification levels, and biased outputs.
3. **Monthly review.** DTO samples at least 50 live outputs per use case each month and reports accuracy, human
   override rate, customer complaints and drift to the AI Governance Committee.
4. If accuracy falls below 92% in two consecutive months, the use case is restricted to staff-only use or suspended
   until it is re-evaluated. Any model or prompt change requires re-evaluation before release.

## 10. Prohibited uses

The following uses are prohibited regardless of tier or business benefit:

- profiling, scoring or differentiating between people by **nationality, gender, age or marital status**, or by
  religion, disability or photograph;
- **emotion recognition**, including in Customer Happiness Centre calls and job interviews;
- **fully automated decisions** that affect a person's rights or obligations (see section 3);
- monitoring the productivity of individual employees;
- generating content that impersonates a real person, an official or another authority;
- entering MNDA information into public AI tools (see IT-POL-02).

Eligibility conditions set by law — for example UAE nationality for the Housing Grant & Loan Programme — are applied
as explicit rules reviewed by an employee, not by AI scoring. In recruitment, the Emiratisation policy is applied by
Human Capital as a separate, explicit step.

## 11. Roles and responsibilities

| Role | Responsibility |
|---|---|
| Director General | Approves this policy and every Tier 3 use case |
| AI Governance Committee — chair Dr. Amna Rashid Al Ketbi; members: Director DTO, Head of Legal Affairs, Director of Human Capital, Information Security Manager, one rotating business director | Meets monthly; approves Tier 2 and Tier 3 use cases; reviews monitoring results and incidents |
| Digital Transformation Office | Operates the NARVO platform; maintains the use-case register; runs evaluation, logging and monitoring |
| System owners (e.g. Housing & Community Services for Tamkeen CMS, Planning & Building Permits for MNDA ePermits) | Accountable for business use; nominate approvers; maintain test sets |
| All employees | Use approved tools only; review AI outputs before relying on them; report incidents |

## 12. Incident reporting

An AI incident is any of the following: an incorrect AI output that reached a customer or influenced a decision; a
disclosure of information above the user's access level; a biased or offensive output; an unauthorised tool action;
a successful prompt injection; or any other breach of this policy.

1. Report to **ai.governance@mnda.gov.ae within 24 hours** of discovery, with screenshots and the case or ticket
   number. If personal data may be involved, also call the IT Service Desk on ext. 4357 — security incidents follow
   IS-POL-01 (P1 within 1 hour).
2. DTO triages within 1 working day and may suspend the use case immediately.
3. The AI Governance Committee reviews the root cause and corrective actions at its next meeting.

Related documents: Circular No. 9/2026; IS-POL-01; IT-POL-02; RM-POL-02.
