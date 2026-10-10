---
id: RFM-LIB-015
title: RFM Connect — CAFM Platform Description
title_ar: منصة RFM Connect — نظام إدارة المرافق بمساعدة الحاسوب
type: System description
ref: RFM/BID/LIB/015
date: 2026-05-11
owner: Raseen FM — Digital & CAFM
classification: Commercial in confidence
lang: en
---

# RFM Connect — CAFM Platform Description

## 1. Overview

RFM Connect is Raseen FM's in-house computer-aided facilities management (CAFM) platform. It has been developed and operated by RFM's Digital & CAFM team since 2016 and is used on all 46 RFM sites. It is the single system of record for assets, planned and reactive work, helpdesk requests, inspections, HSE records and performance reporting. In 2025 RFM Connect processed 148,320 helpdesk requests in addition to planned work orders.

## 2. Hosting and data residency

- RFM Connect is **hosted in a UAE data centre in Dubai**. Application servers, databases, file storage (photographs and documents) and call recordings are all hosted in the UAE.
- Backups are taken daily and stored in a second, geographically separate data centre, also in the UAE.
- No client data is stored or processed outside the United Arab Emirates.
- At the end of a contract, all client data is exported in open formats (CSV/Excel, PDF and COBie spreadsheet for assets) and handed over to the client.

## 3. Core modules

| Module | Main functions |
|---|---|
| Helpdesk | Request logging, fault-code library, priority assignment, SLA clocks, integrated telephony and call recording |
| Work management | Reactive and planned work orders, dispatch, escalation, on-hold control, close-out |
| PPM | SFG20-aligned PPM task library, annual plans, automatic scheduling, compliance reporting |
| Asset register | Asset hierarchy, condition grades, remaining life, warranties, documents, photographs |
| Inspections and quality | Site quality inspections, cleaning audits, supervisor re-inspections, non-conformances |
| HSE | Permits to work, incident reporting, inspections, recordable-injury classification |
| Reporting | Live dashboards, monthly performance reports, KPI and SLA calculations |

## 4. Technician mobile app

- Android and iOS app used by all technicians and supervisors.
- **Offline mode:** work orders, checklists and asset data are cached on the device, so technicians can work in plant rooms and basements without signal; data synchronises automatically when the connection returns.
- **QR asset tagging:** every maintainable asset carries a QR tag; scanning it opens the asset history and confirms the technician's presence at the asset.
- Real-time job status: accepted, travelling, on site, on hold, completed — visible to the Care Centre and to the client portal.
- Photographs, readings and customer signatures are captured on the device.

## 5. Asset register and COBie data exchange

- Assets are held in a configurable hierarchy (for example Site › Building › Floor › Space › System › Asset), which can be aligned with a client's own asset hierarchy during mobilisation.
- Each asset record holds manufacturer, model, serial number, capacity, install date, condition grade, expected life and linked documents.
- RFM Connect **imports and exports asset registers from and to COBie spreadsheets**, allowing data exchange with clients' asset management systems and BIM models.

## 6. PPM library

The PPM library contains SFG20-aligned schedules for building services and fabric, adapted for UAE climate conditions and manufacturer requirements. Each schedule defines tasks, frequencies, skills and statutory status. Details of frequencies are set out in the PPM method statement (RFM-LIB-010).

## 7. Client portal and dashboards

- Clients receive **read-only portal access** at no additional cost, with named user accounts.
- The portal shows live job status, SLA clocks, PPM plans and completion, asset register, inspection results and documents.
- **Live dashboards** present KPIs by site and by month: PPM compliance, response and rectification compliance, first-time fix, open jobs by priority, overdue PPM and customer satisfaction.
- Portal users can raise requests and attach photographs; they cannot edit or close work orders.

## 8. Integration and open REST API

RFM Connect provides an **open REST API** with documented endpoints for assets, work orders, PPM schedules and KPIs. The API is used for integration with clients' ERP and asset management systems, BMS alarm feeds and the telephony platform. API access is secured with client-specific credentials and IP restrictions.

## 9. Security and access control

- Role-based access control; each client sees only its own data.
- Multi-factor authentication for all RFM office users and portal administrators.
- Audit trail of all changes to work orders and asset records.
- Annual penetration test by an independent provider; last test completed in March 2026 with no critical findings.
