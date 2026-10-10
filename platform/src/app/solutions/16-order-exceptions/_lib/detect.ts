/**
 * Exception detection (pure, deterministic).
 *
 *  1. Allocate available stock per SKU/warehouse to open order lines in promise-date order
 *     (ties: order creation time, order id, line) → stock shortfalls + what could cover them.
 *  2. Price: entered price vs frame-agreement rate (key accounts) or list price less the allowed tier discount.
 *  3. Delivery window: requested slot vs zone window, Sundays/holidays, city-centre restrictions, gate lead time.
 *  4. Credit: AR + open orders incl. 5% VAT (cumulative by order creation) vs approved limit.
 *  5. Severity from value at risk, days to promise and number of issues.
 */
import {
  TODAY,
  addWorkingDays,
  checkSlot,
  daysBetween,
  fmtDay,
  fmtSlot,
  nextLogisticsDay,
  nextValidSlot,
  windowLabel,
  zoneRule,
} from "./calendar";
import { WH_LABEL, ZONE_AR, aedBi, contractOf, customerOf, fmtNum, productOf, qtyBi, referencePrice, round2 } from "./rules";
import type {
  Bi,
  CoverOption,
  CreditCheck,
  ExceptionItem,
  ExceptionType,
  LineCheck,
  LineSource,
  OrderAnalysis,
  SalesOrder,
  Severity,
  Snapshot,
  WindowCheck,
  Wh,
  WorldAnalysis,
} from "./types";

const EPS = 1e-6;

export const openQty = (l: { qty: number; deliveredQty?: number }) => round2(Math.max(0, l.qty - (l.deliveredQty ?? 0)));

export function lineSource(o: SalesOrder, l: SalesOrder["lines"][number]): LineSource {
  return l.source ?? { kind: "stock", warehouse: o.shipFrom };
}

/** First day goods from a source can leave the dispatch warehouse towards the site. */
export function deliverableFrom(s: Snapshot, o: SalesOrder, src: LineSource): string {
  const transferDays = s.master.deliveryRules.transferJAtoMN05.leadDays;
  if (src.kind === "stock") return src.warehouse === o.shipFrom ? TODAY : nextLogisticsDay(addWorkingDays(TODAY, transferDays, { saturday: true }));
  if (src.kind === "transfer") return nextLogisticsDay(addWorkingDays(TODAY, transferDays, { saturday: true }));
  if (src.kind === "inbound") {
    const po = s.inbound.find((p) => p.id === src.poRef);
    if (!po) return "2099-12-31";
    const atDispatch = po.warehouse === o.shipFrom ? po.eta : addWorkingDays(po.eta, transferDays, { saturday: true });
    return nextLogisticsDay(atDispatch);
  }
  const alt = s.altSources[0];
  return nextLogisticsDay(addWorkingDays(TODAY, alt?.leadWorkingDays ?? 3, { saturday: false }));
}

export function sourceLabel(src: LineSource, s?: Snapshot): Bi {
  if (src.kind === "stock") return { en: `Stock · ${WH_LABEL[src.warehouse].en}`, ar: `مخزون · ${WH_LABEL[src.warehouse].ar}` };
  if (src.kind === "transfer") return { en: `Transfer ${src.from} → ${src.to}`, ar: `تحويل ${src.from} ← ${src.to}` };
  if (src.kind === "inbound") {
    const po = s?.inbound.find((p) => p.id === src.poRef);
    return { en: `Inbound ${src.poRef}${po ? ` (ETA ${fmtDay(po.eta)})` : ""}`, ar: `وارد ${src.poRef}${po ? ` (الوصول ${fmtDay(po.eta, "ar")})` : ""}` };
  }
  return { en: `${src.supplier} (+AED ${src.premiumPerT}/t)`, ar: `${src.supplier} (+${src.premiumPerT} درهم/طن)` };
}

function poolKey(sku: string, wh: Wh) {
  return `${sku}|${wh}`;
}

function linePromise(o: SalesOrder, l: SalesOrder["lines"][number]) {
  return l.promiseDate ?? o.promiseDate;
}

