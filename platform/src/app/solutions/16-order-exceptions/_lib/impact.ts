/**
 * Resolution-option validation & impact (pure, deterministic).
 * The model proposes typed actions; this code checks every parameter against stock, inbound POs,
 * the site window and the credit policy, builds the delivery plan per line and computes cost,
 * margin vs standard cost, credit exposure after, approvals — then re-runs detection on the
 * patched order so "cleared" is proven, not asserted.
 */
import { TODAY, addDays, checkSlot, fmtDay, fmtSlot, nextValidSlot, zoneRule } from "./calendar";
import { analyzeWorld, deliverableFrom, lineSource, openQty, sourceLabel } from "./detect";
import { APPROVERS, WH_LABEL, aedBi, customerOf, fmtNum, isRebar, productOf, qtyBi, round2, trucksFor } from "./rules";
import type {
  Bi,
  Delivery,
  ExceptionType,
  LineSource,
  OptionAction,
  OptionImpact,
  OptionIssue,
  OrderLine,
  Proposal,
  ProposedOption,
  SalesOrder,
  Snapshot,
  Wh,
} from "./types";

interface Portion {
  lineNo: number;
  sku: string;
  qty: number;
  src: LineSource;
  note?: Bi;
}

const EPS = 1e-6;
const err = (en: string, ar: string): OptionIssue => ({ level: "error", text: { en, ar } });
const warn = (en: string, ar: string): OptionIssue => ({ level: "warn", text: { en, ar } });
const info = (en: string, ar: string): OptionIssue => ({ level: "info", text: { en, ar } });

