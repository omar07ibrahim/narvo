// Seed generator for solution 16 — Order Fulfilment & Exception Intelligence (Raseen Group).
// Run from the platform root:  node data/raseen/16-order-exceptions/_source/generate.mjs
// Prices, limits, AR and contract rates are read from the master file; this script only writes
// order-level facts (what was entered on each order) and checks the data set is internally consistent.

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "data/raseen/16-order-exceptions");
const master = JSON.parse(fs.readFileSync(path.join(ROOT, "data/raseen/knowledge/reference/raseen-master.json"), "utf8"));

const cust = Object.fromEntries(master.customers.map((c) => [c.id, c]));
const prod = Object.fromEntries(master.products.map((p) => [p.sku, p]));
const contracts = Object.fromEntries(master.contracts.map((c) => [c.customerId, c]));

const MQ = "MN-08 Marina Quarter";
const LULU = "MN-03 Al Lulu Island";
const SIDR = "MN-06 Al Sidr Residential";
const OTHER = "Other Marsa Al Noor districts";
const DXB = "Dubai sites";

// Contacts per customer (site / procurement) used for notifications.
const CONTACTS = {
  "RBM-C-10021": { name: "Mohammed Bin Hilal", role: "Managing Partner", email: "m.binhilal@binhilalcontracting.ae", mobile: "+971 50 337 1180", channel: "email" },
  "RBM-C-10034": { name: "Imran Qureshi", role: "Procurement Manager", email: "imran.qureshi@gulfcrest.ae", mobile: "+971 50 336 7182", channel: "email" },
  "RBM-C-10047": { name: "Eng. Hisham Darwish", role: "Procurement Director", email: "h.darwish@apcc.ae", mobile: "+971 50 662 9047", channel: "email" },
  "RBM-C-10052": { name: "Eng. Salem Al Marri", role: "Projects Manager", email: "salem.almarri@almarsa-eng.ae", mobile: "+971 50 118 4426", channel: "email" },
  "RBM-C-10068": { name: "Deepa Varghese", role: "Commercial Manager", email: "deepa.v@emeraldline.ae", mobile: "+971 52 774 0193", channel: "email" },
  "RBM-C-10073": { name: "Saqr Rashid Al Noori", role: "Owner", email: "saqr@saqralnoor.ae", mobile: "+971 50 921 7735", channel: "whatsapp" },
  "RBM-C-10105": { name: "Lina Haddad", role: "Project Coordinator", email: "lina@alfayhafitout.ae", mobile: "+971 56 410 2287", channel: "email" },
  "RBM-C-10118": { name: "Capt. Rakesh Nair", role: "Site Manager", email: "rakesh.n@coastlinemarine.ae", mobile: "+971 50 845 3361", channel: "email" },
  "RBM-C-10126": { name: "Obaid Al Shamsi", role: "Owner", email: "najmalsahil.bc@gmail.com", mobile: "+971 50 603 4418", channel: "whatsapp" },
  "RBM-C-10139": { name: "Arvind Menon", role: "Plant Manager", email: "arvind.m@rampi.ae", mobile: "+971 55 391 7720", channel: "email" },
  "RBM-C-10144": { name: "Hassan Fakhro", role: "Owner", email: "desertrose.villas@gmail.com", mobile: "+971 52 618 0049", channel: "whatsapp" },
  "RBM-C-10152": { name: "Khalifa Al Ketbi", role: "Site Supervisor", email: "baytalreef.bc@gmail.com", mobile: "+971 50 274 9913", channel: "whatsapp" },
  "RBM-C-10167": { name: "Sameer Kulkarni", role: "MEP Project Manager", email: "sameer.k@horizonridge.ae", mobile: "+971 55 902 6614", channel: "email" },
  "RBM-C-10171": { name: "Reem Khalil", role: "Design Manager", email: "reem@sidraline.ae", mobile: "+971 50 731 2290", channel: "email" },
  "RBM-C-10183": { name: "Faisal Ahmed", role: "Operations Manager", email: "ops@alruwaisroofing.ae", mobile: "+971 50 488 1207", channel: "whatsapp" },
  "RBM-C-10196": { name: "Eng. Tarek Fawzi", role: "Project Engineer", email: "tarek.f@alseefeng.ae", mobile: "+971 56 207 8843", channel: "email" },
  "RBM-C-10204": { name: "Ali Al Mazmi", role: "Owner", email: "nooralwaha.gc@gmail.com", mobile: "+971 50 559 0372", channel: "whatsapp" },
  "RBM-C-10219": { name: "Rajesh Pillai", role: "Purchase Manager", email: "purchase@albarshabm.ae", mobile: "+971 50 166 4598", channel: "email" },
  "RBM-C-10227": { name: "Mansour Al Hajeri", role: "Owner", email: "qasralsahra.c@gmail.com", mobile: "+971 50 812 3306", channel: "whatsapp" },
  "RBM-C-10235": { name: "Irfan Siddiqui", role: "Operations Manager", email: "irfan@aljazeeraroofing.ae", mobile: "+971 55 663 1902", channel: "whatsapp" },
  "RBM-C-10242": { name: "Eng. Karim Saab", role: "Package Manager", email: "k.saab@sandstoneinfra.ae", mobile: "+971 50 290 5517", channel: "email" },
  "RBM-C-10258": { name: "Eng. Nasser Bukhari", role: "Construction Manager", email: "n.bukhari@twoseasmarine.ae", mobile: "+971 50 447 2631", channel: "email" },
  "RBM-C-10263": { name: "Joby Thomas", role: "Procurement Officer", email: "procurement@sharqalemarat.ae", mobile: "+971 56 118 0427", channel: "email" },
  "RBM-C-10271": { name: "Rashid Al Zaabi", role: "Owner", email: "alhamra.tiling@gmail.com", mobile: "+971 50 377 6620", channel: "whatsapp" },
};

// l(sku, qty, unitPrice, deliveredQty?)
const l = (sku, qty, unitPrice, deliveredQty = 0) => ({ sku, qty, unitPrice, deliveredQty });

