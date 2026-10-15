"use client";

import { useCallback, useRef, useState } from "react";
import { usePrefs } from "@/lib/i18n";
import type { ApprovalSummary, NarvoEvent, StepStatus } from "@/lib/ai/events";

/**
 * Client hook that runs a NARVO AI route and turns its Server-Sent Events into UI state.
 *
 *   const run = useNarvoRun();
 *   run.start("/api/solutions/05-case-operations/process", { caseId });
 *   run.steps / run.tools   → live agent trace
 *   run.text.main            → streamed text (other channels: run.text.draft, …)
 *   run.data.fields          → structured results sent with emit.data("fields", …)
 */

export interface TraceStep {
  id: string;
  label: string;
  status: StepStatus;
  detail?: string;
  ms?: number;
  kind: "step";
  order: number;
}

export interface TraceTool {
  id: string;
  name: string;
  label: string;
  status: "running" | "done" | "error" | "awaiting_approval";
  input?: unknown;
  output?: unknown;
  ms?: number;
  kind: "tool";
  order: number;
}

export type TraceItem = TraceStep | TraceTool;

export interface RunState {
  status: "idle" | "running" | "done" | "error";
  trace: TraceItem[];
  text: Record<string, string>;
  reasoning: string;
  data: Record<string, any>;
  approvals: ApprovalSummary[];
  error?: string;
  model?: string;
  provider?: "openrouter" | "local";
  ms?: number;
  startedAt?: number;
}

const initial: RunState = { status: "idle", trace: [], text: {}, reasoning: "", data: {}, approvals: [] };

export function useNarvoRun() {
  const { modelKey, lang } = usePrefs();
  const [state, setState] = useState<RunState>(initial);
  const abortRef = useRef<AbortController | null>(null);
  const orderRef = useRef(0);

  const apply = useCallback((e: NarvoEvent) => {
    setState((s) => {
      switch (e.type) {
        case "meta":
          return { ...s, model: e.model, provider: e.provider };
        case "step": {
          const idx = s.trace.findIndex((t) => t.kind === "step" && t.id === e.id);
          const item: TraceStep = {
            kind: "step",
            id: e.id,
            label: e.label,
            status: e.status,
            detail: e.detail,
            ms: e.ms,
            order: idx >= 0 ? s.trace[idx].order : orderRef.current++,
          };
          const trace = idx >= 0 ? s.trace.map((t, i) => (i === idx ? item : t)) : [...s.trace, item];
          return { ...s, trace };
        }
        case "tool": {
          const idx = s.trace.findIndex((t) => t.kind === "tool" && t.id === e.id);
          const item: TraceTool = {
            kind: "tool",
            id: e.id,
            name: e.name,
            label: e.label,
            status: e.status,
            input: e.input,
            output: e.output,
            ms: e.ms,
            order: idx >= 0 ? s.trace[idx].order : orderRef.current++,
          };
          const trace = idx >= 0 ? s.trace.map((t, i) => (i === idx ? item : t)) : [...s.trace, item];
          return { ...s, trace };
        }
        case "text":
          return { ...s, text: { ...s.text, [e.channel]: (s.text[e.channel] ?? "") + e.delta } };
        case "text-reset":
          return { ...s, text: { ...s.text, [e.channel]: "" } };
        case "reasoning":
          return { ...s, reasoning: s.reasoning + e.delta };
        case "data":
          return { ...s, data: { ...s.data, [e.key]: e.value } };
        case "approval":
          return { ...s, approvals: [...s.approvals.filter((a) => a.id !== e.approval.id), e.approval] };
        case "done":
          return { ...s, status: s.status === "error" ? "error" : "done", ms: e.ms };
        case "error":
          // Steps still spinning when the run fails did not complete — show them as failed.
          return {
            ...s,
            status: "error",
            error: e.message,
            trace: s.trace.map((t) => (t.status === "running" ? ({ ...t, status: "error" } as TraceItem) : t)),
          };
        default:
          return s;
      }
    });
  }, []);

  const start = useCallback(
    async (url: string, body: Record<string, unknown> = {}, opts: { keep?: boolean } = {}) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      orderRef.current = 0;
      setState((s) =>
        opts.keep
          ? { ...s, status: "running", error: undefined, startedAt: Date.now() }
          : { ...initial, status: "running", startedAt: Date.now() },
      );
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, modelKey, lang }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          const raw = await res.text().catch(() => res.statusText);
          let msg = raw;
          try {
            const j = JSON.parse(raw);
            msg = j.error?.message ?? j.error ?? j.message ?? raw;
          } catch {}
          apply({ type: "error", message: String(msg || `Request failed (${res.status})`) });
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            const line = part.split("\n").find((l) => l.startsWith("data:"));
            if (!line) continue;
            try {
              apply(JSON.parse(line.slice(5).trim()) as NarvoEvent);
            } catch {}
          }
        }
        setState((s) => (s.status === "running" ? { ...s, status: "done" } : s));
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        apply({ type: "error", message: (err as Error).message });
      }
    },
    [apply, modelKey, lang],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState(initial);
  }, []);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    setState((s) => ({ ...s, status: s.status === "running" ? "done" : s.status }));
  }, []);

  /** Update local approval status after the user decides inline. */
  const markApproval = useCallback((id: string, status: ApprovalSummary["status"]) => {
    setState((s) => ({
      ...s,
      approvals: s.approvals.map((a) => (a.id === id ? { ...a, status } : a)),
      // The tool step that requested this approval now shows the human decision.
      trace: s.trace.map((t) =>
        t.kind === "tool" && t.status === "awaiting_approval" && (t.output as { approvalId?: string } | undefined)?.approvalId === id
          ? { ...t, status: status === "approved" ? "done" : status === "rejected" ? "error" : t.status }
          : t,
      ),
    }));
  }, []);

  return { ...state, start, reset, abort, markApproval, running: state.status === "running" };
}

export type NarvoRun = ReturnType<typeof useNarvoRun>;

/** Simple JSON fetch helper that includes model + language preferences. */
export function useNarvoFetch() {
  const { modelKey, lang } = usePrefs();
  return useCallback(
    async <T = any>(url: string, body?: Record<string, unknown>, method: "GET" | "POST" = body ? "POST" : "GET"): Promise<T> => {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify({ ...body, modelKey, lang }) : undefined,
      });
      if (!res.ok) {
        const raw = await res.text().catch(() => res.statusText);
        let msg = raw;
        try {
          const j = JSON.parse(raw);
          msg = j.error?.message ?? j.error ?? j.message ?? raw;
        } catch {}
        throw new Error(String(msg || res.statusText));
      }
      return (await res.json()) as T;
    },
    [modelKey, lang],
  );
}
