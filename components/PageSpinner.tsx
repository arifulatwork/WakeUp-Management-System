"use client";

import { useI18n } from "@/lib/i18n";

// Full-screen "checking who you are…" spinner. Same look as the app's own loader
// (the .gl-spin / gl-rotate styles in app/globals.css), so nothing new to style.
export default function PageSpinner() {
  const { tr } = useI18n();
  return (
    <div className="gl-spin" role="status" aria-label={tr("Loading…")}>
      <span />
    </div>
  );
}