// Orders in creation order. Prices are as ENTERED on the order (customer PO price or desk price).
const ORDERS = [
  ["SO-26-11758", "2026-09-21T09:14", "RBM-C-10242", "SAND/PO/26/0412", "Marsa Al Noor Ring Road — Package 2 box culverts", "Ring Road Package 2, chainage 4+300", "MN-05 Ras Al Marsa Industrial", OTHER, "MN05", "2026-10-13T07:30", "2026-10-13", [l("RB-B500-25", 96, 2775, 72)], "partially_delivered", "Three drops of 24 t delivered 30 Sep – 7 Oct. Last drop 24 t."],
  ["SO-26-11763", "2026-09-21T15:02", "RBM-C-10021", "BHC-PO-2026-1188", "Al Quoz Logistics Park — Warehouse W4", "Plot 368-1142, Al Quoz Industrial 4", "Al Quoz Industrial 4, Dubai", DXB, "JA", "2026-10-12T07:00", "2026-10-12", [l("CEM-OPC-50", 1800, 16.2, 1200), l("BLK-HOL-20", 14400, 3.8, 9000)], "partially_delivered", "Balance cement 600 bags + blocks 5,400 pcs."],
  ["SO-26-11769", "2026-09-22T10:40", "RBM-C-10047", "APCC/PO/26/3207", "Corniche Road Extension — box culvert BC-3", "Corniche Road Extension, BC-3 laydown", "MN-01 Downtown", OTHER, "MN05", "2026-10-13T07:00", "2026-10-13", [l("CEM-SRC-50", 2400, 18.3, 1600), l("RB-B500-20", 26, 2715, 26)], "partially_delivered", "Rebar complete. SRC balance 800 bags."],
  ["SO-26-11774", "2026-09-23T11:25", "RBM-C-10068", "ELC-PO-26-0871", "Jumeirah Village Triangle townhouses — cluster 7 fit-out", "JVT District 7, cluster 7", "Jumeirah Village Triangle, Dubai", DXB, "JA", "2026-10-14T10:00", "2026-10-14", [l("TIL-CER-3060", 1240, 29.8), l("SAN-WC-WH", 46, 1180)], "open", ""],
  ["SO-26-11778", "2026-09-24T09:05", "RBM-C-10105", "AFF-0926-22", "Business Bay office fit-out — Level 22", "Bay Square Tower 3, Business Bay", "Business Bay, Dubai", DXB, "JA", "2026-10-15T09:30", "2026-10-15", [l("TIL-POR-60120", 410, 62.72), l("SAN-WC-WH", 12, 1240)], "open", "City-centre site — truck restrictions apply."],
  ["SO-26-11782", "2026-09-25T08:50", "RBM-C-10118", "CMW/PO/2026/0335", "Marina Quarter breakwater — revetment toe beam", "Marina Quarter breakwater, gate 2", "MN-08 Marina Quarter", MQ, "MN05", "2026-10-13T10:00", "2026-10-13", [l("CEM-SRC-50", 1500, 19.3), l("WPF-BIT-4", 60, 96)], "open", "Gate permit to be booked by dispatch."],
  ["SO-26-11788", "2026-09-25T13:30", "RBM-C-10047", "APCC/PO/26/3244", "Ras Al Marsa Industrial — precast yard extension", "Plot MN-05-018-0003", "MN-05 Ras Al Marsa Industrial", OTHER, "MN05", "2026-10-12T07:00", "2026-10-12", [l("RB-B500-16", 40, 2725)], "ready", "Loaded on 2 trailers, staged in MN-05 yard bay R3."],
  ["SO-26-11791", "2026-09-26T10:12", "RBM-C-10139", "RAMPI-PO-7716", "Precast plant — hollow-core slab line", "Ras Al Marsa Precast, plant gate B", "MN-05 Ras Al Marsa Industrial", OTHER, "MN05", "2026-10-12T08:00", "2026-10-12", [l("CEM-OPC-50", 2400, 17.07), l("RB-B500-12", 18, 2808)], "ready", ""],
  ["SO-26-11795", "2026-09-27T09:41", "RBM-C-10052", "AME-PO-26-0592", "Al Waha Gardens — 14 citizens' villas", "Plots MN-04-117-0021 to 0034", "MN-04 Al Waha Gardens", OTHER, "MN05", "2026-10-13T07:30", "2026-10-13", [l("BLK-HOL-20", 21600, 3.92, 10800), l("CEM-OPC-50", 1200, 16.7)], "partially_delivered", "Blocks in two drops; second drop with cement."],
  ["SO-26-11799", "2026-09-28T14:18", "RBM-C-10183", "ARR-2609-44", "Al Murjan villas — roof waterproofing (housing maintenance grants)", "Al Murjan, sector 2 villas", "MN-02 Al Murjan", OTHER, "MN05", "2026-10-14T07:00", "2026-10-14", [l("WPF-BIT-4", 140, 93.5)], "open", ""],
  ["SO-26-11801", "2026-09-29T08:33", "RBM-C-10139", "RAMPI-PO-7731", "Precast plant — stair & parapet units", "Ras Al Marsa Precast, plant gate B", "MN-05 Ras Al Marsa Industrial", OTHER, "MN05", "2026-10-12T07:00", "2026-10-12", [l("RB-B500-16", 24, 2760)], "ready", ""],
  ["SO-26-11806", "2026-09-30T09:20", "RBM-C-10118", "CMW/PO/2026/0342", "Marina Quarter — pontoon abutments (first pour)", "Marina Quarter breakwater, gate 2", "MN-08 Marina Quarter", MQ, "MN05", "2026-10-12T10:00", "2026-10-12", [l("CEM-OPC-50", 420, 17.1)], "ready", "Gate permit MQP-GP-26-18837 booked by dispatch."],
  ["SO-26-11809", "2026-09-30T16:05", "RBM-C-10144", "DRV-118", "Al Barsha South — villa G+1 (plot 673-0412)", "Plot 673-0412, Al Barsha South 3", "Al Barsha South, Dubai", DXB, "JA", "2026-10-14T07:00", "2026-10-14", [l("BLK-HOL-20", 7200, 4.07), l("CEM-OPC-50", 480, 17.25)], "open", ""],
  ["SO-26-11813", "2026-10-01T08:47", "RBM-C-10021", "BHC-PO-2026-1203", "Jebel Ali labour accommodation — Block D", "Jebel Ali Industrial 1, plot 597-0718", "Jebel Ali, Dubai", DXB, "JA", "2026-10-13T07:00", "2026-10-13", [l("RB-B500-16", 52, 2735), l("RB-B500-12", 20, 2780)], "ready", ""],
  ["SO-26-11815", "2026-10-01T11:02", "RBM-C-10047", "APCC/PO/26/3318", "Ring Road Interchange 4 — pier caps", "Interchange 4, pier caps P7–P12", "MN-07 Al Ghaf Community", OTHER, "MN05", "2026-10-15T07:00", "2026-10-15", [l("RB-B500-12", 30, 2730), l("CEM-OPC-50", 900, 16.05)], "open", "Entered from APCC PO — rebar rate copied from PO."],
  ["SO-26-11817", "2026-10-02T09:15", "RBM-C-10204", "NAW-0210", "Al Waha Gardens — 3 citizens' villas (housing grant)", "Plots MN-04-121-0007 to 0009", "MN-04 Al Waha Gardens", OTHER, "MN05", "2026-10-14T08:00", "2026-10-14", [l("BLK-HOL-20", 9000, 4.1), l("CEM-OPC-50", 600, 17.3)], "open", ""],
  ["SO-26-11820", "2026-10-02T13:40", "RBM-C-10171", "SLI-26-140", "Al Sidr Residential — show villa S-118 fit-out", "Villa S-118, Al Sidr Residential", "MN-06 Al Sidr Residential", SIDR, "MN05", "2026-10-15T10:00", "2026-10-15", [l("TIL-POR-60120", 260, 62.8), l("TIL-CER-3060", 180, 31.5)], "open", "Contractor pass held by Sidra Line."],
  ["SO-26-11823", "2026-10-03T08:22", "RBM-C-10196", "ASE-PO-1093", "Dubai Industrial City — steel warehouse slab", "DIC plot 532-0164", "Dubai Industrial City, Dubai", DXB, "JA", "2026-10-14T07:00", "2026-10-14", [l("RB-B500-12", 14, 2800), l("CEM-OPC-50", 1200, 17)], "open", ""],
  ["SO-26-11826", "2026-10-03T10:55", "RBM-C-10271", "AHT-77", "Dubai Hills apartments — lobby flooring", "Dubai Hills, building 4B", "Dubai Hills, Dubai", DXB, "JA", "2026-10-16T08:00", "2026-10-16", [l("TIL-POR-60120", 520, 62.72)], "open", ""],
  ["SO-26-11829", "2026-10-04T09:10", "RBM-C-10219", "ABBM-PO-4471", "Stock replenishment — Al Barsha yard", "Al Barsha 2 yard, plot 375-0219", "Al Barsha, Dubai", DXB, "JA", "2026-10-13T07:00", "2026-10-13", [l("CEM-OPC-50", 3000, 16.6), l("BLK-HOL-20", 4500, 4.05)], "open", "Cement price keyed from customer PO (volume deal requested by phone)."],
  ["SO-26-11831", "2026-10-04T12:30", "RBM-C-10227", "QAS-L27", "Al Lulu Island — villa L-27", "Villa L-27, Al Lulu Island", "MN-03 Al Lulu Island", LULU, "MN05", "2026-10-15T09:00", "2026-10-15", [l("CEM-OPC-50", 360, 17.6), l("BLK-HOL-20", 4800, 4.15), l("WPF-BIT-4", 24, 96)], "open", "Gate pass via Lulu Island Developments portal."],
  ["SO-26-11834", "2026-10-05T08:15", "RBM-C-10258", "TSM-PO-26-218", "Marsa Al Noor fishing harbour — quay wall", "Fishing harbour, quay wall section Q2", "MN-01 Downtown", OTHER, "MN05", "2026-10-13T07:00", "2026-10-13", [l("RB-B500-20", 22, 2731)], "open", ""],
  ["SO-26-11837", "2026-10-05T11:48", "RBM-C-10068", "ELC-PO-26-0912", "Dubai Hills villas — kitchens & bathrooms (phase 2)", "Dubai Hills Estate, villas 51–66", "Dubai Hills, Dubai", DXB, "JA", "2026-10-16T09:00", "2026-10-16", [l("TIL-POR-60120", 850, 64), l("TIL-CER-3060", 320, 29.8)], "open", "Porcelain keyed at list price by order desk."],
  ["SO-26-11840", "2026-10-05T15:20", "RBM-C-10263", "SAE/PO/26/0618", "Dubai South — staff housing blocks C & D", "Dubai South, residential district plot 41", "Dubai South, Dubai", DXB, "JA", "2026-10-16T07:00", "2026-10-16", [l("RB-B500-16", 18, 2750), l("CEM-OPC-50", 900, 17.05)], "open", ""],
  ["SO-26-11842", "2026-10-06T10:37", "RBM-C-10034", "GCB-PO-26-0937", "Marina Quarter Tower A — podium slab L2", "Marina Quarter Tower A, gate 3", "MN-08 Marina Quarter", MQ, "MN05", "2026-10-12T07:00", "2026-10-12", [l("RB-B500-16", 120, 2690)], "credit_hold", "Entered at customer PO price AED 2,690/t. ERP auto credit hold on entry. Pour of podium slab L2 planned Tue 13 Oct."],
  ["SO-26-11845", "2026-10-06T14:12", "RBM-C-10235", "AJR-2610-09", "Al Sidr Residential — roof membranes, villas S-201 to S-212", "Villas S-201 to S-212, Al Sidr Residential", "MN-06 Al Sidr Residential", SIDR, "MN05", "2026-10-17T08:00", "2026-10-17", [l("WPF-BIT-4", 48, 94.1)], "open", ""],
  ["SO-26-11848", "2026-10-07T08:30", "RBM-C-10021", "BHC-PO-2026-1219", "Al Quoz Logistics Park — Warehouse W5", "Plot 368-1143, Al Quoz Industrial 4", "Al Quoz Industrial 4, Dubai", DXB, "JA", "2026-10-19T07:00", "2026-10-19", [l("CEM-OPC-50", 2400, 16.2), l("TIL-CER-3060", 600, 28.6)], "open", ""],
  ["SO-26-11850", "2026-10-07T10:05", "RBM-C-10167", "HRM-PO-0388", "Marina Quarter Residences Tower C — washrooms L5–L12", "Marina Quarter Residences, Tower C service gate", "MN-08 Marina Quarter", MQ, "MN05", "2026-10-18T08:00", "2026-10-18", [l("SAN-WC-WH", 64, 1215)], "open", "Customer wants delivery while installers are on site."],
  ["SO-26-11853", "2026-10-07T13:22", "RBM-C-10052", "AME-PO-26-0618", "Al Waha Gardens — boundary walls & majlis", "Plots MN-04-117-0021 to 0034", "MN-04 Al Waha Gardens", OTHER, "MN05", "2026-10-15T07:00", "2026-10-15", [l("CEM-SRC-50", 800, 18.95), l("TIL-CER-3060", 240, 29.4)], "open", ""],
  ["SO-26-11856", "2026-10-07T16:40", "RBM-C-10126", "NAS-0710", "Al Warqa — G+1 villa (plot 412-0388)", "Plot 412-0388, Al Warqa 4", "Al Warqa, Dubai", DXB, "JA", "2026-10-13T07:00", "2026-10-13", [l("BLK-HOL-20", 5400, 4.15), l("CEM-OPC-50", 300, 17.6)], "credit_hold", "Auto credit hold. Overdue AED 52,300 (31–60 days)."],
  ["SO-26-11859", "2026-10-08T08:10", "RBM-C-10118", "CMW/PO/2026/0351", "Marina Quarter — pontoon abutments", "Marina Quarter breakwater, gate 2", "MN-08 Marina Quarter", MQ, "MN05", "2026-10-20T09:30", "2026-10-20", [l("CEM-SRC-50", 900, 19.3)], "open", ""],
  ["SO-26-11861", "2026-10-08T09:35", "RBM-C-10152", "BAR-2610", "Al Murjan — citizens' villa extension", "Plot MN-02-044-0016, Al Murjan", "MN-02 Al Murjan", OTHER, "MN05", "2026-10-14T07:00", "2026-10-14", [l("RB-B500-16", 14, 2790), l("CEM-OPC-50", 240, 17.6)], "open", "Ground-floor slab pour planned Thu 15 Oct."],
  ["SO-26-11864", "2026-10-08T11:50", "RBM-C-10242", "SAND/PO/26/0447", "Marsa Al Noor Ring Road — Package 2 headwalls", "Ring Road Package 2, chainage 4+300", "MN-05 Ras Al Marsa Industrial", OTHER, "MN05", "2026-10-16T07:00", "2026-10-16", [l("RB-B500-25", 20, 2775), l("CEM-SRC-50", 1200, 19.1)], "open", ""],
  ["SO-26-11866", "2026-10-08T14:25", "RBM-C-10183", "ARR-2610-12", "Al Lulu Island Villas Phase 2 — roof waterproofing", "Lulu Island Villas Phase 2, cluster C", "MN-03 Al Lulu Island", LULU, "MN05", "2026-10-17T08:00", "2026-10-17", [l("WPF-BIT-4", 96, 93.5)], "open", "Applicator crew booked for Saturday."],
  ["SO-26-11869", "2026-10-08T16:02", "RBM-C-10073", "SANC-PO-26-077", "Ras Al Marsa — service road & culverts", "Service road SR-2, Ras Al Marsa Industrial", "MN-05 Ras Al Marsa Industrial", OTHER, "MN05", "2026-10-15T07:00", "2026-10-15", [l("RB-B500-20", 18, 2780), l("CEM-SRC-50", 600, 19.1)], "credit_hold", "Auto credit hold on entry. Terms reduced to 30 days in July 2026."],
  ["SO-26-11872", "2026-10-09T08:25", "RBM-C-10021", "BHC-PO-2026-1231", "Business Bay residential tower — basement raft", "Plot 346-0827, Business Bay", "Business Bay, Dubai", DXB, "JA", "2026-10-13T06:00", "2026-10-13", [l("CEM-OPC-50", 1500, 16.2), l("RB-B500-12", 24, 2780)], "open", "Raft pour starts 06:30; site asked for a 06:00 drop."],
  ["SO-26-11874", "2026-10-09T10:10", "RBM-C-10196", "ASE-PO-1107", "Al Quoz — fabrication shed", "Al Quoz Industrial 3, plot 365-0904", "Al Quoz Industrial 3, Dubai", DXB, "JA", "2026-10-19T08:00", "2026-10-19", [l("BLK-HOL-20", 3600, 4.01), l("WPF-BIT-4", 30, 92.7)], "open", ""],
  ["SO-26-11876", "2026-10-09T11:45", "RBM-C-10258", "TSM-PO-26-224", "Marsa Al Noor fishing harbour — fender plinths", "Fishing harbour, quay wall section Q3", "MN-01 Downtown", OTHER, "MN05", "2026-10-19T07:00", "2026-10-19", [l("CEM-SRC-50", 700, 19.25)], "open", ""],
  ["SO-26-11878", "2026-10-09T13:30", "RBM-C-10047", "APCC/PO/26/3351", "Corniche Road Extension — utilities duct bank", "Corniche Road Extension, chainage 1+150", "MN-01 Downtown", OTHER, "MN05", "2026-10-20T07:00", "2026-10-20", [l("CEM-OPC-50", 1800, 16.05), l("BLK-HOL-20", 6000, 3.78)], "open", ""],
  ["SO-26-11879", "2026-10-09T15:55", "RBM-C-10144", "DRV-121", "Al Barsha South — villa G+1 wet areas", "Plot 673-0412, Al Barsha South 3", "Al Barsha South, Dubai", DXB, "JA", "2026-10-21T09:00", "2026-10-21", [l("TIL-CER-3060", 220, 30.9)], "open", ""],
];

