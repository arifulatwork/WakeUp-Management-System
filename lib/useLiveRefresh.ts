"use client";

import { useEffect, useRef } from "react";

// Reload a screen's data the moment something changes on the server.
//
//   useLiveRefresh(load)                               any change
//   useLiveRefresh(load, { models: ["auditLog"] })     only when those tables change
//
// While the live connection is up there is only a slow safety poll (60 s). If it drops
// (bad signal, server restart) the screen falls back to polling every 8 s, and
// reloads once when the connection comes back.
const IGNORED_BY_DEFAULT = new Set(["auditLog", "pushSubscription", "notification"]);

export function useLiveRefresh(load: () => void, opts: { models?: string[] } = {}) {
  const latest = useRef(load);
  latest.current = load;
  const modelsKey = (opts.models ?? []).join(",");

  useEffect(() => {
    const wanted = modelsKey ? modelsKey.split(",") : null;
    let es: EventSource | null = null;
    let connected = false;
    let seenHello = false;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    let poll: ReturnType<typeof setInterval> | undefined;

    const run = () => {
      if (document.visibilityState === "hidden") return; // catch up when the tab comes back
      latest.current();
    };
    const soon = () => { clearTimeout(debounce); debounce = setTimeout(run, 200); };
    const startPoll = () => { clearInterval(poll); poll = setInterval(run, connected ? 60_000 : 8_000); };

    if (typeof EventSource !== "undefined") {
      es = new EventSource("/api/events");
      es.addEventListener("hello", () => {
        connected = true;
        startPoll();
        if (seenHello) soon(); // reconnected: we may have missed something
        seenHello = true;
      });
      es.addEventListener("change", (e) => {
        let models: string[] = [];
        try { models = JSON.parse((e as MessageEvent).data).models ?? []; } catch { /* reload anyway */ }
        const relevant = wanted
          ? models.some((m) => wanted.includes(m))
          : models.some((m) => !IGNORED_BY_DEFAULT.has(m));
        if (relevant || models.length === 0) soon();
      });
      es.onerror = () => { connected = false; startPoll(); };
    }
    startPoll();

    const onVisible = () => { if (document.visibilityState === "visible") soon(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      es?.close();
      clearTimeout(debounce);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [modelsKey]);
}
