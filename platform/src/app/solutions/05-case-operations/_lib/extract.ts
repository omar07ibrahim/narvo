import "server-only";
import { z } from "zod";
import { generateObject } from "@/lib/ai/json";
import { publicImageDataUrl } from "@/lib/world/data";

/** One schema for every document family; the model fills what is visible and leaves the rest null. */
export const extractionSchema = z.object({
  docType: z.enum([
    "application_form",
    "emirates_id",
    "family_book",
    "salary_certificate",
    "plot_allocation",
    "no_property_certificate",
    "bank_statement",
    "other",
  ]),
  title: z.string().describe("Document title as printed"),
  issuer: z.string().nullable(),
  reference: z.string().nullable(),
  issueDate: z.string().nullable().describe("ISO yyyy-mm-dd"),
  expiryDate: z.string().nullable().describe("ISO yyyy-mm-dd"),
  holderName: z.string().nullable().describe("Latin-script name of the person the document is about"),
  holderNameAr: z.string().nullable(),
  emiratesId: z.string().nullable().describe("784-YYYY-NNNNNNN-C"),
  employer: z.string().nullable(),
  position: z.string().nullable(),
  totalMonthlySalary: z.number().nullable(),
  salaryComponents: z.array(z.object({ name: z.string(), amount: z.number() })).nullable(),
  declaredIncome: z.number().nullable().describe("Monthly household income declared on an application form"),
  track: z.enum(["grant", "loan"]).nullable(),
  amountRequested: z.number().nullable(),
  plot: z.string().nullable(),
  maritalStatus: z.string().nullable(),
  dependents: z.number().nullable(),
  spouseName: z.string().nullable(),
  spouseEmployed: z.boolean().nullable(),
  landRegistryConsent: z.boolean().nullable().describe("Whether the consent box for Land Registry retrieval is ticked"),
  familyMembers: z
    .array(z.object({ relation: z.string(), name: z.string(), dateOfBirth: z.string().nullable(), emiratesId: z.string().nullable() }))
    .nullable(),
  statementPeriod: z.string().nullable(),
  salaryCredits: z.array(z.number()).nullable(),
  registryResult: z.string().nullable(),
  specimenWatermark: z.boolean().describe("true if the image carries a SPECIMEN / demo watermark"),
  observations: z.string().describe("One or two sentences on anything unusual: stamps, signatures, handwriting, legibility"),
  confidence: z.number().min(0).max(1),
});

export type Extraction = z.infer<typeof extractionSchema>;

const SYSTEM = `You are the document-reading component of a government case-management system at the Marsa Al Noor Development Authority (UAE).
Read the scanned document image carefully — it may be bilingual Arabic/English, printed or handwritten.
Extract ONLY what is visibly written. Use null for anything not present. Never guess identifiers or amounts.
Dates must be ISO yyyy-mm-dd (convert from dd/mm/yyyy or written forms). Amounts are plain numbers in AED without separators.
Arabic names go in holderNameAr; Latin names in holderName. For family books list every member row.
Set confidence (0–1) to reflect legibility and completeness of what you extracted.`;

export async function extractFromImage(opts: {
  file?: string;
  dataUrl?: string;
  hint?: string;
  modelKey?: string | null;
  task?: string;
}): Promise<{ object: Extraction; ms: number }> {
  const url = opts.dataUrl ?? publicImageDataUrl(opts.file!);
  const r = await generateObject({
    schema: extractionSchema,
    name: "document_extraction",
    system: SYSTEM,
    user: [
      { type: "text", text: opts.hint ? `Expected document: ${opts.hint}. Extract its contents.` : "Identify this document and extract its contents." },
      { type: "image_url", image_url: { url } },
    ],
    modelKey: opts.modelKey,
    solution: "05-case-operations",
    task: opts.task ?? "extract",
    maxTokens: 1800,
  });
  return { object: r.object, ms: r.ms };
}
