"use client";

import { useEffect, useState } from "react";
import { can, Perm } from "@/lib/permissions";

export type ClientSession = { workerId: string; name: string; role: string };

// The signed-in manager / coordinator / admin (null = nobody, undefined = still loading).
export function useSession() {
  const [session, setSession] = useState<ClientSession | null | undefined>(undefined);
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then(setSession)
      .catch(() => setSession(null));
  }, []);
  return session;
}

// Hide buttons the person isn't allowed to use. (The server enforces it too.)
export function useCan(perm: Perm): boolean {
  const s = useSession();
  return !!s && can(s.role, perm);
}
