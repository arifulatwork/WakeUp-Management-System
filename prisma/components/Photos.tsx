"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { preparePhoto, prepareVideo, MediaError, OnStatus, VIDEO_MAX_SECONDS } from "@/lib/media";
import { mediaSrc } from "@/lib/mediaRef";
import { useI18n } from "@/lib/i18n";
import { MEDIA_ENABLED } from "@/lib/features";

// Same props as before, so no screen needs to change:
//   <PhotoPicker onPhoto={(value: string) => …} />   <VideoPicker onVideo={…} />
//   <PhotoStrip photos={string[]} onRemove? />        <VideoStrip videos={string[]} onRemove? />
// `value` is now normally an "r2:…" reference (the file is already in Cloudflare R2); it can
// still be a base64 data URL when the phone had no signal. Both display correctly via mediaSrc().

// Greyed-out, untappable button shown while media is switched off, so people can see the feature is planned.
function ComingSoonButton({ label, style }: { label: string; style?: React.CSSProperties }) {
  const { tr } = useI18n();
  return (
    <button type="button" disabled aria-disabled="true" style={{ ...style, opacity: 0.5, cursor: "not-allowed" }}>
      {label} · {tr("Coming soon")}
    </button>
  );
}

// ---------------------------------------------------------------------------------------
// Pickers
// ---------------------------------------------------------------------------------------
function useStatusLabel() {
  const { tr } = useI18n();
  const [status, setStatus] = useState("");
  const onStatus: OnStatus = useCallback(
    (phase, pct) => setStatus(`${phase === "optimizing" ? tr("Optimizing") : tr("Uploading")} ${pct}%`),
    [tr]
  );
  return { status, setStatus, onStatus };
}

function errorText(err: unknown, tr: (s: string, v?: Record<string, string | number>) => string, isVideo: boolean): string {
  if (err instanceof MediaError) {
    if (err.code === "too-long") return tr("Video is too long (max {s} seconds).", { s: VIDEO_MAX_SECONDS });
    if (err.code === "too-large") return tr("That file is too large.");
    if (err.code === "offline") return tr("No signal — could not upload. Try again when you are online.");
    if (err.code === "unsupported") return isVideo ? tr("This phone cannot prepare videos. Update the browser/iOS and try again.") : tr("Could not read that photo.");
  }
  return isVideo ? tr("Could not read that video.") : tr("Could not read that photo.");
}

// Button that opens the camera / gallery. The chosen photo is shrunk, converted to WebP and uploaded.
export function PhotoPicker({ label, onPhoto, style, showWhenOff }: {
  label: string;
  onPhoto: (value: string) => void;
  style?: React.CSSProperties;
  // When photos are switched off, show the button greyed out with "Coming soon" instead of hiding it.
  showWhenOff?: boolean;
}) {
  const { tr } = useI18n();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { status, onStatus } = useStatusLabel();

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // so the same photo can be chosen again
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      onPhoto(await preparePhoto(file, onStatus));
    } catch (err) {
      setError(errorText(err, tr, false));
    }
    setBusy(false);
  }

  if (!MEDIA_ENABLED) return showWhenOff ? <ComingSoonButton label={label} style={style} /> : null;
  return (
    <>
      <input ref={ref} type="file" accept="image/*" onChange={pick} style={{ display: "none" }} />
      <button type="button" style={{ ...style, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => ref.current?.click()}>
        {busy ? status || "…" : label}
      </button>
      {error && <p style={{ color: "var(--red)", fontSize: 12, marginTop: 4 }}>{error}</p>}
    </>
  );
}

// Same for a video. It is re-encoded to a small WebM (takes about as long as the clip), then uploaded.
export function VideoPicker({ label, onVideo, style, showWhenOff }: {
  label: string;
  onVideo: (value: string) => void;
  style?: React.CSSProperties;
  // When videos are switched off, show the button greyed out with "Coming soon" instead of hiding it.
  showWhenOff?: boolean;
}) {
  const { tr } = useI18n();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { status, onStatus } = useStatusLabel();

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      onVideo(await prepareVideo(file, onStatus));
    } catch (err) {
      setError(errorText(err, tr, true));
    }
    setBusy(false);
  }

  if (!MEDIA_ENABLED) return showWhenOff ? <ComingSoonButton label={label} style={style} /> : null;
  return (
    <>
      <input ref={ref} type="file" accept="video/*" onChange={pick} style={{ display: "none" }} />
      <button type="button" style={{ ...style, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => ref.current?.click()}>
        {busy ? status || "…" : label}
      </button>
      {busy && <p style={{ fontSize: 11, color: "var(--muted, #777)", marginTop: 4 }}>{tr("Keep this screen open until it finishes.")}</p>}
      {error && <p style={{ color: "var(--red)", fontSize: 12, marginTop: 4 }}>{error}</p>}
    </>
  );
}

// ---------------------------------------------------------------------------------------
// Viewer: one full-screen gallery for photos AND videos
// swipe / ← → to move, Esc or tap the dark area to close, videos start playing by themselves
// ---------------------------------------------------------------------------------------
type Item = { type: "image" | "video"; src: string };

