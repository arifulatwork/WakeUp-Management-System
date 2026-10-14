// Photos: shrink on the phone BEFORE upload.
// A modern phone photo is 3–8 MB; cleaners are often on weak signal inside
// houses. Resizing to 1280px / JPEG 72% makes it ~100–250 KB, which uploads
// (or waits in the offline queue) reliably and keeps the database small.
export async function compressImage(file: File, maxDim = 1280, quality = 0.72): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("unreadable image"));
      i.src = url;
    });
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Videos can't be shrunk in the browser, so they are only size-checked, then sent as-is.
export const MAX_VIDEO_BYTES = 6 * 1024 * 1024;

export async function readVideo(file: File): Promise<string> {
  if (!/^video\/(mp4|webm|quicktime)$/.test(file.type)) throw new Error("unsupported");
  if (file.size > MAX_VIDEO_BYTES) throw new Error("too large");
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("unreadable"));
    r.readAsDataURL(file);
  });
}
