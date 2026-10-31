// Server-side check for uploaded photos / videos. Never trust the browser.
//
// A value is accepted when it is EITHER
//   • an R2 reference ("r2:photos/2026-10/….webp") — the normal case now, or
//   • a small base64 data URL — the old way, still used as a fallback when the phone has no
//     signal / R2 is not configured yet (the offline queue keeps working).
import { isR2Ref } from "@/lib/mediaRef";

export const MAX_PHOTOS_PER_TASK = 10;
export const MAX_VIDEOS_PER_TASK = 3;
const MAX_CHARS = 900_000; // ≈ 650 KB of image (data-URL fallback only)

export function isValidPhoto(v: unknown): v is string {
  if (isR2Ref(v)) return v.startsWith("r2:photos/");
  return (
    typeof v === "string" &&
    v.length <= MAX_CHARS &&
    /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v)
  );
}

// Data-URL fallback only; files uploaded to R2 may be larger (see MAX_UPLOAD_BYTES in the upload route).
export const MAX_VIDEO_BYTES = 6 * 1024 * 1024;
const MAX_VIDEO_CHARS = Math.ceil((MAX_VIDEO_BYTES * 4) / 3) + 200;

export function isValidVideo(v: unknown): v is string {
  if (isR2Ref(v)) return v.startsWith("r2:videos/");
  return (
    typeof v === "string" &&
    v.length <= MAX_VIDEO_CHARS &&
    /^data:video\/(mp4|webm|quicktime);base64,[A-Za-z0-9+/=]+$/.test(v)
  );
}
