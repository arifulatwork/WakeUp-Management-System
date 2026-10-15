"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Modal, S } from "@/components/ui";
import { MEDIA_ENABLED } from "@/lib/features";

export type Room = { id: string; label: string; position?: number };
export const roomPhotoUrl = (houseId: string, roomId: string) => `/api/houses/${houseId}/rooms/${roomId}/photo`;

// Small "School" / "Tourism" tag, shown next to a house name.
export function ModeBadge({ mode }: { mode?: string | null }) {
  const { ev } = useI18n();
  const tourism = mode === "TOURISM";
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 600, padding: "2px 7px", borderRadius: 99, marginLeft: 6, whiteSpace: "nowrap",
      background: tourism ? "#E6F0F8" : "#EEE", color: tourism ? "#2E6B8A" : "var(--ink-soft)",
    }}>{ev(tourism ? "TOURISM" : "SCHOOL")}</span>
  );
}

// The guests' check-in guide of a Tourism house: written instructions + a photo of each room.
export function CheckInGuideBody({ houseId, text }: { houseId: string; text?: string | null }) {
  const { tr } = useI18n();
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [zoom, setZoom] = useState<Room | null>(null);

  useEffect(() => {
    if (!MEDIA_ENABLED) { setRooms([]); return; }
    fetch(`/api/houses/${houseId}/rooms`).then((r) => r.json()).then(setRooms).catch(() => setRooms([]));
  }, [houseId]);

  const hasText = !!text?.trim();
  return (
    <div>
      {hasText && (
        <p style={{ whiteSpace: "pre-wrap", fontSize: 13.5, lineHeight: 1.5, background: "#FAF3D6", borderRadius: 10, padding: "10px 12px", margin: "0 0 12px" }}>{text}</p>
      )}
      {rooms && rooms.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
          {rooms.map((r) => (
            <button key={r.id} type="button" onClick={() => setZoom(r)}
              style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 0, background: "#fff", cursor: "zoom-in", overflow: "hidden", textAlign: "left" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={roomPhotoUrl(houseId, r.id)} alt={r.label} loading="lazy" style={{ width: "100%", height: 100, objectFit: "cover", display: "block" }} />
              <div style={{ padding: "6px 8px", fontSize: 12.5, fontWeight: 600 }}>{r.label}</div>
            </button>
          ))}
        </div>
      )}
      {rooms && rooms.length === 0 && !hasText && (
        <p style={{ color: "var(--ink-soft)", fontSize: 13 }}>{tr("No check-in guide has been added yet.")}</p>
      )}
      {zoom && (
        <div onClick={() => setZoom(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", zIndex: 90, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16, cursor: "zoom-out" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={roomPhotoUrl(houseId, zoom.id)} alt={zoom.label} style={{ maxWidth: "100%", maxHeight: "85%", borderRadius: 8 }} />
          <p style={{ color: "#fff", marginTop: 10, fontWeight: 600 }}>{zoom.label}</p>
        </div>
      )}
    </div>
  );
}

// Button + pop-up. Only renders for Tourism houses.
export function CheckInGuideButton({ house, style }: {
  house: { id: string; name: string; mode?: string | null; checkInText?: string | null }; style?: React.CSSProperties;
}) {
  const { tr } = useI18n();
  const [open, setOpen] = useState(false);
  if (house.mode !== "TOURISM") return null;
  return (
    <>
      <button type="button" style={style ?? S.small} onClick={() => setOpen(true)}>🔑 {tr("Check-in guide")}</button>
      {open && (
        <Modal title={`${tr("Check-in guide")} — ${house.name}`} onClose={() => setOpen(false)}>
          <CheckInGuideBody houseId={house.id} text={house.checkInText} />
        </Modal>
      )}
    </>
  );
}
