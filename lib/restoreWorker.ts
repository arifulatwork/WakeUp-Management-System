// The cleaner / maintenance screens remember who you are in this browser (localStorage), but the
// REAL login is the cookie. The two can disagree (storage cleared, another tab signed out, the app
// installed on the Home Screen has its own storage...). When the browser has forgotten, ask the server
// who the cookie belongs to and remember it again, instead of showing "Please sign in first".
export async function restoreWorkerId(): Promise<string | null> {
  const saved = localStorage.getItem("workerId");
  if (saved) return saved;
  try {
    const res = await fetch("/api/auth/me", { cache: "no-store" });
    if (!res.ok) return null;
    const me = await res.json();
    if (!me?.workerId) return null;
    localStorage.setItem("workerId", me.workerId);
    localStorage.setItem("workerName", me.name ?? "");
    if (me.area) localStorage.setItem("workerArea", me.area);
    return me.workerId as string;
  } catch {
    return null; // offline and nothing saved
  }
}