function Lightbox({ items, start, onClose }: { items: Item[]; start: number; onClose: () => void }) {
  const { tr } = useI18n();
  const [i, setI] = useState(Math.min(Math.max(start, 0), items.length - 1));
  const touchX = useRef<number | null>(null);
  const go = useCallback((d: number) => setI((n) => (n + d + items.length) % items.length), [items.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // page behind does not scroll
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [go, onClose]);

  const item = items[i];
  if (!item) return null;
  const arrow: React.CSSProperties = {
    position: "absolute", top: "50%", transform: "translateY(-50%)", width: 44, height: 44, borderRadius: "50%",
    border: "none", background: "rgba(255,255,255,.18)", color: "#fff", fontSize: 26, cursor: "pointer", zIndex: 2,
  };
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current == null || items.length < 2) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
      }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.92)", zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}
    >
      <button type="button" aria-label={tr("Close")} onClick={onClose} style={{ ...arrow, top: 16, right: 16, left: "auto", transform: "none" }}>×</button>
      {items.length > 1 && (
        <>
          <button type="button" aria-label={tr("Previous")} onClick={(e) => { e.stopPropagation(); go(-1); }} style={{ ...arrow, left: 12 }}>‹</button>
          <button type="button" aria-label={tr("Next")} onClick={(e) => { e.stopPropagation(); go(1); }} style={{ ...arrow, right: 12 }}>›</button>
          <div style={{ position: "absolute", bottom: 16, left: 0, right: 0, textAlign: "center", color: "#fff", fontSize: 13, opacity: 0.8 }}>{i + 1} / {items.length}</div>
        </>
      )}
      <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: "100%", maxHeight: "100%", display: "flex" }}>
        {item.type === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.src} alt="" decoding="async" style={{ maxWidth: "100%", maxHeight: "92vh", borderRadius: 8, objectFit: "contain" }} />
        ) : (
          <video key={item.src} src={item.src} controls autoPlay playsInline preload="auto" style={{ maxWidth: "100%", maxHeight: "92vh", borderRadius: 8, background: "#000" }} />
        )}
      </div>
    </div>
  );
}

const removeBtn: React.CSSProperties = {
  position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", border: "none",
  background: "#111", color: "#fff", fontSize: 12, lineHeight: "20px", cursor: "pointer", padding: 0, zIndex: 1,
};

// ---------------------------------------------------------------------------------------
// Strips
// ---------------------------------------------------------------------------------------

// Row of thumbnails; tap one to open the viewer. Pass onRemove to show ×.
export function PhotoStrip({ photos, onRemove, size = 64 }: {
  photos: string[];
  onRemove?: (index: number) => void;
  size?: number;
}) {
  const { tr } = useI18n();
  const [open, setOpen] = useState<number | null>(null);
  if (!MEDIA_ENABLED || !photos.length) return null;
  const items: Item[] = photos.map((p) => ({ type: "image", src: mediaSrc(p) }));
  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0" }}>
        {items.map((it, i) => (
          <div key={i} style={{ position: "relative" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={it.src}
              alt=""
              loading="lazy"
              decoding="async"
              onClick={() => setOpen(i)}
              style={{ width: size, height: size, objectFit: "cover", borderRadius: 8, border: "1px solid var(--line)", cursor: "zoom-in", display: "block", background: "#F3F2EE" }}
            />
            {onRemove && (
              <button type="button" aria-label={tr("Remove photo")} onClick={() => onRemove(i)} style={removeBtn}>×</button>
            )}
          </div>
        ))}
      </div>
      {open !== null && <Lightbox items={items} start={open} onClose={() => setOpen(null)} />}
    </>
  );
}

// A video tile. The file is only touched once the tile scrolls near the screen, and then only
// its first bytes (preload="metadata") to show the first frame — long lists stay light.
// Tap = open the viewer and play.
function VideoTile({ src, onOpen }: { src: string; onOpen: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === "undefined") return setNear(true);
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: "300px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={box}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen()}
      style={{ position: "relative", width: 160, height: 110, borderRadius: 8, border: "1px solid var(--line)", background: "#000", overflow: "hidden", cursor: "pointer" }}
    >
      {near && (
        // "#t=0.1" makes the browser (iPhone included) paint the first frame as the thumbnail
        <video src={`${src}#t=0.1`} preload="metadata" muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", pointerEvents: "none" }} />
      )}
      <span aria-hidden style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ width: 38, height: 38, borderRadius: "50%", background: "rgba(0,0,0,.55)", color: "#fff", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", paddingLeft: 3 }}>▶</span>
      </span>
    </div>
  );
}

// Row of video tiles (task videos). Pass onRemove to show ×.
export function VideoStrip({ videos, onRemove }: { videos: string[]; onRemove?: (index: number) => void }) {
  const { tr } = useI18n();
  const [open, setOpen] = useState<number | null>(null);
  if (!MEDIA_ENABLED || !videos.length) return null;
  const items: Item[] = videos.map((v) => ({ type: "video", src: mediaSrc(v) }));
  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0" }}>
        {items.map((it, i) => (
          <div key={i} style={{ position: "relative" }}>
            <VideoTile src={it.src} onOpen={() => setOpen(i)} />
            {onRemove && (
              <button type="button" aria-label={tr("Remove video")} onClick={() => onRemove(i)} style={removeBtn}>×</button>
            )}
          </div>
        ))}
      </div>
      {open !== null && <Lightbox items={items} start={open} onClose={() => setOpen(null)} />}
    </>
  );
}
