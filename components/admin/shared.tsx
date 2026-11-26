"use client";

import { S } from "@/components/ui";

export { useApiList, SkeletonRows, LoadError, EmptyNote, useToast } from "@/components/PanelKit";

// Table styles and the search bar for the Staff & Roles tabs.

export const th: React.CSSProperties = { textAlign: "left", fontSize: 10.5, textTransform: "uppercase", color: "var(--ink-soft)", borderBottom: "1px solid var(--line)", padding: "8px 10px" };
export const td: React.CSSProperties = { padding: "9px 10px", borderBottom: "1px solid var(--line)" };
export const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", background: "#fff", fontSize: 13 };

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
