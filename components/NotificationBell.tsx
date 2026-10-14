"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { usePush } from "@/lib/usePush";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { pushText, PushKey } from "@/lib/pushText";
import { timeAgo } from "@/lib/timeAgo";
import { playNotificationSound, setSoundEnabled, soundEnabled, unlockSound } from "@/lib/notifySound";

type Item = { id: string; key: string; params: Record<string, string | number>; url: string | null; read: boolean; createdAt: string };

// Bell in the header of the cleaner / maintenance screens.
//  - A red badge counts unread notifications.
//  - A sound plays when a new one arrives while the app is open.
//  - Tapping the bell lists all past and present notifications ("20 minutes ago", "1 hour ago"),
//    newest first, and marks them as read.
//  - The same panel still has the phone-alert (push) on/off switch.
export default function NotificationBell() {
  const { tr, lang, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const [sound, setSound] = useState(true);
  const [, setTick] = useState(0); // re-render so "5 min ago" keeps counting
  const seen = useRef<Set<string> | null>(null); // null = first load (never beep for old ones)
  const { status, msg, busy, enable, disable, sendTest } = usePush(true);
  const on = status === "on";

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data: { items: Item[]; unread: number } = await res.json();
      const ids = new Set(data.items.map((i) => i.id));
      if (seen.current) {
        const fresh = data.items.filter((i) => !seen.current!.has(i.id) && !i.read);
        if (fresh.length) playNotificationSound();
      }
      seen.current = ids;
      setItems(data.items);
      setUnread(data.unread);
    } catch { /* offline: keep what we have */ }
  }, []);

  useEffect(() => { setSound(soundEnabled()); }, []);
  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load, { models: ["notification"] });

  // Browsers keep sound locked until the first touch: unlock it then.
  useEffect(() => {
    const unlock = () => unlockSound();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => { window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      load();
      if (unread > 0) {
        await fetch("/api/notifications", { method: "POST" }).catch(() => {});
        // keep the "new" highlight for this opening, clear the badge
        setUnread(0);
      }
    }
  }

  function flipSound() {
    const next = !sound;
    setSound(next);
    setSoundEnabled(next);
    if (next) { unlockSound(); playNotificationSound(); }
  }

  const link: React.CSSProperties = {
    border: "none", background: "none", padding: "4px 0", fontSize: 12.5, color: "var(--ink)",
    textDecoration: "underline", cursor: "pointer", textAlign: "left",
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        aria-label={tr("Notifications")}
        aria-expanded={open}
        onClick={toggle}
        style={{
          position: "relative", width: 32, height: 28, fontSize: 14, borderRadius: 7,
          border: "1px solid var(--line)", background: "#fff", cursor: "pointer", padding: 0,
        }}
      >
        🔔
        {unread > 0 && (
          <span style={{
            position: "absolute", top: -6, right: -6, minWidth: 16, height: 16, padding: "0 4px", borderRadius: 8,
            background: "#d93025", color: "#fff", fontSize: 10, fontWeight: 700, lineHeight: "16px", textAlign: "center",
          }}>{unread > 9 ? "9+" : unread}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "absolute", right: 0, top: 34, zIndex: 60, width: 290, maxWidth: "calc(100vw - 24px)", background: "#fff",
          border: "1px solid var(--line)", borderRadius: 10, fontSize: 12.5,
          boxShadow: "0 4px 14px rgba(0,0,0,.14)", display: "flex", flexDirection: "column",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px 6px" }}>
            <b>{tr("Notifications")}</b>
            <button type="button" onClick={flipSound} style={{ ...link, textDecoration: "none", fontSize: 12 }} aria-pressed={sound}>
              {sound ? "🔊" : "🔇"} {sound ? tr("Sound on") : tr("Sound off")}
            </button>
          </div>

          <div style={{ maxHeight: 320, overflowY: "auto", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
            {items.length === 0 && (
              <div style={{ padding: "16px 12px", color: "var(--ink-soft)", textAlign: "center" }}>{tr("No notifications yet")}</div>
            )}
            {items.map((n) => {
              const txt = pushText(n.key as PushKey, lang, n.params);
              return (
                <a
                  key={n.id}
                  href={n.url ?? "#"}
                  style={{
                    display: "block", padding: "8px 12px", textDecoration: "none", color: "var(--ink)",
                    borderBottom: "1px solid var(--line)", background: n.read ? "#fff" : "#f1f8ee",
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{txt.title}</div>
                  <div style={{ color: "var(--ink-soft)", marginTop: 1 }}>{txt.body}</div>
                  <div style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 3 }}>{timeAgo(n.createdAt, locale)}</div>
                </a>
              );
            })}
          </div>

          <div style={{ padding: "8px 12px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, color: "var(--ink-soft)", fontWeight: 600 }}>{tr("Phone alerts")}</span>
            {status === "loading" && <span style={{ color: "var(--ink-soft)" }}>{tr("Loading…")}</span>}
            {status === "off" && (
              <button style={{ ...link, textDecoration: "none", fontWeight: 600 }} disabled={busy} onClick={enable}>
                🔔 {tr("Enable notifications")}
              </button>
            )}
            {on && (
              <>
                <span style={{ color: "var(--green-dark)", fontWeight: 600 }}>✓ {tr("Notifications on")}</span>
                <button style={link} disabled={busy} onClick={sendTest}>{tr("Send a test")}</button>
                <button style={link} disabled={busy} onClick={disable}>{tr("Turn off")}</button>
              </>
            )}
            {status === "blocked" && <span style={{ color: "var(--ink-soft)" }}>{tr("Notifications are blocked in your browser settings.")}</span>}
            {status === "unsupported" && <span style={{ color: "var(--ink-soft)" }}>{tr("Notifications are not supported here. On iPhone, add the app to your Home Screen first.")}</span>}
            {status === "hidden" && <span style={{ color: "var(--ink-soft)" }}>{tr("Notifications are not set up on the server yet.")}</span>}
            {msg && <span style={{ fontSize: 11, color: "var(--ink-soft)" }}>{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
