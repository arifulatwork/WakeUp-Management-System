// A stored photo/video is saved in the database as a short reference like
//   r2:photos/2026-10/ab12cd34ef56ab12cd34ef56.webp
//   r2:videos/2026-10/ab12cd34ef56ab12cd34ef56.webm
// instead of a huge base64 data URL. Old data URLs keep working (see photoValidation.ts).
//
// This file has NO Node imports, so both the browser and the server can use it.

export const R2_REF = /^r2:(photos|videos)\/\d{4}-\d{2}\/[a-f0-9]{24}\.(webp|jpg|webm|mp4)$/;

export const isR2Ref = (v: unknown): v is string => typeof v === "string" && R2_REF.test(v);

export const r2Key = (ref: string) => ref.slice(3); // "r2:photos/…" -> "photos/…"

// What to put in <img src> / <video src>. Data URLs and normal URLs pass through unchanged.
export function mediaSrc(v: string): string {
  return isR2Ref(v) ? "/api/files/" + r2Key(v).split("/").map(encodeURIComponent).join("/") : v;
}
