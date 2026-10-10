// Generator for the September 2026 AP batch (solution 14 — Finance Operations Intelligence).
// Run:  node data/raseen/14-finance-operations/_build/generate.mjs
// Every amount is computed here in integer fils (cents) so invoices, POs, GRNs and the rendered
// scans agree to the last fils. Prices come from the Raseen master (products[].stdCost).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderInvoiceHtml } from "./scan-template.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const master = JSON.parse(fs.readFileSync(path.resolve(root, "../knowledge/reference/raseen-master.json"), "utf8"));

const PROD = Object.fromEntries(master.products.map((p) => [p.sku, p]));
const SUP = Object.fromEntries(master.suppliers.map((s) => [s.id, s]));
const VAT = master.vatRate;

const cents = (x) => Math.round(x * 100);
const money = (c) => Math.round(c) / 100;
const lineCents = (qty, price) => Math.round(qty * price * 100);
const vatCents = (baseC) => Math.round(baseC * VAT);

function addDays(iso, n) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/* ───────────── Service items (freight) — not stock SKUs, priced on the PO ───────────── */
const SERVICES = {
  "FRT-JA-MN05-T": { name: "Inter-warehouse transfer Jebel Ali → MN-05 (per tonne)", unit: "t", price: master.deliveryRules.transferJAtoMN05.costPerTonne },
  "FRT-JA-MN05-P": { name: "Inter-warehouse transfer Jebel Ali → MN-05, palletised (per tonne)", unit: "t", price: master.deliveryRules.transferJAtoMN05.costPerTonne },
  "FRT-SHUTTLE-10T": { name: "MN-05 shuttle run, 10 t truck (per trip)", unit: "trip", price: 410.0 },
};

function itemInfo(sku) {
  if (PROD[sku]) return { name: PROD[sku].name, unit: PROD[sku].unit, price: PROD[sku].stdCost };
  return SERVICES[sku];
}

const PEOPLE = {
  joseph: "Joseph Abraham",
  anitha: "Anitha Varghese",
};
const RECEIVERS = {
  JA: ["Sunil Thomas", "Rajesh Nair", "Imran Baig"],
  MN05: ["Marwan Qasim", "Joel D'Souza"],
};
const WH = { JA: "Jebel Ali", MN05: "Ras Al Marsa Industrial (MN-05)" };

