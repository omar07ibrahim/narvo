import "server-only";
import { search } from "@/lib/retrieval";
import type { Citation } from "@/lib/ai/events";
import { detectConflicts, oppHealth, type ConflictReport } from "./compute";
import type { Interaction, Opportunity, SalesData } from "./types";

/**
 * Builds the numbered evidence pack the model is allowed to use: CRM interactions, quotation,
 * customer document, frame agreement, credit file, handover record and policy passages.
 * Every item gets a [n] marker that the UI turns into a hover citation.
 */

export interface SourcePack {
  citations: Citation[];
  context: string;
  report: ConflictReport;
}

const TYPE_LABEL: Record<string, string> = {
  email: "Email",
  call: "Call note",
  meeting: "Meeting notes",
  whatsapp: "WhatsApp",
  note: "CRM note",
};

const money = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

export function interactionTitle(i: Interaction) {
  return `${TYPE_LABEL[i.type] ?? i.type} · ${i.from} → ${i.to}`;
}

export function buildSourcePack(
  data: SalesData,
  opp: Opportunity,
  opts: { scope: "opportunity" | "account"; policyQueries?: string[]; maxInteractions?: number } = { scope: "opportunity" },
): SourcePack {
  const account = data.accounts.find((a) => a.id === opp.accountId)!;
  const report = detectConflicts(data, opp);
  const items: Array<{ c: Omit<Citation, "n">; body: string }> = [];

  const related = data.interactions
    .filter((i) => (opts.scope === "account" ? i.accountId === opp.accountId : i.opportunityId === opp.id))
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(-(opts.maxInteractions ?? 40));
  for (const i of related) {
    const otherOpp = i.opportunityId !== opp.id ? data.opportunities.find((o) => o.id === i.opportunityId) : null;
    items.push({
      c: {
        docId: i.id,
        title: `${interactionTitle(i)}${i.subject && i.subject !== "WhatsApp" ? ` — ${i.subject}` : ""}`,
        ref: i.id,
        section: i.at.slice(0, 16).replace("T", " "),
        quote: i.body.length > 600 ? i.body.slice(0, 600) + "…" : i.body,
      },
      body: `${otherOpp ? `(related opportunity ${otherOpp.id} ${otherOpp.title}) ` : ""}${i.direction.toUpperCase()} ${i.type} on ${i.at.slice(0, 16).replace("T", " ")}\nFrom: ${i.from}\nTo: ${i.to}\nSubject: ${i.subject}\n${i.body}`,
    });
  }

  const q = report.quote;
  if (q) {
    const lines = q.lines.map((l) => `${l.sku} ${money(l.qty)} ${l.unit} @ AED ${money(l.unitPrice)}`).join("; ");
    items.push({
      c: { docId: q.id, title: `Quotation ${q.id} — ${q.title}`, ref: q.id, section: `issued ${q.issuedAt} · valid to ${q.validUntil} · ${q.status}`, quote: `${lines}. ${q.paymentTerms}. ${q.priceBasis} ${q.delivery}.` },
      body: `Quotation ${q.id} issued ${q.issuedAt} by ${q.preparedBy}, valid until ${q.validUntil} (status ${q.status}). Lines: ${lines}. Total AED ${money(report.totals.quote ?? 0)} excl. VAT. Payment: ${q.paymentTerms}. Price basis: ${q.priceBasis}. Delivery: ${q.delivery}. Retention ${q.retentionPct}%. Notes: ${q.notes ?? ""}`,
    });
  }
  const d = report.doc;
  if (d) {
    items.push({
      c: { docId: d.id, title: `${d.type} ${d.ref}`, ref: d.ref, section: `issued ${d.issuedAt}`, quote: d.text.slice(0, 600) },
      body: `${d.type} ${d.ref}, issued ${d.issuedAt} by ${d.issuedBy}. Total AED ${money(report.totals.doc ?? 0)} excl. VAT.\n${d.text}`,
    });
  }
  const k = report.contract;
  if (k) {
    const rates = Object.entries(k.rates)
      .map(([sku, r]) => `${sku} ${money(r)}`)
      .join(", ");
    items.push({
      c: { docId: k.id, title: k.title, ref: k.id, section: `valid ${k.validFrom} – ${k.validTo}`, quote: `Q4 2026 rates: ${rates}. ${k.paymentTermsDays} days ${k.paymentBasis}. ${k.priceAdjustment} Retention: ${k.retention}.` },
      body: `${k.title} (${k.id}), valid ${k.validFrom} to ${k.validTo}, signed ${k.signedOn} by ${k.signedBy}. Q4 2026 rates (AED excl. VAT): ${rates}. Q3 rebar rates: ${Object.entries(k.ratesQ3 ?? {})
        .map(([s, r]) => `${s} ${money(r)}`)
        .join(", ")}. Payment ${k.paymentTermsDays} days ${k.paymentBasis}. Delivery: ${k.delivery}. Price adjustment: ${k.priceAdjustment} Retention: ${k.retention}. General rules: project quotes may not exceed frame rates without written customer acceptance; prices below frame need Sales Director approval, below standard cost + 4% need the GM; terms beyond tier need Group CFO; retention, LDs and fixed-price-for-project clauses need a signed amendment.`,
    });
  }
  const credit = report.credit;
  items.push({
    c: {
      docId: `CREDIT-${account.id}`,
      title: `Credit file — ${account.name}`,
      ref: data.creditPolicy.ref,
      section: `as of ${data.today}`,
      quote: `Tier ${account.tier}; limit AED ${money(account.creditLimit)}; AR AED ${money(account.arOutstanding)} (overdue >30 d AED ${money(account.overdue30)}); open orders AED ${money(account.openOrdersInclVat)} incl. VAT.`,
    },
    body: `Credit file ${account.name} (${account.id}), tier ${account.tier}, credit limit AED ${money(account.creditLimit)}, standard terms ${account.paymentTermsDays} days, AR outstanding AED ${money(account.arOutstanding)} of which AED ${money(account.overdue30)} overdue > 30 days, open uninvoiced orders AED ${money(account.openOrdersInclVat)} incl. VAT → exposure AED ${money(account.arOutstanding + account.openOrdersInclVat)}.${credit ? ` Projected peak exposure if awarded: ${credit.scenarios.map((s) => `AED ${money(s.projected)} at ${s.termsDays} days`).join("; ")}. Award = ${credit.awardPctOfLimit}% of limit${credit.requiresLimitReview ? " → limit review required (policy: single opportunity > 50% of limit)" : ""}.` : ""} YTD 2026 revenue AED ${money(account.ytd2026)}; 2025 revenue AED ${money(account.revenue2025)}. Account notes: ${account.notes}`,
  });

  const ho = data.handovers.find((h) => h.accountIds.includes(account.id));
  if (ho) {
    items.push({
      c: { docId: ho.id, title: `KAM handover ${ho.id} — ${ho.from} → ${ho.to}`, ref: ho.id, section: `effective ${ho.effective}`, quote: `${ho.reason} Status: ${ho.status}` },
      body: `KAM handover ${ho.id}: ${ho.from} → ${ho.to}, effective ${ho.effective}, approved by ${ho.approvedBy}. ${ho.reason} Handover note due ${ho.dueBy}; note id ${ho.handoverNoteId}. Status: ${ho.status}.`,
    });
  }

  const queries = opts.policyQueries ?? [];
  if (queries.length) {
    const seen = new Set<string>();
    const hits = queries
      .flatMap((qq) => search("raseen/knowledge", qq, 2))
      .filter((h) => {
        const key = `${h.docId}|${h.section}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 5);
    for (const h of hits) {
      items.push({
        c: { docId: h.docId, title: h.title, ref: h.ref, section: h.section, quote: h.text.length > 520 ? h.text.slice(0, 520) + "…" : h.text },
        body: `${h.title} (${h.ref ?? h.docId}) — section "${h.section}":\n${h.text}`,
      });
    }
  }

  const citations: Citation[] = items.map((it, idx) => ({ n: idx + 1, ...it.c }));
  const context = items.map((it, idx) => `[${idx + 1}] ${it.c.title} (${it.c.ref ?? it.c.docId})\n${it.body}`).join("\n\n---\n\n");
  return { citations, context, report };
}

/** Computed facts the model must treat as authoritative. */
export function computedFacts(data: SalesData, opp: Opportunity, report: ConflictReport): string {
  const account = data.accounts.find((a) => a.id === opp.accountId)!;
  const h = oppHealth(opp, data.interactions, data.today);
  const lines: string[] = [
    `Today: ${data.today} (Sunday). UAE work week Mon–Fri.`,
    `Opportunity ${opp.id} "${opp.title}" — ${account.name}, value AED ${money(opp.value)}, stage ${opp.stage} for ${h.daysInStage} days (stall threshold ${h.threshold}) → ${h.stalled ? "STALLED" : "moving"}. Probability ${opp.probability}%. Expected close ${opp.expectedClose}.`,
    `Owner ${opp.owner}${opp.previousOwner ? ` (took over from ${opp.previousOwner} on ${opp.ownerChangedAt})` : ""}. Next step in CRM: "${opp.nextStep}" due ${opp.nextStepDate ?? "—"}${h.nextStepOverdue && h.nextStepInDays != null ? ` (overdue by ${-h.nextStepInDays} days)` : ""}.`,
    `Last customer-facing contact: ${h.lastTouch ? `${h.lastTouch.at.slice(0, 10)} (${h.daysSinceTouch} days ago, ${h.lastTouch.type}, ${h.lastTouch.direction})` : "none"}.`,
  ];
  if (report.available) {
    if (report.totals.quote != null) lines.push(`Quote total AED ${money(report.totals.quote)}.`);
    if (report.totals.doc != null) lines.push(`Customer document total AED ${money(report.totals.doc)}.`);
    if (report.totals.contract != null) lines.push(`Same quantities at frame-agreement Q4 rates: AED ${money(report.totals.contract)}.`);
    if (report.totals.docVsContract != null) lines.push(`Customer document vs frame rates: AED ${money(report.totals.docVsContract)}.`);
    for (const l of report.lines) {
      lines.push(
        `  ${l.sku} ${money(l.qty)} ${l.unit}: quote ${l.quotePrice ?? "—"} · customer ${l.docPrice ?? "—"} · frame ${l.contractPrice ?? "—"} · list ${l.listPrice} · floor (cost+4%) ${l.floorPrice}${l.impactAed ? ` · impact AED ${money(l.impactAed)}` : ""}`,
      );
    }
    lines.push(`Detected conflicts (${report.conflicts.length}):`);
    for (const c of report.conflicts) lines.push(`  [${c.id}] ${c.title.en} — ${c.detail.en} Approver: ${c.approver ?? "n/a (non-negotiable)"}. Rule: ${c.rule}.`);
  }
  if (report.credit)
    lines.push(
      `Credit: limit AED ${money(report.credit.limit)}, exposure AED ${money(report.credit.exposure)} (${report.credit.utilisationPct}%), award ${report.credit.awardPctOfLimit}% of limit${report.credit.requiresLimitReview ? " → limit review required" : ""}.`,
    );
  if (report.window) lines.push(`Site window for ${report.window.zone}: ${report.window.days} ${report.window.from}–${report.window.to}; ${report.window.gate}.`);
  return lines.join("\n");
}

export const POLICY_QUERIES = {
  brief: ["Gulf Crest frame agreement Q4 rates rebar", "temporary credit release Group CFO limit", "Marina Quarter delivery window gate permit"],
  conflicts: [
    "payment terms beyond tier maximum Group CFO credit insurance",
    "temporary credit release limit review single opportunity",
    "Marina Quarter delivery window Mon–Sat 09:00–16:00",
    "frame agreement general rules retention fixed price amendment",
  ],
  handover: ["temporary credit release Group CFO", "Marina Quarter delivery window"],
  action: ["payment terms beyond tier maximum Group CFO", "Marina Quarter delivery window", "Sahara Rebar Mills maintenance October"],
};
