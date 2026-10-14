import { db } from "@/lib/db";
import { isValidPhoto, isValidVideo } from "@/lib/photoValidation";

// An apartment's cover photo and video. The big files live in the HouseMedia table; the House
// row only carries small flags (hasPhoto / hasVideo / mediaUpdatedAt) so lists stay light.
//
// Body fields: photo / video — a data URL to set it, null (or "") to remove it, absent = unchanged.

export type MediaChange = { photo?: string | null; video?: string | null };

export function parseMedia(body: Record<string, unknown>): { error?: string; change?: MediaChange } {
  const change: MediaChange = {};
  if ("photo" in body) {
    const v = body.photo || null;
    if (v !== null && !isValidPhoto(v)) return { error: "invalid photo (JPEG, PNG or WebP, max ~650 KB)" };
    change.photo = v as string | null;
  }
  if ("video" in body) {
    const v = body.video || null;
    if (v !== null && !isValidVideo(v)) return { error: "invalid video (MP4, WebM or MOV, max 6 MB)" };
    change.video = v as string | null;
  }
  return { change: "photo" in change || "video" in change ? change : undefined };
}

// Saves the change and returns the small House-row flags to store alongside it.
export async function writeMedia(houseId: string, change: MediaChange) {
  const existing = await db.houseMedia.findFirst({ where: { houseId } });
  const photo = "photo" in change ? change.photo ?? null : existing?.photo ?? null;
  const video = "video" in change ? change.video ?? null : existing?.video ?? null;
  if (existing) await db.houseMedia.update({ where: { id: existing.id }, data: { photo, video, updatedAt: new Date() } });
  else await db.houseMedia.create({ data: { houseId, photo, video } });
  return { hasPhoto: !!photo, hasVideo: !!video, mediaUpdatedAt: new Date() };
}