/* ───────────── Purchase orders ───────────── */
// [id, supplierId, date, buyer, terms, warehouse, lines [sku, qty], extra]
const PO_SPECS = [
  ["RBM-PO-26-04318", "SUP-NEC", "2026-08-06", "anitha", "delivered", "JA", [["CEM-OPC-50", 3000]], { status: "closed" }],
  ["RBM-PO-26-04390", "SUP-ACT", "2026-08-17", "anitha", "delivered", "JA", [["TIL-POR-60120", 2016]], { priceBasis: "Andalus quotation AQ-26-0412 (AED 46.80/m², valid to 31 Aug 2026)" }],
  ["RBM-PO-26-04394", "SUP-ACT", "2026-08-18", "anitha", "delivered", "JA", [["TIL-CER-3060", 1152]], {}],
  ["RBM-PO-26-04396", "SUP-AWB", "2026-08-19", "anitha", "delivered", "MN05", [["BLK-HOL-20", 10800]], {}],
  ["RBM-PO-26-04397", "SUP-CCI", "2026-08-19", "joseph", "delivered", "JA", [["PNT-TS-20", 480]], { note: "ThermaShield launch stock — batch 1 (applicator training & samples)" }],
  ["RBM-PO-26-04398", "SUP-SRM", "2026-08-20", "joseph", "delivered", "JA", [["RB-B500-12", 38], ["RB-B500-16", 122]], {}],
  ["RBM-PO-26-04400", "SUP-GBP", "2026-08-21", "anitha", "delivered", "JA", [["WPF-BIT-4", 540]], { discountPct: 2 }],
  ["RBM-PO-26-04402", "SUP-NEC", "2026-08-24", "anitha", "delivered", "JA", [["CEM-OPC-50", 3600]], {}],
  ["RBM-PO-26-04403", "SUP-AKT", "2026-08-24", "joseph", "service", "MN05", [["FRT-JA-MN05-T", 212]], { note: "Transfers 1–5 Sep 2026" }],
  ["RBM-PO-26-04405", "SUP-NEC", "2026-08-25", "anitha", "delivered", "MN05", [["CEM-SRC-50", 1200]], {}],
  ["RBM-PO-26-04407", "SUP-ACT", "2026-08-25", "anitha", "delivered", "JA", [["SAN-WC-WH", 48]], {}],
  ["RBM-PO-26-04409", "SUP-SRM", "2026-08-26", "joseph", "delivered", "JA", [["RB-B500-16", 146]], {}],
  ["RBM-PO-26-04410", "SUP-AWB", "2026-08-26", "anitha", "delivered", "MN05", [["BLK-HOL-20", 8100]], {}],
  ["RBM-PO-26-04411", "SUP-NEC", "2026-08-27", "anitha", "delivered", "JA", [["CEM-OPC-50", 4800]], {}],
  ["RBM-PO-26-04412", "SUP-ACT", "2026-08-27", "anitha", "delivered", "JA", [["TIL-POR-60120", 1440]], { priceBasis: "Andalus quotation AQ-26-0412 (AED 46.80/m², valid to 31 Aug 2026)" }],
  ["RBM-PO-26-04414", "SUP-GBP", "2026-08-28", "anitha", "delivered", "MN05", [["WPF-BIT-4", 320]], {}],
  ["RBM-PO-26-04418", "SUP-SRM", "2026-08-31", "joseph", "delivered", "JA", [["RB-B500-20", 96], ["RB-B500-25", 48]], {}],
  ["RBM-PO-26-04421", "SUP-NEC", "2026-09-01", "anitha", "delivered", "MN05", [["CEM-OPC-50", 2400]], {}],
  ["RBM-PO-26-04424", "SUP-AKT", "2026-09-02", "joseph", "service", "MN05", [["FRT-JA-MN05-T", 286]], { note: "Transfers 7–12 Sep 2026" }],
  ["RBM-PO-26-04425", "SUP-SRM", "2026-09-02", "joseph", "delivered", "JA", [["RB-B500-16", 168]], {}],
  ["RBM-PO-26-04427", "SUP-AWB", "2026-09-03", "anitha", "delivered", "JA", [["BLK-HOL-20", 12600]], {}],
  ["RBM-PO-26-04429", "SUP-NEC", "2026-09-04", "anitha", "delivered", "JA", [["CEM-OPC-50", 5400]], {}],
  ["RBM-PO-26-04431", "SUP-ACT", "2026-09-07", "anitha", "delivered", "MN05", [["TIL-CER-3060", 864], ["SAN-WC-WH", 24]], {}],
  ["RBM-PO-26-04433", "SUP-SRM", "2026-09-07", "joseph", "delivered", "MN05", [["RB-B500-12", 52], ["RB-B500-20", 70]], {}],
  ["RBM-PO-26-04436", "SUP-GBP", "2026-09-08", "anitha", "delivered", "JA", [["WPF-BIT-4", 760]], { discountPct: 2 }],
  ["RBM-PO-26-04438", "SUP-NEC", "2026-09-09", "anitha", "delivered", "JA", [["CEM-SRC-50", 1800]], {}],
  ["RBM-PO-26-04439", "SUP-AWB", "2026-09-09", "anitha", "delivered", "MN05", [["BLK-HOL-20", 9900]], {}],
  ["RBM-PO-26-04441", "SUP-SRM", "2026-09-10", "joseph", "delivered", "JA", [["RB-B500-16", 20]], {}],
  ["RBM-PO-26-04444", "SUP-SRM", "2026-09-11", "joseph", "delivered", "JA", [["RB-B500-16", 154]], {}],
  ["RBM-PO-26-04445", "SUP-AKT", "2026-09-11", "joseph", "service", "MN05", [["FRT-JA-MN05-T", 174]], { note: "Transfers 14–19 Sep 2026" }],
  ["RBM-PO-26-04446", "SUP-AWB", "2026-09-14", "anitha", "delivered", "MN05", [["BLK-HOL-20", 7200]], {}],
  ["RBM-PO-26-04447", "SUP-NEC", "2026-09-14", "anitha", "delivered", "MN05", [["CEM-OPC-50", 3000]], {}],
  ["RBM-PO-26-04448", "SUP-GBP", "2026-09-14", "anitha", "delivered", "JA", [["WPF-BIT-4", 620]], { discountPct: 2 }],
  ["RBM-PO-26-04450", "SUP-FLL", "2026-09-15", "joseph", "service", "MN05", [["FRT-SHUTTLE-10T", 14]], { note: "MN-05 shuttle runs 15–25 Sep 2026 (rate agreed by email, AED 410/trip)" }],
  ["RBM-PO-26-04452", "SUP-CCI", "2026-09-15", "joseph", "delivered", "JA", [["PNT-TS-20", 720]], { note: "ThermaShield launch stock — batch 2" }],
  ["RBM-PO-26-04456", "SUP-SRM", "2026-09-16", "joseph", "delivered", "JA", [["RB-B500-16", 118], ["RB-B500-25", 30]], {}],
  ["RBM-PO-26-04459", "SUP-ACT", "2026-09-17", "anitha", "delivered", "JA", [["TIL-CER-3060", 1728]], {}],
  ["RBM-PO-26-04461", "SUP-GBP", "2026-09-17", "anitha", "delivered", "MN05", [["WPF-BIT-4", 280]], {}],
  ["RBM-PO-26-04463", "SUP-NEC", "2026-09-18", "anitha", "delivered", "JA", [["CEM-OPC-50", 4200]], {}],
  ["RBM-PO-26-04464", "SUP-AKT", "2026-09-18", "joseph", "service", "MN05", [["FRT-JA-MN05-T", 160], ["FRT-JA-MN05-P", 88]], { note: "Transfers 21–26 Sep 2026" }],
  ["RBM-PO-26-04466", "SUP-SRM", "2026-09-21", "joseph", "delivered", "JA", [["RB-B500-16", 88]], {}],
  ["RBM-PO-26-04468", "SUP-AWB", "2026-09-21", "anitha", "delivered", "MN05", [["BLK-HOL-20", 11700]], {}],
  ["RBM-PO-26-04470", "SUP-NEC", "2026-09-22", "anitha", "delivered", "JA", [["CEM-OPC-50", 6000]], { note: "Price per NEC supply contract — AED 14.20/bag to 31 Dec 2026; surcharge proposal NEC/SALES/2026/208 not accepted" }],
  ["RBM-PO-26-04472", "SUP-AKT", "2026-09-22", "joseph", "service", "MN05", [["FRT-JA-MN05-T", 196]], { note: "Transfers 28–30 Sep 2026" }],
  ["RBM-PO-26-04481", "SUP-CCI", "2026-09-23", "joseph", "delivered", "JA", [["PNT-TS-20", 1200]], { note: "ThermaShield launch stock — batch 3 (1 Nov 2026 launch)" }],
];

