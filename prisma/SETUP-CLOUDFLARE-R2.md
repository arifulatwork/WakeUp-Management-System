# Photos & videos on Cloudflare R2

## 1. Cloudflare dashboard
1. R2 → **Create bucket** (e.g. `wakeup-media`). Keep it private.
2. R2 → **Manage R2 API Tokens** → Create token, permission *Object Read & Write*, scoped to that bucket.
   Copy Access Key ID + Secret (shown once) and your Account ID.
3. Bucket → **Settings → CORS policy** (needed, uploads go from the browser straight to R2):
```json
[
  {
    "AllowedOrigins": ["https://YOUR-APP-DOMAIN", "http://localhost:3000"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```
4. (Optional, faster) Bucket → Settings → **Custom domain** `media.yourdomain.com`, then set
   `R2_PUBLIC_BASE_URL=https://media.yourdomain.com`. Add a Cache Rule "Cache everything" for that host.
   Keys are random 96-bit names, so links can't be guessed, but anyone who has one can open it.
5. (Optional) Bucket → Settings → **Object lifecycle**: abort incomplete multipart uploads after 1 day.

## 2. Project
```bash
npm i @aws-sdk/client-s3 @aws-sdk/s3-request-presigner fix-webm-duration
```
Copy the files of this folder over your project (same paths), append `.env.additions` to `.env`,
set `NEXT_PUBLIC_MEDIA_ENABLED=true`, then `npm run build`.
No database migration: columns already hold strings; they now hold `r2:photos/…` instead of base64.
Old base64 rows keep working.

## 3. Test
- Add a photo: Network tab shows `POST /api/media/upload-url` then a `PUT …r2.cloudflarestorage.com` (200).
  A failing PUT = CORS. The app silently falls back to base64 (see console warning `[media]`).
- Add a video: button shows "Optimizing %", then "Uploading %".
- Turn on airplane mode and add a photo: it still saves (base64 fallback + offline queue).

## Known limits
- Video conversion runs in real time (20 s clip ≈ 20 s) and needs the screen on. Clips capped at 60 s.
- Browsers without a WebM encoder (iPhone before iOS 18.4) send the original MP4/MOV if ≤ 15 MB.
- Replaced/removed files stay in R2 until you call `deleteRef(oldValue)` (lib/storage.ts) in those routes.
- Access check on `/api/files/*` is "signed in", not per task (the old base64 route checked per task).
