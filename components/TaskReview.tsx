"use client";

import { useState } from "react";
import { Modal, S } from "@/components/ui";
import { PhotoStrip, VideoStrip } from "@/components/Photos";
import { HouseGallery } from "@/components/HouseMedia";
import { checkReadiness, REASON_TEXT } from "@/lib/readiness";
import { MEDIA_ENABLED } from "@/lib/features";
import { useI18n } from "@/lib/i18n";

// The review step before a finished cleaning is approved. Used by the Manager AND the
// Coordinator screens so both look at exactly the same thing: what the cleaner did
// (checklist, photos, videos, timing, notes) plus the automatic check.
// The automatic check only HELPS the decision; a person still confirms or sends back.

export type ReviewTask = {
  id: string;
  houseId?: string;
  house?: { id?: string; name: string };
  scheduledTime: string;
  cleaningTypes: string[];
  notes?: string | null;
  estimatedMinutes?: number | null;
  startedAt?: string | null;
  completedAt?: string | null;
  assignedWorker?: { name: string } | null;
  checklistData?: { checklist?: { label: string; done: boolean }[]; photos?: string[]; videos?: string[] } | null;
};
export type ReviewHouse = { id: string; name: string; keyStatus?: string; hasPhoto?: boolean; hasVideo?: boolean; mediaUpdatedAt?: string | null };

export default function TaskReview({ task: t, house, openTickets, confirmLabel, onApprove, onSendBack, onClose }: {
  task: ReviewTask;
  house?: ReviewHouse;
  openTickets: number;                 // open (not rejected) maintenance problems in this house
  confirmLabel?: string;
  onApprove: () => Promise<unknown>;
  onSendBack: () => Promise<unknown>;
  onClose: () => void;
}) {
  const { tr, ev, locale } = useI18n();
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); await fn(); setBusy(false); onClose(); };

  const r = checkReadiness(t, house, openTickets);
  const list = t.checklistData?.checklist ?? [];
  const photos = t.checklistData?.photos ?? [];
  const videos = t.checklistData?.videos ?? [];

  const hhmm = (d: Date) => d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  let timing: { text: string; over: boolean } | null = null;
  if (t.startedAt) {
    const start = new Date(t.startedAt);
    const end = t.completedAt ? new Date(t.completedAt) : new Date();
    const mins = Math.max(0, Math.round((+end - +start) / 60000));
    const est = t.estimatedMinutes ?? 0;
    timing = { text: `${hhmm(start)} → ${t.completedAt ? hhmm(end) : "…"} · ${mins}${est ? ` / ${est}` : ""} min`, over: est > 0 && mins > est };
  }

  return (
    <Modal title={tr("Review before approving")} onClose={onClose}>
      <p style={{ fontSize: 13, margin: "8px 0 2px" }}>
        <b>{t.house?.name ?? house?.name}</b> · {t.scheduledTime} · {t.cleaningTypes.map(ev).join(", ")}
      </p>
      <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: 0 }}>{t.assignedWorker?.name ?? tr("Unassigned")}</p>
      {timing && (
        <p style={{ fontSize: 12, margin: "4px 0 0", color: timing.over ? "#B3472E" : "var(--ink-soft)", fontWeight: timing.over ? 700 : 400 }}>
          ⏱ {tr("Timing")}: {timing.text}
        </p>
      )}
      {t.notes && (
        <p style={{ fontSize: 12, background: "#FAF3D6", borderRadius: 8, padding: "6px 9px", margin: "8px 0 0" }}>
          <b>{tr("Notes")}:</b> {tr(t.notes)}
        </p>
      )}

      <div style={{ fontSize: 12.5, margin: "12px 0 4px", padding: "8px 10px", borderRadius: 9, fontWeight: 600,
        background: r.ok ? "var(--green-bg)" : "var(--red-bg)", color: r.ok ? "#4F7A26" : "#B3472E" }}>
        {r.ok ? `✓ ${tr("Auto-check: all clear")}` : `⚠ ${tr("Auto-check: needs attention")}`}
        {!r.ok && (
          <ul style={{ margin: "4px 0 0 16px", padding: 0, fontWeight: 400, color: "var(--ink-soft)" }}>
            {r.reasons.map((x) => <li key={x}>{tr(REASON_TEXT[x])}</li>)}
          </ul>
        )}
      </div>

      <label style={S.label}>{tr("Checklist")}</label>
      {list.length === 0 && <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: 0 }}>{tr("No checklist items.")}</p>}
      {list.map((i, n) => (
        <div key={n} style={{ fontSize: 12.5, padding: "3px 0", color: i.done ? "var(--ink)" : "#B3472E" }}>
          {i.done ? "✓" : "✗"} {tr(i.label)}
        </div>
      ))}

      {MEDIA_ENABLED && (
        <>
          <label style={S.label}>{tr("Task photos")}</label>
          {photos.length > 0 ? <PhotoStrip photos={photos} size={84} /> : <p style={{ fontSize: 12, color: "#B3472E", margin: 0 }}>{tr("No photo added")}</p>}
          {videos.length > 0 && <VideoStrip videos={videos} />}
          {house && (house.hasPhoto || house.hasVideo) && (
            <>
              <label style={S.label}>{tr("Apartment reference")}</label>
              <HouseGallery houseId={house.id} house={house} />
            </>
          )}
        </>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
        <button style={S.ghost} disabled={busy} onClick={() => run(onSendBack)}>{tr("Send back")}</button>
        <button style={{ ...S.primary, opacity: busy ? 0.5 : 1 }} disabled={busy} onClick={() => run(onApprove)}>
          {confirmLabel ?? tr("Confirm approve")}
        </button>
      </div>
    </Modal>
  );
}
