"use client";

import { useCallback, useEffect, useState } from "react";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { useI18n } from "@/lib/i18n";
import { S } from "@/components/ui";

// Shared bits for the Staff & Roles tabs.

export const th: React.CSSProperties = { textAlign: "left", fontSize: 10.5, textTransform: "uppercase", color: "var(--ink-soft)", borderBottom: "1px solid var(--line)", padding: "8px 10px" };
export const td: React.CSSProperties = { padding: "9px 10px", borderBottom: "1px solid var(--line)" };
export const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", background: "#fff", fontSize: 13 };

// Load one list when a tab opens, and again whenever those tables change on the server.
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

  return { data, error, reload: load };
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

// Search box above a table.
export function Toolbar({ children }: { children: React.ReactNode }) {
  return <div className="admin-toolbar">{children}</div>;
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      style={{ ...S.input, width: 260, maxWidth: "100%", padding: "7px 10px" }}
    />
  );
}