const CITY_CENTRE = new Set(["Business Bay, Dubai"]);
const GATE_PERMITS = {
  "SO-26-11806": { ref: "MQP-GP-26-18837", date: "2026-10-12", bookedOn: "2026-10-07" },
  "SO-26-11842": { ref: "MQP-GP-26-18842", date: "2026-10-12", bookedOn: "2026-10-08" },
};

const orders = ORDERS.map(([id, createdAt, customerId, customerPo, project, site, district, zone, shipFrom, requested, promise, lines, status, notes]) => {
  const c = cust[customerId];
  if (!c) throw new Error(`Unknown customer ${customerId}`);
  return {
    id,
    createdAt: `${createdAt}:00+04:00`,
    customerId,
    customerName: c.name,
    customerPo,
    project,
    site,
    district,
    zone,
    cityCentre: CITY_CENTRE.has(district) || undefined,
    shipFrom,
    requestedDelivery: requested,
    promiseDate: promise,
    status,
    kam: c.kam,
    contact: CONTACTS[customerId],
    gatePermit: GATE_PERMITS[id] ?? null,
    lines: lines.map((x, i) => ({ lineNo: i + 1, sku: x.sku, qty: x.qty, unit: prod[x.sku].unit, unitPrice: x.unitPrice, deliveredQty: x.deliveredQty })),
    notes,
  };
});

