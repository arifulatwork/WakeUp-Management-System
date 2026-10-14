"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";

// Shared building blocks for the edit/create forms.

export const S = {
  input: { width: "100%", padding: "9px 10px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13, background: "#fff" } as React.CSSProperties,
  label: { display: "block", fontSize: 11.5, fontWeight: 600, margin: "12px 0 5px", color: "var(--ink-soft)" } as React.CSSProperties,
  primary: { flex: 1, padding: 11, borderRadius: 9, border: "none", background: "var(--ink)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" } as React.CSSProperties,
  ghost: { flex: 1, padding: 11, borderRadius: 9, border: "1px solid var(--line)", background: "#fff", fontSize: 13, cursor: "pointer" } as React.CSSProperties,
  danger: { padding: "11px 14px", borderRadius: 9, border: "1px solid var(--red)", background: "var(--red-bg)", color: "var(--red)", fontSize: 13, fontWeight: 600, cursor: "pointer" } as React.CSSProperties,
  small: { fontSize: 11, padding: "4px 10px", borderRadius: 7, border: "1px solid var(--line)", background: "#fff", cursor: "pointer", color: "var(--ink)" } as React.CSSProperties,
  smallDark: { fontSize: 11, padding: "5px 11px", borderRadius: 7, border: "none", background: "var(--ink)", color: "#fff", cursor: "pointer" } as React.CSSProperties,
  nav: { fontSize: 12, padding: "7px 12px", borderRadius: 8, border: "1px solid var(--line)", background: "#fff", color: "var(--ink)", textDecoration: "none", cursor: "pointer" } as React.CSSProperties,
  navDark: { fontSize: 12, padding: "7px 12px", borderRadius: 8, border: "none", background: "var(--ink)", color: "#fff", cursor: "pointer" } as React.CSSProperties,
};

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const { tr } = useI18n();
  return (
    <div
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 60, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 14px", overflowY: "auto" }}
    >
      <div style={{ background: "#fff", borderRadius: 14, padding: 20, width: "100%", maxWidth: 440, marginBottom: 70 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>{title}</h2>
          <button onClick={onClose} aria-label={tr("Cancel")} style={{ border: "none", background: "none", fontSize: 20, cursor: "pointer", color: "var(--ink-soft)" }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Pills({ options, value, onChange, multi, label }: {
  options: string[];
  value: string | string[];
  onChange: (v: any) => void;
  multi?: boolean;
  label: (o: string) => string;
}) {
  const sel = (o: string) => (multi ? (value as string[]).includes(o) : value === o);
  const toggle = (o: string) => {
    if (!multi) return onChange(o);
    const cur = value as string[];
    onChange(cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o]);
  };
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {options.map((o) => (
        <button key={o} type="button" onClick={() => toggle(o)} style={{
          padding: "6px 12px", borderRadius: 999, border: "1px solid var(--line)", fontSize: 11.5, cursor: "pointer",
          background: sel(o) ? "var(--ink)" : "#fff", color: sel(o) ? "#fff" : "var(--ink-soft)",
        }}>{label(o)}</button>
      ))}
    </div>
  );
}

// Footer with Save / Cancel and (when editing) a two-step Delete.
export function FormFooter({ saving, canSave, onSave, onClose, onDelete, error, confirmText }: {
  saving: boolean; canSave: boolean; onSave: () => void; onClose: () => void;
  onDelete?: () => void; error?: string; confirmText?: string;
}) {
  const { tr } = useI18n();
  const confirming = useConfirm();
  return (
    <div style={{ marginTop: 18 }}>
      {error && <p style={{ color: "var(--red)", fontSize: 12.5, marginBottom: 10 }}>{error}</p>}
      {confirming.on && onDelete ? (
        <div style={{ background: "var(--red-bg)", borderRadius: 10, padding: 12 }}>
          <p style={{ fontSize: 12.5, marginBottom: 10 }}>{confirmText ?? tr("Delete this item? This cannot be undone.")}</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={S.ghost} onClick={() => confirming.set(false)}>{tr("Cancel")}</button>
            <button style={{ ...S.primary, background: "var(--red)" }} onClick={onDelete}>{tr("Delete")}</button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8 }}>
          {onDelete && <button style={S.danger} onClick={() => confirming.set(true)}>{tr("Delete")}</button>}
          <button style={S.ghost} onClick={onClose}>{tr("Cancel")}</button>
          <button style={{ ...S.primary, opacity: canSave && !saving ? 1 : 0.5 }} disabled={!canSave || saving} onClick={onSave}>
            {saving ? tr("Saving…") : tr("Save")}
          </button>
        </div>
      )}
    </div>
  );
}

function useConfirm() {
  const [on, set] = useState(false);
  return { on, set };
}

export function StatusBadge({ status }: { status: string }) {
  const { ev } = useI18n();
  const map: Record<string, string> = {
    SCHEDULED: "#EEE", ASSIGNED: "#FAF3D6", IN_PROGRESS: "#FBEDDB", ON_HOLD: "#FBEDDB",
    COMPLETED: "var(--green-bg)", TO_BE_VERIFIED: "#E6F0F8", APPROVED: "var(--green-bg)", WITH_ISSUE: "var(--red-bg)",
    OPEN: "#FAF3D6", ACCEPTED: "#E6F0F8", REJECTED: "#EEE", CLOSED: "var(--green-bg)",
  };
  return (
    <span style={{ fontSize: 9.5, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: map[status] ?? "#EEE", textTransform: "uppercase", whiteSpace: "nowrap" }}>
      {ev(status)}
    </span>
  );
}

export function PriorityDot({ p }: { p: string }) {
  const color = p === "RED" ? "var(--red)" : p === "ORANGE" ? "var(--orange)" : "var(--yellow)";
  return <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block", flex: "0 0 auto" }} />;
}

// ---- sorting UI ----
import type { Dir, TicketSort } from "@/lib/sort";

// Click a column header: sorts by it; click again to reverse.
export function useSort<K extends string>(initialKey: K, initialDir: Dir = "asc") {
  const [key, setKey] = useState<K>(initialKey);
  const [dir, setDir] = useState<Dir>(initialDir);
  const toggle = (k: K) => {
    if (k === key) setDir(dir === "asc" ? "desc" : "asc");
    else { setKey(k); setDir("asc"); }
  };
  return { key, dir, toggle };
}

export function SortTh<K extends string>({ label, k, sort, style }: {
  label: string; k: K; sort: { key: K; dir: Dir; toggle: (k: K) => void }; style?: React.CSSProperties;
}) {
  const active = sort.key === k;
  return (
    <th
      onClick={() => sort.toggle(k)}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      style={{ ...style, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap", color: active ? "var(--ink)" : undefined }}
    >
      {label} <span style={{ opacity: active ? 1 : 0.3 }}>{active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span>
    </th>
  );
}

// "Sort by: Priority · Newest · Oldest · House" for ticket lists.
export function TicketSortBar({ value, onChange }: { value: TicketSort; onChange: (v: TicketSort) => void }) {
  const { tr } = useI18n();
  const opts: [TicketSort, string][] = [["priority", "Priority"], ["newest", "Newest"], ["oldest", "Oldest"], ["house", "House"]];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
      <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>{tr("Sort by")}:</span>
      {opts.map(([key, label]) => (
        <button key={key} onClick={() => onChange(key)} aria-pressed={value === key} style={{
          fontSize: 11.5, padding: "5px 11px", borderRadius: 999, border: "1px solid var(--line)", cursor: "pointer",
          background: value === key ? "var(--ink)" : "#fff", color: value === key ? "#fff" : "var(--ink-soft)",
        }}>{tr(label)}</button>
      ))}
    </div>
  );
}
