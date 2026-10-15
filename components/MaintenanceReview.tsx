"use client";

import { useState } from "react";
import { PanelCard } from "@/components/PanelShell";
import { S, PriorityDot } from "@/components/ui";
import { PhotoStrip, VideoStrip } from "@/components/Photos";
import { api, saveError } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

// "Maintenance to review": every ticket the maintenance team has handed in (status TO_BE_VERIFIED).
// The office checks the work (time, materials, photos / videos) and either confirms it (the ticket
// is closed and the reporter is told) or sends it back to the same worker.
// Shown at the top of the Ops, Manager and Coordinator screens. Server rule: tickets.write.
type ReviewTicket = {
  id: string; status: string; area: string; description: string; priority: string;
  house?: { name: string } | null;
  assignedWorker?: { name: string } | null;
  materialsUsed?: string | null; timeSpentMinutes?: number | null; closedAt?: string | null;
  mediaData?: { photos?: string[]; videos?: string[] } | null;
};

export default function MaintenanceReview({ tickets, onChanged }: { tickets: ReviewTicket[]; onChanged: () => void }) {
  const { tr, locale } = useI18n();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const waiting = tickets
    .filter((t) => t.status === "TO_BE_VERIFIED")
    .sort((a, b) => +new Date(a.closedAt ?? 0) - +new Date(b.closedAt ?? 0)); // waited longest first

  async function act(id: string, action: "confirm" | "sendBack") {
    setBusy(id);
    setError("");
    try {
      await api(`/api/tickets/${id}`, "PATCH", { action });
      onChanged();
    } catch (e) {
      setError(saveError(e, tr));
    }
    setBusy(null);
  }

  const sub: React.CSSProperties = { fontSize: 11.5, color: "var(--ink-soft)", marginTop: 2 };

  return (
    <PanelCard
      title={`${tr("Maintenance to review")} (${waiting.length})`}
      subtitle={tr("Work finished by the maintenance team — confirm it or send it back.")}
    >
      {waiting.map((t) => (
        <div key={t.id} style={{ padding: "10px 0", borderTop: "1px solid var(--line)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <PriorityDot p={t.priority} />
            <b style={{ flex: 1, minWidth: 0 }}>{t.house?.name}</b>
            {t.closedAt && <span style={{ fontSize: 10.5, color: "var(--ink-soft)" }}>{new Date(t.closedAt).toLocaleString(locale)}</span>}
          </div>
          <div style={sub}>{tr(t.area)} — {tr(t.description)}</div>
          <div style={sub}>
            {[t.assignedWorker?.name, t.timeSpentMinutes ? `${t.timeSpentMinutes} min` : null, t.materialsUsed].filter(Boolean).join(" · ")}
          </div>
          <PhotoStrip photos={t.mediaData?.photos ?? []} size={56} />
          <VideoStrip videos={t.mediaData?.videos ?? []} />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button style={S.smallDark} disabled={busy === t.id} onClick={() => act(t.id, "confirm")}>✓ {tr("Confirm fixed")}</button>
            <button style={S.small} disabled={busy === t.id} onClick={() => act(t.id, "sendBack")}>{tr("Send back")}</button>
          </div>
        </div>
      ))}
      {waiting.length === 0 && <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: 0 }}>{tr("Nothing waiting for review.")}</p>}
      {error && <p style={{ fontSize: 12, color: "#C1503C", fontWeight: 600 }}>{error}</p>}
    </PanelCard>
  );
}
