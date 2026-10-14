"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { usePush } from "@/lib/usePush";

// Bell in the header of the cleaner / maintenance screens. Always visible; tapping it opens a
// small panel to turn phone notifications on or off (or explains why they can't be turned on).
export default function NotificationBell() {
  const { tr } = useI18n();
  const [open, setOpen] = useState(false);
  const { status, msg, busy, enable, disable, sendTest } = usePush(true);
  const on = status === "on";

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
        onClick={() => setOpen((o) => !o)}
        style={{
          position: "relative", width: 32, height: 28, fontSize: 14, borderRadius: 7,
          border: "1px solid var(--line)", background: "#fff", cursor: "pointer", padding: 0,
        }}
      >
        {on ? "🔔" : "🔕"}
        {on && <span style={{ position: "absolute", top: 3, right: 4, width: 7, height: 7, borderRadius: "50%", background: "var(--green-dark)" }} />}
      </button>

      {open && (
        <div style={{
          position: "absolute", right: 0, top: 34, zIndex: 60, width: 240, background: "#fff",
          border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px", fontSize: 12.5,
          boxShadow: "0 4px 14px rgba(0,0,0,.14)", display: "flex", flexDirection: "column", gap: 4,
        }}>
          <b style={{ fontSize: 12.5 }}>{tr("Notifications")}</b>
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
      )}
    </div>
  );
}
