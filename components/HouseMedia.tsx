"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";

// The apartment's photo / video are served from /api/houses/:id/media (see that route).
// `v` (mediaUpdatedAt) changes whenever the media is replaced, so the browser re-downloads it.
export type HouseMediaInfo = { id?: string; hasPhoto?: boolean; hasVideo?: boolean; mediaUpdatedAt?: string | null };

export function houseMediaUrl(houseId: string, kind: "photo" | "video", v?: string | null) {
  return `/api/houses/${houseId}/media?kind=${kind}${v ? `&v=${encodeURIComponent(v)}` : ""}`;
}

// Small square picture for house lists: the photo, else a 🎬 tile if there is only a video, else 🏠.
export function HouseThumb({ houseId, house, size = 52 }: { houseId: string; house: HouseMediaInfo; size?: number }) {
  const [failed, setFailed] = useState(false);
  const box: React.CSSProperties = {
    width: size, height: size, borderRadius: 8, flex: "0 0 auto", border: "1px solid var(--line)",
    display: "flex", alignItems: "center", justifyContent: "center", background: "#F3F2EE", fontSize: size * 0.4,
  };
  if (house.hasPhoto && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={houseMediaUrl(houseId, "photo", house.mediaUpdatedAt)} alt="" loading="lazy" onError={() => setFailed(true)} style={{ ...box, objectFit: "cover", display: "block" }} />;
  }
  return <div style={box} aria-hidden>{house.hasVideo ? "🎬" : "🏠"}</div>;
}

// Large photo + video player for the house detail screen.
export function HouseGallery({ houseId, house }: { houseId: string; house: HouseMediaInfo }) {
  const { tr } = useI18n();
  const [open, setOpen] = useState(false);
  if (!house.hasPhoto && !house.hasVideo) return null;
  const photo = houseMediaUrl(houseId, "photo", house.mediaUpdatedAt);
  return (
    <div style={{ marginBottom: 12 }}>
      {house.hasPhoto && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt={tr("Apartment photo")} onClick={() => setOpen(true)}
          style={{ width: "100%", maxHeight: 200, objectFit: "cover", borderRadius: 10, border: "1px solid var(--line)", display: "block", cursor: "zoom-in" }} />
      )}
      {house.hasVideo && (
        <video controls playsInline preload="metadata" src={houseMediaUrl(houseId, "video", house.mediaUpdatedAt)}
          style={{ width: "100%", maxHeight: 240, borderRadius: 10, background: "#000", marginTop: house.hasPhoto ? 8 : 0, display: "block" }} />
      )}
      {open && (
        <div onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, cursor: "zoom-out" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo} alt="" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8 }} />
        </div>
      )}
    </div>
  );
}
