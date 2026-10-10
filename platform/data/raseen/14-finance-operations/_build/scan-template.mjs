// HTML template for the "scanned" supplier tax invoices of solution 14.
// Rendered to PNG with headless Chrome (see render.sh). Numbers come straight from invoices.json.

const fmt = (n) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQty = (q, unit) => (unit === "t" ? q.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : q.toLocaleString("en-US"));
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dmy = (iso) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
const dMonY = (iso) => {
  const [y, m, d] = iso.split("-");
  return `${d}-${MONTHS[Number(m) - 1]}-${y}`;
};
const stampDate = (iso) => {
  const [y, m, d] = iso.split("-");
  return `${d} ${MONTHS[Number(m) - 1].toUpperCase()} ${y}`;
};

/* ───────── amount in words ───────── */
const ONES = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
function words999(n) {
  const out = [];
  if (n >= 100) {
    out.push(`${ONES[Math.floor(n / 100)]} Hundred`);
    n %= 100;
  }
  if (n >= 20) {
    out.push(TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : ""));
  } else if (n > 0) out.push(ONES[n]);
  return out.join(" ");
}
function intWords(n) {
  if (n === 0) return "Zero";
  const parts = [];
  const scales = [
    [1e6, "Million"],
    [1e3, "Thousand"],
  ];
  for (const [v, name] of scales) {
    if (n >= v) {
      parts.push(`${words999(Math.floor(n / v))} ${name}`);
      n %= v;
    }
  }
  if (n) parts.push(words999(n));
  return parts.join(" ");
}
export function amountInWords(amount) {
  const a = Math.abs(amount);
  const dh = Math.floor(a + 1e-9);
  const fils = Math.round((a - dh) * 100);
  return `UAE Dirhams ${intWords(dh)}${fils ? ` and ${intWords(fils)} Fils` : ""} Only`;
}

/* ───────── visual pieces ───────── */
const GRAIN = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='320' height='320'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.36  0 0 0 0 0.33  0 0 0 0 0.28  0 0 0 0.10 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`;

function stampSvg({ en, ar, center1, center2, color, rotate = -12, size = 190 }) {
  const id = Math.random().toString(36).slice(2, 7);
  return `<svg class="stamp" width="${size}" height="${size}" viewBox="0 0 200 200" style="transform:rotate(${rotate}deg)">
  <defs>
    <path id="top${id}" d="M 28 100 A 72 72 0 0 1 172 100" />
    <path id="bot${id}" d="M 34 104 A 66 66 0 0 0 166 104" />
    <filter id="ink${id}"><feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="2" result="t"/><feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 1.35" result="m"/><feComposite in="SourceGraphic" in2="m" operator="in"/></filter>
  </defs>
  <g fill="none" stroke="${color}" filter="url(#ink${id})" opacity="0.82">
    <circle cx="100" cy="100" r="94" stroke-width="4"/>
    <circle cx="100" cy="100" r="86" stroke-width="1.6"/>
    <circle cx="100" cy="100" r="48" stroke-width="1.6"/>
    <g fill="${color}" stroke="none" font-family="Arial, sans-serif" font-weight="700">
      <text font-size="13.5" letter-spacing="1.2"><textPath href="#top${id}" startOffset="50%" text-anchor="middle">${en}</textPath></text>
      <text font-size="15" font-family="Tahoma, 'Segoe UI', sans-serif"><textPath href="#bot${id}" startOffset="50%" text-anchor="middle">${ar}</textPath></text>
      <text x="100" y="96" font-size="12" text-anchor="middle">${center1}</text>
      <text x="100" y="114" font-size="11" text-anchor="middle">${center2}</text>
      <text x="22" y="106" font-size="16">★</text><text x="164" y="106" font-size="16">★</text>
    </g>
  </g>