export function evaluateOption(s: Snapshot, order: SalesOrder, option: ProposedOption, proposal?: Proposal | null): OptionImpact {
  const m = s.master;
  const customer = customerOf(m, order.customerId)!;
  const rule = zoneRule(m.deliveryRules.siteWindows, order.zone);
  const permitDate = order.gatePermit?.date ?? null;
  const worldOrders = s.orders.map((o) => (o.id === order.id ? order : o));
  const base = analyzeWorld(s, { orders: worldOrders });
  const oa = base.byId[order.id];
  const issues: OptionIssue[] = [];
  const actions = option.actions ?? [];
  const other: Wh = order.shipFrom === "MN05" ? "JA" : "MN05";
  const alt = s.altSources[0];

  /* ── prices ── */
  const newPrice = new Map<number, number>();
  for (const l of oa.lines) newPrice.set(l.lineNo, l.unitPrice);
  let priceRecovered = 0;
  for (const a of actions.filter((x): x is Extract<OptionAction, { type: "correct_price" }> => x.type === "correct_price")) {
    const targets = oa.lines.filter((l) => l.price.status !== "ok" && (!a.sku || a.sku === l.sku));
    if (!targets.length) issues.push(info(`correct_price${a.sku ? ` (${a.sku})` : ""}: no mismatched line — nothing to change`, `تصحيح السعر${a.sku ? ` (${a.sku})` : ""}: لا يوجد بند مختلف السعر`));
    for (const l of targets) {
      let target = l.price.reference;
      if (l.price.kind === "list") target = l.price.status === "discount" ? (l.price.minAllowed ?? l.price.reference) : l.price.reference;
      newPrice.set(l.lineNo, target);
      priceRecovered += (target - l.unitPrice) * l.openQty;
    }
  }

  /* ── stock plan ── */
  const portions: Portion[] = [];
  const shortLines = oa.lines.filter((l) => l.short > EPS);
  const stockActs = actions.filter((x) => x.type === "split_delivery" || x.type === "transfer_stock" || x.type === "alternative_supplier");
  for (const a of stockActs) {
    const sku = (a as { sku?: string | null }).sku;
    if (sku && !oa.lines.some((l) => l.sku === sku)) issues.push(warn(`${a.type}: ${sku} is not on this order — ignored`, `${a.type}: الصنف ${sku} غير موجود في الطلب — تم تجاهله`));
  }
  const usedPo: Record<string, number> = {};
  const pickPo = (sku: string, qty: number, wanted?: string | null): string | null => {
    const rem = (id: string) => (base.poRemaining[id] ?? 0) - (usedPo[id] ?? 0);
    const want = wanted ? s.inbound.find((p) => p.id === wanted && p.sku === sku) : undefined;
    if (wanted && !want) issues.push(warn(`${wanted} is not an inbound PO for ${sku} — using the earliest suitable PO`, `${wanted} ليس أمر شراء وارداً للصنف ${sku} — تم اختيار أقرب أمر مناسب`));
    if (want && rem(want.id) + EPS >= qty) return want.id;
    if (want) issues.push(warn(`${want.id} has only ${fmtNum(rem(want.id), 1)} uncommitted — using another PO`, `${want.id} لا يتوفر فيه سوى ${fmtNum(rem(want.id), 1)} غير مخصصة — تم اختيار أمر آخر`));
    const cands = s.inbound
      .filter((p) => p.sku === sku && rem(p.id) + EPS >= qty)
      .sort((x, y) => deliverableFrom(s, order, { kind: "inbound", poRef: x.id }).localeCompare(deliverableFrom(s, order, { kind: "inbound", poRef: y.id })));
    return cands[0]?.id ?? null;
  };

  for (const l of oa.lines) {
    const isShortTarget = l.short > EPS;
    const mine = (a: OptionAction) => {
      const sku = (a as { sku?: string | null }).sku;
      return sku ? sku === l.sku : isShortTarget && shortLines[0]?.lineNo === l.lineNo;
    };
    const split = actions.find((a): a is Extract<OptionAction, { type: "split_delivery" }> => a.type === "split_delivery" && mine(a));
    const transfers = actions.filter((a): a is Extract<OptionAction, { type: "transfer_stock" }> => a.type === "transfer_stock" && mine(a));
    const alts = actions.filter((a): a is Extract<OptionAction, { type: "alternative_supplier" }> => a.type === "alternative_supplier" && mine(a));
    if (!isShortTarget && !split && !transfers.length && !alts.length) {
      portions.push({ lineNo: l.lineNo, sku: l.sku, qty: l.openQty, src: l.source });
      continue;
    }
    const p = productOf(m, l.sku);
    const unit = p?.unit ?? "";
    const avail = l.allocated;
    const nowQty = round2(split ? split.nowQty : avail);
    if (split?.nowWarehouse && split.nowWarehouse !== order.shipFrom) issues.push(info(`First drop warehouse ${split.nowWarehouse} — orders for ${order.zone} dispatch from ${order.shipFrom}`, `مستودع الدفعة الأولى ${split.nowWarehouse} — التسليم لهذه المنطقة من ${order.shipFrom}`));
    if (nowQty > avail + EPS) issues.push(err(`First drop ${fmtNum(nowQty, 1)} ${unit} exceeds the ${fmtNum(avail, 1)} ${unit} available at ${WH_LABEL[order.shipFrom].en} after earlier promises`, `الدفعة الأولى ${fmtNum(nowQty, 1)} تتجاوز المتاح ${fmtNum(avail, 1)} في ${WH_LABEL[order.shipFrom].ar} بعد الالتزامات السابقة`));
    if (nowQty > EPS) portions.push({ lineNo: l.lineNo, sku: l.sku, qty: Math.min(nowQty, l.openQty), src: { kind: "stock", warehouse: order.shipFrom } });

    let tQty = 0;
    for (const t of transfers) {
      const from = t.fromWarehouse === order.shipFrom ? other : t.fromWarehouse;
      const free = Math.max(0, base.free[`${l.sku}|${from}`] ?? 0);
      if (t.qty > free + EPS) issues.push(err(`Transfer ${fmtNum(t.qty, 1)} ${unit} exceeds free stock ${fmtNum(free, 1)} ${unit} at ${WH_LABEL[from].en}`, `التحويل ${fmtNum(t.qty, 1)} يتجاوز المخزون الحر ${fmtNum(free, 1)} في ${WH_LABEL[from].ar}`));
      if (t.qty > EPS) portions.push({ lineNo: l.lineNo, sku: l.sku, qty: round2(t.qty), src: { kind: "transfer", from, to: order.shipFrom } });
      tQty += t.qty;
    }
    let aQty = 0;
    for (const a of alts) {
      if (!isRebar(m, l.sku) || !alt) {
        issues.push(err(`No approved alternative source for ${l.sku}`, `لا يوجد مصدر بديل معتمد للصنف ${l.sku}`));
        continue;
      }
      if (Math.abs(a.premiumPerT - alt.premiumPerT) > 0.5) issues.push(warn(`Premium AED ${a.premiumPerT}/t differs from the supplier directory (AED ${alt.premiumPerT}/t) — directory value used`, `العلاوة ${a.premiumPerT} درهم/طن تختلف عن دليل الموردين (${alt.premiumPerT}) — اعتُمدت قيمة الدليل`));
      if (a.qty > EPS) portions.push({ lineNo: l.lineNo, sku: l.sku, qty: round2(a.qty), src: { kind: "alt_supplier", supplier: alt.supplier, premiumPerT: alt.premiumPerT } });
      aQty += a.qty;
    }

    // Balance described by split_delivery (normalised against explicit transfer / alternative actions).
    let inboundQty = 0;
    let inboundPo: string | null | undefined = null;
    if (split && split.laterQty > EPS) {
      if (split.laterSource === "inbound_po") {
        inboundQty = split.laterQty;
        inboundPo = split.laterPoRef;
      } else if (split.laterSource === "transfer") {
        if (!transfers.length) {
          const free = Math.max(0, base.free[`${l.sku}|${other}`] ?? 0);
          const q = Math.min(split.laterQty, free);
          if (q > EPS) portions.push({ lineNo: l.lineNo, sku: l.sku, qty: round2(q), src: { kind: "transfer", from: other, to: order.shipFrom } });
          tQty += q;
          inboundQty = split.laterQty - q;
        } else inboundQty = split.laterQty - tQty;
      } else {
        if (!alts.length && alt && isRebar(m, l.sku)) {
          portions.push({ lineNo: l.lineNo, sku: l.sku, qty: round2(split.laterQty), src: { kind: "alt_supplier", supplier: alt.supplier, premiumPerT: alt.premiumPerT } });
          aQty += split.laterQty;
        } else inboundQty = split.laterQty - aQty;
      }
    } else if (!split && (transfers.length || alts.length)) {
      inboundQty = l.openQty - nowQty - tQty - aQty;
    }
    inboundQty = round2(inboundQty);
    if (inboundQty > EPS) {
      const po = pickPo(l.sku, inboundQty, inboundPo);
      if (!po) issues.push(err(`No inbound PO can cover ${fmtNum(inboundQty, 1)} ${unit} of ${l.sku}`, `لا يوجد أمر شراء وارد يغطي ${fmtNum(inboundQty, 1)} من ${l.sku}`));
      else {
        usedPo[po] = (usedPo[po] ?? 0) + inboundQty;
        portions.push({ lineNo: l.lineNo, sku: l.sku, qty: inboundQty, src: { kind: "inbound", poRef: po } });
        if (!split || split.laterSource !== "inbound_po") issues.push(info(`Balance ${fmtNum(inboundQty, 1)} ${unit} assigned to ${po}`, `تم تخصيص الرصيد ${fmtNum(inboundQty, 1)} من ${po}`));
      }
    }

    const total = round2(portions.filter((x) => x.lineNo === l.lineNo).reduce((a, x) => a + x.qty, 0));
    if (total + 0.01 < l.openQty) issues.push(err(`${fmtNum(l.openQty - total, 1)} ${unit} of ${l.sku} left uncovered`, `يبقى ${fmtNum(l.openQty - total, 1)} من ${l.sku} دون تغطية`));
    if (total > l.openQty + 0.01) issues.push(err(`Planned ${fmtNum(total, 1)} ${unit} exceeds the open ${fmtNum(l.openQty, 1)} ${unit} of ${l.sku}`, `الكمية المخططة ${fmtNum(total, 1)} تتجاوز الكمية المفتوحة ${fmtNum(l.openQty, 1)} للصنف ${l.sku}`));
    if (isRebar(m, l.sku) && l.openQty >= m.deliveryRules.minRebarDropT) {
      for (const x of portions.filter((y) => y.lineNo === l.lineNo)) {
        if (x.qty + EPS < m.deliveryRules.minRebarDropT) issues.push(err(`${fmtNum(x.qty, 1)} t drop is below the ${m.deliveryRules.minRebarDropT} t minimum rebar drop`, `دفعة ${fmtNum(x.qty, 1)} طن أقل من الحد الأدنى ${m.deliveryRules.minRebarDropT} أطنان`));
      }
    }
  }

  /* ── schedule ── */
  const resched = actions.find((a): a is Extract<OptionAction, { type: "reschedule" }> => a.type === "reschedule");
  let R: string | null = null;
  if (resched) {
    const slot = (resched.slot ?? "").slice(0, 16);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(slot)) issues.push(err(`Reschedule slot "${resched.slot}" is not a date-time`, `موعد إعادة الجدولة "${resched.slot}" غير صالح`));
    else {
      const reasons = checkSlot(rule, slot, { cityCentre: order.cityCentre, permitDate });
      if (reasons.length) issues.push(err(`Slot ${fmtSlot(slot)} is not valid for ${order.zone} (${reasons.join(", ")})`, `الموعد ${fmtSlot(slot, "ar")} غير صالح لهذه المنطقة (${reasons.join("، ")})`));
      else R = slot;
    }
  }
  const deliveries: Delivery[] = portions.map((x) => {
    const ready = deliverableFrom(s, order, x.src);
    const start = order.requestedDelivery > `${ready}T00:00` ? order.requestedDelivery : `${ready}T00:00`;
    let slot = nextValidSlot(rule, start, { cityCentre: order.cityCentre, permitDate });
    if (R && R.slice(0, 10) >= ready) slot = R;
    const prod = productOf(m, x.sku);
    return {
      lineNo: x.lineNo,
      sku: x.sku,
      qty: x.qty,
      unitPrice: newPrice.get(x.lineNo) ?? 0,
      source: x.src,
      readyDate: ready,
      slot,
      promiseDate: slot ? slot.slice(0, 10) : null,
      trucks: trucksFor(m, x.sku, x.qty),
      held: false,
      label: { en: `${qtyBi(x.qty, prod).en} ${x.sku} · ${sourceLabel(x.src, s).en}`, ar: `${qtyBi(x.qty, prod).ar} ${x.sku} · ${sourceLabel(x.src, s).ar}` },
    };
  });
  if (R && order.requestedDelivery && R < order.requestedDelivery && R.slice(0, 10) < order.requestedDelivery.slice(0, 10)) issues.push(warn(`Slot ${fmtSlot(R)} is earlier than the customer's requested ${fmtSlot(order.requestedDelivery)}`, `الموعد ${fmtSlot(R, "ar")} أبكر من الموعد الذي طلبه المتعامل`));
  if (deliveries.some((d) => !d.slot)) issues.push(err("No valid delivery slot found within 45 days", "لا يوجد موعد تسليم صالح خلال 45 يوماً"));

  /* ── credit ── */
  const vat = 1 + m.vatRate;
  const others = s.orders.filter((o) => o.customerId === order.customerId && o.id !== order.id);
  const baseExposure = customer.arOutstanding + others.reduce((a, o) => a + o.lines.filter((l) => !l.creditHold).reduce((b, l) => b + openQty(l) * l.unitPrice, 0) * vat, 0);
  const releaseAct = actions.find((a): a is Extract<OptionAction, { type: "partial_credit_release" }> => a.type === "partial_credit_release");
  const holdAct = actions.find((a): a is Extract<OptionAction, { type: "hold_for_payment" }> => a.type === "hold_for_payment");
  const maxRelease = (m.creditPolicy.temporaryReleaseMaxPct / 100) * customer.creditLimit;
  let release = 0;
  if (releaseAct) {
    release = round2(releaseAct.amount);
    if (release > maxRelease + 0.5) issues.push(err(`Release ${aedBi(release).en} exceeds the ${m.creditPolicy.temporaryReleaseMaxPct}% maximum (${aedBi(maxRelease).en})`, `الإفراج ${aedBi(release).ar} يتجاوز الحد الأقصى ${m.creditPolicy.temporaryReleaseMaxPct}% (${aedBi(maxRelease).ar})`));
    if (release <= 0) issues.push(err("Release amount must be positive", "يجب أن يكون مبلغ الإفراج موجباً"));
  }
  const existingRelease = order.creditRelease && order.creditRelease.validUntil >= TODAY ? order.creditRelease.amount : 0;
  const limitEff = customer.creditLimit + Math.max(release, existingRelease);
  let cum = baseExposure;
  const order2 = [...deliveries].sort((a, b) => (a.slot ?? "9999").localeCompare(b.slot ?? "9999") || a.lineNo - b.lineNo);
  for (const d of order2) {
    const v = d.qty * d.unitPrice * vat;
    if (cum + v <= limitEff + 0.5) cum += v;
    else d.held = true;
  }
  const fullExposure = baseExposure + deliveries.reduce((a, d) => a + d.qty * d.unitPrice * vat, 0);
  const releaseNeeded = Math.max(0, fullExposure - customer.creditLimit);
  const heldQty = round2(deliveries.filter((d) => d.held).reduce((a, d) => a + d.qty, 0));
  const heldValue = round2(deliveries.filter((d) => d.held).reduce((a, d) => a + d.qty * d.unitPrice * vat, 0));
  if (releaseAct && release > releaseNeeded * 1.05 + 1000) issues.push(warn(`Release ${aedBi(release).en} is more than needed (${aedBi(releaseNeeded).en}) — policy prefers a partial release`, `الإفراج ${aedBi(release).ar} أكبر من المطلوب (${aedBi(releaseNeeded).ar}) — السياسة تفضّل الإفراج الجزئي`));
  const commitment = (s.paymentCommitments ?? []).find((p) => p.customerId === customer.id && p.date >= TODAY) ?? null;
  if (heldValue > 0) {
    const payAmt = commitment?.amount ?? holdAct?.amount ?? customer.overdue30;
    const afterPay = fullExposure - payAmt;
    const ok = afterPay <= customer.creditLimit;
    const firstHeld = order2.find((d) => d.held)?.slot ?? null;
    const before = commitment && firstHeld ? commitment.date <= firstHeld.slice(0, 10) : false;
    issues.push(
      commitment
        ? info(
            `${aedBi(heldValue).en} (incl. VAT) held until the committed payment of ${aedBi(payAmt).en} on ${fmtDay(commitment.date)} (${commitment.committedBy}, ${commitment.id})${ok ? ` — exposure then ${aedBi(afterPay).en}, within the limit${before ? `, before the held drop on ${fmtDay(firstHeld)}` : ""}` : ""}; otherwise a CFO release of ${aedBi(releaseNeeded).en}`,
            `${aedBi(heldValue).ar} (شاملة الضريبة) موقوفة حتى الدفعة الملتزم بها ${aedBi(payAmt).ar} في ${fmtDay(commitment.date, "ar")} (${commitment.committedBy}، ${commitment.id})${ok ? ` — يصبح التعرض ${aedBi(afterPay).ar} ضمن الحد${before ? ` قبل موعد الدفعة الموقوفة ${fmtDay(firstHeld, "ar")}` : ""}` : ""}؛ وإلا يلزم إفراج من المدير المالي بقيمة ${aedBi(releaseNeeded).ar}`,
          )
        : info(
            `${aedBi(heldValue).en} (incl. VAT) held until ${payAmt ? `payment of ${aedBi(payAmt).en}` : "payment"}${ok ? ` — that brings exposure to ${aedBi(afterPay).en}, within the limit` : ""} or a CFO release of ${aedBi(releaseNeeded).en}`,
            `${aedBi(heldValue).ar} (شاملة الضريبة) موقوفة حتى ${payAmt ? `سداد ${aedBi(payAmt).ar}` : "السداد"}${ok ? ` — ما يخفض التعرض إلى ${aedBi(afterPay).ar} ضمن الحد` : ""} أو إفراج من المدير المالي بقيمة ${aedBi(releaseNeeded).ar}`,
          ),
    );
  }
  if (release > 0 && customer.overdue30 > 0 && !proposal?.paymentCommitment && !commitment) {
    issues.push(warn(`Release needs a dated payment commitment for the overdue ${aedBi(customer.overdue30).en} (RBM-FIN-POL-04)`, `يتطلب الإفراج التزاماً مؤرخاً بسداد المتأخر ${aedBi(customer.overdue30).ar} (RBM-FIN-POL-04)`));
  }
  const firstSlot = order2[0]?.slot ?? null;
  const firstDrop = order2.filter((d) => d.slot === firstSlot);
  if (firstDrop.length && firstDrop.every((d) => d.held)) issues.push(warn("First delivery is on credit hold — nothing ships until payment or release", "الدفعة الأولى موقوفة ائتمانياً — لن يُشحن شيء قبل السداد أو الإفراج"));
  else if (firstDrop.some((d) => d.held)) issues.push(info(`Partial first drop: ${firstDrop.filter((d) => d.held).map((d) => d.sku).join(", ")} held for credit, the rest ships`, `دفعة أولى جزئية: ${firstDrop.filter((d) => d.held).map((d) => d.sku).join("، ")} موقوف ائتمانياً والباقي يُشحن`));

  /* ── money ── */
  const transferCost = deliveries.filter((d) => d.source.kind === "transfer").reduce((a, d) => a + d.qty * m.deliveryRules.transferJAtoMN05.costPerTonne, 0);
  const premiumCost = deliveries.reduce((a, d) => a + (d.source.kind === "alt_supplier" ? d.qty * d.source.premiumPerT : 0), 0);
  const revenue = deliveries.reduce((a, d) => a + d.qty * d.unitPrice, 0);
  const stdCost = deliveries.reduce((a, d) => a + d.qty * (productOf(m, d.sku)?.stdCost ?? 0), 0);
  const margin = revenue - stdCost - transferCost - premiumCost;
  const baselineRevenue = oa.lines.reduce((a, l) => a + l.openQty * l.unitPrice, 0);
  const baselineMargin = oa.lines.reduce((a, l) => a + l.margin.margin, 0);

  /* ── approvals ── */
  const approvals: OptionImpact["approvals"] = [
    { ...APPROVERS.planning, reason: { en: "Order-exception resolution (RBM-OPS-POL-11 / RBM-COM-PRC-07)", ar: "معالجة استثناء الطلب (RBM-OPS-POL-11 / RBM-COM-PRC-07)" } },
  ];
  if (premiumCost > 0) approvals[0].reason = { en: "Resolution incl. alternative-source steel (supplier directory)", ar: "المعالجة تشمل حديداً من مصدر بديل (دليل الموردين)" };
  if (release > 0) approvals.push({ ...APPROVERS.cfo, reason: { en: `Temporary credit release ${aedBi(release).en} (RBM-FIN-POL-04, no delegation)`, ar: `إفراج ائتماني مؤقت ${aedBi(release).ar} (RBM-FIN-POL-04، دون تفويض)` } });
  for (const l of oa.lines) {
    const np = newPrice.get(l.lineNo) ?? l.unitPrice;
    if (l.price.kind === "contract" && np < l.price.reference - 0.004) {
      approvals.push({ ...APPROVERS.sales, reason: { en: `${l.sku} stays below the frame rate`, ar: `${l.sku} يبقى دون سعر الاتفاقية` } });
      break;
    }
  }
  const approver = release > 0 ? APPROVERS.cfo : APPROVERS.planning;

  /* ── customer constraints ── */
  const constraints: OptionImpact["constraints"] = [];
  const splitLines = new Set(portions.map((p) => p.lineNo).filter((n, i, arr) => arr.indexOf(n) !== i));
  const target = shortLines[0];
  if (target) {
    const ds = deliveries.filter((d) => d.lineNo === target.lineNo && d.slot).sort((a, b) => a.slot!.localeCompare(b.slot!));
    const unit = productOf(m, target.sku)?.unit ?? "";
    if (proposal?.minFirstDropQty && ds[0]) {
      const firstDay = ds[0].slot!.slice(0, 10);
      const firstQty = ds.filter((d) => d.slot!.slice(0, 10) === firstDay).reduce((a, d) => a + d.qty, 0);
      constraints.push({ ok: firstQty + EPS >= proposal.minFirstDropQty, label: { en: `First drop ≥ ${fmtNum(proposal.minFirstDropQty)} ${unit} (customer): ${fmtNum(firstQty, 1)} ${unit} on ${fmtDay(firstDay)}`, ar: `الدفعة الأولى ≥ ${fmtNum(proposal.minFirstDropQty)} (طلب المتعامل): ${fmtNum(firstQty, 1)} في ${fmtDay(firstDay, "ar")}` } });
    }
    if (proposal?.balanceByDate && ds.length) {
      const last = ds[ds.length - 1].slot!.slice(0, 10);
      constraints.push({ ok: last <= proposal.balanceByDate, label: { en: `Balance by ${fmtDay(proposal.balanceByDate)} (customer): last drop ${fmtDay(last)}`, ar: `الرصيد قبل ${fmtDay(proposal.balanceByDate, "ar")} (طلب المتعامل): آخر دفعة ${fmtDay(last, "ar")}` } });
    }
  }
  if (splitLines.size) {
    const ok = proposal?.splitAccepted === true;
    constraints.push({ ok, label: ok ? { en: "Split accepted in writing by the customer", ar: "وافق المتعامل خطياً على التسليم على دفعات" } : { en: "Split needs the customer's written agreement (RBM-OPS-POL-11)", ar: "التسليم على دفعات يتطلب موافقة خطية من المتعامل (RBM-OPS-POL-11)" } });
  }
  if (proposal?.requestedDelivery && deliveries[0]?.slot) {
    const first = [...deliveries].filter((d) => d.slot).sort((a, b) => a.slot!.localeCompare(b.slot!))[0].slot!;
    constraints.push({ ok: first.slice(0, 10) <= proposal.requestedDelivery.slice(0, 10), label: { en: `Requested ${fmtSlot(proposal.requestedDelivery)}: first drop ${fmtSlot(first)}`, ar: `الموعد المطلوب ${fmtSlot(proposal.requestedDelivery, "ar")}: الدفعة الأولى ${fmtSlot(first, "ar")}` } });
  }
  if ((release > 0 || heldValue > 0) && commitment) {
    constraints.push({ ok: true, label: { en: `Dated payment commitment on file: ${aedBi(commitment.amount).en} on ${fmtDay(commitment.date)} — ${commitment.committedBy} (${commitment.id})`, ar: `التزام مؤرخ بالسداد مسجل: ${aedBi(commitment.amount).ar} في ${fmtDay(commitment.date, "ar")} — ${commitment.committedBy} (${commitment.id})` } });
  } else if (release > 0 && proposal?.paymentCommitment) {
    constraints.push({ ok: true, label: { en: `Payment commitment in the customer's message: ${aedBi(proposal.paymentCommitment.amount).en}${proposal.paymentCommitment.date ? ` on ${fmtDay(proposal.paymentCommitment.date)}` : ""}`, ar: `التزام بالسداد في رسالة المتعامل: ${aedBi(proposal.paymentCommitment.amount).ar}` } });
  }

  /* ── new order lines & proof by re-detection ── */
  const newLines: OrderLine[] = [];
  let nextNo = Math.max(0, ...order.lines.map((l) => l.lineNo)) + 1;
  for (const l of order.lines) {
    const ds = deliveries.filter((d) => d.lineNo === l.lineNo).sort((a, b) => (a.slot ?? "").localeCompare(b.slot ?? ""));
    if (!ds.length) {
      newLines.push({ ...l });
      continue;
    }
    ds.forEach((d, i) => {
      const src = d.source.kind === "stock" && d.source.warehouse === order.shipFrom ? undefined : d.source;
      const ln: OrderLine = {
        lineNo: i === 0 ? l.lineNo : nextNo++,
        sku: l.sku,
        qty: round2((i === 0 ? (l.deliveredQty ?? 0) : 0) + d.qty),
        unit: l.unit,
        unitPrice: d.unitPrice,
        deliveredQty: i === 0 ? (l.deliveredQty ?? 0) : 0,
        promiseDate: d.promiseDate ?? undefined,
        slot: d.slot ?? undefined,
        ...(src ? { source: src } : {}),
        ...(d.held ? { creditHold: true } : {}),
        note: i === 0 && ds.length === 1 ? l.note : `${sourceLabel(d.source, s).en}${d.held ? " — held for payment / CFO release" : ""}`,
      };
      newLines.push(ln);
    });
  }
  newLines.sort((a, b) => a.lineNo - b.lineNo);
  const slots = deliveries.map((d) => d.slot).filter(Boolean).sort() as string[];
  const allHeld = deliveries.length > 0 && deliveries.every((d) => d.held);
  const anyDelivered = order.lines.some((l) => (l.deliveredQty ?? 0) > 0);
  const patched: SalesOrder = {
    ...order,
    lines: newLines,
    requestedDelivery: slots[0] ?? order.requestedDelivery,
    promiseDate: slots[0]?.slice(0, 10) ?? order.promiseDate,
    creditRelease: release > 0 ? { amount: release, validUntil: addDays(TODAY, m.creditPolicy.temporaryReleaseValidityDays), ref: `CR-26-${order.id.slice(-5)}`, approvedBy: APPROVERS.cfo.name } : order.creditRelease ?? null,
    status: allHeld ? "credit_hold" : anyDelivered ? "partially_delivered" : deliveries.some((d) => d.source.kind === "stock" && !d.held) ? "ready" : "open",
  };
  const after = analyzeWorld(s, { orders: worldOrders.map((o) => (o.id === order.id ? patched : o)) });
  const remaining = after.byId[order.id]?.types ?? [];
  const cleared = oa.types.filter((t) => !remaining.includes(t)) as ExceptionType[];

  const otherOrders: OptionImpact["otherOrders"] = [];
  for (const before of base.orders) {
    if (before.order.id === order.id) continue;
    const aft = after.byId[before.order.id];
    if (!aft) continue;
    const bk = new Set(before.exceptions.map((e) => e.key));
    const ak = new Set(aft.exceptions.map((e) => e.key));
    const added = [...ak].filter((k) => !bk.has(k));
    const gone = [...bk].filter((k) => !ak.has(k));
    if (added.length || gone.length) {
      otherOrders.push({ orderId: before.order.id, customer: before.customer.name, change: { en: `${added.length ? `new: ${added.map((k) => k.split(":")[1]).join(", ")}` : ""}${added.length && gone.length ? "; " : ""}${gone.length ? `cleared: ${gone.map((k) => k.split(":")[1]).join(", ")}` : ""}`, ar: `${added.length ? `جديد: ${added.length}` : ""}${gone.length ? ` تمت إزالة: ${gone.length}` : ""}` } });
      continue;
    }
    for (const bl of before.lines.filter((x) => x.short > EPS)) {
      const al = aft.lines.find((x) => x.lineNo === bl.lineNo);
      const e1 = bl.coverage.map((c) => c.deliverableFrom).sort()[0];
      const e2 = al?.coverage.map((c) => c.deliverableFrom).sort()[0];
      if (e1 && e2 && e2 > e1) {
        otherOrders.push({ orderId: before.order.id, customer: before.customer.name, change: { en: `earliest cover for ${bl.sku} moves ${fmtDay(e1)} → ${fmtDay(e2)}`, ar: `أقرب تغطية للصنف ${bl.sku} تتأخر من ${fmtDay(e1, "ar")} إلى ${fmtDay(e2, "ar")}` } });
      }
    }
  }

  const feasible = !issues.some((i) => i.level === "error");
  const firstDel = slots[0] ?? null;
  return {
    feasible,
    deliveries,
    newLines,
    requestedDelivery: patched.requestedDelivery,
    extraCost: round2(transferCost + premiumCost),
    transferCost: round2(transferCost),
    premiumCost: round2(premiumCost),
    revenue: round2(revenue),
    margin: round2(margin),
    marginPct: revenue ? margin / revenue : 0,
    baselineMargin: round2(baselineMargin),
    baselineMarginPct: baselineRevenue ? baselineMargin / baselineRevenue : 0,
    marginDelta: round2(margin - baselineMargin),
    priceRecovered: round2(priceRecovered),
    exposureAfter: round2(cum),
    exposurePctAfter: cum / customer.creditLimit,
    fullExposure: round2(fullExposure),
    limit: customer.creditLimit,
    releaseAmount: release,
    releaseNeeded: round2(releaseNeeded),
    heldQty,
    heldValue,
    firstDelivery: firstDel,
    lastDelivery: slots[slots.length - 1] ?? null,
    approvals,
    approver,
    issues,
    constraints,
    cleared,
    remaining,
    otherOrders,
  };
}