// Gulf Crest's project director sends the Tower A call-offs by WhatsApp (contacts aligned with solution 08).
orders.find((o) => o.id === "SO-26-11842").siteContact = {
  name: "Eng. Sultan Al Mehairi",
  role: "Project Director, Marina Quarter Towers",
  email: "sultan.almehairi@gulfcrest.ae",
  mobile: "+971 50 128 4406",
  channel: "whatsapp",
};

/* ───────────── Stock as of Fri 9 Oct 2026 (end of day) ───────────── */
const stock = {
  asOf: "2026-10-09T18:00:00+04:00",
  note: "On hand per warehouse at end of day Fri 9 Oct 2026 (after the day's dispatches). Reserved = not available to promise (QC hold, offcuts, damaged).",
  items: [
    { sku: "RB-B500-12", warehouse: "JA", onHand: 186.4, reserved: 0 },
    { sku: "RB-B500-12", warehouse: "MN05", onHand: 74.2, reserved: 0 },
    { sku: "RB-B500-16", warehouse: "JA", onHand: 116, reserved: 8, reservedReason: "Short-length offcuts (6–9 m) — not saleable as 12 m bars" },
    { sku: "RB-B500-16", warehouse: "MN05", onHand: 140.5, reserved: 12.5, reservedReason: "QC hold — mill certificate for heat SRM-26-4471 pending" },
    { sku: "RB-B500-20", warehouse: "JA", onHand: 9.5, reserved: 3.5, reservedReason: "Bent bars from yard handling — inspection" },
    { sku: "RB-B500-20", warehouse: "MN05", onHand: 30, reserved: 0 },
    { sku: "RB-B500-25", warehouse: "JA", onHand: 142.3, reserved: 0 },
    { sku: "RB-B500-25", warehouse: "MN05", onHand: 58, reserved: 0 },
    { sku: "CEM-OPC-50", warehouse: "JA", onHand: 16240, reserved: 120, reservedReason: "Torn bags — write-off pending" },
    { sku: "CEM-OPC-50", warehouse: "MN05", onHand: 11640, reserved: 0 },
    { sku: "CEM-SRC-50", warehouse: "JA", onHand: 2360, reserved: 0 },
    { sku: "CEM-SRC-50", warehouse: "MN05", onHand: 8120, reserved: 0 },
    { sku: "BLK-HOL-20", warehouse: "JA", onHand: 38700, reserved: 450, reservedReason: "Chipped blocks — return to factory" },
    { sku: "BLK-HOL-20", warehouse: "MN05", onHand: 41850, reserved: 0 },
    { sku: "TIL-POR-60120", warehouse: "JA", onHand: 2736, reserved: 0 },
    { sku: "TIL-POR-60120", warehouse: "MN05", onHand: 1152, reserved: 0 },
    { sku: "TIL-CER-3060", warehouse: "JA", onHand: 3456, reserved: 0 },
    { sku: "TIL-CER-3060", warehouse: "MN05", onHand: 864, reserved: 0 },
    { sku: "SAN-WC-WH", warehouse: "JA", onHand: 84, reserved: 2, reservedReason: "Damaged cisterns — supplier claim" },
    { sku: "SAN-WC-WH", warehouse: "MN05", onHand: 78, reserved: 0 },
    { sku: "WPF-BIT-4", warehouse: "JA", onHand: 268, reserved: 0 },
    { sku: "WPF-BIT-4", warehouse: "MN05", onHand: 412, reserved: 0 },
    { sku: "PNT-TS-20", warehouse: "JA", onHand: 0, reserved: 0 },
    { sku: "PNT-TS-20", warehouse: "MN05", onHand: 0, reserved: 0 },
  ],
};

