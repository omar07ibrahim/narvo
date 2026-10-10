/** Shared types for 16 — Order Fulfilment & Exception Intelligence (no server-only imports). */

export type Bi = { en: string; ar: string };
export type Wh = "JA" | "MN05";
export type OrderStatus = "open" | "credit_hold" | "partially_delivered" | "ready";
export type ExceptionType = "stock" | "price" | "window" | "credit";

export type LineSource =
  | { kind: "stock"; warehouse: Wh }
  | { kind: "transfer"; from: Wh; to: Wh }
  | { kind: "inbound"; poRef: string }
  | { kind: "alt_supplier"; supplier: string; premiumPerT: number };

export interface OrderLine {
  lineNo: number;
  sku: string;
  qty: number;
  unit: string;
  unitPrice: number;
  deliveredQty?: number;
  /** Set when a resolution gives this line its own promise / source. */
  promiseDate?: string;
  slot?: string;
  source?: LineSource;
  /** Managed credit hold: balance waits for customer payment or a CFO release. */
  creditHold?: boolean;
  note?: string;
}

export interface Contact {
  name: string;
  role: string;
  email?: string;
  mobile?: string;
  channel: "email" | "whatsapp";
}

export interface Resolution {
  optionId: string;
  title: string;
  summary: string;
  approvalRequestedAt: string;
  approver: string;
  cleared: ExceptionType[];
  heldBalance?: { qty: number; value: number; condition: string } | null;
}

export interface SalesOrder {
  id: string;
  createdAt: string;
  customerId: string;
  customerName: string;
  customerPo: string;
  project: string;
  site: string;
  district: string;
  zone: string;
  cityCentre?: boolean;
  shipFrom: Wh;
  requestedDelivery: string; // local GST "YYYY-MM-DDTHH:mm"
  promiseDate: string; // YYYY-MM-DD
  status: OrderStatus;
  kam: string;
  contact?: Contact;
  siteContact?: Contact;
  gatePermit?: { ref: string; date: string; bookedOn: string } | null;
  lines: OrderLine[];
  notes: string;
  resolution?: Resolution;
  creditRelease?: { amount: number; validUntil: string; ref: string; approvedBy: string } | null;
  _updatedAt?: number;
}

export interface StockItem {
  sku: string;
  warehouse: Wh;
  onHand: number;
  reserved: number;
  reservedReason?: string;
}

export interface InboundPo {
  id: string;
  supplierId: string;
  sku: string;
  qty: number;
  warehouse: Wh;
  poDate: string;
  eta: string;
  status: string;
  note: string;
}

export interface AltSource {
  supplier: string;
  trn: string;
  skus: string[];
  premiumPerT: number;
  leadWorkingDays: number;
  origin: string;
  approval: string;
  source: string;
}

export interface HistoryLine {
  id: string;
  orderId: string;
  lineNo: number;
  customerId: string;
  sku: string;
  qty: number;
  unit: string;
  zone: string;
  promisedDate: string;
  deliveredDate: string;
  deliveredQty: number;
  varianceReason: string | null;
}

export interface ExceptionHistoryItem {
  id: string;
  orderId: string;
  customerId: string;
  types: ExceptionType[];
  openedAt: string;
  resolvedAt: string;
  effortMinutes: number;
  touches: number;
  resolution: string;
  resolvedBy: string;
}

export interface LiveResolution {
  id: string;
  orderId: string;
  customerId: string;
  optionId: string;
  title: string;
  types: ExceptionType[];
  openedAt: string;
  approvalId?: string;
  effortMinutes: number | null;
  valueAtRiskCleared: number;
  extraCost: number;
  marginDelta: number;
  approver: string;
  _createdAt?: number;
}

