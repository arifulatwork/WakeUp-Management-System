"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import { useI18n } from "@/lib/i18n";
import { usePush } from "@/lib/usePush";
import { useSession } from "@/lib/useSession";
import { HOME } from "@/lib/permissions";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { pushText, PushKey } from "@/lib/pushText";
import { timeAgo } from "@/lib/timeAgo";
import { setSoundEnabled, soundEnabled, unlockSound, playNotificationSound } from "@/lib/notifySound";

type Item = { id: string; key: string; params: Record<string, string | number>; url: string | null; read: boolean; createdAt: string };
const PAGE = 50;

// Full notification history for the signed-in person (cleaners, maintenance, office staff).
// Opened from the bell. Opening it marks everything as read; the green highlight stays
// for this visit so you can still see what was new.
export default function NotificationsPage() {
  const { tr, lang, locale } = useI18n();
  const router = useRouter();
  const session = useSession() as ({ role: string; area?: string } | null | undefined);
  const [items, setItems] = useState<Item[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [sound, setSound] = useState(true);
  const [, setTick] = useState(0); // keeps "5 min ago" counting
  const limit = useRef(PAGE);
  const newIds = useRef<Set<string>>(new Set()); // unread when first shown = highlighted
  const marked = useRef(false);
  const { status, msg, busy, enable, disable, sendTest } = usePush(true);
  const on = status === "on";

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/notifications?limit=${limit.current}`, { cache: "no-store" });
      if (!res.ok) return;
      const data: { items: Item[]; hasMore: boolean } = await res.json();
      data.items.forEach((i) => { if (!i.read) newIds.current.add(i.id); });
      setItems(data.items);
      setHasMore(!!data.hasMore);
      setLoaded(true);
      if (data.items.some((i) => !i.read) && !marked.current) {
        marked.current = true;
        await fetch("/api/notifications", { method: "POST" }).catch(() => {});
        marked.current = false;
      }
    } catch { /* offline: keep what we have */ }
  }, []);

  useEffect(() => { setSound(soundEnabled()); load(); }, [load]);
  useLiveRefresh(load, { models: ["notification"] });
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 30_000); return () => clearInterval(t); }, []);

  function flipSound() {
    const next = !sound;
    setSound(next);
    setSoundEnabled(next);
    if (next) { unlockSound(); playNotificationSound(); }
  }
  // Back = where you came from (the cleaner / maintenance screen). If the page was opened straight
  // from a phone notification there is nothing to go back to, so go to the person's own home screen.
  // Never to /login or the old onboarding page.
  function goBack() {
    let ref = "";
    try { ref = document.referrer ? new URL(document.referrer).pathname : ""; } catch { /* ignore */ }
    const cameFromApp = window.history.length > 1 && document.referrer.startsWith(window.location.origin)
      && !["", "/", "/login", "/onboarding"].includes(ref);
    if (cameFromApp) { router.back(); return; }
    const home = !session ? "/"   // "/" forwards signed-in people to their own screen
      : session.role === "worker" ? (session.area === "MAINTENANCE" ? "/maintenance" : "/cleaner")
      : HOME[session.role] ?? "/";
    router.push(home);
  }
  function showOlder() { limit.current += PAGE; load(); }

  const link: React.CSSProperties = {
    border: "none", background: "none", padding: "4px 0", fontSize: 13, color: "var(--ink)",
    textDecoration: "underline", cursor: "pointer", textAlign: "left",
  };

  return (
    <main style={{ maxWidth: 380, margin: "0 auto", padding: "20px 16px 60px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <Logo height={28} />
        <button type="button" onClick={goBack} style={{ fontSize: 11.5, padding: "5px 10px", borderRadius: 7, border: "1px solid var(--line)", background: "#fff", color: "var(--ink)", cursor: "pointer" }}>
          ← {tr("Back")}
        </button>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h1 style={{ fontSize: 17, margin: 0 }}>{tr("All notifications")}</h1>
        <button type="button" onClick={flipSound} aria-pressed={sound} style={{ ...link, textDecoration: "none", fontSize: 12.5 }}>
          {sound ? "🔊" : "🔇"} {sound ? tr("Sound on") : tr("Sound off")}
        </button>
      </div>

      <div style={{ border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden", background: "#fff" }}>
        {loaded && items.length === 0 && (
          <div style={{ padding: "24px 12px", color: "var(--ink-soft)", textAlign: "center", fontSize: 13 }}>{tr("No notifications yet")}</div>
        )}
        {items.map((n, i) => {
          const txt = pushText(n.key as PushKey, lang, n.params);
          return (
            <a
              key={n.id}
              href={n.url ?? "#"}
              style={{
                display: "block", padding: "10px 12px", textDecoration: "none", color: "var(--ink)", fontSize: 13,
                borderTop: i === 0 ? "none" : "1px solid var(--line)",
                background: newIds.current.has(n.id) ? "#f1f8ee" : "#fff",
              }}
            >
              <div style={{ fontWeight: 600 }}>{txt.title}</div>
              <div style={{ color: "var(--ink-soft)", marginTop: 1 }}>{txt.body}</div>
              <div style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 3 }}>
                {timeAgo(n.createdAt, locale)} · {new Date(n.createdAt).toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </div>
            </a>
          );
        })}
      </div>

      {hasMore && (
        <button type="button" onClick={showOlder} style={{ ...link, display: "block", margin: "12px auto 0", textDecoration: "none", fontWeight: 600 }}>
          {tr("Show older")}
        </button>
      )}

      <div style={{ marginTop: 22, padding: "12px", border: "1px solid var(--line)", borderRadius: 10, background: "#fff", display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
        <span style={{ fontSize: 11, color: "var(--ink-soft)", fontWeight: 600 }}>{tr("Phone alerts")}</span>
        {status === "loading" && <span style={{ color: "var(--ink-soft)" }}>{tr("Loading…")}</span>}
        {status === "off" && (
          <button style={{ ...link, textDecoration: "none", fontWeight: 600 }} disabled={busy} onClick={enable}>🔔 {tr("Enable notifications")}</button>
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
    </main>
  );
}
