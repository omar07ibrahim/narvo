import "server-only";
import { getEndpoint, resolveModelId } from "./config";
import type { NarvoEvent, StepStatus } from "./events";

/**
 * Server helper: turn an async handler into a Server-Sent Events response.
 *
 *   return eventStream(req, async (emit) => {
 *     const s = emit.step("read", "Reading the application");
 *     ...
 *     s.done("14 fields extracted");
 *   });
 */

export interface Emitter {
  send(e: NarvoEvent): void;
  step(id: string, label: string, detail?: string): StepHandle;
  text(delta: string, channel?: string): void;
  /** Clear a streamed text channel on the client (e.g. a discarded draft). */
  resetText(channel?: string): void;
  reasoning(delta: string): void;
  data(key: string, value: unknown): void;
  signal: AbortSignal;
}

export interface StepHandle {
  done(detail?: string): void;
  error(detail?: string): void;
  waiting(detail?: string): void;
  update(detail: string): void;
}

export function eventStream(
  req: Request,
  handler: (emit: Emitter) => Promise<void>,
  opts: { modelKey?: string | null } = {},
): Response {
  const encoder = new TextEncoder();
  const started = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (e: NarvoEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          closed = true;
        }
      };

      const emit: Emitter = {
        send,
        signal: req.signal,
        step(id, label, detail) {
          const t0 = Date.now();
          send({ type: "step", id, label, status: "running", detail });
          const fin = (status: StepStatus, d?: string) =>
            send({ type: "step", id, label, status, detail: d ?? detail, ms: Date.now() - t0 });
          return {
            done: (d) => fin("done", d),
            error: (d) => fin("error", d),
            waiting: (d) => fin("waiting", d),
            update: (d) => send({ type: "step", id, label, status: "running", detail: d }),
          };
        },
        text(delta, channel = "main") {
          send({ type: "text", channel, delta });
        },
        resetText(channel = "main") {
          send({ type: "text-reset", channel });
        },
        reasoning(delta) {
          send({ type: "reasoning", delta });
        },
        data(key, value) {
          send({ type: "data", key, value });
        },
      };

      const { provider } = getEndpoint();
      send({ type: "meta", model: resolveModelId("main", opts.modelKey), provider });

      try {
        await handler(emit);
        send({ type: "done", ms: Date.now() - started });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[narvo] stream error:", message);
        send({ type: "error", message });
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

/** Parse the JSON body of a request, tolerating empty bodies. */
export async function readBody<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}