/* ─────────── Master subset ─────────── */
export interface Product {
  sku: string;
  name: string;
  nameAr: string;
  category: string;
  unit: string;
  unitAr: string;
  listPrice: number;
  stdCost: number;
  supplierId: string;
}
export interface Customer {
  id: string;
  name: string;
  nameAr: string;
  tier: "A" | "B" | "C";
  segment: string;
  creditLimit: number;
  paymentTermsDays: number;
  arOutstanding: number;
  overdue30: number;
  kam: string;
  contractId?: string;
}
export interface Contract {
  id: string;
  customerId: string;
  title: string;
  validFrom: string;
  validTo: string;
  rates: Record<string, number>;
  ratesQ3?: Record<string, number>;
}
export interface SiteWindow {
  zone: string;
  days: string;
  from: string;
  to: string;
  gate: string;
  maxVehicle: string;
}
export interface Person {
  name: string;
  nameAr: string;
  role: string;
  roleAr: string;
  email: string;
}
export interface MasterSubset {
  vatRate: number;
  priceList: string;
  products: Product[];
  customers: Customer[];
  contracts: Contract[];
  suppliers: Array<{ id: string; name: string; nameAr: string; note?: string }>;
  people: Person[];
  creditPolicy: { ref: string; temporaryReleaseMaxPct: number; temporaryReleaseValidityDays: number; temporaryReleaseApprover: string; overdueBlockDays: number };
  deliveryRules: {
    ref: string;
    siteWindows: SiteWindow[];
    transferJAtoMN05: { costPerTonne: number; leadDays: number };
    minRebarDropT: number;
    truckCapacityT: number;
  };
}

/* ─────────── Proposal from a customer document ─────────── */
export interface ProposalChange {
  kind: "requested_delivery" | "add_line" | "change_qty" | "remove_line" | "price_claim" | "split_terms" | "payment_commitment" | "note";
  label: Bi;
  applied: boolean;
  evidence?: string;
  verified?: boolean;
}

export interface Proposal {
  id: string;
  orderId: string;
  docTitle: string;
  createdAt: number;
  requestedDelivery?: string | null;
  lineChanges: Array<{ action: "add" | "change_qty" | "remove"; sku: string; qty: number | null }>;
  priceClaims: Array<{ sku: string | null; claimedPrice: number; basis: string }>;
  splitAccepted?: boolean | null;
  minFirstDropQty?: number | null;
  balanceByDate?: string | null;
  paymentCommitment?: { amount: number; date: string | null } | null;
  changes: ProposalChange[];
}

/* ─────────── World snapshot passed from server to client ─────────── */
export interface Snapshot {
  orders: SalesOrder[];
  stock: StockItem[];
  inbound: InboundPo[];
  altSources: AltSource[];
  master: MasterSubset;
  deliveryHistory: HistoryLine[];
  exceptionHistory: ExceptionHistoryItem[];
  resolutions: LiveResolution[];
  proposals: Record<string, Proposal>;
  notifications: Array<{ id: string; orderId: string; channel: string; recipient: string; en: string; ar: string; _createdAt?: number }>;
  handovers: Array<{ id: string; orderId: string; to: string; body: string; _createdAt?: number }>;
}

/* ─────────── Detection results ─────────── */
export interface CoverOption {
  kind: "transfer" | "inbound" | "alt_supplier";
  label: Bi;
  qty: number;
  deliverableFrom: string;
  warehouse?: Wh;
  poRef?: string;
  costPerT?: number;
}

export interface LineCheck {
  lineNo: number;
  sku: string;
  openQty: number;
  unitPrice: number;
  source: LineSource;
  promiseDate: string;
  // stock
  poolBefore: number;
  allocated: number;
  short: number;
  readyDate: string | null;
  coverage: CoverOption[];
  // price
  price: {
    reference: number;
    kind: "contract" | "list";
    contractId?: string;
    allowedDiscountPct?: number;
    minAllowed?: number;
    status: "ok" | "under" | "over" | "discount" | "over_list";
    diffPerUnit: number;
    impact: number;
    q3Rate?: number;
  };
  margin: { revenue: number; cost: number; margin: number; pct: number };
}