export function analyzeWorld(s: Snapshot, override?: { orders?: SalesOrder[] }): WorldAnalysis {
  const orders = override?.orders ?? s.orders;
  const m = s.master;

  /* 1 — allocation */
  const pool: Record<string, number> = {};
  for (const it of s.stock) pool[poolKey(it.sku, it.warehouse)] = round2(it.onHand - it.reserved);
  const poRemaining: Record<string, number> = {};
  for (const po of s.inbound) poRemaining[po.id] = po.qty;

  type Demand = { o: SalesOrder; l: SalesOrder["lines"][number]; open: number; promise: string };
  const demand: Demand[] = [];
  for (const o of orders) for (const l of o.lines) {
    const open = openQty(l);
    if (open > EPS) demand.push({ o, l, open, promise: linePromise(o, l) });
  }
  demand.sort((a, b) => a.promise.localeCompare(b.promise) || a.o.createdAt.localeCompare(b.o.createdAt) || a.o.id.localeCompare(b.o.id) || a.l.lineNo - b.l.lineNo);

  const alloc = new Map<string, { poolBefore: number; allocated: number; ready: string | null }>();
  for (const d of demand) {
    const src = lineSource(d.o, d.l);
    let poolBefore = 0;
    let got = 0;
    if (src.kind === "stock" || src.kind === "transfer") {
      const key = poolKey(d.l.sku, src.kind === "stock" ? src.warehouse : src.from);
      poolBefore = Math.max(0, pool[key] ?? 0);
      got = Math.min(d.open, poolBefore);
      pool[key] = round2((pool[key] ?? 0) - got);
    } else if (src.kind === "inbound") {
      const po = s.inbound.find((p) => p.id === src.poRef && p.sku === d.l.sku);
      poolBefore = po ? Math.max(0, poRemaining[po.id] ?? 0) : 0;
      got = Math.min(d.open, poolBefore);
      if (po) poRemaining[po.id] = round2(poRemaining[po.id] - got);
    } else {
      poolBefore = d.open;
      got = d.open;
    }
    const ready = got + EPS >= d.open ? deliverableFrom(s, d.o, src) : null;
    alloc.set(`${d.o.id}#${d.l.lineNo}`, { poolBefore: round2(poolBefore), allocated: round2(got), ready });
  }

  /* 2 — credit (cumulative by creation per customer) */
  const byCustomer = new Map<string, SalesOrder[]>();
  for (const o of [...orders].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (!byCustomer.has(o.customerId)) byCustomer.set(o.customerId, []);
    byCustomer.get(o.customerId)!.push(o);
  }
  const vat = 1 + m.vatRate;
  const orderOpenValue = (o: SalesOrder, held: boolean) =>
    o.lines.filter((l) => !!l.creditHold === held).reduce((a, l) => a + openQty(l) * l.unitPrice, 0) * vat;
  const creditMap = new Map<string, CreditCheck>();
  for (const [cid, list] of byCustomer) {
    const c = customerOf(m, cid);
    if (!c) continue;
    const release = Math.max(0, ...list.map((o) => (o.creditRelease && o.creditRelease.validUntil >= TODAY ? o.creditRelease.amount : 0)));
    const values = list.map((o) => orderOpenValue(o, false));
    const total = c.arOutstanding + values.reduce((a, b) => a + b, 0);
    let cum = c.arOutstanding;
    list.forEach((o, i) => {
      const prior = cum - c.arOutstanding;
      cum += values[i];
      const limit = c.creditLimit + release;
      const over = cum > limit + 0.005;
      creditMap.set(o.id, {
        customerId: cid,
        limit: c.creditLimit,
        release,
        ar: c.arOutstanding,
        overdue30: c.overdue30,
        priorOpen: round2(prior),
        laterOpen: round2(total - cum),
        thisOrder: round2(values[i]),
        heldValue: round2(orderOpenValue(o, true)),
        exposure: round2(cum),
        totalExposure: round2(total),
        pct: cum / c.creditLimit,
        over,
        overAmount: over ? round2(cum - limit) : 0,
        ifPaidOverdue: round2(cum - c.overdue30),
        commitment: (s.paymentCommitments ?? []).find((p) => p.customerId === cid && p.date >= TODAY) ?? null,
      });
    });
  }

  /* 3 — per-order analysis */
  const analyses: OrderAnalysis[] = [];
  for (const o of orders) {
    const customer = customerOf(m, o.customerId);
    if (!customer) continue;
    const rule = zoneRule(m.deliveryRules.siteWindows, o.zone);
    const exceptions: ExceptionItem[] = [];
    const lines: LineCheck[] = [];

    for (const l of o.lines) {
      const open = openQty(l);
      if (open <= EPS) continue;
      const p = productOf(m, l.sku);
      const a = alloc.get(`${o.id}#${l.lineNo}`) ?? { poolBefore: 0, allocated: 0, ready: null };
      const src = lineSource(o, l);
      const short = round2(open - a.allocated);
      const promise = linePromise(o, l);
      const ref = referencePrice(m, customer, l.sku);
      let status: LineCheck["price"]["status"] = "ok";
      let diff = 0;
      let impact = 0;
      if (ref.kind === "contract") {
        diff = round2(l.unitPrice - ref.reference);
        if (diff < -0.004) status = "under";
        else if (diff > 0.004) status = "over";
        impact = round2(Math.abs(diff) * open);
      } else {
        if (l.unitPrice < (ref.minAllowed ?? 0) - 0.004) {
          status = "discount";
          diff = round2(l.unitPrice - (ref.minAllowed ?? 0));
          impact = round2(Math.abs(diff) * open);
        } else if (l.unitPrice > ref.list + 0.004) {
          status = "over_list";
          diff = round2(l.unitPrice - ref.list);
          impact = round2(diff * open);
        }
      }
      const revenue = open * l.unitPrice;
      const cost = open * (p?.stdCost ?? 0);
      const line: LineCheck = {
        lineNo: l.lineNo,
        sku: l.sku,
        openQty: open,
        unitPrice: l.unitPrice,
        source: src,
        promiseDate: promise,
        poolBefore: a.poolBefore,
        allocated: a.allocated,
        short: short > EPS ? short : 0,
        readyDate: a.ready,
        coverage: [],
        price: {
          reference: ref.reference,
          kind: ref.kind,
          contractId: ref.kind === "contract" ? ref.contractId : undefined,
          allowedDiscountPct: ref.kind === "list" ? ref.allowedDiscountPct : undefined,
          minAllowed: ref.kind === "list" ? ref.minAllowed : undefined,
          q3Rate: ref.kind === "contract" ? ref.q3Rate : undefined,
          status,
          diffPerUnit: diff,
          impact,
        },
        margin: { revenue, cost, margin: revenue - cost, pct: revenue ? (revenue - cost) / revenue : 0 },
      };

      // Stock exceptions: shortfall, or a source that cannot make the promise date.
      if (line.short > 0) {
        const other: Wh = o.shipFrom === "MN05" ? "JA" : "MN05";
        const freeOther = Math.max(0, pool[poolKey(l.sku, other)] ?? 0);
        const cover: CoverOption[] = [];
        if (freeOther > EPS && src.kind === "stock") {
          cover.push({
            kind: "transfer",
            qty: round2(Math.min(line.short, freeOther)),
            warehouse: other,
            deliverableFrom: deliverableFrom(s, o, { kind: "transfer", from: other, to: o.shipFrom }),
            costPerT: m.deliveryRules.transferJAtoMN05.costPerTonne,
            label: {
              en: `${WH_LABEL[other].en} free stock ${fmtNum(freeOther, 1)} ${p?.unit ?? ""} — transfer ${m.deliveryRules.transferJAtoMN05.leadDays} day, AED ${m.deliveryRules.transferJAtoMN05.costPerTonne}/t`,
              ar: `مخزون حر في ${WH_LABEL[other].ar} ${fmtNum(freeOther, 1)} ${p?.unitAr ?? ""} — تحويل خلال يوم واحد بتكلفة ${m.deliveryRules.transferJAtoMN05.costPerTonne} درهم/طن`,
            },
          });
        }
        for (const po of s.inbound.filter((x) => x.sku === l.sku).sort((x, y) => x.eta.localeCompare(y.eta))) {
          const rem = poRemaining[po.id] ?? 0;
          if (rem <= EPS) continue;
          cover.push({
            kind: "inbound",
            qty: round2(Math.min(line.short, rem)),
            warehouse: po.warehouse,
            poRef: po.id,
            deliverableFrom: deliverableFrom(s, o, { kind: "inbound", poRef: po.id }),
            label: {
              en: `${po.id} · ${fmtNum(rem)} ${p?.unit ?? ""} uncommitted · ETA ${fmtDay(po.eta)} at ${WH_LABEL[po.warehouse].en}`,
              ar: `${po.id} · ${fmtNum(rem)} ${p?.unitAr ?? ""} غير مخصصة · الوصول ${fmtDay(po.eta, "ar")} إلى ${WH_LABEL[po.warehouse].ar}`,
            },
          });
        }
        const alt = s.altSources.find((x) => x.skus.includes(l.sku));
        if (alt) {
          cover.push({
            kind: "alt_supplier",
            qty: line.short,
            deliverableFrom: deliverableFrom(s, o, { kind: "alt_supplier", supplier: alt.supplier, premiumPerT: alt.premiumPerT }),
            costPerT: alt.premiumPerT,
            label: {
              en: `${alt.supplier} — ${alt.origin}, +AED ${alt.premiumPerT}/t, ${alt.leadWorkingDays} working days`,
              ar: `${alt.supplier} — ${alt.origin}، +${alt.premiumPerT} درهم/طن، خلال ${alt.leadWorkingDays} أيام عمل`,
            },
          });
        }
        line.coverage = cover;
        const earliest = [...cover].sort((x, y) => x.deliverableFrom.localeCompare(y.deliverableFrom))[0];
        const whName = src.kind === "stock" ? WH_LABEL[src.warehouse] : { en: src.kind, ar: src.kind };
        exceptions.push({
          key: `${o.id}:stock:${l.lineNo}`,
          type: "stock",
          orderId: o.id,
          lineNo: l.lineNo,
          impact: round2(line.short * l.unitPrice),
          title: { en: `Stock shortfall — ${l.sku}`, ar: `نقص في المخزون — ${l.sku}` },
          detail: {
            en: `${qtyBi(open, p).en} open, ${qtyBi(a.allocated, p).en} available at ${whName.en} after earlier promises — short ${qtyBi(line.short, p).en}.${earliest ? ` Earliest cover: ${earliest.label.en.split(" — ")[0]} (deliverable ${fmtDay(earliest.deliverableFrom)}).` : ""}`,
            ar: `الكمية المفتوحة ${qtyBi(open, p).ar}، والمتاح في ${whName.ar} بعد الالتزامات السابقة ${qtyBi(a.allocated, p).ar} — نقص ${qtyBi(line.short, p).ar}.${earliest ? ` أقرب تغطية: ${earliest.label.ar.split(" — ")[0]} (قابل للتسليم ${fmtDay(earliest.deliverableFrom, "ar")}).` : ""}`,
          },
        });
      } else if (a.ready && a.ready > promise) {
        exceptions.push({
          key: `${o.id}:stock:${l.lineNo}`,
          type: "stock",
          orderId: o.id,
          lineNo: l.lineNo,
          impact: round2(open * l.unitPrice),
          title: { en: `Source cannot meet promise — ${l.sku}`, ar: `المصدر لا يلبي الموعد — ${l.sku}` },
          detail: {
            en: `Goods deliverable from ${fmtDay(a.ready)} but line promised for ${fmtDay(promise)}.`,
            ar: `البضاعة قابلة للتسليم من ${fmtDay(a.ready, "ar")} بينما الموعد الملتزم به ${fmtDay(promise, "ar")}.`,
          },
        });
      }

      if (status !== "ok") {
        const ref = line.price;
        const unit = p?.unit ?? "";
        const t: Record<string, Bi> = {
          under: {
            en: `Entered AED ${fmtNum(l.unitPrice, 2)}/${unit} vs ${ref.contractId} Q4 rate AED ${fmtNum(ref.reference, 2)}/${unit} (${fmtNum(Math.abs(diff), 2)} below) — under-billing ${aedBi(impact).en} on ${qtyBi(open, p).en}.${ref.q3Rate != null && Math.abs(ref.q3Rate - l.unitPrice) < 0.005 ? " Entered price equals the expired Q3 rate." : ""}`,
            ar: `السعر المُدخل ${fmtNum(l.unitPrice, 2)} درهم مقابل سعر الربع الرابع في ${ref.contractId} البالغ ${fmtNum(ref.reference, 2)} درهم (أقل بـ ${fmtNum(Math.abs(diff), 2)}) — نقص فوترة ${aedBi(impact).ar} على ${qtyBi(open, p).ar}.${ref.q3Rate != null && Math.abs(ref.q3Rate - l.unitPrice) < 0.005 ? " السعر المُدخل يساوي سعر الربع الثالث المنتهي." : ""}`,
          },
          over: {
            en: `Entered AED ${fmtNum(l.unitPrice, 2)}/${unit} is above the ${ref.contractId} rate AED ${fmtNum(ref.reference, 2)} (+${fmtNum(diff, 2)}) — ${aedBi(impact).en} over-billing; needs the customer's written acceptance or correction.`,
            ar: `السعر المُدخل ${fmtNum(l.unitPrice, 2)} درهم أعلى من سعر ${ref.contractId} البالغ ${fmtNum(ref.reference, 2)} درهم (+${fmtNum(diff, 2)}) — زيادة فوترة ${aedBi(impact).ar}؛ يتطلب قبولاً خطياً من المتعامل أو التصحيح.`,
          },
          discount: {
            en: `AED ${fmtNum(l.unitPrice, 2)} is ${fmtNum(((ref.reference - l.unitPrice) / ref.reference) * 100, 1)}% below list ${fmtNum(ref.reference, 2)}; Tier ${customer.tier} desk limit is ${fmtNum((ref.allowedDiscountPct ?? 0) * 100, 1)}% (floor ${fmtNum(ref.minAllowed ?? 0, 2)}) — ${aedBi(impact).en} below floor, Sales Director approval needed.`,
            ar: `السعر ${fmtNum(l.unitPrice, 2)} درهم أقل من سعر القائمة ${fmtNum(ref.reference, 2)} بنسبة ${fmtNum(((ref.reference - l.unitPrice) / ref.reference) * 100, 1)}%، والحد المسموح للفئة ${customer.tier} هو ${fmtNum((ref.allowedDiscountPct ?? 0) * 100, 1)}% (الحد الأدنى ${fmtNum(ref.minAllowed ?? 0, 2)}) — ${aedBi(impact).ar} دون الحد، ويلزم اعتماد مدير المبيعات.`,
          },
          over_list: {
            en: `Entered above list price AED ${fmtNum(ref.reference, 2)} (+${fmtNum(diff, 2)}).`,
            ar: `السعر المُدخل أعلى من سعر القائمة ${fmtNum(ref.reference, 2)} درهم (+${fmtNum(diff, 2)}).`,
          },
        };
        exceptions.push({
          key: `${o.id}:price:${l.lineNo}`,
          type: "price",
          orderId: o.id,
          lineNo: l.lineNo,
          impact,
          title:
            status === "under"
              ? { en: `Price below contract — ${l.sku}`, ar: `سعر أقل من العقد — ${l.sku}` }
              : status === "over"
                ? { en: `Price above contract — ${l.sku}`, ar: `سعر أعلى من العقد — ${l.sku}` }
                : status === "discount"
                  ? { en: `Discount beyond desk limit — ${l.sku}`, ar: `خصم يتجاوز صلاحية المكتب — ${l.sku}` }
                  : { en: `Price above list — ${l.sku}`, ar: `سعر أعلى من القائمة — ${l.sku}` },
          detail: t[status],
        });
      }
      lines.push(line);
    }

    /* window */
    const permitDate = o.gatePermit?.date ?? null;
    const slotted = lines.filter((x) => o.lines.find((l) => l.lineNo === x.lineNo)?.slot);
    let windowCheck: WindowCheck;
    const base = {
      zone: o.zone,
      rule: rule.window,
      effectiveWindow: windowLabel(rule, !!o.cityCentre),
      permitOnFile: !!o.gatePermit,
      gateLeadHours: rule.gateLeadHours,
    };
    if (slotted.length) {
      const perLine = o.lines
        .filter((l) => l.slot && openQty(l) > EPS)
        .map((l) => {
          const reasons = checkSlot(rule, l.slot!, { cityCentre: o.cityCentre, permitDate });
          return { lineNo: l.lineNo, slot: l.slot!, ok: reasons.length === 0, nextSlot: reasons.length ? nextValidSlot(rule, l.slot!, { cityCentre: o.cityCentre, permitDate }) : l.slot! };
        });
      const bad = perLine.find((x) => !x.ok);
      windowCheck = {
        ...base,
        requested: o.requestedDelivery,
        ok: !bad,
        reasons: bad ? checkSlot(rule, bad.slot, { cityCentre: o.cityCentre, permitDate }) : [],
        nextSlot: bad ? bad.nextSlot : perLine[0]?.slot ?? null,
        nextSlotLate: false,
        perLine,
      };
    } else {
      const reasons = checkSlot(rule, o.requestedDelivery, { cityCentre: o.cityCentre, permitDate });
      const next = reasons.length ? nextValidSlot(rule, o.requestedDelivery, { cityCentre: o.cityCentre, permitDate }) : o.requestedDelivery;
      windowCheck = {
        ...base,
        requested: o.requestedDelivery,
        ok: reasons.length === 0,
        reasons,
        nextSlot: next,
        nextSlotLate: !!next && next.slice(0, 10) > o.promiseDate,
      };
    }
    if (!windowCheck.ok) {
      const w = rule.window;
      const why: Bi[] = windowCheck.reasons.map((r) =>
        r === "day"
          ? { en: `${w?.days ?? ""} only`, ar: `أيام التسليم ${w?.days === "Mon–Fri" ? "من الاثنين إلى الجمعة" : "من الاثنين إلى السبت"} فقط` }
          : r === "time"
            ? o.cityCentre
              ? { en: `window ${windowCheck.effectiveWindow} (city-centre truck restrictions)`, ar: `النافذة ${windowCheck.effectiveWindow} (قيود الشاحنات في وسط المدينة)` }
              : { en: `window ${windowCheck.effectiveWindow}`, ar: `النافذة ${windowCheck.effectiveWindow}` }
            : r === "city_centre"
              ? { en: `city-centre truck restrictions (${windowCheck.effectiveWindow})`, ar: `قيود حركة الشاحنات في وسط المدينة (${windowCheck.effectiveWindow})` }
              : r === "gate_lead"
                ? { en: `gate permit needs ${windowCheck.gateLeadHours} h notice`, ar: `تصريح البوابة يتطلب إشعاراً قبل ${windowCheck.gateLeadHours} ساعة` }
                : r === "holiday"
                  ? { en: "public holiday", ar: "عطلة رسمية" }
                  : { en: "time already passed", ar: "الموعد مضى" },
      );
      const zoneAr = ZONE_AR[o.zone] ?? o.zone;
      exceptions.push({
        key: `${o.id}:window`,
        type: "window",
        orderId: o.id,
        impact: windowCheck.nextSlotLate ? round2(lines.reduce((a, l) => a + l.openQty * l.unitPrice, 0)) : 0,
        title: { en: "Delivery-window conflict", ar: "تعارض مع نافذة التسليم" },
        detail: {
          en: `Requested ${fmtSlot(windowCheck.perLine ? windowCheck.perLine.find((x) => !x.ok)?.slot : o.requestedDelivery)} — ${o.zone}: ${why.map((x) => x.en).join("; ")}. Next valid slot ${fmtSlot(windowCheck.nextSlot)}${windowCheck.nextSlotLate ? " — after the promise date" : ""}.`,
          ar: `الموعد المطلوب ${fmtSlot(windowCheck.perLine ? windowCheck.perLine.find((x) => !x.ok)?.slot : o.requestedDelivery, "ar")} — ${zoneAr}: ${why.map((x) => x.ar).join("؛ ")}. أقرب موعد صالح ${fmtSlot(windowCheck.nextSlot, "ar")}${windowCheck.nextSlotLate ? " — بعد الموعد الملتزم به" : ""}.`,
        },
      });
    }

    /* credit */
    const credit = creditMap.get(o.id)!;
    if (credit.over) {
      exceptions.push({
        key: `${o.id}:credit`,
        type: "credit",
        orderId: o.id,
        impact: round2(credit.thisOrder / (1 + m.vatRate)),
        title: { en: "Credit exposure over limit", ar: "التعرض الائتماني يتجاوز الحد" },
        detail: {
          en: `Exposure ${aedBi(credit.exposure).en} vs limit ${aedBi(credit.limit + credit.release).en} (${fmtNum(credit.pct * 100, 1)}%) — over by ${aedBi(credit.overAmount).en}. AR ${aedBi(credit.ar).en}${credit.overdue30 ? `, overdue ${aedBi(credit.overdue30).en}` : ""}; this order ${aedBi(credit.thisOrder).en} incl. VAT.`,
          ar: `التعرض ${aedBi(credit.exposure).ar} مقابل حد ${aedBi(credit.limit + credit.release).ar} (${fmtNum(credit.pct * 100, 1)}%) — بزيادة ${aedBi(credit.overAmount).ar}. الذمم ${aedBi(credit.ar).ar}${credit.overdue30 ? `، منها متأخر ${aedBi(credit.overdue30).ar}` : ""}؛ قيمة هذا الطلب ${aedBi(credit.thisOrder).ar} شاملة الضريبة.`,
        },
      });
    }

    /* severity */
    const types = Array.from(new Set(exceptions.map((e) => e.type))) as ExceptionType[];
    let atRisk = 0;
    for (const l of lines) {
      const q = credit.over ? l.openQty : Math.max(l.short, windowCheck.nextSlotLate ? l.openQty : 0);
      atRisk += q * l.unitPrice;
    }
    atRisk += exceptions.filter((e) => e.type === "price").reduce((a, e) => a + e.impact, 0);
    const openValue = lines.reduce((a, l) => a + l.openQty * l.unitPrice, 0);
    const promise = lines.map((l) => l.promiseDate).sort()[0] ?? o.promiseDate;
    const days = daysBetween(TODAY, promise);
    let score = 0;
    let severity: Severity | null = null;
    if (exceptions.length) {
      score += atRisk >= 250_000 ? 3 : atRisk >= 50_000 ? 2 : atRisk >= 10_000 ? 1 : 0;
      score += days <= 1 ? 3 : days <= 3 ? 2 : days <= 7 ? 1 : 0;
      score += types.length - 1;
      score += types.some((t) => t === "stock" || t === "credit") ? 1 : 0;
      severity = score >= 7 ? "critical" : score >= 5 ? "high" : score >= 3 ? "medium" : "low";
    }
    analyses.push({
      order: o,
      customer,
      lines,
      window: windowCheck,
      credit,
      exceptions,
      types,
      valueAtRisk: round2(atRisk),
      openValue: round2(openValue),
      daysToPromise: days,
      severity,
      score,
    });
  }

  analyses.sort((a, b) => b.score - a.score || b.valueAtRisk - a.valueAtRisk || a.order.promiseDate.localeCompare(b.order.promiseDate));
  return { orders: analyses, byId: Object.fromEntries(analyses.map((a) => [a.order.id, a])), free: pool, poRemaining };
}