const DEFAULT_BASIS = {
  "SUP-NEC": "NEC supply contract 2026 — fixed to 31 Dec 2026",
  "SUP-SRM": "Sahara Rebar Mills supply contract — Q3/Q4 2026 mill price",
  "SUP-ACT": "Andalus Ceramics price agreement 2026",
  "SUP-GBP": "Gulf Bitumen annual price agreement — 2% volume discount on orders ≥ 500 rolls",
  "SUP-AWB": "Al Waha Blocks delivered price list 2026 (freight included)",
  "SUP-CCI": "ThermaShield contract-manufacturing agreement RBM-CM-26-03",
  "SUP-AKT": "Al Khaleej Heavy Transport rate card 2026 (AED 38/t JA → MN-05)",
  "SUP-FLL": "Email rate confirmation 12 Sep 2026",
};

const pos = PO_SPECS.map(([id, supplierId, date, buyer, terms, wh, lines, extra]) => {
  const kind = terms === "service" ? "service" : "goods";
  return {
    id,
    supplierId,
    date,
    buyer: PEOPLE[buyer],
    kind,
    deliveryTerms: kind === "service" ? "service" : terms,
    deliveryPoint: kind === "service" ? "Jebel Ali → MN-05" : `DAP RBM ${WH[wh]} warehouse`,
    warehouse: wh,
    currency: "AED",
    priceBasis: extra.priceBasis ?? DEFAULT_BASIS[supplierId],
    discountPct: extra.discountPct ?? 0,
    note: extra.note ?? null,
    status: extra.status ?? "received",
    lines: lines.map(([sku, qty], i) => {
      const info = itemInfo(sku);
      return { lineNo: i + 1, sku, description: info.name, qty, unit: info.unit, unitPrice: info.price, amount: money(lineCents(qty, info.price)) };
    }),
  };
});
const PO = Object.fromEntries(pos.map((p) => [p.id, p]));
for (const p of pos) {
  const gross = p.lines.reduce((a, l) => a + cents(l.amount), 0);
  const disc = Math.round((gross * p.discountPct) / 100);
  p.netAmount = money(gross - disc);
}

/* ───────────── GRNs ───────────── */
// Deliveries: [poId, date, warehouse?, splits?] — goods received notes / service confirmations
let grnSeq = 8374;
const grns = [];
const plates = ["SHJ 3-41827", "DXB K 48213", "RAK B 18273", "SHJ 2-77410", "DXB M 30518", "AUH 14 62287", "SHJ 1-90364", "DXB L 11846", "RAK C 40922"];
let plateIdx = 0;
let wbSeq = { JA: 11790, MN05: 4410 };
let dnSeq = { "SUP-NEC": 1162, "SUP-SRM": 8781, "SUP-ACT": 2290, "SUP-GBP": 731, "SUP-AWB": 5512, "SUP-CCI": 201, "SUP-AKT": 960, "SUP-FLL": 41 };
const dnFmt = {
  "SUP-NEC": (n) => `NEC-DN-26-${n}`,
  "SUP-SRM": (n) => `SRM-DN-26-0${n}`,
  "SUP-ACT": (n) => `ACT-DO-26-${n}`,
  "SUP-GBP": (n) => `GBP-DN-26-0${n}`,
  "SUP-AWB": (n) => `AWB-DN-${n}`,
  "SUP-CCI": (n) => `CCI-DN-26-0${n}`,
  "SUP-AKT": (n) => `AKHT-TS-26-0${n}`,
  "SUP-FLL": (n) => `FLL-TS-0${n}`,
};

function pickReceiver(wh, i) {
  return RECEIVERS[wh][i % RECEIVERS[wh].length];
}

/**
 * makeGrn(poId, date, portion, opts)
 *  portion: map sku → qty delivered in this receipt (defaults to the full PO)
 *  opts.override: sku → { delivered, received, accepted, rejected, reason }
 */
function makeGrn(poId, date, portion, opts = {}) {
  const po = PO[poId];
  const sup = po.supplierId;
  const wh = opts.warehouse ?? po.warehouse;
  const id = opts.id ?? `GRN-26-0${grnSeq}`;
  if (!opts.id) grnSeq += 2 + ((grnSeq * 7) % 3);
  const dn = opts.dn ?? dnFmt[sup](dnSeq[sup]++);
  const lines = po.lines
    .filter((l) => !portion || portion[l.sku] != null)
    .map((l, i) => {
      const delivered = portion ? portion[l.sku] : l.qty;
      const o = opts.override?.[l.sku] ?? {};
      const received = o.received ?? delivered;
      const accepted = o.accepted ?? received;
      return {
        lineNo: i + 1,
        sku: l.sku,
        description: l.description,
        unit: l.unit,
        orderedQty: l.qty,
        deliveredQty: o.delivered ?? delivered,
        receivedQty: received,
        acceptedQty: accepted,
        rejectedQty: o.rejected ?? Math.round((received - accepted) * 1000) / 1000,
        rejectReason: o.reason ?? null,
      };
    });
  const steel = lines.some((l) => l.sku.startsWith("RB-"));
  let weighbridge = null;
  if (steel) {
    weighbridge = [];
    const totalT = lines.reduce((a, l) => a + l.receivedQty, 0);
    if (opts.weighbridge) weighbridge = opts.weighbridge;
    else {
      const n = Math.ceil(totalT / 25);
      let left = Math.round(totalT * 1000);
      for (let k = 0; k < n; k++) {
        const net = k === n - 1 ? left : Math.round(Math.round((totalT * 1000) / n) / 20) * 20;
        left -= net;
        const tare = 15240 + ((k * 137 + grnSeq) % 9) * 40;
        weighbridge.push({
          ticket: `${wh === "JA" ? "JA" : "MN"}-WB-26-${wbSeq[wh]++}`,
          vehicle: plates[plateIdx++ % plates.length],
          grossKg: tare + net,
          tareKg: tare,
          netKg: net,
        });
      }
    }
  }
  const g = {
    id,
    poId,
    supplierId: sup,
    kind: po.kind,
    warehouse: wh,
    date,
    deliveryNote: dn,
    receivedBy: opts.receivedBy ?? pickReceiver(wh, grns.length),
    lines,
    weighbridge,
    remarks: opts.remarks ?? (po.kind === "service" ? "Trip sheets checked against dispatch log — confirmed." : steel ? "Bundles tagged, mill certificates received per heat. Weighbridge net agrees with delivery note." : "Received in good condition; counted against delivery note."),
  };
  grns.push(g);
  return g;
}

