// BROWSER-SIDE MEDIA PIPELINE
//
//   photo  ->  resized + converted to WebP  (≈ 100–300 KB)
//   video  ->  downscaled + re-encoded to WebM (VP9/VP8 + Opus, ≈ 1 MB per 10 s at 720p)
//   then   ->  uploaded straight to Cloudflare R2 with a signed link (see /api/media/upload-url)
//
// preparePhoto() / prepareVideo() return a STRING that the rest of the app stores exactly like
// before: normally an R2 reference ("r2:photos/…"), or — if the phone is offline or R2 is not
// configured yet — a small base64 data URL, so the offline queue and old routes keep working.

import fixWebmDuration from "fix-webm-duration";

// ---- tuning knobs ---------------------------------------------------------------------
export const IMAGE_MAX_SIDE = 1600; // longest side in pixels
export const IMAGE_QUALITY = 0.78; // WebP quality 0–1
export const VIDEO_MAX_SHORT_SIDE = 720; // 720p
export const VIDEO_FPS = 24;
export const VIDEO_BITS_PER_SECOND = 1_000_000; // ≈ 7.5 MB per minute
export const AUDIO_BITS_PER_SECOND = 48_000;
export const VIDEO_MAX_SECONDS = 60; // re-encoding runs in real time, so keep clips short
export const VIDEO_MAX_INPUT_BYTES = 300 * 1024 * 1024; // refuse absurd originals
const FALLBACK_MP4_MAX_BYTES = 15 * 1024 * 1024; // browser cannot make WebM: send the original if small

// Same limits as lib/photoValidation.ts for the base64 fallback
const DATA_URL_PHOTO_MAX_BYTES = 650 * 1024;
const DATA_URL_VIDEO_MAX_BYTES = 6 * 1024 * 1024;

export type MediaErrorCode = "unreadable" | "too-long" | "too-large" | "unsupported" | "offline";
export class MediaError extends Error {
  constructor(public code: MediaErrorCode, message?: string) {
    super(message ?? code);
  }
}

export type Phase = "optimizing" | "uploading";
export type OnStatus = (phase: Phase, percent: number) => void;

// ---- photo -> WebP --------------------------------------------------------------------
function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function decodeImage(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  // createImageBitmap applies the EXIF rotation, so portrait phone photos are not sideways.
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new MediaError("unreadable"));
      i.src = url;
    });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function imageToWebp(file: File, maxSide = IMAGE_MAX_SIDE, quality = IMAGE_QUALITY): Promise<Blob> {
  const img = await decodeImage(file);
  try {
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new MediaError("unsupported");
    ctx.drawImage(img.source, 0, 0, canvas.width, canvas.height);

    const webp = await toBlob(canvas, "image/webp", quality);
    if (webp && webp.type === "image/webp") return webp;
    // Old Safari cannot encode WebP and silently returns PNG: use JPEG instead (still small).
    const jpg = await toBlob(canvas, "image/jpeg", quality);
    if (jpg) return jpg;
    throw new MediaError("unsupported");
  } finally {
    img.close();
  }
}

// ---- video -> WebM --------------------------------------------------------------------
export function pickWebmMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  // VP9 is smaller at the same quality; VP8 is the safer choice on very old/slow phones.
  for (const m of ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return null;
}

