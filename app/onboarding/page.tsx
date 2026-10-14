"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n, Lang } from "@/lib/i18n";

const LANGUAGES = [
  { code: "pt", label: "Português" },
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "it", label: "Italiano" },
  { code: "uk", label: "Українська" },
];

export default function Onboarding() {
  const router = useRouter();
  const [name, setName] = useState("");
  // The language pills switch the whole app immediately.
  const { lang, setLang, tr } = useI18n();
  const language: string = lang;
  const setLanguage = (c: string) => setLang(c as Lang, { persist: false });
  const [area, setArea] = useState<"CLEANING" | "MAINTENANCE" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (!name.trim() || !area) {
      setError(tr("Please enter your name and choose an area."));
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/workers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), language, area }),
      });
      if (!res.ok) throw new Error("Could not create worker");
      const worker = await res.json();

      // Saved on-device — this is the "unique ID" referenced in every
      // checklist/ticket this worker submits from now on.
      localStorage.setItem("workerId", worker.id);
      localStorage.setItem("workerName", worker.name);
      localStorage.setItem("workerArea", worker.area);

      // New workers always start with role "worker" — Super Admin can
      // promote anyone to manager/coordinator/admin later from /admin,
      // and the root page will route them correctly on their next visit.
      router.push(area === "CLEANING" ? "/cleaner" : "/maintenance");
    } catch (e) {
      setError(tr("Something went wrong. Please try again."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 360, margin: "0 auto", padding: "40px 20px" }}>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>{tr("Welcome")}</h1>
      <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 24 }}>
        {tr("This only happens once — it creates your worker ID.")}
      </p>

      <label style={label}>{tr("Your name")}</label>
      <input
        style={input}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={tr("e.g. Maria Costa")}
      />

      <label style={{ ...label, marginTop: 16 }}>{tr("Language")}</label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {LANGUAGES.map((l) => (
          <button
            key={l.code}
            onClick={() => setLanguage(l.code)}
            style={pill(language === l.code)}
          >
            {l.label}
          </button>
        ))}
      </div>

      <label style={label}>{tr("Your area")}</label>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
        <button onClick={() => setArea("CLEANING")} style={areaCard(area === "CLEANING")}>
          {tr("🧹 Cleaning Team")}
        </button>
        <button onClick={() => setArea("MAINTENANCE")} style={areaCard(area === "MAINTENANCE")}>
          {tr("🔧 Maintenance Team")}
        </button>
      </div>

      {error && <p style={{ color: "var(--red)", fontSize: 13 }}>{error}</p>}

      <button onClick={handleSubmit} disabled={loading} style={submitBtn}>
        {loading ? tr("Setting up…") : tr("Continue")}
      </button>
    </main>
  );
}

const label: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 };
const input: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 14,
};
const pill = (on: boolean): React.CSSProperties => ({
  padding: "7px 14px", borderRadius: 999, border: "1px solid var(--line)", fontSize: 12,
  background: on ? "var(--ink)" : "#fff", color: on ? "#fff" : "var(--ink-soft)",
});
const areaCard = (on: boolean): React.CSSProperties => ({
  padding: "14px", borderRadius: 10, border: `1px solid ${on ? "var(--green-dark)" : "var(--line)"}`,
  background: on ? "var(--green-bg)" : "#fff", fontSize: 14, textAlign: "left",
});
const submitBtn: React.CSSProperties = {
  width: "100%", padding: 12, borderRadius: 10, border: "none", background: "var(--ink)",
  color: "#fff", fontSize: 14, fontWeight: 600,
};