/* ───────────── Invoices ───────────── */
const invoices = [];
const IMG = (name) => `/demo/14-finance-operations/${name}.png`;

const CHANNEL = { "SUP-NEC": "portal", "SUP-SRM": "email", "SUP-ACT": "email", "SUP-GBP": "email", "SUP-AWB": "courier", "SUP-CCI": "email", "SUP-AKT": "email", "SUP-FLL": "email" };

const SUPPLIER_DESC = {
  "CEM-OPC-50": "Ordinary Portland Cement CEM I 42.5N — 50 kg bag",
  "CEM-SRC-50": "Sulphate Resisting Cement CEM I 42.5N-SR3 — 50 kg bag",
  "RB-B500-12": "Deformed steel bar B500B Ø12 mm × 12 m (BS 4449)",
  "RB-B500-16": "Deformed steel bar B500B Ø16 mm × 12 m (BS 4449)",
  "RB-B500-20": "Deformed steel bar B500B Ø20 mm × 12 m (BS 4449)",
  "RB-B500-25": "Deformed steel bar B500B Ø25 mm × 12 m (BS 4449)",
  "BLK-HOL-20": "Hollow concrete block 400×200×200 mm, 7 N/mm²",
  "TIL-POR-60120": "Porcelain tile 60×120 matt rectified — 'Pietra Grigia'",
  "TIL-CER-3060": "Ceramic wall tile 30×60 gloss white — 'Bianco Lucido'",
  "SAN-WC-WH": "Wall-hung WC set, concealed cistern, soft-close seat",
  "WPF-BIT-4": "APP modified bitumen membrane 4 mm, polyester, 1×10 m roll",
  "PNT-TS-20": "Raseen ThermaShield heat-reflective roof coating — 20 L pail",
  "FRT-JA-MN05-T": "Rebar transfer Jebel Ali → MN-05 (per tonne)",
  "FRT-JA-MN05-P": "Palletised cargo transfer Jebel Ali → MN-05 (per tonne)",
  "FRT-SHUTTLE-10T": "MN-05 shuttle trip JA ↔ Ras Al Marsa, 10 ton truck",
};

/**
 * inv(spec): builds an invoice/credit note from item lines; discount from PO; optional charges;
 * spec.vatOverrideBase = "gross" to reproduce a supplier that charged VAT before the discount.
 */
function inv(spec) {
  const po = PO[spec.po];
  const sup = SUP[spec.supplierId ?? po.supplierId];
  const lines = [];
  let n = 1;
  for (const [sku, qty, price] of spec.items) {
    const poLine = po.lines.find((l) => l.sku === sku);
    const unitPrice = price ?? poLine?.unitPrice ?? itemInfo(sku).price;
    lines.push({
      lineNo: n++,
      kind: "item",
      sku,
      description: SUPPLIER_DESC[sku],
      qty,
      unit: itemInfo(sku).unit,
      unitPrice,
      amount: money(lineCents(qty, unitPrice)),
    });
  }
  for (const ch of spec.charges ?? []) {
    lines.push({ lineNo: n++, kind: "charge", sku: null, description: ch.description, qty: ch.qty, unit: ch.unit, unitPrice: ch.unitPrice, amount: money(lineCents(ch.qty, ch.unitPrice)) });
  }
  const itemGrossC = lines.filter((l) => l.kind === "item").reduce((a, l) => a + cents(l.amount), 0);
  const grossC = lines.reduce((a, l) => a + cents(l.amount), 0);
  const discPct = spec.discountPct ?? (po.discountPct && po.kind === "goods" ? po.discountPct : 0);
  const discC = discPct ? Math.round((itemGrossC * discPct) / 100) : 0;
  const taxableC = grossC - discC;
  const vatC = spec.noVat ? 0 : spec.vatOverrideBase === "gross" ? vatCents(grossC) : vatCents(taxableC);
  const totalC = taxableC + vatC;
  const terms = sup.paymentTermsDays;
  const doc = {
    id: spec.id,
    docType: spec.docType ?? "invoice",
    supplierId: sup.id,
    supplierName: sup.name,
    supplierInvoiceNo: spec.no,
    invoiceDate: spec.date,
    receivedDate: spec.received,
    channel: spec.channel ?? CHANNEL[sup.id],
    poRef: spec.poRefQuoted ?? spec.po,
    grnRefs: spec.grnRefs ?? [],
    deliveryNoteRefs: spec.dns ?? [],
    lines,
    grossAmount: money(grossC),
    discount: discC ? { label: spec.discountLabel ?? `Volume discount ${discPct}%`, pct: discPct, amount: money(discC) } : null,
    taxableAmount: money(taxableC),
    vatRate: VAT,
    vatAmount: money(vatC),
    total: money(totalC),
    currency: "AED",
    trnOnInvoice: spec.trn === undefined ? sup.trn : spec.trn,
    image: spec.image ? IMG(spec.image) : null,
    dueDate: addDays(spec.date, terms),
    paymentTermsDays: terms,
    relatedInvoiceNo: spec.relatedInvoiceNo ?? null,
    reason: spec.reason ?? null,
    note: spec.note ?? null,
    status: "received",
  };
  if (spec.negate) {
    for (const l of doc.lines) {
      l.qty = -l.qty;
      l.amount = -l.amount;
    }
    doc.grossAmount = -doc.grossAmount;
    doc.taxableAmount = -doc.taxableAmount;
    doc.vatAmount = -doc.vatAmount;
    doc.total = -doc.total;
  }
  invoices.push(doc);
  return doc;
}