/* ───────────── Inbound purchase orders ───────────── */
const inbound = {
  asOf: "2026-10-09",
  alternativeSources: [
    {
      supplier: "Al Dhafra Steel Trading LLC",
      trn: "100583027400003",
      skus: ["RB-B500-12", "RB-B500-16", "RB-B500-20", "RB-B500-25"],
      premiumPerT: 165,
      leadWorkingDays: 3,
      origin: "Ex-stock Mussafah",
      approval: "Supply Chain & Planning Manager (Joseph Abraham)",
      source: "RBM-SUP-DIR-2026 — Alternative steel source",
    },
  ],
  pos: [
    { id: "RBM-PO-26-04588", supplierId: "SUP-NEC", sku: "CEM-OPC-50", qty: 12000, warehouse: "JA", poDate: "2026-09-29", eta: "2026-10-13", status: "confirmed", note: "At contract price AED 14.20/bag — surcharge not accepted." },
    { id: "RBM-PO-26-04591", supplierId: "SUP-NEC", sku: "CEM-SRC-50", qty: 4800, warehouse: "MN05", poDate: "2026-09-30", eta: "2026-10-14", status: "confirmed", note: "" },
    { id: "RBM-PO-26-04597", supplierId: "SUP-AWB", sku: "BLK-HOL-20", qty: 36000, warehouse: "MN05", poDate: "2026-10-01", eta: "2026-10-12", status: "confirmed", note: "" },
    { id: "RBM-PO-26-04603", supplierId: "SUP-ACT", sku: "TIL-POR-60120", qty: 2880, warehouse: "JA", poDate: "2026-09-02", eta: "2026-10-16", status: "confirmed", note: "Placed before the price revision — stays at PO price." },
    { id: "RBM-PO-26-04609", supplierId: "SUP-GBP", sku: "WPF-BIT-4", qty: 400, warehouse: "JA", poDate: "2026-10-02", eta: "2026-10-15", status: "confirmed", note: "" },
    { id: "RBM-PO-26-04614", supplierId: "SUP-ACT", sku: "SAN-WC-WH", qty: 120, warehouse: "JA", poDate: "2026-09-24", eta: "2026-10-19", status: "confirmed", note: "" },
    { id: "RBM-PO-26-04622", supplierId: "SUP-SRM", sku: "RB-B500-16", qty: 300, warehouse: "JA", poDate: "2026-09-16", eta: "2026-10-21", status: "confirmed", note: "First dispatches after mill maintenance (SRM/COM/2026/114) — priority PO." },
    { id: "RBM-PO-26-04625", supplierId: "SUP-SRM", sku: "RB-B500-16", qty: 90, warehouse: "MN05", poDate: "2026-09-17", eta: "2026-10-21", status: "confirmed", note: "Direct to MN-05 yard after mill restart." },
    { id: "RBM-PO-26-04631", supplierId: "SUP-SRM", sku: "RB-B500-20", qty: 140, warehouse: "JA", poDate: "2026-09-17", eta: "2026-10-22", status: "confirmed", note: "" },
    { id: "RBM-PO-26-04633", supplierId: "SUP-SRM", sku: "RB-B500-20", qty: 40, warehouse: "MN05", poDate: "2026-09-18", eta: "2026-10-22", status: "confirmed", note: "" },
    { id: "RBM-PO-26-04638", supplierId: "SUP-CCI", sku: "PNT-TS-20", qty: 2400, warehouse: "JA", poDate: "2026-10-05", eta: "2026-10-26", status: "confirmed", note: "ThermaShield launch stock (launch 1 Nov 2026)." },
  ],
};

/* ───────────── Delivery history (promise accuracy baseline) ───────────── */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(1611842);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const iso = (d) => d.toISOString().slice(0, 10);
const addDaysISO = (s, n) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const dow = (s) => new Date(`${s}T00:00:00Z`).getUTCDay();

const histCustomers = master.customers.map((c) => c.id);
const histZones = { "RBM-C-10034": MQ, "RBM-C-10167": MQ, "RBM-C-10118": MQ, "RBM-C-10227": LULU, "RBM-C-10183": LULU, "RBM-C-10171": SIDR, "RBM-C-10235": SIDR };
const dubaiCustomers = new Set(["RBM-C-10021", "RBM-C-10068", "RBM-C-10105", "RBM-C-10144", "RBM-C-10196", "RBM-C-10219", "RBM-C-10263", "RBM-C-10271", "RBM-C-10126"]);
const skuQty = {
  "CEM-OPC-50": () => 120 * (2 + Math.floor(rnd() * 20)),
  "CEM-SRC-50": () => 100 * (3 + Math.floor(rnd() * 14)),
  "RB-B500-12": () => 6 + Math.floor(rnd() * 24),
  "RB-B500-16": () => 10 + Math.floor(rnd() * 46),
  "RB-B500-20": () => 10 + Math.floor(rnd() * 30),
  "RB-B500-25": () => 12 + Math.floor(rnd() * 26),
  "BLK-HOL-20": () => 900 * (2 + Math.floor(rnd() * 12)),
  "TIL-POR-60120": () => Math.round((80 + rnd() * 700) / 1.44) * 1.44,
  "TIL-CER-3060": () => Math.round((60 + rnd() * 500) / 1.44) * 1.44,
  "SAN-WC-WH": () => 6 + Math.floor(rnd() * 40),
  "WPF-BIT-4": () => 12 + Math.floor(rnd() * 120),
};
const histSkus = Object.keys(skuQty);
// 120 lines: 95 complete & on time, 25 missed — causes reflect the Aug–Sep reality.
const missCauses = [
  ...Array(8).fill("stock"), ...Array(7).fill("site_access"), ...Array(5).fill("credit_hold"), ...Array(3).fill("transport"), ...Array(2).fill("customer_change"),
];
const missSlots = new Set();
while (missSlots.size < 25) missSlots.add(Math.floor(rnd() * 120));
const missOrder = [...missSlots].sort((a, b) => a - b);
const causeText = {
  stock: "Rebar 16/20 mm not available at dispatch warehouse — delivered short, balance next week",
  site_access: "Gate permit not booked 48 h ahead / outside site window — truck turned back",
  credit_hold: "Released from credit hold after promise date",
  transport: "Trailer breakdown / haulier no-show",
  customer_change: "Customer changed delivery address after promise",
};
const history = [];
let soNum = 11284;
let d0 = "2026-08-02";
for (let i = 0; i < 120; i++) {
  if (i % 2 === 0) soNum += 1 + Math.floor(rnd() * 5);
  const customerId = pick(histCustomers);
  let sku = pick(histSkus);
  const missIdx = missOrder.indexOf(i);
  const cause = missIdx >= 0 ? missCauses[missIdx] : null;
  if (cause === "stock") sku = pick(["RB-B500-16", "RB-B500-20", "RB-B500-16"]);
  const zone = histZones[customerId] ?? (dubaiCustomers.has(customerId) ? DXB : OTHER);
  const promised = addDaysISO(d0, Math.floor(i * 0.48));
  let p = promised;
  if (dow(p) === 0) p = addDaysISO(p, 1);
  if (zone === LULU && dow(p) === 6) p = addDaysISO(p, 2);
  const qty = Number(skuQty[sku]().toFixed(2));
  let delivered = p;
  let deliveredQty = qty;
  if (cause === "stock") { deliveredQty = Number((qty * (0.4 + rnd() * 0.4)).toFixed(1)); delivered = p; }
  else if (cause) { delivered = addDaysISO(p, 1 + Math.floor(rnd() * 4)); if (dow(delivered) === 0) delivered = addDaysISO(delivered, 1); }
  else if (rnd() < 0.18) { delivered = addDaysISO(p, -1); if (dow(delivered) === 0) delivered = p; }
  history.push({
    id: `DL-26-${String(31870 + i * 3 + Math.floor(rnd() * 3)).padStart(5, "0")}`,
    orderId: `SO-26-${soNum}`,
    lineNo: 1 + (i % 2),
    customerId,
    sku,
    qty,
    unit: prod[sku].unit,
    zone,
    promisedDate: p,
    deliveredDate: delivered,
    deliveredQty,
    varianceReason: cause ? causeText[cause] : null,
    cause,
  });
}

