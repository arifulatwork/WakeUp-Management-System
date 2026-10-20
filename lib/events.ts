// LIVE UPDATES — a tiny in-process "something changed" bus.
//
// Every write to the database (demo or Postgres) calls notifyChange(model). Screens
// that are open hold a Server-Sent-Events connection (GET /api/events); the server
// pings them with the names of the tables that changed and each screen reloads its
// own data. No data travels in the ping, so nothing private leaks through it.
//
// This works while the app runs as ONE Node process (npm start on your Pi / Ubuntu
// server — the plan). If you ever run several copies behind a load balancer, swap
// this file for Postgres LISTEN/NOTIFY or Supabase Realtime; nothing else changes.

type Listener = (models: string[]) => void;
type Bus = { listeners: Set<Listener>; pending: Set<string>; timer: ReturnType<typeof setTimeout> | null };
const g = globalThis as unknown as { __wuBus?: Bus };
const bus = (): Bus => (g.__wuBus ??= { listeners: new Set(), pending: new Set(), timer: null });

// Per-table change counters, bumped IMMEDIATELY on every write (not batched). lib/serverCache.ts
// compares them to know whether a cached answer is still valid.
const versions = (): Record<string, number> => ((globalThis as any).__wuVersions ??= {});
export const modelVersion = (models: string[]) => models.map((m) => versions()[m] ?? 0).join(".");

// Changes are grouped for 30 ms so a burst of writes becomes one ping.
export function notifyChange(...models: string[]) {
  const b = bus();
  models.forEach((m) => { versions()[m] = (versions()[m] ?? 0) + 1; b.pending.add(m); });
  if (b.timer) return;
  b.timer = setTimeout(() => {
    const batch = Array.from(b.pending);
    b.pending.clear();
    b.timer = null;
    b.listeners.forEach((l) => {
      try { l(batch); } catch { /* a dead connection must not stop the others */ }
    });
  }, 30);
}

export function subscribe(l: Listener): () => void {
  const b = bus();
  b.listeners.add(l);
  return () => { b.listeners.delete(l); };
}
