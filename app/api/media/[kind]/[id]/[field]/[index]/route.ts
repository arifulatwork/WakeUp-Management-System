import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentSession } from "@/lib/guard";

// GET /api/media/:kind/:id/:field/:index — one photo or video of a task or ticket as a real file.
//   kind  = task | ticket
//   field = photos | videos (both)  |  photoUrl | afterPhotoUrl (tickets only)
// Cached by the browser for a year: the "?v=" in the URL changes whenever the content does.
// Range requests are supported (iPhones will not play a video without them).
export const dynamic = "force-dynamic";

function decode(dataUrl: string): { mime: string; bytes: Buffer } | null {
  const m = /^data:([^;,]+)((?:;[^;,]+)*),([\s\S]*)$/.exec(dataUrl);
  if (!m) return null;
  return { mime: m[1], bytes: m[2].includes(";base64") ? Buffer.from(m[3], "base64") : Buffer.from(decodeURIComponent(m[3]), "utf8") };
}

export async function GET(req: NextRequest, { params }: { params: { kind: string; id: string; field: string; index: string } }) {
  const notFound = () => new NextResponse("Not found", { status: 404 });
  const s = await currentSession(req);
  if (!s) return new NextResponse("sign in required", { status: 401 });
  const i = parseInt(params.index, 10);
  if (!Number.isInteger(i) || i < 0) return notFound();

  let value: unknown;
  if (params.kind === "task") {
    const t = await db.cleaningTask.findUnique({ where: { id: params.id } });
    if (!t) return notFound();
    // Same rule as the job list: a cleaner only sees media of their own jobs.
    if (s.role === "worker" && t.assignedWorkerId !== s.workerId) return new NextResponse("forbidden", { status: 403 });
    if (params.field !== "photos" && params.field !== "videos") return notFound();
    value = ((t.checklistData as any)?.[params.field] ?? [])[i];
  } else if (params.kind === "ticket") {
    const t = await db.maintenanceTicket.findUnique({ where: { id: params.id } });
    if (!t) return notFound();
    if (params.field === "photoUrl" || params.field === "afterPhotoUrl") value = i === 0 ? (t as any)[params.field] : null;
    else if (params.field === "photos" || params.field === "videos" || params.field === "reportVideos") value = ((t.mediaData as any)?.[params.field] ?? [])[i];
    else return notFound();
  } else return notFound();

  const file = typeof value === "string" ? decode(value) : null;
  if (!file) return notFound();

  const total = file.bytes.length;
  const headers: Record<string, string> = {
    "Content-Type": file.mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    const start = range[1] ? parseInt(range[1], 10) : Math.max(0, total - parseInt(range[2], 10));
    const end = Math.min(range[1] && range[2] ? parseInt(range[2], 10) : total - 1, total - 1);
    if (start > end || start >= total) return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
    const chunk = file.bytes.subarray(start, end + 1);
    return new NextResponse(new Uint8Array(chunk), {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${total}`, "Content-Length": String(chunk.length) },
    });
  }
  return new NextResponse(new Uint8Array(file.bytes), { headers: { ...headers, "Content-Length": String(total) } });
}
