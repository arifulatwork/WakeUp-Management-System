// Lists used to carry every photo and video as base64 text inside the JSON (megabytes per
// refresh). Now the lists carry a short URL instead; the browser downloads each file once
// and <img src> / <video src> work as before.
//
//   • "r2:photos/…"  (stored in Cloudflare R2)  ->  /api/files/photos/…   (login check + redirect to R2)
//   • "data:…"       (old base64 rows)          ->  /api/media/<kind>/<id>/<field>/<i>?v=…
//
// "?v=" is a fingerprint of the content, so a replaced or removed photo gets a new URL.
import { isR2Ref, mediaSrc } from "@/lib/mediaRef";

const isData = (s: unknown): s is string => typeof s === "string" && s.startsWith("data:");

function fingerprint(s: string): string {
  let h = 0;
  const step = Math.max(1, Math.floor(s.length / 64));
  for (let i = 0; i < s.length; i += step) h = (h * 31 + s.charCodeAt(i)) | 0;
  return s.length.toString(36) + (h >>> 0).toString(36);
}
const url = (kind: string, id: string, field: string, i: number, s: string) =>
  `/api/media/${kind}/${id}/${field}/${i}?v=${fingerprint(s)}`;

// one value -> something an <img>/<video> can load
function one(kind: string, id: string, field: string, i: number, p: unknown): unknown {
  if (isR2Ref(p)) return mediaSrc(p);
  if (isData(p)) return url(kind, id, field, i, p);
  return p;
}
const list = (kind: string, id: string, field: string, arr: unknown) =>
  Array.isArray(arr) ? arr.map((p, i) => one(kind, id, field, i, p)) : arr;

export function slimTask(t: any): any {
  const cd = t?.checklistData;
  if (!cd || typeof cd !== "object") return t;
  const out = { ...cd };
  if (cd.photos) out.photos = list("task", t.id, "photos", cd.photos);
  if (cd.videos) out.videos = list("task", t.id, "videos", cd.videos);
  return { ...t, checklistData: out };
}

export function slimTicket(t: any): any {
  if (!t || typeof t !== "object") return t;
  const out = { ...t };
  if (t.photoUrl) out.photoUrl = one("ticket", t.id, "photoUrl", 0, t.photoUrl);
  if (t.afterPhotoUrl) out.afterPhotoUrl = one("ticket", t.id, "afterPhotoUrl", 0, t.afterPhotoUrl);
  if (t.mediaData && typeof t.mediaData === "object") {
    const m = { ...t.mediaData };
    if (m.photos) m.photos = list("ticket", t.id, "photos", m.photos);
    if (m.videos) m.videos = list("ticket", t.id, "videos", m.videos);
    // video attached by the person who REPORTED the issue (the others are the repair team's after-work media)
    if (m.reportVideos) m.reportVideos = list("ticket", t.id, "reportVideos", m.reportVideos);
    out.mediaData = m;
  }
  return out;
}

// For route responses that may be a task, a ticket, or a list of them.
export function slimAny(v: any): any {
  if (Array.isArray(v)) return v.map(slimAny);
  if (!v || typeof v !== "object") return v;
  if ("checklistData" in v) return slimTask(v);
  if ("photoUrl" in v || "mediaData" in v || "afterPhotoUrl" in v) return slimTicket(v);
  return v;
}
