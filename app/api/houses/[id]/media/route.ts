import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { MEDIA_ENABLED } from "@/lib/features";
import { isR2Ref, mediaSrc } from "@/lib/mediaRef";

// GET /api/houses/:id/media?kind=photo|video[&v=…]
// Serves an apartment's photo or video. New uploads are an R2 reference -> redirect to
// /api/files/… (which checks the login and sends the browser to Cloudflare). Old rows hold a
// base64 data URL -> decoded and served here as before, with Range support (iPhones need it).
// Signed-in users only (middleware); every role may look, only management may change (PATCH /api/houses/:id).

function decode(dataUrl: string): { mime: string; bytes: Buffer } | null {
  const m = /^data:([^;,]+)((?:;[^;,]+)*),([\s\S]*)$/.exec(dataUrl);
  if (!m) return null;
  const isBase64 = m[2].includes(";base64");
  return { mime: m[1], bytes: isBase64 ? Buffer.from(m[3], "base64") : Buffer.from(decodeURIComponent(m[3]), "utf8") };
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!MEDIA_ENABLED) return new NextResponse("Not found", { status: 404 }); // switched off (lib/features.ts)
  const kind = req.nextUrl.searchParams.get("kind") === "video" ? "video" : "photo";
  const row = await db.houseMedia.findFirst({ where: { houseId: params.id } });
  const value = row ? row[kind] ?? "" : "";

  if (isR2Ref(value)) {
    return NextResponse.redirect(new URL(mediaSrc(value), req.url), { status: 302, headers: { "Cache-Control": "private, max-age=300" } });
  }

  const file = decode(value);
  if (!file) return new NextResponse("Not found", { status: 404 });

  const total = file.bytes.length;
  const headers: Record<string, string> = {
    "Content-Type": file.mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
  };

  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    const start = range[1] ? parseInt(range[1], 10) : Math.max(0, total - parseInt(range[2], 10));
    const end = Math.min(range[1] && range[2] ? parseInt(range[2], 10) : total - 1, total - 1);
    if (start > end || start >= total) {
      return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
    }
    const chunk = file.bytes.subarray(start, end + 1);
    return new NextResponse(new Uint8Array(chunk), {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${total}`, "Content-Length": String(chunk.length) },
    });
  }
  return new NextResponse(new Uint8Array(file.bytes), { headers: { ...headers, "Content-Length": String(total) } });
}