// Re-encodes in the browser with MediaRecorder. It plays the video into a canvas and records
// the canvas, so it takes as long as the clip itself (a 20 s clip ≈ 20 s). The screen should
// stay on while it runs; the progress callback lets the UI show a percentage.
export async function videoToWebm(file: File, onProgress?: (percent: number) => void): Promise<Blob> {
  const mime = pickWebmMime();
  if (!mime) throw new MediaError("unsupported", "no WebM encoder");
  if (file.size > VIDEO_MAX_INPUT_BYTES) throw new MediaError("too-large");

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;

  let audioCtx: AudioContext | null = null;
  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let stopped = false;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new MediaError("unreadable"));
    });
    const durationSec = video.duration;
    if (!Number.isFinite(durationSec) || durationSec <= 0) throw new MediaError("unreadable");
    if (durationSec > VIDEO_MAX_SECONDS) throw new MediaError("too-long");

    // Output size: short side ≤ 720 px, both sides even (encoders dislike odd sizes).
    const scale = Math.min(1, VIDEO_MAX_SHORT_SIDE / Math.min(video.videoWidth, video.videoHeight));
    const w = Math.max(2, Math.round((video.videoWidth * scale) / 2) * 2);
    const h = Math.max(2, Math.round((video.videoHeight * scale) / 2) * 2);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new MediaError("unsupported");

    stream = canvas.captureStream(VIDEO_FPS);

    // Sound: route the video's audio into the recording through WebAudio (nothing is played
    // out loud). If the browser refuses, the clip is simply recorded without sound.
    try {
      const AC: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      audioCtx = new AC();
      const src = audioCtx.createMediaElementSource(video);
      const dest = audioCtx.createMediaStreamDestination();
      src.connect(dest);
      dest.stream.getAudioTracks().forEach((t) => stream!.addTrack(t));
      if (audioCtx.state === "suspended") await audioCtx.resume().catch(() => {});
    } catch {
      /* no audio – fine */
    }

    const chunks: BlobPart[] = [];
    recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
      audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
    });
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const finished = new Promise<Blob>((resolve, reject) => {
      recorder!.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
      recorder!.onerror = () => reject(new MediaError("unreadable"));
    });

    const drawFrame = () => {
      if (stopped) return;
      ctx.drawImage(video, 0, 0, w, h);
      onProgress?.(Math.min(99, Math.round((video.currentTime / durationSec) * 100)));
      schedule();
    };
    const schedule = () =>
      "requestVideoFrameCallback" in video ? (video as any).requestVideoFrameCallback(drawFrame) : requestAnimationFrame(drawFrame);

    video.onended = () => {
      stopped = true;
      ctx.drawImage(video, 0, 0, w, h);
      setTimeout(() => recorder && recorder.state !== "inactive" && recorder.stop(), 150); // let the last frame be captured
    };

    const startedAt = performance.now();
    recorder.start(1000);
    try {
      await video.play();
    } catch {
      // The browser blocked playback with sound (autoplay rules): retry muted — no audio, but it converts.
      video.muted = true;
      await video.play();
    }
    schedule();

    const raw = await finished;
    const ms = Math.round(Math.max(performance.now() - startedAt, durationSec * 1000));
    // MediaRecorder writes WebM WITHOUT a duration: players then show no length and cannot seek.
    // This adds it to the header so the controls behave normally.
    try {
      return await fixWebmDuration(raw, ms, { logger: false });
    } catch {
      return raw;
    }
  } finally {
    stopped = true;
    try { if (recorder && recorder.state !== "inactive") recorder.stop(); } catch { /* already stopped */ }
    stream?.getTracks().forEach((t) => t.stop());
    audioCtx?.close().catch(() => {});
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

// ---- upload to R2 ---------------------------------------------------------------------
function putWithProgress(uploadUrl: string, blob: Blob, headers: Record<string, string>, onPercent?: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => e.lengthComputable && onPercent?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new MediaError("offline", "network error")); // offline, or R2 CORS not set up yet
    xhr.send(blob);
  });
}

// Returns an "r2:…" reference. Throws if there is no signal or R2 is not configured.
export async function uploadToR2(blob: Blob, onPercent?: (p: number) => void): Promise<string> {
  const res = await fetch("/api/media/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType: blob.type, size: blob.size }),
  });
  if (!res.ok) throw new Error(`upload-url ${res.status}`);
  const { uploadUrl, ref, headers } = await res.json();
  await putWithProgress(uploadUrl, blob, headers ?? { "Content-Type": blob.type }, onPercent);
  return ref as string;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new MediaError("unreadable"));
    r.readAsDataURL(blob);
  });
}

// Upload, or fall back to base64 so the offline queue still works.
async function store(blob: Blob, maxDataUrlBytes: number, onStatus?: OnStatus): Promise<string> {
  try {
    onStatus?.("uploading", 0);
    return await uploadToR2(blob, (p) => onStatus?.("uploading", p));
  } catch (err) {
    console.warn("[media] R2 upload failed, using base64 fallback:", err);
    if (blob.size > maxDataUrlBytes) throw new MediaError("offline");
    return blobToDataUrl(blob);
  }
}

// ---- what the UI calls ----------------------------------------------------------------
export async function preparePhoto(file: File, onStatus?: OnStatus): Promise<string> {
  if (!file.type.startsWith("image/")) throw new MediaError("unsupported");
  onStatus?.("optimizing", 0);
  const blob = await imageToWebp(file);
  return store(blob, DATA_URL_PHOTO_MAX_BYTES, onStatus);
}

export async function prepareVideo(file: File, onStatus?: OnStatus): Promise<string> {
  if (!file.type.startsWith("video/")) throw new MediaError("unsupported");
  onStatus?.("optimizing", 0);

  if (pickWebmMime()) {
    const blob = await videoToWebm(file, (p) => onStatus?.("optimizing", p));
    return store(blob, DATA_URL_VIDEO_MAX_BYTES, onStatus);
  }

  // This browser cannot write WebM (e.g. iPhone before iOS 18.4). Better a small original than nothing.
  if (/^video\/(mp4|quicktime)$/.test(file.type) && file.size <= FALLBACK_MP4_MAX_BYTES) {
    const mp4 = file.type === "video/mp4" ? file : new Blob([file], { type: "video/mp4" }); // iPhone .mov: Safari plays it fine
    return store(mp4, DATA_URL_VIDEO_MAX_BYTES, onStatus);
  }
  throw new MediaError("unsupported");
}
