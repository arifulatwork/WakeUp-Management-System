"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { HOME } from "@/lib/permissions";

// "/" is not a screen any more (the old "create your worker ID" onboarding is gone: accounts are
// made by the Super Admin). It only sends each person to their own screen:
//   signed in  -> their home (cleaner / maintenance / coordinator / manager / admin / student / supplier)
//   signed out -> /login
// The middleware sends people who are already signed in away from /login to here, so this page
// must never send a signed-in person back to /login (that would loop).
export default function Root() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const go = (to: string) => { if (!cancelled) router.replace(to); };
    const homeOf = (me: { role: string; area?: string }) =>
      me.role === "worker" ? (me.area === "MAINTENANCE" ? "/maintenance" : "/cleaner") : HOME[me.role] ?? "/login";

    (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (res.ok) return go(homeOf(await res.json()));
        // 401 with a cookie that still verifies = the account was removed. Clear the cookie, otherwise
        // /login would bounce straight back here.
        await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
        go("/login");
      } catch {
        // Offline: use what this phone remembers from the last sign-in.
        const area = localStorage.getItem("workerArea");
        go(localStorage.getItem("workerId") ? (area === "MAINTENANCE" ? "/maintenance" : "/cleaner") : "/login");
      }
    })();
    return () => { cancelled = true; };
  }, [router]);

  return null;
}
