"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { playNotificationSound, unlockSound } from "@/lib/notifySound";

// Bell in the header of the cleaner / maintenance screens.
//  - A red badge counts unread notifications.
//  - A sound plays when a new one arrives while the app is open.
//  - Tapping the bell opens the full page (/notifications) with every notification,
//    the sound switch and the phone-alert (push) switch.
export default function NotificationBell() {
  const { tr } = useI18n();
  const [unread, setUnread] = useState(0);
  const seen = useRef<Set<string> | null>(null); // null = first load (never beep for old ones)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data: { items: { id: string; read: boolean }[]; unread: number } = await res.json();
      if (seen.current) {
        const fresh = data.items.filter((i) => !seen.current!.has(i.id) && !i.read);
        if (fresh.length) playNotificationSound();
      }
      seen.current = new Set(data.items.map((i) => i.id));
      setUnread(data.unread);
    } catch { /* offline: keep what we have */ }
  }, []);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load, { models: ["notification"] });

  // Browsers keep sound locked until the first touch: unlock it then.
  useEffect(() => {
    const unlock = () => unlockSound();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => { window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
  }, []);

  return (
    <a
      href="/notifications"
      aria-label={tr("Notifications")}
      style={{
        position: "relative", width: 32, height: 28, fontSize: 14, borderRadius: 7,
        border: "1px solid var(--line)", background: "#fff", display: "flex",
        alignItems: "center", justifyContent: "center", textDecoration: "none",
      }}
    >
      🔔
      {unread > 0 && (
        <span style={{
          position: "absolute", top: -6, right: -6, minWidth: 16, height: 16, padding: "0 4px", borderRadius: 8,
          background: "#d93025", color: "#fff", fontSize: 10, fontWeight: 700, lineHeight: "16px", textAlign: "center",
        }}>{unread > 9 ? "9+" : unread}</span>
      )}
    </a>
  );
}
