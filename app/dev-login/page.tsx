"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n, Lang } from "@/lib/i18n";
import { AREA_RANK, cmpText } from "@/lib/sort";

// DEMO / DEV-ONLY convenience page — tap a seeded worker to open the app
// as them. Delete this route before real staff use the app: it has zero
// auth and lets anyone impersonate anyone.
type Worker = { id: string; name: string; area: string; role: string; language: string };

// With a real database this page is OFF unless NEXT_PUBLIC_ALLOW_DEV_LOGIN="true"
// (handy while testing on Supabase; set it to "false" before real staff use the app).
const DEV_LOGIN_OPEN =
  process.env.NEXT_PUBLIC_DEMO_MODE !== "false" || process.env.NEXT_PUBLIC_ALLOW_DEV_LOGIN === "true";

export default function DevLogin() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const router = useRouter();
  const { tr, ev, setLang } = useI18n();

  useEffect(() => {
    if (!DEV_LOGIN_OPEN) return;
    fetch("/api/workers")
      .then((r) => r.json())
      // Manager/Coordinator/Admin need a real session (see middleware.ts);
      // only field staff can be quick-logged-in this way.
      .then((all: Worker[]) =>
        setWorkers(
          all
            .filter((w) => w.role === "worker")
            .sort((a, b) => AREA_RANK[a.area] - AREA_RANK[b.area] || cmpText(a.name, b.name))
        )
      );
  }, []);

  function loginAs(w: Worker) {
    // The worker's saved profile language becomes the app language.
    setLang(w.language as Lang, { persist: false });
    localStorage.setItem("workerId", w.id);
    localStorage.setItem("workerName", w.name);
    localStorage.setItem("workerArea", w.area);
    router.push("/");
  }

  if (!DEV_LOGIN_OPEN) {
    return (
      <main style={{ maxWidth: 480, margin: "0 auto", padding: "32px 20px" }}>
        <p style={{ fontSize: 13 }}><a href="/">{tr("Back")}</a></p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: "32px 20px" }}>
      <h1 style={{ fontSize: 17, marginBottom: 2 }}>{tr("Staff quick login")}</h1>
      <p style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 20 }}>
        {tr("Tap a name to open the app as that person.")}{" "}
        {tr("Managers, coordinators and admins:")} <a href="/login">{tr("Sign in")}</a>
      </p>
      {workers.map((w) => (
        <button
          key={w.id}
          onClick={() => loginAs(w)}
          style={{
            display: "block", width: "100%", textAlign: "left", marginBottom: 8,
            padding: "10px 14px", borderRadius: 10, border: "1px solid var(--line)",
            background: "#fff", fontSize: 13,
          }}
        >
          <b>{w.name}</b>
          <span style={{ color: "var(--ink-soft)", marginLeft: 8 }}>
            {ev(w.area)} · {w.language.toUpperCase()}
          </span>
        </button>
      ))}
      {workers.length === 0 && (
        <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>{tr("No workers yet.")}</p>
      )}
    </main>
  );
}
