"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";

// Everything about phone notifications in one place, shared by the header bell
// (cleaner / maintenance) and the floating toggle (office screens).

export type PushStatus = "loading" | "hidden" | "unsupported" | "off" | "on" | "blocked";

function keyToBytes(base64Url: string): BufferSource {
  const pad = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const raw = atob((base64Url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out as BufferSource;
}

export function usePush(active = true) {
  const { tr } = useI18n();
  const [status, setStatus] = useState<PushStatus>("loading");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      const keyRes = await fetch("/api/push/key").catch(() => null);
      if (!keyRes || !keyRes.ok) return !cancelled && setStatus("hidden"); // not set up on the server
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        return !cancelled && setStatus("unsupported");
      }
      if (Notification.permission === "denied") return !cancelled && setStatus("blocked");
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!cancelled) setStatus(sub && Notification.permission === "granted" ? "on" : "off");
      } catch {
        if (!cancelled) setStatus("unsupported");
      }
    })();
    return () => { cancelled = true; };
  }, [active]);

  const workerId = () => (typeof window !== "undefined" ? localStorage.getItem("workerId") : null);

  async function enable() {
    setBusy(true);
    setMsg("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setStatus("blocked"); return; }
      const { key } = await (await fetch("/api/push/key")).json();
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(key) }));
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workerId: workerId(), subscription: sub.toJSON() }),
      });
      if (!res.ok) throw new Error("subscribe failed");
      setStatus("on");
    } catch {
      setMsg(tr("Could not turn on notifications."));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setStatus("off");
      setMsg("");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    const res = await fetch("/api/push/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workerId: workerId() }),
    }).catch(() => null);
    setMsg(res && res.ok ? tr("Test sent.") : tr("Could not turn on notifications."));
    setBusy(false);
  }

  return { status, msg, busy, enable, disable, sendTest };
}