function grnIds(...gs) {
  return gs.map((g) => g.id);
}
function dnIds(...gs) {
  return gs.map((g) => g.deliveryNote);
}

/* — August GRN behind the NEC credit note (exception 9) — */
const gAug = makeGrn("RBM-PO-26-04318", "2026-08-22", null, {
  id: "GRN-26-08262",
  dn: "NEC-DN-26-1047",
  receivedBy: "Sunil Thomas",
  override: { "CEM-OPC-50": { delivered: 3000, received: 3000, accepted: 2860, rejected: 140, reason: "Torn / water-damaged bags" } },
  remarks:
    "140 bags rejected at unloading: 80 torn bags returned on the NEC truck (driver return note NEC-RN-26-0611); 60 burst / hardened bags disposed at JA yard after photos — NEC representative informed by email 22/08 16:05.",
});

/* — Deliveries for the September batch — */
const G = {};
G.N1 = makeGrn("RBM-PO-26-04402", "2026-09-01");
G.W1 = makeGrn("RBM-PO-26-04396", "2026-09-01");
G.S1 = makeGrn("RBM-PO-26-04398", "2026-09-02");
G.N2 = makeGrn("RBM-PO-26-04405", "2026-09-03");
G.A1 = makeGrn("RBM-PO-26-04394", "2026-09-03");
G.G1 = makeGrn("RBM-PO-26-04400", "2026-09-04");
G.S2 = makeGrn("RBM-PO-26-04409", "2026-09-05");
G.N3a = makeGrn("RBM-PO-26-04411", "2026-09-05", { "CEM-OPC-50": 2400 });
G.K1 = makeGrn("RBM-PO-26-04403", "2026-09-05", null, { remarks: "212.000 t moved in 9 trailer trips, 1–5 Sep — trip sheets AKHT-TS signed at MN-05 gate." });
G.S3a = makeGrn("RBM-PO-26-04418", "2026-09-07", { "RB-B500-20": 96 });
G.N3b = makeGrn("RBM-PO-26-04411", "2026-09-07", { "CEM-OPC-50": 2400 });
G.A2 = makeGrn("RBM-PO-26-04407", "2026-09-07");
G.W2 = makeGrn("RBM-PO-26-04410", "2026-09-07");
G.S3b = makeGrn("RBM-PO-26-04418", "2026-09-08", { "RB-B500-25": 48 });
G.N4 = makeGrn("RBM-PO-26-04421", "2026-09-08");
G.C1 = makeGrn("RBM-PO-26-04397", "2026-09-09");
G.G2 = makeGrn("RBM-PO-26-04414", "2026-09-09");
G.S4 = makeGrn("RBM-PO-26-04425", "2026-09-10");
G.A3 = makeGrn("RBM-PO-26-04390", "2026-09-10");
G.N5a = makeGrn("RBM-PO-26-04429", "2026-09-11", { "CEM-OPC-50": 3000 });
G.W3a = makeGrn("RBM-PO-26-04427", "2026-09-12", { "BLK-HOL-20": 6300 });
G.N5b = makeGrn("RBM-PO-26-04429", "2026-09-12", { "CEM-OPC-50": 2400 });
G.K2 = makeGrn("RBM-PO-26-04424", "2026-09-12", null, { remarks: "286.000 t moved in 12 trailer trips, 7–12 Sep — trip sheets signed at MN-05 gate." });
G.S5 = makeGrn("RBM-PO-26-04433", "2026-09-14");
G.W3b = makeGrn("RBM-PO-26-04427", "2026-09-14", { "BLK-HOL-20": 6300 });
G.A4 = makeGrn("RBM-PO-26-04431", "2026-09-15");
G.SX1 = makeGrn("RBM-PO-26-04441", "2026-09-16", null, {
  receivedBy: "Imran Baig",
  override: { "RB-B500-16": { delivered: 20, received: 18, accepted: 18, rejected: 0 } },
  weighbridge: [{ ticket: "JA-WB-26-11873", vehicle: "SHJ 3-41827", grossKg: 33460, tareKg: 15460, netKg: 18000 }],
  remarks:
    "Delivery note SRM-DN-26-08814 declares 10 bundles / 20.000 t. 9 bundles received and tagged; weighbridge net 18,000 kg (ticket JA-WB-26-11873). Driver Mohammed Arshad (SHJ 3-41827) signed the short-delivery note; Sahara despatch informed by phone 16/09 15:40.",
  dn: "SRM-DN-26-08814",
});
G.G3 = makeGrn("RBM-PO-26-04436", "2026-09-16");
G.N6 = makeGrn("RBM-PO-26-04438", "2026-09-16");
G.WX5 = makeGrn("RBM-PO-26-04439", "2026-09-16", null, { remarks: "110 pallets received in 3 deliveries (supplier's own trucks), all in good condition. Delivered-price PO — no freight agreed." });
G.S6a = makeGrn("RBM-PO-26-04444", "2026-09-17", { "RB-B500-16": 78 });
G.AX7 = makeGrn("RBM-PO-26-04412", "2026-09-17");
G.S6b = makeGrn("RBM-PO-26-04444", "2026-09-18", { "RB-B500-16": 76 });
G.GX4 = makeGrn("RBM-PO-26-04448", "2026-09-19");
G.N7 = makeGrn("RBM-PO-26-04447", "2026-09-19");
G.W4 = makeGrn("RBM-PO-26-04446", "2026-09-19");
G.K3 = makeGrn("RBM-PO-26-04445", "2026-09-19", null, { remarks: "174.000 t moved in 8 trailer trips, 14–19 Sep — trip sheets signed at MN-05 gate." });
G.C2 = makeGrn("RBM-PO-26-04452", "2026-09-21");
G.S7 = makeGrn("RBM-PO-26-04456", "2026-09-22");
G.A5 = makeGrn("RBM-PO-26-04459", "2026-09-23");
G.N8 = makeGrn("RBM-PO-26-04463", "2026-09-24");
G.G4 = makeGrn("RBM-PO-26-04461", "2026-09-24");
G.NX2a = makeGrn("RBM-PO-26-04470", "2026-09-24", { "CEM-OPC-50": 3600 });
G.FX8 = makeGrn("RBM-PO-26-04450", "2026-09-25", null, {
  receivedBy: "Marwan Qasim",
  remarks: "14 shuttle trips 15–25 Sep confirmed against MN-05 gate log and dispatch sheets.",
});
G.S8 = makeGrn("RBM-PO-26-04466", "2026-09-25");
G.NX2b = makeGrn("RBM-PO-26-04470", "2026-09-26", { "CEM-OPC-50": 2400 });
G.W5 = makeGrn("RBM-PO-26-04468", "2026-09-26");
G.K4 = makeGrn("RBM-PO-26-04464", "2026-09-26", null, { remarks: "248.000 t moved in 11 trailer trips, 21–26 Sep (160 t rebar, 88 t palletised) — trip sheets signed at MN-05 gate." });
G.CX6 = makeGrn("RBM-PO-26-04481", "2026-09-28", null, { remarks: "1,200 pails (50 pallets × 24) received; batch CCI-TS-2609-B3; COA received. Stored in coatings bay C-4." });
G.K5 = makeGrn("RBM-PO-26-04472", "2026-09-30", null, { remarks: "196.000 t moved in 8 trailer trips, 28–30 Sep — trip sheets signed at MN-05 gate." });

