"use client";

import { useEffect, useState } from "react";
import { replayQueue, queueLength } from "@/lib/offlineQueue";

// Mounted once in the root layout. Three jobs:
//  1. Register the service worker (makes the app installable + lets
//     already-visited pages open with no signal at all).
//  2. Track online/offline state.
//  3. Replay the IndexedDB queue (see lib/offlineQueue.ts) whenever the
//     connection comes back, and show how many actions are still
//     waiting to sync so a cleaner isn't left guessing.
export default function OfflineBanner() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Non-fatal — app still works online, just without the
        // installable/offline-shell behavior.
      });
    }

    setOnline(navigator.onLine);
    refreshPending();

    async function handleOnline() {
      setOnline(true);
      setSyncing(true);
      await replayQueue();
      await refreshPending();
      setSyncing(false);
    }
    function handleOffline() {
      setOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Also try once on initial load, in case something was queued in a
    // previous session and the device is already back online.
    if (navigator.onLine) handleOnline();

    const poll = setInterval(refreshPending, 10000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(poll);
    };
  }, []);

  async function refreshPending() {
    setPending(await queueLength());
  }

  if (online && pending === 0) return null;

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        textAlign: "center",
        fontSize: 12,
        fontWeight: 600,
        padding: "7px 12px",
        color: "#fff",
        background: !online ? "#C1503C" : pending > 0 ? "#D98A33" : "#4F7A26",
      }}
    >
      {!online
        ? pending > 0
          ? `Offline — ${pending} action${pending === 1 ? "" : "s"} saved, will sync automatically`
          : "Offline — changes will be saved on this device"
        : syncing
        ? "Back online — syncing…"
        : `Syncing ${pending} pending action${pending === 1 ? "" : "s"}…`}
    </div>
  );
}