/* ───────────── Resolved exceptions (manual baseline effort) ───────────── */
const effort = [38, 64, 47, 71, 29, 55, 83, 41, 36, 58, 62, 44, 49, 77, 33, 51, 46, 68, 40, 54];
const exTemplates = [
  [["stock"], "Split delivery — 60% from stock, balance after transfer from Jebel Ali", "Joseph Abraham"],
  [["price"], "Order price corrected to Q3 frame rate before invoicing", "Rania Mansour"],
  [["window"], "Rescheduled to 09:00 slot; gate permit re-booked with master developer", "Marwan Qasim"],
  [["credit"], "Released after customer cheque cleared (overdue settled)", "Nadia Rahimi"],
  [["stock", "window"], "Balance re-promised for Saturday window after JA transfer", "Joseph Abraham"],
  [["price", "credit"], "Price corrected; CFO temporary release 8% for 30 days", "Priya Raghavan"],
  [["stock"], "Customer accepted 20 mm substitution approved by consultant", "Joseph Abraham"],
  [["window"], "Sunday request moved to Monday 09:00 — customer informed", "Marwan Qasim"],
  [["price"], "Discount above tier limit approved by Sales Director", "Fadi Khoury"],
  [["credit"], "Partial release — first drop only, balance held for payment", "Nadia Rahimi"],
];
const exCustomers = ["RBM-C-10034", "RBM-C-10047", "RBM-C-10073", "RBM-C-10126", "RBM-C-10021", "RBM-C-10052", "RBM-C-10183", "RBM-C-10167", "RBM-C-10219", "RBM-C-10068"];
const exceptionHistory = effort.map((mins, i) => {
  const [types, resolution, by] = exTemplates[i % exTemplates.length];
  const day = addDaysISO("2026-08-04", Math.floor(i * 2.9));
  const openH = 8 + (i % 7);
  const opened = `${day}T${String(openH).padStart(2, "0")}:${String((i * 13) % 60).padStart(2, "0")}:00+04:00`;
  // Elapsed time spans hand-offs (e-mails, calls); effortMinutes is hands-on time logged by the planner.
  const elapsedH = 3 + ((i * 7) % 26);
  const resolvedDate = new Date(Date.parse(opened) + elapsedH * 3600000);
  return {
    id: `EXC-26-${String(412 + i * 4).padStart(4, "0")}`,
    orderId: `SO-26-${11290 + i * 19}`,
    customerId: exCustomers[i % exCustomers.length],
    types,
    openedAt: opened,
    resolvedAt: new Date(resolvedDate.getTime() + 4 * 3600000).toISOString().slice(0, 19) + "+04:00",
    effortMinutes: mins,
    touches: 3 + (mins > 60 ? 3 : mins > 45 ? 2 : 1) + (types.length - 1),
    resolution,
    resolvedBy: by,
  };
});

