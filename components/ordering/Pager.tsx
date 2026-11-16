"use client";

import type { CSSProperties } from "react";
import { S } from "@/components/ui";
import { useI18n } from "@/lib/i18n";

// Lower-case and without accents, so "jose" finds "José". Used by the search boxes.
export const norm = (v: unknown) => String(v ?? "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

// "‹ Previous   Page 2 of 5   Next ›" — shows nothing when everything fits on one page.
export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  const { tr } = useI18n();
  if (pages <= 1) return null;
  const btn = (off: boolean): CSSProperties => ({ ...S.small, opacity: off ? 0.4 : 1, cursor: off ? "default" : "pointer" });
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: "12px 16px", fontSize: 12.5, color: "var(--ink-soft)" }}>
      <button type="button" style={btn(page <= 1)} disabled={page <= 1} onClick={() => onPage(page - 1)}>‹ {tr("Previous")}</button>
      <span>{tr("Page {n} of {total}", { n: page, total: pages })}</span>
      <button type="button" style={btn(page >= pages)} disabled={page >= pages} onClick={() => onPage(page + 1)}>{tr("Next")} ›</button>
    </div>
  );
}