/* ───────────── KPIs ───────────── */

export interface Kpis {
  openExceptionOrders: number;
  openIssues: number;
  openOrders: number;
  valueAtRisk: number;
  byType: Record<ExceptionType, number>;
  promiseAccuracy: number;
  historyLines: number;
  historyOnTime: number;
  openLines: number;
  openOnTrack: number;
  projectedAccuracy: number;
  effortBaseline: number;
  effortLive: number | null;
  effortAll: number;
  liveResolved: number;
  missCauses: Array<{ cause: string; count: number }>;
}

export function computeKpis(s: Snapshot, w: WorldAnalysis): Kpis {
  const withEx = w.orders.filter((o) => o.exceptions.length);
  const byType: Record<ExceptionType, number> = { stock: 0, price: 0, window: 0, credit: 0 };
  for (const o of withEx) for (const t of o.types) byType[t]++;
  const hist = s.deliveryHistory;
  const onTime = hist.filter((h) => h.deliveredQty + EPS >= h.qty && h.deliveredDate <= h.promisedDate).length;
  let openLines = 0;
  let onTrack = 0;
  for (const o of w.orders) {
    for (const l of o.lines) {
      openLines++;
      const ok = l.short <= EPS && (!l.readyDate || l.readyDate <= l.promiseDate) && !o.credit.over && (o.window.ok || !o.window.nextSlotLate);
      if (ok) onTrack++;
    }
  }
  const baseEff = s.exceptionHistory.reduce((a, e) => a + e.effortMinutes, 0) / Math.max(1, s.exceptionHistory.length);
  const live = s.resolutions.filter((r) => r.effortMinutes != null) as Array<{ effortMinutes: number }>;
  const liveAvg = live.length ? live.reduce((a, r) => a + r.effortMinutes, 0) / live.length : null;
  const all = [...s.exceptionHistory.map((e) => e.effortMinutes), ...live.map((r) => r.effortMinutes)];
  const causes = new Map<string, number>();
  for (const h of hist) if (h.varianceReason) causes.set(h.varianceReason, (causes.get(h.varianceReason) ?? 0) + 1);
  return {
    openExceptionOrders: withEx.length,
    openIssues: withEx.reduce((a, o) => a + o.exceptions.length, 0),
    openOrders: w.orders.length,
    valueAtRisk: round2(withEx.reduce((a, o) => a + o.valueAtRisk, 0)),
    byType,
    promiseAccuracy: hist.length ? onTime / hist.length : 0,
    historyLines: hist.length,
    historyOnTime: onTime,
    openLines,
    openOnTrack: onTrack,
    projectedAccuracy: (onTime + onTrack) / Math.max(1, hist.length + openLines),
    effortBaseline: baseEff,
    effortLive: liveAvg,
    effortAll: all.reduce((a, b) => a + b, 0) / Math.max(1, all.length),
    liveResolved: s.resolutions.length,
    missCauses: Array.from(causes, ([cause, count]) => ({ cause, count })).sort((a, b) => b.count - a.count),
  };
}

