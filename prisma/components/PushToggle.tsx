"use client";

import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { usePush } from "@/lib/usePush";

// 🔔 button (bottom-left, above the language picker) to switch phone notifications on/off.
// Shown only on the office screens, and only when the server has VAPID keys.
// (The cleaner and maintenance screens have their own bell in the header — see NotificationBell.)
const SCREENS = ["/coordinator", "/manager", "/ops", "/admin"];

export default function PushToggle() {
  const { tr } = useI18n();
  const path = usePathname() ?? "";
  const onScreen = SCREENS.some((p) => path.startsWith(p));
  const { status, msg, busy, enable, disable, sendTest } = usePush(onScreen);

  if (!onScreen || status === "loading" || status === "hidden") return null;

  const pill: React.CSSProperties = {
    border: "none", background: "transparent", fontSize: 12, padding: "5px 4px", cursor: "pointer", color: "inherit",
  };

  return (
    <div style={{
      position: "fixed", bottom: 48, left: 10, zIndex: 50, maxWidth: 260,
      background: "#fff", border: "1px solid var(--line)", borderRadius: 14, padding: "3px 10px",
      fontSize: 12, boxShadow: "0 2px 8px rgba(0,0,0,.12)",
    }}>
      {status === "off" && <button style={pill} disabled={busy} onClick={enable}>🔔 {tr("Enable notifications")}</button>}
      {status === "on" && (
        <span>
          🔔 {tr("Notifications on")} ·{" "}
          <button style={{ ...pill, textDecoration: "underline" }} disabled={busy} onClick={sendTest}>{tr("Send a test")}</button> ·{" "}
          <button style={{ ...pill, textDecoration: "underline" }} disabled={busy} onClick={disable}>{tr("Turn off")}</button>
        </span>
      )}
      {status === "blocked" && <span>🔕 {tr("Notifications are blocked in your browser settings.")}</span>}
      {status === "unsupported" && <span>🔕 {tr("Notifications are not supported here. On iPhone, add the app to your Home Screen first.")}</span>}
      {msg && <div style={{ fontSize: 11, color: "var(--ink-soft)", paddingBottom: 3 }}>{msg}</div>}
    </div>
  );
}
