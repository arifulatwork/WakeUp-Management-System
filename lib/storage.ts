// FILE STORAGE — the ONE place that knows where photos / videos are kept.
//
// STATUS: prepared, NOT wired in yet. Today photos are still saved as base64 text in the
// database (lib/houseMedia.ts, the task "addPhoto" action, tickets). That is fine for a
// demo but makes every dashboard heavy. When your Ubuntu / Raspberry Pi server is ready:
//
//   1. set NEXT_PUBLIC_MEDIA_ENABLED=true and MEDIA_DIR=/some/folder/on/the/server
//   2. in the routes, call saveFile() instead of storing the data URL, and store the
//      returned path (e.g. "photos/ab12cd.jpg") in the database
//   3. serve files with getFile() from a route such as /api/files/[...path]
//   4. back up the MEDIA_DIR folder regularly
//
// Because everything goes through these three functions, moving later to S3 / R2 /
// MinIO only means rewriting this file.

import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

const ROOT = process.env.MEDIA_DIR || path.join(process.cwd(), "uploads");

const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
};

// Saves a data URL (data:image/jpeg;base64,...) as a real file. Returns the relative path to store.
export async function saveFile(kind: "photos" | "videos", dataUrl: string): Promise<string> {
  const m = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  const ext = m ? EXT[m[1]] : undefined;
  if (!m || !ext) throw new Error("unsupported file");
  const rel = `${kind}/${crypto.randomBytes(12).toString("hex")}.${ext}`;
  const full = path.join(ROOT, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, Buffer.from(m[2], "base64"));
  return rel;
}

// Reads a stored file back. Returns null if the path is unsafe or the file is missing.
export async function getFile(rel: string): Promise<{ bytes: Buffer; ext: string } | null> {
  const full = path.resolve(ROOT, rel);
  if (!full.startsWith(path.resolve(ROOT) + path.sep)) return null; // block "../" tricks
  try {
    return { bytes: await fs.readFile(full), ext: path.extname(full).slice(1) };
  } catch {
    return null;
  }
}

export async function deleteFile(rel: string): Promise<void> {
  const full = path.resolve(ROOT, rel);
  if (!full.startsWith(path.resolve(ROOT) + path.sep)) return;
  await fs.unlink(full).catch(() => {});
}