</svg>`;
}

function signatureSvg(seed, color = "#1d2c6b") {
  const paths = [
    "M10 58 C 30 10, 52 12, 48 52 S 70 80, 92 34 S 118 8, 112 50 C 108 74, 140 66, 160 30 C 170 14, 186 22, 178 44 C 172 60, 196 62, 228 40",
    "M8 50 C 22 20, 40 70, 58 36 C 70 14, 84 18, 80 48 C 78 64, 98 66, 112 38 S 150 18, 146 52 C 144 70, 170 58, 196 42 L 236 30",
    "M14 62 C 26 26, 36 22, 44 40 C 52 58, 60 66, 72 30 C 80 8, 96 12, 98 40 C 100 62, 120 60, 138 36 C 152 20, 168 30, 160 50 C 154 64, 186 54, 214 34",
  ];
  const d = paths[seed % paths.length];
  return `<svg class="sig" width="250" height="84" viewBox="0 0 250 84"><path d="${d}" fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/><path d="M40 70 C 90 64, 150 66, 210 60" fill="none" stroke="${color}" stroke-width="1.6" opacity="0.7"/></svg>`;
}

function receivedStamp(iso) {
  return `<div class="rcv">
    <div class="rcv-t">RASEEN BUILDING MATERIALS</div>
    <div class="rcv-b">ACCOUNTS PAYABLE — RECEIVED</div>
    <div class="rcv-d">${stampDate(iso)}</div>
    <div class="rcv-s">Sign: <span>DM</span> &nbsp; Batch: SEP-26</div>
  </div>`;
}

/* ───────── supplier letterheads ───────── */
const LOGOS = {
  "SUP-SRM": (c) => `<svg width="92" height="92" viewBox="0 0 92 92"><rect x="4" y="4" width="84" height="84" fill="${c}"/><path d="M4 66 C 26 50, 48 74, 88 52 L88 88 L4 88Z" fill="#f2d2b8" opacity=".55"/><g stroke="#fff" stroke-width="7"><line x1="22" y1="70" x2="46" y2="20"/><line x1="40" y1="70" x2="64" y2="20"/><line x1="58" y1="70" x2="82" y2="20"/></g></svg>`,
  "SUP-NEC": (c) => `<svg width="96" height="96" viewBox="0 0 96 96"><polygon points="48,4 88,26 88,70 48,92 8,70 8,26" fill="none" stroke="${c}" stroke-width="6"/><polygon points="48,18 76,34 76,62 48,78 20,62 20,34" fill="${c}"/><text x="48" y="57" font-family="Segoe UI, Arial" font-size="22" font-weight="700" fill="#fff" text-anchor="middle">NEC</text></svg>`,
  "SUP-ACT": (c) => `<svg width="96" height="96" viewBox="0 0 96 96"><g fill="none" stroke="${c}" stroke-width="3.5"><rect x="20" y="20" width="56" height="56"/><rect x="20" y="20" width="56" height="56" transform="rotate(45 48 48)"/><circle cx="48" cy="48" r="13"/></g><circle cx="48" cy="48" r="5" fill="${c}"/></svg>`,
  "SUP-GBP": (c) => `<svg width="92" height="92" viewBox="0 0 92 92"><rect width="92" height="92" fill="#141414"/><path d="M46 12 C 60 34, 70 46, 70 60 A24 24 0 0 1 22 60 C 22 46, 32 34, 46 12Z" fill="${c}"/><g stroke="#141414" stroke-width="3"><line x1="26" y1="58" x2="66" y2="58"/><line x1="25" y1="67" x2="67" y2="67"/><line x1="30" y1="76" x2="62" y2="76"/></g></svg>`,
  "SUP-AWB": (c) => `<svg width="96" height="96" viewBox="0 0 96 96"><g fill="${c}"><rect x="10" y="58" width="36" height="18"/><rect x="50" y="58" width="36" height="18"/><rect x="30" y="38" width="36" height="18"/></g><g fill="#fff"><rect x="16" y="62" width="9" height="10"/><rect x="31" y="62" width="9" height="10"/><rect x="56" y="62" width="9" height="10"/><rect x="71" y="62" width="9" height="10"/><rect x="36" y="42" width="9" height="10"/><rect x="51" y="42" width="9" height="10"/></g><path d="M48 36 C 46 22, 40 14, 30 10 M48 36 C 52 20, 60 14, 72 12 M48 36 C 44 26, 34 24, 24 26 M48 36 C 54 28, 64 26, 76 30" stroke="${c}" stroke-width="3.5" fill="none"/></svg>`,
  "SUP-CCI": (c) => `<svg width="96" height="96" viewBox="0 0 96 96"><circle cx="48" cy="48" r="42" fill="${c}"/><path d="M10 54 C 24 42, 36 42, 48 54 S 72 66, 86 54" stroke="#fff" stroke-width="6" fill="none"/><path d="M14 68 C 26 58, 38 58, 48 68 S 70 78, 82 68" stroke="#bfe3ee" stroke-width="5" fill="none"/><circle cx="62" cy="30" r="9" fill="#ffd27a"/></svg>`,
  "SUP-AKT": (c) => `<svg width="110" height="80" viewBox="0 0 110 80"><rect x="4" y="18" width="62" height="36" fill="#13294b"/><path d="M66 28 L88 28 L102 42 L102 54 L66 54Z" fill="${c}"/><rect x="74" y="32" width="14" height="10" fill="#fff"/><g fill="#13294b"><circle cx="22" cy="60" r="9"/><circle cx="44" cy="60" r="9"/><circle cx="88" cy="60" r="9"/></g><g fill="#fff"><circle cx="22" cy="60" r="3.5"/><circle cx="44" cy="60" r="3.5"/><circle cx="88" cy="60" r="3.5"/></g><text x="35" y="42" font-family="Trebuchet MS, Arial" font-size="15" font-weight="700" fill="#fff" text-anchor="middle">AKHT</text></svg>`,
  "SUP-FLL": () => ``,
};

const SUPPLIER_STYLE = {
  "SUP-SRM": {
    color: "#8a2b1d", font: "Arial, Helvetica, sans-serif", head: "Arial Black, Arial, sans-serif",
    lines: ["Plot 4B-17, Hamriyah Free Zone Phase 2, Sharjah, U.A.E. · P.O. Box 42718", "Tel +971 6 526 4410 · Fax +971 6 526 4411 · commercial@sahararebar.ae · www.sahararebar.ae"],
    bank: { name: "Gulf Union Bank PJSC — Sharjah Main Branch", acct: "Sahara Rebar Mills LLC", iban: "AE45 0410 0001 8427 6159 020", swift: "GUBPAEAS" },
    stamp: { center1: "HAMRIYAH FZ", center2: "SHARJAH - U.A.E.", color: "#2b3c94" }, sig: 0,
  },
  "SUP-NEC": {
    color: "#2d4a63", font: "'Segoe UI', Arial, sans-serif", head: "'Segoe UI', Arial, sans-serif",
    lines: ["Khor Khuwair Industrial Area, Ras Al Khaimah, U.A.E. · P.O. Box 6623", "Tel +971 7 266 8100 · sales@ne-cement.ae · Accounts: ar@ne-cement.ae"],
    bank: { name: "Al Sahel National Bank PJSC — RAK Branch", acct: "Northern Emirates Cement Co.", iban: "AE12 0270 0000 3182 7450 017", swift: "ASNBAEAK" },
    stamp: { center1: "RAS AL KHAIMAH", center2: "U.A.E.", color: "#5a2a86" }, sig: 1,
  },
  "SUP-ACT": {
    color: "#1f3352", accent: "#b25a35", font: "Georgia, 'Times New Roman', serif", head: "Georgia, serif",
    lines: ["Showroom 3, Al Quoz 1, Dubai · Warehouse: Al Quoz Industrial 4 · P.O. Box 118204, Dubai, U.A.E.", "T +971 4 347 2290 · accounts@andalusceramics.ae · andalusceramics.ae"],
    bank: { name: "Marsa Commercial Bank PJSC — Al Quoz", acct: "Andalus Ceramics Trading LLC", iban: "AE68 0360 0000 2590 3840 114", swift: "MCBPAEAD" },
    stamp: { center1: "DUBAI", center2: "U.A.E.", color: "#22408f" }, sig: 2,
  },
  "SUP-GBP": {
    color: "#d29a12", font: "Arial, Helvetica, sans-serif", head: "Arial Black, Arial, sans-serif",
    lines: ["Plot S20817, Jebel Ali Free Zone South, Dubai, U.A.E. · P.O. Box 263391", "Tel +971 4 881 5530 · finance@gulfbitumen.ae · www.gulfbitumen.ae"],
    bank: { name: "Al Noor Trade Bank PJSC — JAFZA", acct: "Gulf Bitumen Products FZCO", iban: "AE29 0510 0000 3927 1680 045", swift: "ANTBAEAA" },
    stamp: { center1: "JEBEL ALI FREE ZONE", center2: "DUBAI - U.A.E.", color: "#1d3a8a" }, sig: 0,
  },
  "SUP-AWB": {
    color: "#4f5d2f", font: "Tahoma, Verdana, sans-serif", head: "Tahoma, Verdana, sans-serif",
    lines: ["Plot MN-05-044-0012, Ras Al Marsa Industrial, Marsa Al Noor, U.A.E. · P.O. Box 7731", "Tel +971 2 557 3190 · Mob +971 50 612 4408 · accounts@alwahablocks.ae"],
    bank: { name: "Gulf Union Bank PJSC — Marsa Al Noor", acct: "Al Waha Blocks Factory LLC", iban: "AE81 0410 0000 1864 5270 033", swift: "GUBPAEAS" },
    stamp: { center1: "MARSA AL NOOR", center2: "U.A.E.", color: "#2f3f8f" }, sig: 1,
  },
  "SUP-CCI": {
    color: "#1b5e7a", font: "Calibri, 'Segoe UI', Arial, sans-serif", head: "Calibri, 'Segoe UI', sans-serif",
    lines: ["Umm Al Thuoob Industrial Area, Umm Al Quwain, U.A.E. · P.O. Box 2291", "Tel +971 6 768 1420 · orders@coastalcoatings.ae · www.coastalcoatings.ae"],
    bank: { name: "Al Sahel National Bank PJSC — UAQ", acct: "Coastal Coatings Industries LLC", iban: "AE53 0270 0000 4472 8160 021", swift: "ASNBAEAK" },
    stamp: { center1: "UMM AL QUWAIN", center2: "U.A.E.", color: "#22408f" }, sig: 2,
  },
  "SUP-AKT": {
    color: "#e0701f", font: "'Trebuchet MS', Arial, sans-serif", head: "'Trebuchet MS', Arial, sans-serif",
    lines: ["Plot 118, Mussafah Industrial, Abu Dhabi, U.A.E. · P.O. Box 92218", "Tel +971 2 553 9071 · billing@khaleejheavy.ae · Ops 24/7 +971 50 446 1290"],
    bank: { name: "Al Noor Trade Bank PJSC — Mussafah", acct: "Al Khaleej Heavy Transport LLC", iban: "AE07 0510 0000 5128 3940 016", swift: "ANTBAEAA" },
    stamp: { center1: "ABU DHABI", center2: "U.A.E.", color: "#1f3a8a" }, sig: 0,
  },
  "SUP-FLL": {
    color: "#1e5fbf", font: "Calibri, Arial, sans-serif", head: "Calibri, Arial, sans-serif",
    lines: ["Office 14, Al Qusais Industrial Area 2, Dubai", "Mob: +971 55 284 6631 · Email: fastlane.logistics.uae@gmail.com"],
    bank: { name: "Marsa Commercial Bank PJSC — Al Qusais", acct: "Arif Hussain — Fast Lane Logistics Services", iban: "AE96 0360 0000 7740 1293 551", swift: "MCBPAEAD" },
    stamp: { center1: "DUBAI", center2: "U.A.E.", color: "#3b2f8f" }, sig: 1,
  },
};

const HEAT = { "RB-B500-12": "H26-0911-2", "RB-B500-16": "H26-0914-3", "RB-B500-20": "H26-0902-1", "RB-B500-25": "H26-0827-4" };

export function renderInvoiceHtml({ doc, supplier, company, warehouses, po, grns }) {
  const st = SUPPLIER_STYLE[supplier.id];
  const c = st.color;
  const wh = warehouses.find((w) => w.id === (po?.warehouse ?? "JA"));
  const isFLL = supplier.id === "SUP-FLL";
  const rotation = { "SUP-SRM": -0.45, "SUP-NEC": 0.35, "SUP-ACT": -0.3, "SUP-GBP": 0.5, "SUP-AWB": -0.6, "SUP-CCI": 0.28, "SUP-AKT": -0.38, "SUP-FLL": 0.7 }[supplier.id];

  const logo = LOGOS[supplier.id](c);
  const rows = doc.lines
    .map((l, i) => {
      const desc =
        l.kind === "charge"
          ? `<b>${l.description}</b>`
          : `${l.description}${HEAT[l.sku] && supplier.id === "SUP-SRM" ? `<div class="sub">Heat no. ${HEAT[l.sku]} · mill cert. attached</div>` : ""}${supplier.id === "SUP-ACT" ? `<div class="sub">${l.unit === "m²" ? `${Math.round(l.qty / 1.44)} boxes × 1.44 m²` : "Model AC-WH-520 · white"}</div>` : ""}`;
      return `<tr>
        <td class="c">${i + 1}</td>
        <td class="code">${l.sku ?? "—"}</td>
        <td>${desc}</td>
        <td class="r">${fmtQty(l.qty, l.unit)}</td>
        <td class="c">${l.unit === "m²" ? "m²" : l.unit.toUpperCase()}</td>
        <td class="r">${fmt(l.unitPrice)}</td>
        <td class="r">${fmt(l.amount)}</td>
      </tr>`;
    })
    .join("");
  const fillerRows = Math.max(0, 5 - doc.lines.length);
  const filler = Array.from({ length: fillerRows }, () => `<tr class="empty"><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`).join("");

  const totals = [
    ["Sub-total", "المجموع الفرعي", fmt(doc.grossAmount)],
    ...(doc.discount ? [[`Less: ${doc.discount.label}`, "خصم", `(${fmt(doc.discount.amount)})`], ["Net amount", "المبلغ الصافي", fmt(doc.taxableAmount)]] : []),
    ["VAT @ 5%", "ضريبة القيمة المضافة", fmt(doc.vatAmount)],
  ]
    .map(([en, ar, v]) => `<tr><td class="tl">${en}<span class="ar"> ${ar}</span></td><td class="tv">${v}</td></tr>`)
    .join("");

  const dnLine = doc.deliveryNoteRefs.length ? doc.deliveryNoteRefs.join(", ") : "—";
  const grnLine = doc.grnRefs.length ? doc.grnRefs.join(", ") : null;

  const header = isFLL
    ? `<div class="fll-head">
         <div class="fll-name">FAST LANE LOGISTICS SERVICES</div>
         <div class="fll-ar">فاست لين للخدمات اللوجستية</div>
         <div class="fll-sub">Transport · Shuttle · Container moves — All UAE</div>
         ${st.lines.map((l) => `<div class="fll-line">${l}</div>`).join("")}
       </div>`
    : `<div class="lh" style="border-bottom:5px solid ${c}">
         <div class="logo">${logo}</div>
         <div class="lh-names">
           <div class="lh-en" style="color:${supplier.id === "SUP-GBP" ? "#141414" : c}">${supplier.name}</div>
           <div class="lh-ar">${supplier.nameAr}</div>
           ${st.lines.map((l) => `<div class="lh-line">${l}</div>`).join("")}
         </div>
         <div class="lh-trn">TRN<br/><b>${doc.trnOnInvoice ?? ""}</b></div>
       </div>`;

  const titleBar = `<div class="title" style="${isFLL ? "" : `background:${supplier.id === "SUP-GBP" ? "#141414" : c};color:#fff`}">
      <span class="t-ar">فاتورة ضريبية</span><span class="t-en">TAX INVOICE</span>
    </div>`;

  const meta = [
    ["Invoice No.", "رقم الفاتورة", `<b>${doc.supplierInvoiceNo}</b>`],
    ["Invoice Date", "تاريخ الفاتورة", supplier.id === "SUP-ACT" || supplier.id === "SUP-CCI" ? dMonY(doc.invoiceDate) : dmy(doc.invoiceDate)],
    ["Customer PO", "أمر الشراء", `<b>${doc.poRef}</b>`],
    ["Delivery Note", "إشعار التسليم", dnLine],
    ...(grnLine ? [["Your GRN", "إشعار الاستلام", grnLine]] : []),
    ["Payment Terms", "شروط الدفع", `${supplier.paymentTermsDays} days from invoice date`],
    ["Due Date", "تاريخ الاستحقاق", dmy(doc.dueDate)],
  ]
    .map(([en, ar, v]) => `<tr><td class="mk">${en} <span class="ar">${ar}</span></td><td class="mv">${v}</td></tr>`)
    .join("");

  const fllTrips = isFLL
    ? `<div class="trips"><b>Trip log (as per trip sheets):</b> 15/09 (2) · 16/09 (1) · 17/09 (2) · 18/09 (1) · 21/09 (2) · 22/09 (1) · 23/09 (2) · 24/09 (2) · 25/09 (1) — truck DXB L 11846, driver Shahzad.</div>`
    : "";

  const notes = {
    "SUP-SRM": "Weights as per mill despatch scale. Claims for shortage must be notified within 48 hours of delivery.",
    "SUP-NEC": "Prices ex our price agreement. Energy & fuel surcharge applied as per our letter ref. NEC/SALES/2026/208 dated 28/08/2026.",
    "SUP-ACT": doc.note ?? "Goods once sold will not be taken back. Please quote invoice number with remittance.",
    "SUP-GBP": "Volume discount 2% applied as per price agreement. Please remit to the account below quoting invoice number.",
    "SUP-AWB": "Kindly arrange payment within the agreed credit period. Delivery charges as per trips made.",
    "SUP-CCI": "Private-label manufacture for Raseen Building Materials — batch CCI-TS-2609-B3, COA enclosed.",
    "SUP-AKT": "Rates as per agreed rate card 2026. Trip sheets signed by consignee attached.",
    "SUP-FLL": "Payment by cheque or bank transfer. Thank you for your business!",
  }[supplier.id];

  const stamp = stampSvg({
    en: supplier.name.toUpperCase().replace(" LLC", " L.L.C").replace("CO.", "CO"),
    ar: supplier.nameAr,
    center1: st.stamp.center1,
    center2: st.stamp.center2,
    color: st.stamp.color,
    rotate: -10 - (supplier.id.charCodeAt(5) % 9),
  });

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><title>${doc.supplierInvoiceNo}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; width: 1240px; height: 1754px; overflow: hidden; background: #d9d6cf; }
  .page {
    position: absolute; left: 30px; top: 26px; width: 1180px; height: 1700px; background: #fbfaf6;
    transform: rotate(${rotation}deg); transform-origin: 50% 40%;
    box-shadow: 0 0 0 1px rgba(0,0,0,.05), 0 2px 10px rgba(0,0,0,.12);
    font-family: ${st.font}; color: #1d1d1b; font-size: 17px; padding: 56px 64px 40px;
  }
  .grain { position:absolute; inset:0; background-image:${GRAIN}; pointer-events:none; mix-blend-mode:multiply; opacity:.9; }
  .shade { position:absolute; inset:0; pointer-events:none; background: radial-gradient(ellipse at 50% 45%, rgba(255,255,255,0) 60%, rgba(120,110,95,.10) 100%); }
  .ar { font-family: Tahoma, 'Segoe UI', sans-serif; direction: rtl; }
  .lh { display:flex; align-items:center; gap:24px; padding-bottom:16px; }
  .lh-names { flex:1; }
  .lh-en { font-family:${st.head}; font-size:33px; font-weight:700; letter-spacing:.3px; }
  .lh-ar { font-family: Tahoma, 'Segoe UI', sans-serif; font-size:24px; font-weight:700; color:#333; direction:rtl; text-align:left; margin:2px 0 6px; }
  .lh-line { font-size:14.5px; color:#444; line-height:1.45; }
  .lh-trn { text-align:right; font-size:14px; color:#444; border:1.5px solid #bbb; padding:8px 12px; }
  .lh-trn b { font-size:18px; color:#111; letter-spacing:.5px; }
  .title { margin:22px 0 18px; padding:10px 18px; display:flex; justify-content:space-between; align-items:center; font-weight:700; }
  .t-en { font-size:28px; letter-spacing:4px; }
  .t-ar { font-family: Tahoma, 'Segoe UI', sans-serif; font-size:27px; }
  .blocks { display:flex; gap:26px; }
  .party { flex:1.15; border:1.5px solid #c9c6be; padding:14px 16px; font-size:16px; line-height:1.5; }
  .party .h { font-size:13px; text-transform:uppercase; letter-spacing:1.5px; color:#666; margin-bottom:4px; }
  .party .nm { font-weight:700; font-size:17.5px; }
  .meta { flex:1; border-collapse:collapse; font-size:15.5px; }
  .meta td { border:1.5px solid #c9c6be; padding:6px 10px; vertical-align:top; }
  .meta .mk { color:#555; width:47%; white-space:nowrap; }
  .meta .mk .ar { font-size:13px; color:#777; }
  table.items { width:100%; border-collapse:collapse; margin-top:24px; font-size:16px; }
  table.items th { background:${isFLL ? "#e8eef9" : supplier.id === "SUP-GBP" ? "#141414" : c}; color:${isFLL ? "#1e3a7a" : "#fff"}; padding:9px 8px; font-size:14px; text-align:left; border:1.5px solid ${isFLL ? "#9db3dd" : supplier.id === "SUP-GBP" ? "#141414" : c}; }
  table.items th .ar { display:block; font-size:12.5px; font-weight:400; opacity:.9; }
  table.items td { border:1.5px solid #c9c6be; padding:9px 8px; vertical-align:top; }
  table.items tr.empty td { height:38px; }
  .c { text-align:center; } .r { text-align:right; white-space:nowrap; }
  .code { font-family: Consolas, 'Courier New', monospace; font-size:14.5px; white-space:nowrap; }
  .sub { font-size:13px; color:#666; margin-top:2px; }
  .bottom { display:flex; gap:28px; margin-top:20px; }
  .words { flex:1.2; font-size:15.5px; line-height:1.55; }
  .words .lbl { font-size:13px; text-transform:uppercase; letter-spacing:1.4px; color:#666; }
  .tot { flex:1; border-collapse:collapse; font-size:16.5px; align-self:flex-start; }
  .tot td { border:1.5px solid #c9c6be; padding:7px 10px; }
  .tot .tl { color:#333; } .tot .tl .ar { font-size:13px; color:#777; }
  .tot .tv { text-align:right; white-space:nowrap; width:42%; }
  .tot tr.grand td { background:${isFLL ? "#e8eef9" : "#efece4"}; font-weight:700; font-size:19px; border-top:3px double #555; }
  .bank { margin-top:22px; border:1.5px dashed #bdb9b0; padding:12px 16px; font-size:15px; line-height:1.6; }
  .bank b { font-family: Consolas, 'Courier New', monospace; font-size:16px; letter-spacing:.5px; }
  .notes { margin-top:14px; font-size:14px; color:#555; line-height:1.5; }
  .sigrow { position:relative; margin-top:96px; display:flex; justify-content:space-between; align-items:flex-end; }
  .sigbox { width:380px; font-size:14.5px; color:#444; position:relative; }
  .sigbox .line { border-top:1.5px solid #555; padding-top:6px; }
  .sig { position:absolute; left:20px; bottom:30px; }
  .stamp { position:absolute; left:210px; bottom:-30px; }
  .recvbox { width:340px; font-size:14.5px; color:#444; position:relative; }
  .recvbox .line { border-top:1.5px solid #555; padding-top:6px; }
  .foot { position:absolute; left:64px; right:64px; bottom:40px; border-top:3px solid ${isFLL ? "#1e5fbf" : c}; padding-top:10px; font-size:13px; color:#555; display:flex; justify-content:space-between; }
  .rcv { position:absolute; right:18px; bottom:52px; border:3px solid #b3261e; color:#b3261e; padding:8px 14px; transform:rotate(-7deg); opacity:.78; font-family: 'Courier New', monospace; font-weight:700; text-align:center; letter-spacing:1px; background:transparent; }
  .rcv-t { font-size:13px; } .rcv-b { font-size:14px; border-bottom:2px solid #b3261e; padding-bottom:3px; margin-bottom:3px; } .rcv-d { font-size:24px; letter-spacing:2px; } .rcv-s { font-size:12px; margin-top:2px; }
  .rcv-s span { font-family: 'Segoe Script', 'Brush Script MT', cursive; font-size:18px; color:#1d2c6b; }
  .fll-head { border:2px solid #1e5fbf; padding:16px 20px; background:#f2f6fd; }
  .fll-name { font-size:34px; font-weight:700; color:#1e5fbf; letter-spacing:1px; }
  .fll-ar { font-family: Tahoma, sans-serif; font-size:22px; color:#1e3a7a; }
  .fll-sub { font-style:italic; color:#555; font-size:15px; margin:2px 0 6px; }
  .fll-line { font-size:15px; color:#333; }
  .trips { margin-top:12px; font-size:14px; color:#333; line-height:1.5; }
  .terms { position:absolute; left:64px; right:64px; bottom:96px; font-size:12.5px; color:#666; line-height:1.5; border-top:1px solid #d6d2c8; padding-top:8px; }
  .fold { position:absolute; left:0; right:0; top:566px; height:1px; background:rgba(0,0,0,.06); box-shadow: 0 1px 0 rgba(255,255,255,.6); }
</style></head>
<body>
<div class="page">
  ${header}
  ${titleBar}
  <div class="blocks">
    <div class="party">
      <div class="h">Bill to · فاتورة إلى</div>
      <div class="nm">${company.name}</div>
      <div class="ar" style="text-align:left">${company.nameAr}</div>
      <div>${company.address}</div>
      <div>TRN: <b>${company.trn}</b></div>
      <div style="margin-top:6px"><span class="h">Deliver to:</span> ${wh ? `RBM ${wh.name} — ${wh.address}` : ""}</div>
    </div>
    <table class="meta">${meta}</table>
  </div>
  <table class="items">
    <thead><tr>
      <th style="width:44px">#</th><th style="width:150px">Item code<span class="ar">رمز الصنف</span></th><th>Description<span class="ar">الوصف</span></th>
      <th style="width:120px;text-align:right">Qty<span class="ar">الكمية</span></th><th style="width:70px">Unit<span class="ar">الوحدة</span></th>
      <th style="width:120px;text-align:right">Rate (AED)<span class="ar">السعر</span></th><th style="width:150px;text-align:right">Amount (AED)<span class="ar">المبلغ</span></th>
    </tr></thead>
    <tbody>${rows}${filler}</tbody>
  </table>
  ${fllTrips}
  <div class="bottom">
    <div class="words">
      <div class="lbl">Amount in words · المبلغ كتابةً</div>
      <div><b>${amountInWords(doc.total)}</b></div>
      <div class="notes">${notes}</div>
    </div>
    <table class="tot">${totals}<tr class="grand"><td class="tl">TOTAL AED<span class="ar"> الإجمالي</span></td><td class="tv">${fmt(doc.total)}</td></tr></table>
  </div>
  <div class="bank">
    Bank: ${st.bank.name}<br/>Account name: ${st.bank.acct}<br/>IBAN: <b>${st.bank.iban}</b> &nbsp;·&nbsp; SWIFT: <b>${st.bank.swift}</b> &nbsp;·&nbsp; Currency: AED
  </div>
  <div class="sigrow">
    <div class="sigbox">${signatureSvg(st.sig)}${isFLL ? "" : stamp}<div class="line">For ${supplier.name}<br/>Authorised Signatory · التوقيع المعتمد</div></div>
    <div class="recvbox">${doc.receivedDate ? receivedStamp(doc.receivedDate) : ""}<div class="line">Received by (name, sign &amp; stamp)<br/>المستلم</div></div>
  </div>
  ${isFLL ? "" : `<div class="terms"><b>Terms &amp; conditions</b> — 1. Title to the goods passes on full payment. 2. Discrepancies must be notified in writing within 48 hours of delivery, quoting the delivery note. 3. Late payment may attract suspension of credit. 4. This is a tax invoice issued under UAE Federal Decree-Law No. 8 of 2017 on VAT.</div>`}
  <div class="foot">
    <span>${isFLL ? "Fast Lane Logistics Services · Al Qusais, Dubai" : `${supplier.name} · TRN ${doc.trnOnInvoice}`}</span>
    <span>Page 1 of 1</span>
  </div>
  <div class="fold"></div>
  <div class="grain"></div><div class="shade"></div>
</div>
</body></html>`;
}