/* — Documents, in order of receipt — */
const D = [];
const spec = (s) => D.push(s);

// NEC clean
spec({ k: "N1", no: "NEC/INV/26/04391", po: "RBM-PO-26-04402", date: "2026-09-02", received: "2026-09-03", items: [["CEM-OPC-50", 3600]], g: ["N1"] });
spec({ k: "N2", no: "NEC/INV/26/04406", po: "RBM-PO-26-04405", date: "2026-09-04", received: "2026-09-07", items: [["CEM-SRC-50", 1200]], g: ["N2"] });
spec({ k: "N3", no: "NEC/INV/26/04423", po: "RBM-PO-26-04411", date: "2026-09-07", received: "2026-09-08", items: [["CEM-OPC-50", 4800]], g: ["N3a", "N3b"] });
spec({ k: "N4", no: "NEC/INV/26/04437", po: "RBM-PO-26-04421", date: "2026-09-09", received: "2026-09-10", items: [["CEM-OPC-50", 2400]], g: ["N4"] });
spec({ k: "N5", no: "NEC/INV/26/04452", po: "RBM-PO-26-04429", date: "2026-09-14", received: "2026-09-15", items: [["CEM-OPC-50", 5400]], g: ["N5a", "N5b"] });
spec({ k: "N6", no: "NEC/INV/26/04468", po: "RBM-PO-26-04438", date: "2026-09-17", received: "2026-09-18", items: [["CEM-SRC-50", 1800]], g: ["N6"] });
spec({ k: "N7", no: "NEC/INV/26/04479", po: "RBM-PO-26-04447", date: "2026-09-21", received: "2026-09-22", items: [["CEM-OPC-50", 3000]], g: ["N7"] });
spec({ k: "N8", no: "NEC/INV/26/04502", po: "RBM-PO-26-04463", date: "2026-09-25", received: "2026-09-28", items: [["CEM-OPC-50", 4200]], g: ["N8"] });
// NEC exceptions
spec({
  k: "NX2", no: "NEC/INV/26/04515", po: "RBM-PO-26-04470", date: "2026-09-28", received: "2026-09-30", items: [["CEM-OPC-50", 6000]], g: ["NX2a", "NX2b"], image: "nec-inv-04515-surcharge",
  charges: [{ description: "Energy & fuel surcharge (ref. NEC/SALES/2026/208)", qty: 6000, unit: "bag", unitPrice: 1.2 }],
});
spec({
  k: "NX9", no: "NEC/CN/26/00187", docType: "credit_note", po: "RBM-PO-26-04318", date: "2026-09-23", received: "2026-09-25", items: [["CEM-OPC-50", 80]], gRaw: ["GRN-26-08262"], dnsRaw: ["NEC-DN-26-1047", "NEC-RN-26-0611"],
  negate: true, relatedInvoiceNo: "NEC/INV/26/04127", reason: "Credit for damaged bags returned on delivery NEC-DN-26-1047 (return note NEC-RN-26-0611)",
});
// Sahara clean
spec({ k: "S1", no: "SRM-26-1142", po: "RBM-PO-26-04398", date: "2026-09-03", received: "2026-09-04", items: [["RB-B500-12", 38], ["RB-B500-16", 122]], g: ["S1"] });
spec({ k: "S2", no: "SRM-26-1156", po: "RBM-PO-26-04409", date: "2026-09-07", received: "2026-09-08", items: [["RB-B500-16", 146]], g: ["S2"] });
spec({ k: "S3", no: "SRM-26-1163", po: "RBM-PO-26-04418", date: "2026-09-09", received: "2026-09-10", items: [["RB-B500-20", 96], ["RB-B500-25", 48]], g: ["S3a", "S3b"] });
spec({ k: "S4", no: "SRM-26-1171", po: "RBM-PO-26-04425", date: "2026-09-12", received: "2026-09-14", items: [["RB-B500-16", 168]], g: ["S4"] });
spec({ k: "S5", no: "SRM-26-1179", po: "RBM-PO-26-04433", date: "2026-09-15", received: "2026-09-16", items: [["RB-B500-12", 52], ["RB-B500-20", 70]], g: ["S5"] });
spec({ k: "SX1", no: "SRM-26-1187", po: "RBM-PO-26-04441", date: "2026-09-18", received: "2026-09-21", items: [["RB-B500-16", 20]], g: ["SX1"], image: "srm-26-1187-short-receipt" });
spec({ k: "S6", no: "SRM-26-1190", po: "RBM-PO-26-04444", date: "2026-09-19", received: "2026-09-21", items: [["RB-B500-16", 154]], g: ["S6a", "S6b"] });
spec({ k: "S7", no: "SRM-26-1198", po: "RBM-PO-26-04456", date: "2026-09-23", received: "2026-09-24", items: [["RB-B500-16", 118], ["RB-B500-25", 30]], g: ["S7"] });
spec({ k: "S8", no: "SRM-26-1207", po: "RBM-PO-26-04466", date: "2026-09-26", received: "2026-09-28", items: [["RB-B500-16", 88]], g: ["S8"] });
// Andalus
spec({ k: "A1", no: "ACT/INV/26/0712", po: "RBM-PO-26-04394", date: "2026-09-04", received: "2026-09-07", items: [["TIL-CER-3060", 1152]], g: ["A1"] });
spec({ k: "A2", no: "ACT/INV/26/0726", po: "RBM-PO-26-04407", date: "2026-09-08", received: "2026-09-09", items: [["SAN-WC-WH", 48]], g: ["A2"] });
spec({ k: "A3", no: "ACT/INV/26/0741", po: "RBM-PO-26-04390", date: "2026-09-11", received: "2026-09-14", items: [["TIL-POR-60120", 2016]], g: ["A3"] });
spec({ k: "A4", no: "ACT/INV/26/0758", po: "RBM-PO-26-04431", date: "2026-09-16", received: "2026-09-17", items: [["TIL-CER-3060", 864], ["SAN-WC-WH", 24]], g: ["A4"] });
spec({ k: "AX7", no: "ACT/INV/26/0766", po: "RBM-PO-26-04412", date: "2026-09-18", received: "2026-09-21", items: [["TIL-POR-60120", 1440, 49.6]], g: ["AX7"], note: "Price as per our quotation AQ-26-0457 dated 10/09/2026" });
spec({ k: "AX3", no: "ACT/INV/26/0712", po: "RBM-PO-26-04394", date: "2026-09-22", received: "2026-09-23", items: [["TIL-CER-3060", 1152]], g: ["A1"], image: "act-inv-0712-resent" });
spec({ k: "A5", no: "ACT/INV/26/0779", po: "RBM-PO-26-04459", date: "2026-09-24", received: "2026-09-25", items: [["TIL-CER-3060", 1728]], g: ["A5"] });
// Gulf Bitumen
spec({ k: "G1", no: "GBP-TI-26-0388", po: "RBM-PO-26-04400", date: "2026-09-05", received: "2026-09-07", items: [["WPF-BIT-4", 540]], g: ["G1"] });
spec({ k: "G2", no: "GBP-TI-26-0401", po: "RBM-PO-26-04414", date: "2026-09-10", received: "2026-09-11", items: [["WPF-BIT-4", 320]], g: ["G2"] });
spec({ k: "G3", no: "GBP-TI-26-0419", po: "RBM-PO-26-04436", date: "2026-09-17", received: "2026-09-18", items: [["WPF-BIT-4", 760]], g: ["G3"] });
spec({ k: "GX4", no: "GBP-TI-26-0427", po: "RBM-PO-26-04448", date: "2026-09-21", received: "2026-09-22", items: [["WPF-BIT-4", 620]], g: ["GX4"], vatOverrideBase: "gross", image: "gbp-ti-0427-vat-base" });
spec({ k: "G4", no: "GBP-TI-26-0436", po: "RBM-PO-26-04461", date: "2026-09-25", received: "2026-09-28", items: [["WPF-BIT-4", 280]], g: ["G4"] });
// Al Waha
spec({ k: "W1", no: "AWB-26-3304", po: "RBM-PO-26-04396", date: "2026-09-02", received: "2026-09-04", items: [["BLK-HOL-20", 10800]], g: ["W1"] });
spec({ k: "W2", no: "AWB-26-3319", po: "RBM-PO-26-04410", date: "2026-09-08", received: "2026-09-10", items: [["BLK-HOL-20", 8100]], g: ["W2"] });
spec({ k: "W3", no: "AWB-26-3336", po: "RBM-PO-26-04427", date: "2026-09-14", received: "2026-09-16", items: [["BLK-HOL-20", 12600]], g: ["W3a", "W3b"] });
spec({
  k: "WX5", no: "AWB-26-3344", po: "RBM-PO-26-04439", date: "2026-09-17", received: "2026-09-21", items: [["BLK-HOL-20", 9900]], g: ["WX5"], image: "awb-26-3344-freight",
  charges: [{ description: "Delivery charges — 3 trips to MN-05", qty: 3, unit: "trip", unitPrice: 450 }],
});
spec({ k: "W4", no: "AWB-26-3351", po: "RBM-PO-26-04446", date: "2026-09-21", received: "2026-09-23", items: [["BLK-HOL-20", 7200]], g: ["W4"] });
spec({ k: "W5", no: "AWB-26-3372", po: "RBM-PO-26-04468", date: "2026-09-28", received: "2026-09-30", items: [["BLK-HOL-20", 11700]], g: ["W5"] });
// Coastal Coatings
spec({ k: "C1", no: "CCI-INV-26-0131", po: "RBM-PO-26-04397", date: "2026-09-10", received: "2026-09-11", items: [["PNT-TS-20", 480]], g: [], dnOnly: ["C1"] });
spec({ k: "C2", no: "CCI-INV-26-0138", po: "RBM-PO-26-04452", date: "2026-09-22", received: "2026-09-23", items: [["PNT-TS-20", 720]], g: [], dnOnly: ["C2"] });
spec({ k: "CX6", no: "CCI-INV-26-0144", po: "RBM-PO-26-04481", poRefQuoted: "RBM-PO-26-04418", date: "2026-09-29", received: "2026-09-30", items: [["PNT-TS-20", 1200]], g: [], dnOnly: ["CX6"], image: "cci-inv-0144-wrong-po" });
// Al Khaleej Heavy Transport
spec({ k: "K1", no: "AKHT/26/0917", po: "RBM-PO-26-04403", date: "2026-09-07", received: "2026-09-08", items: [["FRT-JA-MN05-T", 212]], g: ["K1"] });
spec({ k: "K2", no: "AKHT/26/0934", po: "RBM-PO-26-04424", date: "2026-09-14", received: "2026-09-15", items: [["FRT-JA-MN05-T", 286]], g: ["K2"] });
spec({ k: "K3", no: "AKHT/26/0951", po: "RBM-PO-26-04445", date: "2026-09-21", received: "2026-09-22", items: [["FRT-JA-MN05-T", 174]], g: ["K3"] });
spec({ k: "FX8", no: "FLL-0087", po: "RBM-PO-26-04450", date: "2026-09-26", received: "2026-09-28", items: [["FRT-SHUTTLE-10T", 14]], g: [], dnOnly: ["FX8"], trn: null, image: "fll-0087-missing-trn" });
spec({ k: "K4", no: "AKHT/26/0968", po: "RBM-PO-26-04464", date: "2026-09-28", received: "2026-09-29", items: [["FRT-JA-MN05-T", 160], ["FRT-JA-MN05-P", 88]], g: ["K4"], image: "akht-26-0968-clean" });
spec({ k: "K5", no: "AKHT/26/0975", po: "RBM-PO-26-04472", date: "2026-09-30", received: "2026-10-01", items: [["FRT-JA-MN05-T", 196]], g: ["K5"] });

