"use client";

import Logo from "@/components/Logo";
import NotificationBell from "@/components/NotificationBell";
import { useI18n } from "@/lib/i18n";

// Top of the cleaner / maintenance phone screens: logo, notifications bell and sign out.
export default function FieldHeader() {
  const { tr } = useI18n();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    ["workerId", "workerName", "workerArea"].forEach((k) => localStorage.removeItem(k));
    window.location.href = "/login";
  }
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
      <Logo height={28} />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <NotificationBell />
        <button
          onClick={logout}
          style={{ fontSize: 11.5, padding: "5px 10px", borderRadius: 7, border: "1px solid var(--line)", background: "#fff" }}
        >
          {tr("Sign out")}
        </button>
      </div>
    </div>
  );
}