export interface WindowCheck {
  zone: string;
  rule: SiteWindow | null;
  requested: string;
  ok: boolean;
  reasons: Array<"day" | "time" | "gate_lead" | "city_centre" | "past" | "holiday">;
  nextSlot: string | null;
  nextSlotLate: boolean;
  effectiveWindow: string;
  permitOnFile: boolean;
  gateLeadHours: number;
  perLine?: Array<{ lineNo: number; slot: string; ok: boolean; nextSlot: string | null }>;
}

export interface CreditCheck {
  customerId: string;
  limit: number;
  release: number;
  ar: number;
  overdue30: number;
  priorOpen: number; // other open orders created earlier (incl VAT)
  laterOpen: number; // open orders created later (incl VAT)
  thisOrder: number; // released open value incl VAT
  heldValue: number; // managed hold (excluded)
  exposure: number; // cumulative through this order
  totalExposure: number; // AR + all open orders
  pct: number;
  over: boolean;
  overAmount: number;
  ifPaidOverdue: number; // exposure if the overdue amount is paid
}

export interface ExceptionItem {
  key: string;
  type: ExceptionType;
  orderId: string;
  lineNo?: number;
  title: Bi;
  detail: Bi;
  impact: number;
}

export type Severity = "critical" | "high" | "medium" | "low";

export interface OrderAnalysis {
  order: SalesOrder;
  customer: Customer;
  lines: LineCheck[];
  window: WindowCheck;
  credit: CreditCheck;
  exceptions: ExceptionItem[];
  types: ExceptionType[];
  valueAtRisk: number;
  openValue: number;
  daysToPromise: number;
  severity: Severity | null;
  score: number;
}

export interface WorldAnalysis {
  orders: OrderAnalysis[];
  byId: Record<string, OrderAnalysis>;
  free: Record<string, number>; // `${sku}|${wh}` → free after allocation
  poRemaining: Record<string, number>;
}

/* ─────────── Resolution options ─────────── */
export type OptionAction =
  | { type: "split_delivery"; sku?: string | null; nowQty: number; nowWarehouse?: Wh | null; laterQty: number; laterSource: "inbound_po" | "transfer" | "alternative_supplier"; laterPoRef?: string | null }
  | { type: "transfer_stock"; sku?: string | null; fromWarehouse: Wh; qty: number }
  | { type: "alternative_supplier"; sku?: string | null; qty: number; premiumPerT: number }
  | { type: "correct_price"; sku?: string | null; to: "contract" | "list_allowed" }
  | { type: "reschedule"; slot: string }
  | { type: "partial_credit_release"; amount: number }
  | { type: "hold_for_payment"; amount: number };

export interface ProposedOption {
  id: string;
  title: string;
  summary: string;
  actions: OptionAction[];
  rationale: string;
  customerImpact: string;
  risks: string;
}

export interface Delivery {
  lineNo: number;
  sku: string;
  qty: number;
  unitPrice: number;
  source: LineSource;
  readyDate: string;
  slot: string | null;
  promiseDate: string | null;
  trucks: number;
  held: boolean;
  label: Bi;
}

export interface OptionIssue {
  level: "error" | "warn" | "info";
  text: Bi;
}

export interface OptionImpact {
  feasible: boolean;
  deliveries: Delivery[];
  newLines: OrderLine[];
  requestedDelivery: string;
  extraCost: number;
  transferCost: number;
  premiumCost: number;
  revenue: number;
  margin: number;
  marginPct: number;
  baselineMargin: number;
  baselineMarginPct: number;
  marginDelta: number;
  priceRecovered: number;
  exposureAfter: number;
  exposurePctAfter: number;
  fullExposure: number;
  limit: number;
  releaseAmount: number;
  releaseNeeded: number;
  heldQty: number;
  heldValue: number;
  firstDelivery: string | null;
  lastDelivery: string | null;
  approvals: Array<{ name: string; title: string; reason: Bi }>;
  approver: { name: string; title: string };
  issues: OptionIssue[];
  constraints: Array<{ label: Bi; ok: boolean }>;
  cleared: ExceptionType[];
  remaining: ExceptionType[];
  otherOrders: Array<{ orderId: string; customer: string; change: Bi }>;
}
