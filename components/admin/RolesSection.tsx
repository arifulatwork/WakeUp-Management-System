"use client";

import { PanelCard } from "@/components/PanelShell";
import { useI18n } from "@/lib/i18n";
import { MATRIX, ROLE_COLUMNS } from "@/lib/permissions";
import { td, th, tableStyle } from "./shared";

// No server call: the rules live in lib/permissions.ts.
export default function RolesSection() {
  const { tr, ev } = useI18n();
  return (
    <PanelCard
      title={tr("What each role can do")}
      subtitle={tr("These rules are fixed in the app. Ask your developer to change them.")}
      flush
    >
      <table style={{ ...tableStyle, fontSize: 12.5 }}>
        <thead>
          <tr>
            <th style={{ ...th, position: "sticky", left: 0, background: "#fff", zIndex: 1 }}>{tr("Capability")}</th>
            {ROLE_COLUMNS.map((r) => (
              <th key={r} style={{ ...th, textAlign: "center" }}>{r === "worker" ? tr("Staff") : ev(r)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MATRIX.map((row) => (
            <tr key={row.label}>
              <td style={{ ...td, position: "sticky", left: 0, background: "#fff" }}>{tr(row.label)}</td>
              {ROLE_COLUMNS.map((r) => {
                const yes = row.roles.includes(r);
                return (
                  <td key={r} style={{ ...td, textAlign: "center", color: yes ? "#4F7A26" : "var(--line)", fontWeight: 700 }}>
                    <span aria-label={yes ? "yes" : "no"}>{yes ? "✓" : "–"}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </PanelCard>
  );
}