/* ───────────── Customer documents (bring-your-own samples) ───────────── */
const customerDocs = [
  {
    id: "DOC-GCB-WA-1010",
    title: { en: "WhatsApp — Gulf Crest project director (Tower A)", ar: "واتساب — مدير مشاريع جلف كريست (البرج A)" },
    channel: "whatsapp",
    lang: "mixed",
    from: "Eng. Sultan Al Mehairi, Project Director Marina Quarter Towers — Gulf Crest Builders",
    receivedAt: "2026-10-10T18:50:00+04:00",
    orderHint: "SO-26-11842",
    text: [
      "[10/10/2026, 6:42 PM] Sultan Al Mehairi - GCB: السلام عليكم رانيا",
      "[10/10/2026, 6:43 PM] Sultan Al Mehairi - GCB: بخصوص الطلبية SO 11842 حق تاور A .. الكونسلتنت قدم صبة البوديوم L2 ليوم الثلاثاء الصبح، فنبا الحديد 16mm يوصلنا باجر الأحد الساعة 7 الصبح لو سمحتي",
      "[10/10/2026, 6:44 PM] Sultan Al Mehairi - GCB: واذا الأحد ما يمديكم خلوها الاثنين 9:30 بالكثير، الحدادين جاهزين من الصبح",
      "[10/10/2026, 6:46 PM] Sultan Al Mehairi - GCB: ادري ان صحارى عندهم صيانة .. اذا ما عندكم ال120 طن كاملة ارسلوا اللي عندكم الاثنين بس مب اقل من 60 طن عشان نخلص L2، والباقي قبل 22 اكتوبر ok",
      "[10/10/2026, 6:47 PM] Sultan Al Mehairi - GCB: وزيدوا على نفس الطلبية 6 طن 12mm حق الستارتر بارز",
      "[10/10/2026, 6:49 PM] Sultan Al Mehairi - GCB: and pls the invoice as per our PO price 2,690/t as agreed with Ahmed before .. procurment will not aprove any other price",
      "[10/10/2026, 6:50 PM] Sultan Al Mehairi - GCB: gate permit for monday already with us MQP-GP-26-18842, any change coordinate with me 050 128 4406 مشكورة",
    ].join("\n"),
  },
  {
    id: "DOC-ELC-EM-1009",
    title: { en: "Email — Emerald Line disputes porcelain price", ar: "بريد إلكتروني — إميرالد لاين تعترض على سعر البورسلان" },
    channel: "email",
    lang: "en",
    from: "Deepa Varghese, Commercial Manager — Emerald Line Construction",
    receivedAt: "2026-10-09T16:12:00+04:00",
    orderHint: "SO-26-11837",
    text: [
      "From: Deepa Varghese <deepa.v@emeraldline.ae>",
      "To: Vishal Kapoor <vishal.k@raseen.ae>",
      "Cc: accounts@emeraldline.ae",
      "Date: Fri, 9 Oct 2026 16:12",
      "Subject: RE: Order acknowledgement SO-26-11837 / our PO ELC-PO-26-0912",
      "",
      "Dear Vishal,",
      "",
      "Thank you for the acknowledgement. Please note the porcelain tile 60x120 matt is shown at AED 64.00/m2 — our frame agreement FA-ELC-2026 rate is AED 61.00/m2, so kindly correct the order before you invoice. We will not be able to process an invoice at 64.",
      "",
      "Also please add 30 boxes of the ceramic wall tile 30x60 gloss white (same as line 2) for the villa 58 kitchen, same delivery.",
      "",
      "Delivery Friday 16th 9am is still fine, site contact Ajith 052 774 0188.",
      "",
      "Best regards,",
      "Deepa Varghese",
      "Commercial Manager | Emerald Line Construction LLC",
    ].join("\n"),
  },
  {
    id: "DOC-NAS-WA-1010",
    title: { en: "WhatsApp — Najm Al Sahil asks about credit hold", ar: "واتساب — نجم الساحل يستفسر عن إيقاف الطلب" },
    channel: "whatsapp",
    lang: "ar",
    from: "Obaid Al Shamsi — Najm Al Sahil Building Contracting",
    receivedAt: "2026-10-10T11:05:00+04:00",
    orderHint: "SO-26-11856",
    text: [
      "[10/10/2026, 11:02 AM] Obaid Najm Al Sahil: السلام عليكم استاذة رانيا",
      "[10/10/2026, 11:03 AM] Obaid Najm Al Sahil: شو صار على طلبيتي الطابوق والاسمنت حق فيلا الورقاء؟ الموقع يقول ما وصلهم شي والرقم NAS-0710",
      "[10/10/2026, 11:04 AM] Obaid Najm Al Sahil: عرفت انها موقوفة بسبب الرصيد .. بنعطيكم شيك 52,300 يوم الثلاثاء 13 الشهر يغطي المتأخر كله",
      "[10/10/2026, 11:05 AM] Obaid Najm Al Sahil: بس لو تقدرون توصلون الطابوق الاربعاء الصبح 7 بدال الثلاثاء لان العمال بيخلصون الحفر الثلاثاء. والاسمنت خلوه 250 كيس بس مب 300",
      "[10/10/2026, 11:06 AM] Obaid Najm Al Sahil: الله يعطيج العافية",
    ].join("\n"),
  },
  {
    id: "DOC-APCC-PO-1008",
    title: { en: "PO amendment — APCC Interchange 4", ar: "تعديل أمر شراء — شركة شبه الجزيرة، التقاطع 4" },
    channel: "purchase_order",
    lang: "en",
    from: "Procurement Department — Arabian Peninsula Construction Co.",
    receivedAt: "2026-10-08T14:30:00+04:00",
    orderHint: "SO-26-11815",
    text: [
      "ARABIAN PENINSULA CONSTRUCTION CO. (APCC) — شركة شبه الجزيرة العربية للإنشاءات",
      "PURCHASE ORDER AMENDMENT No. 1",
      "PO No.: APCC/PO/26/3318        Date: 08-Oct-2026",
      "Supplier: Raseen Building Materials Trading LLC — Your ref. SO-26-11815",
      "Project: Marsa Al Noor Ring Road — Interchange 4, pier caps P7–P12",
      "",
      "Item | Description | Original qty | Amended qty | Unit rate (AED) ",
      "1 | Rebar B500B 12mm, 12m bars | 30 t | 36 t | 2,730.00",
      "2 | OPC cement 42.5N 50kg | 900 bags | 900 bags | 16.05",
      "",
      "Delivery: amended to Wednesday 14-Oct-2026, 07:00, Interchange 4 laydown (pier P9 access).",
      "Rates as per original PO. All other terms unchanged.",
      "",
      "Issued by: Eng. Hisham Darwish, Procurement Director",
      "Approved: M. Al Hashemi, Project Director",
    ].join("\n"),
  },
  {
    id: "DOC-HRM-EM-1009",
    title: { en: "Email — Horizon Ridge requests Sunday delivery", ar: "بريد إلكتروني — هورايزن ريدج تطلب التسليم يوم الأحد" },
    channel: "email",
    lang: "en",
    from: "Sameer Kulkarni, MEP Project Manager — Horizon Ridge MEP Contracting",
    receivedAt: "2026-10-09T09:41:00+04:00",
    orderHint: "SO-26-11850",
    text: [
      "From: Sameer Kulkarni <sameer.k@horizonridge.ae>",
      "To: Vishal Kapoor <vishal.k@raseen.ae>",
      "Date: Fri, 9 Oct 2026 09:41",
      "Subject: WC sets for MQ Residences Tower C — PO HRM-PO-0388",
      "",
      "Hi Vishal,",
      "",
      "Kindly reduce the wall hung WC sets on our PO HRM-PO-0388 from 64 to 58 sets — six washrooms on L12 are now on hold by the client.",
      "Our installers are on site Sunday 18 Oct from 7:30am, please deliver 8am Sunday so they can start shifting to the floors before the hoist booking on Monday.",
      "",
      "Regards,",
      "Sameer Kulkarni",
      "MEP Project Manager, Horizon Ridge MEP Contracting LLC",
      "M: +971 55 902 6614",
    ].join("\n"),
  },
];

/* ───────────── Audit seed (Sep–Oct 2026) ───────────── */
const sol = "16-order-exceptions";
const A = (n, ts, actor, action, subject, detail) => ({ id: `AUD-16-${String(n).padStart(4, "0")}`, ts, solution: sol, actor, action, subject, detail });
const joseph = { name: "Joseph Abraham", role: "Supply Chain & Planning Manager", kind: "human" };
const rania = { name: "Rania Mansour", role: "Key Account Manager", kind: "human" };
const nadia = { name: "Nadia Rahimi", role: "Credit Controller, Group Finance", kind: "human" };
const erp = { name: "RBM ERP", role: "System", kind: "system" };
const marwan = { name: "Marwan Qasim", role: "Logistics & Dispatch Supervisor, MN-05", kind: "human" };
const fadi = { name: "Fadi Khoury", role: "Sales Director, RBM", kind: "human" };
const agent = { name: "NARVO Agent", role: "AI agent", kind: "agent" };
const auditSeed = [
  A(1, "2026-09-15T11:20:00+04:00", joseph, "Logged supply notice", "Sahara Rebar Mills — SRM/COM/2026/114", "Planned mill maintenance 5–19 Oct 2026; dispatches resume 20 Oct. Rebar allocation order-by-order from 5 Oct."),
  A(2, "2026-09-16T09:05:00+04:00", joseph, "Placed purchase order", "RBM-PO-26-04622", "Sahara Rebar Mills — RB-B500-16 300 t to Jebel Ali, first dispatch after restart."),
  A(3, "2026-09-17T10:40:00+04:00", joseph, "Placed purchase order", "RBM-PO-26-04625", "Sahara Rebar Mills — RB-B500-16 90 t direct to MN-05."),
  A(4, "2026-09-24T15:12:00+04:00", joseph, "Resolved order exception", "SO-26-11702", "Stock shortfall RB-B500-20 — split delivery with JA transfer (AED 38/t). Effort 47 min."),
  A(5, "2026-10-01T08:00:00+04:00", erp, "Loaded price list", "PL-2026-Q4", "Q4 rebar frame rates effective for deliveries 1 Oct – 31 Dec 2026."),
  A(6, "2026-10-01T09:30:00+04:00", fadi, "Changed key account manager", "Gulf Crest Builders LLC (RBM-C-10034)", "Ahmed Soliman → Rania Mansour (handover of open orders and opportunity OPP-2026-0418)."),
  A(7, "2026-10-02T13:55:00+04:00", nadia, "Sent overdue reminder", "Gulf Crest Builders LLC", "Overdue AED 148,320 (31–60 days). Reminder +21 days per RBM-FIN-POL-04."),
  A(8, "2026-10-05T07:45:00+04:00", erp, "Applied allocation rule", "RB-B500-16 / RB-B500-20", "Sahara shutdown started — available-to-promise switched to order-by-order allocation by promise date."),
  A(9, "2026-10-06T10:41:00+04:00", erp, "Placed order on automatic credit hold", "SO-26-11842", "Exposure AED 2,102,350 vs limit AED 2,000,000 (AR AED 1,763,410 + this order AED 338,940 incl. 5% VAT)."),
  A(10, "2026-10-06T10:44:00+04:00", rania, "Entered sales order", "SO-26-11842", "Gulf Crest — RB-B500-16 120 t at customer PO price AED 2,690/t; requested Mon 12 Oct 07:00."),
  A(11, "2026-10-07T16:44:00+04:00", erp, "Placed order on automatic credit hold", "SO-26-11856", "Najm Al Sahil — exposure AED 271,035 vs limit AED 250,000."),
  A(12, "2026-10-08T08:52:00+04:00", marwan, "Booked gate permit", "MQP-GP-26-18842", "Marina Quarter Properties — Tower A gate 3, Mon 12 Oct (SO-26-11842)."),
  A(13, "2026-10-08T16:06:00+04:00", erp, "Placed order on automatic credit hold", "SO-26-11869", "Saqr Al Noor — exposure AED 762,995 vs limit AED 750,000."),
  A(14, "2026-10-09T10:15:00+04:00", rania, "Requested stock check", "SO-26-11842", "Only 64 t RB-B500-16 available to promise at MN-05 after earlier orders; JA free stock 38 t."),
  A(15, "2026-10-09T12:30:00+04:00", agent, "Ran exception sweep", "Open sales orders (40)", "Nightly check: stock, contract price, site window and credit exposure."),
  A(16, "2026-10-08T11:05:00+04:00", nadia, "Requested payment commitment", "Gulf Crest Builders LLC", "Asked GCB for a dated payment covering the overdue AED 148,320 before any temporary release."),
  A(17, "2026-10-09T17:20:00+04:00", nadia, "Recorded payment commitment", "Gulf Crest Builders LLC — PC-26-0187", "Faris Al Kindi (Finance Manager, GCB) committed AED 412,000 by transfer on Thu 15 Oct 2026 — covers the overdue AED 148,320 and invoices due by 15 Oct."),
];

