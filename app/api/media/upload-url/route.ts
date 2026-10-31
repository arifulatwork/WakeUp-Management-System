import { NextRequest, NextResponse } from "next/server";
import { currentSession } from "@/lib/guard";
import { MEDIA_ENABLED } from "@/lib/features";
import { R2_ENABLED, newKey, presignPut } from "@/lib/storage";

// POST /api/media/upload-url   { contentType: "image/webp", size: 183000 }
//   -> { uploadUrl, ref, headers }
// The browser then does   PUT uploadUrl   (body = the file, header Content-Type as given)
// and sends `ref` ("r2:photos/…") to the normal save routes instead of a base64 data URL.
//
// Any signed-in person may upload (cleaners attach photos, office staff set house photos);
// what a file is ATTACHED to is still checked by the route that saves the reference.
export const dynamic = "force-dynamic";

// Photos arrive already converted to ~100–300 KB; the caps below are generous safety limits.
const MAX_UPLOAD_BYTES: Record<string, number> = {
  "image/webp": 2 * 1024 * 1024,
  "image/jpeg": 2 * 1024 * 1024, // fallback for browsers that cannot encode WebP
  "video/webm": 25 * 1024 * 1024,
  "video/mp4": 25 * 1024 * 1024, // fallback for browsers that cannot encode WebM
};

export async function POST(req: NextRequest) {
  if (!MEDIA_ENABLED) return NextResponse.json({ error: "photos and videos are switched off" }, { status: 404 });
  const s = await currentSession(req);
  if (!s) return NextResponse.json({ error: "sign in required" }, { status: 401 });
  if (!R2_ENABLED) return NextResponse.json({ error: "file storage is not configured" }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const contentType = String(body?.contentType ?? "");
  const size = Number(body?.size);
  const max = MAX_UPLOAD_BYTES[contentType];
  if (!max) return NextResponse.json({ error: "unsupported file type" }, { status: 400 });
  if (!Number.isFinite(size) || size <= 0 || size > max) {
    return NextResponse.json({ error: `file too large (max ${Math.round(max / 1024 / 1024)} MB)` }, { status: 413 });
  }

  const key = newKey(contentType);
  const uploadUrl = await presignPut(key, contentType);
  return NextResponse.json({ uploadUrl, ref: `r2:${key}`, headers: { "Content-Type": contentType } });
}
