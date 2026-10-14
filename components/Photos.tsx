"use client";

import { useRef, useState } from "react";
import { compressImage, readVideo } from "@/lib/photos";
import { useI18n } from "@/lib/i18n";

// Button that opens the camera / gallery. On a phone, "accept=image/*" offers
// "Take photo" or "Photo library"; on a laptop it opens a file chooser.
export function PhotoPicker({ label, onPhoto, style }: {
  label: string;
  onPhoto: (dataUrl: string) => void;
  style?: React.CSSProperties;
}) {
  const { tr } = useI18n();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // so the same photo can be chosen again
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      onPhoto(await compressImage(file));
    } catch {
      setError(tr("Could not read that photo."));
    }
    setBusy(false);
  }

  return (
    <>
      <input ref={ref} type="file" accept="image/*" onChange={pick} style={{ display: "none" }} />
      <button type="button" style={{ ...style, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => ref.current?.click()}>
        {busy ? "…" : label}
      </button>
      {error && <p style={{ color: "var(--red)", fontSize: 12, marginTop: 4 }}>{error}</p>}
    </>
  );
}

// Same idea for a video (camera / gallery). Videos are not re-compressed, so they have a size limit.
export function VideoPicker({ label, onVideo, style }: {
  label: string;
  onVideo: (dataUrl: string) => void;
  style?: React.CSSProperties;
}) {
  const { tr } = useI18n();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      onVideo(await readVideo(file));
    } catch (err) {
      setError((err as Error).message === "too large" ? tr("Video is too large (max 6 MB).") : tr("Could not read that video."));
    }
    setBusy(false);
  }

  return (
    <>
      <input ref={ref} type="file" accept="video/mp4,video/webm,video/quicktime" onChange={pick} style={{ display: "none" }} />
      <button type="button" style={{ ...style, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => ref.current?.click()}>
        {busy ? "…" : label}
      </button>
      {error && <p style={{ color: "var(--red)", fontSize: 12, marginTop: 4 }}>{error}</p>}
    </>
  );
}

// Row of thumbnails; tap one to see it full-size. Pass onRemove to show ×.
export function PhotoStrip({ photos, onRemove, size = 64 }: {
  photos: string[];
  onRemove?: (index: number) => void;
  size?: number;
}) {
  const { tr } = useI18n();
  const [open, setOpen] = useState<string | null>(null);
  if (!photos.length) return null;
  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0" }}>
        {photos.map((src, i) => (
          <div key={i} style={{ position: "relative" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt=""
              onClick={() => setOpen(src)}
              style={{ width: size, height: size, objectFit: "cover", borderRadius: 8, border: "1px solid var(--line)", cursor: "zoom-in", display: "block" }}
            />
            {onRemove && (
              <button
                type="button"
                aria-label={tr("Remove photo")}
                onClick={() => onRemove(i)}
                style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", border: "none", background: "#111", color: "#fff", fontSize: 12, lineHeight: "20px", cursor: "pointer", padding: 0 }}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      {open && (
        <div
          onClick={() => setOpen(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, cursor: "zoom-out" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={open} alt="" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8 }} />
        </div>
      )}
    </>
  );
}
