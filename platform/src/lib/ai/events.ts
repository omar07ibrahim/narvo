/**
 * Event protocol streamed from every NARVO AI route to the browser (Server-Sent Events).
 * Shared by server (emitter) and client (useNarvoRun hook). No server-only imports here.
 */

export type StepStatus = "running" | "done" | "error" | "waiting" | "skipped";

export type NarvoEvent =
  | { type: "step"; id: string; label: string; status: StepStatus; detail?: string; ms?: number }
  | { type: "text"; channel: string; delta: string }
  | { type: "text-reset"; channel: string }
  | { type: "reasoning"; delta: string }
  | { type: "data"; key: string; value: unknown }
  | {
      type: "tool";
      id: string;
      name: string;
      label: string;
      status: "running" | "done" | "error" | "awaiting_approval";
      input?: unknown;
      output?: unknown;
      ms?: number;
    }
  | { type: "approval"; approval: ApprovalSummary }
  | { type: "meta"; model: string; provider: "openrouter" | "local" }
  | { type: "done"; ms: number; usage?: { promptTokens: number; completionTokens: number } }
  | { type: "error"; message: string };

export interface ApprovalSummary {
  id: string;
  title: string;
  summary: string;
  solution: string;
  actionLabel: string;
  /** nameAr / titleAr: display forms for the Arabic UI only; records and the audit trail keep name and title */
  approver: { name: string; title: string; nameAr?: string; titleAr?: string };
  status: "pending" | "approved" | "rejected";
  createdAt: number;
}

export interface Citation {
  /** 1-based marker as used in the text, e.g. [2] */
  n: number;
  docId: string;
  title: string;
  ref?: string;
  section?: string;
  quote: string;
  url?: string;
}
