import "server-only";
import { search } from "@/lib/retrieval";
import type { Citation } from "@/lib/ai/events";
import { DOW_EN, NOW, TODAY, addDays, fmtDay, fmtSlot, weekday, windowLabel, zoneRule } from "./calendar";
import { deliverableFrom, openQty } from "./detect";
import { aedText, customerOf, fmtNum, productOf, round2 } from "./rules";
import type { OrderAnalysis, Proposal, SalesOrder, Snapshot, WorldAnalysis } from "./types";

export const ORG_CONTEXT =
  "Organisation: Raseen Building Materials Trading LLC (RBM), part of Raseen Group, a UAE building-materials distributor with warehouses at Jebel Ali (JA) and Ras Al Marsa Industrial MN-05 (MN05). " +
  "Demo today is Sunday 11 October 2026 (Gulf Standard Time). Sahara Rebar Mills is shut for planned maintenance 5–19 Oct 2026; dispatches resume 20 Oct. Amounts are AED excluding 5% VAT unless stated.";

export function langLine(lang: "en" | "ar") {
  return lang === "ar"
    ? "Write all free text in Arabic (Modern Standard Arabic, professional UAE business register). Keep SKU codes, order numbers and PO numbers in Latin characters."
    : "Write all free text in English.";
}

/** Explicit weekday calendar — models are unreliable at weekday arithmetic. */
export function calendarText(from = "2026-10-05", days = 28) {
  const out: string[] = [];
  let d = from;
  for (let i = 0; i < days; i++) {
    out.push(`${DOW_EN[weekday(d)]} ${d}${d === TODAY ? " (today)" : ""}`);
    d = addDays(d, 1);
  }
  return `CALENDAR (weekday + date, Gulf time): ${out.join(", ")}`;
}

export function catalogueText(s: Snapshot) {
  return s.master.products.map((p) => `${p.sku} — ${p.name} / ${p.nameAr} (unit ${p.unit})`).join("\n");
}

export function orderContext(s: Snapshot, o: SalesOrder) {
  const c = customerOf(s.master, o.customerId);
  return [
    `${o.id} · ${o.customerName} (${c?.id}, Tier ${c?.tier}${c?.contractId ? `, frame agreement ${c.contractId}` : ""}) · customer PO ${o.customerPo}`,
    `Project: ${o.project} · site ${o.site} · zone ${o.zone} · ships from ${o.shipFrom}`,
    `Requested ${fmtSlot(o.requestedDelivery)} (${o.requestedDelivery}) · promise ${o.promiseDate} · status ${o.status} · KAM ${o.kam}`,
    ...o.lines.map((l) => `  line ${l.lineNo}: ${l.sku} ${fmtNum(l.qty, 2)} ${l.unit} @ AED ${fmtNum(l.unitPrice, 2)}${l.deliveredQty ? ` (delivered ${fmtNum(l.deliveredQty, 2)})` : ""}`),
  ].join("\n");
}

