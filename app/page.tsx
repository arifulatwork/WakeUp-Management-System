"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useI18n, Lang } from "@/lib/i18n";
import Logo from "@/components/Logo";

// Everyone signs in. This page only decides where to send you:
//   no login           -> /login
//   admin / manager / coordinator -> their office screen
//   cleaner / maintenance          -> their phone screen
export default function Home() {
  const router = useRouter();
  const { tr, setLang } = useI18n();

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((s) => {
        if (!s) return router.replace("/login");
        // Keep the field screens in step with the person who is actually signed in.
        localStorage.setItem("workerId", s.workerId);
        localStorage.setItem("workerName", s.name);
        if (s.area) localStorage.setItem("workerArea", s.area);
        if (s.language) setLang(s.language as Lang, { persist: false });
        if (s.role === "admin") return router.replace("/admin");
        if (s.role === "manager") return router.replace("/manager");
        if (s.role === "coordinator") return router.replace("/coordinator");
        router.replace(s.area === "MAINTENANCE" ? "/maintenance" : "/cleaner");
      })
      .catch(() => router.replace("/login"));
  }, [router, setLang]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 120, gap: 18 }}>
      <Logo height={64} />
      <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>{tr("Loading…")}</p>
    </div>
  );
}
