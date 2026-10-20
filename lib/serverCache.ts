import { NextRequest, NextResponse } from "next/server";
import { modelVersion } from "@/lib/events";

// SERVER CACHE — answers that stay valid until one of their tables is written to.
//
// Every write goes through notifyChange(model) (lib/events.ts), which bumps a counter for that
// table at once. A cached answer remembers the counters it was built from; if they have not
// moved it is returned straight from memory (no database round trip), otherwise it is rebuilt.
// So when 5 screens reload after one change, the database is asked ONCE instead of 5 times,
// and nothing is ever stale. Needs the app to run as one Node process (see lib/events.ts).

type Entry = { stamp: string; value: any };
const g = globalThis as unknown as { __wuCache?: Map<string, Entry>; __wuFlight?: Map<string, Promise<any>> };
const store = () => (g.__wuCache ??= new Map());
const flights = () => (g.__wuFlight ??= new Map());
const MAX_KEYS = 300;

export async function cachedValue<T>(key: string, models: string[], produce: () => Promise<T>, maxAgeMs = 0): Promise<T> {
  const stamp = modelVersion(models);
  const hit = store().get(key);
  if (hit && hit.stamp === stamp) return hit.value as T;
  void maxAgeMs;
  const fk = key + "|" + stamp;
  const running = flights().get(fk);
  if (running) return running as Promise<T>; // same question already being asked: share the answer
  const p = produce()
    .then((value) => {
      if (store().size >= MAX_KEYS) store().clear();
      store().set(key, { stamp, value }); // stamp taken BEFORE the query: a write meanwhile = rebuilt next time
      return value;
    })
    .finally(() => flights().delete(fk));
  flights().set(fk, p);
  return p;
}

// JSON answer with an ETag: a screen that asks again and has not missed any change gets a tiny 304.
export async function cachedJson(req: NextRequest, key: string, models: string[], produce: () => Promise<unknown>) {
  const { body, etag } = await cachedValue(key, models, async () => {
    const body = JSON.stringify(await produce());
    let h = 5381;
    for (let i = 0; i < body.length; i++) h = ((h << 5) + h + body.charCodeAt(i)) | 0;
    return { body, etag: `"${body.length.toString(36)}-${(h >>> 0).toString(36)}"` };
  });
  const headers = { ETag: etag, "Cache-Control": "private, no-cache" };
  if (req.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers });
  return new NextResponse(body, { headers: { ...headers, "Content-Type": "application/json" } });
}
