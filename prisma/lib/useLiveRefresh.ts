"use client";

import { useEffect, useRef } from "react";

// Reload a screen's data the moment something changes on the server.
//
//   useLiveRefresh(load)                               any change
//   useLiveRefresh(load, { models: ["auditLog"] })     only when those tables change
//
// ONE live connection (EventSource) is shared by everything open in this browser tab.
// Browsers allow only ~6 connections per site over HTTP/1.1 (what `npm run dev` and a
// plain `npm start` use). When every hook opened its own stream, a few tabs used them all
// up and later requests waited forever, so screens stopped updating until a reload.
//
// While the connection is up there is only a slow safety poll (60 s). If it drops
// (bad signal, server restart) each screen falls back to polling every 8 s, and
// reloads once when the connection comes back.
const IGNORED_BY_DEFAULT = new Set(["auditLog", "pushSubscription", "notification"]);

type Hub = {
  onChange: Set<(models: string[]) => void>;
  onState: Set<(connected: boolean, reconnected: boolean) => void>;
  es: EventSource | null;
  connected: boolean;
  seenHello: boolean;
};
const hub: Hub = { onChange: new Set(), onState: new Set(), es: null, connected: false, seenHello: false };

function openHub() {
  if (hub.es || typeof EventSource === "undefined") return;
  const es = new EventSource("/api/events");
  hub.es = es;
  es.addEventListener("hello", () => {
    const reconnected = hub.seenHello;
    hub.seenHello = true;
    hub.connected = true;
    hub.onState.forEach((f) => f(true, reconnected));
  });
  es.addEventListener("change", (e) => {
    let models: string[] = [];
    try { models = JSON.parse((e as MessageEvent).data).models ?? []; } catch { /* reload anyway */ }
    hub.onChange.forEach((f) => f(models));
  });
  es.onerror = () => {
    hub.connected = false;
    hub.onState.forEach((f) => f(false, false));
  };
}

function closeHubIfIdle() {
  if (hub.onChange.size || hub.onState.size || !hub.es) return;
  hub.es.close();
  hub.es = null;
  hub.connected = false;
  hub.seenHello = false;
}

export function useLiveRefresh(load: () => void, opts: { models?: string[] } = {}) {
  const latest = useRef(load);
  latest.current = load;
  const modelsKey = (opts.models ?? []).join(",");

  useEffect(() => {
    const wanted = modelsKey ? modelsKey.split(",") : null;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    let poll: ReturnType<typeof setInterval> | undefined;

    const run = () => {
      if (document.visibilityState === "hidden") return; // catch up when the tab comes back
      latest.current();
    };
    const soon = () => { clearTimeout(debounce); debounce = setTimeout(run, 40); };
    const startPoll = (connected: boolean) => { clearInterval(poll); poll = setInterval(run, connected ? 60_000 : 8_000); };

    const onChange = (models: string[]) => {
      const relevant = wanted
        ? models.some((m) => wanted.includes(m))
        : models.some((m) => !IGNORED_BY_DEFAULT.has(m));
      if (relevant || models.length === 0) soon();
    };
    const onState = (connected: boolean, reconnected: boolean) => {
      startPoll(connected);
      if (connected && reconnected) soon(); // we may have missed something while offline
    };

    hub.onChange.add(onChange);
    hub.onState.add(onState);
    openHub();
    startPoll(hub.connected);

    const onVisible = () => { if (document.visibilityState === "visible") soon(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      hub.onChange.delete(onChange);
      hub.onState.delete(onState);
      closeHubIfIdle();
      clearTimeout(debounce);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [modelsKey]);
}
