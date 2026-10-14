// Offline queue for mutating requests (PATCH/POST) made from the field
// apps. Cleaners and maintenance workers are often inside houses with
// poor signal — losing a checklist tick or a "mark ready" because the
// request silently failed is exactly the kind of bug that makes people
// distrust the app and go back to WhatsApp. This fixes that:
//
//   - queueFetch() tries the real request first.
//   - If it fails (offline, DNS error, timeout — NOT a 4xx/5xx from the
//     server, those are real errors and are returned as-is), the
//     request is saved to IndexedDB and queueFetch resolves with a
//     synthetic { queued: true } response so the UI can show "Saved —
//     will sync" instead of breaking.
//   - replayQueue() is called on page load and on the browser's
//     'online' event, and resends everything in order.
//
// Deliberately NOT using the Background Sync API — iOS Safari doesn't
// support it, and this app needs to work on whatever phone a cleaner
// has. Replaying on 'online' + on page load covers the same cases with
// no browser-support gaps.

const DB_NAME = "wakeup-offline";
const STORE = "queue";

type QueuedRequest = {
  id?: number;
  url: string;
  method: string;
  body: string;
  queuedAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function addToQueue(entry: Omit<QueuedRequest, "id">): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getQueue(): Promise<QueuedRequest[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as QueuedRequest[]);
    req.onerror = () => reject(req.error);
  });
}

async function removeFromQueue(id: number): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Drop-in replacement for fetch() on mutating JSON requests. Always
// resolves (never throws from a network failure) so callers can do
// optimistic UI updates without a try/catch around every call.
export async function queueFetch(
  url: string,
  options: { method: string; body: string; headers?: Record<string, string> }
): Promise<{ ok: boolean; queued: boolean; json: () => Promise<any> }> {
  try {
    const res = await fetch(url, {
      method: options.method,
      headers: { "Content-Type": "application/json", ...options.headers },
      body: options.body,
    });
    if (res.status === 401) {
      // Login expired: keep the action, send the person to sign in, and it replays afterwards.
      await addToQueue({ url, method: options.method, body: options.body, queuedAt: Date.now() });
      if (typeof window !== "undefined") window.location.href = "/login";
      return { ok: true, queued: true, json: async () => ({}) };
    }
    return { ok: res.ok, queued: false, json: () => res.json() };
  } catch {
    // Network-level failure (offline, DNS, timeout) — not a server
    // error. Queue it and tell the caller it's pending, not failed.
    await addToQueue({ url, method: options.method, body: options.body, queuedAt: Date.now() });
    return { ok: true, queued: true, json: async () => ({}) };
  }
}

export async function queueLength(): Promise<number> {
  try {
    return (await getQueue()).length;
  } catch {
    return 0;
  }
}

// Replays every queued request in order. Stops and keeps the remaining
// queue intact if a request still fails for a network reason (so it
// tries again next time); drops a request only once the server has
// actually accepted or rejected it.
export async function replayQueue(): Promise<{ replayed: number; remaining: number }> {
  let replayed = 0;
  let queue: QueuedRequest[];
  try {
    queue = await getQueue();
  } catch {
    return { replayed: 0, remaining: 0 };
  }

  for (const entry of queue.sort((a, b) => a.queuedAt - b.queuedAt)) {
    try {
      const res = await fetch(entry.url, {
        method: entry.method,
        headers: { "Content-Type": "application/json" },
        body: entry.body,
      });
      // Not signed in (yet): keep everything queued; it is sent after the next login.
      if (res.status === 401) break;
      if (entry.id !== undefined) await removeFromQueue(entry.id);
      replayed++;
    } catch {
      // Still offline — stop here, leave the rest queued for next time.
      break;
    }
  }

  const remaining = await queueLength();
  return { replayed, remaining };
}