/** Patched order fields written on approval (whole-field patch). */
export function patchedOrderFields(order: SalesOrder, impact: OptionImpact, s: Snapshot) {
  const m = s.master;
  const release = impact.releaseAmount;
  const allHeld = impact.deliveries.length > 0 && impact.deliveries.every((d) => d.held);
  const anyDelivered = order.lines.some((l) => (l.deliveredQty ?? 0) > 0);
  return {
    lines: impact.newLines,
    requestedDelivery: impact.requestedDelivery,
    promiseDate: impact.firstDelivery?.slice(0, 10) ?? order.promiseDate,
    status: allHeld ? "credit_hold" : anyDelivered ? "partially_delivered" : impact.deliveries.some((d) => d.source.kind === "stock" && !d.held) ? "ready" : "open",
    creditRelease: release > 0 ? { amount: release, validUntil: addDays(TODAY, m.creditPolicy.temporaryReleaseValidityDays), ref: `CR-26-${order.id.slice(-5)}`, approvedBy: APPROVERS.cfo.name } : order.creditRelease ?? null,
  };
}

/** Compact, number-exact digest of an option's computed impact for prompts. */
export function impactDigest(s: Snapshot, order: SalesOrder, o: ProposedOption, i: OptionImpact) {
  const lines = i.deliveries
    .map((d) => `  - ${fmtNum(d.qty, 1)} ${productOf(s.master, d.sku)?.unit ?? ""} ${d.sku} @ AED ${fmtNum(d.unitPrice, 2)} from ${sourceLabel(d.source, s).en}; slot ${fmtSlot(d.slot)}${d.held ? " — HELD (credit)" : ""}; trucks ${d.trucks}`)
    .join("\n");
  return [
    `Option ${o.id} — ${o.title} (${i.feasible ? "feasible" : "NOT feasible"})`,
    lines,
    `  extra cost AED ${fmtNum(i.extraCost, 2)} (transfer ${fmtNum(i.transferCost, 2)}, premium ${fmtNum(i.premiumCost, 2)}); price recovered AED ${fmtNum(i.priceRecovered, 2)}`,
    `  margin AED ${fmtNum(i.margin, 2)} (${fmtNum(i.marginPct * 100, 2)}%) vs order as entered AED ${fmtNum(i.baselineMargin, 2)} (${fmtNum(i.baselineMarginPct * 100, 2)}%) → delta AED ${fmtNum(i.marginDelta, 2)}`,
    `  credit exposure after release of shipped lines AED ${fmtNum(i.exposureAfter, 2)} (${fmtNum(i.exposurePctAfter * 100, 1)}% of AED ${fmtNum(i.limit)}); full exposure AED ${fmtNum(i.fullExposure, 2)}; CFO release in option AED ${fmtNum(i.releaseAmount, 2)}; held value AED ${fmtNum(i.heldValue, 2)}`,
    `  approvals: ${i.approvals.map((a) => `${a.name} (${a.title})`).join(", ")}`,
    `  clears: ${i.cleared.join(", ") || "none"}; remaining: ${i.remaining.join(", ") || "none"}`,
    i.constraints.length ? `  customer constraints: ${i.constraints.map((c) => `${c.ok ? "OK" : "NOT MET"} ${c.label.en}`).join(" | ")}` : "",
    i.issues.length ? `  checks: ${i.issues.map((x) => `[${x.level}] ${x.text.en}`).join(" | ")}` : "",
    i.otherOrders.length ? `  other orders: ${i.otherOrders.map((x) => `${x.orderId} ${x.change.en}`).join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export { lineSource };
