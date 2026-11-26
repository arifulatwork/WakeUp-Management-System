"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { useI18n } from "@/lib/i18n";
import { S } from "@/components/ui";

// Small pieces shared by the management screens (Admin, Manager, ...):
// progressive loading, placeholders, load errors and the "saved" message.

// Load one list on its own, and again whenever those tables change on the server.
// `url = null` means "don't load (yet)". A refresh never blanks the screen: old rows stay until new ones arrive.
export function useApiList<T>(url: string | null, models: string[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!url) return;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      setData(await res.json());
      setError(false);
    } catch {
      setError(true);
    }
  }, [url]);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load, { models });

  // mutate: change the list on screen at once (before the server has answered).
  return { data, error, reload: load, mutate: setData };
}

// Grey placeholder rows while a tab loads: the card header is already usable.
export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-live="polite" style={{ padding: 16, display: "grid", gap: 12 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skel" style={{ height: 14, width: `${92 - (i % 3) * 14}%` }} />
      ))}
    </div>
  );
}

export function LoadError({ onRetry }: { onRetry: () => void }) {
  const { tr } = useI18n();
  return (
    <div role="alert" style={{ padding: 20, textAlign: "center" }}>
      <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--red)" }}>{tr("Could not load this section. Check your connection.")}</p>
      <button style={S.small} onClick={onRetry}>{tr("Try again")}</button>
    </div>
  );
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p style={{ color: "var(--ink-soft)", padding: 16, margin: 0, fontSize: 13 }}>{children}</p>;
}

// Small confirmation message at the bottom of the screen ("Saved", "Could not save…").
export function useToast() {
  const [msg, setMsg] = useState<{ text: string; ok: boolean; n: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = useCallback((text: string, ok = true) => {
    clearTimeout(timer.current);
    setMsg((m) => ({ text, ok, n: (m?.n ?? 0) + 1 }));
    timer.current = setTimeout(() => setMsg(null), ok ? 3500 : 6000);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  const node = msg ? (
    <div key={msg.n} role={msg.ok ? "status" : "alert"} aria-live={msg.ok ? "polite" : "assertive"} className={"admin-toast" + (msg.ok ? "" : " err")}>
      <span aria-hidden>{msg.ok ? "✓" : "!"}</span> {msg.text}
    </div>
  ) : null;
  return { show, node };
}
