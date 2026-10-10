---
id: RG-FIN-POL-09
title: Accounts Payable — Three-Way Match & Invoice Exceptions Policy (rev. 4)
title_ar: الحسابات الدائنة — سياسة المطابقة الثلاثية واستثناءات الفواتير (الإصدار 4)
type: Policy
ref: RG-FIN-POL-09 rev. 4
date: 2026-05-12
owner: Group Finance (Group CFO Priya Raghavan; AP Supervisor Deepak Menon)
classification: Internal
lang: en
---

# Accounts Payable — three-way match & invoice exceptions (RG-FIN-POL-09 rev. 4)

## Three-way match

Every supplier invoice is matched to the **purchase order (RBM-PO-26-NNNNN)** and the **goods received note
(GRN-26-NNNNN)** before payment. Tolerances:

| Check | Tolerance |
|---|---|
| Quantity invoiced vs quantity received (GRN) | **0** — pay only what was received (steel by weighbridge ticket) |
| Unit price vs PO price | ±0.5% |
| Invoice total vs computed total | ±AED 50 |
| VAT | 5% of the taxable amount after discounts, ±AED 1 |
| Supplier TRN | Mandatory on any invoice that charges VAT |
| Duplicate | Same supplier + same invoice number, or same supplier + PO + amount within 90 days |

Charges not on the PO (freight, surcharges, fuel levies, pallets) are **exceptions** unless a signed contract
amendment exists.

## Treatments

| Exception | Standard treatment |
|---|---|
| Short receipt | Short-pay to GRN quantity; request credit note for the difference |
| Price above PO | Pay at PO price; request credit note; supplier must show a valid quotation for any increase |
| Un-agreed charge (surcharge, freight) | Reject the line; pay the balance if otherwise matched |
| Duplicate invoice | Reject; notify supplier; never pay twice |
| VAT error | Request a corrected tax invoice — input VAT cannot be recovered on an incorrect tax invoice |
| Missing TRN | Hold the invoice; request a valid tax invoice and VAT certificate; pay net of VAT only if supplier confirms not VAT-registered |
| Wrong PO reference | Correct the reference after buyer confirmation; re-match |
| Partial credit note | Match the credit note to the original claim; pursue the balance |

## Approval matrix

| Invoice / adjustment value | Approver |
|---|---|
| Up to AED 50,000 | **Deepak Menon**, AP Supervisor, Group Finance |
| Above AED 50,000 | **Priya Raghavan**, Group CFO |

## Posting

AP control 2100 · GR/IR clearing 2110 · Input VAT 1410 · Purchase price variance 5120 · Freight-in 5130 ·
AP suspense 2190. Short-pays post the received value to GR/IR and leave the difference open in suspense until the
credit note arrives.

## Service level

Exceptions are resolved within **5 working days**; the AP team closes the September batch by 15 October 2026.
