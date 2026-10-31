// FILE STORAGE — the ONE place that talks to Cloudflare R2 (S3-compatible).
//
// Flow:
//   1. the browser converts the file (WebP / WebM) and asks POST /api/media/upload-url for a
//      short-lived signed PUT link,
//   2. the browser uploads straight to R2 (the file never passes through your server),
//   3. the app saves only the small reference "r2:photos/…" in the database,
//   4. people see the file through GET /api/files/<key>, which checks the login and redirects
//      to R2 (a signed link, or your public custom domain if you set R2_PUBLIC_BASE_URL).
//
// Env vars: see .env.example  (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET).

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "crypto";
import { isR2Ref, r2Key } from "@/lib/mediaRef";

const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE_URL } = process.env;

export const R2_ENABLED = !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET);

let _client: S3Client | null = null;
function client(): S3Client {
  if (!R2_ENABLED) throw new Error("R2 is not configured");
  return (_client ??= new S3Client({
    region: "auto", // R2 ignores the region, the SDK just needs a value
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID!, secretAccessKey: R2_SECRET_ACCESS_KEY! },
  }));
}

export const EXT: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg", // only used when an old browser cannot encode WebP
  "video/webm": "webm",
  "video/mp4": "mp4", // only used when an old browser cannot encode WebM
};

// Unguessable key, grouped by month: photos/2026-10/<24 hex chars>.webp
export function newKey(contentType: string): string {
  const ext = EXT[contentType];
  if (!ext) throw new Error("unsupported type");
  const kind = contentType.startsWith("video/") ? "videos" : "photos";
  const month = new Date().toISOString().slice(0, 7);
  return `${kind}/${month}/${crypto.randomBytes(12).toString("hex")}.${ext}`;
}

// Link the browser uses to upload ONE file. The Content-Type is part of the signature,
// so the upload must be sent with exactly the type that was requested.
export function presignPut(key: string, contentType: string, ttlSeconds = 300): Promise<string> {
  return getSignedUrl(client(), new PutObjectCommand({ Bucket: R2_BUCKET!, Key: key, ContentType: contentType }), { expiresIn: ttlSeconds });
}

export function presignGet(key: string, ttlSeconds = 3600): Promise<string> {
  return getSignedUrl(client(), new GetObjectCommand({ Bucket: R2_BUCKET!, Key: key }), { expiresIn: ttlSeconds });
}

// Where to send the browser to read a file.
export async function readUrl(key: string): Promise<{ url: string; permanent: boolean }> {
  if (R2_PUBLIC_BASE_URL) return { url: `${R2_PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`, permanent: true };
  return { url: await presignGet(key), permanent: false };
}

export async function deleteObject(key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: R2_BUCKET!, Key: key })).catch(() => {});
}

// Call this when a photo/video is replaced or removed, so old files do not pile up in the bucket.
// Ignores anything that is not an R2 reference (old data URLs are just text in the database).
export async function deleteRef(ref: unknown): Promise<void> {
  if (R2_ENABLED && isR2Ref(ref)) await deleteObject(r2Key(ref));
}