// Assign internal register numbers in order of receipt (stable on ties by spec order).
const ordered = D.map((s, i) => ({ s, i })).sort((a, b) => (a.s.received === b.s.received ? a.i - b.i : a.s.received.localeCompare(b.s.received)));
ordered.forEach(({ s }, idx) => {
  s.id = `AP-26-09-${String(idx + 1).padStart(3, "0")}`;
});
const KEY = {};
for (const { s } of ordered) {
  const gs = (s.g ?? []).map((k) => G[k]);
  const dnG = (s.dnOnly ?? []).map((k) => G[k]);
  const doc = inv({
    ...s,
    grnRefs: s.gRaw ?? grnIds(...gs),
    dns: s.dnsRaw ?? dnIds(...gs, ...dnG),
  });
  KEY[s.k] = doc;
}

/* ───────────── Sanity checks against the storyline ───────────── */
const assert = (cond, msg) => {
  if (!cond) {
    console.error("ASSERT FAILED:", msg);
    process.exitCode = 1;
  }
};
assert(invoices.length === 46, `46 documents (got ${invoices.length})`);
assert(KEY.SX1.total === 53130 && KEY.SX1.vatAmount === 2530, "SX1 total 53,130.00");
assert(KEY.NX2.grossAmount === 92400 && KEY.NX2.total === 97020, "NX2 92,400 / 97,020");
assert(KEY.A1.total === 27095.04 && KEY.AX3.total === 27095.04, "Andalus original/duplicate 27,095.04");
assert(KEY.GX4.taxableAmount === 43443.4 && KEY.GX4.vatAmount === 2216.5 && KEY.GX4.total === 45659.9, "GX4 VAT base");
assert(KEY.WX5.grossAmount === 31545 && KEY.WX5.total === 33122.25, "WX5 freight");
assert(KEY.CX6.total === 291060, "CX6 291,060");
assert(KEY.AX7.total === 74995.2, "AX7 74,995.20");
assert(KEY.FX8.total === 6027 && KEY.FX8.trnOnInvoice === null, "FX8 6,027 no TRN");
assert(KEY.NX9.total === -1192.8, "NX9 credit -1,192.80");
const srmT = invoices.filter((d) => d.supplierId === "SUP-SRM").flatMap((d) => d.lines).reduce((a, l) => a + l.qty, 0);
assert(srmT === 1150, `Sahara invoiced tonnage 1,150 t (got ${srmT})`);