/* ───────────── Supply timeline for the chart ───────────── */

export interface SupplyPoint {
  date: string;
  /** Stock promised to this line now + uncommitted inbound reaching the dispatch warehouse. */
  planned: number;
  /** Same, plus free stock transferable from the other warehouse. */
  withTransfer: number;
  required: number;
}

/** Day-by-day quantity this order line can draw on (capped at the open quantity). */
export function supplyTimeline(w: WorldAnalysis, orderId: string, lineNo: number, days = 16): SupplyPoint[] {
  const oa = w.byId[orderId];
  const line = oa?.lines.find((l) => l.lineNo === lineNo);
  if (!oa || !line) return [];
  const start = line.short <= EPS && line.readyDate ? line.readyDate : TODAY;
  const inbound = line.coverage.filter((c) => c.kind === "inbound");
  const transfer = line.coverage.filter((c) => c.kind === "transfer");
  const out: SupplyPoint[] = [];
  let d = TODAY;
  for (let i = 0; i < days; i++) {
    const base = (start <= d ? line.allocated : 0) + inbound.filter((c) => c.deliverableFrom <= d).reduce((a, c) => a + c.qty, 0);
    const extra = transfer.filter((c) => c.deliverableFrom <= d).reduce((a, c) => a + c.qty, 0);
    out.push({
      date: d,
      planned: round2(Math.min(line.openQty, base)),
      withTransfer: round2(Math.min(line.openQty, base + extra)),
      required: line.openQty,
    });
    d = nextDay(d);
  }
  return out;
}

function nextDay(d: string) {
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd + 1)).toISOString().slice(0, 10);
}

export { contractOf };
