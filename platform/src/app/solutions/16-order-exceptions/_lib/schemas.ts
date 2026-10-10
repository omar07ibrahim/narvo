import { z } from "zod";

/** Structured output from a customer PO / email / WhatsApp. */
export const ExtractionSchema = z.object({
  docType: z.enum(["whatsapp", "email", "purchase_order", "other"]),
  language: z.enum(["ar", "en", "mixed"]),
  orderRef: z.string().nullable().describe("RBM sales order number as SO-26-NNNNN if mentioned (also '11842' → SO-26-11842), else null"),
  customerPoRef: z.string().nullable().describe("Customer's own PO number if mentioned"),
  customerName: z.string().nullable(),
  summary: z.string().describe("2–3 sentences: what the customer is asking for, in the requested output language"),
  requestedDelivery: z
    .object({
      primary: z.string().nullable().describe("Requested delivery as YYYY-MM-DDTHH:mm (Gulf time)"),
      alternatives: z.array(z.string()).describe("Fallback date-times the customer accepts, YYYY-MM-DDTHH:mm"),
      evidence: z.string().describe("Exact quote from the message"),
    })
    .nullable(),
  lineChanges: z.array(
    z.object({
      action: z.enum(["add", "change_qty", "remove"]),
      sku: z.string().nullable().describe("RBM SKU from the catalogue, or null if unsure"),
      description: z.string(),
      qty: z.number().nullable().describe("For change_qty: the NEW total quantity. For add: the quantity to add."),
      unit: z.string().nullable(),
      evidence: z.string(),
    }),
  ),
  priceClaims: z.array(
    z.object({
      sku: z.string().nullable(),
      claimedPrice: z.number().describe("Unit price the customer says should apply (AED, excl. VAT)"),
      basis: z.string().describe("What the customer bases it on, e.g. 'our PO price', 'frame agreement'"),
      evidence: z.string(),
    }),
  ),
  split: z
    .object({
      accepted: z.boolean().nullable().describe("Does the customer accept a partial / split delivery?"),
      minFirstDropQty: z.number().nullable().describe("Minimum quantity needed in the first delivery"),
      balanceByDate: z.string().nullable().describe("Latest date for the balance, YYYY-MM-DD"),
      evidence: z.string(),
    })
    .nullable(),
  paymentCommitment: z
    .object({ amount: z.number(), date: z.string().nullable().describe("YYYY-MM-DD"), evidence: z.string() })
    .nullable(),
  contacts: z.array(z.object({ name: z.string(), role: z.string().nullable(), phone: z.string().nullable(), email: z.string().nullable() })),
  otherRequests: z.array(z.object({ text: z.string(), evidence: z.string() })),
});

const sku = z.string().nullable().optional();

/** Typed resolution actions. Code validates every parameter and computes the impact. */
export const ActionSchema = z.union([
  z.object({
    type: z.literal("split_delivery"),
    sku,
    nowQty: z.number().describe("Quantity in the first drop from stock available now"),
    nowWarehouse: z.enum(["JA", "MN05"]).nullable().optional(),
    laterQty: z.number().describe("Balance quantity"),
    laterSource: z.enum(["inbound_po", "transfer", "alternative_supplier"]),
    laterPoRef: z.string().nullable().optional().describe("Inbound PO id when laterSource is inbound_po"),
  }),
  z.object({ type: z.literal("transfer_stock"), sku, fromWarehouse: z.enum(["JA", "MN05"]), qty: z.number() }),
  z.object({ type: z.literal("alternative_supplier"), sku, qty: z.number(), premiumPerT: z.number() }),
  z.object({ type: z.literal("correct_price"), sku, to: z.enum(["contract", "list_allowed"]) }),
  z.object({ type: z.literal("reschedule"), slot: z.string().describe("First delivery slot YYYY-MM-DDTHH:mm inside the site window") }),
  z.object({ type: z.literal("partial_credit_release"), amount: z.number().describe("AED above the approved limit, ≤ 15% of the limit") }),
  z.object({ type: z.literal("hold_for_payment"), amount: z.number().describe("Customer payment (AED) that releases the held balance") }),
]);

export const OptionsSchema = z.object({
  options: z
    .array(
      z.object({
        id: z.string().describe("A, B, C or D"),
        title: z.string().describe("≤ 8 words"),
        summary: z.string().describe("1–2 sentences"),
        actions: z.array(ActionSchema).min(1),
        rationale: z.string().describe("Why this option, citing sources as [n]"),
        customerImpact: z.string(),
        risks: z.string(),
      }),
    )
    .min(2)
    .max(4),
  recommended: z.string().describe("id of the recommended option"),
  recommendedReason: z.string(),
});

export type ExtractionOut = z.infer<typeof ExtractionSchema>;
export type OptionsOut = z.infer<typeof OptionsSchema>;
