import { EventEmitter } from "node:events";
import { Client } from "pg";
import { env } from "@/lib/env";
import { CHANNEL, type AppEvent } from "./events";

// One LISTEN connection per server process fans pg_notify events out to
// every open SSE stream. Reconnects with a short delay if the link drops.
type Hub = { emitter: EventEmitter; client: Client | null; connecting: Promise<void> | null };
const g = globalThis as unknown as { realtimeHub?: Hub };

function hub(): Hub {
  if (!g.realtimeHub) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(0);
    g.realtimeHub = { emitter, client: null, connecting: null };
  }
  return g.realtimeHub;
}

async function connect(h: Hub) {
  const client = new Client({ connectionString: env().DATABASE_URL });
  client.on("notification", (msg) => {
    if (msg.channel !== CHANNEL || !msg.payload) return;
    try {
      h.emitter.emit("event", JSON.parse(msg.payload) as AppEvent);
    } catch {}
  });
  const retry = () => {
    if (h.client !== client) return;
    h.client = null;
    client.end().catch(() => {});
    setTimeout(() => ensureListening().catch(() => {}), 2000);
  };
  client.on("error", retry);
  client.on("end", retry);
  await client.connect();
  await client.query(`LISTEN ${CHANNEL}`);
  h.client = client;
}

export function ensureListening(): Promise<void> {
  const h = hub();
  if (h.client) return Promise.resolve();
  h.connecting ??= connect(h).finally(() => {
    h.connecting = null;
  });
  return h.connecting;
}

// Every event; callers filter.
export async function subscribeAll(fn: (e: AppEvent) => void) {
  await ensureListening();
  const h = hub();
  h.emitter.on("event", fn);
  return () => {
    h.emitter.off("event", fn);
  };
}

export async function stopListening() {
  const h = hub();
  const c = h.client;
  h.client = null;
  await c?.end().catch(() => {});
}

const encoder = new TextEncoder();
const PING_MS = 25_000;

// Server-sent events stream. `filter` maps an event to what this
// client may see (or null to skip it).
export function sseResponse(req: Request, filter: (e: AppEvent) => object | null) {
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const unsubscribe = await subscribeAll((e) => {
        const out = filter(e);
        if (out) send(`data: ${JSON.stringify(out)}\n\n`);
      });
      const ping = setInterval(() => send(": ping\n\n"), PING_MS);
      cleanup = () => {
        clearInterval(ping);
        unsubscribe();
        try {
          controller.close();
        } catch {}
      };
      req.signal.addEventListener("abort", () => cleanup());
      send("retry: 3000\n\n: ready\n\n");
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
