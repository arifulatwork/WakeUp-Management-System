import { NextRequest } from "next/server";
import { subscribe } from "@/lib/events";

// GET /api/events — Server-Sent Events. The browser keeps this open; whenever data
// changes it receives `event: change` with the list of changed tables, and reloads.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const enc = new TextEncoder();
  let unsub = () => {};
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const stop = () => { clearInterval(heartbeat); unsub(); };

  const stream = new ReadableStream({
    start(controller) {
      const send = (s: string) => { try { controller.enqueue(enc.encode(s)); } catch { stop(); } };
      send("retry: 3000\n\n");
      send("event: hello\ndata: {}\n\n");
      unsub = subscribe((models) => send(`event: change\ndata: ${JSON.stringify({ models })}\n\n`));
      // A comment line every 25 s keeps phones, proxies and Wi-Fi from closing an idle connection.
      heartbeat = setInterval(() => send(": ping\n\n"), 25_000);
      req.signal.addEventListener("abort", () => { stop(); try { controller.close(); } catch { /* already closed */ } });
    },
    cancel: stop,
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // nginx: don't buffer
    },
  });
}