/** Knowledge passages relevant to the exception types — numbered for [n] citations. */
export function policyCitations(types: string[], extra: string[] = [], k = 6): Citation[] {
  const queries: string[] = [];
  if (types.includes("stock")) queries.push("split deliveries promise date per line transfer Jebel Ali MN-05 AED 38 per tonne", "Sahara Rebar Mills maintenance alternative steel source Al Dhafra 165");
  if (types.includes("price")) queries.push("frame rate Q4 2026 rebar indexed quarterly project quotation must not exceed frame rate", "customer PO price is never the reference price exception corrected before invoice");
  if (types.includes("window")) queries.push("Marina Quarter delivery window 09:00 16:00 gate permit 48 h no deliveries Sundays gated communities", "requests outside a window re-scheduled next available slot");
  if (types.includes("credit")) queries.push("credit exposure AR open sales orders VAT automatic credit hold", "temporary credit release Group CFO 15% 30 days partial release preferred");
  queries.push("resolution options promise per order line margin impact credit exposure after billing handover", ...extra);
  const hits = queries.flatMap((q) => search("raseen/knowledge", q, 3));
  const seen = new Set<string>();
  const uniq = hits
    .sort((a, b) => b.score - a.score)
    .filter((h) => {
      const key = `${h.docId}|${h.section}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, k);
  return uniq.map((h, i) => ({ n: i + 1, docId: h.docId, title: h.title, ref: h.ref, section: h.section, quote: h.text.slice(0, 700) }));
}

export function citationsText(c: Citation[]) {
  return c.map((x) => `[${x.n}] ${x.ref ?? x.docId} — ${x.title} § ${x.section}\n${x.quote}`).join("\n\n");
}

/** Everything the planner model needs to propose options — all numbers precomputed by code. */
export function optionsFacts(s: Snapshot, w: WorldAnalysis, oa: OrderAnalysis, proposal: Proposal | null) {
  const o = oa.order;
  const m = s.master;
  const c = oa.customer;
  const vat = 1 + m.vatRate;
  const rule = zoneRule(m.deliveryRules.siteWindows, o.zone);
  const out: string[] = [];
  out.push("ORDER\n" + orderContext(s, o));
  out.push("DETECTED EXCEPTIONS (computed)\n" + oa.exceptions.map((e) => `- [${e.type}] ${e.title.en}: ${e.detail.en}`).join("\n"));

  for (const l of oa.lines) {
    const p = productOf(m, l.sku);
    if (l.short > 0) {
      out.push(
        [
          `STOCK — line ${l.lineNo} ${l.sku} (open ${fmtNum(l.openQty, 1)} ${p?.unit})`,
          `- available now at ${o.shipFrom} for this order (after earlier promises): ${fmtNum(l.allocated, 1)}; short ${fmtNum(l.short, 1)}`,
          ...l.coverage.map((cv) =>
            cv.kind === "transfer"
              ? `- transfer_stock option: ${fmtNum(cv.qty, 1)} t free at ${cv.warehouse} → ${o.shipFrom}, cost AED ${cv.costPerT}/t, deliverable from ${cv.deliverableFrom}`
              : cv.kind === "inbound"
                ? `- inbound_po option: ${cv.poRef} to ${cv.warehouse}, ${fmtNum(cv.qty, 1)} t can be committed, deliverable from ${cv.deliverableFrom}`
                : `- alternative_supplier option: ${s.altSources[0]?.supplier}, premium AED ${cv.costPerT}/t over standard cost, deliverable from ${cv.deliverableFrom}; needs Supply Chain & Planning Manager approval`,
          ),
          `- minimum rebar drop ${m.deliveryRules.minRebarDropT} t; trailer ${m.deliveryRules.truckCapacityT} t; standard cost AED ${p?.stdCost}/t`,
        ].join("\n"),
      );
    }
    if (l.price.status !== "ok") {
      out.push(`PRICE — line ${l.lineNo} ${l.sku}: entered AED ${fmtNum(l.unitPrice, 2)}; reference ${l.price.kind === "contract" ? `${l.price.contractId} Q4 rate` : `list (desk floor ${fmtNum(l.price.minAllowed ?? 0, 2)})`} AED ${fmtNum(l.price.reference, 2)}; status ${l.price.status}; impact AED ${fmtNum(l.price.impact, 2)}`);
    }
  }
  out.push(
    [
      `SITE WINDOW — ${o.zone}: ${rule.window?.days} ${windowLabel(rule, !!o.cityCentre)}; gate: ${rule.window?.gate}; vehicle: ${rule.window?.maxVehicle}`,
      `- requested ${o.requestedDelivery} → ${oa.window.ok ? "valid" : `NOT valid (${oa.window.reasons.join(", ")}); next valid slot ${oa.window.nextSlot}`}`,
      o.gatePermit ? `- gate permit ${o.gatePermit.ref} on file for ${o.gatePermit.date}` : "- no gate permit on file yet",
      `- now is ${NOW}; slots must be YYYY-MM-DDTHH:mm inside the window`,
      calendarText(TODAY, 21),
    ].join("\n"),
  );
  const cr = oa.credit;
  const maxRel = (m.creditPolicy.temporaryReleaseMaxPct / 100) * cr.limit;
  const nowValue = oa.lines.reduce((a, l) => a + Math.min(l.allocated, l.openQty) * (l.price.status === "ok" ? l.unitPrice : l.price.kind === "contract" ? l.price.reference : l.unitPrice), 0) * vat;
  const fullCorrected = oa.lines.reduce((a, l) => a + l.openQty * (l.price.kind === "contract" ? l.price.reference : l.unitPrice), 0) * vat;
  const baseExp = cr.ar + cr.priorOpen + cr.laterOpen;
  out.push(
    [
      `CREDIT — limit AED ${fmtNum(cr.limit)}; AR AED ${fmtNum(cr.ar)} (overdue 31–60 days AED ${fmtNum(cr.overdue30)}); other open orders incl. VAT AED ${fmtNum(cr.priorOpen + cr.laterOpen, 2)}`,
      `- this order incl. VAT AED ${fmtNum(cr.thisOrder, 2)} → exposure AED ${fmtNum(cr.exposure, 2)} (${fmtNum(cr.pct * 100, 1)}%)`,
      `- if only the stock available now ships (at corrected prices): exposure AED ${fmtNum(baseExp + nowValue, 2)} (${fmtNum(((baseExp + nowValue) / cr.limit) * 100, 1)}%)`,
      `- full order at corrected prices: exposure AED ${fmtNum(baseExp + fullCorrected, 2)}; release needed to ship everything AED ${fmtNum(Math.max(0, baseExp + fullCorrected - cr.limit), 2)}`,
      ...oa.lines
        .filter((l) => l.short > 0)
        .flatMap((l) =>
          l.coverage
            .filter((c) => c.kind !== "inbound")
            .map((c) => {
              const price = l.price.kind === "contract" ? l.price.reference : l.unitPrice;
              const exp = baseExp + nowValue + c.qty * price * vat;
              return `- if ${fmtNum(c.qty, 1)} t ${c.kind === "transfer" ? "transferred from " + c.warehouse : "bought from the alternative source"} also ships early: exposure AED ${fmtNum(exp, 2)} → release needed AED ${fmtNum(Math.max(0, exp - cr.limit), 2)}`;
            }),
        ),
      `- temporary release max ${m.creditPolicy.temporaryReleaseMaxPct}% = AED ${fmtNum(maxRel)}, valid ${m.creditPolicy.temporaryReleaseValidityDays} days, Group CFO only; partial release preferred; needs dated payment commitment for overdue amounts`,
      `- if the customer pays the overdue AED ${fmtNum(cr.overdue30)}: full exposure AED ${fmtNum(baseExp + fullCorrected - cr.overdue30, 2)}`,
      cr.commitment
        ? `- dated payment commitment on file: AED ${fmtNum(cr.commitment.amount)} on ${cr.commitment.date} (${cr.commitment.committedBy}, ${cr.commitment.role}; ${cr.commitment.id}) → full exposure after that payment AED ${fmtNum(baseExp + fullCorrected - cr.commitment.amount, 2)}`
        : "- no dated payment commitment on file",
    ].join("\n"),
  );
  if (proposal) {
    out.push(
      [
        `CUSTOMER'S LATEST MESSAGE (${proposal.docTitle}) — interpreted and applied to the order above`,
        ...proposal.changes.map((ch) => `- ${ch.label.en}`),
        proposal.minFirstDropQty ? `- first drop must be at least ${proposal.minFirstDropQty}` : "",
        proposal.balanceByDate ? `- balance by ${proposal.balanceByDate}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  void w;
  return out.join("\n\n");
}

export const ACTIONS_GUIDE = `ACTION TYPES (use only these; quantities in the line's unit):
- split_delivery {sku, nowQty, nowWarehouse, laterQty, laterSource: "inbound_po"|"transfer"|"alternative_supplier", laterPoRef}: first drop from stock available now + ONE balance portion. nowQty + laterQty must equal the open quantity of the line.
- transfer_stock {sku, fromWarehouse, qty}: move free stock from the other warehouse (cost per tonne applies). If you combine it with split_delivery, set split laterSource "transfer" and laterQty = transfer qty + any remainder; the remainder goes to the earliest inbound PO.
- alternative_supplier {sku, qty, premiumPerT}: buy from the approved alternative source (rebar only).
- correct_price {sku|null, to: "contract"|"list_allowed"}: set mismatched lines to the reference price.
- reschedule {slot}: first delivery slot YYYY-MM-DDTHH:mm — must be inside the site window and not before stock is available.
- partial_credit_release {amount}: CFO temporary release above the limit (AED, ≤ 15% of limit) so held lines can ship.
- hold_for_payment {amount}: keep lines that would exceed the limit on hold until the customer pays this amount.
Rules: each option must address EVERY detected exception type (stock, price, window, credit) that applies; use the exact numbers in the facts; never invent stock, POs or dates; a rebar drop must be at least the minimum drop.`;

export function approvalContext(s: Snapshot, o: SalesOrder, digest: string, extra: { resolved: string[]; customerChanges: string[] } = { resolved: [], customerChanges: [] }) {
  const c = customerOf(s.master, o.customerId);
  return [
    `EXCEPTIONS THIS RESOLUTION CLEARS: ${extra.resolved.join(", ") || "none"} — mention only reasons that belong to these (stock → Sahara Rebar Mills maintenance; window → site window / gate permit; price → frame-agreement rate; credit → scheduled payment). Do not mention any other reason.`,
    extra.customerChanges.length ? `CUSTOMER REQUESTS ACCEPTED INTO THIS PLAN (acknowledge them):\n${extra.customerChanges.map((x) => `- ${x}`).join("\n")}` : "No customer change requests are part of this plan.",
    `Order ${o.id} · ${o.customerName} (${c?.id}) · customer PO ${o.customerPo} · project ${o.project} · site ${o.site} (${o.zone})`,
    `KAM ${o.kam}; customer contact ${o.contact?.name} (${o.contact?.role}); site contact ${o.siteContact?.name ?? "—"}`,
    `Gate permit: ${o.gatePermit ? `${o.gatePermit.ref} for ${o.gatePermit.date}` : "to be booked by dispatch"}`,
    "ORDER AS ENTERED (before this resolution):",
    ...o.lines.map((l) => `  line ${l.lineNo}: ${l.sku} ${fmtNum(l.qty, 2)} ${l.unit} entered at AED ${fmtNum(l.unitPrice, 2)}`),
    `  requested ${fmtSlot(o.requestedDelivery)}`,
    "APPROVED OPTION (all numbers computed by RBM's planning engine — use them exactly):",
    digest,
  ].join("\n");
}

export function openValue(o: SalesOrder) {
  return round2(o.lines.reduce((a, l) => a + openQty(l) * l.unitPrice, 0));
}

export { TODAY, fmtDay, aedText, deliverableFrom };
