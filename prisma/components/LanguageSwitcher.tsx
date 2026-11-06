"use client";

import { LANGS, useI18n, Lang } from "@/lib/i18n";

// Always-visible language picker (bottom-left). Changing it re-renders
// every screen instantly — no reload, no re-onboarding.
export default function LanguageSwitcher() {
  const { lang, setLang, tr } = useI18n();
  return (
    <label style={{
      position: "fixed", bottom: 10, left: 10, zIndex: 50, display: "flex", alignItems: "center", gap: 4,
      background: "#fff", border: "1px solid var(--line)", borderRadius: 999, padding: "3px 6px 3px 10px",
      fontSize: 12, boxShadow: "0 2px 8px rgba(0,0,0,.12)",
    }}>
      <span aria-hidden>🌐</span>
      <select
        aria-label={tr("Language")}
        value={lang}
        onChange={(e) => setLang(e.target.value as Lang)}
        style={{ border: "none", background: "transparent", fontSize: 12, padding: "4px 2px", cursor: "pointer" }}
      >
        {LANGS.map((l) => (
          <option key={l.code} value={l.code}>{l.label}</option>
        ))}
      </select>
    </label>
  );
}
