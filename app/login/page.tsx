"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n, Lang } from "@/lib/i18n";
import Logo from "@/components/Logo";

// One sign-in screen for EVERYONE: cleaners, maintenance, coordinators, managers and admins.
// Accounts are created by the Super Admin (Staff & Roles -> Add staff).
function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { tr, setLang } = useI18n();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const demo = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";

  // Arriving here means nobody is signed in on this screen: forget any previous person on this device.
  useEffect(() => {
    ["workerId", "workerName", "workerArea"].forEach((k) => localStorage.removeItem(k));
  }, []);

  async function handleSubmit(u = username, p = password) {
    if (!u.trim() || !p) return;
    setLoading(true);
    setError("");
    let res: Response;
    try {
      res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u, password: p }),
      });
    } catch {
      setLoading(false);
      setError(tr("No connection. Please try again."));
      return;
    }
    setLoading(false);
    if (!res.ok) {
      setError(tr("Incorrect username or password."));
      return;
    }
    const user = await res.json();

    // The field screens read who is signed in from here; the server uses the login cookie.
    localStorage.setItem("workerId", user.id);
    localStorage.setItem("workerName", user.name);
    localStorage.setItem("workerArea", user.area);
    // The person's saved language becomes the app language.
    if (user.language) setLang(user.language as Lang, { persist: false });

    const next = params.get("next");
    if (next && next.startsWith("/") && !next.startsWith("//")) router.push(next);
    else if (user.role === "admin") router.push("/admin");
    else if (user.role === "manager") router.push("/manager");
    else if (user.role === "coordinator") router.push("/coordinator");
    else router.push(user.area === "MAINTENANCE" ? "/maintenance" : "/cleaner");
  }

  return (
    <main style={{ maxWidth: 340, margin: "0 auto", padding: "56px 20px 40px" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
        <Logo height={84} />
      </div>
      <h1 style={{ fontSize: 19, marginBottom: 4 }}>{tr("Sign in")}</h1>
      <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 22 }}>
        {tr("Sign in with the username and password your administrator gave you.")}
      </p>

      <label style={label}>{tr("Username")}</label>
      <input style={input} value={username} onChange={(e) => setUsername(e.target.value)}
        autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="username"
        onKeyDown={(e) => e.key === "Enter" && handleSubmit()} />

      <label style={{ ...label, marginTop: 14 }}>{tr("Password")}</label>
      <div style={{ position: "relative" }}>
        <input style={{ ...input, paddingRight: 44 }} type={showPassword ? "text" : "password"} value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password" autoCapitalize="none" autoCorrect="off" spellCheck={false}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()} />
        <button type="button" onClick={() => setShowPassword((v) => !v)}
          aria-label={showPassword ? tr("Hide password") : tr("Show password")}
          aria-pressed={showPassword}
          title={showPassword ? tr("Hide password") : tr("Show password")}
          style={eyeBtn}>
          {showPassword ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
              <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>

      {error && <p style={{ color: "var(--red)", fontSize: 12.5, marginTop: 10 }}>{error}</p>}

      <button onClick={() => handleSubmit()} disabled={loading} style={btn}>
        {loading ? tr("Signing in…") : tr("Sign in")}
      </button>

      <p style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 14, textAlign: "center" }}>
        {tr("No account yet? Ask your administrator.")}
      </p>

      {demo && (
        <div style={{ marginTop: 28, paddingTop: 18, borderTop: "1px solid var(--line)" }}>
          <p style={{ fontSize: 11.5, color: "var(--ink-soft)", marginBottom: 8 }}>{tr("Demo — one-tap sign in")}</p>
          {[
            ["cristina", "Cristina", "Manager"],
            ["pedro", "Pedro", "Coordinator"],
            ["giuseppe", "Giuseppe", "Super Admin"],
            ["maria", "Maria", "Cleaning"],
            ["joao", "João", "Cleaning"],
            ["ivan", "Ivan", "Maintenance"],
          ].map(([u, name, role]) => (
            <button key={u} disabled={loading} onClick={() => handleSubmit(u, "changeme123")}
              style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 6, padding: "9px 12px", borderRadius: 8, border: "1px solid var(--line)", background: "#fff", fontSize: 13 }}>
              {name} — {tr(role)}
            </button>
          ))}
        </div>
      )}
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

const label: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 };
const input: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 14 };
const btn: React.CSSProperties = { width: "100%", padding: 12, borderRadius: 10, border: "none", background: "var(--ink)", color: "#fff", fontSize: 14, fontWeight: 600, marginTop: 20 };
const eyeBtn: React.CSSProperties = { position: "absolute", top: 0, right: 0, height: "100%", width: 42, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", color: "var(--ink-soft)", cursor: "pointer", padding: 0 };