/* ───────────── Payment commitments recorded by Credit Control ───────────── */
const paymentCommitments = {
  asOf: "2026-10-09",
  source: "Group Finance — Credit Control (RBM-FIN-POL-04: dated payment commitment required before a temporary release)",
  items: [
    {
      id: "PC-26-0187",
      customerId: "RBM-C-10034",
      amount: 412000,
      date: "2026-10-15",
      method: "Bank transfer",
      committedBy: "Faris Al Kindi",
      role: "Finance Manager, Gulf Crest Builders LLC",
      email: "faris.alkindi@gulfcrest.ae",
      mobile: "+971 50 662 1953",
      recordedOn: "2026-10-09",
      recordedBy: "Nadia Rahimi",
      note: "Covers the overdue AED 148,320 (31–60 days) and invoices falling due by 15 Oct 2026.",
    },
  ],
};

/* ───────────── Consistency checks ───────────── */
const VAT = master.vatRate;
const allowedDisc = { A: 0.05, B: 0.035, C: 0.02 };
const warnings = [];
// prices
for (const o of orders) {
  const c = cust[o.customerId];
  const k = contracts[o.customerId];
  for (const ln of o.lines) {
    const p = prod[ln.sku];
    if (k && k.rates[ln.sku] != null) {
      if (Math.abs(k.rates[ln.sku] - ln.unitPrice) > 0.004) warnings.push(`PRICE ${o.id} L${ln.lineNo} ${ln.sku} entered ${ln.unitPrice} vs contract ${k.rates[ln.sku]}`);
    } else {
      const disc = (p.listPrice - ln.unitPrice) / p.listPrice;
      if (disc > allowedDisc[c.tier] + 1e-4) warnings.push(`DISC ${o.id} L${ln.lineNo} ${ln.sku} ${ln.unitPrice} vs list ${p.listPrice} = ${(disc * 100).toFixed(2)}% > ${(allowedDisc[c.tier] * 100).toFixed(1)}% (tier ${c.tier})`);
      if (ln.unitPrice < p.stdCost * 1.04) warnings.push(`BELOW COST+4% ${o.id} ${ln.sku}`);
    }
  }
}
// credit
const byCust = {};
for (const o of [...orders].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) (byCust[o.customerId] ??= []).push(o);
for (const [cid, os] of Object.entries(byCust)) {
  const c = cust[cid];
  let exp = c.arOutstanding;
  for (const o of os) {
    const val = o.lines.reduce((a, ln) => a + (ln.qty - ln.deliveredQty) * ln.unitPrice, 0) * (1 + VAT);
    exp += val;
    const over = exp > c.creditLimit;
    if (over !== (o.status === "credit_hold")) warnings.push(`CREDIT ${o.id} ${c.name}: exposure ${exp.toFixed(2)} limit ${c.creditLimit} status ${o.status}`);
    else if (over) warnings.push(`credit-hold OK ${o.id} ${c.name}: ${exp.toFixed(2)} (${((exp / c.creditLimit) * 100).toFixed(1)}%)`);
  }
}
// stock
const pools = {};
for (const it of stock.items) pools[`${it.sku}|${it.warehouse}`] = it.onHand - it.reserved;
const demand = orders
  .flatMap((o) => o.lines.filter((ln) => ln.qty > ln.deliveredQty).map((ln) => ({ o, ln })))
  .sort((a, b) => a.o.promiseDate.localeCompare(b.o.promiseDate) || a.o.createdAt.localeCompare(b.o.createdAt));
for (const { o, ln } of demand) {
  const key = `${ln.sku}|${o.shipFrom}`;
  const open = ln.qty - ln.deliveredQty;
  const got = Math.min(open, Math.max(0, pools[key] ?? 0));
  pools[key] = (pools[key] ?? 0) - got;
  if (got < open) warnings.push(`STOCK ${o.id} ${ln.sku}@${o.shipFrom}: need ${open}, allocated ${got}, short ${open - got}`);
}
warnings.push(`free RB-B500-16@JA ${pools["RB-B500-16|JA"]}, RB-B500-16@MN05 ${pools["RB-B500-16|MN05"]}, RB-B500-20@JA ${pools["RB-B500-20|JA"]}`);

const onTime = history.filter((h) => h.deliveredQty >= h.qty && h.deliveredDate <= h.promisedDate).length;
warnings.push(`history ${history.length} lines, on time ${onTime} = ${((onTime / history.length) * 100).toFixed(1)}%`);
warnings.push(`exception effort avg ${(effort.reduce((a, b) => a + b, 0) / effort.length).toFixed(1)} min`);

/* ───────────── Write ───────────── */
const w = (name, data) => fs.writeFileSync(path.join(OUT, name), JSON.stringify(data, null, 2) + "\n", "utf8");
fs.mkdirSync(OUT, { recursive: true });
w("sales-orders.json", { asOf: "2026-10-09T18:00:00+04:00", source: "RBM ERP — open sales orders (not yet invoiced)", orders });
w("stock.json", stock);
w("inbound.json", inbound);
w("delivery-history.json", { period: "2026-08-01/2026-09-30", definition: "Order lines delivered complete on or before the promised date (RBM-OPS-POL-11).", lines: history.map(({ cause, ...h }) => h) });
w("exception-history.json", { period: "2026-08-01/2026-09-30", note: "Resolved order exceptions — effortMinutes is hands-on time logged by planners (manual process).", items: exceptionHistory });
w("customer-docs.json", customerDocs);
w("audit-seed.json", auditSeed);
w("payment-commitments.json", paymentCommitments);
console.log(warnings.join("\n"));
console.log(`orders: ${orders.length}`);
