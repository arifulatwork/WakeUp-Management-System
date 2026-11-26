"use client";

import { useEffect, useRef, useState } from "react";

// Tabs for a management screen. Only the open tab is shown, so only its data has to be on screen.
// The open tab is kept in the address (#maintenance): a reload or the Back button returns to it.

export function useHashTab<T extends string>(ids: readonly T[], initial: T) {
  const read = (): T => {
    const h = typeof window === "undefined" ? "" : window.location.hash.slice(1);
    return (ids as readonly string[]).includes(h) ? (h as T) : initial;
  };
  const [tab, setTab] = useState<T>(initial);
  useEffect(() => {
    setTab(read());
    const onHash = () => setTab(read());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const choose = (t: T) => {
    setTab(t);
    history.replaceState(null, "", t === initial ? window.location.pathname + window.location.search : `#${t}`);
  };
  return [tab, choose] as const;
}

export default function PanelTabs<T extends string>({ tabs, value, onChange, label }: {
  tabs: { id: T; label: string; badge?: number }[];
  value: T;
  onChange: (t: T) => void;
  label: string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function onKey(e: React.KeyboardEvent, i: number) {
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const t = tabs[(next + tabs.length) % tabs.length].id;
    onChange(t);
    refs.current[t]?.focus();
  }

  return (
    <div className="admin-tabs" role="tablist" aria-label={label}>
      {tabs.map((t, i) => (
        <button
          key={t.id}
          ref={(el) => { refs.current[t.id] = el; }}
          role="tab"
          id={`tab-${t.id}`}
          aria-selected={value === t.id}
          aria-controls={`panel-${t.id}`}
          tabIndex={value === t.id ? 0 : -1}
          className="admin-tab"
          onClick={() => onChange(t.id)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {t.label}
          {!!t.badge && <span className="admin-tab-badge">{t.badge}</span>}
        </button>
      ))}
    </div>
  );
}
