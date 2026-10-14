// Server-side check for uploaded photos. Never trust the browser.
// Accepts only small base64 JPEG/PNG/WebP data URLs (the app sends ~150 KB JPEGs).
// For production, upload to object storage (S3 / R2 / Supabase) and store the
// returned URL instead — the rest of the app only ever reads "a URL".
export const MAX_PHOTOS_PER_TASK = 10;
const MAX_CHARS = 900_000; // ≈ 650 KB of image

export function isValidPhoto(v: unknown): v is string {
  return (
    typeof v === "string" &&
    v.length <= MAX_CHARS &&
    /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v)
  );
}

// Apartment videos: small base64 MP4 / WebM / MOV data URLs (≈ 6 MB of video).
// Same production advice as photos — use object storage for anything bigger.
export const MAX_VIDEO_BYTES = 6 * 1024 * 1024;
const MAX_VIDEO_CHARS = Math.ceil((MAX_VIDEO_BYTES * 4) / 3) + 200;

export function isValidVideo(v: unknown): v is string {
  return (
    typeof v === "string" &&
    v.length <= MAX_VIDEO_CHARS &&
    /^data:video\/(mp4|webm|quicktime);base64,[A-Za-z0-9+/=]+$/.test(v)
  );
}
