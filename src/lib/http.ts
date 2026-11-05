import { NextResponse } from "next/server";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const fail = (e: unknown, status = 500) => NextResponse.json({ error: String((e as Error)?.message || e) }, { status });

/** Server-sent events response driven by an async producer. */
export function sse(producer: (send: (event: string, data: unknown) => void, signal: AbortSignal) => Promise<void> | void, req: Request) {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };
      req.signal.addEventListener("abort", () => {
        closed = true;
        try { controller.close(); } catch {}
      });
      try {
        await producer(send, req.signal);
      } catch (e) {
        send("error", { message: String((e as Error)?.message || e) });
      }
      if (!closed) {
        closed = true;
        try { controller.close(); } catch {}
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}
