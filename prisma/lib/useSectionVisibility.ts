"use client";

import { useCallback, useEffect, useState } from "react";

// Which sections of a panel are shown. The choice is remembered in this
// browser (per panel), so the admin's layout survives a reload.
// Sections never mentioned in storage default to "shown".
export function useSectionVisibility<K extends string>(storageKey: string, keys: readonly K[]) {
  const all = useCallback((on: boolean) => Object.fromEntries(keys.map((k) => [k, on])) as Record<K, boolean>, [keys]);
  const [shown, setShown] = useState<Record<K, boolean>>(() => all(true));

  // Restore after mount (not during render) to avoid a hydration mismatch.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      if (saved && typeof saved === "object") {
        setShown((cur) => {
          const next = { ...cur };
          for (const k of keys) if (typeof saved[k] === "boolean") next[k] = saved[k];
          return next;
        });
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const save = (next: Record<K, boolean>) => {
    setShown(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
  };

  return {
    keys,
    shown,
    /** Set exactly these sections as visible. */
    setVisible: (on: readonly string[]) => save(Object.fromEntries(keys.map((k) => [k, on.includes(k)])) as Record<K, boolean>),
    setAll: (on: boolean) => save(all(on)),
    none: keys.every((k) => !shown[k]),
  };
}

export type SectionVisibility<K extends string> = ReturnType<typeof useSectionVisibility<K>>;