/* ───────────── Write JSON ───────────── */
const write = (name, data) => fs.writeFileSync(path.join(root, name), JSON.stringify(data, null, 2) + "\n");
write("purchase-orders.json", pos);
write("grns.json", grns);
write("invoices.json", invoices.sort((a, b) => a.id.localeCompare(b.id)));

/* ───────────── Scan HTML sources ───────────── */
const srcDir = path.join(root, "scans-src");
fs.mkdirSync(srcDir, { recursive: true });
const rendered = [];
for (const d of invoices) {
  if (!d.image) continue;
  const name = path.basename(d.image, ".png");
  const po = PO[d.poRef] ?? PO[KEY.CX6 === d ? "RBM-PO-26-04481" : d.poRef];
  const html = renderInvoiceHtml({ doc: d, supplier: SUP[d.supplierId], company: master.company, warehouses: master.warehouses, po, grns: grns.filter((g) => d.grnRefs.includes(g.id)) });
  fs.writeFileSync(path.join(srcDir, `${name}.html`), html);
  rendered.push(name);
}

const totals = invoices.reduce((a, d) => a + cents(d.total), 0);
console.log(`POs ${pos.length} · GRNs ${grns.length} · documents ${invoices.length} · batch value AED ${money(totals).toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
console.log("Scans:", rendered.join(", "));
