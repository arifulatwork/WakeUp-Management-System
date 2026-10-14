"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";

// Small floating pill shown only in demo mode, so nobody mistakes the
// presentation build for production — and the presenter can reset the
// data between client runs.
export default function DemoBadge() {
  const [busy, setBusy] = useState(false);
  const { tr } = useI18n();
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "false") return null;

  async function reset() {
    setBusy(true);
    await fetch("/api/demo/reset", { method: "POST" });
    window.location.reload();
  }

  return (
    <div style={{
      position: "fixed", bottom: 10, right: 10, zIndex: 50, display: "flex", alignItems: "center", gap: 8,
      background: "#111", color: "#fff", fontSize: 10.5, padding: "5px 6px 5px 11px", borderRadius: 999,
      opacity: 0.9, boxShadow: "0 2px 8px rgba(0,0,0,.25)",
    }}>
      <span style={{ fontWeight: 700, letterSpacing: 0.5 }}>● {tr("DEMO DATA")}</span>
      <button onClick={reset} disabled={busy} style={{
        border: "none", background: "#fff3", color: "#fff", fontSize: 10.5, padding: "3px 9px", borderRadius: 999, cursor: "pointer",
      }}>
        {busy ? "…" : tr("Reset")}
      </button>
    </div>
  );
}
