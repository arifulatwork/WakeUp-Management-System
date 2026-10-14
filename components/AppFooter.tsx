"use client";

import { useI18n } from "@/lib/i18n";

export default function AppFooter() {
  const { tr } = useI18n();
  return (
    <footer style={{ marginTop: 28, paddingTop: 12, borderTop: "1px solid var(--line)", textAlign: "center", fontSize: 11, color: "var(--ink-soft)" }}>
      <span suppressHydrationWarning>© {new Date().getFullYear()} WakeUp Projects. {tr("All rights reserved.")}</span>
    </footer>
  );
}
